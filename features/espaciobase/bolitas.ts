// espacio-base (H6): the moñonis — the little round agents of Alchemist Towers («bolitas» in work/ayuntamiento) — born near the spawn. Pure numbers.
// DEFINITION REUSED, not invented: the model is the town hall's `bolita-gemelo.mjs` (F5c): a low-poly ball (icosahedron + a few bumps), ONE material,
// no texture, 160 triangles, 12 kB, in the house palette (STD-023); 5 of the 8 colours of its COLORES list, one .glb each (activos/bolitas/, biblioteca.json
// `bolita-<color>`, CC0). They are planted OFF (apagados): ordinary static objects that do not talk. Turning one ON is the agents' own route
// (packages/agent: a `habitante@1` file under the world's aventura/habitantes/ named like the object) — no brain lives here, and nothing here costs money.
// The colours, the places and the shapes come from the world's `semilla` only (same seed = same moñonis), inside the 26 m flat plateau, in front of the
// first camera (which looks along −z), and clear of the logo (LOGO, (0, 1.38, −8), 2.5 m wide) and of the spawn itself.
import { semillaEntera, type SemillaBase } from "../../packages/relieve/src/espacio-base.ts";
import { LOGO } from "./logo.ts";
import { AGENTES_MAX } from "./esquema.ts";
import type { Sembrado } from "../objetos/server.ts";

/** The 5 light colours of bolita-gemelo.mjs's COLORES (STD-023 palette), in its order; each is a library id `bolita-<color>`. Its 3 dark ones (granahonda, bronce,
 * turquesahonda) are left out: on the espacio base's night they photograph as black blobs (H6 photo). 5 colours = the 5 moñonis never repeat a colour. */
export const COLORES_BOLITA = ["ambar", "turquesa", "coral", "verde", "verdemar"] as const;
/** The ball spans x ±0.19, y −0.146…0.19 at scale 1 (measured from the .glb); at 1.6–2.2 it is about 0.6–0.8 m across. */
const BAJO = 0.1455, FLOTA = 0.35;

/** mulberry32, the house's tiny seeded random (same as the town hall's `azar`). */
const azar = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** `n` (0…5) moñonis for this seed, as things to plant. Deterministic; positions are at least 1.8 m apart, 2.5 m from the spawn, 3 m from the logo. */
export function bolitas(semilla: SemillaBase, n: number): Sembrado[] {
  const cuantas = Math.max(0, Math.min(AGENTES_MAX, Math.floor(n)));
  const rnd = azar(semillaEntera(semilla) ^ 0x6d0f0171);
  const colores = [...COLORES_BOLITA];
  for (let i = colores.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [colores[i], colores[j]] = [colores[j], colores[i]]; } // a shuffle: no repeated colour
  const puestos: { x: number; z: number }[] = [], fuera: Sembrado[] = [];
  for (let i = 0; i < cuantas; i++) {
    let p = { x: 0, z: 0 }, bien = false;
    for (let intento = 0; intento < 60 && !bien; intento++) {
      const a = (rnd() * 2 - 1) * 1.35, r = 3 + rnd() * 5;                    // ±77° around straight ahead (−z), 3…8 m out
      p = { x: Math.sin(a) * r, z: -Math.cos(a) * r };
      bien = Math.hypot(p.x, p.z) >= 2.5 && Math.hypot(p.x - LOGO.x, p.z - LOGO.z) >= 3 && puestos.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= 1.8);
    }
    if (!bien) p = { x: -4 + 2 * i, z: -3 };                                  // never reached in practice; a fixed row keeps it total
    puestos.push(p);
    const escala = 1.6 + rnd() * 0.6;
    fuera.push({
      modelo: `bolita-${colores[i]}`, nombre: `Moñoni ${i + 1}`, x: p.x, y: BAJO * escala + FLOTA, z: p.z, ry: rnd() * 360 - 180, escala,
      forma: [0.95 + rnd() * 0.12, 0.95 + rnd() * 0.12, 0.95 + rnd() * 0.12],   // the town hall's own slight squash (sx 0.99, sy 1.02)
    });
  }
  return fuera;
}

/** The farthest a moñoni can be from the spawn (8 m out, plus the ball): well inside the 26 m plateau (a test checks). */
export const MAX_RADIO = 8.5;
