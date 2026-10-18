// puertas: the thresholds a load-test level is judged by. House rules (see docs/MEDIDAS.md for where each one comes from).
export const PUERTAS = {
  tickP99Ms: 25,              // tick duration p99: half of the 50 ms tick (same as the plaza gate in tools/gates.mjs)
  respuestaP99Ms: 50,         // lateness + duration p99: the answer of a tick must be ready before the next one is due
  stealMaxPct: 2,             // hypervisor steal: above this the machine is not ours alone and the number is not reliable
  generadorBucleP99Ms: 20,    // the bots' own event-loop delay: above a bot tick (50 ms / 2.5) the generator is the bottleneck.
                              // E4: the real delay (bucleRealP99Ms, without the monitor's +10 ms of resolution); before, 20 meant 10
  generadorCpuPct: 85,        // one bot process above this % of a core is saturated
  remojoMBporHora: 5,         // soak: RSS slope above this is flagged as a possible leak
} as const;
