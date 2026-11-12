---
"numinia-engine": patch
---

## 2026-11-12 08:10 · cuerpo vivo · el cuerpo .glb de una IA no pasa a `animate: true` · hecho
- Qué: arreglo de la revisión de #368 (F1–F3). El cuerpo propio de una IA se pide con `animate: false`: solo un modelo con clip de reposo propio pasa a la ruta animada (y entonces `vida.clip` queda puesto: sin respiración procedural encima del clip); un modelo sin clips sigue horneado, con LOD e instancias, y no repite `clips[0]` sin fin. Habla y camina siguen entrando por `view.gestoDe` (el cargador crea `gestos` con `clipVida && vida`, sin mirar `animate`).
- Números: `test/cuerpo-vivo.test.ts` +1 prueba (antes fallaba: faltaba `peticionCuerpoPropio`). Navegador: sin comprobar con Chispa.
- Consumo: sin medir · Sonnet 5.
- Cambio: patch.
