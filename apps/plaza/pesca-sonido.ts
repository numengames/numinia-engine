// pesca: what sounds in each phase (VR and flat screen, at the server's moment). The function is PURE —from the previous phase and
// the new one comes the sound id, or nothing— and it sounds through the page's single door (`sonar.ts` → `sonarLocal`: catalogue row,
// file if there is one and `sintesis.ts` recipe if not, bus «efectos»), not through a Web Audio of its own. It is my rod:
// local. The caught fish is heard by those around and the server sends it.
//  · mordisqueo: `pesca-mordisqueo`, a soft, high tick (something brushes the bait)
//  · picada:     `pesca-picada`, the lower double knock that is not mistaken for the tick or for the reel-in
// sonidos.ts already hears the cast and the splash; mordisqueo and picada sound only here.
import { sonar } from "./sonar.ts";

export type Fase = "nada" | "espera" | "mordisqueo" | "picada" | "pelea";

/** Which fishing sound a phase change makes (only mordisqueo and picada; success/failure come from the result, in pesca.ts). */
export function sonidoDeFase(antes: Fase, ahora: Fase): "mordisqueo" | "picada" | null {
  if (antes === ahora) return null;
  return ahora === "mordisqueo" ? "mordisqueo" : ahora === "picada" ? "picada" : null;
}

/** catalogue id of each phase sound */
export const ID: Record<"mordisqueo" | "picada", string> = { mordisqueo: "pesca-mordisqueo", picada: "pesca-picada" };
const GAIN = { mordisqueo: 0.5, picada: 0.8 } as const;

/** Plays what applies when going from `antes` to `ahora`; returns what sounded (the test and the e2e read it). */
export function sonarFase(antes: Fase, ahora: Fase, sonarId: typeof sonar = sonar): "mordisqueo" | "picada" | null {
  const s = sonidoDeFase(antes, ahora);
  if (s) sonarId(ID[s], { gain: GAIN[s] }, 120);
  return s;
}
