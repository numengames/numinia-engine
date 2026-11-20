---
"numinia-engine": minor
---

## 2026-11-11 15:46 · ia-llamar · Entrar en la burbuja de una IA abre la charla · hecho
- Qué: al entrar en la burbuja de una IA que se deja llamar con el botón, se abre sola la caja para hablarle (antes solo salía «E: hablar con Ada»). Una vez por visita: si la cierras no vuelve hasta que salgas y entres otra vez; fuera de la burbuja no pasa nada y la tecla E sigue valiendo. Ajuste «Hablar al entrar en la burbuja» (`llamar.abrirAlEntrar`, activo por defecto; un mundo lo apaga en `mundo.ajustes.json` → `defectos`).
- Números: `test/llamar-ia.test.ts` +1 prueba (apertura una vez por visita); llamar, llamar-ia y burbuja en verde. Comportamiento en un mundo vivo: sin comprobar.
- Consumo: sin medir · Sonnet 5.
- Cambio: minor. Commit: branch `feat/burbuja-auto-abrir`, PR #….
- Siguiente: ver en un mundo con una IA conectada que la caja se abre al entrar.
