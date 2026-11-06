---
"numinia-engine": minor
---

## 2026-11-03 17:30 · P4 indicios que se marcan con testigos numerados, y contadores para evaluar · hecho
- Qué: pieza del motor para aventuras de formación (R-1): una `cosa@1` puede ser `marcable` y un paso `marca` pide que lo marcado sea exactamente un conjunto de cosas. Con ese paso en marcha, la ficha de la cosa termina en «Marcar» / «Desechar» (o «Desmarcar» / «Dejar marcado»); cada indicio marcado muestra, solo a su jugador, una placa amarilla con su número en negro; los números siempre son seguidos (desmarcar el 1 hace que el 2 pase a ser el 1). Los contadores por misión (`marcas`, `marcas_erroneas`, `desmarcados`) quedan en el progreso y en `misiones.libro()`.
- Números: `test/misiones-evidencia.test.ts` nuevo (9 pruebas: formatos, máquina —marcar, desmarcar, renumerar, conjunto exacto, contadores, guardado— y todo sobre el enchufe real); misiones sube a v10 (estado `marcable`, `mox`/`moy`/`moz`, evento `marcados`, contadores en `mision`). Sin los campos nuevos el formato, el estado, los eventos y lo guardado no cambian.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `feat/evidence-markers`.
- Siguiente: la ficha de evaluación que lee los contadores, y la aventura de la escena del crimen (fase 3) sobre esta pieza.
