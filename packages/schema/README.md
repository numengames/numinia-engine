# schema

One description per component/message: defaults, validation with error paths, bits per field.

- **Does not:** Storage or networking; validation never throws, it returns `Result`.
- **Depends on:** core (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`
- **Main API:** `defineSchema`, `defaults`, `validate`, `fieldBits`, `schemaBits`
