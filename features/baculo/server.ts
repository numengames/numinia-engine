// baculo — server part (v1). The server owns who holds which staff: `coger` after `api.within` (free, you hold none, you are
// not an AI), `soltar` and `pasar` (to someone within PASAR_M, not an AI, holding none), leaving the world keeps it GRACIA_S
// seconds for you and then it goes back to its pedestal, being thrown out by a moderator takes it at once. Every change of
// holder tells the world's roles (event `concesion`, heard only by the server) so they lend `dirigir` to exactly who holds
// one. Who rules the world (`api.puede(e, "mandar")` = administrator/owner) changes how many there are and may recall them.
// Nothing is decided by a page; every change is written to the world's log.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { NO_PUEDE, guardarEnMundo, puedeInterruptor, vigilarPermiso } from "../interruptor.ts";
import type { EntornoMundo } from "../interruptor.ts";
import { baculo, CANTIDAD_DEFECTO, CANTIDAD_MAX, CANTIDAD_MIN, CERCA_M, COGER_M, GRACIA_S, LIBRE, MODELO_BACULO, PASAR_M, RESERVADO } from "./feature.ts";

export type Sitio = { x: number; z: number; y?: number };
export type Opciones = { cantidad?: number; sitios?: Sitio[]; activa?: boolean };
export const FICHERO = "baculos.json", ESQUEMA = "numinia-engine/baculos@1";
const SHA = /^[0-9a-f]{64}$/;
const TICKS_POR_S = 20;
const SIGUE_CADA_TICKS = 20;
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const plano = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const esIA = (id: string): boolean => id.startsWith("ia-"); // identidad.ts agenteDe: an AI is never a person here
const entre = (n: unknown, min: number, max: number, def: number): number => { const v = Math.trunc(Number(n)); return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def; };

/** `entorno/baculos.json` (numinia-engine/baculos@1): { cantidad?: 1–5, sitios?: [{ x, y?, z }] }. Each wrong site is left out with its reason. */
export function leerBaculos(crudo: unknown): { valor: Opciones; problemas: string[] } | null {
  if (crudo === undefined || crudo === null) return null;
  const o = (typeof crudo === "object" ? crudo : {}) as Record<string, unknown>, problemas: string[] = [];
  if (typeof crudo !== "object" || Array.isArray(crudo)) problemas.push("baculos.json debe ser un objeto { cantidad, sitios }");
  const sitios: Sitio[] = [];
  if (o.sitios !== undefined && !Array.isArray(o.sitios)) problemas.push("sitios: debe ser una lista de { x, y?, z }");
  (Array.isArray(o.sitios) ? o.sitios : []).forEach((s, i) => {
    const t = (s ?? {}) as Record<string, unknown>;
    if (!Number.isFinite(Number(t.x)) || !Number.isFinite(Number(t.z)) || t.x === null || t.z === null) { problemas.push(`sitios[${i}]: x y z en metros`); return; }
    sitios.push({ x: Number(t.x), z: Number(t.z), y: Number.isFinite(Number(t.y)) ? Math.max(-100, Math.min(500, Number(t.y))) : 0 });
  });
  if (o.cantidad !== undefined && !(Number.isInteger(o.cantidad) && Number(o.cantidad) >= CANTIDAD_MIN && Number(o.cantidad) <= CANTIDAD_MAX)) problemas.push(`cantidad: un entero de ${CANTIDAD_MIN} a ${CANTIDAD_MAX} (uso ${CANTIDAD_DEFECTO})`);
  return { valor: { activa: o.activa !== false, cantidad: Number.isInteger(o.cantidad) && Number(o.cantidad) >= CANTIDAD_MIN && Number(o.cantidad) <= CANTIDAD_MAX ? Number(o.cantidad) : CANTIDAD_DEFECTO, sitios }, problemas };
}

export const crearBaculo = (opts: Opciones | null = null, io?: EntornoMundo) => serverPart(baculo, (api: ServerApi) => {
  const claves = (n: number) => Array.from({ length: n }, (_, i) => `b${i + 1}`);
  // a world without baculos.json has none (off, cost 0); with it, the staffs are on unless it says `activa: false`. Without a folder to
  // write, what the switch and /baculos changed lives in the server's store, so it survives a restart
  const guardado = io?.escribir ? undefined : api.store.get("estado") as Partial<Opciones> | undefined;
  let encendido = guardado?.activa ?? (opts !== null && opts.activa !== false);
  let cantidad = entre(guardado?.cantidad ?? opts?.cantidad, CANTIDAD_MIN, CANTIDAD_MAX, CANTIDAD_DEFECTO);
  let sitios: Sitio[] = guardado?.sitios ?? opts?.sitios ?? [];
  /** Keep what changed: in baculos.json when the world has a folder, else in the server's store. "" = kept (or only lasts this run, said). */
  const guardar = (cambios: Record<string, unknown>): string => {
    const r = guardarEnMundo(io, FICHERO, ESQUEMA, cambios, api.log);
    if (r === "sin carpeta") { api.store.set("estado", { activa: encendido, cantidad, sitios, ...cambios }); return ""; }
    return r;
  };
  const sitioDe = (i: number): Required<Sitio> => { const s = sitios[i] ?? (sitios[0] ? { x: sitios[0].x + 1.5 * i, z: sitios[0].z, y: sitios[0].y } : { x: 1.5 * i, z: 0, y: 0 }); return { x: s.x, z: s.z, y: s.y ?? 0 }; };
  const modelo = SHA.test(MODELO_BACULO) && api.activo(MODELO_BACULO, "glb") ? MODELO_BACULO : "";
  const reservas = new Map<string, { persona: string; hasta: number }>(); // staff -> who dropped off, and until which tick
  const concedido = new Map<string, boolean>();                           // person -> what the roles were last told
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  const ids = new Map<number, string>();                                   // entity -> person id, kept past the leave (who() is gone by then)
  const personaDe = (e: number) => api.who(e)?.id ?? ids.get(e) ?? "";
  const portadorDe = (k: string) => Number(api.state.get(k)?.portador ?? LIBRE);
  const llevaDe = (e: number): string[] => claves(cantidad).filter((k) => portadorDe(k) === e);
  const nombreBaculo = (i: number) => (cantidad > 1 ? `Báculo del Director ${i + 1}` : "Báculo del Director");

  const poner = (k: string, v: Msg) => { api.state.set(k, v, { at: { x: Number(v.x), z: Number(v.z) } }); };
  const base = (i: number, portador: number, x?: number, y?: number, z?: number): Msg => {
    const s = sitioDe(i), libre = portador === LIBRE || portador === RESERVADO;
    return { nombre: nombreBaculo(i), x: libre ? s.x : x ?? s.x, y: libre ? s.y : y ?? s.y, z: libre ? s.z : z ?? s.z, hx: s.x, hy: s.y, hz: s.z, modelo, radio: portador === LIBRE ? COGER_M : 0, portador };
  };
  /** Tell the world's roles, once per change, whether this person holds a staff now. */
  const conceder = (persona: string) => {
    if (!persona || esIA(persona)) return;
    const tiene = claves(cantidad).some((k) => { const p = portadorDe(k); return p >= 0 && personaDe(p) === persona; });
    if (concedido.get(persona) === tiene) return;
    concedido.set(persona, tiene);
    api.emit("concesion", { persona, si: tiene }, "server");
  };
  const volver = (k: string, e: number | null, que: "soltado" | "recuperado" | "devuelto") => {
    const i = Number(k.slice(1)) - 1, v = api.state.get(k);
    if (!v) return;
    const antes = Number(v.portador), persona = antes >= 0 ? personaDe(antes) : reservas.get(k)?.persona ?? "";
    reservas.delete(k);
    poner(k, base(i, LIBRE));
    const quien = e ?? (antes >= 0 ? antes : 0);
    const texto = que === "soltado" ? `${nombreDe(quien)} suelta ${nombreBaculo(i)}: vuelve a su sitio` : que === "recuperado" ? `${nombreDe(quien)} recupera ${nombreBaculo(i)}` : `${nombreBaculo(i)} vuelve a su sitio`;
    const s = sitioDe(i);
    api.emit("cambio", { quien, a: -1, cosa: k, nombre: nombreBaculo(i), que, texto: cortar(texto, 120) }, { near: { x: s.x, z: s.z }, radius: CERCA_M });
    api.log(`[baculo] ${texto}`);
    conceder(persona);
  };
  const coger = (k: string, e: number) => {
    const i = Number(k.slice(1)) - 1, p = api.position(e) ?? sitioDe(i);
    poner(k, base(i, e, p.x, p.y, p.z));
    const texto = `${nombreDe(e)} coge ${nombreBaculo(i)}: ahora dirige`;
    api.emit("cambio", { quien: e, a: -1, cosa: k, nombre: nombreBaculo(i), que: "cogido", texto: cortar(texto, 120) }, { near: { x: p.x, z: p.z }, radius: CERCA_M });
    api.log(`[baculo] ${texto}`);
    conceder(personaDe(e));
  };

  const montar = () => {
    for (const k of claves(CANTIDAD_MAX)) {
      const i = Number(k.slice(1)) - 1;
      if (i < cantidad && !api.state.get(k)) poner(k, base(i, LIBRE));
      if (i >= cantidad && api.state.get(k)) { const p = portadorDe(k); const persona = p >= 0 ? personaDe(p) : ""; api.state.delete(k); reservas.delete(k); if (persona) conceder(persona); }
    }
  };
  if (encendido) {
    montar();
    for (const k of claves(cantidad)) { const v = api.state.get(k); if (v && Number(v.portador) !== LIBRE) poner(k, base(Number(k.slice(1)) - 1, LIBRE)); } // nobody holds anything at start
    api.log(`baculo: ${cantidad} báculo(s) en ${Math.max(1, sitios.length)} sitio(s)`);
  }

  api.on("coger", (e, m) => {
    if (!encendido) return;
    const k = String(m.cosa ?? ""), v = api.state.get(k);
    if (!v) return rechazar(e, `No hay ningún báculo «${cortar(k, 16)}».`);
    const id = personaDe(e);
    if (!id) return rechazar(e, "Primero hace falta que el mundo sepa quién eres (recarga la página).");
    if (esIA(id)) return rechazar(e, "Una IA no coge el báculo: dirigir es cosa de personas.");
    const p = Number(v.portador);
    if (p === e) return rechazar(e, `Ya llevas ${String(v.nombre)}.`);
    if (p === RESERVADO) return rechazar(e, `${String(v.nombre)} está reservado unos segundos a quien lo llevaba.`);
    if (p !== LIBRE) return rechazar(e, `${String(v.nombre)} lo lleva ${nombreDe(p)}.`);
    if (llevaDe(e).length >= 1) return rechazar(e, "Ya llevas un báculo: una persona, un báculo.");
    if (!api.within(e, k)) return rechazar(e, `Acércate a ${String(v.nombre)} para cogerlo.`);
    coger(k, e);
  });
  api.on("soltar", (e) => {
    const mio = llevaDe(e)[0];
    if (!mio) return rechazar(e, "No llevas ningún báculo.");
    volver(mio, e, "soltado");
  });
  /** The person to hand it to: by name (exact, else the only one that starts with or contains it) or, with no name, the nearest. */
  const elegir = (e: number, nombre: string): number | string => {
    const yo = api.position(e);
    if (!yo) return "No sé dónde estás.";
    const cerca = api.players().filter((o) => o !== e).map((o) => ({ o, p: api.position(o), n: nombreDe(o) })).filter((c) => c.p).map((c) => ({ ...c, d: Math.hypot(c.p!.x - yo.x, c.p!.z - yo.z) }));
    const k = plano(nombre);
    let pool = cerca;
    if (k) {
      const exactos = cerca.filter((c) => plano(c.n) === k);
      pool = exactos.length ? exactos : cerca.filter((c) => plano(c.n).startsWith(k)).length ? cerca.filter((c) => plano(c.n).startsWith(k)) : cerca.filter((c) => plano(c.n).includes(k));
      if (!pool.length) return `No veo a nadie llamado «${cortar(nombre, 24)}».`;
      if (pool.length > 1) return `Hay varias personas que encajan con «${cortar(nombre, 24)}»: escribe el nombre entero.`;
    }
    const dentro = pool.filter((c) => c.d <= PASAR_M && !esIA(personaDe(c.o))).sort((a, b) => a.d - b.d);
    if (!dentro.length) return k ? `${pool[0] ? pool[0].n : "Esa persona"} está lejos (a más de ${PASAR_M} m) o no puede llevarlo.` : `No hay nadie a menos de ${PASAR_M} m a quien pasárselo.`;
    return dentro[0].o;
  };
  const pasarA = (e: number, nombre: string) => {
    const mio = llevaDe(e)[0];
    if (!mio) return rechazar(e, "No llevas ningún báculo que pasar.");
    const r = elegir(e, nombre);
    if (typeof r === "string") return rechazar(e, r);
    const id = personaDe(r);
    if (!id) return rechazar(e, `${nombreDe(r)} aún no se ha identificado: no puede llevarlo.`);
    if (esIA(id)) return rechazar(e, "Una IA no coge el báculo: dirigir es cosa de personas.");
    if (id === personaDe(e)) return rechazar(e, "Esa persona eres tú (otro dispositivo): suéltalo si quieres dejarlo.");
    if (llevaDe(r).length) return rechazar(e, `${nombreDe(r)} ya lleva un báculo.`);
    const a = r;
    const i = Number(mio.slice(1)) - 1, p = api.position(a)!;
    const persona0 = personaDe(e);
    poner(mio, base(i, a, p.x, p.y, p.z));
    const texto = `${nombreDe(e)} pasa ${nombreBaculo(i)} a ${nombreDe(a)}: ahora dirige ${nombreDe(a)}`;
    api.emit("cambio", { quien: e, a, cosa: mio, nombre: nombreBaculo(i), que: "pasado", texto: cortar(texto, 120) }, { near: { x: p.x, z: p.z }, radius: CERCA_M });
    api.log(`[baculo] ${texto}`);
    conceder(persona0); conceder(id);
  };
  api.on("pasar", (e, m) => pasarA(e, String(m.a ?? "")));
  const recuperar = (e: number) => {
    if (!api.puede(e, "mandar")) return rechazar(e, "Solo quien manda en este mundo recupera los báculos.");
    let n = 0;
    for (const k of claves(cantidad)) { const v = api.state.get(k); if (v && Number(v.portador) !== LIBRE) { volver(k, e, "recuperado"); n++; } }
    if (!n) rechazar(e, "Todos los báculos están ya en su sitio.");
  };
  const cambiarCantidad = (e: number, n: number) => {
    if (!api.puede(e, "mandar")) return rechazar(e, "Solo quien manda en este mundo decide cuántos báculos hay.");
    if (!Number.isInteger(n) || n < CANTIDAD_MIN || n > CANTIDAD_MAX) return rechazar(e, `Entre ${CANTIDAD_MIN} y ${CANTIDAD_MAX} báculos.`);
    if (n === cantidad) return rechazar(e, `Ya hay ${n} báculo(s).`);
    const fallo = guardar({ cantidad: n });
    if (fallo) return rechazar(e, fallo);
    const antes = cantidad;
    cantidad = n;
    for (const k of claves(CANTIDAD_MAX)) { // the extra ones go back (their holders lose them) before they disappear
      const i = Number(k.slice(1)) - 1, v = api.state.get(k);
      if (i >= n && v) { const p = Number(v.portador), persona = p >= 0 ? personaDe(p) : reservas.get(k)?.persona ?? ""; api.state.delete(k); reservas.delete(k); if (persona) conceder(persona); }
    }
    for (const k of claves(n)) { const i = Number(k.slice(1)) - 1, v = api.state.get(k); if (v) poner(k, { ...v, nombre: nombreBaculo(i) }); else poner(k, base(i, LIBRE)); }
    const texto = `${nombreDe(e)} deja ${n} báculo(s) en el mundo (antes ${antes})`;
    api.log(`[baculo] ${texto}`);
    api.emit("cambio", { quien: e, a: -1, cosa: "b1", nombre: nombreBaculo(0), que: "devuelto", texto: cortar(texto, 120) }, { to: e });
  };
  /** The switch (Entorno panel): who directs or rules turns the staffs on or off for the whole world. */
  const encender = (e: number, activa: boolean) => {
    if (!puedeInterruptor(api, e)) return rechazar(e, NO_PUEDE);
    if (activa === encendido) return rechazar(e, activa ? "Los báculos ya están encendidos." : "Los báculos ya están apagados.");
    if (activa) {
      let nuevos = sitios;
      if (!nuevos.length) { // first time, no places defined: beside who turns it on (a pedestal 1.5 m to their side), kept in baculos.json
        const p = api.position(e);
        if (!p) return;
        nuevos = [{ x: Math.round((p.x + 1.5) * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.y * 100) / 100 }];
      }
      const fallo = guardar({ activa: true, cantidad, sitios: nuevos });
      if (fallo) return rechazar(e, fallo);
      sitios = nuevos; encendido = true; montar();
      api.log(`[baculo] ${nombreDe(e)} enciende los báculos: ${cantidad} en ${sitios.length} sitio(s)`);
    } else {
      const fallo = guardar({ activa: false });
      if (fallo) return rechazar(e, fallo);
      for (const k of claves(CANTIDAD_MAX)) if (api.state.get(k) && portadorDe(k) !== LIBRE) volver(k, e, "recuperado"); // the one in a hand goes back to its place first
      encendido = false;
      for (const k of claves(CANTIDAD_MAX)) { reservas.delete(k); api.state.delete(k); }
      api.log(`[baculo] ${nombreDe(e)} apaga los báculos (los sitios se guardan)`);
    }
  };
  api.on("encender", (e, m) => encender(e, m.activa === true));
  vigilarPermiso(api);
  api.on("recuperar", (e) => { if (encendido) recuperar(e); });
  api.on("cantidad", (e, m) => { if (encendido) cambiarCantidad(e, Number(m.n)); });

  // leaving: kept GRACIA_S seconds for the same person (they may come back), then it goes home
  api.onLeave((e) => {
    for (const k of llevaDe(e)) {
      const persona = personaDe(e), i = Number(k.slice(1)) - 1;
      reservas.set(k, { persona, hasta: api.tick() + GRACIA_S * TICKS_POR_S });
      poner(k, base(i, RESERVADO));
      api.log(`[baculo] ${nombreDe(e)} se desconecta: ${nombreBaculo(i)} se le guarda ${GRACIA_S} s`);
      conceder(persona);
    }
    ids.delete(e);
  });
  api.onIdentify((e, who) => {
    ids.set(e, who.id);
    for (const [k, r] of reservas) {
      if (r.persona !== who.id || llevaDe(e).length) continue;
      reservas.delete(k);
      const i = Number(k.slice(1)) - 1, p = api.position(e) ?? sitioDe(i);
      poner(k, base(i, e, p.x, "y" in p ? p.y : 0, p.z));
      api.log(`[baculo] ${who.nombre} vuelve y recupera ${nombreBaculo(i)}`);
      conceder(who.id);
    }
  });
  // every tick: the grace running out; once a second: the staff in a hand follows its holder (so those near see it)
  api.onTick((t) => {
    if (!encendido) return;
    for (const [k, r] of reservas) if (t >= r.hasta) { api.log(`[baculo] se acabó la gracia de ${nombreBaculo(Number(k.slice(1)) - 1)}`); volver(k, null, "devuelto"); }
    if (t % SIGUE_CADA_TICKS !== 0) return;
    for (const k of claves(cantidad)) {
      const v = api.state.get(k), p = v ? Number(v.portador) : LIBRE;
      if (!v || p < 0) continue;
      const pos = api.position(p);
      if (!pos) continue;
      if (Math.hypot(pos.x - Number(v.x), pos.z - Number(v.z)) > 1) poner(k, { ...v, x: pos.x, y: pos.y, z: pos.z });
    }
  });
  // someone was thrown out or banned by a moderator (roles): they lose it at once
  api.listen("roles", "echado", (m) => {
    const persona = String(m.persona ?? "");
    for (const k of claves(cantidad)) {
      const p = portadorDe(k);
      if ((p >= 0 && personaDe(p) === persona) || reservas.get(k)?.persona === persona) volver(k, null, "devuelto");
    }
    return true;
  });

  // the chat (any device with a keyboard, VR included): /baculo soltar · pasar <nombre> · recuperar · /baculos <n>
  api.listen("chat", "orden", (m) => {
    const texto = String(m.texto ?? "").trim(), e = Number(m.quien);
    const partes = texto.split(/\s+/), palabra = (partes[0] ?? "").toLowerCase();
    if (palabra !== "baculo" && palabra !== "báculo" && palabra !== "baculos" && palabra !== "báculos") return false;
    if (!encendido) { rechazar(e, "Los báculos están apagados en este mundo (quien dirige los enciende en Entorno)."); return true; }
    const sub = (partes[1] ?? "").toLowerCase(), resto = partes.slice(2).join(" ");
    if (palabra.startsWith("bácul") || palabra.startsWith("bacul")) {
      if (palabra.endsWith("s")) { // /baculos <n>
        const n = Number(partes[1]);
        if (partes.length < 2 || !Number.isFinite(n)) { rechazar(e, `Hay ${cantidad} báculo(s). Quien manda escribe /baculos 1 a ${CANTIDAD_MAX} para cambiarlo.`); return true; }
        cambiarCantidad(e, n); return true;
      }
      if (sub === "soltar") { const mio = llevaDe(e)[0]; if (!mio) rechazar(e, "No llevas ningún báculo."); else volver(mio, e, "soltado"); return true; }
      if (sub === "pasar") { pasarA(e, resto); return true; }
      if (sub === "recuperar") { recuperar(e); return true; }
    }
    rechazar(e, "Uso: /baculo soltar · /baculo pasar <nombre> · /baculo recuperar (quien manda) · /baculos <1–5> (quien manda). Para cogerlo, E a su lado.");
    return true;
  });
});

export default crearBaculo();
