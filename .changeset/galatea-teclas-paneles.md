---
"numinia-engine": patch
---

## 2026-11-11 18:58 · teclas · Los paneles se abren con las teclas del mapa nuevo y sus rótulos las dicen · hecho
- Qué: la I abre la bolsa, la C tu ficha y el Tab la gente, como dice Ajustes › Controles (antes la I abría la ficha, la R la bolsa y la L la gente). Los rótulos dicen la tecla de verdad («Tú (C)», «Salir de construir (B)»…), también si cambias tus teclas, y la misión 1 del Taller dice «o la tecla B».
- Números: medido en un navegador pulsando de verdad: antes I→ficha, C→nada, R→bolsa, L→gente, Tab→nada; ahora I→bolsa, C→ficha, Tab→gente, B→construir, R y L→nada; 0 errores de página. Prueba nueva `test/teclas-paneles.test.ts` (todo panel abre con una acción de la tabla; ningún texto nombra una tecla vieja).
- Consumo: sin medir · claude-opus-5-5 (Galatea).
- Cambio: patch. Commit: branch `galatea/teclas-paneles`.
- Siguiente: la pierna e2e `misiones` sigue esperando «E: hablar con…» y desde #347 la tecla va en una cajita; está rota en main y no es de este cambio.
