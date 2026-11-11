---
"numinia-engine": minor
---

## 2026-11-11 21:40 · entorno · Glowing animated paths between zones, per world (`caminos`) · hecho
- Qué: `entorno.json` accepts `caminos: [{ desde: [x, z], hasta: [x, z] }]` and `caminosColor: "#rrggbb"`. The page draws one thin emissive strip per path with a pulse of light running along it: one mesh, one draw call, the pulse a single time uniform in the shader. Desktop (tier A) animates and asks for frames only within 90 m of a path; Quest in XR and phones draw it with the pulse frozen, tier D a thinner plain line (principle 2). The paths ride the flat state as two new optional fields at the end (`caminos` text, `caminosColor`), the world file's like `mapaCorte`. A world without them is untouched. Doc: `docs/extender/caminos.md`.
- Números: `test/caminos.test.ts` 7 tests; reference fingerprint unchanged (feature state, not sim).
- Falta: follow the terrain (the strip is flat at y = 0.06); `prefers-reduced-motion`; no paths added to a template yet (zone positions are each world's).
- Cambio: minor.
