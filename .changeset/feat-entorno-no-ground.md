---
"numinia-engine": minor
---

## 2026-11-11 14:15 · entorno · A world can have no ground: sky above and below (`suelo: "ninguno"`) · hecho
- Qué: `entorno.json` accepts `suelo: { tipo: "ninguno" }` (flat field `suelo`, value `ninguno`, next to `hierba`, `tierra`, `arena`, `roca`, `nieve`, `liso`). The ground plane and grid are not drawn, the sky (atmosphere, gradient, colour, equirect image/HDR) is mirrored under the horizon so looking down shows sky, not a cut, the top-down map keeps a plain background, and the simulation has no flat floor at y = 0 (the world's own platforms/GLB mesh are the floor); falling ends in the existing `sueloMinimo`/`vuelta` void (100 m down when the world gives none). Server and page agree and follow the Entorno panel live.
- Números: `test/sin-suelo.test.ts` 6 tests; reference fingerprint unchanged; a world without the key is untouched (ground present, `piso` 0).
- Consumo: not measured · Sonnet 5.5.
- Cambio: minor. Commit: branch `feat/entorno-no-ground`.
- Siguiente: a sea or void colour under the islands is not a setting yet.
