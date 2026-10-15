# instance

The authoritative loop: connects any `Transport`, applies one input per tick, sends snapshots; `Bot` speaks the real protocol headless.

- **Does not:** Sockets or HTTP (those are in `server`).
- **Depends on:** core, schema, ecs, sim, net, feature (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`
- **Main API:** `Instance`, `Bot`, `MAX_QUEUE`
