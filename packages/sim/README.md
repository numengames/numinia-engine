# sim

Deterministic 20 Hz step over integers: avatars, movement (walk 1.5 m/s, run 4 m/s — human pace, J3; was 4/8), height (J2: gravity 20 m/s², jump 1.5 m, one more jump in the air, a 150 ms jump buffer; ground from `groundHeight(x, z)`, which M6 replaces), snapshot, state hash, replay, the reference fingerprint (`7e630965`, sim format 3).

- **Does not:** `Math.sin/cos/exp`, `Math.random`, `Date`; no I/O. Changing the reference fingerprint is a FORMAT CHANGE (see AGENTS.md).
- **Depends on:** core, schema, ecs (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts` (pins the fingerprint), `test/salto.test.ts` (J2), `test/altura.test.ts` (the spawn area)
- **M6 (`src/bvh.ts`):** `quantizeTriangles(xyz, indices?)` (metres → 1/64 m ints), `buildBvh(tris)` (flat `Int32Array` tree, leaves ≤ 8, 50k triangles in ~10 ms), `rayBvh(b, ox, oy, oz, dx, dy, dz, max)` → `{t, x, y, z, nx, ny, nz, tri}` or null (Q16.16; the normal faces the ray), `bvhFingerprint(b)`; `setMesh(s, bvh | null)` makes the mesh ground for `groundHeight` (ray down from STEP_UP over the feet). Not in the state fingerprint.
- **Main API:** `createSim`, `spawnAvatar(s, owner, area?)` (`SpawnArea` {x, z, radio} = the square people appear in; none = `SPAWN_RADIO_M` 40 m around the origin, the same draws as ever), `step` (inputs `[entity, mx, mz, buttons]`, `INPUT_STRIDE`; an avatar advances only on its own input), `BTN_JUMP` (pressed since the last input) / `BTN_RUN` (held), `getBody`/`setBody`/`sameBody` (the whole state that decides the next step), `groundHeight`, `setSolids`, `setMesh`, `snapshot`, `stateHash`, `replay`, `replayFingerprint`, `REFERENCE`
