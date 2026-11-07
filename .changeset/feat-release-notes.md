---
"numinia-engine": minor
---

## 2026-11-07 09:00 · MIS-292 · cada versión del motor publica su número y sus novedades · hecho
- Qué: `imagen.json` de cada release lleva ahora `version` (la versión semántica que sale de los fragmentos pendientes, o la de `package.json`) y la release adjunta `novedades.json` (tipo + texto por cambio desde la release anterior), para que numinia.com muestre «0.106.0» y lo que trae. Los campos antiguos de `imagen.json` no se tocan.
- Números: `test/novedades-release.test.ts` nuevo (4 pruebas). `.github/workflows/publicar-motor.yml` no cambia: ya llama a `tools/publicar-version.sh`.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `motor-web-3d/t_5f08b0e4`.
- Siguiente: tras fusionar y publicarse, comprobar los dos `curl` de MIS-292.
