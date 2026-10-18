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
