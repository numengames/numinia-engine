# net

Bit packing, quantized snapshots (6 bytes per visible entity at ground level, 8 with height — J2), area of interest with a priority cap K, message types, `Transport` + in-memory loopback + WebSocket client. Wire format `WIRE_FORMAT` = 2 since J2 (sent at the end of WELCOME; 0 = a server from before J2).

- **Does not:** Game rules; it knows bytes, not meaning beyond position.
- **Depends on:** core, schema, ecs, sim (rule: `tools/layers.json`)
- **Tested by:** `test/engine.test.ts`, `test/server.test.ts`, `test/salto.test.ts`
- **Main API:** `MSG` (9 = REPORT: the page's session report, `encodeReport`/`decodeReport`, ≤ 1.000 bytes; 12 = PASE: numinia.com's world pass, `encodePase`/`decodePase`, ≤ `PASE_MAX` 2.048 bytes, sent before IDENTITY — the server's WebSocket `maxPayload` equals `PASE_MAX`, every other message stays ≤ `WS_FRAME_MAX` 1.024; sizes: docs/FICHA-TECNICA.md), `buildGrid`, `selectVisible`, `encodeSnapshot`/`decodeSnapshot` (own state exact: x, y, z, vertical speed, air jump, jump buffer), `encodeInput(seq, mx, mz, buttons)` (6 bytes; 5-byte inputs still accepted = no buttons), `WIRE_FORMAT`, `loopbackPair`, `webSocketClient`, `Transport`
- **Files over HTTP (H9, `ficheros.ts`, pure, shared by page and server):** `TIPOS` (kinds and content types), `TOPES_MB` /
  `SUBIDAS_TOTAL_MB` (caps, also in `limits.json`), `comprobarGlb` / `comprobarFichero` (Result with paths, never throws),
  `sha256Hex` (for pages without `crypto.subtle`). Tested by `test/subidas.test.ts`.
