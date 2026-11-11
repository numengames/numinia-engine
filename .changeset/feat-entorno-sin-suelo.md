---
"numinia-engine": minor
---

## 2026-11-11 12:00 · entorno · Un mundo sin suelo: cielo arriba y abajo · hecho
- Qué: `suelo.tipo: "ninguno"` en entorno.json esconde el plano y la rejilla y quita el suelo plano y = 0 de la simulación (servidor y predicción de la página); `sueloMinimo`/`vuelta` devuelven a quien cae.
- Números: test/sin-suelo.test.ts (4 pruebas); sin la clave, huella de referencia y mundos intactos.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: minor. Commit: branch `motor-web-3d/t_f7d43806-simposio-2026-un-mundo-sin-suelo-cielo-a`.
- Siguiente: el mundo del Simposio usa el campo; mapa cenital sin suelo mostrado solo como fondo.
