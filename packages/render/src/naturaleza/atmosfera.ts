// atmosfera (R7.1): the nature's sky and fog as data, from paleta.ts `ATMOSFERA`. entorno.ts `atmosfera()` draws it (a 4-stop sky dome, a gradient +
// height fog node, Khronos Neutral tone) while the nature is on and gives the world's own back when it goes off. Pure data apart from E04's sky
// function (cielo-analitico.ts), which entorno.ts calls only when the analytic sky is chosen.
// The sources copied (Firewatch ramp per Alisavakis, Sable's layered fog, three r186 Fog.js, Khronos PBR Neutral) are cited where it is drawn: entorno.ts.
import type { Atmosfera } from "../entorno.ts";
import { ATMOSFERA, CIELO_E04 } from "./paleta.ts";
import { cieloAnalitico } from "../cielo-analitico.ts";

/** How high (m above the pond's surface) the hollows' haze reaches, and how thick it is (three's exponentialHeightFogFactor: 1 − e^(−(d·h·z)²),
 *  h = depth under the top, z = view depth). 0.007 → the pond (1.5 m under the top) is ≈ 10 % hazed at 30 m and ≈ 33 % at 60 m: a veil, never a wall. */
export const BRUMA = { sobreAgua: 1.5, densidad: 0.007 } as const;
/** Fog distances (m): thin from 20 m, the sky's own colour at 170 m (the terrain is 200 m wide: its border melts into the sky). A world's fog that
 *  is already nearer wins; a farther one is brought in to these (entorno.ts). */
export const NIEBLA_NATURALEZA = { cerca: 20, lejos: 170 } as const;

/** E04: which sky the nature lays. «r71» = the 4-stop dome (drawn first; baked into a cube on B–D); «analitico» = cielo-analitico.ts (zenith,
 *  pale turquoise, ivory/nacre horizon, twilight, prismatic halo, stars, crescent moon; drawn live and LAST on every tier). The default stays
 *  R7.1 until Pablo picks from the photos (work/saber-3d/queries/e04-cielo-analitico.md): flipping it is this one line. */
export type CieloNaturaleza = "r71" | "analitico";
export const CIELO_NATURALEZA: CieloNaturaleza = "r71";
/** ONE function object: entorno.ts builds the sky's materials once per sky function (a new arrow per call would rebuild them). */
const CIELO_ANALITICO_FN: NonNullable<Atmosfera["cielo"]> = (u) => cieloAnalitico(u as never);

/** The nature's atmosphere for a world whose pond surface is at `nivelAgua` (terreno.ts NIVEL_AGUA). */
export function atmosferaNaturaleza(nivelAgua: number, cielo: CieloNaturaleza = CIELO_NATURALEZA): Atmosfera {
  const a: Atmosfera = {
    dia: { ...ATMOSFERA.dia }, noche: { ...ATMOSFERA.noche }, velo: ATMOSFERA.velo, ocaso: ATMOSFERA.ocaso, sol: ATMOSFERA.sol,
    bruma: { color: ATMOSFERA.bruma, altura: nivelAgua + BRUMA.sobreAgua, densidad: BRUMA.densidad },
    niebla: { ...NIEBLA_NATURALEZA }, tono: "neutro",
  };
  if (cielo !== "analitico") return a;
  // E04: the analytic sky's stops (the fog's far stop takes them too: sky and fog still melt); the veil, the haze, the distances and the tone stay
  return { ...a, dia: { ...CIELO_E04.dia }, noche: { ...CIELO_E04.noche }, ocaso: CIELO_E04.ocaso, sol: CIELO_E04.sol, cielo: CIELO_ANALITICO_FN };
}
