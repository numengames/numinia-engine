---
"numinia-engine": minor
---

## 2026-11-04 21:44 · interaccion · Aviso «E: …» destacado, de lo que se mira y solo de cerca · hecho
- Qué: el aviso de interacción («E: hablar con…») sale ahora en ámbar con la tecla dibujada y letra mayor, centrado sobre la barra de botones; entre las cosas al alcance ofrece la que se mira (la más cercana si ninguna está delante), la marca con un aro que no la tapa (a los pies si es una persona, del tamaño de la cosa y centrado en su modelo si es un objeto) y se va al salir del radio. Además, un mundo puede ocultar los botones «Recoger» y «Soltar» del jugador con `interfaz.ocultar: ["recoger-soltar"]`, y el botón «…» del móvil ya no anuncia, para el lector de pantalla, los gestos que el mundo ocultó.
- Números: elección pura en `apps/plaza/interactuar-mirada.ts` (15 pruebas en `test/interactuar-mirada.test.ts`); aro: una malla, creada al ofrecer la primera cosa, 0 cuadros extra en reposo; contraste 9,01:1; navegador con GPU en el mundo v3 con radios 1,1 m / 1,8 m.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: minor. Commit: branch `feat/interact-prompt`.
- Siguiente: ninguno; la lógica de mandos de VR no cambia.
