# client

Session on the player's side: prediction of the own avatar, interpolation of others (150 ms in the past), reconnection to the server URL.

- **Does not:** Drawing; it never touches three.js or the DOM beyond a location object.
- **Depends on:** core, schema, ecs, sim, net (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`; browser: `tools/auto.sh e2e`
- **Main API:** `ClientSession`, `serverUrl`, `INTERP_TICKS`
