// lucha — the player's Estado ladder (PVP/PVE, L8 step 1). A player has NO hit points (canon, D-026/D2): a blow that
// lands raises them one rung of Desestabilizado → Confundido → Colapsado → Aletargado; reaching Aletargado is what
// «dying» means here (the way back is `reaparicion`, never a loss of items). Pure data, server side, no UI: the server
// owns the ladder per player (never the page), and it settles by itself WITHOUT a counter ticking down: each rung is
// forgotten CALMA_TICKS after the last blow and the current rung is computed on read, so a quiet world does no work.
export const ESCALERA = ["ninguno", "desestabilizado", "confundido", "colapsado", "aletargado"] as const;
export type Estado = (typeof ESCALERA)[number];
/** Ticks (20 Hz) of calm after which a player drops one rung: 30 s. Aletargado does not settle by itself (it is left by reappearing). */
export const CALMA_TICKS = 600;
/** The rung from which a player cannot strike («only react», design §1). */
export const NIVEL_COLAPSADO = 3, NIVEL_ALETARGADO = 4;
/** Seconds a person stays still and Aletargado before the server puts them back on their last safe spot (design §1: 10 s). */
export const INCAPACITADO_S = 10;

type Ficha = { nivel: number; desde: number };

/** The ladder of one world: rung per player entity, computed lazily from the tick of the last change. */
export function crearEscalera() {
  const fichas = new Map<number, Ficha>();
  const nivel = (e: number, t: number): number => {
    const f = fichas.get(e);
    if (!f) return 0;
    if (f.nivel >= NIVEL_ALETARGADO) return f.nivel;
    const n = Math.max(0, f.nivel - Math.floor((t - f.desde) / CALMA_TICKS));
    if (n === 0) fichas.delete(e);
    return n;
  };
  return {
    nivel,
    estado: (e: number, t: number): Estado => ESCALERA[nivel(e, t)],
    /** A blow landed on `e` at tick `t`: one rung up (settled rungs forgotten first). Returns the new rung. */
    subir(e: number, t: number): number {
      const n = Math.min(NIVEL_ALETARGADO, nivel(e, t) + 1);
      fichas.set(e, { nivel: n, desde: t });
      return n;
    },
    /** Back to «ninguno» (left the world, or reappeared). */
    reiniciar(e: number): void { fichas.delete(e); },
    get size(): number { return fichas.size; },
  };
}
export type Escalera = ReturnType<typeof crearEscalera>;
