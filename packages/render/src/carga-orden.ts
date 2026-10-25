// carga-orden (N22): in which order a world's files download, so a phone on 4G sees where it stands first.
//   0  the room: pinned or backdrop things (the hall you stand in, its walls and columns), wherever their origin is
//   1  what is near (LEJOS_M around you)
//   2  what is far: it starts only when nothing of 0-1 is still waiting or downloading
// Within a rank, the nearest first (the view's pump). Pure, so it is tested without a GPU (test/carga-rapida.test.ts).

/** Farther than this (m, on the ground), a thing waits for the near ones. Twice the view's animation distance. */
export const LEJOS_M = 80;

/** The rank of a thing (0 room, 1 near, 2 far) given its squared ground distance to you. */
export function ordenCarga(t: { sala?: boolean }, distancia2: number): 0 | 1 | 2 {
  if (t.sala) return 0;
  return distancia2 <= LEJOS_M * LEJOS_M ? 1 : 2;
}

/** May a far thing start now? Only when nothing near is downloading or waiting. */
export function puedeEmpezar(cercaCargando: number, quedanCerca: boolean): boolean {
  return cercaCargando === 0 && !quedanCerca;
}

/** What the loading screen needs to know about one placed thing (C). */
export type PiezaCarga = { key: string; kind?: string; hidden?: boolean; sala?: boolean; distancia2: number; loaded: boolean; failed: boolean };

/**
 * C: the pieces the loading screen waits for. Counted: the room and what is near (ordenCarga < 2) — what proximity loading defers
 * (rank 2) is NOT, or the screen would wait for what the pump deliberately holds back. Not counted: the page's previews (`~` keys),
 * sounds and hidden things (nothing to see). A failed piece counts as ready (it will not come, and must not trap the player).
 */
export function contarPiezas(cosas: Iterable<PiezaCarga>, verOcultos = false): { total: number; listas: number; fallidas: number } {
  let total = 0, listas = 0, fallidas = 0;
  for (const c of cosas) {
    if (c.key.startsWith("~") || c.kind === "sonido" || (c.hidden && !verOcultos)) continue;
    if (ordenCarga(c, c.distancia2) >= 2) continue;
    total++;
    if (c.failed) { fallidas++; listas++; } else if (c.loaded) listas++;
  }
  return { total, listas, fallidas };
}
