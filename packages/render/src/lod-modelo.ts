// lod-modelo (H13): which file of a model the page loads, by how far the thing is — pure, so it is tested without a GPU.
// The server makes two lighter versions of a heavy still model when it comes in (packages/server/src/lod.ts) and lists them in
// the manifest. A thing that is far when its turn to load comes (carga-orden.ts rank 2: beyond LEJOS_M, which the loading
// screen does not count) takes the lighter file; when you come near it, the whole model is loaded and swapped in place.
import { LEJOS_M } from "./carga-orden.ts";

/** Beyond this (m, on the ground) the second, lightest level is loaded; between LEJOS_M and here, the first. */
export const LOD2_M = 160;
/** A thing loaded as a level swaps to the whole model when you are within LEJOS_M minus this (so the whole one is in before it counts as near). */
export const MEJORAR_ANTES_M = 10;

/** A distance is known only once the page has your position (the first snapshot); until then it is `null` — never 0, which would read as "standing on it". */
export type DistanciaM = number | null;
const conocida = (d: DistanciaM): d is number => d !== null && Number.isFinite(d);

/**
 * The level (0 = the whole model) to load for a thing at `distancia` m with `niveles` levels available. While the distance is
 * unknown the lightest level is taken (a cheap first paint; the loading screen counts it ready), and `debeMejorar` swaps the whole
 * model in once the position says the thing is near.
 */
export function nivelParaCargar(distancia: DistanciaM, niveles: number): number {
  if (!(niveles > 0)) return 0;
  if (!conocida(distancia)) return Math.min(niveles, 2);
  if (distancia <= LEJOS_M) return 0;
  return Math.min(niveles, distancia > LOD2_M ? 2 : 1);
}

/** Should a thing drawn from level `nivel` (> 0) now load the whole model? Never while the distance is unknown. */
export function debeMejorar(distancia: DistanciaM, nivel: number): boolean {
  return nivel > 0 && conocida(distancia) && distancia < LEJOS_M - MEJORAR_ANTES_M;
}

/** The file name of a level: `<sha>.glb` → `<sha>.lod1.glb` (nivel 0 = the same name). */
export function ficheroDeNivel(modelo: string, nivel: number): string {
  return nivel > 0 ? modelo.replace(/\.glb$/, `.lod${nivel}.glb`) : modelo;
}
