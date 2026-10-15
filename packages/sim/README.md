# sim

Deterministic 20 Hz step over integers: avatars, movement, snapshot, state hash, replay, the reference fingerprint.

- **Does not:** `Math.sin/cos/exp`, `Math.random`, `Date`; no I/O. Changing the reference fingerprint is a FORMAT CHANGE (see AGENTS.md).
- **Depends on:** core, schema, ecs (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts` (pins the fingerprint)
- **Main API:** `createSim`, `spawnAvatar`, `step`, `snapshot`, `stateHash`, `replay`, `replayFingerprint`, `REFERENCE`
