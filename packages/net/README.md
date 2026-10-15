# net

Bit packing, quantized snapshots (6 bytes per visible entity), area of interest with a priority cap K, message types, `Transport` + in-memory loopback + WebSocket client.

- **Does not:** Game rules; it knows bytes, not meaning beyond position.
- **Depends on:** core, schema, ecs, sim (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`, `test/server.test.ts`
- **Main API:** `MSG` (9 = REPORT: the page's session report, `encodeReport`/`decodeReport`, ≤ 1.000 bytes), `buildGrid`, `selectVisible`, `encodeSnapshot`/`decodeSnapshot`, `encodeInput`, `loopbackPair`, `webSocketClient`, `Transport`
