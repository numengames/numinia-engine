---
"numinia-engine": minor
---

## 2026-11-04 21:36 · P13 evaluación al terminar una misión: tarjeta con tiempo, contadores y puntuación · hecho
- Qué: pieza del motor para aventuras de formación (R-1): una `mision@1` puede llevar `evaluacion` ({ titulo, base, minimo, resta: { contador: peso entero }, tiempo: { referencia_min, resta_por_minuto }, muestra, etiquetas }). Al completarla, el servidor mide el tiempo con SU reloj (aceptada, cierre de cada bloque, hecha; queda en el progreso y sobrevive a reconectar y a reiniciar), calcula la puntuación con cualquier contador por nombre (el que falta vale 0) y la página enseña una tarjeta con la puntuación, el tiempo de toda la misión y el de cada fase y los contadores, con «Cerrar» (o Escape) y «Ver evaluación» en el libro (J); los lectores de pantalla y los agentes reciben lo mismo en un anuncio, y `misiones.evaluacion(id)` / `libro()[i].evaluacion` lo da como datos. Con `fases` ([{ nombre, hasta: <id del paso que la cierra> }], 1–8) la tarjeta enseña el tiempo de toda la misión y el de cada fase con nombre, en vez de una fila por bloque. Nuevo contador `desmarcados_correctos` en los pasos `marca` (desmarcar una cosa que el paso sí pide). Sin `evaluacion` en el mundo, nada cambia: ni el estado, ni los eventos, ni lo que se guarda.
- Números: `test/misiones-evaluacion.test.ts` nuevo (12 pruebas: formato, cálculo puro, filas y etiquetas, tiempos por bloque, guardado y recarga, `desmarcados_correctos`, mundo sin `evaluacion` igual, las fases con nombre, y todo sobre el enchufe real con una segunda pestaña y un reinicio); misiones sube a v11 (eventos `evaluacion`, `evaluacionFila`, `abrirEvaluacion`). Queda fuera el informe para el instructor.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `feat/mission-evaluation`.
- Siguiente: el informe para el instructor (la misma tarjeta de todos los alumnos) y escribir `evaluacion` en la inspección de la escena del crimen.
