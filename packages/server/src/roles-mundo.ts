// roles-mundo (H3): the roles of ONE world, kept by the server, and the chat orders that change them. The rules are
// numinia.com's (roles.ts); here they are stored (the feature's store: datos/roles.json(l), so they travel in the
// world's zip), asked by every permission check (`puede`, the same one api.puede, uploads and objetos use) and changed
// by orders typed in the chat (`/…`, which nobody else reads: features/chat):
//   /roles                          what you are and may do here, and the world's roles
//   /dueño <código>                 become an owner with the administration code (MOTOR_ADMIN; 3 tries per 10 min)
//   /dar <persona> <rol>            /quitar <persona> <rol>        (manage-roles, only below your own height)
//   /silenciar <persona> [minutos]  (mute-members: chat AND voice; stored, survives a restart; 0 = lift it)
//   /hablar <persona>               (mute-members: the same as /silenciar <persona> 0)
//   /bloquear <persona>             (anyone: YOU stop reading and hearing that person; the rest still do; stored by identity)
//   /desbloquear <persona>          (anyone: read and hear them again)
//   /denunciar <persona> <motivo>   (anyone: tells whoever moderates, connected now, and keeps it for them; one a minute)
//   /denuncias                      (mute-, remove- or ban-members: the last reports, newest first)
//   /echar <persona>                (remove-members; 10 min out)
//   /vetar <persona> <motivo>       (ban-members, for good)        /perdonar <nombre> (ban-members: lifts both)
//   /solo-miembros sí|no            (manage-organization: visitors stay out)
//   /construir todos|nadie          (manage-organization: «build-in-worlds» of @todos, so visitors and AIs build or not)
//   /voz sí|no                      (manage-organization: the microphones are relayed or not; at once, no restart)
//   /escenario [<persona> | quitar <persona> | nadie]   (manage-rituals, M17: whoever is on stage is heard by everyone,
//                                   unpanned; the list is open to all; memory only — an event is live, not a setting)
//   /agente añadir <id> <nombre…> <clave> [rol]   /agente quitar <id>   /agente   (manage-organization: the outside
//                                   AIs this world lets in, ADR-080 — writes/deletes aventura/agentes/<id>.json; puerta.ts)
// An AI (an inhabitant «ia-<id>» or an outside agent) is never a member nor an owner: its permissions are its role's
// (an outside agent's `rol`, else @todos) INTERSECTED with enter + build — AIs never moderate, never manage roles or
// settings, never download the world. It stands at the base height, so any moderator can act on it.
// File over app (numinia-archive ADR-074): what this world IS lives in its store, not in the environment. MOTOR_CONSTRUIR
// and MOTOR_VOZ only SEED a world that never stored that choice (its first start; the log says so once); from then on
// a restart with another value changes nothing — an owner changes it with the orders above, and it travels in the zip.
// <persona> = the name over their head, as it is written. Without a numinia.com pass (H3b, pase.ts) a person here is a guest
// id: someone who clears their browser comes back as a new guest — a ban holds the identity, not the human. With a pass the
// person is their numinia.com id (`sub`, opaque): same person on every device, and the pass's permissions/height/roles
// REPLACE what this world holds for them (owners by /dueño stay owners).
// It is a server-side feature built inside packages/server (it needs the server's hands: close a connection, the
// administration code); it tells other features through server-only events: chat hears «aviso» (an answer only for
// that person), «silencio» and «bloqueo» (F1: who stopped reading whom); objetos hears «cambio» and re-sends who may build.
// Voice (F1): the instance asks `oye(de, a)` before relaying each voice frame to each listener, so a silenced person is
// not heard by anyone and a blocked one not by who blocked them. The world's roles decide; pages only see the result.
import { createHash, timingSafeEqual } from "node:crypto";
import { defineFeature, serverPart } from "../../feature/src/index.ts";
import type { ServerApi, ServerPart } from "../../feature/src/index.ts";
import type { Who } from "../../instance/src/index.ts";
import { ACCION_PERMISO, ACCION_TEXTO, PERMISOS, acceso, BASE, esBase, noPuedeDar, plano, plantilla, porDebajo, rolPorNombre, tiene, validarRoles } from "./roles.ts";
import type { Acceso, Accion, Miembro, Permiso, Rol } from "./roles.ts";
import { FORMAS_BURBUJA, FRASE_MAX, RADIO_DEFECTO_M, RADIO_MAX_M, RADIO_MIN_M, VISIBLES_BURBUJA, verificarPase } from "./pase.ts";
import type { ConfigPase, EstadoIA, IABloque, Pase } from "./pase.ts";
import { AGENTE } from "./aventura.ts";
import { MARCA_IA, agenteDe, nombreDe } from "../../instance/src/identidad.ts";
import type { Puerta } from "./puerta.ts";
import { ADMIN_MIN } from "./secret.ts";

export const ECHADO_MIN = 10;          // someone taken out may come back after this (STD-052 «may come back»)
export const SILENCIO_MIN = 10;        // /silenciar without minutes
export const SILENCIO_MAX_MIN = 1440;  // one day
export const BLOQUEOS_MAX = 200;       // people one person may block (limits.json `blocks_per_person`)
export const INTENTOS = 3;             // wrong administration codes per connection before a pause
export const INTENTOS_PAUSA_MIN = 10;
export const AVISO_MAX = 300;          // bytes (chat's AVISO_MAX)
const MOTIVO_MAX = 200;
export const NOMBRE_PROPIO_MAX = 48;   // bytes; mirrors chat's NOMBRE_MAX (packages never import features/: roles-mundo.ts cannot share it)
export const RENOVAR_MIN_MS = 1000;
export const DENUNCIAS_MAX = 100;      // reports a world keeps (the oldest goes first)
export const DENUNCIA_PAUSA_MS = 60_000; // one report a minute per person: a flood never reaches the moderators
export const DENUNCIAS_VER = 5;        // reports /denuncias reads out      // an AI may renew its pass at most once a second (a signature check each)

const quien = { kind: "int", min: 0, max: 65535 } as const;
export const rolesFeature = defineFeature({
  id: "roles",
  version: 1,
  level: "base",
  describe: "Roles del mundo, los mismos que numinia.com (STD-052): @todos, Moderación, Administración y dueños. Se cambian con órdenes en el chat (/roles para verlas).",
  events: {
    aviso: { describe: "Respuesta a una orden de roles, solo para quien la escribió (el chat la muestra).", fields: { quien, texto: { kind: "text", maxBytes: AVISO_MAX } }, announce: "silent" },
    silencio: { describe: "Alguien queda en silencio en el chat y la voz tantos segundos (0 = vuelve a hablar).", fields: { quien, segundos: { kind: "int", min: 0, max: SILENCIO_MAX_MIN * 60 } }, announce: "silent" },
    bloqueo: { describe: "F1: `quien` deja de leer (si = 1) o vuelve a leer (si = 0) lo que dice `a`; el chat no le reenvía sus líneas.", fields: { quien, a: quien, si: { kind: "int", min: 0, max: 1 } }, announce: "silent" },
    cambio: { describe: "Lo que alguien puede hacer ha cambiado (un rol, un dueño): objetos vuelve a decirle si construye.", fields: { quien }, announce: "silent" },
    nombreCambiado: { describe: "H3c: alguien se ha puesto otro nombre con /nombre (o vuelve a entrar con uno guardado); el chat lo usa sobre su cabeza y en lo que diga.", fields: { quien, nombre: { kind: "text", maxBytes: NOMBRE_PROPIO_MAX } }, announce: "silent" },
    ia: { describe: "ia-visible S3 (solo en el servidor): lo público de una IA conectada — su estado, quién responde por ella (comunidad y nombre o cartera corta, vacíos si el pase no lo dice) si sus roles la dejan construir ahora y qué avatar de la casa lleva (`cuerpo`: su índice, -1 = el robot de la casa) o, si es un habitante con `apariencia`, su propio .glb (`cuerpoSha`: sha256; `cuerpoEscala`). Al identificarse y cuando un pase nuevo lo cambia; la función «ia» lo publica a las páginas.", fields: { quien, estado: { kind: "enum", values: ["activa", "dormida"] }, comunidad: { kind: "text", maxBytes: 160 }, nombre: { kind: "text", maxBytes: 160 }, cartera: { kind: "text", maxBytes: 12 }, construye: { kind: "bool" }, cuerpo: { kind: "int", min: -1, max: 999 }, cuerpoSha: { kind: "text", maxBytes: 64, default: "" }, cuerpoEscala: { kind: "fixed", min: 0.05, max: 50, step: 0.01, default: 1 } }, announce: "silent" },
    echado: { describe: "Un moderador acaba de echar o vetar a esta persona (su id de invitado): features/baculo le quita el báculo al instante. Solo en el servidor.", fields: { persona: { kind: "text", maxBytes: 80 } }, announce: "silent" },
    iaBurbuja: { describe: "ia-llamar S8 (solo en el servidor): la burbuja de acción de una IA conectada — forma, radio (m) y cuándo se dibuja — la del bloque `ia` de su pase o la de la casa (esfera, 4 m, al-acercarte). Al identificarse y cuando un pase nuevo la cambia; la función «burbuja» la publica y decide quién está dentro.", fields: { quien, forma: { kind: "enum", values: FORMAS_BURBUJA }, radio: { kind: "int", min: RADIO_MIN_M, max: RADIO_MAX_M }, visible: { kind: "enum", values: VISIBLES_BURBUJA } }, announce: "silent" },
    iaLlamada: { describe: "ia-llamar S10 (solo en el servidor): cómo se llama a una IA conectada — por su nombre, con /nombre, con el botón, solo desde dentro de su burbuja y su frase clave — la del bloque `ia.llamada` de su pase o la de la casa (nombre, barra y botón sí; solo desde dentro sí; sin frase). Al identificarse y cuando un pase nuevo la cambia; la función «llamar» la publica y decide a quién llega cada llamada.", fields: { quien, nombre: { kind: "bool" }, barra: { kind: "bool" }, boton: { kind: "bool" }, soloDentro: { kind: "bool" }, frase: { kind: "text", maxBytes: FRASE_MAX * 4 } }, announce: "silent" },
    borrarHistorial: { describe: "H3c: /chat borrar; el chat vacía el historial de la zona (quien entre después ya no lo ve).", fields: {}, announce: "silent" },
  },
  store: { describe: "Los roles del mundo (forma de STD-052, con si @todos construye), quién tiene cada uno, los dueños, los vetados, los silenciados (hasta cuándo), a quién ha bloqueado cada persona, los avisos para moderación (/denunciar, los últimos 100) y sus ajustes (config: solo para miembros, voz)." },
});

export type OpcionesRoles = {
  construir: boolean;                                  // --construir todos (MOTOR_CONSTRUIR): «build-in-worlds» in @todos, only for a world that never stored its roles
  voz?: boolean;                                       // MOTOR_VOZ (default on): microphones relayed, only for a world that never stored it
  admin?: string;                                      // the administration code; under ADMIN_MIN characters = /dueño answers that there is none
  firmar?: (texto: string) => string;                  // the server's HMAC (secret.ts): ties an owner to THIS code without keeping it
  cerrar?: (entity: number, motivo: string) => void;   // close that connection (the server); none = only told
  ahora?: () => number;                                // the clock (ms) for silences and taking out; default Date.now
  log?: (line: string) => void;
  pase?: ConfigPase | null;                             // H3b: numinia.com's key, this world's id (+ org): a pass is checked at join; none = passes are ignored
  puerta?: Pick<Puerta, "agente" | "anadir" | "quitar" | "esHabitante" | "agentes">; // ADR-080: outside agents; none = /agente says there is no door
  habitante?: (id: string) => { escalon: number; modelo?: string; apariencia?: { modelo: string; escala?: number } } | undefined; // t_5096d6f4: what the inhabitant's file says about the brain behind an «ia-<id>» (none / unknown id = nothing: the eyes read «desconocido»). Server-side only: the `ia` feature turns it into a size class
};
type Veto = { nombre: string; motivo: string; por: string; cuando: string };
/** ux2-gente: a report — who reported (id, name), about whom (id, name), why, when (ISO). Kept in the store «denuncias». */
export type Denuncia = { de: string; deNombre: string; a: string; aNombre: string; motivo: string; cuando: string };
/** What the order `/agente` and numinia.com's panel (GET/POST/DELETE /agentes, agentes-http.ts) both do: ONE code path. */
export type AgenteDato = { id: string; nombre: string; clave: string; rol?: string };
export type AgenteVista = { id: string; nombre: string; rol: string | null; permisos: string[]; presente: boolean; organizacion?: true; estado?: EstadoIA };
/** `motivo` tells the HTTP door which status to use; `texto` is Spanish and is what the person reads in both doors. */
export type ResultadoAgente = { ok: true; texto: string; agente?: AgenteVista } | { ok: false; texto: string; motivo: "invalido" | "conflicto" | "no-hay" | "servidor" };
export type GestionAgentes = {
  listar(): AgenteVista[];
  anadir(responsable: string, d: AgenteDato): ResultadoAgente;
  quitar(id: string): ResultadoAgente;
};
const esIA = (id: string): boolean => id.startsWith("ia-"); // AIs (identidad.ts agenteDe): never members, never owners
/** What an AI may ever do here, whatever its role says (numinia-archive ADR-080: «nunca moderan»). */
export const PERMISOS_IA: ReadonlySet<Permiso> = new Set<Permiso>(["enter-worlds", "build-in-worlds"]);

const bytes = new TextEncoder();
function cortar(s: string, max: number): string {
  if (bytes.encode(s).length <= max) return s;
  let out = "";
  for (const ch of s) { if (bytes.encode(out + ch).length > max - 3) break; out += ch; } // «…» is 3 bytes in UTF-8
  return out + "…";
}
/** A name shown to everybody (H3c /nombre): no control characters, one line, cut to NOMBRE_PROPIO_MAX bytes. Unlike
 * pase.ts's own `limpiar`, this one never strips a trailing MARCA_IA: the order rejects it instead (see `ordenes.nombre`). */
function limpiarNombre(texto: string, max: number): string {
  const s = texto.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  return cortar(s, max).trim();
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
  const silencios = new Map<string, number>();         // guest id -> until (ms); stored («silencios»), so a restart does not lift a silence
  const bloqueos = new Map<string, Set<string>>();     // F1: listener id -> ids they blocked; stored («b:<id>»), so a reload keeps it
  const intentos = new Map<number, { n: number; hasta: number }>();
  const nombres = new Map<string, string>();            // H3c: /nombre — guest id -> chosen name; stored («n:<id>»), never « · IA»
  const apariciones = new Map<string, { x: number; y: number; z: number }>(); // H3c: /aparecer — guest id -> their own spawn point; stored («ap:<id>»)
  let soloMiembros = false;
  let voz = o.voz ?? true;                             // without the feature running (bare servers) the seed is the answer
  const escenario = new Set<string>();                 // M17: person ids on stage (their voice reaches everyone). Memory only: an event is live, not a setting
  let config: Record<string, unknown> = {};            // the world's settings as stored (fields this engine does not know are kept)
  let api: ServerApi | null = null;
  let gestion: GestionAgentes | null = null;           // set when the feature starts: the one code path for /agente and the HTTP door
  const porCerrar: { e: number; motivo: string }[] = [];

  const miembroDe = (id: string | undefined): Miembro | null =>
    !id || esIA(id) ? null : duenos.has(id) ? { roles: miembros.get(id) ?? [], dueno: true } : miembros.has(id) ? { roles: miembros.get(id)! } : null;
  // H3b: a person who came with numinia.com's pass: what the pass says REPLACES what this world holds for them (never adds);
  // an owner by /dueño stays an owner. Kept while they are connected (the pass is not looked at again inside the session).
  const pases = new Map<string, { pase: Pase; acceso: Acceso }>();   // person id (the pass's `sub`) -> their pass
  const deEntidad = new Map<number, string>();                       // entity -> person id, to forget a pass when the last device leaves
  const pendientes = new Map<number, string>();                      // entity -> why its pass was refused (told once, at identify)
  // ia-organizacion: an AI of a numinia.com organization comes with a pass (kind "agent") and lives only while it is valid.
  const pasesIA = new Map<string, Pase>();                              // agent sub (a_…) -> its latest pass
  const vidaIA = new Map<number, { sub: string; exp: number; ult: number; cerrando?: true }>(); // entity -> pass end (s) and last renewal (ms)
  const concedidos = new Set<string>();                               // features/baculo: person ids that hold a staff now (the loan of `dirigir`)
  const accesoDe = (id: string | undefined): Acceso => {
    const ia = id && esIA(id) ? pasesIA.get(id.slice(3)) : undefined;
    if (ia) { // the pass already says what it may do (role ∩ responsible, trimmed); asleep never builds, whatever the pass lists
      const permisos = new Set(ia.permisos.filter((p) => PERMISOS_IA.has(p) && !(ia.state === "dormida" && p === "build-in-worlds")));
      return { permisos, altura: ia.altura < Number.MAX_VALUE ? ia.altura : BASE, dueno: false };
    }
    if (id && esIA(id)) { // an outside agent: its role in its file (an inhabitant: @todos), only what an AI may do
      const rol = o.puerta?.agente(id.slice(3))?.rol;
      const base = acceso(roles, rol ? { roles: [rol] } : null);
      return { permisos: new Set([...base.permisos].filter((p) => PERMISOS_IA.has(p))), altura: BASE, dueno: false };
    }
    const p = id && !duenos.has(id) ? pases.get(id) : undefined;
    const propio = p ? p.acceso : acceso(roles, miembroDe(id));
    // features/baculo: whoever holds a staff may direct for as long as they hold it (a loan of `manage-rituals`, nothing else:
    // the same height, so they reach no further over anyone; never an AI, never kept: the staff's feature says when it ends)
    return id && concedidos.has(id) && !propio.permisos.has("manage-rituals") ? { ...propio, permisos: new Set([...propio.permisos, "manage-rituals" as const]) } : propio;
  };

  /** What came of the entry passes this world received since it started (public in /status: counts and the verifier's short reason,
   * one of `MotivoPase`'s closed words, never a token). Only `credencial` counts: an organization AI's mid-session `renovar` answers
   * its bridge directly and is not an entry. */
  const cuentaPases: { recibidos: number; aceptados: number; rechazados: number; ultimoMotivo: string | null } = { recibidos: 0, aceptados: 0, rechazados: 0, ultimoMotivo: null };
  /** The world's side of a pass (Instance `credencial`): checks it; a good one names the person, a bad one leaves the guest
   * and queues one line saying why (the chat shows it right after identify). Without a configured key: passes are ignored. */
  const credencial = (entity: number, token: string, invitado: Who): Who | null => {
    if (!o.pase) return null;
    cuentaPases.recibidos++;
    const v = verificarPase(token, o.pase.clave, { aud: o.pase.mundo, now: Math.floor(ahora() / 1000), org: o.pase.org });
    if (!v.ok) { cuentaPases.rechazados++; cuentaPases.ultimoMotivo = v.motivo; pendientes.set(entity, v.texto); log(`[pase] rechazado para ${invitado.id}: ${v.motivo}`); return null; }
    cuentaPases.aceptados++;
    const p = v.pase;
    if (p.kind === "agent") { // an organization's AI: not a person, no member list, ends with its pass
      for (const [e, x] of vidaIA) if (x.sub === p.sub && !x.cerrando) { x.cerrando = true; porCerrar.push({ e, motivo: "esta IA ha entrado desde otro sitio" }); } // one connection per agent
      pasesIA.set(p.sub, p); vidaIA.set(entity, { sub: p.sub, exp: p.exp, ult: ahora() });
      log(`[pase] ${p.sub} («${p.nombre ?? "IA"}», IA de la organización ${p.org}) entra ${p.state}, ${p.permisos.length} permisos, el pase vale hasta dentro de ${Math.max(0, p.exp - Math.floor(ahora() / 1000))} s`);
      return agenteDe(p.sub, p.nombre ?? "IA");
    }
    pases.set(p.sub, { pase: p, acceso: p.dueno ? { permisos: new Set(PERMISOS), altura: Number.POSITIVE_INFINITY, dueno: true } : { permisos: new Set(p.permisos), altura: p.altura, dueno: false } });
    deEntidad.set(entity, p.sub);
    log(`[pase] ${p.sub} entra con su pase de numinia.com (${p.dueno ? "dueño" : `altura ${p.altura}`}, ${p.permisos.length} permisos)`);
    return { id: p.sub, nombre: p.nombre ?? nombreDe(p.sub), ...(p.acepto ? { acepto: p.acepto } : {}) }; // condiciones/w5: the signed pass vouches for these acceptances
  };
  /** A fresh pass in mid-session for an organization AI (Instance `renovarPase`): same agent, world and organization, never older
   * than the one held. Applies its permissions at once (asleep = no building). null = done, else why not. */
  const renovar = (entity: number, token: string): string | null => {
    const vida = vidaIA.get(entity), actual = vida ? pasesIA.get(vida.sub) : undefined;
    if (!vida || !actual || !o.pase) return "esta conexión no entró con un pase de IA de organización";
    if (ahora() - vida.ult < RENOVAR_MIN_MS) return "renovaciones demasiado seguidas";
    const v = verificarPase(token, o.pase.clave, { aud: o.pase.mundo, now: Math.floor(ahora() / 1000), org: o.pase.org });
    if (!v.ok) return `pase rechazado (${v.motivo})`;
    const p = v.pase;
    if (p.kind !== "agent" || p.sub !== vida.sub || p.org !== actual.org || p.aud !== actual.aud) return "el pase nuevo es de otro agente, mundo u organización";
    if (p.iat < actual.iat) return "el pase nuevo es más viejo que el que ya tiene";
    vida.exp = p.exp; vida.ult = ahora(); pasesIA.set(vida.sub, p);
    if (p.state !== actual.state || p.permisos.join() !== actual.permisos.join()) log(`[pase] ${p.sub} pasa a ${p.state} (${p.permisos.join(", ") || "sin permisos"})`);
    if (api) for (const e of vidaIA.keys()) if (vidaIA.get(e)?.sub === vida.sub) { api.emit("cambio", { quien: e }, "server"); publicarIA(api, e, `ia-${vida.sub}`); } // objetos tells it again whether it builds; the public card follows
    return null;
  };
  /** ia-visible S3: tell the «ia» feature what everybody may know about this AI (state, who answers for it, whether it builds) and which house avatar its pass picks (-1 = none: the house robot, S2). Every
   * AI gets it: one with a pass carrying an `ia` block says who answers; any other (an inhabitant, an outside agent) is active, nobody listed. */
  const publicarIA = (a: ServerApi, e: number, id: string): void => {
    const p = pasesIA.get(id.slice(3)), r = p?.ia?.responde, h = o.habitante?.(id.slice(3));
    a.emit("ia", { quien: e, estado: p?.state ?? "activa", comunidad: r?.comunidad ?? "", nombre: r?.nombre ?? "", cartera: r?.cartera ?? "", construye: tiene(accesoDe(id), "construir"), cuerpo: p?.ia?.cuerpo?.modelo ?? -1, ...(h ? { escalon: h.escalon, modelo: h.modelo ?? "" } : {}), ...(h?.apariencia ? { cuerpoSha: h.apariencia.modelo, cuerpoEscala: h.apariencia.escala ?? 1 } : {}) }, "server");
    const b = p?.ia?.burbuja; // ia-llamar S8: its bubble (the pass's, or the house one)
    a.emit("iaBurbuja", { quien: e, forma: b?.forma ?? "esfera", radio: b?.radio ?? RADIO_DEFECTO_M, visible: b?.visible ?? "al-acercarte" }, "server");
    const l = p?.ia?.llamada; // ia-llamar S10: how it is called (the pass's block, or the house default)
    a.emit("iaLlamada", { quien: e, nombre: l?.nombre ?? true, barra: l?.barra ?? true, boton: l?.boton ?? true, soloDentro: l?.solo_dentro ?? true, frase: l?.frase ?? "" }, "server");
  };
  const todosConstruyen = (): boolean => roles.some((r) => esBase(r) && r.permisos.includes("build-in-worlds"));

  /** The question every permission check asks (api.puede, uploads, objetos). A visitor or an AI = @todos. */
  const puede = (who: Who | null, accion: string): boolean => accion in ACCION_PERMISO && tiene(accesoDe(who?.id), accion as Accion);

  const part: ServerPart = serverPart(rolesFeature, (a) => {
    api = a;
    // what was kept (a world zip may bring roles numinia.com gave) is the truth: checked; a broken list falls back to the
    // template. Only a world with no roles yet takes --construir (MOTOR_CONSTRUIR) as its seed.
    const guardados = a.store.get("roles");
    let guardadosValen = false;
    if (guardados !== undefined) {
      const r = validarRoles(guardados);
      if (r.ok) { roles = r.value; guardadosValen = true; } else log(`[roles] los roles guardados no valen (${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}): uso los de STD-052`);
    }
    if (!guardadosValen) {
      a.store.set("roles", roles);
      log(`[roles] mundo sin roles guardados: empieza con la plantilla y @todos ${o.construir ? "construye" : "no construye"} (MOTOR_CONSTRUIR, solo esta vez; luego /construir todos|nadie)`);
    } else if (todosConstruyen() !== o.construir) {
      log(`[roles] este mundo guarda que @todos ${todosConstruyen() ? "construye" : "no construye"}: MOTOR_CONSTRUIR solo vale para un mundo nuevo (cámbialo con /construir todos|nadie)`);
    }
    const guardados2 = (a.store.get("duenos") as unknown[] | undefined) ?? [];
    let otros = 0;
    for (const d of guardados2) {
      const x = d as { id?: unknown; codigo?: unknown };
      if (huella && typeof x?.id === "string" && x.codigo === huella) duenos.add(x.id); else otros++;
    }
    if (otros) { a.store.set("duenos", [...duenos].map((id) => ({ id, codigo: huella }))); log(`[roles] ${otros} dueño(s) lo eran con otro código de administración (o sin él): ya no lo son; /dueño <código> con el de ahora`); }
    const c = a.store.get("config");
    config = c && typeof c === "object" && !Array.isArray(c) ? { ...(c as Record<string, unknown>) } : {};
    soloMiembros = config.soloMiembros === true;
    if (typeof config.voz === "boolean") voz = config.voz;
    else { config.voz = voz; a.store.set("config", config); log(`[roles] mundo sin ajuste de voz guardado: voz ${voz ? "sí" : "no"} (MOTOR_VOZ, solo esta vez; luego /voz sí|no)`); }
    for (const k of a.store.keys()) {
      if (k.startsWith("m:")) { const v = a.store.get(k); if (Array.isArray(v)) miembros.set(k.slice(2), v.filter((x) => roles.some((r) => r.id === x))); }
      if (k.startsWith("veto:")) vetos.set(k.slice(5), a.store.get(k) as Veto);
      if (k.startsWith("b:")) { const v = a.store.get(k); if (Array.isArray(v)) bloqueos.set(k.slice(2), new Set(v.filter((x): x is string => typeof x === "string").slice(0, BLOQUEOS_MAX))); }
      if (k.startsWith("n:")) { const v = a.store.get(k); if (typeof v === "string" && v && !v.endsWith(MARCA_IA)) nombres.set(k.slice(2), v); }
      if (k.startsWith("ap:")) {
        const v = a.store.get(k) as { x?: unknown; y?: unknown; z?: unknown } | undefined;
        if (v && typeof v.x === "number" && typeof v.y === "number" && typeof v.z === "number") apariciones.set(k.slice(3), { x: v.x, y: v.y, z: v.z });
      }
    }
    const denGuardadas = a.store.get("denuncias");
    const denuncias: Denuncia[] = Array.isArray(denGuardadas) ? (denGuardadas as Denuncia[]).filter((d) => typeof d?.a === "string" && typeof d.motivo === "string").slice(-DENUNCIAS_MAX) : [];
    const ultimaDenuncia = new Map<string, number>(); // id -> ms of their last report (one a minute)
    const silGuardados = a.store.get("silencios");
    if (Array.isArray(silGuardados)) for (const s of silGuardados as { id?: unknown; hasta?: unknown }[]) if (typeof s?.id === "string" && typeof s.hasta === "number" && s.hasta > ahora()) silencios.set(s.id, s.hasta);
    log(`[roles] ${roles.map((r) => r.nombre).join(", ")} · ${duenos.size} dueños, ${miembros.size} con rol, ${vetos.size} vetados${soloMiembros ? " · solo para miembros" : ""} · @todos ${todosConstruyen() ? "construye" : "no construye"}${voz ? "" : " · sin voz"}`);

    const avisar = (e: number, texto: string) => a.emit("aviso", { quien: e, texto: cortar(texto, AVISO_MAX) }, "server");
    const cambio = (e: number) => a.emit("cambio", { quien: e }, "server");
    const guardarMiembro = (id: string) => { const r = miembros.get(id) ?? []; if (r.length) a.store.set(`m:${id}`, r); else { miembros.delete(id); a.store.delete(`m:${id}`); } };
    const nombre = (e: number) => a.who(e)?.nombre ?? `Robot ${e}`;
    const conectadoComo = (id: string) => a.players().filter((e) => a.who(e)?.id === id);
    const guardarSilencios = () => a.store.set("silencios", [...silencios].filter(([, h]) => h > ahora()).map(([id, hasta]) => ({ id, hasta })));
    /** F1: tell the chat who stops/starts reading whom, for every connected device of both. */
    const avisarBloqueo = (oyente: string, hablante: string, si: boolean) => { for (const q of conectadoComo(oyente)) for (const h of conectadoComo(hablante)) a.emit("bloqueo", { quien: q, a: h, si: si ? 1 : 0 }, "server"); };
    const silenciar = (from: number, p: { id: string; nombre: string }, min: number) => {
      if (min === 0) silencios.delete(p.id); else silencios.set(p.id, ahora() + min * 60000);
      guardarSilencios();
      for (const e of conectadoComo(p.id)) { a.emit("silencio", { quien: e, segundos: min * 60 }, "server"); avisar(e, min ? `${nombre(from)} te ha silenciado ${min} min: nadie te lee en el chat ni te oye por voz.` : `${nombre(from)} te ha devuelto la palabra: ya te leen y te oyen.`); }
      log(`[roles] ${a.who(from)?.id} silencia a ${p.id} ${min} min`);
      avisar(from, min ? `${p.nombre} queda en silencio ${min} min (chat y voz).` : `${p.nombre} puede volver a hablar.`);
    };

    /** <persona> at the start of `resto`: the longest name of someone connected that it begins with. `aMiTambien` lets the
     * order name its author (the stage: you may put yourself on it). */
    const persona = (from: number, resto: string, aMiTambien = false): { e: number; id: string; nombre: string; resto: string } | null => {
      const k = resto.toLowerCase();
      let mejor: { e: number; id: string; nombre: string; resto: string } | null = null;
      for (const e of a.players()) {
        const w = a.who(e);
        if (!w) continue;
        const n = w.nombre.toLowerCase();
        if ((k === n || k.startsWith(n + " ")) && (!mejor || n.length > mejor.nombre.length)) mejor = { e, id: w.id, nombre: w.nombre, resto: resto.slice(n.length).trim() };
      }
      if (!mejor) avisar(from, resto ? `No veo a nadie conectado que se llame así. Escribe su nombre como lo ves sobre su cabeza.` : "¿A quién? Escribe su nombre como lo ves sobre su cabeza.");
      else if (mejor.e === from && !aMiTambien) { avisar(from, "Eso no te lo puedes hacer a ti."); return null; }
      return mejor;
    };
    /** The actor may do `accion` on `p` (permission + strictly below). Says why not. */
    const sobre = (from: number, accion: Accion, p: { id: string }): Acceso | null => {
      const yo = accesoDe(a.who(from)?.id);
      if (!tiene(yo, accion)) { avisar(from, `No tienes permiso para ${ACCION_TEXTO[accion]}.`); return null; }
      if (!porDebajo(yo, accesoDe(p.id))) { avisar(from, "Esa persona está a tu altura o por encima (o es dueña del mundo)."); return null; }
      return yo;
    };
    /** ux2-gente: who reads the reports: anyone who may silence, take out or ban (owners included). */
    const modera = (x: Acceso): boolean => tiene(x, "silenciar") || tiene(x, "echar") || tiene(x, "vetar");
    const sacar = (e: number, motivo: string) => { avisar(e, motivo); porCerrar.push({ e, motivo }); };
    // ADR-080: managing the outside agents. The chat order and the HTTP door (agentes-http.ts) both call these two.
    const vistaAgente = (x: { id: string; nombre: string; rol?: string }): AgenteVista =>
      ({ id: x.id, nombre: x.nombre, rol: x.rol ?? null, permisos: [...accesoDe(`ia-${x.id}`).permisos].sort(), presente: conectadoComo(`ia-${x.id}`).length > 0 });
    gestion = {
      listar: () => {
        const fuera = (o.puerta?.agentes ?? []).map(vistaAgente), org = new Map<string, AgenteVista>();
        for (const e of a.players()) { // connected organization AIs (their pass is their registration)
          const id = a.who(e)?.id, pase = id && esIA(id) ? pasesIA.get(id.slice(3)) : undefined;
          if (pase && !org.has(pase.sub)) org.set(pase.sub, { id: pase.sub, nombre: pase.nombre ?? "IA", rol: pase.roles[0]?.nombre ?? null, permisos: [...accesoDe(id).permisos].sort(), presente: true, organizacion: true, estado: pase.state });
        }
        return [...fuera, ...org.values()];
      },
      anadir: (responsable, d) => {
        const pu = o.puerta;
        if (!pu) return { ok: false, motivo: "servidor", texto: "Este servidor no tiene puerta para agentes de fuera." };
        const id = d.id.toLowerCase(), rolTexto = (d.rol ?? "").trim();
        const rol = rolTexto ? rolPorNombre(roles, rolTexto) : null;
        if (rolTexto && !rol) return { ok: false, motivo: "invalido", texto: `¿Qué rol? Los de este mundo: ${roles.map((r) => r.nombre).join(", ")}.` };
        if (pu.esHabitante(id)) return { ok: false, motivo: "conflicto", texto: `«${id}» es un habitante de este mundo: a un agente de fuera dale otro id.` };
        const no = pu.anadir({ formato: AGENTE, id, nombre: d.nombre, responsable, clave: d.clave, ...(rol && !esBase(rol) ? { rol: rol.id } : {}), presencia: "a-demanda" });
        if (no) return { ok: false, motivo: no.startsWith("Ya hay un agente") ? "conflicto" : /^(No he podido|El fichero se guardó|Este mundo no tiene carpeta)/.test(no) ? "servidor" : "invalido", texto: `No lo añado: ${no}` };
        log(`[roles] ${responsable} añade el agente de fuera «${id}»${rol && !esBase(rol) ? ` con el rol ${rol.id}` : ""}`);
        const ag = pu.agente(id);
        return { ok: true, agente: ag ? vistaAgente(ag) : undefined, texto: `Hecho: «${d.nombre}${MARCA_IA}» puede entrar con su clave (aventura/agentes/${id}.json; responde ${responsable}). Hace lo de ${rol && !esBase(rol) ? `«${rol.nombre}»` : "@todos"}, pero una IA solo entra y construye: nunca modera.` };
      },
      quitar: (idTexto) => {
        const pu = o.puerta;
        if (!pu) return { ok: false, motivo: "servidor", texto: "Este servidor no tiene puerta para agentes de fuera." };
        const id = idTexto.toLowerCase();
        if (!id) return { ok: false, motivo: "invalido", texto: "Escribe /agente quitar <id>." };
        if (pu.esHabitante(id)) return { ok: false, motivo: "conflicto", texto: `«${id}» es un habitante (habitantes/${id}.json), no un agente de fuera: se quita en la aventura.` };
        const no = pu.quitar(id);
        if (no) return { ok: false, motivo: no.startsWith("No hay ningún agente") ? "no-hay" : "servidor", texto: no };
        for (const e of conectadoComo(`ia-${id}`)) sacar(e, "Este mundo ya no deja entrar a este agente: su clave se ha quitado.");
        log(`[roles] se quita el agente de fuera «${id}»`);
        return { ok: true, texto: `«${id}» ya no puede entrar en este mundo (si estaba dentro, ha salido).` };
      },
    };
    const guardarConfig = () => { config = { ...config, soloMiembros, voz }; a.store.set("config", config); };
    /** The world's settings (manage-organization): may `from` change them? Says why not. */
    const ajusta = (from: number): boolean => {
      if (tiene(accesoDe(a.who(from)?.id), "ajustar")) return true;
      avisar(from, `No tienes permiso para ${ACCION_TEXTO.ajustar}.`); return false;
    };

    const ordenes: Record<string, (from: number, resto: string) => void> = {
      roles: (from) => {
        const w = a.who(from), yo = accesoDe(w?.id), m = miembroDe(w?.id), pase = w && !duenos.has(w.id) ? pases.get(w.id)?.pase : undefined;
        const mios = yo.dueno ? "dueño del mundo" : pase ? [...pase.roles.map((r) => r.nombre), "@todos"].join(", ") + " (de numinia.com)" : [...roles.filter((r) => m?.roles.includes(r.id)).map((r) => r.nombre), "@todos"].join(", ");
        const puedo = (Object.keys(ACCION_PERMISO) as Accion[]).filter((x) => tiene(yo, x)).map((x) => ACCION_TEXTO[x]);
        avisar(from, `Eres: ${mios}. Puedes: ${puedo.length ? puedo.join(", ") : "mirar y hablar"}. Roles de este mundo: ${roles.map((r) => r.nombre).join(", ")}${soloMiembros ? " (solo para miembros)" : ""}.`);
        avisar(from, "Órdenes: /dar y /quitar <persona> <rol> · /silenciar <persona> [minutos] · /hablar <persona> · /echar <persona> · /vetar <persona> <motivo> · /perdonar <nombre> · /denunciar <persona> <motivo> · /denuncias · /solo-miembros sí|no · /construir todos|nadie · /voz sí|no · /escenario · /agente · /dueño <código> · /nombre <nombre> · /aparecer aquí|quitar · /chat borrar");
      },
      // M17: the stage. Whoever is on it is heard by everyone in the world, unpanned (the instance asks `enEscenario` per
      // frame). Only moderation (manage-rituals) puts people on and takes them off; you may put yourself. Not stored.
      escenario: (from, resto) => {
        const [verbo = ""] = resto.split(/\s+/), v = plano(verbo);
        if (v === "") {
          const quienes = [...escenario].map((id) => conectadoComo(id).map(nombre)[0] ?? `(fuera: ${id})`);
          avisar(from, quienes.length ? `En el escenario: ${quienes.join(", ")}. Su voz la oye todo el mundo.` : "No hay nadie en el escenario: cada voz llega solo a quien está cerca.");
          if (tiene(accesoDe(a.who(from)?.id), "escenario")) avisar(from, "Órdenes: /escenario <persona> (sube; puedes subirte tú) · /escenario quitar <persona> · /escenario nadie.");
          return;
        }
        if (!tiene(accesoDe(a.who(from)?.id), "escenario")) { avisar(from, `No tienes permiso para ${ACCION_TEXTO.escenario}.`); return; }
        const todos = (texto: string) => { for (const e of a.players()) avisar(e, texto); }; // the whole zone hears who takes the stage (same fan-out as the chat)
        if (v === "nadie") {
          if (!escenario.size) { avisar(from, "El escenario ya está vacío."); return; }
          escenario.clear();
          log(`[roles] ${a.who(from)?.id} vacía el escenario`);
          todos(`${nombre(from)} vacía el escenario: cada voz vuelve a llegar solo a quien está cerca.`);
          return;
        }
        if (v === "quitar") {
          const p = persona(from, resto.slice(verbo.length).trim(), true); if (!p) return;
          if (!escenario.delete(p.id)) { avisar(from, `${p.nombre} no está en el escenario.`); return; }
          log(`[roles] ${a.who(from)?.id} baja del escenario a ${p.id}`);
          todos(`${p.nombre} baja del escenario.`);
          return;
        }
        const p = persona(from, resto, true); if (!p) return;
        if (esIA(p.id)) { avisar(from, "Una IA no sube al escenario."); return; }
        if (escenario.has(p.id)) { avisar(from, `${p.nombre} ya está en el escenario.`); return; }
        escenario.add(p.id);
        log(`[roles] ${a.who(from)?.id} sube al escenario a ${p.id}`);
        todos(`${p.nombre} sube al escenario: su voz la oye todo el mundo.`);
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
        silenciar(from, p, min);
      },
      hablar: (from, resto) => {
        const p = persona(from, resto); if (!p || !sobre(from, "silenciar", p)) return;
        if (!silencios.has(p.id)) { avisar(from, `${p.nombre} no estaba en silencio.`); return; }
        silenciar(from, p, 0);
      },
      // F1: a personal block — no permission needed; it only changes what YOU read and hear
      bloquear: (from, resto) => {
        const w = a.who(from); if (!w) { avisar(from, "Primero hace falta que el mundo sepa quién eres (recarga la página)."); return; }
        const p = persona(from, resto); if (!p) return;
        const mios = bloqueos.get(w.id) ?? new Set<string>();
        if (mios.has(p.id)) { avisar(from, `Ya no lees ni oyes a ${p.nombre}. /desbloquear ${p.nombre} para volver a hacerlo.`); return; }
        if (mios.size >= BLOQUEOS_MAX) { avisar(from, `Ya has bloqueado a ${BLOQUEOS_MAX} personas: desbloquea a alguien primero.`); return; }
        mios.add(p.id); bloqueos.set(w.id, mios); a.store.set(`b:${w.id}`, [...mios]);
        avisarBloqueo(w.id, p.id, true);
        avisar(from, `Desde ahora no lees ni oyes a ${p.nombre}; los demás sí. /desbloquear ${p.nombre} lo deshace.`);
      },
      desbloquear: (from, resto) => {
        const w = a.who(from); if (!w) { avisar(from, "Primero hace falta que el mundo sepa quién eres (recarga la página)."); return; }
        const p = persona(from, resto); if (!p) return;
        const mios = bloqueos.get(w.id);
        if (!mios?.delete(p.id)) { avisar(from, `No tenías bloqueado a ${p.nombre}.`); return; }
        if (mios.size) a.store.set(`b:${w.id}`, [...mios]); else { bloqueos.delete(w.id); a.store.delete(`b:${w.id}`); }
        avisarBloqueo(w.id, p.id, false);
        avisar(from, `Vuelves a leer y oír a ${p.nombre}.`);
      },
      // ux2-gente: a report about someone, for whoever moderates (mute-, remove- or ban-members): those connected now hear
      // it at once, and it stays in the store so a moderator who comes later reads it with /denuncias. Never published.
      denunciar: (from, resto) => {
        const w = a.who(from); if (!w) { avisar(from, "Primero hace falta que el mundo sepa quién eres (recarga la página)."); return; }
        const p = persona(from, resto); if (!p) return;
        const motivo = cortar(p.resto, MOTIVO_MAX);
        if (!motivo) { avisar(from, `Di qué ha pasado: /denunciar ${p.nombre} <motivo>.`); return; }
        const antes = ultimaDenuncia.get(w.id);
        if (antes !== undefined && ahora() - antes < DENUNCIA_PAUSA_MS) { avisar(from, `Espera ${Math.ceil((DENUNCIA_PAUSA_MS - (ahora() - antes)) / 1000)} s para enviar otro aviso.`); return; }
        ultimaDenuncia.set(w.id, ahora());
        const d: Denuncia = { de: w.id, deNombre: w.nombre, a: p.id, aNombre: p.nombre, motivo, cuando: new Date(ahora()).toISOString() };
        denuncias.push(d); while (denuncias.length > DENUNCIAS_MAX) denuncias.shift();
        a.store.set("denuncias", denuncias);
        const mods = a.players().filter((e) => e !== from && e !== p.e && modera(accesoDe(a.who(e)?.id)));
        for (const e of mods) avisar(e, `Aviso para moderación: ${w.nombre} denuncia a ${p.nombre}: «${motivo}». /denuncias para ver los últimos.`);
        log(`[roles] ${w.id} denuncia a ${p.id}: ${motivo}`);
        avisar(from, mods.length ? `Aviso enviado a moderación (${mods.length} ${mods.length === 1 ? "persona conectada" : "personas conectadas"}). Queda guardado para quien modere este mundo.` : "Aviso guardado: ahora no hay nadie de moderación conectado; lo leerán al entrar con /denuncias.");
      },
      denuncias: (from) => {
        if (!modera(accesoDe(a.who(from)?.id))) { avisar(from, "Solo quien modera este mundo lee los avisos."); return; }
        if (!denuncias.length) { avisar(from, "No hay ningún aviso de moderación."); return; }
        for (const d of denuncias.slice(-DENUNCIAS_VER).reverse()) avisar(from, `${d.cuando.slice(0, 16).replace("T", " ")} UTC · ${d.deNombre} denuncia a ${d.aNombre}: «${d.motivo}»`);
      },
      echar: (from, resto) => {
        const p = persona(from, resto); if (!p || !sobre(from, "echar", p)) return;
        echados.set(p.id, { nombre: p.nombre, hasta: ahora() + ECHADO_MIN * 60000 });
        a.emit("echado", { persona: p.id }, "server");
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
        a.emit("echado", { persona: p.id }, "server");
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
        if (!ajusta(from)) return;
        const v = plano(resto);
        if (v !== "si" && v !== "no") { avisar(from, `Ahora ${soloMiembros ? "solo entran miembros" : "entra cualquiera"}. Escribe /solo-miembros sí o /solo-miembros no.`); return; }
        soloMiembros = v === "si"; guardarConfig();
        log(`[roles] ${a.who(from)?.id}: solo para miembros = ${soloMiembros}`);
        avisar(from, soloMiembros ? "Desde ahora solo entran miembros (quien tiene un rol con «enter-worlds»). Quien ya está dentro sigue." : "Desde ahora entra cualquiera.");
      },
      // who may build: «build-in-worlds» of the base role, kept with the roles (datos/roles: it travels in the zip)
      construir: (from, resto) => {
        if (!ajusta(from)) return;
        const v = plano(resto);
        if (v !== "todos" && v !== "nadie") { avisar(from, `Ahora ${todosConstruyen() ? "construye cualquiera (@todos)" : "construye solo quien tiene un rol con «build-in-worlds»"}. Escribe /construir todos o /construir nadie.`); return; }
        const si = v === "todos";
        roles = roles.map((r) => (esBase(r) ? { ...r, permisos: si ? [...new Set([...r.permisos, "build-in-worlds" as const])] : r.permisos.filter((p) => p !== "build-in-worlds") } : r));
        a.store.set("roles", roles);
        for (const e of a.players()) cambio(e); // every page and AI learns at once whether it builds
        log(`[roles] ${a.who(from)?.id}: @todos construye = ${si}`);
        avisar(from, si ? "Desde ahora construye cualquiera que entre (también las IA del mundo)." : "Desde ahora construye solo quien tiene un rol con «build-in-worlds» (y los dueños).");
      },
      // the microphones: relayed or not (the instance asks before every voice frame, so it acts at once)
      voz: (from, resto) => {
        if (!ajusta(from)) return;
        const v = plano(resto);
        if (v !== "si" && v !== "no") { avisar(from, `Ahora ${voz ? "la voz llega a quien está cerca" : "no se oye ningún micrófono"}. Escribe /voz sí o /voz no.`); return; }
        voz = v === "si"; guardarConfig();
        log(`[roles] ${a.who(from)?.id}: voz = ${voz}`);
        avisar(from, voz ? "Desde ahora la voz de cada micrófono llega a quien está cerca." : "Desde ahora no se oye ningún micrófono en este mundo.");
      },
      // ADR-080: the outside AIs this world lets in, by their public key (aventura/agentes/<id>.json; puerta.ts)
      agente: (from, resto) => {
        if (!ajusta(from)) return;
        const pu = o.puerta;
        if (!pu) { avisar(from, "Este servidor no tiene puerta para agentes de fuera."); return; }
        const [verbo = "", ...trozos] = resto.split(/\s+/).filter(Boolean);
        const v = plano(verbo);
        if (v === "" || v === "lista") {
          const ag = pu.agentes;
          avisar(from, ag.length ? `Agentes de fuera de este mundo: ${ag.map((x) => `${x.id} («${x.nombre}${MARCA_IA}», ${x.rol ? `rol ${x.rol}` : "@todos"})`).join(", ")}.` : "Este mundo no deja entrar a ningún agente de fuera todavía.");
          avisar(from, "Órdenes: /agente añadir <id> <nombre…> <clave ed25519:…> [rol] · /agente quitar <id>. La clave la da node tools/agente.ts nuevo <id> donde vive el agente.");
          return;
        }
        if (v === "anadir") {
          const i = trozos.findIndex((t) => t.startsWith("ed25519:"));
          if (trozos.length < 3 || i < 2) { avisar(from, "Escribe /agente añadir <id> <nombre…> <clave ed25519:…> [rol]. La línea entera te la da node tools/agente.ts nuevo <id>."); return; }
          const r = gestion!.anadir(a.who(from)?.nombre ?? "dueño del mundo", { id: trozos[0], nombre: trozos.slice(1, i).join(" "), clave: trozos[i], rol: trozos.slice(i + 1).join(" ") });
          avisar(from, r.texto);
          return;
        }
        if (v === "quitar") {
          avisar(from, gestion!.quitar(trozos[0] ?? "").texto);
          return;
        }
        avisar(from, "Escribe /agente (lista), /agente añadir <id> <nombre…> <clave> [rol] o /agente quitar <id>.");
      },
      // H3c: se guarda con la identidad (I1): el mismo id vuelve a tener este nombre en otra sesión o tras un reinicio.
      // La cola « · IA» (MARCA_IA) la pone el servidor solo para agentes con billete (identidad.ts): nadie la escribe a mano.
      nombre: (from, resto) => {
        const w = a.who(from);
        if (!w) { avisar(from, "Primero hace falta que el mundo sepa quién eres (recarga la página)."); return; }
        if (esIA(w.id)) { avisar(from, "Una IA no se cambia el nombre por el chat: lo pone el servidor."); return; }
        const nuevo = limpiarNombre(resto, NOMBRE_PROPIO_MAX);
        if (!nuevo) { avisar(from, "Escribe /nombre <nombre>."); return; }
        if (nuevo.endsWith(MARCA_IA)) { avisar(from, `Ese nombre no vale: termina en «${MARCA_IA}», que el servidor reserva para los agentes de IA.`); return; }
        nombres.set(w.id, nuevo); a.store.set(`n:${w.id}`, nuevo);
        log(`[roles] ${w.id} se pone el nombre «${nuevo}»`);
        a.emit("nombreCambiado", { quien: from, nombre: nuevo }, "server");
        avisar(from, `Desde ahora te llamas «${nuevo}».`);
      },
      // H3c: punto de reaparición propio (D-045 ya devuelve al último suelo seguro o al de la casa; esto fija el tuyo).
      // Se guarda con la identidad; al volver a entrar (otra pestaña, otro día) apareces ahí (ver el onIdentify, abajo).
      aparecer: (from, resto) => {
        const w = a.who(from);
        if (!w) { avisar(from, "Primero hace falta que el mundo sepa quién eres (recarga la página)."); return; }
        if (esIA(w.id)) { avisar(from, "Una IA no tiene un punto de aparición propio."); return; }
        const v = plano(resto);
        if (v === "aqui") {
          const p = a.position(from);
          if (!p) { avisar(from, "No sé dónde estás: vuelve a intentarlo dentro del mundo."); return; }
          apariciones.set(w.id, p); a.store.set(`ap:${w.id}`, p);
          log(`[roles] ${w.id} fija su punto de aparición en (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
          avisar(from, "Hecho: desde ahora apareces aquí cuando entras en este mundo. /aparecer quitar lo deshace.");
          return;
        }
        if (v === "quitar") {
          if (!apariciones.delete(w.id)) { avisar(from, "No tenías un punto de aparición propio."); return; }
          a.store.delete(`ap:${w.id}`);
          log(`[roles] ${w.id} quita su punto de aparición`);
          avisar(from, "Hecho: vuelves a aparecer donde aparece cualquiera.");
          return;
        }
        avisar(from, "Escribe /aparecer aquí (para aparecer donde estás ahora) o /aparecer quitar (para dejarlo).");
      },
      // H3c: manage-organization, como /construir, /voz y /solo-miembros.
      chat: (from, resto) => {
        if (!ajusta(from)) return;
        const v = plano(resto);
        if (v !== "borrar") { avisar(from, "Escribe /chat borrar para vaciar el historial de la zona."); return; }
        a.emit("borrarHistorial", {}, "server");
        log(`[roles] ${a.who(from)?.id} borra el historial del chat de la zona`);
        avisar(from, "Hecho: el historial de la zona está vacío. Quien entre a partir de ahora no verá lo de antes.");
      },
    };
    ordenes.dueno = ordenes["dueño"];
    ordenes.agentes = ordenes.agente;

    const darQuitar = (from: number, resto: string, dar: boolean) => {
      const p = persona(from, resto); if (!p) return;
      if (esIA(p.id)) { avisar(from, "Una IA no tiene roles propios: hace lo de @todos y nunca más que quien responde de ella (STD-051)."); return; }
      if (pases.has(p.id) && !duenos.has(p.id)) { avisar(from, `Los roles de ${p.nombre} vienen de su pase de numinia.com: se cambian allí, no aquí.`); return; }
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

    // features/baculo tells us who holds a staff: the loan lasts exactly that long (an AI never gets it; a pass cannot give it)
    a.listen("baculo", "concesion", (m) => {
      const id = String(m.persona ?? "");
      if (!id || esIA(id)) return true;
      if (m.si === true) concedidos.add(id); else concedidos.delete(id);
      for (const e of conectadoComo(id)) cambio(e); // the director's page learns at once whether it may direct
      return true;
    });
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
      const rechazo = pendientes.get(e); // a pass that was refused: say why first, then go on as a visitor
      if (rechazo) { pendientes.delete(e); avisar(e, rechazo); }
      const v = vetos.get(w.id), ech = echados.get(w.id), t = ahora();
      if (v) { sacar(e, `Estás vetado en este mundo: ${v.motivo}`); return; }
      if (ech && t < ech.hasta) { sacar(e, `Te sacaron de este mundo hace poco. Puedes volver dentro de ${Math.ceil((ech.hasta - t) / 60000)} min.`); return; }
      if (ech) echados.delete(w.id);
      const m = miembroDe(w.id), conPase = pases.has(w.id) && !duenos.has(w.id);
      // members only: a role with enter-worlds lets you in — here, or on your pass
      if (soloMiembros && !esIA(w.id) && !((m || conPase) && tiene(accesoDe(w.id), "entrar"))) { sacar(e, "Este mundo es solo para sus miembros ahora mismo."); return; }
      const s = silencios.get(w.id);
      if (s && t < s) { a.emit("silencio", { quien: e, segundos: Math.ceil((s - t) / 1000) }, "server"); avisar(e, `Sigues en silencio ${Math.ceil((s - t) / 60000)} min más: nadie te lee en el chat ni te oye por voz.`); }
      // F1: the chat learns the blocks this device holds and the ones that hold it (entities are new on every connection)
      for (const otro of a.players()) {
        if (otro === e) continue;
        const ow = a.who(otro); if (!ow) continue;
        if (bloqueos.get(w.id)?.has(ow.id)) a.emit("bloqueo", { quien: e, a: otro, si: 1 }, "server");
        if (bloqueos.get(ow.id)?.has(w.id)) a.emit("bloqueo", { quien: otro, a: e, si: 1 }, "server");
      }
      if (m || conPase || (esIA(w.id) && pasesIA.has(w.id.slice(3)))) cambio(e);
      if (esIA(w.id)) publicarIA(a, e, w.id);
      // H3c: lo que se guarda con la identidad vuelve a aplicarse en cada conexión nueva de la misma persona.
      const nc = nombres.get(w.id);
      if (nc) a.emit("nombreCambiado", { quien: e, nombre: nc }, "server");
      const ap = apariciones.get(w.id);
      if (ap) a.teletransportar(e, ap);
    });
    a.onLeave((e) => {
      intentos.delete(e); pendientes.delete(e);
      const vida = vidaIA.get(e); vidaIA.delete(e);
      if (vida && ![...vidaIA.values()].some((x) => x.sub === vida.sub)) pasesIA.delete(vida.sub);
      const sub = deEntidad.get(e); deEntidad.delete(e);
      if (sub && ![...deEntidad.values()].includes(sub)) pases.delete(sub); // the last device of that person left
    });
    // close on the next tick, after the answer has gone out
    a.onTick(() => {
      const t = Math.floor(ahora() / 1000); // an organization AI lives only while its pass is valid: no fresh PASE by `exp` = out (4003)
      for (const [e, x] of vidaIA) if (!x.cerrando && t >= x.exp) { x.cerrando = true; sacar(e, "Tu pase de IA ha caducado y no llegó otro: vuelve a pedirlo a numinia.com."); log(`[pase] ${x.sub} sale: su pase caducó sin renovar`); }
      while (porCerrar.length) { const c = porCerrar.shift()!; if (o.cerrar) o.cerrar(c.e, c.motivo); }
    });
  });

  return {
    part, puede, credencial, renovar,
    /** For tests and the server: what someone with this id may do. */
    acceso: (id: string | undefined) => accesoDe(id),
    /** For /status: how many passes arrived, were accepted or refused, and why the last refusal (the verifier's short reason). */
    pases: () => ({ ...cuentaPases }),
    /** For /status (STD: personas vs agentes): `id` is an "ia-…" one. Its organization (ADR-080, a signed pass) when
     * it is one of numinia.com's agents; null for a world inhabitant (habitantes/<id>.json, P4) — those have no pass. */
    organizacionDeAgente: (id: string): string | null => (esIA(id) ? pasesIA.get(id.slice(3))?.org ?? null : null),
    /** ia-visible S1: the `ia` block of the latest pass of this AI (`id` is an "ia-…" one), or null: no block, a person, an outside agent.
     * Kept as the pass is (a fresh pass in mid-session replaces it); read by publicarIA (S2 body, S3 public card); the bubble (S8) and the call (S10) will read it too. */
    iaDe: (id: string): IABloque | null => (esIA(id) ? pasesIA.get(id.slice(3))?.ia ?? null : null),
    get roles(): readonly Rol[] { return roles; },
    get soloMiembros() { return soloMiembros; },
    /** Are microphones relayed in this world (the stored setting; MOTOR_VOZ only seeded it)? The instance asks it. */
    get voz() { return voz; },
    /** F1: may `a` hear `de`? No while `de` is silenced by the world's roles, or while `a` has blocked `de`. The instance asks it per voice frame and listener. */
    oye(de: Who | null, a: Who | null): boolean {
      if (de) { const s = silencios.get(de.id); if (s !== undefined && ahora() < s) return false; }
      return !(de && a && bloqueos.get(a.id)?.has(de.id));
    },
    /** F1: for tests and /status: whom this id has blocked. */
    bloqueados: (id: string): readonly string[] => [...(bloqueos.get(id) ?? [])],
    /** ux2-gente: the reports this world keeps (for tests and /denuncias), oldest first. */
    denuncias: (): readonly Denuncia[] => (api ? ((api.store.get("denuncias") as Denuncia[] | undefined) ?? []) : []),
    /** M17: is this person on stage (/escenario)? The instance asks it per voice frame; a stage voice reaches everyone. */
    enEscenario: (id: string | undefined): boolean => id !== undefined && escenario.has(id),
    get todosConstruyen() { return todosConstruyen(); },
    get conectado() { return api !== null; },
    /** Outside agents (ADR-080): list/add/remove, the code behind `/agente` and the HTTP door. null until the feature has started. */
    get agentes(): GestionAgentes | null { return gestion; },
  };
}
