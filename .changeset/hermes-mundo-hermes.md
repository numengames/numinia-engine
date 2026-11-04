---
"numinia-engine": minor
---

## 2026-11-05 14:00 · mundo-hermes · Pieza espejo y enlace local · hecho
- Qué: `MOTOR_PLANTILLA` (el mundo nuevo nace de la plantilla que se elija; por defecto `taller`) y la plantilla cerrada `hermes`; la pieza `espejo` (`entorno/espejo.json`, `numinia-engine/espejo@1`): cosas de fuera puestas en el mundo con ficha y lugar, interruptores por función, `usar` y `pedir` (solo una persona identificada que dirige o manda, cerca, verbo permitido, ritmo), petición hacia fuera y respuesta o caducidad a los 30 s; y el enlace local WebSocket en 127.0.0.1 con reto HMAC, rechazo de `Origin`, 16 KB y ritmo por conexión, y `hola.funciones`.
- Números: 2860 pruebas en verde, 0 mal; huella 7e630965 intacta; sin `espejo.json` el estado compartido y la simulación salen igual que sin la pieza; el enlace no abre ningún puerto sin espejo.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: minor. Commit: rama `hermes/mundo-hermes` (local, sin PR).
- Siguiente: el adaptador del plugin (carril P) y la vista de las zonas (dibujo plano en blanco y negro).
