# cli

Command line over a headless instance: `run` (fingerprint + timings, feeds the gates) and `describe` (readable JSON of a world).

- **Does not:** Anything that needs a screen or a GPU.
- **Depends on:** core, schema, ecs, sim, net, instance, feature (rule: `tools/layers.json`); `describe.ts` is a composition root and imports `features/servidor.ts`
- **Tested by:** `test/engine.test.ts`, `test/describe.test.ts`
- **Main API:** `runHeadless`, `describeInstance`

## Details moved from llms.txt

These clauses were in the one-line `llms.txt` bullet for this package and are kept here verbatim.

- Command line over a headless instance: `run` (fingerprint + timings, feeds the gates) and `describe` (readable JSON of a world; `--catalogo` for the features).
