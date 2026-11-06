---
"numinia-engine": minor
---

## 2026-11-04 21:40 · P10 paso de misión `foto`: cuenta la foto que saca el jugador con la cámara del motor · hecho
- Qué: pieza del motor para aventuras de formación (R-1): un paso `foto` (`objetivo` = esfera del rincón, `distancia` opcional) se cumple cuando el jugador saca una foto con la cámara de fotos de siempre y el centro del objetivo sale en el encuadre (fov y aspecto reales), a la distancia pedida y sin pared en medio. Decide el servidor a partir de la pose de la cámara: pose lejos del jugador, rechazada; como mucho una foto por segundo. Una foto cumple como mucho un paso por misión, el objetivo más cercano; una foto que no cumple ninguno suma `fotos_erroneas` a la misión (en el progreso y en `libro()[i].cuenta`). Entrar en una zona no hace nada y el paso no pone baliza ni flecha.
- Números: `test/misiones-foto.test.ts` nuevo (9 pruebas: geometría del encuadre, formato bueno y malo, máquina, enchufe real con y sin pared); misiones sube a v11 (intento `foto`, `fotos` en el evento `mision`). Sin pasos `foto` el formato, el estado, los eventos y lo guardado no cambian. La cámara de fotos en móvil: los chips de filtro del visor miden 44 px de alto en táctil (eran 34); en escritorio, igual. Para no pasar el tope de la primera carga, lo que el paso `foto` necesita en la página viaja con el trozo de la cámara, y la subida de la foto como portada del mundo (antes en `main.ts`) también se pide al pulsarla (`test/foto-tactil.test.ts`, `test/foto-portada.test.ts`).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `feat/photo-step`.
- Siguiente: probar la aventura de la escena del crimen con sus tres fotos como pasos `foto` (cadáver, ventana, puerta de entrada).
