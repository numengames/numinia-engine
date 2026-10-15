# feature

The plug for game features (J7): `defineFeature` (a declaration: intents, events, shared state, each
field described by a schema), the catalog every client receives on join, the schema codec on the wire,
and the two runtimes that host the features: `ServerRuntime` (inside the instance) and `ClientRuntime`
(inside the client session). Accessibility is part of every declaration (V1): `spoken` verbs, `announce`
events, `state.card` things; `announcements`, `cards()` and `view.announce` on the client (a card whose name is empty is decoration and is not listed). Permissions (H1): `api.puede(entity, "construir")` — the server decides (today `MOTOR_CONSTRUIR`; roles with H3). Things with a model: `view.place` / `view.here`. Each state entry is encoded once and resent to whoever enters. How to add a feature: `docs/EXTENDER.md`.

- **Does not:** Know any feature (they live in `features/`), touch the simulation or the fingerprint, draw
  (the page lends it `ViewHooks`), open sockets (the instance and the server carry its bytes).
- **Depends on:** core, schema, net (rule: `tools/layers.json`)
- **Tested by:** `test/feature.test.ts`, `test/accesible.test.ts`, `test/objetos.test.ts`, `tools/e2e.mjs` (gesture and objects legs)
- **Main API:** `defineFeature`, `serverPart`, `clientPart`, `buildCatalog`, `ServerRuntime`,
  `ClientRuntime`, `ServerApi` (`on`, `emit`, `state`, `route`, `onJoin`/`onLeave`/`onTick`),
  `ClientApi` (`on`, `send`, `state`, `action`, `view`), `escapeHtml`
- **Limits (v1):** intents rate-limited per player (default 4/s, burst 8) and queued until the next
  tick (≤ 32 per player); events scoped `to` one player, `near` a player or a point (default 32 m) or
  `all`; shared state is sent to everyone (area-of-interest scoping is J9); text fields ≤ 512 bytes;
  client → server messages ≤ 1,024 bytes (WebSocket limit); POST bodies to feature routes ≤ 4 KB.
