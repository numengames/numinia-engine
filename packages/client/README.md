# client

Session on the player's side: prediction of the own avatar, interpolation of others (150 ms in the past), reconnection to the server URL.

- **Does not:** Drawing; it never touches three.js or the DOM beyond a location object.
- **Depends on:** core, schema, ecs, sim, net, feature (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`; browser: `tools/auto.sh e2e`
- **Main API:** `ClientSession`, `serverUrl`, `INTERP_TICKS`
- **The map's arithmetic (J5, `src/mapa.ts`, pure, `test/mapa.test.ts`):** `proyectar`/`desproyectar` (north-up or turned), `rumbo`/`enPalabras` («al noreste, a 23 m»), `lado`, `crearLimitador` (redraw only on change, ≤ 5/s), `crearRegistro` (marker kinds; card roles → kinds), `reunir` (sources), `cercanos` (the HTML twin's rows), `firma`.
