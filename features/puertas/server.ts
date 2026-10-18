// puertas — server part (v1, J4). The server owns every door: it flips it on `usar` (after `api.within`), closes it
// alone after `cierraEn` seconds (api.onTick, 20 Hz) and tells whoever is near. A button (features/botones) opens a
// door by name through the server-only event `botones.senal`: no page ever decides a door's state.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { puertas, CERCA_M, CIERRA_MAX_S } from "./feature.ts";

export type Puerta = { id: string; nombre: string; x: number; z: number; y?: number; ry?: number; ancho?: number; alto?: number; radio?: number; cierraEn?: number; abierta?: boolean };
const TICK_HZ = 20;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,15}$/;

export const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const entre = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

/** A door's line as read from the world's file, checked (or why it is left out). */
export function leerPuerta(p: unknown): Puerta | string {
  const o = (p ?? {}) as Record<string, unknown>;
  if (!ID_RE.test(String(o.id))) return `id «${String(o.id).slice(0, 16)}»: minúsculas, cifras y guiones, hasta 16`;
  if (!Number.isFinite(Number(o.x)) || !Number.isFinite(Number(o.z))) return `«${o.id}»: x y z en metros`;
  return { id: String(o.id), nombre: cortar(String(o.nombre || "Puerta"), 60) || "Puerta", x: Number(o.x), z: Number(o.z), y: entre(o.y, -100, 500, 0), ry: entre(o.ry, -180, 180, 0), ancho: entre(o.ancho, 0.5, 6, 1), alto: entre(o.alto, 0.5, 8, 2.2), radio: entre(o.radio, 1, 16, 2.5), cierraEn: Math.round(entre(o.cierraEn, 0, CIERRA_MAX_S, 0)), abierta: o.abierta === true };
}

export const crearPuertas = (opts: { puertas?: Puerta[] } = {}) => serverPart(puertas, (api: ServerApi) => {
  const lista = new Map<string, Puerta>();
  const cierres = new Map<string, number>(); // door → tick at which it closes alone
  for (const crudo of opts.puertas ?? []) {
    const p = leerPuerta(crudo);
    if (typeof p === "string") { api.log(`puertas: ${p}: no se pone`); continue; }
    const v: Msg = { nombre: p.nombre, x: p.x, y: p.y, z: p.z, ry: p.ry, ancho: p.ancho, alto: p.alto, radio: p.radio, abierta: p.abierta === true, cierraEn: p.cierraEn, aviso: p.abierta ? "cerrar" : "abrir" };
    if (api.state.set(p.id, v, { at: { x: p.x, z: p.z } })) lista.set(p.id, p); else api.log(`puertas: la puerta «${p.id}» no cabe en el esquema y no se pone`);
  }
  if (lista.size) api.log(`puertas: ${lista.size} puerta(s)`);
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };

  /** Flip a door (who = 0: nobody, it closed alone or a button did it). Returns how it is now, or null. */
  const poner = (id: string, abierta: boolean, quien: number, por: string): boolean | null => {
    const p = lista.get(id), v = api.state.get(id);
    if (!p || !v) return null;
    if (v.abierta === abierta) return abierta;
    api.state.set(id, { ...v, abierta, aviso: abierta ? "cerrar" : "abrir" }, { at: { x: p.x, z: p.z } });
    if (abierta && p.cierraEn) cierres.set(id, api.tick() + p.cierraEn * TICK_HZ); else cierres.delete(id);
    const texto = cortar(`${por} ${abierta ? "abre" : "cierra"} ${p.nombre}`, 120);
    api.emit("cambio", { quien, puerta: id, nombre: p.nombre, abierta, texto }, { near: { x: p.x, z: p.z }, radius: CERCA_M });
    api.log(`[puertas] ${texto}`);
    return abierta;
  };

  api.on("usar", (e, m) => {
    const id = String(m.puerta ?? ""), p = lista.get(id);
    if (!p) return rechazar(e, `No hay ninguna puerta «${cortar(id, 16)}».`);
    if (!api.within(e, id)) return rechazar(e, `Acércate a ${p.nombre} para ${api.state.get(id)?.abierta ? "cerrarla" : "abrirla"}.`);
    poner(id, !(api.state.get(id)?.abierta === true), e, nombreDe(e));
  });

  // a button whose `puerta` names one of ours: open it (a closed door opens; an open one stays open and its timer restarts)
  api.listen("botones", "senal", (m) => {
    const id = String(m.puerta ?? "");
    if (!id || !lista.has(id)) return false;
    const p = lista.get(id)!;
    if (api.state.get(id)?.abierta === true) { if (p.cierraEn) cierres.set(id, api.tick() + p.cierraEn * TICK_HZ); return true; }
    poner(id, true, 0, String(m.nombre || "Un botón"));
    return true;
  });

  api.onTick((t) => {
    if (!cierres.size) return;
    for (const [id, cuando] of cierres) if (t >= cuando) { cierres.delete(id); poner(id, false, 0, "Sola, se"); }
  });
});

export default crearPuertas();
