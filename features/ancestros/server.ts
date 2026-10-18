// ancestros — server part (v1). Puts the hall (solid walls, no name) and the hologram in the shared state, watches who
// is near each hologram (every CADA_TICKS, as quests watch a `llega_a`) to light it for everyone and tell the one who
// came («despierta», only to them), and answers «hablar»: the next of the Three Laws, in turn (1, 2, 3, 1…, per
// hologram: the same for everyone, no randomness), with one of our rules beside it. The page only draws and asks.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { ancestros, CADA_TICKS, CERCA_M, DESPIERTA_M, DUERME_M, HABLAR_M, LEYES, NUESTRAS, SALON } from "./feature.ts";

export type Holograma = { id: string; nombre: string; x: number; z: number; y?: number; rumbo?: number; radio?: number };
export type Muro = { id: string; x0: number; z0: number; x1: number; z1: number; y0?: number; y1?: number };

/** The hologram of the house: Asimov, in the middle of the hall, facing the door (south, +z). */
export const HOLOGRAMAS_DEFECTO: Holograma[] = [{ id: "asimov", nombre: "Holograma de Asimov", x: SALON.x, z: SALON.z - 2, y: 0, rumbo: 0, radio: HABLAR_M }];

/** The four walls of the hall as boxes (m): north, east, west, and the south wall split by the door. */
export function murosDelSalon(s: { x: number; z: number; lado: number; alto: number; grosor: number; puerta: number } = SALON): Muro[] {
  const h = s.lado / 2, g = s.grosor, x0 = s.x - h, x1 = s.x + h, z0 = s.z - h, z1 = s.z + h, p = s.puerta / 2;
  return [
    { id: "norte", x0, z0, x1, z1: z0 + g, y1: s.alto },
    { id: "este", x0: x1 - g, z0, x1, z1, y1: s.alto },
    { id: "oeste", x0, z0, x1: x0 + g, z1, y1: s.alto },
    { id: "sur-oeste", x0, z0: z1 - g, x1: s.x - p, z1, y1: s.alto },
    { id: "sur-este", x0: s.x + p, z0: z1 - g, x1, z1, y1: s.alto },
  ];
}

const ID_OK = /^[a-z0-9-]{1,16}$/;
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
/** Which of our rules goes beside law `ley` (1-3) the `vez`-th time: they rotate, so a visitor who asks four times reads all four. */
export const nuestraDe = (vez: number): { id: string; texto: string } => NUESTRAS[vez % NUESTRAS.length];

export const crearAncestros = (opts: { hologramas?: Holograma[]; muros?: Muro[] } = {}) => serverPart(ancestros, (api: ServerApi) => {
  const hologramas = new Map<string, Holograma>();
  for (const m of opts.muros ?? murosDelSalon()) {
    if (!ID_OK.test(m.id) || !(m.x1 > m.x0 && m.z1 > m.z0)) { api.log(`el muro «${String(m.id).slice(0, 16)}» no tiene una caja válida y no se pone`); continue; }
    const v: Msg = { tipo: "muro", nombre: "", x: (m.x0 + m.x1) / 2, y: m.y0 ?? 0, z: (m.z0 + m.z1) / 2, rumbo: 0, radio: 0, encendido: false,
      solido: true, bx0: m.x0, by0: m.y0 ?? 0, bz0: m.z0, bx1: m.x1, by1: m.y1 ?? SALON.alto, bz1: m.z1 };
    if (!api.state.set(`muro-${m.id}`, v, { at: { x: Number(v.x), z: Number(v.z) } })) api.log(`el muro «${m.id}» no cabe en el esquema y no se pone`);
  }
  for (const h of opts.hologramas ?? HOLOGRAMAS_DEFECTO) {
    if (!ID_OK.test(h.id) || !Number.isFinite(h.x) || !Number.isFinite(h.z)) { api.log(`el holograma «${String(h.id).slice(0, 16)}» no tiene clave o sitio y no se pone`); continue; }
    const v: Msg = { tipo: "holograma", nombre: cortar(h.nombre || "Holograma", 60), x: h.x, y: h.y ?? 0, z: h.z, rumbo: Math.max(-180, Math.min(180, h.rumbo ?? 0)),
      radio: Math.max(0.5, Math.min(16, h.radio ?? HABLAR_M)), encendido: false, solido: false, bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0 };
    if (api.state.set(h.id, v, { at: { x: h.x, z: h.z } })) hologramas.set(h.id, h); else api.log(`el holograma «${h.id}» no cabe en el esquema y no se pone`);
  }
  if (hologramas.size) api.log(`Salón de los Ancestros con ${hologramas.size} holograma(s)`);

  // who is near which hologram now (entity -> keys), with a little hysteresis so a person on the edge does not blink it
  const cerca = new Map<number, Set<string>>();
  const veces = new Map<string, number>(); // how many times each hologram has spoken: picks the law (1, 2, 3, 1…) and our rule
  api.onLeave((e) => { cerca.delete(e); });
  api.onTick((tick) => {
    if (tick % CADA_TICKS !== 0 || hologramas.size === 0) return;
    const jugadores = api.players();
    for (const [id, h] of hologramas) {
      let alguien = false;
      for (const e of jugadores) {
        const p = api.position(e);
        const mios = cerca.get(e) ?? new Set<string>();
        const estaba = mios.has(id);
        const d = p ? Math.hypot(p.x - h.x, p.z - h.z) : Infinity;
        const esta = estaba ? d <= DUERME_M : d <= DESPIERTA_M;
        if (esta && !estaba) { mios.add(id); cerca.set(e, mios); api.emit("despierta", { pnj: id, nombre: String(api.state.get(id)?.nombre ?? "") }, { to: e }); }
        else if (!esta && estaba) mios.delete(id);
        alguien = alguien || esta;
      }
      const v = api.state.get(id);
      if (v && v.encendido !== alguien) api.state.set(id, { ...v, encendido: alguien }, { at: { x: h.x, z: h.z } });
    }
  });

  api.on("hablar", (e, m) => {
    const id = String(m.pnj ?? ""), h = hologramas.get(id);
    if (!h) { api.emit("rechazado", { motivo: `No hay ningún holograma «${cortar(id, 16)}».` }, { to: e }); return; }
    if (!api.within(e, id)) { api.emit("rechazado", { motivo: `Acércate a ${h.nombre} para hablarle.` }, { to: e }); return; }
    const vez = veces.get(id) ?? 0;
    veces.set(id, vez + 1);
    const ley = (vez % LEYES.length) + 1, nuestra = nuestraDe(vez);
    api.emit("dice", { quien: e, pnj: id, x: h.x, z: h.z, ley, texto: cortar(LEYES[ley - 1], 320), regla: nuestra.id, nuestra: cortar(nuestra.texto, 320) }, { near: { x: h.x, z: h.z }, radius: CERCA_M });
    api.log(`${api.who(e)?.nombre ?? `Persona ${e}`} habla con ${id}: ley ${ley} · ${nuestra.id}`);
  });
});

export default crearAncestros();
