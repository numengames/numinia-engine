// roles-mundo (H3): the roles of ONE world, kept by the server, and the chat orders that change them. The rules are
// numinia.com's (roles.ts); here they are stored (the feature's store: datos/roles.json(l), so they travel in the
// world's zip), asked by every permission check (`puede`, the same one api.puede, uploads and objetos use) and changed
// by orders typed in the chat (`/…`, which nobody else reads: features/chat):
//   /roles                          what you are and may do here, and the world's roles
//   /dueño <código>                 become an owner with the administration code (MOTOR_ADMIN; 3 tries per 10 min)
//   /dar <persona> <rol>            /quitar <persona> <rol>        (manage-roles, only below your own height)
//   /silenciar <persona> [minutos]  (mute-members; 0 = lift it)    /echar <persona>  (remove-members; 10 min out)
//   /vetar <persona> <motivo>       (ban-members, for good)        /perdonar <nombre> (ban-members: lifts both)
//   /solo-miembros sí|no            (manage-organization: visitors stay out)
// <persona> = the name over their head, as it is written. Until the numinia.com pass (H3b) a person here is a guest
// id: someone who clears their browser comes back as a new guest — a ban holds the identity, not the human.
// It is a server-side feature built inside packages/server (it needs the server's hands: close a connection, the
// administration code); it tells other features through server-only events: chat hears «aviso» (an answer only for
// that person) and «silencio»; objetos hears «cambio» and re-sends who may build.
import { createHash, timingSafeEqual } from "node:crypto";
import { defineFeature, serverPart } from "../../feature/src/index.ts";
import type { ServerApi, ServerPart } from "../../feature/src/index.ts";
import type { Who } from "../../instance/src/index.ts";
import { ACCION_PERMISO, ACCION_TEXTO, acceso, esBase, noPuedeDar, plano, plantilla, porDebajo, rolPorNombre, tiene, validarRoles } from "./roles.ts";
import type { Acceso, Accion, Miembro, Rol } from "./roles.ts";
import { ADMIN_MIN } from "./secret.ts";

export const ECHADO_MIN = 10;          // someone taken out may come back after this (STD-052 «may come back»)
export const SILENCIO_MIN = 10;        // /silenciar without minutes
export const SILENCIO_MAX_MIN = 1440;  // one day
export const INTENTOS = 3;             // wrong administration codes per connection before a pause
export const INTENTOS_PAUSA_MIN = 10;
export const AVISO_MAX = 300;          // bytes (chat's AVISO_MAX)
const MOTIVO_MAX = 200;

const quien = { kind: "int", min: 0, max: 65535 } as const;
export const rolesFeature = defineFeature({
  id: "roles",
  version: 1,
  level: "base",
  describe: "Roles del mundo, los mismos que numinia.com (STD-052): @todos, Moderación, Administración y dueños. Se cambian con órdenes en el chat (/roles para verlas).",
  events: {
    aviso: { describe: "Respuesta a una orden de roles, solo para quien la escribió (el chat la muestra).", fields: { quien, texto: { kind: "text", maxBytes: AVISO_MAX } }, announce: "silent" },
    silencio: { describe: "Alguien queda en silencio en el chat tantos segundos (0 = vuelve a hablar).", fields: { quien, segundos: { kind: "int", min: 0, max: SILENCIO_MAX_MIN * 60 } }, announce: "silent" },
    cambio: { describe: "Lo que alguien puede hacer ha cambiado (un rol, un dueño): objetos vuelve a decirle si construye.", fields: { quien }, announce: "silent" },
  },
  store: { describe: "Los roles del mundo (forma de STD-052), quién tiene cada uno, los dueños, los vetados y si es solo para miembros." },
});

export type OpcionesRoles = {
  construir: boolean;                                  // --construir todos: «build-in-worlds» in @todos (set at every start)
  admin?: string;                                      // the administration code; under ADMIN_MIN characters = /dueño answers that there is none
  firmar?: (texto: string) => string;                  // the server's HMAC (secret.ts): ties an owner to THIS code without keeping it
  cerrar?: (entity: number, motivo: string) => void;   // close that connection (the server); none = only told
  ahora?: () => number;                                // the clock (ms) for silences and taking out; default Date.now
  log?: (line: string) => void;
};
type Veto = { nombre: string; motivo: string; por: string; cuando: string };
const esIA = (id: string): boolean => id.startsWith("ia-"); // AI inhabitants (identidad.ts agenteDe): never members, never owners

const bytes = new TextEncoder();
function cortar(s: string, max: number): string {
  if (bytes.encode(s).length <= max) return s;
  let out = "";
  for (const ch of s) { if (bytes.encode(out + ch).length > max - 1) break; out += ch; }
  return out + "…";
}

export function crearRoles(o: OpcionesRoles) {
  const ahora = o.ahora ?? Date.now, log = o.log ?? (() => {});
  const clave = o.admin && o.admin.length >= ADMIN_MIN ? createHash("sha256").update(o.admin).digest() : null;
  // C3: an owner is tied to the code it used. Kept: a fingerprint of the code — HMAC with the server's secret, so a
  // world zip (roles.json travels in it) never lets anyone test codes offline. A new code (the fleet's «change the
  // code») = those owners are no longer owners at the next start.
  const huella = clave ? (o.firmar?.(`dueño\n${o.admin}`) || createHash("sha256").update(`dueño\n${o.admin}`).digest("hex").slice(0, 24)) : null;
  let roles: Rol[] = plantilla(o.construir);
  const miembros = new Map<string, string[]>();        // guest id -> role ids (besides @todos)
  const duenos = new Set<string>();
  const vetos = new Map<string, Veto>();
  const echados = new Map<string, { nombre: string; hasta: number }>();
  const silencios = new Map<string, number>();         // guest id -> until (ms)
  const intentos = new Map<number, { n: number; hasta: number }>();
  let soloMiembros = false;
  let api: ServerApi | null = null;
  const porCerrar: { e: number; motivo: string }[] = [];

  const miembroDe = (id: string | undefined): Miembro | null =>
    !id || esIA(id) ? null : duenos.has(id) ? { roles: miembros.get(id) ?? [], dueno: true } : miembros.has(id) ? { roles: miembros.get(id)! } : null;
  const accesoDe = (id: string | undefined): Acceso => acceso(roles, miembroDe(id));

  /** The question every permission check asks (api.puede, uploads, objetos). A visitor or an AI = @todos. */
  const puede = (who: Who | null, accion: string): boolean => accion in ACCION_PERMISO && tiene(accesoDe(who?.id), accion as Accion);

  const part: ServerPart = serverPart(rolesFeature, (a) => {
    api = a;
    // what was kept (a world zip may bring roles numinia.com gave): checked; a broken list falls back to the template
    const guardados = a.store.get("roles");
    if (guardados !== undefined) {
      const r = validarRoles(guardados);
      if (r.ok) roles = r.value; else log(`[roles] los roles guardados no valen (${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}): uso los de STD-052`);
    }
    // --construir decides «build-in-worlds» of @todos at every start (it is the installer's switch)
    roles = roles.map((r) => (esBase(r) ? { ...r, permisos: o.construir ? [...new Set([...r.permisos, "build-in-worlds" as const])] : r.permisos.filter((p) => p !== "build-in-worlds") } : r));
    a.store.set("roles", roles);
    const guardados2 = (a.store.get("duenos") as unknown[] | undefined) ?? [];
    let otros = 0;
    for (const d of guardados2) {
      const x = d as { id?: unknown; codigo?: unknown };
      if (huella && typeof x?.id === "string" && x.codigo === huella) duenos.add(x.id); else otros++;
    }
    if (otros) { a.store.set("duenos", [...duenos].map((id) => ({ id, codigo: huella }))); log(`[roles] ${otros} dueño(s) lo eran con otro código de administración (o sin él): ya no lo son; /dueño <código> con el de ahora`); }
    soloMiembros = (a.store.get("config") as { soloMiembros?: boolean } | undefined)?.soloMiembros === true;
    for (const k of a.store.keys()) {
      if (k.startsWith("m:")) { const v = a.store.get(k); if (Array.isArray(v)) miembros.set(k.slice(2), v.filter((x) => roles.some((r) => r.id === x))); }
      if (k.startsWith("veto:")) vetos.set(k.slice(5), a.store.get(k) as Veto);
    }
    log(`[roles] ${roles.map((r) => r.nombre).join(", ")} · ${duenos.size} dueños, ${miembros.size} con rol, ${vetos.size} vetados${soloMiembros ? " · solo para miembros" : ""}`);

    const avisar = (e: number, texto: string) => a.emit("aviso", { quien: e, texto: cortar(texto, AVISO_MAX) }, "server");
    const cambio = (e: number) => a.emit("cambio", { quien: e }, "server");
    const guardarMiembro = (id: string) => { const r = miembros.get(id) ?? []; if (r.length) a.store.set(`m:${id}`, r); else { miembros.delete(id); a.store.delete(`m:${id}`); } };
    const nombre = (e: number) => a.who(e)?.nombre ?? `Robot ${e}`;
    const conectadoComo = (id: string) => a.players().filter((e) => a.who(e)?.id === id);

    /** <persona> at the start of `resto`: the longest name of someone connected that it begins with. */
    const persona = (from: number, resto: string): { e: number; id: string; nombre: string; resto: string } | null => {
      const k = resto.toLowerCase();
      let mejor: { e: number; id: string; nombre: string; resto: string } | null = null;
      for (const e of a.players()) {
        const w = a.who(e);
        if (!w) continue;
        const n = w.nombre.toLowerCase();
        if ((k === n || k.startsWith(n + " ")) && (!mejor || n.length > mejor.nombre.length)) mejor = { e, id: w.id, nombre: w.nombre, resto: resto.slice(n.length).trim() };
      }
      if (!mejor) avisar(from, resto ? `No veo a nadie conectado que se llame así. Escribe su nombre como lo ves sobre su cabeza.` : "¿A quién? Escribe su nombre como lo ves sobre su cabeza.");
      else if (mejor.e === from) { avisar(from, "Eso no te lo puedes hacer a ti."); return null; }
      return mejor;
    };
    /** The actor may do `accion` on `p` (permission + strictly below). Says why not. */
    const sobre = (from: number, accion: Accion, p: { id: string }): Acceso | null => {
      const yo = accesoDe(a.who(from)?.id);
      if (!tiene(yo, accion)) { avisar(from, `No tienes permiso para ${ACCION_TEXTO[accion]}.`); return null; }
      if (!porDebajo(yo, accesoDe(p.id))) { avisar(from, "Esa persona está a tu altura o por encima (o es dueña del mundo)."); return null; }
      return yo;
    };
    const sacar = (e: number, motivo: string) => { avisar(e, motivo); porCerrar.push({ e, motivo }); };

    const ordenes: Record<string, (from: number, resto: string) => void> = {
      roles: (from) => {
        const w = a.who(from), yo = accesoDe(w?.id), m = miembroDe(w?.id);
        const mios = yo.dueno ? "dueño del mundo" : [...roles.filter((r) => m?.roles.includes(r.id)).map((r) => r.nombre), "@todos"].join(", ");
        const puedo = (Object.keys(ACCION_PERMISO) as Accion[]).filter((x) => tiene(yo, x)).map((x) => ACCION_TEXTO[x]);
        avisar(from, `Eres: ${mios}. Puedes: ${puedo.length ? puedo.join(", ") : "mirar y hablar"}. Roles de este mundo: ${roles.map((r) => r.nombre).join(", ")}${soloMiembros ? " (solo para miembros)" : ""}.`);
        avisar(from, "Órdenes: /dar y /quitar <persona> <rol> · /silenciar <persona> [minutos] · /echar <persona> · /vetar <persona> <motivo> · /perdonar <nombre> · /solo-miembros sí|no · /dueño <código>");
      },
      "dueño": (from, resto) => {
        const w = a.who(from);
        if (!w || esIA(w.id)) { avisar(from, "Primero hace falta que el mundo sepa quién eres (recarga la página)."); return; }
        if (!clave) { avisar(from, "Este servidor no tiene código de administración: nadie puede hacerse dueño así."); return; }
        const t = intentos.get(from);
        if (t && t.n >= INTENTOS && ahora() < t.hasta) { avisar(from, `Demasiados intentos: espera ${Math.ceil((t.hasta - ahora()) / 60000)} min.`); return; }
        const dada = createHash("sha256").update(resto.trim()).digest();
        if (!timingSafeEqual(dada, clave)) {
          const n = t && ahora() < t.hasta ? t.n + 1 : 1;
          intentos.set(from, { n, hasta: ahora() + INTENTOS_PAUSA_MIN * 60000 });
          log(`[roles] código de administración equivocado (${w.id})`);
          avisar(from, "Ese no es el código de administración."); return;
        }
        intentos.delete(from); duenos.add(w.id); a.store.set("duenos", [...duenos].map((id) => ({ id, codigo: huella })));
        log(`[roles] ${w.id} («${w.nombre}») es dueño del mundo`);
        cambio(from);
        avisar(from, "Ya eres dueño de este mundo: puedes todo, también dar roles. Escribe /roles para verlo.");
      },
      dar: (from, resto) => darQuitar(from, resto, true),
      quitar: (from, resto) => darQuitar(from, resto, false),
      silenciar: (from, resto) => {
        const p = persona(from, resto); if (!p || !sobre(from, "silenciar", p)) return;
        const min = p.resto === "" ? SILENCIO_MIN : Number(p.resto);
        if (!(Number.isInteger(min) && min >= 0 && min <= SILENCIO_MAX_MIN)) { avisar(from, `Minutos: un número de 0 a ${SILENCIO_MAX_MIN} (0 = que vuelva a hablar).`); return; }
        if (min === 0) silencios.delete(p.id); else silencios.set(p.id, ahora() + min * 60000);
        for (const e of conectadoComo(p.id)) { a.emit("silencio", { quien: e, segundos: min * 60 }, "server"); avisar(e, min ? `${nombre(from)} te ha silenciado ${min} min en el chat.` : `${nombre(from)} te ha devuelto la palabra.`); }
        log(`[roles] ${a.who(from)?.id} silencia a ${p.id} ${min} min`);
        avisar(from, min ? `${p.nombre} queda en silencio ${min} min.` : `${p.nombre} puede volver a hablar.`);
      },
      echar: (from, resto) => {
        const p = persona(from, resto); if (!p || !sobre(from, "echar", p)) return;
        echados.set(p.id, { nombre: p.nombre, hasta: ahora() + ECHADO_MIN * 60000 });
        for (const e of conectadoComo(p.id)) sacar(e, `${nombre(from)} te ha sacado de este mundo. Puedes volver dentro de ${ECHADO_MIN} min.`);
        log(`[roles] ${a.who(from)?.id} echa a ${p.id}`);
        avisar(from, `${p.nombre} sale del mundo durante ${ECHADO_MIN} min.`);
      },
      vetar: (from, resto) => {
        const p = persona(from, resto); if (!p || !sobre(from, "vetar", p)) return;
        const motivo = cortar(p.resto, MOTIVO_MAX);
        if (!motivo) { avisar(from, "Di por qué: /vetar <persona> <motivo>. Queda escrito."); return; }
        const v: Veto = { nombre: p.nombre, motivo, por: a.who(from)?.id ?? "", cuando: new Date(ahora()).toISOString() };
        vetos.set(p.id, v); a.store.set(`veto:${p.id}`, v);
        for (const e of conectadoComo(p.id)) sacar(e, `Te han vetado en este mundo: ${motivo}`);
        log(`[roles] ${v.por} veta a ${p.id}: ${motivo}`);
        avisar(from, `${p.nombre} queda vetado. Para levantarlo: /perdonar ${p.nombre}`);
      },
      perdonar: (from, resto) => {
        if (!tiene(accesoDe(a.who(from)?.id), "vetar")) { avisar(from, "No tienes permiso para levantar vetos."); return; }
        const k = resto.toLowerCase().trim();
        const ids = [...new Set([...[...vetos].filter(([, v]) => v.nombre.toLowerCase() === k).map(([id]) => id), ...[...echados].filter(([, v]) => v.nombre.toLowerCase() === k).map(([id]) => id)])];
        if (!ids.length) { avisar(from, "No hay nadie vetado ni echado con ese nombre."); return; }
        for (const id of ids) { vetos.delete(id); echados.delete(id); a.store.delete(`veto:${id}`); }
        log(`[roles] ${a.who(from)?.id} perdona a ${ids.join(", ")}`);
        avisar(from, `${resto.trim()} puede volver a entrar.`);
      },
      "solo-miembros": (from, resto) => {
        if (!tiene(accesoDe(a.who(from)?.id), "ajustar")) { avisar(from, `No tienes permiso para ${ACCION_TEXTO.ajustar}.`); return; }
        const v = plano(resto);
        if (v !== "si" && v !== "no") { avisar(from, `Ahora ${soloMiembros ? "solo entran miembros" : "entra cualquiera"}. Escribe /solo-miembros sí o /solo-miembros no.`); return; }
        soloMiembros = v === "si"; a.store.set("config", { soloMiembros });
        log(`[roles] ${a.who(from)?.id}: solo para miembros = ${soloMiembros}`);
        avisar(from, soloMiembros ? "Desde ahora solo entran miembros (quien tiene un rol con «enter-worlds»). Quien ya está dentro sigue." : "Desde ahora entra cualquiera.");
      },
    };
    ordenes.dueno = ordenes["dueño"];

    const darQuitar = (from: number, resto: string, dar: boolean) => {
      const p = persona(from, resto); if (!p) return;
      if (esIA(p.id)) { avisar(from, "Una IA no tiene roles propios: hace lo de @todos y nunca más que quien responde de ella (STD-051)."); return; }
      const rol = rolPorNombre(roles, p.resto);
      if (!rol) { avisar(from, `¿Qué rol? Los de este mundo: ${roles.map((r) => r.nombre).join(", ")}.`); return; }
      const no = noPuedeDar(accesoDe(a.who(from)?.id), accesoDe(p.id), rol);
      if (no) { avisar(from, no); return; }
      const tenia = miembros.get(p.id) ?? [];
      if (dar === tenia.includes(rol.id)) { avisar(from, `${p.nombre} ${dar ? "ya tiene" : "no tiene"} «${rol.nombre}».`); return; }
      miembros.set(p.id, dar ? [...tenia, rol.id] : tenia.filter((x) => x !== rol.id));
      guardarMiembro(p.id);
      log(`[roles] ${a.who(from)?.id} ${dar ? "da" : "quita"} «${rol.id}» a ${p.id}`);
      for (const e of conectadoComo(p.id)) { cambio(e); avisar(e, `${nombre(from)} te ha ${dar ? "dado" : "quitado"} el rol «${rol.nombre}». Escribe /roles para ver qué puedes hacer.`); }
      avisar(from, `${p.nombre} ${dar ? "tiene ahora" : "ya no tiene"} «${rol.nombre}».`);
    };

    a.listen("chat", "orden", (m) => {
      const texto = String(m.texto ?? "").trim(), from = Number(m.quien);
      const i = texto.indexOf(" "), palabra = (i < 0 ? texto : texto.slice(0, i)).toLowerCase(), resto = i < 0 ? "" : texto.slice(i + 1).trim();
      const f = ordenes[palabra];
      if (!f) return false;
      f(from, resto);
      return true;
    });

    // who comes in: banned, taken out a while ago, or a visitor of a members-only world → told and closed
    a.onIdentify((e, w) => {
      const v = vetos.get(w.id), ech = echados.get(w.id), t = ahora();
      if (v) { sacar(e, `Estás vetado en este mundo: ${v.motivo}`); return; }
      if (ech && t < ech.hasta) { sacar(e, `Te sacaron de este mundo hace poco. Puedes volver dentro de ${Math.ceil((ech.hasta - t) / 60000)} min.`); return; }
      if (ech) echados.delete(w.id);
      const m = miembroDe(w.id);
      if (soloMiembros && !esIA(w.id) && !(m && tiene(accesoDe(w.id), "entrar"))) { sacar(e, "Este mundo es solo para sus miembros ahora mismo."); return; }
      const s = silencios.get(w.id);
      if (s && t < s) a.emit("silencio", { quien: e, segundos: Math.ceil((s - t) / 1000) }, "server");
      if (m) cambio(e);
    });
    a.onLeave((e) => { intentos.delete(e); });
    // close on the next tick, after the answer has gone out
    a.onTick(() => {
      while (porCerrar.length) { const c = porCerrar.shift()!; if (o.cerrar) o.cerrar(c.e, c.motivo); }
    });
  });

  return {
    part, puede,
    /** For tests and the server: what someone with this id may do. */
    acceso: (id: string | undefined) => accesoDe(id),
    get roles(): readonly Rol[] { return roles; },
    get soloMiembros() { return soloMiembros; },
    get conectado() { return api !== null; },
  };
}
