# Mapa: dónde está cada cosa

Para quien llega nuevo (persona o IA). La versión de una página para máquinas es [`llms.txt`](../llms.txt).

| Quiero… | Voy a… |
|---|---|
| entender las reglas | `AGENTS.md` |
| saber qué se decidió, qué se midió y por qué (todo lo aprendido en el proyecto) | `docs/SABER.md` |
| ver qué hace cada paquete | `packages/<nombre>/README.md` |
| cambiar cómo se mueve un avatar | `packages/sim/src/index.ts` (solo enteros, ver `docs/DETERMINISM.md`) |
| cambiar qué se manda a cada cliente | `packages/net/src/index.ts` (`selectVisible`, `encodeSnapshot`) |
| cambiar el bucle del servidor | `packages/instance/src/index.ts` y `packages/server/src/server.ts` |
| cambiar cómo se dibuja | `packages/render/src/` (único sitio con three.js) |
| añadir una función de juego (gestos, chat, puertas, misiones…) | `docs/EXTENDER.md`; el código va en `features/<id>/` |
| saber qué verbos tiene el mundo (personas y agentes) | `npm run describe -- --catalogo` |
| ver el mundo sin pantalla | `npm run describe` (JSON: entidades, posiciones, quién ve a quién) |
| saber un límite | `limits.json` / `docs/FICHA-TECNICA.md` |
| ver cómo entró cada jugador (aparato, navegador, XR, cuadros, ping) | `npm run sesiones`; en vivo `GET /sesiones`; código en `packages/server/src/sesiones.ts` |
| añadir un paquete | primero `tools/layers.json`, luego carpeta con `README.md`, y una línea en `llms.txt` |
| qué toca hacer | `docs/BACKLOG.md`; lo ya hecho en `docs/RUNLOG.md` |
| saber qué nos falta para estar, como mínimo, al nivel de Hyperfy2 | `docs/HYPERFY2-PARIDAD.md` |
| poner cosas en el mundo (modelos, constructor) | `features/objetos/` (servidor decide, `biblioteca.json` = lo que se puede colocar); el panel, `apps/plaza/constructor.ts`; los ficheros, `activos/` (CC0) servidos en `/a/<sha256>.glb` |
| cambiar la cámara (ratón, rueda, dedos, mando) | `packages/render/src/camara.ts` (entrada) y `camara-orbita.ts` (cuentas); teclas en `docs/JUGADOR.md` |
| cambiar el gizmo y las manos del constructor | `packages/render/src/gizmo.ts`; el panel y las teclas, `apps/plaza/constructor.ts`; la selección, `features/objetos/client.ts` |
| subir ficheros al servidor | `packages/server/src/subidas.ts` (servidor), `packages/net/src/ficheros.ts` (tipos, topes, comprobación), `apps/plaza/soltar.ts` (página) |
| cambiar saltar o correr | `packages/sim/src/index.ts` (solo enteros); los botones, `apps/plaza/main.ts` |
| cambiar los avatares VRM | `packages/render/src/avatares.ts`, `avatares-politica.ts`, `avatares-vrm.ts`; los ficheros, `activos/avatares/` y `activos/animaciones/`; el conversor, `tools/vrma/` |
| cambiar el chat, los nombres o los bocadillos | `features/chat/`, `apps/plaza/chat.ts`, `packages/render/src/nombres.ts` |
| añadir una tecla a la página | escúchala con `escribiendo(e)` (`apps/plaza/escribiendo.ts`): escribir nunca mueve |

Capas (de abajo arriba): `core → schema → ecs → sim → net → feature → {client, instance} → {server, cli}`;
`render` solo habla con three.js; las funciones de juego (`features/`) solo con `feature`. `tools/layers.mjs` lo comprueba.
