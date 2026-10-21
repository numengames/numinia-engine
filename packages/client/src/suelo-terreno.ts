// suelo-terreno (avatares/suelo-relieve): the ground the simulation walks on, as the page's avatars need to read it.
// `suelo` = what `step` finds under (x, z) for feet at `y` (collision mesh AND solid boxes, metres); `malla` = the collision mesh
// alone. Both ask the very same `groundHeight` the simulation uses, so «in the air» and «buried» are measured against the real
// floor, hills included. Read only by the view, never called inside `step` (the state fingerprint does not see it).
import { createSim, setMesh, groundHeight, PISO_SIN_SUELO } from "../../sim/src/index.ts";
import type { SimState } from "../../sim/src/index.ts";
import type { Bvh } from "../../sim/src/bvh.ts";

const Q = 65536;
const aFx = (v: number): number => Math.round(v * Q);

/** `local` = the sim that holds the world's solids and mesh (the session's prediction sim); `bvh` = that same collision mesh. */
export function crearSueloTerreno(local: SimState, bvh: Bvh): { suelo: (x: number, z: number, y: number) => number; malla: (x: number, z: number, y: number) => number } {
  const solo = createSim(1, 0);
  setMesh(solo, bvh, PISO_SIN_SUELO);
  return {
    suelo: (x, z, y) => groundHeight(aFx(x), aFx(z), local, aFx(y)) / Q,
    malla: (x, z, y) => groundHeight(aFx(x), aFx(z), solo, aFx(y)) / Q,
  };
}
