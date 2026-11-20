---
"numinia-engine": minor
---

## 2026-11-11 16:20 · entorno · El mundo dice su ritmo: `movimiento` { andar, correr, fov } en `entorno.json` · hecho
- Qué: `entorno.json` acepta `"movimiento": { "andar", "correr", "fov" }` (metros por segundo al andar y al correr, y grados de campo de visión; cada clave opcional). La simulación del servidor (`InstanceOptions.movimiento`, `setMovimiento` en `sim`) y la predicción de la página (estado del entorno `movAndar`, `movCorrer`, `ClientSession.movimiento`) dan el mismo paso; la cámara toma `movFov`. Sin la clave, andar 1,5 m/s, correr 4 m/s y 60°, como siempre. Sin aceleración: no se toca el formato del cable.
- Números: `test/movimiento-mundo.test.ts` 7 pruebas (formato, paso de 20 ticks = 3 m andando / 6 m corriendo, predicción sin correcciones, y la misma prueba sin dar el ritmo a la página falla); huella de referencia sin cambios; `node --test test/*.test.ts` 3238 pruebas, 1 fallo de tiempo en `cercania` (cost) que pasa suelto (199 ms).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `feat/world-movement`.
- Siguiente: la aceleración (constante de tiempo ≈ 0,1 s) necesita llevar la velocidad horizontal por el cable: historia aparte. Los valores de Tarugo (3 / 6 m/s, 70°) son derivados del código de Hyperfy, no medidos en su mundo desplegado.
