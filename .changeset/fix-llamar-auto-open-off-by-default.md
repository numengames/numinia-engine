---
"numinia-engine": patch
---

## 2026-11-12 08:00 · ia-llamar · Abrir la charla al entrar en la burbuja: apagado por defecto · hecho
- Qué: arreglo de la revisión de #363. `llamar.abrirAlEntrar` pasa a apagado por defecto (un mundo lo enciende en `defectos`); aunque esté encendido, no se abre solo en móvil (teclado sin tocar) ni en sesión VR/AR (un diálogo del DOM no sirve ahí). Si entras en la burbuja de una segunda IA con otra caja abierta, ya no se marca como abierta: se abre al cerrarse la primera.
- Números: `test/llamar-ia.test.ts` +2 pruebas (antes fallaban: faltaban `abrirSolo` y el parámetro `libre`).
- Consumo: sin medir · Sonnet 5.
- Cambio: patch.
