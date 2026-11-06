// derribado — server part (v1, Y45 + Y46 + Y47). The server owns who is down: it hears the fall from lucha (`jugadorCaido`,
// which now says who), and — only if the world has the piece on — puts the person in a table (`derribados`), publishes a card
// for them (`d:<entidad>`, so «E» beside them lifts, and an agent reads it), holds them still (an order of the simulation in
// one-second chunks, renewed every 15 ticks, so a lift frees them within a second) and starts a clock counted in ticks.
// `levantar` (reach through `api.within`, the lifter is not down, no item, no cost) puts them on their feet where they are;
// `rendirse`, or the clock running out, puts them on the world's reappearance spot (`derribado.json` `reaparicion`, or the last
// safe spot the engine knows) — nothing of theirs is touched either way (Y49). No work when nobody is down: the tick hook
// returns at once. No randomness, no wall clock: replayable. The piece is a switch (Entorno): without `derribado.json` it is off
// and lucha behaves exactly as before.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { NO_PUEDE, guardarEnMundo, puedeInterruptor, vigilarPermiso } from "../interruptor.ts";
import type { EntornoMundo } from "../interruptor.ts";
import { derribado, ENFRIAMIENTO_AYUDA_S, QUIETO_TROZO_S, TIEMPO_MAX_S, TIEMPO_MIN_S, TIEMPO_S, VER_M, ALCANCE_LEVANTAR_M } from "./feature.ts";

/** The server's tick rate (Hz): the clock is counted in ticks of it. */
export const HZ = 20;
export type Reaparicion = { x: number; y: number; z: number };
export type Opciones = { activa?: boolean; reaparicion?: Reaparicion | null; seguro?: boolean; tiempoS?: number };
export const FICHERO = "derribado.json", ESQUEMA = "numinia-engine/derribado@1";
const num = (v: unknown): number | null => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : null;
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};

/**
 * `entorno/derribado.json` (numinia-engine/derribado@1): `{ activa?, reaparicion?: { x, y?, z }, muerteSegura?, tiempoS? }`.
 * `reaparicion` = where people come back (absent: the last safe spot); `muerteSegura` (default true) = nothing is lost on a
 * fall; `tiempoS` = seconds down before coming back alone (5–120, default 30). Each wrong field is left out with its reason
 * and how to fix it. null = no file (the piece is off).
 */
export function leerDerribado(crudo: unknown): { valor: Opciones; problemas: string[] } | null {
  if (crudo === undefined || crudo === null) return null;
  const problemas: string[] = [], o = (typeof crudo === "object" && !Array.isArray(crudo) ? crudo : {}) as Record<string, unknown>;
  if (typeof crudo !== "object" || Array.isArray(crudo)) problemas.push("derribado.json debe ser un objeto { activa, reaparicion, muerteSegura, tiempoS }");
  const v: Opciones = { activa: o.activa !== false, reaparicion: null, seguro: true, tiempoS: TIEMPO_S };
  if (o.reaparicion !== undefined) {
    const r = (typeof o.reaparicion === "object" && o.reaparicion !== null ? o.reaparicion : {}) as Record<string, unknown>, x = num(r.x), z = num(r.z), y = r.y === undefined ? 0 : num(r.y);
    if (x === null || z === null || y === null || Math.abs(x) > 2000 || Math.abs(z) > 2000 || y < -100 || y > 500) problemas.push('reaparicion: { "x": metros (±2000), "y": altura de los pies (por defecto 0), "z": metros (±2000) }; sin ella se vuelve al último punto seguro');
    else v.reaparicion = { x, y, z };
  }
  if (o.muerteSegura !== undefined) { if (typeof o.muerteSegura === "boolean") v.seguro = o.muerteSegura; else problemas.push("muerteSegura: true (caer no pierde nada, lo normal) o false (el mundo declara que algo se pierde y lo cuenta en su ficha)"); }
  if (o.tiempoS !== undefined) { const t = num(o.tiempoS); if (t === null || t < TIEMPO_MIN_S || t > TIEMPO_MAX_S) problemas.push(`tiempoS: segundos entre ${TIEMPO_MIN_S} y ${TIEMPO_MAX_S} (por defecto ${TIEMPO_S})`); else v.tiempoS = Math.round(t); }
  return { valor: v, problemas };
}

type Caido = { hasta: number; nombre: string; x: number; y: number; z: number; ayudaDesde: number };

export const crearDerribado = (opts: Opciones | null = null, io?: EntornoMundo) => serverPart(derribado, (api: ServerApi) => {
  // a world without derribado.json has the piece off (cost 0); with it, on unless it says `activa: false`. Without a folder to
  // write, what the switch changed lives in the server's store, so it survives a restart
  const guardado = io?.escribir ? undefined : api.store.get("estado") as { activa?: boolean } | undefined;
  let encendido = guardado?.activa ?? (opts !== null && opts.activa !== false);
  const cfg = { reaparicion: opts?.reaparicion ?? null, seguro: opts?.seguro !== false, tiempoS: opts?.tiempoS ?? TIEMPO_S };
  const caidos = new Map<number, Caido>();
  const clave = (e: number) => `d:${e}`;
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  const cerca = (c: { x: number; z: number }) => ({ near: { x: c.x, z: c.z }, radius: VER_M });
  const quieto = (e: number) => { api.ordenar(e, { quieto: QUIETO_TROZO_S }); };

  /** The person falls (heard from lucha). Ignored when the piece is off or they are already down. */
  const derribar = (e: number) => {
    if (!encendido || caidos.has(e)) return;
    const p = api.position(e);
    if (!p) return;
    const t = api.tick(), c: Caido = { hasta: t + cfg.tiempoS * HZ, nombre: nombreDe(e), x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100, ayudaDesde: 0 };
    caidos.set(e, c);
    api.state.set(clave(e), { nombre: c.nombre, x: c.x, y: c.y, z: c.z, radio: ALCANCE_LEVANTAR_M, seguro: cfg.seguro }, { at: { x: c.x, z: c.z } });
    quieto(e);
    api.emit("derribado", { segundos: cfg.tiempoS, seguro: cfg.seguro }, { to: e });
    api.emit("cae", { quien: e, x: c.x, z: c.z }, cerca(c));
    api.log(`[derribado] ${c.nombre} cae (${cfg.tiempoS} s)`);
  };
  const soltar = (e: number) => { caidos.delete(e); api.state.delete(clave(e)); };

  const levantar = (e: number, k: string) => {
    if (!encendido) return rechazar(e, "El estado derribado está apagado en este mundo.");
    if (caidos.has(e)) return rechazar(e, "Estás derribado: espera a que te levanten, pide ayuda o vuelve al punto de reaparición.");
    const m = /^d:(\d{1,5})$/.exec(k), q = m ? Number(m[1]) : -1, c = caidos.get(q);
    if (!c) return rechazar(e, "Ahí no hay nadie derribado.");
    if (q === e) return rechazar(e, "No puedes levantarte a ti mismo.");
    if (!api.within(e, k)) return rechazar(e, `Acércate a ${c.nombre} para levantarle.`);
    if (api.leyendoNormas(e)) return rechazar(e, "Primero acepta las normas del mundo.");
    soltar(q);
    api.log(`[derribado] ${nombreDe(e)} levanta a ${c.nombre}`);
    api.emit("levanta", { quien: q, por: e }, cerca(c));          // nothing asked, nothing spent: they stand where they are
  };
  /** Back to the world's reappearance spot (time ran out, or they gave up). Nothing of theirs is touched. */
  const reaparecer = (e: number, c: Caido) => {
    soltar(e);
    api.emit("reaparece", { quien: e, seguro: cfg.seguro }, cerca(c));
    if (!api.position(e)) return;
    const r = cfg.reaparicion;
    if (r ? !api.ordenar(e, { poner: { x: r.x, y: r.y, z: r.z } }) : !api.volverASeguro(e)) api.log(`[derribado] ${c.nombre} reaparece donde está: no hay un sitio al que volver`);
    api.log(`[derribado] ${c.nombre} reaparece`);
  };

  api.on("levantar", (e, m) => levantar(e, String(m.cosa ?? "")));
  api.on("pedirAyuda", (e) => {
    const c = caidos.get(e), t = api.tick();
    if (!c) return rechazar(e, "Solo quien está derribado puede pedir ayuda.");
    if (t < c.ayudaDesde) return;                                  // too soon: silent, the button repeats
    c.ayudaDesde = t + ENFRIAMIENTO_AYUDA_S * HZ;
    api.emit("ayuda", { quien: e, x: c.x, z: c.z }, cerca(c));
  });
  api.on("rendirse", (e) => {
    const c = caidos.get(e);
    if (!c) return rechazar(e, "Solo quien está derribado puede volver al punto de reaparición así.");
    reaparecer(e, c);
  });
  api.on("encender", (e, m) => {
    if (!puedeInterruptor(api, e)) return rechazar(e, NO_PUEDE);
    const activa = m.activa === true;
    if (activa === encendido) return rechazar(e, activa ? "El estado derribado ya está encendido." : "El estado derribado ya está apagado.");
    const fallo = guardarEnMundo(io, FICHERO, ESQUEMA, { activa }, api.log);
    if (fallo && fallo !== "sin carpeta") return rechazar(e, fallo);
    if (fallo === "sin carpeta") api.store.set("estado", { activa });
    encendido = activa;
    if (!activa) for (const [q, c] of [...caidos]) { soltar(q); api.emit("levanta", { quien: q, por: q }, cerca(c)); }   // off: everybody stands where they are
    api.log(`[derribado] ${nombreDe(e)} ${activa ? "enciende" : "apaga"} el estado derribado`);
  });
  vigilarPermiso(api);

  // lucha tells us who fell (its `jugadorCaido` carries `quien`); a world without lucha never calls derribar
  api.listen("lucha", "jugadorCaido", (m) => { derribar(Number(m.quien)); return true; });
  api.onLeave((e) => { if (caidos.has(e)) soltar(e); });
  api.onTick((t) => {
    if (caidos.size === 0) return;
    for (const [e, c] of [...caidos]) {
      if (t >= c.hasta) reaparecer(e, c);
      else if (t % 15 === 0) quieto(e);
    }
  });
});

export default crearDerribado();
