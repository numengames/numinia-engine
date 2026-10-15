# net

Bit packing, quantized snapshots (6 bytes per visible entity), area of interest with a priority cap K, message types, `Transport` + in-memory loopback + WebSocket client.

- **Does not:** Game rules; it knows bytes, not meaning beyond position.
- **Depends on:** core, schema, ecs, sim (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`, `test/server.test.ts`
- **Main API:** `MSG` (9 = REPORT: the page's session report, `encodeReport`/`decodeReport`, ≤ 1.000 bytes), `buildGrid`, `selectVisible`, `encodeSnapshot`/`decodeSnapshot`, `encodeInput`, `loopbackPair`, `webSocketClient`, `Transport`
- **Files over HTTP (H9, `ficheros.ts`, pure, shared by page and server):** `TIPOS` (kinds and content types), `TOPES_MB` /
  `SUBIDAS_TOTAL_MB` (caps, also in `limits.json`), `comprobarGlb` / `comprobarFichero` (Result with paths, never throws),
  `sha256Hex` (for pages without `crypto.subtle`). Tested by `test/subidas.test.ts`.
