# numinia-engine (working name)

Thin MIT web 3D/XR engine in TypeScript. Status: **PP1 — walking skeleton, local only.**

```
npm test       # 14 tests, < 1 s
npm run gates  # the gate table, ~5 s
npm run server # instance on ws://127.0.0.1:8790, 20 Hz
npm run dev    # the plaza page on http://127.0.0.1:5173 (add ?webgl2 to force WebGL2)
npm run bots -- --n 8   # headless players over real WebSockets
npm run e2e    # two real browser tabs against the running server
```

| Package | Is |
|---|---|
| `core` | fixed point, seeded RNG, state hash, `Result` |
| `schema` | one description per component/message → defaults, validation with paths, bits per field |
| `ecs` | entities + columns (Int32Array per field), ascending-id queries |
| `sim` | deterministic 20 Hz step, snapshot, fingerprint, replay |
| `net` | bit packing, quantized snapshots, area of interest, `Transport` + in-memory loopback |
| `instance` | authoritative server loop + headless bot speaking the real protocol |
| `cli` | `runHeadless` and the command line |

Rules for contributors and agents: `AGENTS.md`. Build plan and checkpoints:
`../mmo-browser-study/CONSTRUIR.md`.
