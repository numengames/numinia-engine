# feature

The plug for game features (J7): `defineFeature` (a declaration: intents, events, shared state, each
field described by a schema), the catalog every client receives on join, the schema codec on the wire,
and the two runtimes that host the features: `ServerRuntime` (inside the instance) and `ClientRuntime`
(inside the client session). Accessibility is part of every declaration (V1): `spoken` verbs, `announce`
events, `state.card` things; `announcements`, `cards()` and `view.announce` on the client (a card whose name is empty is decoration and is not listed). Permissions (H1): `api.puede(entity, "construir")` — the server decides (the world's roles, H3; `MOTOR_CONSTRUIR` only seeds a new world). Things with a model: `view.place` / `view.here`. Each state entry is encoded once and resent to whoever enters. How to add a feature: `docs/EXTENDER.md`.
Things used from close by (J4): `state.card.interact` (verb, prompt, reach, key field), checked by `defineFeature`;
`api.within(entity, key)` on the server, `features.reachable(x, z, y?)` / `features.use(feature, key)` on the client,
`view.tag` (a name over a thing). Reach minds the height when the thing's state has a `y`: the player's feet within
`ALCANCE_ALTURA_M` (2.5 m) of it (`alAlcanceEnAltura`); things without `y` are in reach at any height. `api.position`
gives `{ x, y, z }`. An adventure's text files (J5): `api.aventura(carpeta)` (server `AVENTURA_DIR`).

- **Does not:** Know any feature (they live in `features/`), touch the simulation or the fingerprint, draw
  (the page lends it `ViewHooks`), open sockets (the instance and the server carry its bytes).
- **Depends on:** core, schema, net (rule: `tools/layers.json`)
- **Tested by:** `test/feature.test.ts`, `test/accesible.test.ts`, `test/objetos.test.ts`, `tools/e2e.mjs` (gesture and objects legs)
- **Files (H9):** `api.activo(sha256, ext = "glb")` — is there a file `/a/<sha256>.<ext>` on this server (the house
  library or a builder's upload)? Read-only; the composition answers it (`InstanceOptions.activo`). Tested by `test/subidas.test.ts`.
- **Main API:** `defineFeature`, `serverPart`, `clientPart`, `buildCatalog`, `ServerRuntime`,
  `ClientRuntime`, `ServerApi` (`on`, `emit`, `state`, `route`, `onJoin`/`onLeave`/`onTick`; J3: `listen` to hear
  another feature's event on the server, scope `"server"` = no page hears it, `visible` = who a player's page draws),
  `ClientApi` (`on`, `send`, `state`, `action`, `view`; J3: `view.nameTag`, `view.bubble`), `escapeHtml`
- **Limits (v1):** intents rate-limited per player (default 4/s, burst 8) and queued until the next
  tick (≤ 32 per player); events scoped `to` one player, `near` a player or a point (default 32 m) or
  `all`; shared state is sent to everyone (area-of-interest scoping is J9); text fields ≤ 512 bytes;
  client → server messages ≤ 1,024 bytes (WebSocket limit); POST bodies to feature routes ≤ 4 KB.
- **Settings (N2):** `ajustes?: AjusteDecl[]` in a declaration (≤ 16, validated like the rest: a bad one refuses the
  feature, with its path); format, validation and the `requiere` grammar live in `src/ajustes.ts`; the page reads a value
  with the view hook `ajuste(id)`. Page side only: nothing new on the wire or in the catalog.
