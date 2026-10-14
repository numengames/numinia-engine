# Determinism contract

**Deterministic (same bits on every machine):** everything in `packages/sim`: tick counter, RNG
state, entity allocation, Transform columns, the state fingerprint (`stateHash`, FNV-1a 32 over the
canonical snapshot bytes).

**How:** Q16.16 fixed point (`fxMul` is exact, tested against BigInt), integer RNG (mulberry32 on a
`Uint32Array` inside the state), ascending-id iteration, inputs re-sorted by entity inside `step`.

**Not deterministic, and allowed to be:** the area of interest in `net` (decides what is SENT, never
game state), timing measurements in `cli`, anything a renderer does. These must never write into
the sim state.

**Coming (PP1–PP2):** browser vs Node identical fingerprints over 10,000 ticks; deterministic
physics (Rapier deterministic build) with its own documented list of non-deterministic surfaces.
