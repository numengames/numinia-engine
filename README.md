# numinia-engine (working name)

Thin MIT web 3D/XR engine in TypeScript. Status: **PP0 — architecture skeleton, local only.**

```
npm test       # 11 tests, < 1 s
npm run gates  # the gate table, ~5 s
npm run run -- --ticks 2000 --seed 42 --bots 50 --k 50   # headless instance, prints the fingerprint
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
