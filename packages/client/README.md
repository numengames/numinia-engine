# client

Session on the player's side: prediction of the own avatar (height and jumps included, J2), interpolation of others (150 ms in the past), reconnection to the server URL.
Also the settings registry and the device capabilities (N2): `ajustes.ts` keeps what the person chooses (versioned local
storage, per device or per world), picks defaults by device tier and capability, applies them through functions the page
attaches, and reads a world's JSON; `capacidades.ts` reads what the device can do into one flat object; `ajustes-motor.ts`
lists the engine's own settings. Recipe: `docs/EXTENDER.md` («Añadir un ajuste», «Añadir una capacidad»).

- **Does not:** Drawing; it never touches three.js or the DOM beyond a location object (settings: the page passes the storage and the browser globals).
- **Depends on:** core, schema, ecs, sim, net, feature (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`, `test/salto.test.ts`, `test/ajustes.test.ts`; browser: `tools/auto.sh e2e` (`tools/e2e-piernas/salto.mjs`, `tools/e2e-piernas/ajustes.mjs`)
- **Main API:** `ClientSession` (`tick(mx, mz, buttons?)` with `BTN_JUMP`/`BTN_RUN` from sim; `selfPosition(alpha)` → `{x, y, z, speed, grounded}`; `remotePositions()` → `{id, x, y, z, speed}`: `y` = height of the feet in metres, `speed` = horizontal m/s, ≈4 walking, ≈8 running), `serverUrl`, `INTERP_TICKS`; settings: `crearAjustes` (`declarar`, `aplicarMundo`, `alAplicar`, `aplicarTodo`, `get`, `set`, `forzar`, `restablecer`, `lista`, `grupos`, `alCambiar`), `AJUSTES_MOTOR`, `leerTextoGuardado`; capabilities: `leerNavegador`, `crearCapacidades` (`poner`, `agregar`, `describir`, `alCambiar`), `nivelAparato`
