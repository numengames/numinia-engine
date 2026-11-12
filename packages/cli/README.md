# cli

Command line over a headless instance: `run` (fingerprint + timings, feeds the gates) `describe` (readable JSON of a world), `check` (validates a folder: JSON, manifests, licences) and `replay` (replays a recording of inputs and checks its fingerprint). `shot` and `diff-shot` (M23) still need a headless browser.

- **Does not:** Anything that needs a screen or a GPU.
- **Depends on:** core, schema, ecs, sim, net, instance, feature (rule: `tools/layers.json`); `describe.ts` is a composition root and imports `features/servidor.ts`
- **Tested by:** `test/engine.test.ts`, `test/describe.test.ts`, `test/cli-check-replay.test.ts`
- **Main API:** `runHeadless`, `describeInstance`, `checkFolder`, `replayFile`

## Details moved from llms.txt

These clauses were in the one-line `llms.txt` bullet for this package and are kept here verbatim.

- Command line over a headless instance: `run` (fingerprint + timings, feeds the gates) and `describe` (readable JSON of a world; `--catalogo` for the features).
