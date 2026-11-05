---
"numinia-engine": minor
---

## 2026-11-05 14:00 · mundo-hermes · Pieza espejo y enlace local · hecho
- Qué: `MOTOR_PLANTILLA` (el mundo nuevo nace de la plantilla que se elija; por defecto `taller`) y la plantilla cerrada `hermes`; la pieza `espejo` (`entorno/espejo.json`, `numinia-engine/espejo@1`): cosas de fuera puestas en el mundo con ficha y lugar, interruptores por función, `usar` y `pedir` (solo una persona identificada que dirige o manda, cerca, verbo permitido, ritmo), petición hacia fuera y respuesta o caducidad a los 30 s; y el enlace local WebSocket en 127.0.0.1 con reto HMAC, rechazo de `Origin`, 16 KB y ritmo por conexión, y `hola.funciones`.
- Números: 2860 pruebas en verde, 0 mal; huella 7e630965 intacta; sin `espejo.json` el estado compartido y la simulación salen igual que sin la pieza; el enlace no abre ningún puerto sin espejo.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: minor. Commit: rama `hermes/mundo-hermes` (local, sin PR).
- Siguiente: el adaptador del plugin (carril P) y la vista de las zonas (dibujo plano en blanco y negro).

## 2026-11-05 15:00 · mundo-hermes · Mundo plano y táctil de Hermes · hecho
- Qué: la plantilla `hermes` trae su planta (`entorno/espejo.json`: umbral con el panel de interruptores, reloj, sesiones y plaza; solo `salud` nace encendida) y un suelo negro; lo que llega de fuera sin posición se coloca solo en la cuadrícula de su zona (4 m, desde el centro) y la fuente no puede quitar ni cambiar el panel; el cliente dibuja cada cosa como una forma plana en blanco y negro hecha por código (reloj, cubo, losa con una lámpara por interruptor, borde de zona discontinuo si la función está apagada), con su rótulo en castellano; mirar una cosa (E o tocar) abre su ficha con un botón por verbo y confirmación en dos pasos; `/status` cuenta a la página las zonas y los interruptores. Arreglo: el servidor no abría el enlace local porque buscaba la pieza antes de que arrancara.
- Números: 2865 pruebas en verde, 0 mal; página 628.1 kB gz · 530.4 kB br (tope 536); formas planas en un trozo aparte que solo se baja con la primera cosa; huella de los mundos sin espejo intacta.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: minor. Commit: rama `hermes/mundo-hermes` (local, sin PR).
- Siguiente: el adaptador del plugin con `pedir` real (carril P) y el dibujo definitivo de la planta (Pablo).

## 2026-11-05 17:00 · mundo-hermes · Palancas, carteles, tema y agentes · hecho
- Qué: las lámparas del panel del umbral son mandos (`encender`: quien dirige o manda, persona identificada, cambia `funciones.<nombre>` en `espejo.json` con el fichero entero validado y escritura atómica, se aplica sin reiniciar, quita las cosas de la función apagada y avisa a la fuente con la trama `funciones`); botón «Ir a <zona>» en la ficha del panel con la pieza de teletransporte de siempre; `tema: black-and-white` en `entorno.json` (solo la plantilla `hermes`) viste la página y el minimapa de blanco y negro; formas planas y fichas para `perfil` (figura con lámpara) y `uso` (medidor; coste siempre «estimado», caché aparte).
- Números: ver el registro de puertas de esta rama (pruebas, tipos sin errores nuevos, página dentro del tope); sin `espejo.json` el estado y la huella salen igual.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: minor. Commit: rama `hermes/mundo-hermes` (local, sin PR).
- Siguiente: zonas `perfil`/`uso` en la plantilla; el verbo `perfil.activar`.
