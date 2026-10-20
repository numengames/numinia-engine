// dardos por equipos — the pure rules of the turn order, with no dartboard inside (so fishing can use the same piece
// later: R-1). Teams are numbered 0..n-1 (the wire says A..D = 1..4 in `turnoEq`, 0 = nobody). Today a team is ONE player;
// pairs come later (design: work/motor-ar/DISENO-DARDOS-EQUIPOS.md). Nothing here touches the server or the network.

/** Teams a board takes by default, and the most a board can be told to take (the wire has the flat fields a, b, c, d). */
export const EQUIPOS_DEFECTO = 2, EQUIPOS_MAX = 4;
/** The longest a visit waits in «retira los dardos» for somebody to press «Cambiar turno» (s): then it changes by itself. */
export const RETIRANDO_S = 12;

/** Teams of a board: an integer in 2..EQUIPOS_MAX, EQUIPOS_DEFECTO when missing or not a number. */
export const equiposDe = (v: unknown): number => (Number.isFinite(Number(v)) && v !== null && v !== "" && v !== undefined ? Math.max(2, Math.min(EQUIPOS_MAX, Math.round(Number(v)))) : EQUIPOS_DEFECTO);

/** The next team to throw after `actual`, skipping teams that left; -1 when nobody is left. */
export function siguienteEquipo(fuera: readonly boolean[], actual: number): number {
  const n = fuera.length;
  for (let k = 1; k <= n; k++) { const i = (actual + k) % n; if (!fuera[i]) return i; }
  return -1;
}

/** The match is over when every team still in has thrown `rondas` visits. */
export const terminada = (visitas: readonly number[], fuera: readonly boolean[], rondas: number): boolean => visitas.every((v, i) => fuera[i] || v >= rondas);

/** The winner by points among the teams still in, or -1 when the best score is shared by two or more. `mejor`/`segundo`: the two top scores. */
export function resultado(puntos: readonly number[], fuera: readonly boolean[] = []): { ganador: number; empate: boolean; mejor: number; segundo: number } {
  const vivos = puntos.map((p, i) => ({ p, i })).filter((x) => !fuera[x.i]);
  const orden = vivos.map((x) => x.p).sort((a, b) => b - a);
  const mejor = orden[0] ?? 0, segundo = orden[1] ?? 0;
  const arriba = vivos.filter((x) => x.p === mejor);
  return arriba.length === 1 ? { ganador: arriba[0].i, empate: false, mejor, segundo } : { ganador: -1, empate: true, mejor, segundo };
}
