---
"numinia-engine": minor
---

## 2026-11-11 20:55 · plaza · Per-world loading-screen picture (ficha `carga`) · hecho
- Qué: `aventura/ficha.json` takes an optional `carga` («<sha256>.png|jpg|webp», an image already on the server) and `carga_credito` (≤ 120 characters). The server injects a preload and one `<style>` into every page's `<head>`, so `#carga` paints the picture full-screen, centred and darkened before any script, with «Cargando» and the percentage on top and the credit at the foot; the moon goes. No `carga`: the moon as always. The mesh screen (espacio base) keeps its own look. The log warns when the file weighs more than 150 kB. The image itself lives in the world, never in the engine or a template.
- Números: `test/carga-mundo.test.ts` (3 tests); gates green, page 635.5 kB gz · 536.8 kB br.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor (additive ficha field).
