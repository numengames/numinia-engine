# cli

Command line over a headless instance: `run` (fingerprint + timings, feeds the gates) and `describe` (readable JSON of a world).

- **Does not:** Anything that needs a screen or a GPU.
- **Depends on:** core, schema, ecs, sim, net, instance (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`, `test/describe.test.ts`
- **Main API:** `runHeadless`, `describeInstance`
