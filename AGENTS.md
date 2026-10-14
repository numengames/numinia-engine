# AGENTS.md — binding rules for any agent (human or AI) working in this repository

This file is the single source of truth. `CLAUDE.md` and similar files only point here.

## What this is
`numinia-engine` (working name): a thin MIT web 3D/XR engine in TypeScript. The engine does not know
what Numinia is: it draws, syncs, simulates and loads data. Game/city logic lives elsewhere (AGPL).

## Layers (enforced by `tools/layers.mjs`, rules in `tools/layers.json`)
`core → schema → ecs → sim → net → instance → cli`. A package imports only layers below it.
Adding a package means adding it to `layers.json` first.

## Determinism contract (see `docs/DETERMINISM.md`)
- `sim` decides with integers / Q16.16 fixed point only (`core`). No `Math.sin/cos/exp`, no
  `Math.random`, no `Date`, no iterating `Map`/`Set` to decide anything.
- Randomness comes from the RNG state stored inside the sim state.
- Every change to `sim` must keep `npm test` determinism tests green; a changed fingerprint for the
  same recording is a format change and needs an ADR.

## Gates (run `npm run gates` before proposing any change)
| Gate | Budget | Cost |
|---|---|---|
| unit tests | all green | < 1 s |
| layers | 0 violations | < 0.1 s |
| determinism | same seed → same hash | ~1.5 s |
| bandwidth K=50 @10 Hz | ≤ 70 kbit/s per client | free (reuses the run) |
| plaza of 1,000 (warning until PP2) | tick p99 ≤ 50 ms | ~3 s |

Keep gates light: seconds, one core. Never add a gate that needs a GPU or an LLM to the default run.

## Style
Boring code over clever code. Node ≥ 24 runs the `.ts` files directly (type stripping): use only
erasable TypeScript (no `enum`, no `namespace`, no constructor parameter properties) and import
with the `.ts` extension. Validation returns `Result` with error paths; it never throws.

## Autonomy
Until the engine is declared stable, an agent proposes and a person approves. Never push, never
open a PR, never change the wire or file format without explicit human approval.
