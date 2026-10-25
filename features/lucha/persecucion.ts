// lucha — the beast's legs (MIS-245): pure maths, no state, no clock, no PRNG. The server calls `pasoDeCriatura` every
// MOVER_CADA_TICKS ticks for each creature that may move, with where it is, where its home is and who is near; it answers
// where the creature stands next and whether a blow is in reach. Same inputs, same answer (replayable, tested in
// test/lucha-persigue.test.ts). A straight line, no pathfinding (design §1.5): the leash (`correa`) keeps it near home,
// and a creature never walks closer to a person than `parar` so its solid box never lands on top of them.

/** Ticks between two steps of a moving creature: 4 = 5 Hz, enough to walk (8 writes a second at most per creature in alert). */
export const MOVER_CADA_TICKS = 4;
/** A person more than this above or below the creature (m) is on another level: it does not reach for them. */
export const NIVEL_MAX_M = 3;
/** The creature stops this fraction of its blow reach away from the person (their body never ends inside its box). */
export const PARAR_FRACCION = 0.9;

/** What a creature does besides standing: numbers only, read by the server (bestiario.ts) so an agent reads the sheet, not the code. */
export type Conducta = {
  /** Walking speed, m/s (a person walks 1.5, runs 4: a creature under 4 can be outrun). */
  velocidad: number;
  /** It notices a person this close (m, from itself) … */
  vision: number;
  /** … but only while that person is within this distance of its home (m): it «does not chase who leaves the territory». */
  correa: number;
  /** Blow reach, centre to centre (m). */
  alcance: number;
  /** Ticks between two of its blows (20 Hz). */
  enfriamiento: number;
  /** Its blow: `dano` + a roll in 0..variacion-1 (the page's life is 50). */
  dano: number; variacion: number;
};
export type Punto = { x: number; z: number };
export type Paso = { x: number; z: number; modo: "quieta" | "alerta"; objetivo: number | null; alcanza: boolean };

const dist = (a: Punto, b: Punto): number => Math.hypot(a.x - b.x, a.z - b.z);
const redondeo = (n: number): number => Math.round(n * 100) / 100; // the state's step (0.01 m)

/** The person it goes for: the nearest one it sees and that stays inside the leash; ties go to the lowest entity (deterministic). */
export function elegirObjetivo(c: Punto, casa: Punto, k: Conducta, gente: readonly { entidad: number; x: number; z: number }[]): { entidad: number; x: number; z: number } | null {
  let mejor: { entidad: number; x: number; z: number } | null = null, mejorD = Infinity;
  for (const p of gente) {
    const d = dist(c, p);
    if (d > k.vision || dist(casa, p) > k.correa) continue;
    if (d < mejorD || (d === mejorD && mejor && p.entidad < mejor.entidad)) { mejor = p; mejorD = d; }
  }
  return mejor;
}

/** One step. With a target: walk towards it (never closer than `parar`, never farther than one step), alerta; `alcanza` when
 * the blow reaches. Without one: walk home; `quieta` once there. */
export function pasoDeCriatura(c: Punto, casa: Punto, k: Conducta, gente: readonly { entidad: number; x: number; z: number }[], dt: number): Paso {
  const o = elegirObjetivo(c, casa, k, gente), paso = k.velocidad * dt;
  if (o) {
    const d = dist(c, o), parar = k.alcance * PARAR_FRACCION, avanza = Math.max(0, Math.min(paso, d - parar));
    const f = d > 0 ? avanza / d : 0;
    const x = redondeo(c.x + (o.x - c.x) * f), z = redondeo(c.z + (o.z - c.z) * f);
    return { x, z, modo: "alerta", objetivo: o.entidad, alcanza: dist({ x, z }, o) <= k.alcance };
  }
  const d = dist(c, casa);
  if (d <= 0.05) return { x: casa.x, z: casa.z, modo: "quieta", objetivo: null, alcanza: false };
  const f = Math.min(1, paso / d);
  if (f >= 1) return { x: casa.x, z: casa.z, modo: "quieta", objetivo: null, alcanza: false };   // this step gets it home: calm on arrival
  return { x: redondeo(c.x + (casa.x - c.x) * f), z: redondeo(c.z + (casa.z - c.z) * f), modo: "alerta", objetivo: null, alcanza: false };
}

/** The in-between positions a page draws to turn a 5 Hz step into smooth walking (n frames, the last one is `b`). */
export function intermedios(a: Punto, b: Punto, n: number): Punto[] {
  const m = Math.max(1, Math.floor(n));
  return Array.from({ length: m }, (_, i) => i === m - 1 ? { x: b.x, z: b.z } : { x: redondeo(a.x + ((b.x - a.x) * (i + 1)) / m), z: redondeo(a.z + ((b.z - a.z) * (i + 1)) / m) });
}
