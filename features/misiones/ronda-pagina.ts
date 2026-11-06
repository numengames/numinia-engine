// misiones — P16: the page side of a person's round (pnj@1 `posiciones[].ronda`). The page loads this file (and the maths in ronda.ts) as a
// chunk of its own when the first `ronda` event comes: a world with no round never fetches it. Each frame it matters, it asks the same pure
// function the server asks (`rondaEn`) where she is, and draws her there.
import type { ClientApi, Msg } from "../../packages/feature/src/index.ts";
import { compilar, deTexto, nuevaPose, rondaEn } from "./ronda.ts";
import type { Plan, PoseRonda } from "./ronda.ts";

/** While she walks her round, the page's range checks and map are told her place every this many metres. */
const LUGAR_CADA_M = 0.4;

/** A person on a round for THIS player. `puesto` = the pose last drawn; `despierta` = page ms before which nothing can change (she stands,
 * or is stopped to talk); `lx`, `lz` = the place last told to the range checks. */
type RondaVista = { plan: Plan; ancla: number; congelada: number | null; pose: PoseRonda; puesto: PoseRonda | null; despierta: number; lx: number; lz: number };

/** What the page gives the rounds: its clock, the places it keeps for people, how to draw one, and whether a sequence owns her body now. */
export type EntornoRondas = { reloj: () => number; sitios: Map<string, { x: number; z: number; y: number; giro: number }>; dibujar: (a: ClientApi, key: string, v: Msg) => void; secuencia: (key: string) => boolean };

export function crearRondas(env: EntornoRondas) {
  const { reloj, sitios } = env;
  const rondas = new Map<string, RondaVista>();
  /** Where she is on her round now, drawn if that changed since the last time (and, every ~0.4 m she walks or when she stops, told to the
   * page's range checks and map). True while she is walking. Nothing is computed for a person who stands until her pause ends. */
  const poner = (a: ClientApi, key: string): boolean => {
    const r = rondas.get(key), v = a.state.get(key);
    if (!r || !v) return false;
    if (env.secuencia(key)) { r.puesto = null; return false; } // a sequence owns her body meanwhile
    const ahora = reloj();
    if (r.puesto && ahora < r.despierta) return false;
    const p = rondaEn(r.plan, r.congelada ?? ahora - r.ancla, r.pose);
    r.despierta = r.congelada !== null ? Infinity : p.andando ? 0 : ahora + p.resto * 1000;
    const q = r.puesto;
    if (q && q.x === p.x && q.z === p.z && q.y === p.y && q.giro === p.giro && q.andando === p.andando) return p.andando;
    const cambioEstado = !q || q.andando !== p.andando;
    r.puesto = q ? Object.assign(q, p) : { ...p };
    sitios.set(key, { x: p.x, z: p.z, y: p.y, giro: p.giro });
    if (!(Math.hypot(p.x - r.lx, p.z - r.lz) < LUGAR_CADA_M) || (!p.andando && cambioEstado)) { r.lx = p.x; r.lz = p.z; a.lugar(key, { x: p.x, z: p.z, y: p.y }); }
    env.dibujar(a, key, v);
    return p.andando;
  };
  return {
    /** The `ronda` event: the round she walks for me; right after the `sitio` that says where she is in it now. */
    recibir(a: ClientApi, m: Msg): void {
      const key = String(m.pnj), puntos = deTexto(String(m.puntos ?? ""));
      if (!puntos) return;
      const plan = compilar({ puntos, velocidad: Number(m.vel) || 1.1, modo: m.ida === true ? "ida_y_vuelta" : "vuelta" }, Number(m.giro) || 0), rt = (Number(m.rt) || 0) * 1000;
      const t = sitios.get(key);
      rondas.set(key, { plan, ancla: reloj() - rt, congelada: m.quieta === true ? rt : null, pose: nuevaPose(), puesto: null, despierta: 0, lx: t?.x ?? Number.NaN, lz: t?.z ?? Number.NaN });
      poner(a, key);
    },
    /** A new `sitio` for her: the round she had ends (a `ronda` after it brings her back). Returns where she was drawn, if on a round. */
    termina(key: string): PoseRonda | null { const era = rondas.get(key)?.puesto ?? null; rondas.delete(key); return era; },
    /** Once per frame: put every person on a round where she is. True while any walks. */
    cuadro(a: ClientApi): boolean { let andan = false; for (const k of rondas.keys()) if (poner(a, k)) andan = true; return andan; },
    /** Is she walking her round as last drawn? (undefined = no round for you) */
    andando: (key: string): boolean | undefined => rondas.get(key)?.puesto?.andando,
    /** A person on a round, as this page has her now (null = no round for you): where she is, whether she walks or is stopped to talk. */
    de(pnj: string): { x: number; z: number; y: number; giro: number; andando: boolean; quieta: boolean; ciclo: number } | null {
      const r = rondas.get(pnj);
      if (!r) return null;
      const p = rondaEn(r.plan, r.congelada ?? reloj() - r.ancla);
      return { x: p.x, z: p.z, y: p.y, giro: p.giro, andando: p.andando && r.congelada === null, quieta: r.congelada !== null, ciclo: Math.round(r.plan.ciclo * 1000) / 1000 };
    },
  };
}
