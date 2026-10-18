# Determinism contract

**Deterministic (same bits on every machine):** everything in `packages/sim`: tick counter, RNG
state, entity allocation, Transform columns (x, y, z), Motion columns (vertical speed, air jump, jump
buffer), the state fingerprint (`stateHash`, FNV-1a 32 over the canonical snapshot bytes).

**How:** Q16.16 fixed point (`fxMul` is exact, tested against BigInt), integer RNG (mulberry32 on a
`Uint32Array` inside the state), ascending-id iteration, inputs re-sorted by entity inside `step`.
Constants that come from decimals (`fx(0.05)`, `fx(1.5)`) are rounded once from exact binary products;
the jump speed is an integer square root (`fxSqrt`), never `Math.sqrt` in a decision.

**One input = one step of that avatar (J2).** An avatar advances only when one of its inputs is applied:
the horizontal move AND gravity. A tick in which the server got nothing from a player leaves that avatar
exactly where it was (mid-air included), so the player's prediction — one local step per input sent —
stays exact however the network bunches or delays inputs. Ground height comes from one function,
`groundHeight(x, z)` (0 everywhere for now): M6 replaces it.

**Format versions.** The sim format is the layout of the state and of the inputs `[entity, mx, mz,
buttons]` (`INPUT_STRIDE` 4); the wire format is `WIRE_FORMAT` in `net` (sent at the end of WELCOME).

| Version | Since | Reference fingerprint (`REFERENCE`: seed 1234, 10,000 ticks, 20 avatars) |
|---|---|---|
| sim 1 · wire 1 | PP0 | `fa94375e` (x, z only) |
| sim 2 · wire 2 | J2 | `93b192c8` (height, vertical speed, jump in the air, jump buffer, running; the reference run presses jump 1 tick in 16 and runs half the time) |
The fingerprint is pinned in `test/engine.test.ts` and `test/server.test.ts` (`/health`).

**World geometry (M6):** solid boxes (`solids`) and the collision mesh (`mesh`, an integer BVH in
`packages/sim/src/bvh.ts` built from triangles quantized to 1/64 m) are NOT in the state fingerprint: both sides
build them from the same shared state and the same GLB, and `bvhFingerprint` (FNV-1a over the flat tree) checks
they built the same tree. The ray (`rayBvh`, Möller–Trumbore on integers, one IEEE division for `t`) gives the same
hit on every engine; `test/bvh.test.ts` compares Node and Chromium. The reference run has no solids and no mesh, so
neither is ever consulted there and its fingerprint stands.

**Not deterministic, and allowed to be:** the area of interest in `net` (decides what is SENT, never
game state), timing measurements in `cli`, anything a renderer does. These must never write into
the sim state.

**Coming (PP1–PP2):** browser vs Node identical fingerprints over 10,000 ticks; deterministic
physics (Rapier deterministic build) with its own documented list of non-deterministic surfaces.
