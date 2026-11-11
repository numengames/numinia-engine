---
"numinia-engine": minor
---

## 2026-11-11 21:40 · entorno · Ground as a disc with a visible edge (`suelo.forma: "disco"`, `suelo.radio`) · hecho
- Qué: `entorno.json` accepts `suelo: { forma: "disco", radio: <metres> }` (flat fields `sueloForma` plano|disco, `sueloRadio` 0–2000). The render draws a disc of that radius around the world origin instead of the 4000 m plane, with a bright unlit edge: a 2 m band on the floor along the rim (read from inside) plus a wall hanging 1 m under it (read from outside/above). Without `forma`, or with `plano`, nothing changes. Both fields are the world's file's (like the camera): a saved state from before never hides them. Render only: the simulation floor is still flat and unbounded, so the edge is not a wall to walk into (a world that wants one needs a sim change). `features/espejo` untouched.
- Números: `test/entorno-disco.test.ts` 2 tests; seen in the Hermes world (copy of `mundo-local`, radius 70 m) in chromium with this branch's server and page: the band reads clearly from 13 m inside the edge. Draw cost: one circle, one ring and one open cylinder (128 segments each), no per-frame work; not measured on a phone.
- Consumo: not measured · Sonnet 5.5.
- Cambio: minor. Commit: branch `wt/t_50a82890`.
- Siguiente: if wanted, the edge colour from the world (today fixed cream #e9e4d8) and a sim limit at the radius.
