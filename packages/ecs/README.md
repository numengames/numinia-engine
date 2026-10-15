# ecs

Entities with generation counters and component columns (one Int32Array per field). Queries run in ascending entity id.

- **Does not:** Systems, rules or time; iterating a Map/Set to decide anything.
- **Depends on:** core, schema (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`
- **Main API:** `World`, `Store`, `Column`
