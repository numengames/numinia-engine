---
"numinia-engine": patch
---

## 2026-11-25 15:28 · render / XR · El regulador de resolución de pantalla plana ya no actúa dentro de una sesión XR (escalera de calidad, E1) · hecho
- Qué: `power.reportCost` recibe un tercer dato, `xr`. Con una sesión XR presentando no mide ni decide nada (el coste sigue llegando al pulso), y `view.applyPixelRatio()` no redimensiona el lienzo mientras se presenta. Al salir de XR la medida empieza limpia tras los 3 s de asentado. Motivo: el lienzo no es lo que enseñan las gafas, así que su resolución no ahorra nada allí, y redimensionarlo en plena sesión cuesta imágenes.
- Números: Quest 3S, Quest Browser 157, WebGL2, mundo «Learn to Build», 2026-11-25 14:18:02–14:18:16 UTC: un tirón de 14 s a 41–45 de 72 imágenes por segundo; el regulador saltó 3 s después de empezar (escala 0,85) y otra vez al acabar (escala 1), con dos cambios de tamaño del lienzo y sin bajar el coste (limitaba la CPU, no los píxeles). `test/power.test.ts`: 2 pruebas nuevas (15 en total). Después del cambio, sin medir en gafas.
- Consumo: sin medir · claude-fable-5-2.
- Cambio: patch. Commit: rama `fix/xr-flat-governor-out`.
- Siguiente: E2, un regulador propio de XR sobre `requestViewportScale` (medido: escala 1 → 0,5 → 0,2 baja la GPU de 4,6 a 3,3 y 2,3 ms); la causa del tirón de CPU sigue sin encontrar.
