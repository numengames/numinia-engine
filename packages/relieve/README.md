# relieve

The pure terrain function of a naturaleza world (N1, moved here by N5): `semilla.ts` (seeded noise, mulberry32, simplex, fbm, ridged) and
`relieve.ts` (`alturaEn(semilla, x, z)`, `zonaEn`, `estanqueDe`) and `espacio-base.ts` (H1: `alturaBase(semilla, x, z)` — number or string seed, exactly 0 within 26 m of the spawn, mountain/plain/cleft by sector beyond — and `spawnBase()`). No three.js, no DOM, no clock.

- **Used by:** `render/naturaleza/terreno.ts` (draws it) and `sim/terreno-malla.ts` (the collision mesh): one source of truth for the hills.
- **Depends on:** nothing (rule: `tools/layers.json`).
- **Tested by:** `test/naturaleza-terreno.test.ts`, `test/naturaleza-colision.test.ts`, `test/espacio-base.test.ts`.
