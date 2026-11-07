---
"numinia-engine": minor
---

## 2026-11-07 04:50 · franjas · Time-of-day piece: the world announces dawn, day, dusk and night (Y37) · hecho
- Qué: `features/franjas` (the server decides, R-1). It reads the zone's clock from `entorno` (read only) and turns it into one of four bands with whole numbers; the hours each band starts are data (`franjas.json`, `numinia-engine/franjas@1`, house 5 / 7 / 18 / 20) and a wrong set says its path and how to fix it. Each change is announced once (text + sound, importance 1) while the day cycle runs; never at start-up, on arrival or without a cycle. One state entry `zona` and a card «Time of day»; the verb `consultar` (button «Time of day» for touch and VR) answers only the asker. Texts in English by default with a Spanish translation block. Other features hook on with `api.listen("franjas", "franja")` and `api.estadoDe("franjas")` (a test feature does it without touching entorno). Simulation fingerprint unchanged.
- Números: `test/franjas.test.ts` 12 tests (480 steps with no gap or overlap, a whole 2-minute day with one notice per change, midnight, no cycle, silent and Spanish worlds, `consultar`, a hooking feature).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Siguiente: a world's own `franjas.json`, per-preset hours, one sound per band (Y30), Y38 and Y39 on top.
