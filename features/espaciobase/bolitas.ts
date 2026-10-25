// espacio-base (H7): the moñoni — the RICH bolita of Alchemist Towers (work/ayuntamiento/bolita.mjs; own work, CC0 1.0 declared inside each .glb) — born near the spawn. Pure numbers.
// Pablo (20-10): ONE moñoni by default, «mucho más simpática»: the town hall's fluffy ball (1.246 triangles, 3 materials, two big eyes in the BODY file) plus its
// smile as a SECOND piece (bolita-rica-boca, 2 materials) that shares the body's origin, so both are planted with the same pose. `agentes` still goes 0…5 for a
// world that wants more. They are ordinary static objects planted OFF (they do not talk): turning one ON is the agents' own route (packages/agent: a `habitante@1`
// file named like the body object, «Moñoni 1»). Nothing here costs money, and nothing is fetched until the page sees the objects (lazy, like the logo).
// Colour, place and shape come from the world's `semilla` only (same seed = same moñoni): 3–4 m in front of the spawn (the first camera looks along −z), inside the 26 m
// flat plateau, off to one side so the logo (LOGO, (0, 1.38, −8), 2.5 m wide) stays in view behind it, and turned to face the spawn.
import { semillaEntera, type SemillaBase } from "../../packages/relieve/src/espacio-base.ts";
import { LOGO } from "./logo.ts";
import { AGENTES_MAX } from "./esquema.ts";
import type { Sembrado } from "../objetos/server.ts";

/** The 5 light colours of bolita.mjs's COLORES (STD-023 palette), in its order; each is a library id `bolita-rica-<color>` (the body). Its 3 dark ones (granahonda, bronce,
 * turquesahonda) are left out: on the espacio base's night they photograph as black blobs (H6 photo). The smile is `bolita-rica-boca`, one file for every colour. */
export const COLORES_BOLITA = ["ambar", "turquesa", "coral", "verde", "verdemar"] as const;
export const BOCA = "bolita-rica-boca";
/** The body spans y −0.235…0.219 at scale 1 and x ±0.22 (measured from the .glb); at scale 2.8 it is about 1.2 m across (the hairs make it read bigger). It floats 0.2 m over the ground. */
const BAJO = 0.235, FLOTA = 0.2, ESCALA = 2.8;

/** mulberry32, the house's tiny seeded random (same as the town hall's `azar`). */
const azar = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** `n` (0…5) moñonis for this seed, as things to plant: for each, its body ("Moñoni <i>") then its smile ("Moñoni <i> boca") with the SAME pose. Deterministic; positions
 * are 3–4 m from the spawn (the first one; the others 3–8 m), at least 1.8 m apart and 3 m from the logo. */
export function bolitas(semilla: SemillaBase, n: number): Sembrado[] {
  const cuantas = Math.max(0, Math.min(AGENTES_MAX, Math.floor(n)));
  const rnd = azar(semillaEntera(semilla) ^ 0x6d0f0171);
  const colores = [...COLORES_BOLITA];
  for (let i = colores.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [colores[i], colores[j]] = [colores[j], colores[i]]; } // a shuffle: no repeated colour
  const puestos: { x: number; z: number }[] = [], fuera: Sembrado[] = [];
  for (let i = 0; i < cuantas; i++) {
    let p = { x: 0, z: 0 }, bien = false;
    for (let intento = 0; intento < 60 && !bien; intento++) {
      const lado = i === 0 ? (rnd() < 0.5 ? -1 : 1) : 0;
      const a = i === 0 ? lado * (0.3 + rnd() * 0.35) : (rnd() * 2 - 1) * 1.35;  // the first: 17…37° off to one side of straight ahead (−z), so the logo shows beside it
      const r = i === 0 ? 3 + rnd() : 3 + rnd() * 5;
      p = { x: Math.sin(a) * r, z: -Math.cos(a) * r };
      bien = Math.hypot(p.x, p.z) >= 2.5 && Math.hypot(p.x - LOGO.x, p.z - LOGO.z) >= 3 && puestos.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= 1.8);
    }
    if (!bien) p = { x: -4 + 2 * i, z: -3 };                                  // never reached in practice; a fixed row keeps it total
    puestos.push(p);
    const escala = i === 0 ? ESCALA : 1.6 + rnd() * 0.5;
    const ry = Math.round((Math.atan2(-p.x, -p.z) * 180) / Math.PI + (rnd() * 2 - 1) * 8); // the face (+z in the model) turned to the spawn, ±8°
    const pose = { x: p.x, y: BAJO * escala + FLOTA, z: p.z, ry, escala };
    fuera.push({ modelo: `bolita-rica-${colores[i]}`, nombre: `Moñoni ${i + 1}`, ...pose }, { modelo: BOCA, nombre: `Moñoni ${i + 1} boca`, ...pose });
  }
  return fuera;
}

/** The farthest a moñoni can be from the spawn (8 m out, plus the ball): well inside the 26 m plateau (a test checks). */
export const MAX_RADIO = 8.5;

/** Lote 5 («los moñoñis reaccionan al clic»): the ids of every piece of the moñoni that `id` belongs to — its body ("Moñoni 2") and its
 * smile ("Moñoni 2 boca") are two objects, and a click on either must make BOTH hop. Empty when `id` is not a moñoni (by its name). */
export function piezasDeMoñoni(id: string, objetos: readonly { id: string; nombre?: unknown }[]): string[] {
  const nombre = String(objetos.find((o) => o.id === id)?.nombre ?? ""), m = /^Moñoni (\d+)( boca)?$/.exec(nombre);
  if (!m) return [];
  const cuerpo = `Moñoni ${m[1]}`, boca = `${cuerpo} boca`;
  return objetos.filter((o) => o.nombre === cuerpo || o.nombre === boca).map((o) => o.id);
}
