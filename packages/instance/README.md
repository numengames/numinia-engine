# instance

The authoritative loop: connects any `Transport`, applies one input per tick (J2: only avatars whose input arrived advance, so the owner's prediction stays exact), sends snapshots; guest identity (I1, `identidad.ts`: signed token, `Instance.who`); `Bot` speaks the real protocol headless (J2: runs on one stretch in four, hops about every 8 s). J3: each connection keeps who its last snapshot carried, so features can ask `api.visible(entity)` (names over heads go only to who sees them).

- **Does not:** Sockets or HTTP (those are in `server`).
- **Depends on:** core, schema, ecs, sim, net, feature (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`, `test/identidad.test.ts`
- **Main API:** `Instance`, `Bot`, `MAX_QUEUE`, `emitir`/`verificar` (guest tokens)
