---
"numinia-engine": patch
---

## 2026-11-11 13:04 · render · El aro de una persona se oculta tras tu propio cuerpo · hecho
- Qué: el aro de una persona (en el suelo) se prueba contra la profundidad, así que el cuerpo del jugador delante lo tapa; el aro de una cosa sigue viéndose a través.
- Números: `test/interactuar-mirada.test.ts` 18 pruebas (+1, falla antes del arreglo).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch. Commit: branch `fix/render-talk-ring-depth-tested`.
- Siguiente: ninguno conocido.
