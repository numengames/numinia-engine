// puertas: the thresholds a load-test level is judged by. House rules (see docs/MEDIDAS.md for where each one comes from).
export const PUERTAS = {
  tickP99Ms: 25,              // tick duration p99: half of the 50 ms tick (same as the plaza gate in tools/gates.mjs)
  respuestaP99Ms: 50,         // lateness + duration p99: the answer of a tick must be ready before the next one is due
  stealMaxPct: 2,             // hypervisor steal: above this the machine is not ours alone and the number is not reliable
  esperaCpuMaxPct: 2,         // main-thread run-queue wait (D3): above this other processes had the server's core; same rule as steal
  generadorBucleP99Ms: 20,    // the bots' own event-loop delay: above a bot tick (50 ms / 2.5) the generator is the bottleneck.
                              // E4: the real delay (bucleRealP99Ms, without the monitor's +10 ms of resolution); before, 20 meant 10
  generadorCpuPct: 85,        // one bot process above this % of a core is saturated
  remojoMBporHora: 5,         // soak: RSS slope above this is flagged as a possible leak
} as const;

/** Why a measurement is of the MACHINE and not of the engine (E7): hypervisor steal or main-thread CPU wait above their
 * gate. Empty = nothing against it on that count. `esperaCpuMaxPct` null = the server did not say (not Linux, older engine). */
export function maquinaNoFiable(s: { stealMaxPct: number; esperaCpuMaxPct: number | null }): string[] {
  const out: string[] = [];
  if (s.stealMaxPct > PUERTAS.stealMaxPct) out.push(`steal ${s.stealMaxPct} % > ${PUERTAS.stealMaxPct} %: la medida es de los vecinos, no del motor`);
  if (s.esperaCpuMaxPct !== null && s.esperaCpuMaxPct > PUERTAS.esperaCpuMaxPct) {
    out.push(`espera de CPU ${s.esperaCpuMaxPct} % > ${PUERTAS.esperaCpuMaxPct} %: el servidor estuvo listo y otro proceso tenía su núcleo; la medida es de la máquina, no del motor`);
  }
  return out;
}
