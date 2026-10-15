# client

Session on the player's side: prediction of the own avatar (height and jumps included, J2), interpolation of others (150 ms in the past), reconnection to the server URL.

- **Does not:** Drawing; it never touches three.js or the DOM beyond a location object.
- **Depends on:** core, schema, ecs, sim, net, feature (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`, `test/salto.test.ts`; browser: `tools/auto.sh e2e` (`tools/e2e-piernas/salto.mjs`)
- **Main API:** `ClientSession` (`tick(mx, mz, buttons?)` with `BTN_JUMP`/`BTN_RUN` from sim; `selfPosition(alpha)` → `{x, y, z, speed, grounded}`; `remotePositions()` → `{id, x, y, z, speed}`: `y` = height of the feet in metres, `speed` = horizontal m/s, ≈4 walking, ≈8 running), `serverUrl`, `INTERP_TICKS`
