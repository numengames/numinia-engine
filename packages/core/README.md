# core

Q16.16 fixed point, seeded RNG (xorshift), FNV-1a hash, `Result`/`Issue` types.

- **Does not:** Anything with floats that decides game state; no dependencies at all.
- **Depends on:** nothing (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`
- **Main API:** `fx`, `fxMul`, `fxDiv`, `fxSqrt`, `rngNext`, `fnv1a`, `hex`, `Result`
