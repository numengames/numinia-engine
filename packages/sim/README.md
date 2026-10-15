# sim

Deterministic 20 Hz step over integers: avatars, movement (walk 4 m/s, run 8 m/s), height (J2: gravity 20 m/s², jump 1.5 m, one more jump in the air, a 150 ms jump buffer; ground from `groundHeight(x, z)`, which M6 replaces), snapshot, state hash, replay, the reference fingerprint (`93b192c8`, sim format 2).

- **Does not:** `Math.sin/cos/exp`, `Math.random`, `Date`; no I/O. Changing the reference fingerprint is a FORMAT CHANGE (see AGENTS.md).
- **Depends on:** core, schema, ecs (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts` (pins the fingerprint), `test/salto.test.ts` (J2)
- **Main API:** `createSim`, `spawnAvatar`, `step` (inputs `[entity, mx, mz, buttons]`, `INPUT_STRIDE`; an avatar advances only on its own input), `BTN_JUMP` (pressed since the last input) / `BTN_RUN` (held), `getBody`/`setBody`/`sameBody` (the whole state that decides the next step), `groundHeight`, `snapshot`, `stateHash`, `replay`, `replayFingerprint`, `REFERENCE`
