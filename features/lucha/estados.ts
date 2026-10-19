// lucha — the player's Estado ladder (PVP/PVE, L8 step 1). A player has NO hit points (canon, D-026/D2): a blow that
// lands raises them one rung of Desestabilizado → Confundido → Colapsado → Aletargado; reaching Aletargado is what
// «dying» means here (the way back is `reaparicion`, never a loss of items). Pure data, server side, no UI: the server
// owns the ladder per player (never the page), and it settles by itself WITHOUT a counter ticking down: each rung is
// forgotten CALMA_TICKS after the last blow and the current rung is computed on read, so a quiet world does no work.
import type { Issue, Result } from "../../packages/core/src/index.ts";

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

// ---- PVP flag (L8 step 3): where may people strike people? entorno.json says it, per world and per zone ----
/** A circle of the world with its own PVP rule: `pvp: true` = an arena, `pvp: false` = a safe place inside an open world. */
export type ZonaPvp = { id: string; x: number; z: number; radio: number; pvp: boolean };
/** The world's rule: `mundo` is the default everywhere; zones override it (a «no» zone beats a «yes» zone, so a safe place stays safe). */
export type Pvp = { mundo: boolean; zonas: ZonaPvp[] };
export const ZONAS_PVP_MAX = 32;

/** May people strike people at (x, z)? Pure; a few circles at most, only asked on a blow between two people. */
export function pvpEn(c: Pvp, x: number, z: number): boolean {
  let si = false;
  for (const q of c.zonas) {
    if (Math.hypot(x - q.x, z - q.z) > q.radio) continue;
    if (!q.pvp) return false;
    si = true;
  }
  return si || c.mundo;
}
/** A blow between two people counts only if BOTH stand where PVP is on (nobody is struck from or into a safe place). */
export const pvpEntre = (c: Pvp, a: { x: number; z: number }, b: { x: number; z: number }): boolean => pvpEn(c, a.x, a.z) && pvpEn(c, b.x, b.z);

/**
 * entorno.json `pvp: true|false` (the world's default; absent = false, nobody strikes anybody) and `zonasPvp: [{ id, x, z,
 * radio, pvp }]`. Server's only (it travels in the world folder and its zip, never on the wire). A wrong zone is left out
 * with its path and how to fix it; a wrong `pvp` leaves the world at false. null when the file says nothing about PVP.
 */
export function leerPvp(json: unknown): Result<Pvp | null> & { parcial?: Pvp } {
  const o = typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  if (o.pvp === undefined && o.zonasPvp === undefined) return { ok: true, value: null };
  const issues: Issue[] = [], c: Pvp = { mundo: false, zonas: [] };
  if (o.pvp !== undefined) { if (typeof o.pvp === "boolean") c.mundo = o.pvp; else issues.push({ path: "entorno.pvp", message: "true (la gente puede golpearse) o false (no): el valor de todo el mundo" }); }
  if (o.zonasPvp !== undefined) {
    if (!Array.isArray(o.zonasPvp)) issues.push({ path: "entorno.zonasPvp", message: `una lista de círculos { "id", "x", "z", "radio", "pvp": true|false } (como mucho ${ZONAS_PVP_MAX})` });
    else o.zonasPvp.slice(0, ZONAS_PVP_MAX).forEach((z, i) => {
      const q = (typeof z === "object" && z !== null ? z : {}) as Record<string, unknown>, ruta = `entorno.zonasPvp[${i}]`;
      const num = (k: string, min: number, max: number) => typeof q[k] === "number" && Number.isFinite(q[k]) && (q[k] as number) >= min && (q[k] as number) <= max;
      if (!num("x", -2000, 2000) || !num("z", -2000, 2000) || !num("radio", 0.5, 2000) || typeof q.pvp !== "boolean") {
        issues.push({ path: ruta, message: `{ "id", "x" (±2000), "z" (±2000), "radio" (0,5–2000 m), "pvp": true|false }` });
        return;
      }
      c.zonas.push({ id: String(q.id ?? i).slice(0, 30), x: q.x as number, z: q.z as number, radio: q.radio as number, pvp: q.pvp });
    });
  }
  return issues.length ? { ok: false, issues, parcial: c } : { ok: true, value: c };
}
