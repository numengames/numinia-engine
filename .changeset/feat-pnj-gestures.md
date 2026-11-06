---
"numinia-engine": minor
---

## 2026-11-04 06:49 · N4 · las personas gesticulan con sus propias animaciones · hecho
- Qué: una persona cuyo modelo trae animaciones propias ya no se queda con los brazos quietos: la que se llame `talk`, `habla` o `gesto` suena mientras hablas con ella, y la `walk`, `camina` o `andar` mientras va a su sitio nuevo; andar gana a hablar y hablar a estar quieta, con un fundido de 0,3 s. `Idle_Talking_Loop` ya no cuenta como reposo.
- Números: `test/pnj-viva.test.ts` 16/16; `npm test` 2750 en verde; tipos sin errores nuevos.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `feat/pnj-gestures`.
- Siguiente: fotografiar el paseo entre fases en la escena del crimen.
