// botones — server part (v1, J4). The server owns the press: counts it, lights the button LUZ_TICKS, tells the near
// ones, and emits `senal` with scope "server" so features/puertas (or any other) can act. No page decides anything.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { botones, CERCA_M, LUZ_TICKS } from "./feature.ts";
export type Boton = { id: string; nombre: string; x: number; z: number; y?: number; radio?: number; puerta?: string };
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,15}$/;
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const entre = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

export function leerBoton(b: unknown): Boton | string {
  const o = (b ?? {}) as Record<string, unknown>;
  if (!ID_RE.test(String(o.id))) return `id «${String(o.id).slice(0, 16)}»: minúsculas, cifras y guiones, hasta 16`;
  if (!Number.isFinite(Number(o.x)) || !Number.isFinite(Number(o.z))) return `«${o.id}»: x y z en metros`;
  if (o.puerta !== undefined && o.puerta !== "" && !ID_RE.test(String(o.puerta))) return `«${o.id}»: puerta debe ser el id de una puerta`;
  return { id: String(o.id), nombre: cortar(String(o.nombre || "Botón"), 60) || "Botón", x: Number(o.x), z: Number(o.z), y: entre(o.y, -100, 500, 0), radio: entre(o.radio, 1, 16, 2), puerta: o.puerta ? String(o.puerta) : "" };
}

export const crearBotones = (opts: { botones?: Boton[] } = {}) => serverPart(botones, (api: ServerApi) => {
  const lista = new Map<string, Boton>();
  const apagados = new Map<string, number>(); // button → tick at which its light goes out
  for (const crudo of opts.botones ?? []) {
    const b = leerBoton(crudo);
    if (typeof b === "string") { api.log(`botones: ${b}: no se pone`); continue; }
    const v: Msg = { nombre: b.nombre, x: b.x, y: b.y, z: b.z, radio: b.radio, pulsado: false, pulsaciones: 0, puerta: b.puerta ?? "" };
    if (api.state.set(b.id, v, { at: { x: b.x, z: b.z } })) lista.set(b.id, b); else api.log(`botones: el botón «${b.id}» no cabe en el esquema y no se pone`);
  }
  if (lista.size) api.log(`botones: ${lista.size} botón(es)`);
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };

  api.on("pulsar", (e, m) => {
    const id = String(m.boton ?? ""), b = lista.get(id), v = api.state.get(id);
    if (!b || !v) return rechazar(e, `No hay ningún botón «${cortar(id, 16)}».`);
    if (!api.within(e, id)) return rechazar(e, `Acércate a ${b.nombre} para pulsarlo.`);
    const n = Number(v.pulsaciones) + 1;
    api.state.set(id, { ...v, pulsado: true, pulsaciones: n }, { at: { x: b.x, z: b.z } });
    apagados.set(id, api.tick() + LUZ_TICKS);
    const texto = cortar(`${nombreDe(e)} pulsa ${b.nombre}`, 120);
    api.emit("pulsado", { quien: e, boton: id, nombre: b.nombre, n, texto }, { near: { x: b.x, z: b.z }, radius: CERCA_M });
    api.emit("senal", { quien: e, boton: id, nombre: b.nombre, puerta: b.puerta ?? "" }, "server");
    api.log(`[botones] ${texto} (${n})`);
  });

  api.onTick((t) => {
    if (!apagados.size) return;
    for (const [id, cuando] of apagados) if (t >= cuando) {
      apagados.delete(id);
      const b = lista.get(id), v = api.state.get(id);
      if (b && v) api.state.set(id, { ...v, pulsado: false }, { at: { x: b.x, z: b.z } });
    }
  });
});

export default crearBotones();
