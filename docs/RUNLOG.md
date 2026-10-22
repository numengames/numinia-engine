# Diario de turnos

Una entrada por turno (desatendido o con Pablo), la más nueva abajo. En español, para personas.
Formato: `## AAAA-MM-DD HH:MM · <ID> · <estado>` y cinco líneas: Qué, Números, Consumo (semana a % →
b %, de `hermes usage`, y el modelo), Commit, Siguiente.
Horas en UTC (`date -u`). Las entradas de los turnos hasta la de las 09:35 del 15-10 están en hora de Madrid
(CEST, UTC+2); desde la de las 10:08, en UTC.

## 2026-10-18 14:52 · h2-ordenes h1 · hecho
- Qué: H2 historia 1 (sim: orden tipada). `ORDER_STRIDE` pasa de 4 a 6: una orden es `[entidad, tipo, a, b, c, d]`;
  `ORDER_PONER` (1) es lo de D-045 (#53) con un byte de tipo delante, mismo efecto (sitio fijo, vy 0, salto limpio).
  `Instance.volverASeguro` emite `ORDER_PONER`; `api.teletransportar`/`volverASeguro` no cambian su contrato. Base
  para QUIETO/EMPUJAR/SENTAR/VOLAR (h2-h2..h2-h4).
- Números: `test/ordenes.test.ts` nuevo (3 pruebas); `test/suelo.test.ts` sigue verde con el formato nuevo; huella
  de referencia (sim 3) sigue en `0x7e630965` sin órdenes. `npm test`: mismos 23 fallos preexistentes (falta el
  paquete `ws`, no instalado en este worktree) antes y después del cambio; nada roto por esta historia.
- Consumo: sin medir · Sonnet 5.
- Commit: rama `h2-ordenes/ola3`, PR contra `tren/motor-2026-10-18-5`.
- Siguiente: h2 historia 2 (sim: QUIETO).

## 2026-10-14 23:40 · arranque · hecho
- Qué: PP0 (arquitectura) y PP1 (esqueleto que anda) hechos; PP2 parte 1 (mil en una plaza) hecha;
  módulo de multitud escrito sin probar; montados los raíles del turno desatendido (`tools/auto.sh`,
  `tools/plaza.sh`, esta cola y este diario).
- Números: 15 pruebas; huella de referencia `fa94375e` igual en Node, Chromium y Firefox; 1.000
  personas por WebSocket real → tick p99 17–23 ms en un núcleo, 25,5 kbit/s por persona; cliente
  210 kB comprimido.
- Commit: ver `git log` de main.
- Siguiente: S1 (kit de despliegue para el servidor pequeño del 15-10).

## 2026-10-14 23:45 · S1 · hecho
- Qué: kit de despliegue. `npm run deploy` genera `deploy/instalar-motor.sh`, un solo fichero que en
  Ubuntu 24.04 / Debian 12 instala Node 24.22.0 LTS (sha256 comprobado), el usuario `numinia`, el
  servicio `numinia-motor` (LimitNOFILE, MemoryMax, endurecido), Caddy (página + `/ws`; HTTPS solo
  con `--dominio`) y ufw sin cerrar ssh. La página ahora busca el servidor en `/ws` del mismo sitio
  cuando no está en localhost. Cómo usarlo: `deploy/README.md`.
- Números: instalador 534 kB, se genera en ~0,6 s; prueba local (`tools/deploy-check.mjs`): el
  servidor desempaquetado arranca con Node 24.22.0 y 26.7.0, huella `fa94375e`, un cliente recibe 10
  snapshots en ~955 ms; 18 pruebas en verde; e2e chromium y firefox OK. No hay podman ni docker aquí:
  apt, systemd, Caddy y ufw NO están probados de verdad (queda para X3, con Pablo).
- Commit: ver `git log` de main (S1).
- Siguiente: P1 (ficha técnica + `limits.json`).

## 2026-10-15 00:40 · S2 · hecho
- Qué: el servidor ahora contesta por HTTP en su mismo puerto: `/health` (vivo, versión, huella,
  conectados) y `/metrics` (JSON con conectados, tick p50/p99/peor de los últimos 10 s, kbit/s por
  persona, memoria, retraso del bucle y dilatación, que vale 1 hasta S3). En el servidor instalado,
  `/health` se ve desde fuera y `/metrics` solo por túnel ssh. Enjambre contra un servidor que ya
  corre: `tools/swarm.sh --url wss://…/ws` desde casa, o `swarm.ts --en-servidor` en el propio
  servidor (va dentro del instalador). Instrucciones en `deploy/README.md`. Además, `tools/e2e.mjs`
  ya encuentra Firefox cuando el turno corre con otro HOME (fallaba por eso, no por el motor).
- Números: enjambre local de 1.000 durante 20 s → `/metrics` dice tick p50 13,8 ms / p99 16,2 ms,
  25,5 kbit/s por persona, RSS 169 MB; 500 bots conectan en ~0,4 s (antes, uno a uno). Enjambre
  por URL contra un servidor aparte: 300 bots, p99 7,1 ms, 25,5 kbit/s. 21 pruebas en verde (la
  nueva de `/metrics` tarda ~0,6 s); `deploy-check` OK con `/health` y `/metrics`; e2e chromium y
  firefox OK. Sin probar: `wss://` real (aquí no hay TLS) — queda para X3.
- Consumo: semana 39 % → 40 %.
- Commit: ver `git log` de main (S2).
- Siguiente: P1 (ficha técnica + `limits.json`).

## 2026-10-15 01:32 · P1 · hecho
- Qué: ficha técnica del motor. `limits.json` para máquinas y `docs/FICHA-TECNICA.md` para personas: servidor, cuatro niveles de aparato (A–D), navegador, gráfica y red, con niveles Base/Mejorado/Frontera. Cada número dice si es medido (y qué prueba lo mide) o estimado (y de dónde sale). Un test nuevo lo valida.
- Números: 23 pruebas en verde; puertas OK (tick p99 8,5 ms en la plaza de 1.000, 25,0 kbit/s por persona). Lo medido viene de los diarios anteriores; la tabla de aparatos es toda estimada hasta P2. WebKit sin probar.
- Consumo: semana 41 % → ver `hermes usage` (≈ 41–42 %).
- Commit: ver `git log` de main (P1).
- Siguiente: J0 (catálogo de lo que espera un jugador).

## 2026-10-15 02:31 · J0 · hecho
- Qué: `docs/JUGADOR.md`, el catálogo de lo que espera un jugador: diez grupos (moverse, verse, comunicarse, interactuar, progresar, orientarse, ajustes, VR/AR/móvil, accesibilidad, social). Cada cosa dice qué es, capa, nivel, cómo se ve en escritorio/móvil/VR, qué primitivas necesita, coste en móvil y qué fila la construye. Cola: nuevas N1 (entrada táctil, gamepad, 3.ª persona) y N2 (ajustes y accesibilidad) en `espera a J7`; F1 (amigos, moderación, roles) y F2 (portales y grupo) en `para Opus`.
- Números: solo documentación, sin código; no se han medido cosas nuevas. No se consultó ninguna URL: lo que se dice de VRChat/Roblox/WoW sale del estudio previo y del conocimiento general.
- Consumo: semana 43 % → 43 % (Sonnet).
- Commit: ver `git log` (J0).
- Siguiente: B1 (HTTPS en casa para móviles y visores).

## 2026-10-15 03:31 · B1 · hecho
- Qué: `npm run dev:lan` crea (si falta) un certificado propio con openssl en `.cert/` (fuera de git, válido para localhost y tu IP de casa), sirve la página por https en la red y pasa `/ws` al servidor por el mismo origen; el cliente ya usaba `wss://` en https. En el móvil saldrá un aviso de certificado una vez: se acepta. `tools/auto.sh e2e` tiene ahora una tercera pasada por https (chromium, certificado ignorado, `wss://…/ws`).
- Números: 24 tests verdes (nuevo: detección de IP de casa); e2e chromium, firefox y https OK. No probado en un móvil ni visor real.
- Consumo: semana 43 % → 43 % (Sonnet).
- Commit: ver `git log` (B1).
- Siguiente: D1 (puerta de tipos).

## 2026-10-15 04:35 · J8 · hecho (emulado)
- Qué: botón «Entrar en AR» (solo si el aparato soporta `immersive-ar`; en iPhone no sale y se juega en plano). La sesión busca el suelo, enseña un aro, al tocar o pulsar el gatillo coloca un cubo anclado, y se cierra sola a los 90 s. Todo en `packages/render/src/ar.ts`. Nuevo `tools/e2e-ar.mjs`, ya dentro de `tools/auto.sh e2e`.
- Números: 24 tests verdes; e2e chromium, firefox, AR y https OK. AR probado con el emulador IWER 2.6.0 (MIT, devDependency exacta) como Quest 3: entra, encuentra el suelo (falso), coloca, cierra solo, 0 errores; sin WebXR no hay botón ni errores. No probado en Android/Quest reales: el emulador no demuestra que se vea la cámara ni que el anclaje aguante.
- Consumo: semana 43 % → 43% used (Sonnet).
- Commit: ver `git log` (J8).
- Siguiente: J6 (VR de verdad), que reutiliza IWER.

## 2026-10-15 05:35 · J6 · hecho (emulado, trozo 1)
- Qué: botón «Entrar en VR» (solo si el aparato soporta `immersive-vr`). Dentro: la plataforma sigue a tu avatar, el stick izquierdo da las intenciones de movimiento (en la dirección de la mirada), el derecho gira a saltos de 30° (un empujón = un salto), viñeta de confort que aparece al moverse o girar, mandos con rayo y cuerpo, y un panel 3D con fps, conectados y ping. Todo en `packages/render/src/vr.ts`; nuevo `tools/e2e-vr.mjs`, ya dentro de `tools/auto.sh e2e`.
- Números: gates verdes (24 tests; p99 8 ms; 25 kbit/s). e2e chromium, firefox, AR y VR OK; https falló una vez y pasó a la repetición (software GL pierde fotogramas). VR con IWER como Quest 3: entra, el stick avanza 9.8 m en 2.5 s, mantener el stick derecho da -30° (no gira sin parar), volver da 0°, viñeta 0.8 al moverse, sale limpio, 0 errores. No probado en un Quest real: confort, manos y panel legible solo se juzgan puestos (X1).
- Consumo: semana 43 % → 43 % (Sonnet).
- Commit: ver `git log` (J6).
- Siguiente: J6b (teletransporte con arco, manos, viñeta ajustable); si no, la siguiente fila.

## 2026-10-15 06:33 · P2 · hecho (política y puerta; temperatura sin medir)
- Qué: `packages/render/src/power.ts`, política pura decidida por capacidad (puntero táctil, memoria, saveData): móvil 30 fps y pixel ratio ≤ 1,25, `low-power`, sin antialias; 12 fps si nada se mueve; nada con la pestaña oculta; resolución dinámica (baja ×0,85 si el coste supera el 70 % del presupuesto 2 s, sube tras 6 s holgado); modo batería (`?bateria`, tecla B, saveData). Los pasos de simulación a 20 Hz no se saltan. Puerta de coste por cuadro en `tools/e2e.mjs` (llamadas de dibujo y triángulos contra el nivel D de `limits.json`). `docs/MOVIL-FRIO.md` con el protocolo de `adb`. Dos entradas nuevas por nivel en `limits.json` (`idle_fps`, `pixel_ratio_max`, estimadas).
- Números: gates verdes (28 tests; p99 8 ms; 25 kbit/s). e2e chromium, firefox, AR, VR y https OK. Plaza de prueba: 6 llamadas de dibujo, 243 triángulos por cuadro (límite D: 80 / 150.000). Ojo: en three r186 el contador bueno es `info.render.drawCalls`, `calls` es acumulado. Temperatura y batería reales: sin medir (X1).
- Consumo: semana 43 % → 43 % (Sonnet).
- Commit: ver `git log` (P2).
- Siguiente: A1 (página de multitud) o la siguiente fila pendiente.

## 2026-10-15 07:31 · P3 · hecho
- Qué: `llms.txt` (una página: capas, paquetes, comandos, contratos, límites), `docs/MAPA.md`, un `README.md` por cada uno de los 10 paquetes (qué es, qué no, dependencias, pruebas, API) y `npm run describe` (`packages/cli/src/describe.ts`): JSON de un mundo sin pantalla con entidades, posiciones en metros y quién ve a quién. Test `test/describe.test.ts`: cada paquete tiene README y sale en `llms.txt` (el mensaje de error dice cómo arreglarlo); `describe` es determinista.
- Números: gates verdes (30 tests; p99 7,7 ms; 25 kbit/s). Sin código de navegador: e2e no necesario.
- Consumo: semana 43 % → 43 % (Sonnet).
- Commit: ver `git log` (P3).
- Siguiente: la siguiente fila pendiente (A1 si sigue ahí).

## 2026-10-15 08:57 · J7 · hecho (sesión de Pablo con Opus)
- Qué: enchufe para funciones de juego. Paquete `packages/feature` (entre `net` y `client`/`instance`): `defineFeature` (solo datos: intentos = verbos, eventos, estado por clave, cada campo con esquema; `schema` gana `enum` y `text`), catálogo que cada cliente recibe al entrar (`npm run describe -- --catalogo`), códec que sale del esquema (`writeFields`/`readFields` en `net`), `ServerRuntime` en la instancia (valida, ritmo por jugador e intento, cola hasta el tick, alcance `to`/`near`/`all`, estado para todos y para quien llega tarde, rutas HTTP en el puerto de la instancia, fallos aislados) y `ClientRuntime` en la sesión (acciones con tecla o botón táctil, `view.label`/`bounce`). Mensajes 6/7/8 solo si el servidor corre funciones; `SIN_FUNCIONES=1` arranca el motor desnudo. `features/gestos`: G saluda, H baila, lo ven quienes están a menos de 30 m (texto sobre el avatar y bote; botones en pantallas táctiles). Capas: `features/` solo importa `core`, `schema` y `feature`; solo las raíces de `_composition` importan `features/`. `docs/EXTENDER.md` (receta), README del paquete, `llms.txt`, MAPA, AGENTS, ficha y `limits.json` (5 límites nuevos, medidos). El instalador copia `features/`.
- Cola: J3, J4, J5, N1, N2, R1 y R4 pasan a `pendiente`; J9 nueva (`para Opus`: estado y objetos por cercanía); D4 se acota a los mensajes del núcleo; R1 va antes que J6b (Pablo: la AR primero) y lleva un «Ojo» con las rutas `/e/`.
- Números: gates verdes (42 tests, 12 nuevos; p99 8,5 y 8,7 ms en dos pasadas, la puerta corre sin funciones; 25,0 kbit/s). e2e chromium, firefox, AR, VR y https OK; en chromium, firefox y https la pestaña B camina hasta ~25 m de A, A pulsa G y las dos ven «¡Hola!». La prueba de gestos da la misma huella con y sin funciones. Instalador 564 kB; `deploy-check` OK.
- Cambios de criterio: en el e2e, el movimiento pasa con más de 3,5 m (antes 4): la pasada https dio -4,0 justo una vez, como la que vio J6. Ficha y `limits.json`: XR ya no figura como «no implementado» (J6/J8, con emulador).
- Consumo: semana 43 % → 44 % (Opus).
- Commit: ver `git log` (J7).
- Siguiente: turnos, R1 «Despertar». Sesión con Opus: I1 y S4 (desbloquean R2 y R3), luego J9.

## 2026-10-15 09:15 · S5 · hecho
- Qué: batería de pruebas de capacidad para el X3 (sesión con Pablo, a la espera de que prepare la máquina). El servidor ahora cuenta, además del tick, el retraso de cada tick y la «respuesta» (retraso + duración), la utilización del bucle de eventos, la CPU del proceso, la CPU de la máquina y el **steal**, las pausas de GC, las conexiones (aceptadas, cerradas, rechazadas) y su entorno; `GET /metrics.prom` da lo mismo en formato Prometheus. Los robots miden lo que sentiría un jugador (tiempo de conexión, hasta el primer snapshot, RTT por PING/PONG, hueco entre snapshots, jitter RFC 3550, saltados) con histogramas fusionables (`hist.ts`) y avisan de si ellos mismos están saturados. `swarm.ts` hace escalera (punto de ruptura), remojo (fugas) y tormenta (todos a la vez), juzga con `puertas.ts` y escribe un informe `.json` + `.md`. `bench.ts` (`npm run bench`) mide un núcleo de la máquina sin red. Explicado en `docs/MEDIDAS.md`.
- Números: 47 pruebas en verde (6 nuevas en `test/measure.test.ts`, la del enjambre contra un servidor real tarda ~4 s); puertas en verde; en este PC (Ryzen 9 7950X) `bench`: tick p50 6,1 ms / p99 7,9 ms con 1.000 personas; enjambre local 300 personas: tick p99 7,2 ms, 28,6 kbit/s por persona, RSS 129 MB, RTT p99 5 ms. Hallazgo: el p50 del tick es el tick barato (sin snapshot, 0,09 ms); el p99 es el tick con snapshot. La bandera `--max-semi-space-size=64` no cambia nada (9 pasadas con 1.000).
- Consumo: semana 44 % → ver `hermes usage` (≈ 44 %); modelo Sonnet 5.5 en sesión interactiva.
- Commit: ver `git log` de main (S5).
- Siguiente: X3 con Pablo (OVH VPS-1 y siguientes), después rellenar `limits.json` con lo medido.

## 2026-10-15 09:35 · R1 (trozo 1) · parcial
- Qué: primer trozo de «Despertar». Un QR (una URL firmada `/e/<punto>.<firma>`) hace que todos los jugadores vean una columna de luz con un texto sobre el punto, unos 10 s. Vive en `features/despertar/`; el motor solo ganó dos cosas pequeñas: `api.sign` (firma con el secreto del servidor, `MOTOR_SECRET`) y `view.beacon` (opcional). Un código falso no hace nada, un segundo escaneo mientras dura el efecto tampoco. `npm run enlaces` imprime las URLs; el proxy de casa y Caddy dejan pasar `/e`; el instalador crea el secreto una sola vez.
- Números: 51 pruebas en verde (4 nuevas en `test/despertar.test.ts`); puertas en verde (tick p99 8,0 ms, 25,0 kbit/s; huella sin cambios); e2e chromium, firefox, AR, VR y https verdes. Escaneo → efecto recibido en la página: 4 ms (WebSocket local; no medido con móvil real). La columna dibujada en el navegador NO se ha comprobado en e2e (solo el evento sin pantalla).
- Consumo: semana 45 % → 45 % (Sonnet 5.5; `hermes usage` no se movió en el entero).
- Commit: ver `git log` de auto (R1 trozo 1).
- Siguiente: resto de R1 (QR en SVG, comprobar la columna en e2e, escuchar en la red de casa), luego R4.

## 2026-10-15 10:08 · saber · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «coge todo lo que hemos aprendido en el proyecto e intégralo en el motor». Nuevo `docs/SABER.md`: decisiones tomadas (con su porqué y su fuente), lo medido, hechos de plataforma, reglas aprendidas (red, cliente y XR, contenido y licencias, animaciones, agentes de IA, accesibilidad, realidad cruzada, operación), lo que nos enseñó Hyperfy, preguntas abiertas de Pablo y qué fila sale de qué estudio. `AGENTS.md` gana cinco reglas que obligan a toda tarea (camino accesible de cada función, texto no fiable fuera de las instrucciones de un agente, licencias, nada de mandar a todos ni fiarse del cliente, números de una pasada). Cola: 14 filas de accesibilidad (V1–V14, con el punto de parada «accesible») y las piezas de `CONSTRUIR.md` que no tenían fila (M6, M9, M10, M16–M23, M25, M26, O2–O5, W1) más P5 (el habitante IA con las lecciones de Procyon), cada una con su detalle. J1 recoge lo aprendido convirtiendo movimientos; N2 y F2, lo decidido; `docs/EXTENDER.md` pide el camino accesible de cada función.
- Arreglo: R1 tenía el estado «pendiente (trozo 1 hecho)» y `tools/auto.sh` solo reconoce «pendiente» exacto: por eso el turno de las 11:30 (hora de Madrid) saltó a R4. Ahora R1 vuelve a ser la siguiente; regla escrita en `AGENTS.md`. Ese turno se cortó a las 11:47 por un reinicio del gateway: su R4 a medias está en `git stash` de la copia `auto` (nota en el detalle de R4).
- Números: solo documentos; puertas en verde (51 pruebas; p99 8,1 ms; 25,0 kbit/s); 76 filas en la cola, sin duplicados ni esperas rotas.
- Consumo: semana 47 % (Opus).
- Commit: ver `git log` (saber).
- Siguiente: turnos, R1 (resto). Sesión con Opus: I1 → S4 → V1 → J9. X3 cuando Pablo tenga la máquina.

## 2026-10-15 10:46 · T1 · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «cuando monte la máquina y me meta con el móvil, captura la información de la sesión; igual con las gafas; distingue cómo entra cada jugador». La página manda al servidor un mensaje nuevo REPORT (tipo 9, aditivo, JSON ≤ 1.000 bytes): `entrada` (clase de aparato, modelo, sistema, navegador, UA, backend y GPU, núcleos, memoria, pantalla, XR posible, red, batería, preferencias, tiempos hasta jugar, huella igual), `pulso` cada 10 s (modo, cuadro p50/p99/peor, cuadros perdidos, Hz de la XR, coste, escala, ping, correcciones, batería, errores, memoria), `xr` (entra, sale o falla con el motivo) y `error`. `packages/server/src/sesiones.ts` guarda solo lo que conoce, una línea por informe en `SESIONES_DIR/sesiones-<día UTC>.jsonl` (14 días, sin IP ni identidad; los robots no escriben nada), y `sale` al cerrar (también al parar el servidor con SIGTERM). `GET /sesiones` en vivo (no publicado); `npm run sesiones` para personas. El instalador crea `/var/lib/numinia-motor/sesiones`. Cola: I1 queda en identidad de invitado; vincular móvil y ordenador pasa a I2 (aparcada, Pablo: «de momento no»); B3 hecho dentro de T1; X5 apunta el móvil viejo en modo depuración.
- Números: 59 pruebas (8 nuevas en `test/sesiones.test.ts`); puertas en verde (tick p99 7,8 ms; 25,0 kbit/s; huella sin cambios); e2e chromium, firefox, AR, VR y https verdes, y en chromium, firefox y https las dos pestañas mandan `entrada` y `pulso` con su backend. Lo que se vio: Chrome sin pantalla con GL por software dibuja a ~20 fps (pierde 59–87 % frente a 60), Firefox 0,4 %; el emulador IWER aparece como «visor · Quest Browser 33.0».
- Trampa: en este contenedor, `mkdir` dentro de `/proc` se queda colgado para siempre: las pruebas de «carpeta sin permiso» usan una carpeta bajo un fichero (ENOTDIR).
- Consumo: semana 47 % (Opus).
- Commit: ver `git log` (T1).
- Siguiente: instalador nuevo para el X3 (con T1 dentro); sesión con Opus: S4 → V1 → I1 → J9.

## 2026-10-15 10:52 · V1 · hecho (sesión de Pablo con Opus)
- Qué: la accesibilidad pasa a ser parte de la declaración de cada función de juego. `defineFeature` exige `spoken` en cada intento (el verbo dicho en voz alta), `announce` en cada evento (texto con `{campo}`, sonido de la lista del motor, importancia 0–3, dónde o sobre quién) o `"silent"`, y `state.card` (rol, nombre, descripción, acciones, dónde) para lo que se pone en el mundo; si falta algo, la función no se carga y el error dice cómo arreglarlo. El catálogo lo lleva (un agente lee lo mismo que un lector de pantalla); el cliente tiene `announcements`, `cards()` y `view.announce`; la plaza pone cada anuncio en una región `aria-live` (urgente si es de seguridad). `gestos` y `despertar` cumplen. La ficha no es un componente de la simulación: va en la declaración y en el estado, así que no cuesta red por tick ni cambia la huella. V3 y V4 pasan a `pendiente`.
- Números: 67 pruebas (8 nuevas en `test/accesible.test.ts`); puertas en verde (tick p99 8,3 ms; 25,0 kbit/s; huella sin cambios); e2e chromium, firefox, AR, VR y https verdes; en chromium y firefox las dos pestañas tienen «Gesto: saludar» en su región `aria-live`.
- Consumo: semana 47 % → ver `hermes usage` (Opus).
- Commit: ver `git log` (V1).
- Siguiente: turnos, R1 y V3/V4 cuando les toque. Sesión con Opus: S4 → I1 (solo invitado) → J9.

## 2026-10-15 10:56 · S4 · hecho (sesión de Pablo con Opus)
- Qué: lo que guardan las funciones sobrevive a un reinicio. Decisiones: la simulación nunca se guarda (los avatares son de paso; la huella no se toca); ficheros de texto por función en `DATOS_DIR` (`<id>.json` foto + `<id>.jsonl` diario), no SQLite (sin dependencias, legibles con `cat`); se escribe cada segundo y al parar (SIGTERM), un apagón pierde ≤ 1 s; el diario se pliega en una foto a las 1.000 líneas. Declarado en la función: `state.persist: true` (vuelve antes de que entre nadie, comprobado contra el esquema de hoy; lo que ya no cabe se descarta y se dice) y `store: { describe }` → `api.store` (solo servidor, JSON ≤ 4.096 bytes, ≤ 10.000 claves). `despertar` guarda cuándo se despertó cada punto y cuántas veces. Instalador: `DATOS_DIR=/var/lib/numinia-motor/datos`; en casa `.run/datos`. 3 límites nuevos en `limits.json`.
- Números: 73 pruebas (6 nuevas en `test/datos.test.ts`: reinicio sin pérdida, línea cortada, esquema que cambia, plegado a 1.050 líneas, topes del almacén, servidor real con un QR recordado tras reiniciar); puertas en verde (tick p99 8,2 ms; 25,0 kbit/s; huella sin cambios).
- Consumo: semana 47 % → ver `hermes usage` (Opus).
- Commit: ver `git log` (S4).
- Siguiente: R2 y R3 siguen esperando a I1. Sesión con Opus: I1 (solo invitado) → J9.

## 2026-10-15 11:01 · I1 · hecho (sesión de Pablo con Opus)
- Qué: identidad de invitado, sin cuenta ni datos personales (vincular aparatos queda fuera: I2, Pablo «de momento no»). El servidor da un billete firmado (`g1.<id>.<día>.<firma>`, HMAC con `MOTOR_SECRET`; sin secreto, uno de usar y tirar y el registro lo avisa); la página lo guarda en `localStorage` y lo enseña al volver con un mensaje nuevo IDENTITY (tipo 10, aditivo): el mismo navegador es el mismo invitado («Invitado ASC6»), también en dos pestañas; falso o de más de 180 días → invitado nuevo; a los 30 días se renueva. Las funciones tienen `api.onIdentify` y `api.who` y guardan lo de cada persona por `quien.id`. El HUD dice tu nombre de invitado. R2, R3, V8 y O4 pasan a `pendiente`.
- Números: 78 pruebas (5 nuevas en `test/identidad.test.ts`); puertas en verde (tick p99 8,1 ms; huella sin cambios); e2e chromium, firefox, AR, VR y https verdes; en chromium y firefox las dos pestañas son el mismo invitado.
- Consumo: semana 47 % → ver `hermes usage` (Opus).
- Commit: ver `git log` (I1).
- Siguiente: turnos, R1 → R2 → R3 → R4. Sesión con Opus: J9 (estado por cercanía).

## 2026-10-15 11:05 · J9 · hecho (sesión de Pablo con Opus)
- Qué: las cosas que una función pone en el mundo (`state.set` con `at`) llegan solo a quien está cerca (`state.radius`, 64 m por defecto); al moverse, cada jugador recibe lo que se acerca y olvida lo que pasa de radio × 1,25; quien llega tarde recibe solo lo cercano; si una cosa se aleja de alguien, se le borra; al borrarla solo se enteran quienes la tenían. Lo que no tiene `at` sigue llegando a todos. Decisión: los objetos no son entidades de la simulación (la huella no cambia); lo que necesite física, M6. Rejilla de celdas del ancho del radio y repaso repartido (una décima de los jugadores por tick). El mensaje STATE es el de siempre.
- Números: 83 pruebas (5 nuevas en `test/cercania.test.ts`); 1.000 jugadores × 2.000 cosas: repaso completo 4,5 ms, por tick 0,24 ms; puertas en verde (tick p99 8,9 ms; huella sin cambios). 2 límites nuevos.
- Consumo: semana 47 % → ver `hermes usage` (Opus).
- Commit: ver `git log` (J9).
- Siguiente: filas `para Opus` que quedan: F1, F2, S3, P4, D4, M6, M10, V9, M19, M20, M9.

## 2026-10-15 11:07 · e2e propio · hecho (sesión de Pablo con Opus)
- Qué: las pruebas en navegador usaban el `playwright-core` de otra carpeta (`work/archive-world-agent`), que otra sesión borró: tras J9 todas las piernas del e2e salieron «FALLA» porque no arrancaba el navegador (y el commit de J9 llegó a main sin e2e: fallo mío, la cadena no miraba el resultado). Ahora `playwright-core` 1.64.1 es dependencia de desarrollo exacta del motor (Apache-2.0; la 1.64 usa Firefox 1555, el que hay instalado; Chromium sigue con su ruta fija al 1243), y `tools/e2e*.mjs` la buscan en `node_modules` del propio repositorio.
- Números: e2e chromium, firefox, AR, VR y https verdes otra vez (con J9 dentro).
- Regla: un commit que toca código de navegador o de funciones no se lleva a main si `tools/auto.sh e2e` no dice OK en todas las piernas.
- Commit: ver `git log` (e2e propio).

## 2026-10-15 11:59 · paridad Hyperfy2 · hecho (sesión de Pablo con Opus)
- Qué: `docs/HYPERFY2-PARIDAD.md` contesta «¿qué falta para llegar como mínimo al nivel de Hyperfy2?»: 78 capacidades leídas en el código del fork (v0.13.0: nodos, sistemas, API de scripts y del jugador, órdenes, subidas, guardado) frente al motor, cada una con su fila. Filas nuevas H1–H13: H1 objetos del mundo, H3 roles y órdenes, H2 efectos sobre el jugador (las tres para Opus); H4 entorno, H6 imagen y paneles, H12 calidad gráfica, H8 partículas (pendientes, detrás de V7); H5, H7, H9, H10, H11, H13 esperan a su fila. Ampliadas J2 (correr y doble salto), J3 (canal de la zona, `/` va a las órdenes), J4, N1, N2, M6, M16–M20, M22 (ahora constructor en vivo, espera a H1) y F1 (los roles pasan a H3). Decisión: se construye en vivo como en Hyperfy2; los agentes de IA, por PR (SABER §1). Tres paradas: PH1 se visita, PH2 se construye, PH3 se programa. `AGENTS.md`: al cerrar una fila, el turno pasa a `pendiente` las que la esperaban; horas del diario en UTC.
- Números: 13 ✔, 15 ◐, 50 ✘ de 78; 83 pruebas en verde; puertas en verde (tick p99 7,9 ms; 25,0 kbit/s). Solo documentos.
- Consumo: semana 47 % → 48 % (`hermes usage`), Opus.
- Commit: ver `git log` (paridad Hyperfy2).
- Siguiente: Pablo decide si J2, J1 y J3 van antes que R2–R4 y V3–V7. Sesión con Opus: H1 → M6 → H3 → H2 → M19 → M20.

## 2026-10-15 12:09 · cola y agentes · hecho (sesión de Pablo con Opus)
- Qué: Pablo (15-10): «sí» a adelantar lo básico de la paridad con Hyperfy2 → J2 (saltar, correr), J1 (avatares VRM) y J3 (chat con nombres) van justo detrás de lo que queda de R1, delante de R2–R4 y V3–V7. Y corrige una regla: «los agentes digitales tendrán también sus permisos y podrían tener permiso para crear cosas en directo» → lo que puede hacer un agente lo decide su rol, como a cualquiera (cambiado en `docs/HYPERFY2-PARIDAD.md` §2, SABER §1 y §3.5, H1, H3 y M22); sigue en pie que nunca modera a personas, que dice que es una IA y que lo que hace queda firmado como suyo.
- Números: solo documentos.
- Consumo: semana 48 %, Opus.
- Commit: ver `git log` (cola y agentes).
- Siguiente: sesión con Opus, H1 (objetos del mundo).

## 2026-10-15 12:29 · H1 · hecho (sesión de Pablo con Opus)
- Qué: objetos del mundo, la columna de la paridad con Hyperfy2 (sus `blueprints` + `entities`). `features/objetos`: colocar un modelo de la biblioteca de la casa (`activos/`: un bloque propio hecho por `tools/hacer-bloque.mjs` y el robot CC0), moverlo, girarlo, escalarlo, duplicarlo, fijarlo, nombrarlo, borrarlo y deshacer (50 cambios por constructor; un arrastre de menos de 1 s es uno). La lista de la zona llega entera a quien entra; se guarda como texto (S4) con quién colocó qué solo en el servidor; los ids no se repiten. Quién construye lo dice el servidor con `api.puede` (nuevo en el enchufe): hoy `MOTOR_CONSTRUIR=todos` o nadie (lo de fábrica; la plaza de casa y el e2e lo abren); H3 lo hará por rol, personas y agentes igual. El servidor sirve los ficheros por su sha256 (`GET /a/<sha256>.glb`, caché de un año). La página los dibuja (`view.place`; el cargador glTF solo se baja con la primera cosa; la primera animación en bucle a menos de 40 m) y enseña un panel «Construir» (tecla C, botones HTML) a quien puede. Una ficha sin nombre es decorado y no se lista. De paso, el enchufe codifica cada entrada de estado una vez (entrar con 2.000 objetos: 7,2 → 0,3 ms). Instalador: Caddy pasa `/a/*`, `activos/` va dentro.
- Números: 92 pruebas (9 nuevas); puertas en verde (tick p99 7,7 ms); e2e chromium, firefox, AR, VR y https verdes (la pestaña B dibuja el bloque de A y lee su ficha «Bloque»; A lo gira 90° y deshace dos veces); 2.000 objetos = 186,8 kB al entrar; cliente 245 kB comprimidos al arrancar (antes 228) + 15 kB con la primera cosa; deploy-check sirve el robot por su sha256.
- Consumo: semana 48 % → 50 % (`hermes usage`), Opus.
- Commit: ver `git log` (H1).
- Siguiente: H9 (subir ficheros) y M22 (constructor con gizmos) pasan a `pendiente`. Sesión con Opus: M6 (física) → H3 → H2 → M19 → M20.

## 2026-10-15 14:19 · N1 M22 H9 J2 J1 J3 · hecho (sesión de Pablo con Opus, seis agentes en paralelo)
- Qué: Pablo: «valor primero a los usuarios, empezando por lo que más aprecia quien construye: la cámara con el ratón, acercar y alejar, coger un objeto con sus ejes X, Y y Z, como en Blender». Seis ramas a la vez, cada una en su propia carpeta de git (`work/numinia-engine-wt/<rama>`), juntadas en `main`: cámara con ratón (N1: órbita, rueda hasta primera persona, andar hacia donde miras, dedos, mando, pantalla completa), constructor con gizmo (M22: clic selecciona; mover, girar y escalar con las asas X roja, Y verde, Z azul; coger; colocar donde apuntas; inspector; deshacer y rehacer; teclas de Hyperfy2 y de Blender), subir tu propio .glb soltándolo en el mundo (H9), saltar, doble salto y correr (J2, formato 2), avatares VRM de la casa con animaciones (J1, trozo 1) y chat con bocadillos y nombres sobre la cabeza (J3). Al juntar: `/a/` sirve lo que se puede subir más las `.vrma`; una sola `escribiendo()` para todas las teclas de la página; la pierna de la cámara pellizca lejos de la columna de botones táctiles, que crece con «Saltar» y «Chat». Para trabajar en paralelo: `tools/auto.sh e2e` acepta puertos y núcleos (`E2E_*`), una pierna del e2e por área en `tools/e2e-piernas/`, notas de entrega por rama (ya pasadas a BACKLOG y SABER).
- Números: 148 pruebas (antes 92); puertas en verde (tick p99 7,7 ms; 26,7 kbit/s; huella de las puertas `f719d31b`); huella de referencia `93b192c8` (antes `fa94375e`); enjambre de 1.000 con J2: p99 19,3 ms, 27,2 kbit/s; e2e chromium, firefox, AR, VR, avatares, chat, constructor, salto, subir y https OK, y cámara OK tras mover su pellizco; arranque 272,6 kB gz (antes 248,7; tope 300), three-vrm 65 kB gz aparte, gizmo 5,5 kB aparte.
- Consumo: semana 50 % → 53 % (`hermes usage`), Opus; diez agentes a la vez.
- Commit: ver `git log` (Merge wt/salto … Merge wt/chat).
- Siguiente: juntar la segunda ola (entorno: luz, texturas, agua, fuego; misiones y PNJ; mapa y ficha; ajustes). Filas nuevas: N1b, M22b, M22c, H9b, J2b, J1b, J3b, J3c; H10 (tu avatar) pasa a pendiente. El arranque se acerca al tope: lo pesado de la segunda ola, perezoso.

## 2026-10-15 15:58 · N2 J5 J4 H4 H8 H12 · hecho y en curso (sesión de Pablo con Opus, segunda ola de cuatro agentes)
- Qué: Pablo: «el libro de misiones, PNJ que dan misiones, el mapa, la ficha de jugador, el menú de ajustes del motor (tiene que poder crecer según mejore la técnica o lo pidan las aventuras), luz y texturas, agua, fuego, tierra, aire». Cuatro ramas a la vez, juntadas en `main`: menú de ajustes con registro de datos y capacidades (N2: motor, funciones y mundos declaran sus ajustes; tecla O), misiones y personas como texto de la aventura con su conversación, libro y aviso E (J5, J11, núcleo de J4), minimapa, mapa grande con destino y ficha de jugador (J5, J12; teclas M e I), y entorno como datos con cielo, sol, niebla, viento, suelos CC0, agua, fuego, humo y polvo con partículas en la GPU y calidad por nivel de aparato (H4, H8, H12). Al juntar: una sola `escribiendo()` (había tres copias); la cámara gana `view.cam.ajustar` (sensibilidad e invertir eje) para el menú; los ajustes piden al entorno solo lo elegido (el resto sigue el nivel que ve el entorno, B en VR: sin eso, en VR seguía habiendo sombras); línea de ayuda corta entre «Misiones» y el minimapa; la caja del chat deja sitio al minimapa en pantallas estrechas; las piernas de cámara buscan un sitio libre de la vista 3D para los dedos y la rueda (el minimapa los tapaba); la pierna de misiones comprueba que el mapa marca el objetivo (lo que pedía J5).
- Números: 200 pruebas (antes 148); puertas en verde (tick p99 8,3 ms; 26,7 kbit/s; huella de las puertas `f719d31b`); e2e completo en verde (chromium, firefox, AR, VR, ajustes, avatares, cámara, chat, constructor, entorno, mapa, misiones, salto, subir, https); tick de las funciones con 1.000 esperando llegar a un sitio p99 0,18 ms; entorno en el nivel D 12–22 llamadas; **arranque 342 kB gz, por encima del tope de 300** (fila D2, con el plan: alias a las fuentes de three −24,5 kB, mapa, ficha y menú perezosos).
- Consumo: semana 53 % → 56 % (`hermes usage`), Opus.
- Commit: ver `git log` (Merge wt/ajustes … Merge wt/entorno y los dos de integración).
- Siguiente: sesión nueva de Pablo con Opus, «la versión avanzada antes de subirlo»: pantalla de carga (y con ella D2), zona de usuario, menú del juego e interfaz modificable con addons y mods. Filas nuevas: N3, N4, J11–J16, H4b, H4c, H8b, H12b, H12c, M6b.

## 2026-10-15 18:08 · licencia AGPL, plan U · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «el motor va a ser AGPL»; el repositorio pasa a ser público en GitHub (`numengames/numinia-engine`, `main` solo por PR que él aprueba; el turno nunca empuja). `package.json` AGPL-3.0-only; AGENTS, README, llms, SABER, JUGADOR al día. Plan de interfaz, menú, zona de usuario, addons y mods (`../mmo-browser-study/INTERFAZ-Y-MODS.md`, notas 26–35 verificadas): filas U1–U9 e I3 (passkey, camino B de Pablo) en la cola; decisiones en SABER §1 (passkey, marcos, edades fuera del motor).
- Números: 200 pruebas; puertas en verde (tick p99 7,5 ms; 26,7 kbit/s; huella `f719d31b`). Sin cambios de código.
- Consumo: semana 60 % → 61 % (`hermes usage`), Opus.
- Commit: este.
- Siguiente: publicar en GitHub (PR) y desplegar en bronte-xs-ca-003 para la QA de Pablo; después U1 y U2 en local.

## 2026-10-15 18:55 · IAs del motor: diseño y primer habitante (P4a) · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «diseñamos las IAs del motor y construimos el primer habitante para verlo en la máquina de pruebas». Diseño en `../mmo-browser-study/DISENO-IAS-MOTOR.md` (D1–D13: diez cerradas; D4, D7 y la cifra de D8 se cierran en P5a; D11 en P4b). Construido: `packages/agent` (cuerpo, guion E0, `habitante@1`, servicio `numinia-habitantes`), billete de agente con secreto aparte y marca « · IA» puesta por el servidor, `tap()` en el cliente de funciones, Lía en `aventuras/ejemplo/habitantes/`, segundo servicio en el instalador (`--sin-habitantes`), `tools/plaza.sh` la arranca. Filas: P4 → P4a (hecha) + P4b; P5 → P5a + P5b; M26 y V12 esperan a P4b. Paquete del instalador con licencia AGPL (decía MIT).
- Números: 207 pruebas (antes 200); puertas en verde (tick p99 7,8 ms; 26,7 kbit/s; huella `f719d31b`); `deploy-check` OK con «Lía · IA» dentro; QA en navegador (chromium, plaza local): saludo, «¿quién eres?», «sígueme» (acaba a 2,0 m), «pasea», 0 errores. A mano: 200 habitantes = tick p99 4,2 ms, servicio 14,1 % de un núcleo y 329 MB.
- Consumo: semana 61 % → ver `hermes usage`, Opus.
- Commit: este (rama `habitantes/lia-e0`, sin subir).
- Siguiente: con permiso de Pablo, PR #2 y pre-publicación `v0.1.0-qa.1` con el instalador; su ayudante instala en bronte-xs-ca-003. Después P4b (Sonnet) y P5a (Opus).

## 2026-10-15 19:30 · publicar solo desde GitHub y el mundo en un zip (X6, H14) · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «no quiero estar subiendo ficheros a mano; que esté todo empaquetado en GitHub, que el servidor lo baje y funcione; y que el mundo se pueda bajar en un zip o subir un zip». (1) `tools/publicar-version.sh`: desde un commit limpio que ya está en `main`, `npm run deploy` + `deploy-check` y publica la versión `motor-<build>` con `instalar-motor.sh`, `SHA256SUMS` y lo que se adjunte (un mundo en zip), marcada «latest». El workflow que lo correrá en cada fusión queda fuera (la App no puede escribir `.github/workflows/`; Pablo lo sube otro día). `.gitignore`: `node_modules` sin barra, para que un enlace simbólico no marque el árbol como sucio. (2) `instalar-motor.sh --auto-actualizar`: temporizador `numinia-actualizar` (10 min) que corre `deploy/actualizar.sh`: lee la última versión de la API pública, comprueba sha256 (SHA256SUMS y el `digest` de GitHub) y `--version`, espera si hay gente (hasta 6 h), guarda el instalador anterior y vuelve a él si el nuevo falla (`FALLO`: no lo reintenta solo), pausa con `PAUSA`. Las opciones de la instalación se guardan en `instalacion.env` y una ejecución sin ellas las conserva (`--sin-dominio` para volver a IP). (3) `/mundo`: página con «Descargar el mundo» y «Subir un mundo»; `GET|POST|PUT /mundo/zip`, `GET /mundo/estado`, con el código `MOTOR_ADMIN` que el instalador hace una vez en `admin.env` (nunca lo imprime); el zip = `mundo.json` (cada fichero con bytes y sha256) + `datos/` (funciones y modelos subidos; sin sesiones ni `subidas.jsonl`); la subida va a disco, se comprueba entera por reglas (`zip.ts`: contraseña, zip64, enlaces, `..`, bombas, CRC) y contra su manifiesto, se cambia `datos/` dejando `datos.antes-<UTC>` (las dos últimas) y el servidor se reinicia (systemd). Caddy pasa `/mundo*`.
- Números: 221 pruebas (antes 207: `mundo-zip` 8, `actualizar` 5, `deploy` 1); capas OK; `deploy-check` además prueba `actualizar.sh` y baja un zip del mundo que pasa `unzip -t`.
- Commit: este (rama `publicar/version-y-mundo-zip`, sin subir).
- Siguiente: PR #3; al fusionarla, `tools/publicar-version.sh mundo-plaza-de-pablo.zip` publica `motor-<build>` con el mundo de la plaza de Pablo; el ayudante instala en bronte-xs-ca-003 con `--auto-actualizar` y Pablo sube el zip en `/mundo`. Después: el workflow (Pablo), la aventura dentro del zip, la sala de numinia.com.

## 2026-10-15 21:00 · el cerebro de los habitantes y sus manos (P5a, E2/E4) · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «quiero que la IA pueda hacer cosas dentro del mundo; el cerebro primero; la clave es la del mundo de TRG26 (el puente); y que en primera instancia todos puedan construir y mover objetos». El puente del agente de Hyperfy pasa DENTRO del servicio `numinia-habitantes`: `packages/agent/src/cerebro.ts` (API de mensajes de Claude con herramientas, reglas y herramientas en caché, la clave solo en su cabecera, errores sin cuerpo; topes por minuto, por persona y por día UTC; cerebro de eco para pruebas), `mente.ts` (cuando le hablan por su nombre y no es una orden corta: reglas + persona en el sistema, lo que ve en UN `<material>`, la pregunta detrás; las herramientas gesto, ir_a, seguir, quieta, pasear y, si el mundo deja construir, colocar con escala, mover, borrar, deshacer; cada llamada se comprueba en código (12 por respuesta, 40 m, escalas 0,1–10, altura 0–30, modelos de la biblioteca) y el cuerpo la envía como una persona; contesta en el canal en que le hablaron; memoria de 4 turnos por persona, 5 min, solo en memoria). `guion.ts`: enchufe `pensar`, con cerebro una orden corta tiene que SER la frase. `habitante@1`: escalón 0, 2 o 4 y `cerebro.persona`. Lía pasa a E4. Instalador: `--clave-ia` (sin eco, comprobada con Anthropic, `cerebro.env` 0640 root:numinia-hab, solo para habitantes), `--modelo-ia`, `--quitar-clave-ia`, `IPAddressAllow` a los rangos publicados de Anthropic (160.79.104.0/23, 2607:6bc0::/48, leídos hoy) solo con clave; `--construir todos|nadie`, por defecto todos, guardado.
- Números: 230 pruebas (antes 221: `cerebro` 8, `deploy` 1); puertas en verde (tick p99 8,4 ms); `deploy-check` OK: el servicio empaquetado enchufa el cerebro de eco y Lía coloca un bloque pedido por el chat de zona. Coste estimado con precios leídos hoy (Sonnet 5: 2 $/10 $ por millón de tokens): ≈ 0,004 $ por respuesta con caché; tope de 300 al día ≈ 1,3 $/día como mucho.
- Commit: este (rama `habitantes/cerebro`).
- Siguiente: PR #4 → versión → en alchemiststower `sudo bash instalar-motor.sh --dominio alchemiststower.numinia.com --clave-ia` → probar con Claude de verdad. Después: roles (H3), E1, la ficha del habitante (P4b), revisión del contrato del proveedor (D7).

## 2026-10-16 03:25 · H3a · hecho
- Qué: los roles del mundo son los de numinia.com (STD-051/052), no los de Hyperfy. `packages/server/src/roles.ts`
  (reglas puras: 17 permisos, plantilla «Comunidad», dueños, `administrator`, altura, quién da qué) y `roles-mundo.ts`
  (los roles de un mundo en una función del servidor, guardados en datos/, y las órdenes del chat: /roles, /dueño
  <código de administración>, /dar, /quitar, /silenciar, /echar 10 min, /vetar con motivo, /perdonar,
  /solo-miembros). Todo permiso (objetos, subidas, Lía) pregunta a los roles; un visitante o una IA = @todos, y
  `--construir todos` pone «build-in-worlds» en @todos. El chat calla a quien está en silencio; objetos vuelve a
  decir a la página si construye cuando cambia un rol. Diseño: `../mmo-browser-study/ROLES-MOTOR-Y-NUMINIA.md`.
- Números: 239 pruebas (9 nuevas), puertas en verde (tick p99 8,1 ms con mil), deploy-check OK (Lía construye).
- Consumo: Opus 5.5.
- Commit: rama `roles/std-052`, sin subir.
- Siguiente: H3b (el pase de numinia.com) y, en el hilo de organizaciones, firmar el pase y el botón «Entrar».

## 2026-10-16 03:34 · constructor más fácil, imágenes, vídeo, zonas de sonido, sólido y micrófono (U10) · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «las misiones no se ven, se ocultan tras el chat; no se puede borrar un GLB; los objetos no tienen tiradores como en OnCyber o Hyperfy; zonas de audio con esferas translúcidas visibles o invisibles con mp3 u ogg; micrófono; pantalla de vídeo; subir imágenes; un booleano para la colisión». (1) Interfaz: el libro de misiones abre arriba a la izquierda, por encima del chat; al construir el minimapa se aparta (tapaba «Borrar» y el inspector); asas del gizmo un 40 % más grandes; una barra flota sobre lo seleccionado (Coger, Mover, Girar, Escalar, Duplicar, 🗑 Borrar); doble clic en un objeto jugando abre construir con él. (2) `objetos` versión 3: `tipo` (modelo, imagen, video, sonido) y `ext`, `oculto`, `volumen`, `solido` y su caja en el mundo; verbo `ajustar`. `packages/render/src/medios.ts`: imagen en un plano, vídeo en bucle con el mismo reloj para todos (se para lejos), esfera de sonido (dentro suena, se apaga en el borde, invisible al jugar si está oculta). `/a/` sirve rangos de bytes (vídeo). Subir: botones Imagen…, Pantalla de vídeo…, Zona de sonido… y soltar cualquiera de esos ficheros. (3) Sólido: la simulación tiene cajas (no entran en la huella): chocas, te deslizas por la pared, subes escalones de hasta 40 cm y te quedas encima; servidor y predicción las sacan del mismo estado. (4) Voz: tipo de mensaje 11 (aditivo), el servidor reenvía cada trama solo a quien está a 30 m y la ve, tope 60/s; la página usa Opus (WebCodecs) o µ-law, y suena desde donde está quien habla.
- Números: 239 pruebas (antes 230: `medios-solidos` 6, `voz` 3); puertas en verde (huella `f719d31b`, tick p99 7,7 ms); navegador (chromium, 1280×720): mp3, png y webm subidos y dibujados, esfera oculta, imagen sólida (1 caja en la simulación de la página), borrar con la barra; voz entre dos pestañas a 7,5 m con micrófono falso: 35 tramas Opus enviadas, 35 recibidas.
- Commit: este (rama `ux/edicion-audio-voz`, sin subir).
- Siguiente: que Pablo lo pruebe; luego VR y móvil (gizmo con el dedo, M22b; voz en VR), silenciar a una persona (F1), medir el coste de los sólidos con 1.000 personas (M6).

## 2026-10-16 04:10 · manos y mandos en VR, la plaza en la mesa en AR (J10 trozo 1, J8b) · hecho (sesión de Pablo con Opus)
- Qué: Pablo: «que funcione mejor la AR y la VR, una misión nueva en la que tengas que coger dos objetos, que se vean las manos y que los mandos funcionen». VR: `packages/render/src/manos.ts` (perezoso): una mano dibujada en cada mando (los dedos siguen gatillo y agarre), o tus manos con seguimiento (25 articulaciones); halo + vibración junto a lo que se puede coger y agarre/gatillo/pellizco lo coge; rayo + gatillo habla con una persona; diálogo en un panel 3D (rayo, o palanca + A; B sale); notas delante; Y trae el panel de la misión; lo cogido va en la mano que lo cogió. Misión de ejemplo «Manos a la obra» (Teo, regadera azul, saco dorado; `cosa@1` + `posicion.y`, `apariencia.color`). AR: la plaza en miniatura y en vivo sobre la mesa, palancas para girar, escalar y andar, `hit-test` opcional, 20 min en visor. Lo que no anima se hornea en una malla por material (robot 19 → 3 llamadas).
- Números: 232 pruebas; puertas en verde; e2e completo: chromium, firefox, https, AR, VR, manos y las demás piernas en verde salvo `constructor` (intermitente también en la base: 1 de 3 en la base, 2 de 3 en esta rama); llamadas de dibujo al empezar 65 (base) → 85 con Teo sin hornear → bajo 80 horneando (la pierna `avatares`, roja en la base, pasa); arranque 336,7 → 341,8 kB gz (manos aparte, 3,4 kB).
- Consumo: semana 65 % (`hermes usage`), Opus 5.5.
- Commit: este (rama `xr/manos-y-mandos`, sin subir).
- Siguiente: Pablo lo prueba en el Quest 3 / Pico 4 por https en la red de casa; con lo que vea, arreglos; luego coger en cualquier orden, soltar, arco de teletransporte.

## 2026-10-16 04:16 · la cara de Numinia, todo a la derecha y quién oye cada sonido (U11) · hecho (sesión de Pablo con Opus)
- Qué: Pablo, tras probar U10: «las misiones a la derecha y el mapa arriba a la derecha; construir con un icono; la guía de diseño de numinia.org (iconos, paletas, paneles); el vídeo con su burbuja de audio, y si se oye para todo el mundo, para la zona o solo dentro de la burbuja, con su radio». (1) `apps/plaza/tema.css`: valores del Numinia Design System (STD-023, leídos en numinia-archive a4bb4ff4): Nocturno (#14110F, superficies #1E1A17/#292420, texto #F9EBDC/#C4B5A6, líneas #3A332D), foco Turquesa 2 px, acción #017C8D, activo tinta sobre papel, destructivo Grana, radios 6/8, sin sombras, Geist y Geist Mono autoalojadas (`public/fuentes`, OFL). Arriba a la derecha una barra de iconos (ajustes, construir con `crane-tower`, micrófono, pantalla completa, VR, AR); debajo el minimapa; debajo «Misiones» y su libro. `apps/plaza/iconos.ts`: los glifos Phosphor de la casa (`web/src/icons/`), copiados; `microphone` y `microphone-slash` NO están en el subconjunto de STD-023 §11 (decisión pendiente del Oráculo). (2) `objetos` versión 4: `alcance` (burbuja, zona, todos) y `radio` (burbuja de un vídeo, 0,5–200 m); el vídeo dibuja su burbuja al construir; con zona o todos se oye igual en cualquier sitio; sonidos y vídeos van con el reloj de pared (todos oyen el mismo momento). Hoy un mundo es una zona: «zona» y «todos» llegan a la misma gente.
- Números: 240 pruebas (antes 239); `vite build` OK; capturas a 1280×720 sin errores de página.
- Commit: este (rama `ux/edicion-audio-voz`, sin subir).
- Siguiente: lo que Pablo diga al probarlo; iconos para Mapa y Ficha; los demás paneles (diálogo, ajustes) repasados con DES-009.

## 2026-10-16 05:23 · X7 · motor en la flota (P1 de `../motor-flota/SPEC.md`) · hecho
- Qué: Pablo (16-10): «que el motor sea el mismo en la flota, en un servidor y en local; que el mundo lo lleve todo y
  se pueda bajar y arrancar como con Hyperfy». Una carpeta es el mundo (`MOTOR_MUNDO`; `mundo-carpeta.ts`: `datos/`,
  `aventura/` sembrada una vez con la de ejemplo y desde entonces suya, `entorno/`, `sesiones/`, `mundo.json`); la
  usan la imagen (`/mundo`), el instalador (`/var/lib/numinia-motor`, siembra la aventura; los habitantes leen esa) y
  `tools/plaza.sh` (`.run`); las variables de antes siguen mandando si están. El motor sirve su página en su puerto
  (`pagina.ts`, `WWW_DIR`: sin `..`, sin ficheros ocultos ni enlaces fuera; `index.html` sin caché, `assets/`
  inmutables) y la página construida habla con `/ws` de su mismo origen también en localhost. `GET /status` =
  `{uptime, conectados, commitHash, version}` (`version.ts` lee `app/build.json`, que ahora lleva el commit entero).
  Claves: `MOTOR_SECRET`|`JWT_SECRET`, `MOTOR_ADMIN`|`ADMIN_CODE` (el fichero de claves de la flota), o hechas una vez
  en `claves.env` (600); el registro dice dónde está el código, nunca cuál; el código mínimo baja a 12 (la flota los
  hace de 12 o 16 hex). Un dueño lo es con el código de ahora. Zip `mundo@2` con aventura y entorno, más
  `compose.yml` (la imagen por su commit), `arrancar.sh` (sin Docker: baja `motor-<corto>`, comprueba el sha256 y lo
  arranca con tu Node) y `LEEME.txt`; la copia de un mundo en marcha es coherente (cada `.jsonl` hasta su última línea
  entera; se relee si una foto cambia a medias). `Dockerfile` + `.dockerignore`: la imagen sale SOLO del instalador
  (`--solo-extraer`) más el Node fijado (sha256), 10001:10001, `0.0.0.0:8790`, `HEALTHCHECK`; `entrada.ts` = servidor o
  `copia` | `comprobar` | `importar` (`mundo-cli.ts`); con `user: "0:0"` toma el dueño de la carpeta. Tras subir un
  mundo sale con 75 y `restart: on-failure` lo vuelve a arrancar. Instalador `--desinstalar` (servicios, temporizador
  y Caddy fuera y enmascarado; el mundo se queda; ssh y ufw sin tocar). `publicar-version.sh` adjunta `imagen.json` y
  no publica sin la imagen en el registro; el workflow (C7) está preparado fuera del repo para que Pablo lo pegue.
- CAMBIOS DE FORMATO: zip y carpeta `numinia-engine/mundo@1` → `mundo@2` (nuevo `esquema`, `motor` = {build,
  commit, imagen}; los `@1` se siguen leyendo). Roles: `duenos` pasa de `[id]` a `[{id, codigo}]`, con `codigo` = HMAC
  del código con el secreto del servidor (los roles viajan en el zip; un sha256 a secas de un código de 12 hex se
  rompe sin conexión): los dueños de antes dejan de serlo al primer arranque y vuelven con `/dueño <código>`. `zip.ts`
  guarda el modo de cada fichero (`arrancar.sh` sale ejecutable).
- Números: 253 pruebas (antes 239; 14 nuevas: `flota` 9, `mundo-zip` 4, `roles` 1); puertas en verde (tick p99
  8,1 ms con mil); `deploy-check` OK (página servida por el motor, mundo nuevo con Alma y Bruno, zip `mundo@2`,
  `comprobar` OK, Lía entra y construye). Imagen con podman 5.8.7 sin root: 218,0 MB, 10001:10001, Node 24.22.0.
  QA de la imagen (`$TMPDIR/flota-qa.mjs`): mundo nuevo como en la flota (página 6/6, `/status`, 69 snapshots, Alma y
  Bruno, un objeto, la misión de Alma aceptada); `copia` del mundo en marcha, solo lectura y sin red → otra carpeta →
  arrancado como dice `compose.yml` (aquí no hay `podman compose`: el `podman run` equivalente) → el mismo mundo,
  `claves.env` 600 y todo del usuario; subir el zip → sale (75) y vuelve solo; con las claves del mundo, el mismo
  jugador ve su misión; `comprobar` rechaza `../`, rutas absolutas, 65 MB declarados y lo que no es zip (una línea,
  salida 1); `importar` rechaza una carpeta con algo y no deja nada si el zip es malo. e2e completo: todo OK salvo la
  pierna https («movedZ» −1,59 de −6); A/B solo esa pierna: main limpio 0/3, esta rama 2/3 (ya estaba roja).
- Consumo: semana 74 % al cerrar (sin medida al empezar). Opus 5.5.
- Commit: este (rama `flota/motor-en-la-flota`, sin subir; nada publicado, ninguna imagen subida).
- Siguiente: que Pablo pegue `work/numinia-engine-publicar-motor.yml` y ponga pública la imagen; P2 (la flota en
  numinia-assets: `user: "10001:10001"`, `data/<id>` 10001 y 700, `copia`/`importar` de la imagen) y P3 (la sala de
  Mundos lee `/status` con `conectados`).

## 2026-10-16 09:48 · rama XR sobre main, botones AR/VR sin WebXR y la versión en los ajustes · hecho
- Qué: `xr/manos-y-mandos` (7 commits, J10/J8b, WebGL2 en Quest sin XRGPUBinding, manos, página de controles en VR,
  andar con la mano) rebasada sobre main 6d8c998 (#5 roles, #6 U10/U11, #7 motor en la flota, #8 flujo). Conflictos:
  `apps/plaza/main.ts` (imports de voz/iconos y xr; `__numinia` con `voz` y `xr`), `render/index.ts` (`Thing` con
  `color` y los campos de U10/U11; `Slot` con `medio`, `color` y `horneado`; los ficheros de un hueco son
  `fichero(t)` también al hornear y al pintar; quitar suelta el medio y lo que llevas en la mano) y este RUNLOG.
  `deploy-check` cuenta ahora la aventura de ejemplo con Teo (2 misiones, 3 personas, 3 cosas).
  Regresión de main (U10/U11): el botón AR/VR salía en aparatos sin WebXR. Causa: se ocultaban con
  `#ar { display: none }` (index.html, especificidad 1,0,0) y `tema.css` da `display: inline-flex` a
  `#barra-arriba > button` (1,0,1), que gana; la regla de ocultar solo miraba `style*="none"`, que nadie ponía.
  Arreglo: los dos botones nacen con el atributo `hidden` y `main.ts` lo quita solo si el aparato puede;
  `#barra-arriba > [hidden]` (ya con `!important`) los oculta en la barra.
  La versión del motor se ve al pie de los ajustes: «Numinia Engine <build> · <fecha>», leída del `/status` del
  servidor (`version`, la misma de /health, el instalador y el zip del mundo; «dev» con `npm run server`).
- Números: 265 pruebas, puertas en verde (tick p99 7,5 ms con mil), deploy-check OK. e2e completo: chromium,
  firefox, AR y VR (`noXrButtonHidden` OK), https y las piernas en verde salvo `constructor` (también falla en
  main limpio 6d8c998: 1 de 4 en el A/B; en esta rama 5 de 7: más a menudo, sin aclarar) y `mapa` una vez (luego 2 de 2 OK).
- Commit: este (rama `xr/manos-y-mandos`, sin subir).
- Siguiente: PR de la rama; volver a probar en las Quest de Pablo tras el rebase.

## 2026-10-16 12:11 · mundos verticales: dónde aparece la gente, personas y cosas con altura, alcance con altura (H15, J21, J22) · hecho (agente hijo de la sesión de Pablo)
- Qué: tres cambios aditivos para la Torre de los Alquimistas (diseño de Christian), rama `torre/aparicion-y-altura` sobre
  main d9f964b. (1) `entorno.json` admite `aparicion { x, z, radio }` (radio 1–40 m, x y z ±460): `leerAparicion` en
  `features/entorno/esquema.ts` (y `validarEntorno` lo comprueba con su ruta), `aparicionDelMundo` en `features/mundo.ts`,
  `main.ts` → `startServer({ aparicion })` → `InstanceOptions.aparicion` → `spawnAvatar(s, owner, area?)`: el cuadrado
  de medio lado `radio` centrado en x, z, con las mismas dos tiradas del RNG; sin él, el cuadrado de 40 m de siempre
  (huella de referencia `93b192c8` intacta). Viaja en la carpeta y el zip del mundo; nunca por el cable. (2) `pnj@1`
  gana `posicion.y` opcional (0–30 m) y `cosa@1` sube su tope de 3 a 30 (`ALTURA_MAX` en formato.ts); el estado lleva
  `y` (pnj v2, misiones v2; el almacén del progreso se carga igual) y la página dibuja a esa altura, el nombre encima.
  (3) `api.position` da `{ x, y, z }`; `api.within` y `features.reachable(x, z, y)` (la página pasa su `y` en
  `interactuar.ts`) exigen una diferencia de altura ≤ 2,5 m (`ALCANCE_ALTURA_M`, `alAlcanceEnAltura` en
  packages/feature) cuando la cosa tiene `y`; `llega_a` admite `y` opcional (0–30) con la misma regla (el suceso `llega`
  lleva la `y` del jugador). Listas de «campo desconocido» con `y`; `docs/EXTENDER.md`, `llms.txt` y los README de
  sim, instance y feature al día.
- Números: 272 pruebas (antes 265; `test/altura.test.ts` con 7), puertas en verde (capas 0; determinismo `f719d31b`;
  26,7 kbit/s; tick p99 13,0 ms con mil); `node tools/aventura.ts aventuras/ejemplo` en orden; la aventura de la
  Torre (`work/torre/mundo/aventura`: 2 misiones con `y`, 4 personas —una a 12 m—, 3 cosas —una a 13 m—) carga sin
  problemas (en main daba 32).
- Consumo: semana 81 % al cerrar (sin medida al empezar). claude-fable-5-1.
- Commit: este (rama `torre/aparicion-y-altura`, sin subir).
- Siguiente: PR de la rama; que la conversación abierta se cierre también al cambiar de planta (hoy solo por distancia
  en el plano; `elegir` sí lo rechaza); `y` en el evento `paso` para que el mapa y la baliza marquen la planta.

## 2026-10-16 14:31 · N1b · la cámara sigue tu altura y no atraviesa paredes · hecho (sesión con Pablo)
- Qué: Pablo saltaba y la cámara no subía con la cabeza, y se metía en las paredes. Causa: `render/index.ts`
  copiaba solo x y z de tus pies a la cámara (la altura quedaba en 0: en una torre, la cámara a ras del suelo).
  Ahora el pivote sigue la altura suavizada (9/s; más de 6 m, al momento) y, jugando, una esfera de 0,2 m barrida
  contra las cajas sólidas acerca la cámara al instante y la devuelve a 6/s (`camara-orbita.ts` `barrido`,
  `seguir`, `paredes`; la página le da `session.solidos()`). `selfPosition().grounded` ya cuenta los sólidos.
- Números: 276 pruebas en verde (4 nuevas de cámara); `npm run build` bien. En la Torre local (123 cajas sólidas):
  al saltar 1,50 m el pivote sube 1,39 m; dando la vuelta entera a la cámara en el vestíbulo, 15 de 24 ángulos la
  acercan (mínimo 3,96 m de 10,4), sin meterse en la pared (`work/torre/camara-qa.mjs`, fotos `camara-*.png`).
- Consumo: sin medir · Opus 5.5.
- Commit: rama `camara/altura-y-paredes`.
- Siguiente: estudio de físicas, teclas, ajustes en pestañas y mapa (`mmo-browser-study/FISICAS-CAMARA-AJUSTES-MAPA.md`).

## 2026-10-16 15:05 · N1b (2) y versión 0.1.0 · escaleras, tejado y la versión sin marca · hecho (sesión con Pablo)
- Qué: Pablo, en la Torre: «no anda encima del suelo del tejado, no sabe subir bien las escaleras, se queda como
  saltando en el aire». Dos causas: (1) el avatar decidía «en el aire» por su altura sobre y 0, así que en el tejado
  (12 m) y en la escalera hacía la animación de salto todo el rato; ahora se mide sobre el suelo que tiene debajo
  (`sueloBajo`, las mismas cajas que la simulación; `view.solidos`); (2) al bajar un peldaño caía 0,37 m con la
  gravedad y pasaba por «en el aire» en cada peldaño: la simulación ahora te pega al suelo si el escalón baja
  ≤ 0,45 m y no saltas (`SNAP_DOWN`; solo con sólidos, la huella 93b192c8 no cambia). Versión: `package.json` pasa
  a **0.1.0** (STD-019) y el pie de los ajustes enseña solo `v0.1.0`, sin «Numinia Engine» (el build queda en el
  rótulo al pasar el ratón); título de la pestaña «Mundo»; política en `docs/VERSIONES.md`. Fila J23 (grabar vídeo
  desde el mundo, también las IAs) para planificar.
- Números: 281 pruebas en verde (escaleras: subir 32 peldaños y bajarlos sin un solo tick en el aire; sin el
  arreglo, bajar fallaba); huella 93b192c8; build bien; cámara en la Torre otra vez bien (15/24 ángulos, sin
  errores).
- Consumo: sin medir · Opus 5.5.
- Commit: rama `camara/altura-y-paredes`.
- Siguiente: que Pablo lo pruebe; después, tiempo de coyote, salto variable y el mando que salta.


## 2026-10-16 18:58 · H3b (cable) · el pase llega de la página al servidor · hecho (rama `roles/pase-h3b`, sin subir)
- Qué: Pablo decidió un mensaje nuevo y aditivo para el pase. `PASE` (tipo 12 en `net`) lleva el token con tope propio de
  2.048 bytes; IDENTITY y sus 120 bytes no se tocan. La página lee `#pass=<token>`, lo quita de la barra con `replaceState` y
  lo manda antes de IDENTITY; el servidor lo guarda en la conexión y llama a `Instance.identificar(entidad, token, pase)`. Un
  PASE malo, repetido o tardío se cuenta y se ignora sin cerrar. `maxPayload` del WebSocket: 1024 → 2048, justo lo que mide el
  mayor mensaje (el pase); `wsTransport` sigue cortando en 1024 cualquier otro tipo. Cambio de formato aditivo (tipo nuevo):
  `WIRE_FORMAT` sigue en 2 y la huella `93b192c8` no cambia, no hizo falta decidir nada. De paso, presupuesto de tamaño de
  todos los mensajes en `docs/FICHA-TECNICA.md` y `limits.json` (`test/mensajes-tope.test.ts`).
- Números: 313 pruebas en verde; un pase mide 630 bytes (un rol) y 1.813 en el peor caso que numinia.com puede emitir hoy
  (con un nombre de 200 caracteres, 2.423: no cabe y entra como visitante). El informe de entrada guardado más grande: 799 de
  1.000. Intención más grande de las 26: 204 bytes. e2e chromium y firefox: la página con `#pass=` la quita de la barra y entra.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `roles/pase-h3b` (ver `git log`).
- Siguiente: que numinia-web corte `name` a 40 en el pase y que la flota añada `MOTOR_PASE_*`; medir el informe de entrada en
  aparatos reales (T1).

## 2026-10-16 21:42 · U13 · la boca se mueve con la voz que oyes (no con la que habla el agente) · hecho (rama `boca/voz-en-vivo`, sin subir)
- Qué: un buscador propuso met4citizen/TalkingHead (MIT) para «lip-sync del agente de IA». El agente (`packages/agent/`)
  no tiene voz propia todavía (`docs/FICHA-TECNICA.md`: «voz: aún no implementada»; eso es una decisión de qué TTS usar,
  aparte), así que no hay nada suyo que sincronizar hoy; lo real y ya en el motor son las voces de la gente
  (`apps/plaza/voz.ts`, U10). `avatares-vrm.ts` guardaba 16 formas de cara (visemas y parpadeo) de los VRM de la casa pero
  las descartaba siempre (`sinFormas`, «volverán para voz y expresiones»): ahora, antes de descartarlas, se guarda solo la
  forma «aa» (`vrm.expressionManager.getExpression("aa")`, VRM0 `blendShapeMaster` preset `a` → índice de morph 13 en los
  tres avatares de la casa, leído del fichero real, nunca adivinado) y las otras 15 siguen fuera. Por cada copia (jugador)
  que de verdad se oye cerca, su malla cambia a una variante de geometría con esa única forma (construida una vez por
  fichero, en caché, nunca tocando la geometría «muda» que comparten los demás) y el peso de «aa» sigue el volumen
  decodificado — del lado que **recibe y descodifica**, no del que habla (dos oyentes a distinta distancia oyen un volumen
  distinto del mismo hablante). Sin más frames (el que habla deja de transmitir en silencio, no manda un frame a 0), la
  boca se cierra sola (`decaerBoca`, factor 0,55 cada 100 ms). Nada de esto toca `packages/agent/`; sin librería nueva
  (TalkingHead no se usa: cero dependencias, reutiliza los morph targets y la voz que ya existían). Decisiones puras en
  `avatares-politica.ts` (`nivelBoca`, `decaerBoca`, `BOCA_SILENCIO_RMS`); el enganche cruza capas por un método nuevo
  (`view.voz(id, nivel)`, como `label`/`bubble`), no por un acoplamiento directo voz↔render.
- Números: 346 pruebas en verde (antes 344; dos nuevas, U13 puras); puertas en verde (capas 0; huella `f719d31b` igual;
  26,7 kbit/s; tick p99 8,4 ms con mil — nada de esto toca el servidor ni la red). Bundle: arranque 108,87 kB gz (antes
  108,61, +0,26 kB), `avatares-vrm` perezoso 66,43 kB gz (antes 66,13, +0,30 kB) — comparado con `npm run build` en main
  antes de este cambio. No pude ver la boca moverse (sin pantalla en este entorno): la geometría, el índice de morph y
  el enganche están probados por tipos y por las pruebas puras, pero el resultado visual queda sin confirmar.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `boca/voz-en-vivo` (sin subir; esperando que Pablo revise el diff).
- Siguiente: que alguien lo mire en un navegador real con dos pestañas y el micrófono; si algún día el agente tiene voz
  propia, esto mismo (`view.voz`) le sirve en cuanto emita audio decodificable.

## 2026-10-16 21:49 · U12 · huecos: pinchas el cuadro, eliges tu imagen y se encaja sola · hecho (sesión con Pablo, rama `plantillas/huecos`)
- Qué: Pablo pidió para las plantillas de mundo (galería, auditorio, sala de rol, salón de eventos) un hueco que el dueño
  rellena: «pinchas el hueco, eliges tu imagen y se encaja sola», «y que te pida abrir carpeta para cargar el documento».
  `objetos` versión 5, aditiva: tres campos (`huecoAncho`, `huecoAlto`, `huecoLleno`) y tres verbos (`hueco`, `rellenar`,
  `vaciar`). El servidor mide la imagen subida por su cabecera (png, jpg con la orientación EXIF, webp: `medidasImagen` en
  `net`, `api.medidas` nuevo en el enchufe de las features) y la encaja entera, centrada y sin deformar; nunca se fía de lo
  que diga la página. Vaciar devuelve el cartel. En la página, quien construye ve «E: poner tu obra en este hueco» cerca de
  uno; E, el botón o un clic abren el selector de ficheros en el mismo gesto. La imagen se reduce a 2.048 px y una JPEG se
  redibuja sin su EXIF (el GPS de una foto de móvil no llega al mundo). Panel de construir: «Hacer hueco», «Poner obra…»,
  «Vaciar hueco». Versión **0.2.0** (algo nuevo que no rompe nada, `docs/VERSIONES.md`).
- Números: 8 pruebas nuevas (`test/huecos.test.ts`), 352 en total; la de coste del chat (`test/chat.test.ts`, p50 de un tick
  de nombres) pasa sola y falla con la máquina cargada (carga 9: 6,30 ms). Pierna `huecos` en chromium y firefox, cuatro
  vueltas en verde: E abre el selector, una PNG de 3.000 × 1.000 sube como 2.048 × 683 y queda a escala 0,8 en un marco de
  2,4 × 1,6; la otra pestaña la ve; un clic en el hueco abre el selector otra vez y una JPEG en retrato queda a 1,6; vaciar
  devuelve el cartel. Límite publicado: `hole_image_px_max` 4.096 px por lado.
- Aviso: la pierna `constructor` falla en chromium en esta máquina («deshacer y rehacer llegan a B»: el segundo Ctrl+Z no
  devuelve el movimiento) también en main sin este cambio (15d092a, dos de dos): no viene de aquí, queda por mirar.
- Consumo: sin medir · Opus 5.5.
- Commit: rama `plantillas/huecos` (ver `git log`).
- Siguiente: que el render reduzca las imágenes por nivel (Quest y móvil: 21 huecos llenos de 2.048 px pasan de los 256 MB
  de textura del nivel B); huecos de modelo y de vídeo; dentro de VR no hay selector de ficheros (hay que salir).

## 2026-10-17 09:48 · U13 · icono de Numinia en la biblioteca del Quest · hecho (rama `pwa/manifest-biblioteca-quest`)
- Qué: Pablo quería entrar sin escribir en el navegador — un icono con el logotipo de Numinia en la biblioteca/tienda del
  Quest que lleve siempre al mundo. `apps/plaza/public/manifest.webmanifest` (`name`/`short_name` «Numinia», `display:
  fullscreen`, `start_url`/`scope` «/» — cada instalación del motor sirve su propia dirección como su propio origen, así
  que no hace falta fijar un mundo por parámetro), dos iconos 192/512 (`apps/plaza/public/iconos/numinia-{192,512}.webp`,
  el escarabeo Khepri de numinia-web en ámbar #ffd27a sobre fondo oscuro #14181e del HUD del motor, generados con `sharp`
  desde `packages/ui/src/assets/brand/Khepri_Logo.svg`) y `<link rel="manifest">` + `<link rel="icon">` +
  `<meta name="theme-color">` en `index.html`. El `<title>Mundo</title>` de la página no cambia (el motor no lleva marca
  en su interfaz); la marca vive solo en el manifest, que es lo que ve la biblioteca del aparato, no la página. Versión
  **0.3.0** (algo nuevo que no rompe nada).
- Números: `npm run build` sirve `manifest.webmanifest` con `content-type: application/manifest+json` (ya lo sabía
  `packages/server/src/pagina.ts`, sin tocar el servidor) y los dos iconos. 369 de 370 pruebas en verde (la de coste del
  chat de `test/chat.test.ts` falla sola con la máquina cargada, aviso ya conocido de la entrada de las 21:49 del 16-10;
  vuelve a pasar en una repetición suelta). Comprobado en un Quest 3S real por USB (adb reverse 5173/8790 + CDP por
  `chrome_devtools_remote`): `Page.getAppManifest` → `errors: []` y el manifest aparece analizado con `display: kFullscreen`,
  los dos iconos y `name: Numinia`; `Page.getInstallabilityErrors` → `installabilityErrors: []` (el mismo criterio que usa
  Chromium — y por tanto el navegador del Quest — para decidir si «Guardar en la biblioteca»/«Añadir a pantalla de inicio»
  puede crear el icono).
- Aviso / sin comprobar: no se pulsó a mano el menú del navegador del Quest para ver el icono aparecer en la biblioteca
  de verdad (automatizar los tres puntos del navegador por `uiautomator` resultó fràgil — la resolución lógica cambiaba
  entre capturas, 1280×800 vs 3664×1920 — y no quise andar tocando al azar la pantalla de las gafas de Pablo); con cero
  errores de instalabilidad medidos por el propio Chromium, falta solo el gesto físico. Publicar de verdad en la Meta
  Store (revisión de Meta) es otra cosa aparte, no esto.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `pwa/manifest-biblioteca-quest` (ver `git log`).
- Siguiente: Pablo, en el Quest, abre el mundo instalado (p. ej. alchemiststower.numinia.com) en el navegador, menú ⋮ →
  «Guardar en la biblioteca» (o «Añadir a pantalla de inicio»), y confirma que el icono de Numinia aparece en la
  biblioteca y que al pulsarlo el mundo carga a pantalla completa sin barra de direcciones.

## 2026-10-17 11:30 · objetos/respetar-fijado · hecho
- Qué: `fijado` protegía el sitio (mover/girar/borrar lo rechazaban) pero no el contenido: cualquiera con
  `construir` podía pinchar «Hacer hueco» sobre CUALQUIER imagen fijada (un rótulo, un cartel oficial) y
  convertirla en un U12 editable por cualquiera, pese a estar fijada. Hallado en vivo en el tablero del
  Ayuntamiento (plantilla, worktree aparte). `hueco` ahora rechaza con «Está fijado: suéltalo antes de hacerle
  un hueco.» cuando `o.fijado === true`, igual que mover/girar/borrar; hay que desfijarla primero (quien la
  construyó o un rango superior). `rellenar`/`vaciar` NO cambian: un hueco ya fijado sigue aceptando obra nueva
  a propósito (el diseño U12 es un marco pinchado en la pared que cualquiera rellena con su foto — eso lo
  cubre ya `test/huecos.test.ts` «a pinned hole takes a work and gives it back»). Versión **0.3.1** (parche:
  cierra un agujero de seguridad, no cambia ningún contrato).
- Números: 376 pruebas, 375 en verde + 1 mala conocida (`test/chat.test.ts` coste de nombres con la máquina
  cargada, el mismo aviso de la entrada de las 21:49 del 16-10 — no toca este código); nueva prueba «a pinned
  picture cannot be turned into a hole» en verde. Puertas: 1 roja (la misma prueba), capas/determinismo/ancho
  de banda/tick en verde.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `objetos/respetar-fijado` sobre origin/main 84069eb (ver `git log`).
- Siguiente: Pablo (PR sin ok, hueco de PR libre en numinia-engine): abrir PR; después revisar si la galería/eventos
  u otras plantillas fijan carteles pensando que eso también bloqueaba `hueco` (no lo hacía hasta ahora).
## 2026-10-16 23:10 · U14 (1) · el aire de cada mundo en su página (`tema` en ficha@1) · hecho (sesión con Pablo, rama `plantillas/eventos`, sin subir)
- Qué: Pablo pidió la plantilla del salón de eventos, la primera vez con la TRG26 («El vuelo del Maestro»), con el aire
  de https://www.trgcon.com/. Primer trozo: cada mundo viste su página sin tocar el motor. ficha@1 admite `tema`
  (aditivo): diez colores «#rrggbb» de los paneles, la letra de los títulos de entre las que trae el motor (`geist`,
  `geist-mono`, `bebas-neue`; Bebas Neue entra en `apps/plaza/public/fuentes` con su licencia SIL OFL, 13.768 bytes, y
  el navegador solo la baja si un tema la pide), una sombra desplazada, mayúsculas y botones rectos o en píldora. El
  servidor lo lee valor a valor (`leerTema` en `packages/server/src/aventura.ts`: lo que no cabe se deja fuera y se dice
  en el registro, una clave desconocida se ignora) y lo da en `GET /status`; la página lo vuelca en variables CSS que
  `tema.css` ya lee (`apps/plaza/tema-mundo.ts`; la tinta sobre el botón principal, clara u oscura, la decide el motor).
  Sin tema, el aire de la casa sin cambio: las medidas de los títulos solo crecen con `[data-tema-titulos]`.
- Números: 4 pruebas nuevas (`test/tema.test.ts`), 372 en total, 371 en verde con la máquina a carga 16: la que falla es
  la de siempre (`chat.test.ts`, coste de nombres para 1.000), que pasa sola. Puertas: capas 0, huella f719d31b, 26,7
  kbit/s, plaza de 1.000 p99 9,1 ms. `npm run build` en verde. En la Nave de la TRG (plantilla fuera del motor): `/status`
  da los 14 valores, la página carga Bebas Neue y los títulos salen en mayúsculas con sombra rosa (Playwright).
- Commit: rama `plantillas/eventos` (ver `git log`), sobre `plantillas/huecos` (PR #17).
- Siguiente: pasos en cualquier orden (`grupo` en mision@1) con su contador; el libro con los estados de la
  especificación; marcas sobre las personas; secuencia local; cofre de dos aspectos; premio una sola vez.

## 2026-10-16 23:56 · U14 (2) · pasos en cualquier orden (`grupo`), una persona te da una cosa (`recibe`) y entregar varias a la vez (`entrega.cosas`) · hecho (sesión con Pablo, rama `plantillas/eventos`, sin subir)
- Qué: lo que la misión de la TRG26 pedía y mision@1 no sabía decir (un aprendiz da la misión; tres artesanos te dan una
  pieza cada uno, en cualquier orden; luego llevas las tres a Leonardo; luego el cofre). Todo aditivo: `grupo` en
  cualquier paso (los pasos seguidos con el mismo grupo, en cualquier orden; el mismo grupo en dos sitios separados es un
  error que dice «junta esos pasos»), paso `recibe` (como `habla_con`, y la cosa queda «llevada»; también vale una
  respuesta `avanzar_paso`) y `entrega` con `cosas` (1–8; «para entregar X antes hay que tenerla» acepta un `recibe`).
  El progreso guarda `hechos` (ids del grupo en curso, ≤ 16; lo guardado antes carga con `[]`); `registrar` completa como
  mucho un paso por misión y suceso (el primero que encaja, en el orden del fichero) y salta el grupo cuando está entero;
  la condición `paso` de un diálogo vale mientras ese paso falta. `misiones` v3: el evento `paso` lleva `grupo` y el tipo
  `recibe`. En la página: «ahora» (→) en cada paso que falta del grupo (libro, mapa, VR), arriba «★ El vuelo del Maestro ·
  Piezas reunidas 1/3 · Artemisia, a 7 m al sureste» y, al recibir, «Has recibido: Telas ligeras» (lo dice el servidor
  en el `avance`). EXTENDER «Misiones y personas» (la tabla, el grupo con su ejemplo) y llms.txt.
- Números: 8 pruebas nuevas (`test/misiones-grupo.test.ts`), 380 en total, 379 en verde con la máquina a carga 10–21: la
  que falla es la de siempre (`chat.test.ts`, coste de nombres para 1.000), que pasa sola (13 de 13); las de misiones de
  antes, sin tocar (en `altura.test.ts` cambian la versión, 2 → 3, y la lista de campos que admite un paso, que ahora
  dice `grupo`). Puertas: capas 0, huella f719d31b, 26,7 kbit/s, plaza de 1.000 p99 8,5 ms (unitarias: 379 de 380, la
  misma). Tick de las misiones con 1.000 jugadores esperando llegar: p99 0,3 ms (límite 5). Progreso a mitad del grupo:
  127 bytes. `npm run build` en verde. En el navegador (servidor 8885 y página 5325 propios, Playwright, la misión de la
  TRG en una carpeta de prueba; `node tools/aventura.ts`: «Todo en orden»): 3 marcas en el mapa y tres «→», tras Bianca
  «✓ Has recibido: Telas ligeras», 1/3 y 2 marcas; sin errores en la página.
- Commit: rama `plantillas/eventos` (ver `git log`), encima del trozo 1.
- Siguiente: el libro con los estados de la especificación; marcas sobre las personas; secuencia local (el vuelo);
  espera antes del cofre; cofre de dos aspectos; premio una sola vez; el icono de la pieza conseguida.

## 2026-10-17 00:21 · U14 (mapa) · el mapa de un edificio es su planta (`mapa.corte` en entorno@1) · hecho (sesión con Pablo, rama `plantillas/eventos-mapa` unida a `plantillas/eventos`, sin subir)
- Qué: dentro de la Nave de la TRG26 (un solo modelo de 45 × 121 m con tejado a 23 m), el minimapa pintaba su huella
  entera en amarillo (el primer color liso del modelo) y el mapa grande enseñaba el tejado. Un mundo dice ahora a qué
  altura se corta su mapa (`"mapa": { "corte": 6 }`): el mapa grande deja fuera lo de arriba y dibuja la sección (paredes,
  columnas, puertas, vidrio) sacada de los triángulos; el minimapa usa ese dibujo de fondo. Sin corte, nada cambia.
- Números: sección de 142.194 triángulos → 3.340 segmentos en 3–6 ms; la foto entera 3–10 s en SwiftShader (lectura de
  píxeles), dos por visita, ninguna parado; 58 dibujos 3D frente a 60. Pruebas: 6 nuevas (`test/mapa-corte.test.ts`) más
  las del esquema; la suite entera en verde salvo la de siempre bajo carga (`chat.test.ts`, coste de nombres para
  1.000), que pasa sola; `npm run build` en verde. Fotos en la plantilla: `fotos/mapa-corte-mini.png` y
  `fotos/mapa-corte-grande.png`.
- Commit: 1a4b99a en `plantillas/eventos-mapa` (un segundo worktree, en paralelo con U14 (2)) y la unión 8c59e7a.
- Siguiente: el libro con los estados y las marcas sobre las personas (en paralelo, cada uno en su worktree).

## 2026-10-17 01:01 · U14 (3) · el libro dice hecho / ahora / bloqueado y se abre solo al aceptar · hecho (sesión con Pablo, rama `plantillas/eventos`, sin subir)
- Qué: lo que la especificación de la TRG26 pide al libro (§3 y §6), para cualquier mundo. Cada paso sale en uno de tres
  estados: hecho (check verde y texto atenuado), ahora (un punto del color de énfasis del mundo sobre una franja suya, el
  texto entero y dónde; en un grupo, todos los que faltan del bloque) y bloqueado (candado y texto atenuado: va después
  del bloque en curso). El lector de pantalla oye «Hecho», «Ahora» o «Bloqueado»; el panel de VR lleva ✓ → □. El libro se
  abre solo al aceptar una misión, en cuanto se cierra la conversación que la dio (escritorio y móvil; en VR no), sin
  llevarse el foco: WASD sigue andando, y J o su nuevo «Cerrar» lo cierran. «Has recibido: …» (y coger algo) lleva el
  icono de objeto; candado y objeto son `lock-key` y `package`, del subconjunto de iconos de la casa. El sonido corto que
  el aviso `avance` declaraba («exito») no sonaba (la página no toca los sonidos de los avisos hasta V6): ahora el libro
  toca tres notas (Web Audio, sin fichero) al volumen general × «Efectos». En el móvil el aviso quedaba debajo del libro:
  ahora va encima. La línea de arriba, igual. Sin cambios en `features/misiones` (el estado sale de `objetivos()`).
- Números: 7 pruebas nuevas (`test/misiones-libro.test.ts`), 394 en total: en verde las 394 en una pasada y 393 en las
  puertas con la máquina a carga 9 (la de siempre, `chat.test.ts`, coste de nombres para 1.000, que pasa sola: 13 de 13).
  Puertas: capas 0, huella f719d31b, 26,7 kbit/s, plaza de 1.000 p99 7,2 ms. `npm run build` en verde; el arranque crece
  1,2 kB gz de JS y 0,35 kB gz de CSS. En el navegador (servidor 8885 y página 5325 propios, Playwright, la misión de la TRG
  en una carpeta de prueba): 22 de 22 comprobaciones en el aire de la casa, en el de la TRG y en un móvil de 390 × 844;
  las piernas `misiones` (al día con lo nuevo) y `manos` del e2e, en verde contra ese servidor; en VR (IWER) el libro no
  se abre y el panel dice →→→□□. Fotos en la plantilla: `fotos/libro-1-recien-aceptada.png`, `libro-2-una-pieza.png`,
  `libro-3-tres-piezas.png` y `libro-4-aire-trg.png`.
- Commit: rama `plantillas/eventos` (ver `git log`), encima de U14 (mapa).
- Siguiente: las marcas sobre las personas (U14 (4), en paralelo en `plantillas/eventos-marcas`); secuencia local (el
  vuelo); espera antes del cofre; cofre de dos aspectos; premio una sola vez. Sin medir: las marcas en unas Quest de verdad.

## 2026-10-17 01:07 · U14 (4) · marcas «!» y «✓» sobre las personas y las cosas, y el oficio bajo el nombre · hecho (sesión con Pablo, rama `plantillas/eventos-marcas` unida a `plantillas/eventos`, sin subir)
- Qué: la especificación de la TRG26 pide que cada persona diga si tiene algo para ti («!»), si ya cumpliste con ella
  («✓») y su oficio, y que no haya «!» en los artesanos antes de hablar con Pietro. El servidor lo decide por jugador
  (`marcas()` en `maquina.ts`, puro) y lo manda solo a su dueño en el evento `marcas`; la página lo pinta en el rótulo y
  en los mapas. pnj@1 `oficio` (pnj v3); misiones v4.
- Números: +7 llamadas de dibujo y +8 texturas con 8 rótulos; 0 lienzos repintados parado; aceptar repinta 4. 5 pruebas
  nuevas; la suite entera en verde salvo la de siempre bajo carga (`chat.test.ts`), que pasa sola; build en verde. La
  unión con U14 (3) chocó solo en `tools/e2e-piernas/misiones.mjs` (las dos comprobaciones juntas); después, 55 de 55 en
  las pruebas de misiones, mapa, entorno, altura y tema, y la pierna e2e `misiones` en verde (motor y página propios).
- Commit: 11d92dc en `plantillas/eventos-marcas` (worktree `numinia-engine-wt-eventos-b`) y la unión 88e97b7.
- Siguiente: la secuencia local (el vuelo de Leonardo) con la espera antes del cofre, y el cofre de dos aspectos con el
  premio registrado una sola vez.

## 2026-10-17 02:28 · U14 (5) · un momento que solo ve quien lo provoca (secuencia@1) y un paso que espera (espera) · hecho (sesión con Pablo, rama `plantillas/eventos`, sin subir)
- Qué: la especificación de la TRG26 pide que, al entregar las tres piezas, Leonardo se ponga las alas y vuele solo para
  quien se las dio (los demás siguen jugando su misión con él en su sitio) y que el cofre no se abra antes del vuelo.
  Fichero nuevo de aventura `secuencias/<id>.json` (pistas `mueve`, `muestra`, `texto`, `sonido`; 1–30 s), y en cualquier
  paso `secuencia` (se manda una vez, solo a quien lo hizo) y `espera` (1–60 s desde que empezó su bloque; la máquina
  sigue pura: el servidor le pasa la hora). El reproductor de la página va en su propio trozo, que solo se baja con la
  primera secuencia. misiones v5.
- Números: 8 pruebas nuevas (`test/misiones-secuencia.test.ts`), 406 de 407 en la suite (la de siempre bajo carga,
  `chat.test.ts`); las de misiones y altura, 44 de 44; las otras cuatro puertas en verde (capas 0, f719d31b, 26,7 kbit/s,
  plaza de 1.000 p99 7,2 ms); `npm run build` en verde. Con 1.000 jugadores esperando, el tick de las misiones p99 0,14
  ms. En el navegador, dos invitados: A ve las alas, el vuelo y el aterrizaje; B, a Leonardo quieto; el cofre dice
  «Todavía no: faltan 10 s» y su «!» sale a los 10,0–10,2 s. Fotos en la plantilla: `fotos/vuelo-1…4`.
- Nota: el agente que lo hizo se quedó sin pasos antes de escribir esta entrada y de hacer el commit; los cerró la sesión
  (build y pruebas de misiones repetidos antes del commit).
- Commit: rama `plantillas/eventos` (ver `git log`).
- Siguiente: unir el cofre de dos aspectos y el premio registrado (U14 (6), rama `plantillas/eventos-cofre`) y poner el
  vuelo y el cofre en la aventura de la plantilla.

## 2026-10-17 02:31 · U14 (6) · el cofre de dos aspectos, el premio apuntado una sola vez y «Misión completada» · hecho (sesión con Pablo, rama `plantillas/eventos-cofre` unida a `plantillas/eventos`, sin subir)
- Qué: la especificación de la TRG26 pide un cofre que se abra solo para quien lo abre, el «Sello del Artífice · TRG26»
  concedido una vez y apuntado (jugador, misión, instante, estado) sin depender de ninguna cartera, y «Misión
  completada». cosa@1 `apariencia.usada`; la concesión en el almacén (`c:<misión>:<id>`, nunca se sobrescribe);
  `npm run concesiones` para la organización (CSV); el cartel con su acorde.
- Números: 9 pruebas nuevas; en su rama 407 de 408 (la de siempre bajo carga) y `MISIONES OK`. Al unir con U14 (5)
  chocaron siete ficheros (los sonidos de la página: las notas de la casa del trozo 5 y el acorde del 6 en una sola
  función; el comentario de la versión v5; `crearCliente` con el reloj del 5 y `usadasDe` del 6; el texto de `llms.txt`
  y de `docs/JUGADOR.md`; una aserción de versión). Después: 72 de 72 en las pruebas de misiones, mapa, entorno, altura
  y tema, y la pierna e2e `misiones` en verde contra un motor y una página propios (8889/5329).
- Commit: 2f19747 en `plantillas/eventos-cofre` (worktree `numinia-engine-wt-eventos-b`) y la unión b70ff3a.
- Siguiente: el vuelo y el cofre en la aventura de la plantilla, el recorrido entero en el navegador con una foto por
  fase y el coste en Quest.

## 2026-10-17 · motor-vr (vr/giro-y-velocidad) · hecho (rama `vr/giro-y-velocidad`, sobre `pwa/manifest-biblioteca-quest`)
- Qué: dos cosas que Pablo notó llevando el visor. (1) «el mando se vuelve loco»: tras un giro con la palanca
  (snap turn), empujar hacia delante a veces iba hacia un lado que no era. Causa real: `vr.ts` leía
  `h.renderer.xr.getCamera().getWorldDirection()` para saber hacia dónde es «delante», pero esa cámara XR solo
  se refresca dentro de `renderer.render()`, que corre DESPUÉS de `vr.update()` en el bucle — así que siempre
  usaba la orientación del fotograma anterior (iba un giro por detrás). Arreglo: forzar `rig.updateMatrixWorld(true)`
  + `h.renderer.xr.updateCamera(h.camera)` a mano, dentro de `vr.update()`, antes de leer la dirección — así usa
  el giro de EXACTAMENTE este fotograma, no el de antes. Confirmado con el emulador IWER (sin XR real, no hacía
  falta Quest): antes del arreglo, girar 3 veces a la derecha o 3 a la izquierda y luego ir recto daba SIEMPRE el
  mismo rumbo (0,-1, como si no hubiera giro); después, van a lados opuestos y simétricos. (2) la marcha iba
  siempre a la carrera: el umbral de «palanca al borde = correr» estaba en 0,9 de recorrido, que una palanca
  real alcanza con poco más de la mitad del viaje — así que casi nunca se podía simplemente andar. Subido a 0,97
  (`apps/plaza/main.ts`), y además `packages/sim/src/index.ts` ahora anda a 1,5 m/s y corre a 4 m/s (antes 4/8,
  pensado para mando de escritorio, no para caminar de pie). Esto cambia la huella de referencia determinista
  (CAMBIO DE FORMATO, `AGENTS.md`): `93b192c8` → **`7e630965`** (formato de simulación 3). El modo de movimiento
  como opción de Pablo (otra velocidad, otro estilo) queda para otra tarjeta; aquí solo velocidad y recorrido.
- Números: `tools/e2e-vr.mjs` ahora también gira 3 veces a cada lado y empuja delante, y comprueba que los dos
  desplazamientos resultantes son opuestos (antes solo probaba con giro = 0, por eso no pescaba el bug) — pasa
  en vivo (servidor + Vite reales, emulador IWER): `deltaAfterRight3`/`deltaAfterLeft3` opuestos y simétricos.
  `npm run gates`: 375 pruebas en verde (6 tests que dependían del ritmo de 4 m/s — escaleras, deslizar junto a
  un muro, seguir a una persona, ver a otro corriendo — llevados a los números de 1,5/4 m/s; sin tocar la lógica
  que prueban). `tools/e2e.mjs` (teclado, servidor+Vite reales): OK, 0 correcciones, ~2 m en 1,5 s (antes 6 m).
  `tools/e2e-vr.mjs`: OK. Aviso: al reiniciar el servidor de este turno con `pkill -f "npm run server"`, el patrón
  cazó también procesos de OTRAS tareas en otros worktrees (no solo el mío) — no volví a usar `pkill` por patrón
  ancho; para parar un servidor de turno, mejor el PID exacto o `fuser -k <puerto>/tcp`.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `vr/giro-y-velocidad` (worktree en `work/numinia-engine-wt-vrmotor`, aún sin PR).
- Siguiente: Pablo prueba en el Quest real: 3 giros a cualquier lado + palanca adelante va hacia donde mira, y
  la marcha normal ya no es un trote. Si Pablo quiere elegir su propio ritmo de movimiento, tarjeta aparte.

## 2026-10-17 22:05 · N6 · corte 1 hecho
- Qué: el Director de juego (DJ). Dirigir = STD-052 «Gestionar rituales» (sin rol nuevo). Escenas de la aventura
  (`escena@1`) sobre el entorno del mundo, narrar a todos, convocar con «Ir / Ahora no» (nadie se mueve sin su sí),
  panel «Dirigir» (K) y órdenes de chat; escenas en la aventura de ejemplo y en las plantillas galería, eventos y
  auditorio (fuera del repo, `plantillas/escenas.mjs`).
- Números: 4 pruebas nuevas (`test/director.test.ts`) y una aserción de `roles` al día; 427 de 428 (la de coste del
  chat bajo carga, como siempre); `npm run build` en verde. La página no se ha probado en un navegador.
- Commit: ver la rama `noche/director`.
- Siguiente: probar el panel en escritorio y móvil; corte 2 (dar cosas, mostrar/ocultar, diario).

## 2026-10-18 · N13 · modo foto para compartir · hecho (rama `noche/foto`, desde `tren/motor-2026-10-18`)
- Qué: P (o el botón de la cámara arriba) esconde toda la interfaz y suelta la cámara en un modo nuevo `"foto"`
  (`camara-orbita.ts`): libre con correa corta (el pivote a 12 m de tus ojos como mucho, nunca bajo el suelo,
  de 0,3 a 14 m, nunca primera persona; al salir vuelve exactamente a la cámara de juego). PC: arrastrar encuadra,
  rueda acerca hacia el cursor, WASD/flechas mueven la cámara (Shift deprisa), Q E bajan y suben, 1-4 filtro, F
  marco, Intro/Espacio foto, Esc sale; el avatar se queda quieto. Móvil: todos los dedos son de la cámara (la mitad
  izquierda deja de ser joystick), botón redondo dispara. Filtros = matrices de color dentro de la paleta Nocturno
  (`foto-nucleo.ts`): las mismas cifras en la vista previa (SVG `feColorMatrix` sobre el canvas) y en el PNG.
  Marco con el nombre del MUNDO (título de la página) y la fecha; nunca la marca del motor. La foto se dibuja otra
  vez a hasta 2× (≤ 3200 px) y se lee en la misma tarea (sin `preserveDrawingBuffer`). Después: Compartir (Web Share
  con el archivo, solo si `canShare({files})`), Guardar, Copiar imagen (escritorio), Copiar enlace. Enlace
  `#foto=x,y,z,rumbo,inclinación,distancia`: quien lo abre lo ve salir de la barra, el sitio queda como su destino
  (columna de luz y marcador del mapa) y la cámara gira hacia él; a ≤ 3 m mira como miraba la foto. No te
  teletransporta: dónde apareces es del servidor (ningún cliente dice dónde está) — si un mundo quiere permitirlo,
  otra tarjeta. VR: sin botón (la vista del visor no es el canvas de la página; el botón se esconde en XR).
- Números: `test/foto.test.ts` 8 pruebas (filtros en la línea de la paleta, SVG = PNG, marco, nombre de archivo,
  enlace ida y vuelta y basura rechazada, rumbo, cámara «foto»). `npm test`: 444, 443 + 1 de coste del chat que
  falla solo con la máquina cargada (sola pasa). `tools/e2e-piernas/foto.mjs` (servidor + Vite reales) OK en
  Chromium y Firefox: PC 1280×720 a 2× → PNG 2560×1440 con banda del marco #14110F y píxeles en la línea de
  Verdemar, descarga = mismos bytes, enlace en el portapapeles, Esc devuelve todo y W vuelve a andar, el enlace en
  otra pestaña marca el destino y gira la cámara (error < 0,05 rad); móvil 390×844 ×3 (solo Chromium: toques CDP)
  → un dedo en la mitad izquierda gira la cámara sin moverte, PNG 780×1688, Compartir entrega 1 archivo PNG + el
  enlace. `tools/e2e.mjs` OK en los dos.
- Consumo: sin medir · Opus 5.5.
- Siguiente: probar Compartir en un móvil real (la hoja del sistema); captura en VR (renderizar la cámara XR a un
  objetivo propio) si se pide.

## 2026-10-18 03:45 · N11 · el tren de la noche, listo para main · versión 0.4.0 (rama `noche/version`, desde `tren/motor-2026-10-18`)

- Qué: el tren `tren/motor-2026-10-18` junta lo de la noche del 17 al 18: eventos U14 (#23), VR giro y velocidad
  (#24), bienes digitales (#25), dardos (#27), agua estilizada (#28), pesca en todas partes (#29), Director de juego
  (#30), rendimiento para Quest (#31), mundo de ±2000 m (#32), modo foto (#33) y e2e al día con #24 (#34). Cada PR
  entró al tren tras rebase, `npm test`, `npm run build` y las piernas de lo que tocaba.
- Versión **0.3.1 → 0.4.0** (menor). Hay cosas nuevas, y antes de 1.0.0 una ruptura sube el menor: #32 cambia un
  mensaje de red (Transform@3, posiciones hasta ±2000 m con 16 bits por eje). Página y servidor tienen que ser del
  mismo build (los mundos guardados se abren igual). #24 cambia las velocidades de andar (4 → 1,5 m/s) y de correr
  (8 → 4 m/s).
- Números (punta del tren, máquina con load 10-35): `npm test` 478 de 479 en verde; el que falla es «cost: names
  for 1,000 players», por tiempo con carga, y solo pasa. `npm run build` OK. e2e: todas las piernas en orden (`base ar
  vr mezclada` + 16), 17 de 20 en verde con load 24; `vr`, `foto` y `pesca`, repetidas con load 14, OK.
- Consumo: sin medir · Opus 5.5.
- Siguiente: lo fusiona Pablo. Tras desplegar, mirar `/status` (versión 0.4.0) y entrar a la plaza en el Quest.

## 2026-10-18 · N16 · teletransporte: ir junto a quien está, aparecer donde la foto, el «rayo» · hecho (rama `noche/teletransporte`, desde `tren/motor-2026-10-18-2`)
- Qué: camino A de Pablo (17-10): «ir con quien está conectado ahora», sin cuenta. Panel «Gente» (L o el botón de
  personas; `apps/plaza/gente.ts`) con quien está ahora en este mundo y «Ir»; `/ir <nombre>` hace lo mismo (sirve en
  VR). `features/teletransporte`: el servidor decide — mismo mundo, un viaje cada 10 s, sitio libre a 1,2–3 m de la
  persona en su suelo y sin sólidos (`sitioLibre` de la sim, enteros Q16.16, ocho rumbos por anillo empezando por el
  lado del que vienes) vía `api.teletransportar`; si no hay sitio, no te mueve y lo dice. `/encontrable no` te quita
  de la lista; `/teletransporte no|sí` (dueños, administración, quien dirige: `ajustar` o `dirigir`) lo apaga para el
  mundo y se guarda. `entorno.json` `"aparicionFoto": true` (apagado por defecto): quien abre un enlace `#foto=`
  aparece en su sitio (una vez, al entrar, ±460 m, suelo hasta 2 m abajo); si no, la guía de N13 como siempre.
  Efecto: `packages/render/src/teletransporte.ts` — tres variantes al azar elegidas por el servidor (todos ven la
  misma): colapsa al centro, haz desde los pies, bloques digitales; carcasa aditiva + haz + chispas instanciadas,
  2–3 draw calls durante 1,4 s; tope 6/3/3/0 luces (A/B/C/D), en el nivel D ninguna. El cuerpo se esconde entre el
  corte de salida y el de llegada (nadie lo ve deslizarse). Fórmulas de máscara en `teletransporte-politica.ts`.
- Números: `test/teletransporte.test.ts` 9 pruebas. `npm test`: 488, 487 + 1 de coste (`cercania`) que falla solo
  con la máquina a carga ~30 (sola pasa, como `chat`). Puertas: todas OK salvo esa. `tools/e2e-piernas/teletransporte.mjs`
  OK (10/10, servidor + Vite reales, Chromium): PC lista/Ir/«Espera», `/ir`, nivel D sin luz, móvil 390×844 táctil
  (botones ≥ 44 px), enlace de foto en mundo sin permiso = guía, mundo con `aparicionFoto` = apareces (≤ 3 m), VR
  IWER Quest 3 `/ir` con tope 3 luces y el rig a su lado. `tools/e2e.mjs`, `e2e-vr.mjs`, `e2e-piernas/chat.mjs` OK;
  `e2e-piernas/foto.mjs`: «quieto» falla por velocidad de la cámara bajo carga (0,75 m, pide > 0,8; código no tocado).
- Consumo: sin medir · Opus 5.5.
- Siguiente: amigos guardados (espera a la identidad, F1); menú de muñeca en VR para «Gente»; probar en Quest real.

## 2026-10-18 04:50 · N23 · el tren 2 de la noche, listo para main · versión 0.5.0 (rama `noche/version-2`, desde `tren/motor-2026-10-18-2`)

- Qué: el tren `tren/motor-2026-10-18-2` (creado desde la punta del primero, 74a8704) junta modelos animados baratos
  (#36), bienes corte 2: ver en 3D y llevar puesto (#37), teletransporte (#39, rebase de #38), dados v1 (#40), carga
  rápida en móvil (#41) y pantallas web (#42). Cada PR entró tras rebase, `npm test`, `npm run build` y sus piernas.
  Esta rama lleva además `noche/version` (#35, 0.4.0) fusionada, para entrar limpia en main después de #35.
- Versión **0.4.0 → 0.5.0** (menor): todo son cosas nuevas. `bienes` pasa a v2 de su feature y hay features nuevas
  (teletransporte, dados, web): página y servidor tienen que ser del mismo build (recargar las pestañas abiertas). #41
  añade dependencias (gltf-transform, meshoptimizer, @jsquash): hace falta `npm ci` en el servidor.
- Números (punta 566b129, load 11-18): `npm test` 521 de 522; falla «cost: names for 1,000 players» por tiempo y solo
  pasa 13/13. `npm run build` OK. e2e: `base ar vr mezclada` + las 19 piernas, 22 de 23 en verde; `foto` cayó en
  «quieto» (la cámara libre avanzó 0,75 m y pide 0,8, con load 18); repetida con load 4, OK 2 de 2 (0,95 m).
- Consumo: sin medir · Opus 5.5.
- Siguiente: lo fusiona Pablo después de #35. Tras desplegar, `/status` debe decir 0.5.0; probar `/tirar 2d6` con
  dos pestañas y «Gente» (L).

## 2026-10-18 10:47 · fábrica · hecho
- Qué: rama `personas/separar-del-conteo` (17-10) rescatada sobre main: `/status` y `/health` separan personas de
  agentes (`conectados` sigue siendo solo personas; nuevos `agentes`, `total`, `agentesDe` {habitante, organizacion});
  el mapa pinta a las IAs como rombo verde «Agente (IA)», aparte de las personas (por la marca « · IA» del servidor).
- Versión **0.5.1 → 0.6.0** (menor): campos nuevos en `/status` y `/health`, ninguno cambia; tipo nuevo en el mapa.
- Números: ver el cuerpo del PR (`npm test`, `npm run build`, pierna e2e del mapa).
- Consumo: sin medir · Opus 5.5.
- Siguiente: la cola de ramas sin fusionar está en work/fabrica/COLA-motor.md; la siguiente es `movil/audit-ui-2026-10-18`.

## 2026-10-18 11:18 · pulido de la cara pública · hecho
- Qué: README al día (qué es, arranque rápido, qué trae, paquetes, documentación, licencia); nuevos `SECURITY.md`,
  `CONTRIBUTING.md` y `CODE_OF_CONDUCT.md` (los dos primeros textos vienen de numinia-archive); regla en `AGENTS.md`:
  mensajes de commit y títulos de PR siempre en inglés, también los turnos de noche.
- Versión **0.6.0 → 0.6.1** (parche): solo documentación, no cambia nada para quien usa el motor.
- Números: `npm run gates` en verde (ver el cuerpo del PR).
- Consumo: sin medir · Sonnet 5.5.
- Siguiente: los encargos de los agentes de noche deben repetir la regla del inglés (ver el cuerpo del PR).

## 2026-10-18 11:27 · ux · hecho
- Qué: integración de dos ramas de la ola 1 de interfaz: U25 (perfil de aparato forzable: `?aparato=` /
  ajuste, `aparato.ts`) y U23+U26 (estadísticas apagadas salvo escritorio con `?debug`; pulsaciones con estado
  pulsado y vibración opcional). Conflictos: versión y `capacidades.ts` (se quedan `debug` y las de U25).
- Versión **0.6.1 → 0.7.0** (menor): ajustes y capacidades nuevos, nada se rompe. (Las ramas traían 0.6.0 y
  0.6.1; `main` ya había tomado esos números con #46 y #47.)
- Consumo: sin medir · Sonnet 5.5.

## 2026-10-18 12:40 · J4 · hecho
- **Qué:** las tres piezas que faltaban de J4 como módulos del motor: `features/puertas` (el servidor abre y cierra, cierre solo a los N s), `features/botones` (cuenta, enciende un segundo y dispara una señal solo del servidor que abre la puerta que nombra) y `features/cogibles` (coger y soltar; una en la mano; todas las páginas la ven en la mano con `view.lleva`; se suelta al salir). Mismo gesto en PC, móvil y VR (la carta `interact` del núcleo). Un mundo las trae en `MUNDO_DIR/interacciones.json`. Versión 0.7.1 → 0.8.0 (algo nuevo).
- **Números:** `test/interacciones.test.ts`, 8 pruebas (alcance, rechazo, cierre solo, señal botón→puerta, coger/soltar/salir, huella de la simulación igual, lectura del fichero); la suite entera en verde. Sin aparato VR real.
- **Consumo:** subagente; no medido.
- **Commit:** este PR.
- **Siguiente:** colisión de la hoja cerrada (J6), coger con la mano física en VR (como J10), más de una acción por botón.
## 2026-10-18 12:47 · medidas (D2 cifra, D2 puerta, MED pruebas) · hecho
- Qué: una sola cifra de arranque y una sola cifra de pruebas, con la orden que las produce. Nuevo `tools/tamano.mjs`
  (`npm run tamano`, y una fila nueva en `npm run gates`): mide lo que baja la página antes de dibujar (html + css +
  entrada + `modulepreload`, gzip -9 cada uno con `node:zlib`; qué entra y qué no, en `docs/MEDIDAS.md`) y falla por
  encima del tope. Sin cambios funcionales. FICHA, BACKLOG D2, SABER, AGENTS y README citan la cifra nueva; las de 109,
  261, 342 y 423 kB quedan como históricas (cada una contaba ficheros distintos).
- Números (punta del tren `5362797`): **arranque 434,9 kB gz (434.850 B)**; tope de la puerta **480 kB** (medida + 10 %,
  redondeado), meta D2 300 kB; `npm run gates` en verde con la puerta nueva. **`npm test`: 537 pruebas, 537 en verde,
  26,5 s** (`ℹ tests 537` del reporter; carga 5). Los «375» de turnos anteriores eran la cuenta de su rama en su día; el
  grep de ficheros (`test(` × 537) coincide hoy con el reporter.
- Consumo: sin medir · Fable 5.1.
- Siguiente: el recorte D2 (alias de three −24,5 kB, mapa/ficha/menú perezosos) y bajar `TOPE_GZ` con cada recorte.
## 2026-10-18 13:10 · tren 3, integración en un solo PR · hecho · versión 0.9.0 (rama `tren3/integracion`, desde `main` 39a9f73)
- Qué: los seis PRs que el tren 3 dejó abiertos y en conflicto entre sí (#52 silenciar, #54 contadores, #55 ajustes del
  mundo, #56 colisión por objeto + GLB, #57 BVH entero y rayo, #58 cable `disparadores@1`) más `tren/motor-2026-10-18-3`
  (#51 medidas, #53 suelo D-045), fusionados en este orden sobre `main` (que ya traía J4, 0.8.0). Un solo número:
  0.8.0 → 0.9.0 (cosas nuevas que no rompen nada). Conflictos: solo registros (`features/cliente|servidor|mundo.ts`,
  `packages/server/src/server.ts`, `limits.json`, EXTENDER, RUNLOG), resueltos conservando los dos lados.
- Lo que aporta cada uno: F1a `/silenciar` también calla la voz (`oye`), se guarda con el mundo y `/bloquear` es
  personal; D-044 temporizador, contador y reloj que todos ven (`contadores.json`, una vez por segundo a la zona);
  H7 `avatar` y `aforo` en `ficha.json` (mundo lleno → cierre 4004); M6 h1-h4 esquema `colision` (objetos v6),
  triángulos de un .glb en el servidor, BVH entero y rayo en enteros; D-041 `disparadores@1` (zona y botón con
  cooldown y un solo uso, receptores muestra/oculta).
- Números: ver el cuerpo del PR (`npm test`, `npm run layers`).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Siguiente: M6 historias 5-6 y 9; F1b; contadores historia 3; cable historias 3-6.
## 2026-10-18 12:30 · ux · hecho
- Qué: integración 2 de la ola 1 de interfaz: U22 (carteles acotados: el nombre solo del que miras y de quien habla; Alt / «Nombres» / Atrás), U20 (dial de densidad Mínimo · Normal · Completo, tecla U), U3 mínimo (marcos con caja, reloj, pila de avisos) y U24 (disposición móvil: seis controles, una acción). Probadas juntas a 1600×900 y 880×600 y con `?aparato=movil-vertical/horizontal`. Conflictos: `tema.css` y `ajustes-motor.ts` (se quedan los dos lados).
- Choques arreglados en un commit aparte: «Nombres» pasa al menú «…» en móvil; los avisos no tapan la barra ni el minimapa; el engranaje de Mínimo con perfil táctil forzado.
- Versión **0.9.0 → 0.10.0** (menor): ajustes y piezas nuevos, nada se rompe. Las ramas traían 0.6.2–0.6.5 y 0.8.0; rebasada sobre `main` 0.9.0 (#49, #50, #60), una sola subida (`docs/VERSIONES.md`).
- Consumo: sin medir · Sonnet 5.5.
## 2026-10-18 14:48 · mover-girar (D-043 historias 1-2) · hecho (rama `mover-girar/ola3`, para `tren/motor-2026-10-18-5`)
- Qué: pieza nueva `features/movedores` — mover y girar objetos del mundo con duración, igual para todos (D-043):
  una plataforma o un ascensor que va y viene solo (`vaiven`: pose A → B → A…, con una pausa `espera` en cada punta)
  y una puerta corredera que espera hasta que alguien cercano la activa (`interruptor`: la orden `activa`, el mismo
  alcance que el «E: usar» de una puerta). El servidor lleva el reloj de cada ride (interpolación lineal pura,
  `poseDe`/`lerpPose`) y publica la postura 5 veces por segundo mientras se mueve (no 20), solo a quien está en su
  zona; al llegar a un lado emite `llegada` con el nombre de evento del fichero para que otra pieza (el cable) lo
  use más adelante. Un mundo trae sus movedores en `entorno/movedores.json` (`numinia-engine/movedores@1`,
  `leerMovedores`, cada línea mala fuera con su motivo). La página solo dibuja el modelo donde dice el servidor
  (`view.place`), nunca decide la postura.
- Números: `test/movedores.test.ts` (6 pruebas: declaración, pose pura, fichero, `conMundo`, vaiven de punta a
  punta, interruptor con alcance e ignorando una orden a mitad de camino); `npm run gates` en verde (631 pruebas,
  capas, determinismo `f455ffc1`, ancho de banda 26,6 kbit/s, plaza de 1.000 p99 8,4 ms, tamaño 452,4 kB).
- Consumo: sin medir · Sonnet 5 (obrero ola 3).
- Siguiente: cable (D-041) todavía no tiene un receptor `mueve` para disparar un movedor desde un botón o una zona
  (lo deja para la historia del cable, que toca `ACCIONES` en `features/disparadores/feature.ts`); medir el coste
  real de publicar varios movedores a la vez bajo carga (PUBLICA_CADA_TICKS=4 es una estimación, no una medida).
## 2026-10-18 14:57 · contadores-h3 · hecho
- Qué: D-044 historia 3. `features/contadores` gana `state.persist: true` (S4): el valor y si está en marcha
  sobreviven a un reinicio (al arrancar lee lo guardado antes de usar `inicio` del fichero). Contador
  `"variante": "equipo"` (campo nuevo en `contadores.json`, por defecto `ninguna`): cada orden lleva `equipo`
  (1-16 letras minúsculas/cifras/guiones, nombre libre — no una lista que declare el fichero) y el servidor
  crea ese equipo la primera vez que se nombra, clave `id:equipo`, hasta `EQUIPOS_MAX` (8) por contador; el chat
  toma `/contador <id>:<equipo> …`. Queda sin hacer (EXTENDER.md): un contador por persona, poner/quitar
  contadores desde dentro del mundo, y el cable (D-041) con `llegada`.
- Números: 12 pruebas de `contadores.test.ts` (antes 9), 628 en total (627 bien + 1 flaky de `misiones.test.ts`,
  ajeno: p99 de carga, reproducido en verde aislado); capas OK; bandwidth y plaza de 1.000 OK.
- Consumo: sin medir · Sonnet 5.
- Commit: ver `git log` (rama `contadores-h3/ola3`).
- Siguiente: contadores — un contador por persona, piezas desde dentro del mundo; cable D-041.
## 2026-10-18 15:10 · obrero ola3, cable-h3-4 · hecho
- Qué: cable `disparadores` historias 3-4 (D-041): los cinco receptores que hasta hoy se oían en el log y se
  tiraban («nadie hace X») ahora ejecutan de verdad: `teletransporta` (sin animación, hueco libre cerca con
  `api.teletransportar`) y `vuelve_a_seguro` (`api.volverASeguro`, el mismo verbo que D-045) los oye el propio
  `disparadores` porque son primitivas del host, no de una función; `suena` emite un evento propio (el motor
  solo tiene un aviso fijo hoy, el nombre que pide el mundo viaja en el texto para quien lee en vez de oír);
  `abre_enlace` pregunta solo a quien lo pulsó, nunca abre nada sin que la página confirme antes; `da_paso`
  (mision, paso) lo oye `features/misiones` (`api.listen`), toma la misión si hacía falta y salta de un golpe
  al paso pedido, sin retroceder nunca. De paso, `vuelve_a_seguro` entra en `ACCIONES` (cambio aditivo).
- Números: `npm test` sobre `test/disparadores.test.ts` + `misiones*.test.ts` + `suelo.test.ts` +
  `teletransporte.test.ts`: 59 pruebas, 59 en verde. El resto de `npm test` (23 ficheros) falla igual con y sin
  esta rama por falta del paquete `three` en este entorno — nada tocado por esta historia.
- Consumo: sin medir · Sonnet 5.
- Siguiente: cable historias 5-6 (botón/zona con fases, etiqueta en móvil) quedan para otro obrero.
## 2026-10-18 · cable-h5-6 · hecho (rama `cable-h5-6/ola3`)
- Qué: cable (D-041), historias 5-6. Vista del constructor: `apps/plaza/cable.ts` añade al panel de construir una
  lista de solo lectura de los disparadores del mundo (nombre, tipo, en espera/agotado/listo, usos) con un botón
  «Probar» para disparar un botón sin acercarse (para comprobar el cableado). Editar los receptores sigue siendo
  editar `disparadores.json` antes de arrancar: el servidor no lo reescribe en marcha y la página no recibe los
  receptores (no son un secreto, solo no viajan todavía); la duda de si merece la pena un editor en vivo queda en
  `PREGUNTAS-cable-h5-6.md` para Pablo. E2E de extremo a extremo: `tools/e2e-piernas/cable.mjs`, mundo propio
  (8798/5180) con un botón que muestra una «Farola» oculta — pulsar, ver el cambio en dos pestañas, el cooldown
  rechazando un segundo disparo y «Probar» desde el panel disparándolo de nuevo tras esperar.
- Números: `npm test` 625/625 en verde; `npm run build` verde; e2e (`node tools/e2e-piernas/cable.mjs`) OK.
- Consumo: sin medir · Sonnet 5 (obrero ola 3).
- Siguiente: si Pablo quiere editar el cableado en vivo (no solo verlo), hace falta mandar los receptores al
  cliente constructor y un camino para reescribir `disparadores.json` con la instancia corriendo.

## 2026-10-18 05:00 · E1 · simulador de economías (`tools/economia/`) · hecho (rama `economia`)

- Qué: una herramienta de diseño para simular economías de juego ANTES de programarlas, con el método de
  diagramas de recursos de Dormans (tesis 2012, CC BY-NC; conocimiento académico, no el producto machinations.io).
  Diagrama como datos (almacén, fuente, sumidero, conversor, puerta, registro; activadores y disparadores) y
  `simular(d, { ticks, semilla })` → serie de cada almacén por tick, con el `rngInt` de `packages/core` (misma
  semilla → misma serie). Dos modelos reales: la Tabla de Prestigio del manual (`modelos/prestigio.ts`) y el
  ritmo de Reliquias con «piedad» (`modelos/reliquias.ts`). CLI `node tools/economia.ts prestigio|reliquias`.
  Lo aprendido (patrones del apéndice B + 8 diseños públicos de la comunidad + conclusiones) en
  `../mmo-browser-study/MAQUINACIONES-APRENDIZAJE.md`.
- Conclusiones reales: (1) el Prestigio no se infla — es una fuente estática, crece lineal (~4,2 puntos/sesión
  con 1–3 Semillas) — lo que hay es sequía: en mesa semanal una Aptitud nueva (1000) tarda 239 sesiones
  (4,6 años); en el MMO, con 3–7 misiones/día y un tick = día, los mismos costes dan 5/48/96 días: la tabla
  equilibra en el MMO y no en la mesa sin tocar un número. (2) Falta el freno de todo RPG: un gastador sube
  la misma Competencia 4–5 veces al año a 50; con coste 50·nivel compra 1 y reparte. (3) Reliquias al 5 % sin
  piedad: p95 57 encuentros hasta la primera, peor 156; con +1 %/fallo, p95 19, nadie pasa de 36, y la piedad
  manda más que la base (espera mediana 8–11 sea la base 5 % o 1 %).
- Dónde vive y por qué `tools/` y no `packages/`: es una herramienta interna de diseño, no una capa del motor;
  nada en `packages/`/`features/` la importa ni debe hacerlo todavía; `tools/layers.json` no cambia. Si algún
  día una feature necesita leer un diagrama (p. ej. para que el servidor aplique la Tabla), se saca a
  `packages/economia` con su fila en `layers.json`.
- Números: 390 pruebas en verde (14 nuevas: 8 nodos/determinismo/validación, 6 modelos con números fijados);
  1 mala conocida intermitente (`test/chat.test.ts` «cost: names for 1,000 players», por tiempo con la máquina
  cargada; pasa al repetir). `npm run layers` ok. Versión **0.11.0** (menor: herramienta nueva, nada roto).
- Consumo: sin medir · Opus (sesión de Pablo).
- Commit: rama `economia` rebasada sobre origin/main.
- Siguiente: Pablo decide (a) cuántas Semillas da una sesión de mesa y si la Tabla lleva freno (coste por
  nivel o tope), (b) la piedad de Reliquias antes que la base. Luego: modelo del daño en combate (D6 por
  Éxitos, plantilla «Souls-like Balancing» §3.4 del documento), conectar con `features/misiones` cuando
  haya Semillas reales, y un editor visual propio solo si dibujar a mano empieza a doler.
## 2026-10-17 23:45 · L1 · hecho
- Qué: sistema de lucha, trozo 1. Función `lucha`: criatura = entrada de estado con coherencia (no vida: se
  disuelve), modo y caja sólida que la simulación ya respeta (`solido` + bx0…bz1, como `objetos`); `golpear`
  → `within`, enfriamiento 12 ticks por jugador («tick desde el que puede», sin contadores), daño 3-5 del
  PRNG del motor mezclando el tick, `golpe`/`aire`/`disuelta`/`vuelve`, reaparición 20 s; ficha
  `bestiario.ts` con el Guardián de Crisálida (cita del canon, números del motor); la página dibuja el bloque
  de la casa escalado a la caja y pintado (`view.place`), nombre, flash blanco 80 ms y «−N» 700 ms, tinte a
  gris con la coherencia; `MUNDO_DIR/lucha.json`. Solo PVE; la criatura no se mueve ni devuelve el golpe.
  Diseño completo (combate + bestiario de 12 criaturas ancladas al canon, filas L1-L10):
  `mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md`. Versión **0.4.0** (menor: algo nuevo).
- Números: 384 pruebas, 383 en verde + 1 mala conocida (`test/chat.test.ts` coste de nombres, pasa sola:
  13/13); 8 nuevas en `test/lucha.test.ts`. `npm run layers` ok. Build ok: arranque 111,26 → 112,81 kB gz
  (+1,55 kB: declaración y controlador, sin 3D nuevo).
- Consumo: sin medir · Sonnet 5.5 (la sesión de Pablo).
- Commit: rama `lucha/trozo-1` sobre origin/main 749e99a (ver `git log`).
- Siguiente: Pablo decide D1-D3 del diseño (PVP; jugador sin vida y con Estados; anclajes multiplican el
  daño) y si abre PR; después L2 (estados del jugador) y L3 (la criatura se mueve).
## 2026-10-17 17:26 · U14 · hecho (primer corte)

- Qué: mandos del vídeo, lo pequeño primero (`packages/render/src/medios.ts`: `ControlVideo` nuevo — pausar/reanudar,
  parar, volumen 0–1 propio; `packages/render/src/index.ts`: `view.controlVideo(key)`; `apps/plaza/video-mandos.ts`
  nuevo, montado en `main.ts` junto a `interactuar.ts`: cerca de un vídeo ofrece «E: pausar/reanudar el vídeo» — el
  mismo gesto en pantalla plana (E o clic) y en VR (el mando, vía `xr.ts`/`interaccion.usar()`, sin tocar ese
  fichero); un panel al pie (`#video-mandos`, pantalla plana) añade Parar y un deslizador de mi volumen. TODO lo que
  hace es MÍO SOLO — nunca toca el reloj compartido ni se manda al servidor — a propósito, por las dos preguntas de
  fondo que Pablo pidió dejar escritas, no decididas (BACKLOG.md U14): (a) ¿el mando es mío o del mundo (cine
  compartido)? (b) si es del mundo, qué permiso de la organización (STD-052) lo exige. Después de U14, en tarjetas
  aparte: U15 (vídeo 360/180, pantalla curva).
- Números: `npm run build` sin crecer de tamaño (igual 111,78 kB gz del bloque principal); `npm run gates`: 375
  pruebas en verde (cinco más que la entrada anterior, nuevas en `medios.ts`), capas 0, determinismo, ancho de banda
  y tick de 1.000 sin cambios.
- Aviso / sin comprobar: sin leg de e2e con un vídeo real en un navegador de verdad (no hay ninguno hoy en el
  repo para vídeo — las pruebas unitarias de `medios.ts` no tocan DOM; headless no siempre decodifica mp4). Volumen
  y «Parar» solo existen en el panel de pantalla plana: en VR no hay `dom-overlay` para mostrar HTML (el panel de
  muñeca es J13, sin construir). No probado con el mando de un visor real.
- Consumo: 19% de la semana (sin lectura previa a este turno) · Sonnet 5.5.
- Commit: rama `video/mandos-propios` (ver `git log`), PR por abrir.
- Siguiente: Pablo decide (a) y (b) de BACKLOG.md U14 — si pausar/parar pasa a ser del mundo (cine compartido) con
  permiso de organización, o se queda como está (mío solo); luego, J13 (panel de muñeca en VR) para el volumen y el
  parar sin salir del visor, y una pierna de e2e (`tools/e2e-piernas/`) con un vídeo real.

## 2026-10-18 16:09 · j4-usar-mantener-pulsado · hecho
- Qué: J4 «E: usar» con mantener pulsado (puerta, botón, objeto que se coge). `Interact`/`Reachable` (packages/feature)
  ganan `hold?: number` (segundos; sin él, como antes, se usa al instante). Las tres declaraciones de PR #50
  (`features/puertas`, `features/botones`, `features/cogibles`) ponen su propio `MANTENER_S` (0.6/0.5/0.4 s) en
  `card.interact.hold`; el servidor no cambia (el intent sigue siendo el mismo, solo cambia CUÁNDO la página lo manda).
  `apps/plaza/interactuar.ts`: E, el botón de acción (móvil) y un clic en el botón ya no disparan al instante si el
  objetivo tiene `hold` — empiezan a «mantener» (`--progreso` 0..1 en CSS, clase `.manteniendo`, un anillo cónico junto
  al texto en `index.html`/`tema.css`) y solo usan la cosa al llegar a 1; soltar antes, o que el objetivo cambie,
  cancela sin mandar nada. `apps/plaza/xr.ts` + `packages/render/src/manos.ts`: un nuevo evento `gatillo_fin` (en
  `selectend`) deja que el gatillo de VR también sea mantener-y-soltar, con la misma función compartida
  (`interaccion.mantener.empezar/soltar`).
- Números: `npm test` 746/746 verdes (3 nuevas en `test/mantener-pulsado.test.ts`: la aritmética pura de
  `fraccionMantenida`, que las tres declaraciones llevan su `hold`, y que `reachable()` lo manda igual a dos
  `ClientSession` — «la otra pestaña lo ve igual»). `npm run build` verde (bundle principal sin cambio apreciable:
  el cambio es CSS + unas líneas de JS). Versión 0.11.0 → 0.12.0 (función nueva, nada se rompe).
- Aviso / sin comprobar: sin pierna de e2e con un navegador real (Playwright) sosteniendo E/el botón/el gatillo los
  milisegundos exactos — no existe aún una pierna para puertas/botones/cogibles (PR #50 tampoco trajo una); la
  cobertura de «la otra pestaña lo ve igual» es la prueba headless multi-página de siempre. El anillo de progreso
  no se ha visto en un visor real (VR): el mantener-y-soltar está cableado (gatillo_fin) pero sin un dibujo propio
  en el panel de muñeca (eso es J13, sin construir). Un clic directo sobre la cosa en pantalla (no E, no el botón)
  sigue siendo instantáneo a propósito (fuera de alcance de esta historia pequeña).
- Consumo: sin lectura previa a este turno · Sonnet 5.
- Commit: rama `j4/usar-mantener-pulsado` sobre `tren/motor-2026-10-18-5` (ver `git log`), PR al tren.
- Siguiente: una pierna de e2e real (Playwright) para los tres casos; dibujar el anillo también en el panel de
  muñeca de VR (J13); decidir si el clic directo sobre la cosa también debería pedir mantener pulsado.
## 2026-10-18 03:20 · M22b-1 · constructor táctil mínimo: toque selecciona, arrastrar mueve · hecho (rama `constructor/tactil-minimo`)
- Qué: primera pieza del constructor en el móvil, como EXTENSIÓN del de M22 (mismo `features/objetos/client.ts`,
  mismo `gizmo.ts`, mismo `programarEnvio`): solo cambia la entrada. En `apps/plaza/constructor.ts` una capa de
  dedo en `document` (fase de captura): un toque sobre una cosa la selecciona; arrastrarla la mueve por el suelo y
  por encima de otras cosas conservando el desfase dedo-cosa (`ed.puntoBajo` + `ed.poner` + `ed.sostener`); la
  cámara se bloquea mientras (`cam.bloquear`) y el joystick no ve ese dedo; en «mover» táctil no se cargan las asas
  de TransformControls (la cosa es la asa); botones ≥ 44 px con `(pointer: coarse)`. Hallazgo al medir: en un
  teléfono de 420 px el panel de construir (320) y el de entorno (270) tapaban el mundo ENTERO — no se podía tocar
  nada. `apps/plaza/tema.css` (que manda con `!important`): hoja inferior ≤ 38 vh para construir y tira arriba a la
  izquierda para entorno en `(pointer: coarse) and (max-width: 700px)`. Diseño completo de móvil + VR (M22b-1..5,
  comparativa con cluster World Craft y el ClientBuilder de Hyperfy, puntuaciones):
  `work/mmo-browser-study/MODO-CONSTRUCTOR-MOVIL-VR.md`. Versión **0.11.0** (menor: entrada nueva, nada roto).
- Números: 376 pruebas en verde; puertas todas en verde (tick p99 12,3 ms, 26,7 kbit/s). Pierna nueva
  `tools/e2e-piernas/constructor-tactil.mjs` (chromium, toques reales por CDP, 420×800, dos pestañas): 8 pasos en
  verde — toque selecciona con la cámara quieta (yaw 0 → 0), arrastre de 150 px mueve el bloque 5,2 m y B lo ve,
  sin asas, toque en el vacío deselecciona, deshacer devuelve en B, borrar. La pierna de ratón `constructor.mjs`
  sigue en verde en chromium.
- Consumo: sin medir · claude-fable-5-1.
- Commit: rama `constructor/tactil-minimo` sobre origin/main 749e99a.
- NO probado en un teléfono real (solo la emulación táctil de chromium: `pointer: coarse`, `maxTouchPoints 1`).
  Defectos conocidos: `#barra-objeto` se sale por la derecha en 420 px; los botones de acción (Saltar, Saludar…) se
  montan sobre la hoja; el HUD de depuración pisa la tira de entorno; `dblclick` táctil para abrir construir sin
  probar. Siguiente: M22b-2 (dos dedos giran/escalan, retícula de colocar, hoja en 3 estados), M22b-3 (VR con mando).

## 2026-10-18 01:55 · M18b · El Graboso: la reliquia que graba lo que ves · hecho (rama `objetos/graboso`)
- Qué: Pablo escribió la fila M18b esta madrugada (cabeza de oso electrónico de nube translúcida; sacarla y
  grabar vídeo + audio del mundo, 30 s–1 min con tope duro; misión «hacer vídeos de dentro de los mundos»).
  Diseño primero (`../mmo-browser-study/GRABOSO-DISENO.md`: Reliquia según el manual 06 — se invoca, no se
  usa; complemento de la Lira de Nyx), luego la v1: botón «Graboso» en la barra y tecla K; la cabeza sale
  sobre el hombro derecho (esfera + orejas + hocico + ojos + antena con piloto rojo que late, nube pintada en
  un canvas, material translúcido; carga perezosa, 2,5 kB) y graba en el acto: `canvas.captureStream(30)` +
  micrófono con permiso (negado → sin sonido, dicho) por `MediaRecorder` (webm vp9/vp8+opus o mp4); tope
  30/45/60 s (60 por defecto; `recortarTope` nunca sale de 30–60); K, el botón o el tope guardan; píldora
  «● 0:12 / 1:00» → «Clip 0:42 · Descargar · Ver · Quitar»; descarga local `graboso-<UTC>.webm`; solo el
  último clip, en memoria. Y1 no está fusionado: acceso directo (todo jugador lo tiene), documentado como «a
  conectar con Y1». Versión **0.4.0** (menor: algo nuevo).
- Números: 389 pruebas (13 nuevas), 389 en verde; puertas en verde (26,7 kbit/s, p99 8,4 ms). Pierna e2e nueva
  `tools/e2e-piernas/graboso.mjs` en chromium real con micrófono falso: 18/18 (clip webm 3,4 s / 236 kB con
  cabecera EBML, con sonido, descargable, `<video>` con el blob, cabeza fuera y guardada, K no actúa en el chat).
- Aviso: con mis servidores de desarrollo encendidos cayó la prueba de coste de nombres de `chat.test.ts` (la
  mala conocida de la máquina cargada); apagados, 389/389. Y1 también sube a 0.4.0: la segunda en entrar a
  main sube a 0.5.0.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `objetos/graboso` sobre origin/main 749e99a (ver `git log`). Sin push ni PR: `../pr-graboso-motor.sh`.
- Siguiente: Pablo decide la PR (hueco de PR único en numinia-engine; Y1 también espera) y el consentimiento
  (§6 del diseño: avisar a quien sale «X ha sacado el Graboso»). Después: conectar con Y1, voces de otros en
  el clip, modelo fino, VR, compartir (M18c).

## 2026-10-18 17:31 · AR-D1 · hecho
- Qué: duelo de dardos, parte del servidor (dardos v2). `dardos.json` acepta `duelo`, `remoto` y `rondas` (1-5, por
  defecto 3); `jugar` admite `desde: "pared"` (solo en dianas `remoto`); el primero que juega espera, el segundo
  empieza la partida, los turnos alternan (3 dardos), `lanzar` fuera de turno se rechaza, gana el total más alto
  (o `empate`), y salir/desconectar/60 s sin tirar da la victoria al otro (`abandono`). Eventos nuevos `duelo` y
  `finduelo`; `dardo` y `fin` llegan también a los dos jugadores sea cual sea la distancia. Una diana sin los
  campos nuevos no cambia. Sin `duelos`/`ganados` en el marcador (rompería el evento fijado por la prueba v1).
- Números: `test/dardos-duelo.test.ts` nuevo (8 pruebas) y `test/dardos.test.ts` (10) sin tocar, en verde.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `ar/duelo-servidor` sobre origin/main 91f73a5. Sin push ni PR.
- Siguiente: historia de la página (controlador y vista del duelo, AR sin estar cerca) y lanzar en VR (otra sesión).

## 2026-10-18 17:37 · AR-D2 · hecho
- Qué: duelo de dardos, controlador de la página (dardos v2, `features/dardos/client.ts`). `dardos.duelo()` da turno,
  `miTurno`, rival, puntos y `fin` (`gane`/`empate`/`abandono`) a los dos jugadores y a un curioso cerca (`yo: false`);
  `alCambiar` avisa `"duelo"`; los dardos del rival se quedan hasta su siguiente turno y, tras `finduelo`, 6 s. Una
  diana sin campos de duelo no cambia. De paso, la entrada AR-D1 de este diario estaba pegada dentro de la línea de
  formato de la cabecera: la he movido al final.
- Números: `test/dardos-duelo-cliente.test.ts` nuevo (7 pruebas); `dardos.test.ts` y `dardos-duelo.test.ts` sin tocar, en verde.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `ar/duelo-servidor` (ver `git log`). Sin push ni PR.
- Siguiente: AR-D3 (la vista del duelo en la página y en AR; `apps/plaza/dardos.ts` y `packages/render`).

## 2026-10-18 17:42 · AR-D3 · hecho
- Qué: duelo de dardos visto desde la pared (AR) y desde la página. Marcador 3D sobre la diana de pared (nombres,
  puntos, ronda, turno, «Esperando rival…», «Ganas/Pierdes/Empate»), dardos del rival que entran volando 0,4 s,
  lanzar solo en tu turno (fuera de turno no se envía nada), `dardos.salir()` al acabar la sesión AR, una línea de
  duelo en el HUD de la página. Todo en archivos nuevos (`dardos-duelo.ts` y `dardos-duelo-ar.ts` en render,
  `apps/plaza/dardos-duelo.ts`); a los existentes solo una importación y unas pocas líneas. De paso, `salir()` del
  controlador vale en una partida también en el turno del rival.
- Números: `test/dardos-duelo-ar.test.ts` nuevo (8 pruebas); marcador pintado a PNG en un navegador (IWER no pinta).
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `ar/duelo-servidor` (ver `git log`). Sin push ni PR.
- Siguiente: AR-D5 (e2e con dos jugadores); el lanzar con la mano en VR es de otra sesión.

## 2026-10-18 18:20 · AR-D4 · hecho
- Qué: el duelo de dardos visto desde la plaza. Letrero 3D sobre la diana del duelo (nombres, puntos, ronda, turno,
  resultado, invitación «Esperando rival — ¿juegas desde tu pared (AR)?»), etiqueta «En su pared (AR)» y los dardos
  del jugador de pared entran en arco (el mismo vuelo que en AR) en la diana 3D. Campo nuevo y aditivo en el cable:
  `paredA`/`paredB` en `duelo` y `finduelo` (la feature sigue en versión 2). Código nuevo en archivos nuevos
  (`dardos-duelo-plaza.ts` puro, `dardos-duelo-plaza-3d.ts`); a `dardos.ts` de render solo cuatro asas, a `index.ts`
  una llamada por fotograma, a `apps/plaza/dardos.ts` tres líneas. Arreglo del controlador: un curioso conservaba
  «Esperando rival…» si el anfitrión desistía.
- Números: `test/dardos-duelo-plaza.test.ts` nuevo (8 pruebas); `dardos-duelo.test.ts` ajustado al campo nuevo; letrero
  pintado a PNG y arco muestreado en un navegador (el render GL de escena no estaba disponible en el headless).
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `ar/duelo-servidor` (ver `git log`). Sin push ni PR.
- Siguiente: AR-D5 (e2e con dos jugadores, incluida la plaza).

## 2026-10-18 18:50 UTC · AR-D5 · hecho
- Qué: la pierna e2e `tools/e2e-piernas/dardos-duelo.mjs`: dos navegadores de verdad (PC y Quest 3 emulada con una pared)
  juegan el duelo entero en un mundo desechable (diana `torre` con `duelo`, `remoto`, `rondas: 1`; aparición a 45 m).
  26 comprobaciones: letrero de espera, entrada `desde pared` con B fuera de alcance, nombre y «En su pared (AR)» en A,
  turno en el panel AR de B, tiros fuera de turno de los dos lados, dardos en las dos pantallas, puntos y veredicto
  iguales al servidor, salida de AR limpia, y la variante de abandono. Ganchos de solo lectura `dardosHud.duelo()`.
  Propuesta `dardos.json` de la Torre en `work/motor-ar/PRUEBA-TORRE-duelo/` (sin tocar el mundo).
- Arreglos que salieron: (1) `cerradura.ts`: el teclado de la cerradura tenía `display: grid` en línea, que le gana a
  `hidden`: en el ordenador quedaba un teclado a pantalla completa tapando la página y el ratón (en el móvil lo tapaba
  una regla global); ahora se muestra y oculta con `display`. (2) La línea del HUD de la página usaba 3 rondas para
  quien no colgó la diana en la pared («Ronda 1/3» en una diana de 1); ahora lee las rondas de la diana.
- Números: 26/26 comprobaciones, sin errores de página, ~120-145 s con la máquina a carga 40+. Una vez falló por un
  anfitrión esperando solo >60 s (se cancela, es la regla): la pierna abre a B antes de que A pulse E.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `ar/duelo-servidor` (ver `git log`). Sin push ni PR.
- Siguiente: botón real para que quien está lejos abra la vista de dardos (hoy solo el gancho de prueba); el etiquetado
  «Salir de AR» del botón no se refresca al salir de AR hasta el siguiente cambio de estado.

## 2026-10-18 17:54 · ko-t_e8a450a4 · hecho (mitad)
- Qué: H11 (importar de Hyperfy), la mitad `db.sqlite`+`assets/` → carpeta del mundo (la otra mitad, `.hyp` →
  carpeta de app, sigue esperando a M19, que está «para Opus»; no se ha tocado). `packages/server/src/importar-hyperfy.ts`
  lee `config`/`blueprints`/`entities` con `node:sqlite` (sin dependencia nueva), resuelve cada `asset://<sha256>.<ext>`,
  copia el fichero a `datos/activos/`, convierte posición y cuaternión a los campos de H1 (grados, orden yaw→pitch→roll)
  y escribe `datos/objetos.json` tal cual lo lee `FileStorage` al arrancar (a mano, sin importar `features/objetos`
  desde `packages/`: lo prohíbe la regla de capas). H7: `aventura/ficha.json` con nombre/descripción/portada/aforo.
  CLI `tools/importar-hyperfy.ts`; informe de lo traído (`informe-importacion.json`+`.txt`): leídos, importados,
  omitidos con motivo, activos copiados/que faltan.
- Números: `test/importar-hyperfy.test.ts` nuevo (5 pruebas, todas en verde); `npm test`: 777 bien, 0 mal;
  `npm run gates`: todas las puertas en verde (capas 0, determinismo igual, ancho de banda 26,6 kbit/s, plaza de
  1.000 p99 15,4 ms, página 469,1 kB). La prueba fuerte arranca de verdad la función `objetos` (`Instance` +
  `FileStorage`) sobre lo que escribe el importador y comprueba la cosa en su sitio, giro y escala exactos.
- Consumo: sin medir · Sonnet 5.5.
- Commit: rama `ko/t_e8a450a4` sobre `origin/tren/motor-2026-10-18-6`.
- Siguiente: probar contra un `db.sqlite` real de un mundo Hyperfy (de momento solo el fijo de prueba); la mitad
  `.hyp` → carpeta de app espera a M19.
## 2026-10-18 17:25 UTC — arreglo: el teclado de la cerradura tapaba el mundo desde que carga (0.14.1)
- Visto por Pablo en vídeo (Alchemist Tower, v0.11): el teclado de la cerradura (D-042) sale al cargar, sin nombre, y ni «Abrir» ni «Cerrar» lo quitan: la capa ocupa toda la pantalla y el jugador queda bloqueado.
- Causa: la capa llevaba `display: grid` en línea; un estilo en línea gana al atributo `hidden`, así que `capa.hidden = true` no la escondía nunca.
- Arreglo: la capa nace con `display: none`; abrir pone `grid`, cerrar vuelve a `none`. Prueba nueva `test/cerradura-teclado-oculto.test.ts` (falla con el código viejo, pasa con el nuevo). Versión 0.14.1 (parche).
## 2026-10-18 01:15 · Y1 · El Inventario v1 · hecho (rama `inventario/version-1`, rebasada sobre main 0.10.0)
- Qué: el cimiento que faltaba (Pablo, 18-10). `features/inventario/` (reglas puras `reglas.ts` + servidor + cliente):
  un objeto es {id, tipo arma/reliquia/token, clase, nombre, icono, color, valor, n, portado}; límites del canon
  leídos del manual (lore 06, Fragmento 2): 1 arma contigo, 3 reliquias contigo, el resto en la Reserva; los tokens
  (Semillas por color, valor 1-5 de Prestigio) apilan y no se portan. Guardado por invitado en `api.store`
  (`i:<quien.id>`, S4), enviado entero solo al dueño (todas sus pestañas). Puerta para dar objetos sin acoplar
  funciones: cualquier función emite su `otorga` con `scope: "server"` y el inventario lo oye (`api.listen`, J3).
  `misiones` lo usa: `recompensas` admite `{ "tipo": "semilla", "color": "verde" }` (la misión de ejemplo lo lleva)
  → al completarla, «Recibes Semilla verde». Panel `apps/plaza/inventario.ts` (tecla R, botón en la barra de arriba):
  «Llevas contigo» y «Reserva», icono de la casa por fila, «Llevar/Guardar» en armas y reliquias; la ficha (I)
  resume. Versión **0.10.0 → 0.11.0** (menor: función nueva, nada roto). Diseño: `work/mmo-browser-study/INVENTARIO-DISENO.md`.
  Honestidad: la «pregunta en un sitio real» de R2 NO existía como función; lo que había era `despertar` (QR).
  Hoy la Semilla entra por la misión completada; R2 usará la misma puerta `otorga`.
- Números: 8 pruebas nuevas (`test/inventario.test.ts`), 384 en total, 383 en verde + la mala conocida de
  `test/chat.test.ts` (coste de nombres; la máquina a carga 26; sola pasa). Puertas: capas, determinismo (huella
  f719d31b intacta), ancho de banda 26,7 kbit/s, tick p99 11,2 ms OK. 1.000 personas entran con 8 objetos cada
  una: 59 ms en total. Una Reserva llena (24) con nombres largos cabe en una clave de S4 (≤ 4.096 bytes).
  `npm run build` OK. e2e real (chromium, pierna `misiones.mjs` ampliada): la Semilla aparece en el panel R con su
  icono, sin botón (token), la ficha dice «1 objeto · Semillas: 1 punto de Prestigio», otro invitado no la ve.
- Consumo: sin medir · Fable 5.1 (sesión de Pablo).
- Commit: rama `inventario/version-1` sobre origin/main 749e99a (ver `git log`). Sin push ni PR (Pablo decide).
- Siguiente: Y2 (llevar de verdad: mano del avatar, ficha V1; arrastrar y soltar), Y3 (`objeto@1` por aventura y
  `coge` que da armas/reliquias), iconos propios (Phosphor `backpack`/`sword`/`plant`: decisión del Oráculo).
- Solapes con `bienes` (N10/N18, ya en main), resueltos dejando lo de main intacto: (1) la sección «Inventario» de la ficha es de
  `bienes` (`apps/plaza/bienes.ts`); la Reserva va en otra sección, «Reserva» (orden 71). (2) La tecla L ya es «Gente» y H es «Bailar»:
  el panel usa R (con `noConstruyendo` en `crearDialogo`: el constructor usa R). (3) `bienes` = cosas con recibo firmado que salen de un
  cofre (`concedido`); `inventario` = armas/reliquias/tokens de la Reserva (`otorga`): dos almacenes y dos eventos de servidor distintos,
  sin cruce. Si algún día un `objeto` de `bienes` debe poder llevarse como reliquia, hay que decidirlo (no se hizo).
## 2026-10-16 15:40 · J1 · el VRM ya no «corre despacito» · hecho (sesión con Pablo, sin subir)
- Qué: Pablo: «va como corriendo despacito, depende del avatar». Medido en la Torre: andando a 4 m/s suena el trote
  (`Jog_Fwd_Loop`) al 0,87 de su velocidad, el ritmo que deja los pies quietos en el suelo; pero ese bucle da 2 pasos
  muy largos (1,17 s), así que a ese ritmo son ≈ 90 pasos por minuto: un trote a cámara lenta. Ahora el trote y el
  sprint se encuentran a medio camino (media geométrica) con una cadencia natural (`CADENCIA` 2,75 y 3,15 pasos/s
  para caderas de 0,9 m, más rápida para piernas cortas): Astrodisco anda al 1,19 (≈ 122 pasos/min), los pies
  resbalan un poco. Andar despacio no cambia. `view.avatares()` da velocidad, ritmo y cadera de cada uno.
- Números: 282 pruebas en verde; build bien; en la Torre ritmo 0,87 → 1,19 a 4 m/s (`work/torre/paso-qa.mjs`).
- Consumo: sin medir · Opus 5.5.
- Commit: rama `avatares/paso-natural` (sobre main e8468e8).
- Siguiente: que Pablo lo vea; si sigue raro, el arreglo de fondo es un ciclo de trote con más pasos por bucle o
  andar más despacio que 4 m/s (eso cambia la simulación).
## 2026-10-16 19:27 · J7b · rueda de movimientos · hecho (sesión con Pablo, sin subir)
- Qué: Pablo: «coges esos 45 movimientos… la típica rueda». De los 45 clips de Quaternius UAL1 (CC0) entran 33: los 5 de
  andar y 28 más, en 29 `.vrma` nuevos (el 29.º, el saludo, que UAL1 gratis no trae, es el cuerpo de `Idle_Loop` con el brazo derecho escrito
  en el conversor). Fuera, con su porqué en `LICENCIAS.md`: pose T, ciclos que se desplazan, gemelos `_RM`, dos poses de
  un fotograma y dos salidas. 27 movimientos como datos (`features/gestos/movimientos.ts`) en 4 grupos; `gestos` pasa a
  versión 2 (el `enum` es la lista + `parar`; aditivo, la huella 93b192c8 igual). En el VRM: entrada + bucle (sentarse →
  sentado), una vez, o quedarse en la última pose; andar o saltar lo termina en todas las pantallas; cada clip se baja
  la primera vez que alguien cerca lo hace. Rueda: G mantenida (toque = saludar), botón «Movimientos» en táctil, Y en
  el mando; 8 porciones, anillo de favoritos guardado en el navegador (F), ↑↓ anillos, ←→ 1–8 Intro, Esc; HTML con
  botones para el lector de pantalla, sin animación con «menos movimiento»; mientras está abierta nadie anda. Aspecto
  Nocturno (tema.css), sin marca. Por qué G y no otra tecla: es la tecla de los gestos desde J7 y la mano ya está ahí;
  K/L/U estaban libres pero lejos de WASD.
- Números: 288 pruebas en verde (6 nuevas en `test/rueda.test.ts`); puertas en verde (tick p99 8,1 ms); build bien
  (arranque 301 kB, 113,5 kB comprimidos; los clips no van en el paquete). e2e chromium contra servidor propio
  (8870/5370): `tools/e2e.mjs` OK, pierna avatares OK (295 kB de animaciones al entrar, las mismas de antes), pierna
  nueva `tools/e2e-piernas/rueda.mjs` OK: A mantiene G, apunta, suelta → baila; B (a 6 m) lo ve bailar; `bailar.vrma`
  se baja una vez por pestaña y solo entonces; A anda → termina en las dos; teclado, favoritos y Esc bien.
  Clips nuevos: 29 ficheros, 3,0 MB en el repositorio, 44–243 kB cada uno.
- Consumo: sin medir · Opus 5.5.
- Commit: rama `avatares/rueda-movimientos` (sobre 4eb6387).
- Siguiente: probar con un móvil y un mando reales; que los agentes (`packages/agent`) usen la lista entera; que quien
  llega tarde vea un movimiento en curso (estado con `at`, J9); grabar los que UAL1 no trae (aplaudir, señalar…).

## 2026-10-18 19:10 · sonido S3 · hecho
- Qué: el pool de voces espacializadas (`packages/render/src/audio/voces.ts`, sobre el núcleo de S1). Cada disparo
  construye su cadena `AudioBufferSourceNode → GainNode → BiquadFilter(lowpass) → PannerNode → bus`; el lowpass nace
  transparente (22.050 Hz) porque el aire y la oclusión de S11 son exactamente ese filtro. Nada de
  `THREE.PositionalAudio`: fuerza `panningModel "HRTF"` y su oyente, hijo de la cámara estéreo, tartamudea en VR
  (three.js #20920); de three.js copiamos solo el patrón de sacar la transformación y el `buffer.slice(0)` antes de
  `decodeAudioData` (que detacha el ArrayBuffer). Defectos del emisor de Hyperfy v2 (`inverse`, ref 1 m, max 40 m,
  rolloff 3, cono omni en radianes → grados), con `refDistance > 0` validado: con 0 el modelo `inverse` deja la voz
  muda para siempre (trampa del spec). Tope de voces por aparato de `limits.json` (`audio_sources` A32/B16/C8/D4) con
  virtualización NUESTRA (Web Audio no virtualiza): al llegar al tope no se mata, se para guardando el desplazamiento
  y se reanuda por donde iba; prioridad efectiva `prioridad − 10·(d/maxDistance)` (Priority Distance Factor de Wwise),
  histéresis de 1 para que dos voces iguales no se releven sin parar, y música y ambiente nunca se roban. HRTF
  racionado con `audio_hrtf_max` (A24/B16/C12/D6, nuevo y `estimated`): solo las N más cercanas, conmutando con rampa
  de 8 ms para que no haga clic. Variantes con pesos y variación de tono/volumen a partir de la SEMILLA DEL SERVIDOR
  (xorshift32 + FNV-1a del id): todos los clientes oyen la misma variante. Cooldown por id (50 ms de defecto) para que
  veinte disparos juntos no revienten la mezcla. Caché de `AudioBuffer` por URI con tope de 8 MB; las camas largas no
  se descodifican, van por `MediaElementAudioSourceNode`. `parar`/`pararTodo`/`mover` desconectan los nodos a mano
  (Web Audio no tiene `dispose()`). El oyente queda escrito (nueve `AudioParam` donde existan, `setPosition`/
  `setOrientation` en la API vieja) pero SIN enganchar a cámara ni XR: eso es S5.
- Números: `test/audio-voces.test.ts` nuevo, 14 pruebas en verde. Peso: 482.518 B gz antes de dibujar, los MISMOS que
  antes del cambio (+0 B: nadie importa `voces.ts` todavía, el empaquetador lo deja fuera). Tres puertas en rojo
  (pruebas, tick p99, tamaño) que ya están en rojo igual en `origin/main` (ahí 480,9 kB gz > 480 de tope y p99 69 ms):
  no las toco.
- Consumo: sin medir · Opus 5.
- Commit: rama `sonido/voces`, PR contra `sonido/nucleo` (no contra `main`).
- Siguiente: S4 (migrar `medios.ts` al núcleo) y S5 (enganchar el oyente a la cámara y a la pose del visor).
## 2026-10-16 21:09 · R1 trozo «imprimir los QR como SVG» · hecho (historia en sombra, Doulos; nada sube a origin)
- Qué: solo el trozo de «Falta de R1» pedido: `npm run enlaces -- qr [base] [carpeta]` ahora escribe un
  `<carpeta>/<id>.svg` por punto de `enlaces.json` (carpeta por defecto `qr/`, añadida a `.gitignore`) y sigue
  imprimiendo id, nombre y ruta; sin ese argumento se comporta igual que antes (id, nombre, URL firmada). El
  resto de «Falta de R1» (escuchar en la red de casa, comprobar la columna en un navegador real, medir con un
  móvil real) queda sin tocar, como pedía la tarea.
- Números: 252 pruebas (antes 249; 3 nuevas en `test/enlaces.test.ts`: modo normal, modo `qr` con SVGs válidos,
  y el aviso sin `MOTOR_SECRET` en ambos modos); puertas en verde (capas 0, determinismo igual, ancho de banda
  26,7 kbit/s, tick p99 7,6 ms con mil). e2e y `tools/auto.sh` no se han tocado ni corrido (no tocan a esta rama).
- Consumo: no aplica (prueba de Doulos en un worktree desechable, sin `hermes usage` en este perfil); modelo
  Sonnet 5.
- Commit: este (rama `doulos/sombra-r1-qr`, solo local; no sube a origin, no hay PR).
- Siguiente: el resto de «Falta de R1» (modo LAN del servidor, comprobación visual real de la columna, medición
  con móvil real) sigue pendiente para quien tome la fila R1.

## 2026-10-18 18:21 · lucha-l2-estados-jugador · hecho (trozo 1)
- Qué: L2, primera historia: vida del jugador en memoria del servidor (`features/lucha/server.ts`). Cada golpe
  que el jugador aterriza, la criatura golpea de vuelta con la misma tirada (`DANO_BASE..DANO_BASE+DANO_VAR-1`,
  PRNG con semilla: reproducible); `VIDA_JUGADOR_MAX` (50, por encima de lo que cuesta matar al Guardián de
  Crisálida en una pelea normal: no rompe el combate de L1) baja en memoria, sin estado compartido ni HUD (eso
  es la siguiente historia de L2, con el diseño de canon Desestabilizado→Colapsado→Aletargado de
  `docs/BACKLOG.md` fila L2). A 0, el jugador cae (`caido`): `golpear` se rechaza hasta que pasan
  `REAPARICION_JUGADOR_TICKS` (100 = 5 s a 20 Hz), y entonces vuelve entero. Eventos nuevos `jugadorHerido`,
  `jugadorCaido`, `jugadorVuelve` (solo al propio jugador); `client.ts` los escucha para que las pruebas los
  vean (sin dibujar nada aún, por diseño).
- Números: `test/lucha.test.ts` 10/10 (2 nuevas: herido→caído→reaparece, y mismo seguimiento con sha256 igual
  en dos mundos con la misma semilla). `npm test` con `node_modules` enlazado del clon base: 773/774 (el único
  rojo, `misiones-secuencia.test.ts` p99 de un gate de carga, es el conocido por contención de CPU — solo,
  8/8 verde; sin ese enlace, los 23 fallos preexistentes por falta del paquete `ws` en este worktree, iguales
  antes y después). `npm run build`: verde (842 ms).
- Consumo: sin medir · Sonnet 5.
- Commit: rama `ko/t_32744f07-v2` sobre `origin/tren/motor-2026-10-18-6`, PR #145.
- Siguiente: la siguiente historia de L2 (HUD, velocidad, vuelta a `aparicion`, estado compartido por
  invitado) cuando la pida el tablero; L3 (la criatura se mueve y persigue) sigue esperando a L2 entero.

## 2026-10-18 19:30 · constructor/anclar-explicar · hecho
- Qué: el botón «fijar» del constructor se renombra a «Anclar / soltar» (con icono) y lleva un tooltip claro
  (t_72b0bdab), porque Pablo (vídeo 18-10): «fijar no se entiende». Renombrado en `apps/plaza/constructor.ts`
  (botón con icono `push-pin` de Phosphor, `boton2` ahora acepta un icono opcional), tooltip explícito («Anclar:
  nadie lo mueve, gira ni borra hasta que lo sueltes (P)»), etiqueta del checkbox del inspector, texto de ayuda
  del constructor y los mensajes de estado del cliente (cogido/arrastrado) usan «anclado». Los mensajes de
  rechazo del servidor (`features/objetos/server.ts`) siguen diciendo «fijado»: varias pruebas
  (`test/objetos.test.ts`, `test/huecos.test.ts`) comprueban ese texto exacto; cambiarlo junto con las pruebas
  se deja para otra tarjeta si se quiere, por no ensanchar esta historia de 20 min. El campo de datos y el
  verbo de red siguen llamándose `fijado`/`fijar` (wire/schema sin tocar, D-055 no aplica aquí: es puro texto
  de interfaz). `docs/JUGADOR.md` actualizado con el mismo texto.
- Números: `npm test` y `npm run build` en verde (ver comprobado en el PR).
- Consumo: sin medir · Sonnet 5.
- Commit: rama `constructor/anclar-explicar` sobre `origin/tren/motor-2026-10-18-6`.
- Siguiente: nada pendiente de esta tarjeta; si se quiere, extender el mismo nombre a `rueda.ts` («Fijar en
  favoritos», uso distinto, no tocado aquí).

## 2026-10-19 06:48 · pelea/combate-a-main · hecho
- Qué: HUD de combate con Estado, Carga y las 3 habilidades (teclas 1-3), y PVP por mundo (apagado por defecto).
  Lleva a main lo que solo vivía en las ramas `noche/combate-h*` y `noche/pvp-*`, conciliado con la vida y la caída
  (#145) y el HUD de personaje (#160): kit Eclipse Mnémico, escalera de Estado, Aletargado reaparece en el último sitio
  seguro, críticos 20 % x2, bandera `pvp`/`zonasPvp` en `entorno.json` e icono de Estado sobre quien recibe el golpe.
  Versión 0.16.0 (menor: algo nuevo que no rompe nada).
- Números: `node tools/gates.mjs`: 941 bien, 4 mal (enlaces ×3 por `qrcode-svg` ausente en el `node_modules` enlazado,
  los mismos en main; subidas ×1, intermitente); capas, determinismo, ancho de banda y plaza de 1.000 en verde; página
  512,3 kB gz antes de dibujar (main 510,0 kB; +2,2 kB; tope 1.000 kB).
- Consumo: sin medir · Sonnet 5.
- Commit: rama `pelea/combate-a-main` sobre `origin/main` cb35ef4, sin push.
- Siguiente: decidir si `habilidad` hace que la criatura devuelva el golpe (`golpear` sí); activar `pvp` en un mundo real.

## 2026-10-19 07:25 · constructor/ficha-pestañas · hecho
- Qué: la ficha del objeto gana las pestañas Ficha, Lógica y Ajustes (C4).
  Detalle: la ficha del objeto (C3) gana pestañas accesibles (`role=tablist/tab/tabpanel`, flechas izquierda y derecha,
  Inicio/Fin, `aria-selected`, tooltip con icono Phosphor de la casa en cada una): «Ficha» (los datos de siempre),
  «Lógica» (disparadores del cable que muestran u ocultan el objeto por id o nombre, disparadores que nacen en él,
  y cerraduras y contadores en el mismo punto; botón «Abrir el cable» que lleva al panel del cable) y «Ajustes»
  (nombre, se ve al jugar, anclado y sólido, con los mismos verbos del inspector; botón «Abrir inspector (N)»).
  Solo sale con permiso de construir y el constructor abierto (sin cambios); Esc la cierra como antes, también
  desde el campo de nombre. Sin camino de red nuevo: lee el estado de `disparadores`, `cerradura` y `contadores`
  y llama a `nombrar`/`ajustar`/`fijar`; el servidor valida. Lógica pura en `apps/plaza/ficha-objeto.ts`
  (`logicaDeObjeto`, `pestanaConTecla`); la solidez del inspector pasa a una función compartida.
- Números: `test/ficha-objeto.test.ts` 6/6 (2 nuevas). `npm test` 917/920 (los 3 rojos son los conocidos de
  `enlaces`, falta `qrcode-svg`). Pierna e2e del constructor (chromium) en verde con 8 pasos nuevos (pestañas,
  clic, flechas, «Abrir el cable», ajustes que cambian el objeto en el servidor y B lo ve, «Abrir inspector»).
  Página antes de dibujar: 510,0 → 511,9 kB gz (+1,9 kB; tope 1000). Captura real en
  `work/numinia-engine-wt-creativo2-captura-c4.png`. Sin subir la versión (la sube quien fusiona).
- Consumo: sin medir · Sonnet 5.
- Commit: rama `creativo/c4-c5` sobre `origin/main` cb35ef4 (sin push).
- Siguiente: C5 (móvil/VR: los mismos iconos grandes, sin tooltips de ratón).

## 2026-10-19 08:47 · constructor/ficha-movil-vr · hecho
- Qué: la ficha del objeto con iconos grandes en móvil (hoja inferior) y en VR (panel con el rayo) (C5).
  Detalle: la ficha del objeto (C3/C4) sin ratón. **Móvil** (pantallas táctiles, `pointer: coarse`): la ficha pasa a hoja
  inferior a ancho completo (máx. 46 vh, opaca, el panel del constructor se aparta mientras hay objeto elegido: una
  sola hoja a la vez); rejilla de 5 columnas con objetivos de 63×48 px; etiqueta corta visible bajo cada icono
  («Mover», «Girar», «Escalar», «Copiar», «Anclar/Soltar», «Enlace», «Borrar», «Cerrar»; el `aria-label` no cambia);
  pestañas a ancho completo de 44 px; pulsación larga (450 ms) sobre un icono dice su título completo en una línea
  bajo la barra (`role=status`) y no lo pulsa; esa línea guarda su sitio para que los iconos no salten bajo el dedo.
  El «#barra-objeto» de M22b-1 ya no existe en esta base (la ficha lo sustituyó en C3): no se duplica nada.
  **VR**: panel plano (`packages/render/src/vr-ficha.ts`, trozo aparte que solo se descarga al elegir un objeto
  dentro de una sesión VR) con 8 botones grandes (Mover, Girar 15°, Escalar +/−, Duplicar, Anclar/Soltar, Borrar
  con doble pulsación, Cerrar), colocado abajo y a la izquierda para que el rayo hacia el objeto (de frente) y la
  mano derecha no lo atraviesen; mismas reglas: solo con permiso de construir, y el servidor decide.
- Números: `test/ficha-objeto.test.ts` 10/10 (4 nuevas: etiquetas, celdas VR, `celdaEn`, `aplicarAccionVR`).
  `npm test` 921/924 (3 rojos conocidos de `enlaces`, falta `qrcode-svg`). Pierna táctil a 360×740 en verde con 7
  pasos nuevos (hoja ≤ 46 vh, 5 columnas ≥ 44 px, etiquetas, pestañas, no tapa el bloque, pulsación larga sin
  borrar, toque corto sigue pulsando). Pierna VR (IWER) con 4 pasos nuevos (ficha visible, «Escalar +» ×1,25 y B lo
  ve, sigue elegido, «Cerrar»). Las dos piernas cierran ahora la tarjeta de novedades del navegador limpio y buscan
  el chrome por glob. Aviso: el paso «moverlo ≥ 1 m» de la pierna VR falla a ratos con la máquina cargada, también
  sin estos cambios (1 de 3 en la base). Página antes de dibujar: 511,9 → 513,6 kB gz (+1,7 kB; tope 1000); el
  trozo VR pesa 1,4 kB gz y no entra en el arranque. Captura real 360×740 en
  `work/numinia-engine-wt-creativo2-captura-c5-movil.png`.
- Consumo: sin medir · Sonnet 5.
- Commit: rama `creativo/c4-c5` (sin push).
- Siguiente: si el objeto queda bajo la hoja (objetos muy cercanos a los pies), la cámara no se mueve sola.

## 2026-10-19 12:24 · fusion/sonido-vr · hecho
- Qué: el mundo suena (pasos, golpes, avisos y el colchón del mundo), y en VR los dardos se lanzan con la mano.
  Detalle: el sonido (S6–S6f) y los dardos y la pesca en VR, juntos. En VR el dardo se lanza con la mano (el
  balanceo da dirección y fuerza; el servidor decide dónde cae) y la caña es una malla con mango, halo al acercar la mano
  y una instrucción por fase encima. Mordisqueo y picada suenan por la puerta única (`pesca-mordisqueo` nuevo, con su
  fila de receta). Al probar el sonido en un Chromium de verdad salieron tres fallos que en Node no se veían: la página
  de dev no podía leer `/sonidos.json` desde otro puerto (CORS), los ficheros `/a/` se pedían al puerto de la página y
  no al del servidor, y Caddy no pasaba `/sonidos.json` ni `/status` (que lleva el colchón del mundo) al servidor.
- Números: `npm test` 1.083/1.083; puertas en verde. Pierna nueva `tools/e2e-piernas/sonido.mjs` (sin AudioContext de
  mentira): con la rama, tabla 200 del servidor, 13 ficheros 200 y 13 descodificados, 0 fallos, contexto `running`; en
  `sonido/nucleo` sin el arreglo, la tabla no llega y suenan 0 ficheros. Piernas `pesca`, `dardos-vr` y `sonido` en
  verde; `pesca-todas` falla los mismos pasos (caña en la mano, medidor, rayo) en la base que en la rama.
- Consumo: sin medir · Opus 5.5.
- Commit: rama `fusion/sonido-vr` sobre `sonido/nucleo` (#151) + `vr2/pesca-mango`. Versión 0.17.0 → 0.18.0.
- Siguiente: S6f-5, oírlo con auriculares en el PC y en las gafas.

## 2026-10-19 13:35 · identidad/i1-adoptar-progreso · hecho
- Qué: al llegar el primer pase de numinia.com de alguien que estaba como invitado, el servidor adopta su progreso
  (`ServerRuntime.adoptar(invitado, sub)`, llamado desde `Instance.identificar` justo tras `credencial`). Regla
  genérica para cualquier almacén (`adoptarClaves`: toda clave `…:<invitado>` o `…:<invitado>~n` pasa a `sub`; si ya
  existía, `fusionar`: listas unión, números el mayor, objetos clave a clave). Tres piezas con `onAdoptar` propio:
  bienes (el dueño va dentro del valor y en el índice por páginas), inventario (renumera los objetos del invitado tras
  la serie de `sub`; la caché sigue) y misiones (regla genérica + caché). Idempotente: tras adoptar no queda nada bajo
  el invitado. Solo servidor, sin cliente ni UI.
- Números: 958 tests en verde (4 nuevos en `test/identidad-adoptar.test.ts`); build ok; +78 líneas de código.
- Consumo: sin medir · Sonnet 5 (subagente).
- Commit: rama `identidad/i1-adoptar-progreso`, versión 0.17.0 → 0.18.0 (menor: algo nuevo que no rompe nada).
- Siguiente: I2 (renovar el pase de personas con `vidaIA`); el recibo firmado de un bien sigue nombrando al invitado,
  así que `traer` a otro mundo con ese recibo aún lo ve «de otro invitado» (I4 o una historia aparte).

## 2026-10-19 13:52 · sonido/nucleo · hecho
- Qué: el sonido afinado con auriculares: todo lo provisional bajito, pasos por pie, el colchón de fondo y la voz de los PNJ.
  Detalle: suena el mundo, no la interfaz (fuera el clic de los botones y los pasos de misión); −10 dB a todo lo
  provisional en un solo mando; un paso por pie a ritmo de persona, cada pie distinto y sin repetir grabación; el
  colchón arranca en el primer clic aunque Firefox frene el autoplay; coger y soltar cosas suena; los PNJ saludan y se
  despiden con una voz corta CC0 desde su boca.
- Números: pruebas unitarias en verde salvo `subidas.test.ts`, intermitente y también en rojo sin estos cambios.
- Consumo: sin medir · Opus 5.5.
- Commit: rama `sonido/nucleo` (#168, reabierto), traída `origin/main`; versión 0.18.0 → 0.19.0.
- Siguiente: que los pasos caigan cuando el pie de la animación toca el suelo.

## 2026-10-19 17:38 · naturaleza/ola-1 · hecho
- Qué: los mundos que lo pidan tienen naturaleza: relieve, árboles con pieza de máquina, hierba, estanque, cielo y fauna.
  Detalle: entra todo lo de naturaleza que vivía fuera de `main` (R6/R7, banco gráfico v1, capa de materia D-058) y los
  experimentos medidos E02 (terreno en trozos, apagado), E03 (agua de orilla a/b, elegible), E04 (cielo analítico,
  apagado), E24 (bisel del engranaje, encendido), E05 (solo banco), E50 (árboles con máquina y copas de seta/sombrilla,
  encendido) y E51 (agua «oceano», elegible). Solo se enciende en un mundo con `naturaleza.json` activo; el código de la
  naturaleza llega en un trozo aparte solo cuando el mundo lo pide. Arreglo de la fusión: el tono Verdemar de las orillas
  (R1) queda en el estanque de la naturaleza; el agua del constructor vuelve a ser la de `main`.
- Números: 1311 pruebas, 1309–1310 en verde (las que fallan son de tiempo de reloj y pasan solas: `misiones` p99,
  `naturaleza-sonido` tick máximo, `subidas`); en `main` 1096/1096. Paquete inicial 528,1 → 532,3 kB gz (+4,2).
  Puertas: capas, determinismo, ancho de banda, plaza de 1.000 y tamaño en verde. e2e suave (carga, cámara,
  constructor) falla en los mismos pasos que `main` con la máquina cargada; mismo coste de cuadro (85 llamadas, 27 522
  triángulos). Naturaleza en la RTX 4080 (WebGPU): A 0,200 ms, D 0,162 ms de GPU por cuadro.
- Consumo: sin medir · Opus 5.5 (subagente).
- Commit: rama `naturaleza/ola-1` (origin/main 9c28379 + exp/e01-base 438e061 + e02 73e415f + e03 3a341c7 + e04 b2a4e10
  + e24 f28b5fd + e05 1eaa128 + e50 63bad7e + e51 1906d45). Versión 0.19.0 → 0.20.0.
- Siguiente: que Pablo elija agua (a/b/oceano) y cielo con las fotos; medir en la Quest por USB.

## 2026-10-19 19:41 · naturaleza/interruptor · hecho
- Qué: quien puede construir enciende o apaga la naturaleza desde dentro del mundo, con el interruptor «Naturaleza».
  Está arriba de la sección Entorno de Construir (C). El servidor comprueba el permiso de construir, escribe solo `activa` en el
  `naturaleza.json` del mundo (lo crea si falta; nunca pisa uno roto) y todas las páginas la montan o la quitan sin reiniciar.
- Números: `test/naturaleza-interruptor.test.ts` nuevo (6 pruebas); `node --test test/naturaleza*.test.ts` 195/195; entorno,
  feature, capas, disparadores, conMundo y accesibilidad 118/118. En la página (Chromium sin GPU, mundo vacío, 5990/8990):
  84 llamadas / 24 642 triángulos antes, igual que `main` cb0de4e con el mismo arnés; encendida 66 / 42 204 y el fichero
  queda `{ schema, activa: true }`; apagada vuelve a 84 / 24 642 exactos.
- Consumo: sin medir · Opus 5.5 (subagente).
- Commit: rama `naturaleza/interruptor` (desde origin/main cb0de4e). Versión 0.21.1 → 0.22.0.
- Siguiente: probarlo con Pablo en un mundo real con pase de numinia.com y dos páginas a la vez.

## 2026-10-19 23:11 · rediseño v2 de la interfaz · hecho
- Qué: interfaz nueva: 7 botones arriba, tu avatar en «Tú», amigos en Gente, construir sin paneles y un reloj en VR.
  Detalle: la barra pasa de 11 a 7 (Cámara y Menú agrupan lo demás), Gente tiene la ficha de cada persona y la tarjeta al
  pulsar a alguien, construir es una fila de iconos con un solo cajón, y en VR girar la muñeca saca el reloj con el menú.
- Números: `npm test` 1349/1349 (A–D) y 1336/1336 (E) antes de juntarlas; gates en verde (página 548 kB). Piernas e2e:
  constructor, gente 14/14, ajustes, mapa, menu-vr 12/12 en verde; teletransporte 8/9 y foto 5/8 por umbrales de velocidad
  en un PC cargado (main falla los mismos pasos en esta máquina). VR sin probar en una Quest real.
- Consumo: sin medir · Opus 5.5 (orquestador y subagentes).
- Commit: rama `ux2/integracion` (desde origin/main 8fdb0ba6, historias `ux2/barra`, `ux2/tu`, `ux2/gente`, `ux2/dock`,
  `ux2/vr`). Versión 0.22.2 → 0.23.0.
- Siguiente: probar el reloj en la Quest; la lista de amigos en el servidor espera la decisión de identidad.

## 2026-10-20 10:30 · dependabot-grupos · hecho
- Qué: nuevo `.github/dependabot.yml` (el motor no tenía): un solo PR de Dependabot por ecosistema (npm,
  github-actions, docker; grupo `all-dependencies`), semanal y con espera de 7 días. Solo configuración; versión
  0.23.0 → 0.23.1 (parche, nada cambia para quien usa el motor).
- Números: sin código tocado; el YAML se lee bien; `test/version.test.ts` pide solo versión válida y lock igual.
- Consumo: sin medir · Sonnet 5.
- Commit: rama `ci/dependabot-one-pr-per-ecosystem`, PR contra `main` (lo revisa y fusiona una persona).
- Siguiente: que Pablo decida si el motor quiere Dependabot (hoy no lo tenía) y si los PR se fusionan solos o a mano.

## 2026-10-20 15:10 · condiciones (tren de la noche) · hecho
- Qué: condiciones de entrada en los mundos: una burbuja que pide aceptar las normas de la casa y de la comunidad antes de entrar, en PC, móvil y VR.
  Los permisos de datos salen siempre sin marcar y nunca cierran la puerta. La puerta viene APAGADA en todos los mundos: se enciende con
  `"puerta": true` en `aventura/condiciones.json` o con `MOTOR_CONDICIONES_PUERTA=si`. Versión 0.23.2 → 0.24.0.
- Números: PRs #181–#187 al tren (servidor, burbuja PC/móvil, pompa vista desde fuera, normas que llegan solas de numinia.com,
  versión nueva con solo lo cambiado, pase que dice lo ya aceptado, burbuja en VR). Mensajes de red 13/14/15 aditivos;
  `WIRE_FORMAT` sigue en 2. Campos nuevos de `condiciones@1`: `tipo`, `puerta`, `nombre`, `comunidad.fuente`, `versionWeb`.
  Env nuevas: `MOTOR_CONDICIONES_PUERTA`, `MOTOR_CONDICIONES_FUENTE`, `MOTOR_CONDICIONES_FUENTE_MIN`.
- Consumo: sin medir · Sonnet 5 (historias) y Opus 5 (jefe del tren).
- Commit: rama `condiciones/version-0-24`, PR contra `tren/motor-2026-10-20`.
- Siguiente: que Pablo pruebe la burbuja en la Quest (paso a paso en el PR #187) y decida cuándo se enciende la puerta en cada mundo; texto legal de los abogados.
## 2026-10-20 13:40 · cable sin JSON, historia A · hecho
- Qué: quien construye crea y borra cables en vivo, sin tocar JSON. En el panel Cable hay «+ Nuevo cable» (un botón en tu sitio, con un receptor de partida) y un «Borrar» por cable que pide confirmación. Detrás, dos intenciones nuevas de `disparadores`: `crearDisparador` y `borrarDisparador`, solo con permiso de construir.
  El servidor valida con el mismo lector que lee `disparadores.json` (64 por mundo, 8 receptores, id `[a-z0-9-]{1,16}` único) y reescribe el fichero sin reiniciar. La página solo manda la petición.
- Números: `test/disparadores.test.ts` 20/20 (6 pruebas nuevas: crear, sin permiso, id repetido o malo, el 65.º, más de 8 receptores, borrar, id desconocido, fichero que se relee igual); `npm test` 1377/1377; gates en verde (página 560,5 kB gz); build en verde. La huella de simulación no cambia (la prueba de siempre, intacta). Tick: sin código nuevo en el tick (crear y borrar solo tocan una tabla al llegar la intención), sin medida nueva. Pierna `tools/e2e-piernas/cable.mjs` ampliada (crear y borrar con dos personas): ok.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `cable/sin-json` (desde origin/main bd2ee141), sin subir.
- Siguiente: historias B (frase legible), C (huecos desplegables) y D («Decirlo» con IA); y decidir si sube la versión.

## 2026-10-20 13:48 · cable sin JSON, historia B · hecho
- Qué: el panel Cable cuenta cada cable como una frase («Cuando alguien pulse “Botón rojo”, muestra “Farola”. Espera 5 s.») y el JSON queda dentro de un desplegable «Ver datos» (con su área de texto y «Guardar»; los botones «Probar», «Borrar» y «+ Nuevo cable» siguen). La frase la hace `fraseDeCable(disparador, idioma)` en `features/disparadores/cable-frase.ts`: función pura, sin DOM ni reloj, que no tira nunca; cubre los 3 «cuando» (boton, zona, senal), las **8** acciones del motor (muestra, oculta, mueve, teletransporta, da_paso, abre_enlace, suena, vuelve_a_seguro), varios receptores, cooldown y un solo uso. Ninguna palabra sale del código: los textos están en `cable-frases.es.ts` y `cable-frases.en.ts` (mismas claves; reglas de unir 2 o más receptores incluidas). La historia D la importará desde el servidor. R-1: pieza reutilizable, sin nada propio de la plaza; la página solo pinta.
- **Pendiente: los idiomas ja, ko y pt-br.** No existe ningún fichero para ellos; hoy caen en español. Añadir uno = copiar `cable-frases.es.ts`, traducir y registrarlo (docs/EXTENDER.md «El cable»); el test de claves lo comprueba.
- Números: `test/cable-frases.test.ts` 10/10 (cada «cuando» × cada acción × es/en, varios receptores, cooldown, un solo uso, comillas, desconocidos, paridad de claves y de parámetros, pureza, la frase exacta del ejemplo); `npm test` 1387 pruebas, 1386 bien y 1 de tiempo de la hierba (`naturaleza-hierba`) que falló por carga y pasa sola; gates en verde (página 561,8 kB gz; huella de simulación intacta, sin código nuevo en el tick); build en verde. Pierna `tools/e2e-piernas/cable.mjs` ampliada (frase y «Ver datos» cerrado): ok. Captura: `work/motor-cable/capturas/B-panel-cable.png` (y `-abierto`).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `cable/sin-json`, sin subir.
- Siguiente: historia C (huecos desplegables en la misma frase) y D («Decirlo» con IA, que enseña la frase para confirmar).

## 2026-10-20 14:20 · cable sin JSON, historia C · hecho
- Qué: la frase del cable es el editor: cada hueco es un desplegable con solo lo válido (tipo, acción, objeto/movedor/misión/sonido del mundo, espera) y texto solo para nombre, señal, enlace https y coordenadas. «Guardar cambios» manda una petición nueva, `editarDisparador` (mismo permiso y ritmo que `editarReceptores`; el servidor revalida con el lector del fichero, conserva id y usos, reescribe `disparadores.json`) y el error en español sale junto al control. «+ Nuevo cable» abre los mismos huecos y no crea nada hasta «Crear cable». Piezas puras: `cable-huecos.ts` y `cable-contexto.ts`; textos en `cable-frases.es/en.ts` (paridad vigilada). Accesible: `aria-label` en cada control, frase entera como grupo, blancos de 44 px, 360 px sin desbordar. «Ver datos» intacto.
- Tests: `test/cable-huecos.test.ts` (nuevo), 5 pruebas nuevas en `test/disparadores.test.ts`; e2e `tools/e2e-piernas/cable.mjs` maneja los desplegables reales (cambia objeto, espera y un solo uso, guarda, lo ve otra página; rechazo de enlace sin https). Simulación y huella sin tocar: nada en el tick.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `cable/sin-json`, sin subir.
- Siguiente: historia D («Decirlo» con IA) reutilizando `editarDisparador`.

## 2026-10-20 14:45 · cable sin JSON, historia D · hecho
- Qué: «Decírselo al mundo» en el panel Cable. Quien construye escribe una frase («que al entrar en el círculo suene la campana», ≤300 caracteres); el **servidor** (nunca la página) se la da a la IA del mundo con una herramienta cerrada (3 tipos, 8 acciones, solo los objetos/movedores/misiones/sonidos que ese mundo tiene), valida la respuesta con el mismo lector que `disparadores.json` y los nombres reales, y devuelve una **propuesta** con su frase (`fraseDeCable`, en el idioma de quien pregunta). Nada cambia hasta **Aplicar** (`confirmarCable`: misma persona, 2 min, vuelve a validar, reescribe el fichero). Sin IA, sin cupo o con la IA caída el cuadro se oculta y se ve el motivo (`puedeDecir`).
- La clave: la misma del cerebro de los habitantes (`CEREBRO_CLAVE`/`ANTHROPIC_API_KEY`, `cerebroClaude`), leída solo en `packages/server/src/cable-ia.ts`; ningún mensaje, estado, registro ni error la lleva (test). Topes: 3/min por persona, `CABLE_DIA_MAX` (100) por día y mundo. Cambios de apoyo: `forzar` (tool_choice) en `cerebro.ts`; `api.estadoDe(feature)` (lectura) en `packages/feature`.
- **Ojo (para Pablo):** `instalar-motor.sh --clave-ia` guarda la clave en `cerebro.env`, que solo carga el servicio de los habitantes (su cortafuegos solo sale a Anthropic). El servidor no la carga: en una instalación así «Decirlo» queda apagado (con su motivo) hasta que se decida darle la clave al servidor. No lo he tocado: es dinero y cambia lo que la casa exige.
- Tests: `test/cable-decir.test.ts` (18: propuesta buena, objeto/movedor/misión/sonido inexistente, salida inválida, sin permiso, sin IA, topes, texto largo, caída del modelo, confirmar, otra persona, caducada, mundo cambiado, inyección en el turno de usuario, clave nunca visible, adaptador con fetch falso, huella igual); `npm test` 1418/1418 (naturaleza-hierba, de tiempo, falló una vez bajo carga y pasa sola); gates en verde; build ok. e2e `tools/e2e-piernas/cable-decir.mjs` (cerebro eco `CEREBRO_ECO=1`, navegador real, 1000 px y 360x640, un mundo con IA y otro sin).
- **No verificado:** ninguna llamada a Claude de verdad (ni con clave, ni de red). Todo con el cerebro eco y un `fetch` falso.
- Idiomas: es y en (claves `decir.*`, paridad en verde). **`ja`, `ko` y `pt-br` siguen pendientes** (caen en español).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `cable/sin-json`, sin subir.
- Siguiente: decidir cómo recibe la clave el servidor instalado; probar con una clave real (con permiso); ja/ko/pt-br.

## 2026-10-20 21:48 · dardos+pesca · hecho
- Qué: dos ramas en una PR, 0.26.0. Dardos: duelo y equipos de 2-4 entre PC, móvil, AR y VR (feature v5: `lanzar.via`,
  `jugar desde:"lejos"`), barra de fuerza nueva en PC con la ventana que decide el servidor por dispositivo
  (`ZONA_FUERZA`; `TEMBLOR` 0,15 → 0,08, zona muerta: cambia las puntuaciones de todos), chip «Dardos: jugar en
  <diana>» para unirse a una diana `remoto` desde lejos, botón AR que se repinta al salir. Pesca v3: el medidor de
  tensión va en la boya a ras de agua (PC, móvil, VR); cada pez pescado entra al Inventario (inventario v2, objeto
  «captura» apilado por especie). Aditivo en el cable.
- Números: `npm test` 1622/1622; `npm run gates` en verde; tamaño antes de dibujar 588368 → 592670 B gz (+4302);
  e2e dardos-duelo, dardos, pesca y dardos-vr en verde (ver la PR). Sin probar en Quest ni móvil reales.
- Consumo: sin medir · Sonnet 5.
- Commit: rama `juegos/dardos-pesca` (ar/duelo-servidor + pesca/barra-boya + origin/main 54a4cf89), PR contra `main`.
- Siguiente: probar el duelo con gafas y móvil reales; decidir si `TEMBLOR`/`ZONA_FUERZA` se quedan como están.

## 2026-10-21 17:00 · lienzo (mundo en blanco para el onboarding) · hecho
- Qué: dos piezas del motor para que un mundo pueda estar de verdad en blanco y el primer cable de un recién llegado no se pierda. (1) `entorno/ancestros.json` (`{ hologramas: [], muros: [] }`): sin fichero, el Salón de los Ancestros de la casa en (0, −48) con Asimov, como siempre; con las listas vacías, ningún salón ni holograma; una lista que falta deja esa mitad como la de la casa (misma forma que `pesca.json`/`dardos.json`, R-1). Era la única pieza de la casa que un mundo no podía apagar (muros sólidos a 48 m del centro). (2) Un mundo con carpeta pero SIN `disparadores.json` ya recibe el escritor del cable: «+ Nuevo cable» (`crearDisparador`) escribe el fichero por primera vez (con `nuevo`: nunca pisa uno escrito a mano que apareciera entre medias; los siguientes cambios lo reescriben) y un reinicio lo relee. Antes el cable se aceptaba en memoria y se perdía al reiniciar. Sin fichero la pieza arranca vacía, igual que la de la casa. La plantilla «lienzo» (`work/plantillas/lienzo`: suelo plano, día, sin nada, @todos construye, zip 5,9 kB) vive fuera del repo, con su pierna e2e (16 pasos escritorio + móvil) y la del cable (11 pasos: A–D sobre el mundo en blanco).
- Números: `test/ancestros.test.ts` +1, `test/disparadores.test.ts` +2 (27/27); `npm test` 1625/1625; gates en verde (huella f455ffc1 intacta, p99 6,8 ms, página 592,6 kB gz); build en verde. Nada nuevo en el tick: las dos piezas solo deciden qué parte se monta al arrancar.
- Consumo: sin medir · Fable 5.1 (Ursa, en el escritorio).
- Commit: rama `onboarding/lienzo` (desde origin/main 1b04bd1d), sin subir.
- Siguiente: el «Taller» (guía, 11 misiones, flecha a los botones) sobre el lienzo; una farola de pie CC0 para la biblioteca (hoy hay «Farolillo»); idiomas ja, ko y pt-br de las frases del cable (siguen pendientes).

## 2026-10-21 18:30 · funciones f1 · hecho
- Qué: historia f1 de los interruptores de funciones (0.28.0, solo servidor + protocolo; la vista va en f3/v3). Pieza nueva
  `features/funciones`: quien puede construir enciende y apaga en caliente `normas` (la puerta de condiciones de entrada),
  `dardos` y `pesca` con el verbo `poner`; se guarda en `entorno/funciones.json` (`funciones@1`, mismo escritor atómico que el
  espacio base) y sobrevive al reinicio. Apagar las normas deja entrar a quien las leía; encenderlas solo pide a quien llegue después.
  Prioridad de la puerta: opción de `startServer` / `MOTOR_CONDICIONES_PUERTA` > `funciones.json` > `"puerta"` de `condiciones.json`.
  Estado `normas|dardos|pesca` = `{ activa, fija }` para las páginas (`__numinia.funciones`). `dardos` y `pesca` solo se guardan y
  se publican: esconderlos es f2. Sin `funciones.json`, todo como hoy (huella `7e630965`).
- Números: `test/funciones-interruptores.test.ts` (8 pruebas); ver la PR para `npm test`, gates y tamaño.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `funciones/f1-interruptores-servidor`, sin subir.
- Siguiente: f2 (esconder dianas y estanque con el interruptor), f3/v3 (panel con los interruptores).
## 2026-10-21 18:40 · ia-visible (las IAs se ven) · hecho
- Qué: Las IAs se ven: robot, cartel verde con IA, aro en el suelo, sección IAs en Gente y su ficha con «Ir hacia ella». Cualquier IA que entre a un mundo lo muestra, sin encender nada (R-1): cuerpo de robot de la casa, cartel de nombre siempre visible y verde con la marca «IA» (luna si duerme), aro verde bajo ella, rombo en el mapa (hueco si duerme) cuyo clic abre su ficha, sección «IAs» en Gente (`N personas · M IAs`) y ficha con quién responde por ella, Activa/Dormida, si construye y «Ir hacia ella» (viaje, o baliza donde los viajes están apagados). El pase acepta un bloque `ia` opcional y estricto; sin él, ficha mínima. Versión 0.29.0 (menor: algo nuevo que no rompe nada).
- Números: ver el cuerpo de la PR (`npm test`, gates, build, `layers`, `tamano`). Sin probar en Quest/VR reales, ni el paso en vivo de dormida a activa.
- Idiomas: los textos nuevos de Gente y de la ficha (`gente-ia-es.ts`) están en español. **`en`, `ja`, `ko` y `pt-br` pendientes** (caen en español).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/ia-visible` (S1–S7 + clic del mapa + origin/main a4e967ec), PR contra `main`.
- Siguiente: ja/ko/pt-br; que numinia.com mande el bloque `ia` cuando este motor esté publicado en toda la flota.
## 2026-10-21 · funciones f2 · hecho
- Qué: historia f2 (0.30.0): dardos y pesca obedecen su interruptor. Servidor (manda él): apagada, la pieza rechaza toda acción y cierra lo
  que corría —tirada suelta termina, duelo cancelado para todos sin ganador, pescador suelto con `escape.motivo "apagada"` (pesca v4: un
  valor nuevo al final del enum), sitio libre—. Página (PC, móvil, AR, VR, por los controladores): sin diana, estanque, flotador, pez en mano
  ni «E: …»; el chunk de la pieza ni se carga; al encender reaparece sin recargar. `ClientApi.estadoDe(feature)` (solo lectura) y las
  funciones puras `encendida` / `verSi`. Encendidas (por defecto) = como hoy; sin cambio en la simulación (huella intacta).
- Números: `test/funciones-obedecen.test.ts` (4 pruebas); ver la PR para `npm test`, gates y build.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `funciones/f2-dardos-pesca-obedecen` (sobre f1), sin subir.
- Siguiente: f3 (e2e de navegador y panel con los interruptores).


## 2026-10-21 20:40 · sala de rol: báculo del Director, asientos y burbujas de voz · hecho
- Qué: 0.39.0. Tres piezas de «mesa de rol» que cualquier mundo enciende con un fichero o un interruptor de Entorno: el báculo del Director de juego (`entorno/baculos.json`; quien lo lleva dirige), sentarse con «E» (`entorno/asientos.json`) y la burbuja de voz de mesa (`entorno/burbujas.json`; el servidor solo reenvía la voz entre los de dentro). Tres interruptores en Entorno (báculo, asientos, burbujas) más el de dados (`dados.json` con `activa`). La barra de acciones muestra solo lo posible ahora. **Un mundo sin `dados.json` tiene ahora los dados apagados.**
- Números: ver el cuerpo de la PR (`npm test`, gates, build, `tamano`). Sin probar con micrófono real, ni la pose de rodillas al sentarse, ni VR/móvil/Quest.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `sala-rol/baculo-asiento-voz` (cuatro commits de `voz/burbuja-de-mesa` sobre origin/main c387252b + versión), PR contra `main`.
- Siguiente: medir el coste del relé de voz con burbujas; ja/ko/pt-br.

## 2026-10-21 19:42 · ia-llamar S8 (la burbuja de acción de cada IA) · hecho
- Qué: toda IA conectada tiene una burbuja (esfera, cúpula, cilindro o caja; radio de 2 a 12 m; por defecto esfera de 4 m «al acercarte», o la del bloque `ia.burbuja` del pase). El servidor decide cada 10 ticks quién está dentro y avisa a la IA (`entraEnBurbuja`/`saleDeBurbuja`) y a la persona («Entras en la burbuja de Ada (IA).», una vez por entrada, con respiro de 10 s por IA). Publica la forma para que S9 la dibuje y ofrece `dentroDeBurbuja(ia)` a S10/S12. Sin IAs no hace nada (una comprobación por tick). Nombres de eventos en camelCase porque el motor no admite guiones bajos.
- Números: ver el cuerpo de la PR (`npm test`, gates, build). Sin dibujo todavía (S9) y sin llamada (S10).
- Idiomas: el aviso «Entras en la burbuja de…» está en español; **`en`, `ja`, `ko` y `pt-br` pendientes**.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/ia-llamar` (sobre `feat/ia-visible`), sin PR.
- Siguiente: S9 (dibujo), S10 (llamar), S13 («En tu burbuja» en `mirar`).
## 2026-10-21 19:55 · ia-llamar S10 (llamar a una IA) · hecho
- Qué: función `llamar` (servidor). Se llama a una IA por su nombre en el chat cercano, con `/nombre mensaje` (no se publica: solo quien lo escribe y la IA), con su frase clave o con la petición `llamar {ia, texto}` (botón y tecla E de S11). Respeta las casillas del bloque `ia.llamada` del pase (nueva señal solo-servidor `iaLlamada` en `roles`) y `solo_dentro` (burbuja de S8, o 20 m). Entre varias, la que te tiene dentro y luego la más cercana. Una llamada cada 10 s por persona y 30 por hora por IA, con aviso de pantalla; la IA recibe `llamada {ia, quien, nombre, texto, modo, t}` y un buzón (20 llamadas, 10 min) para el puente (S12). Sin IAs no hace nada.
- Números: ver el cuerpo de la PR (`npm test`, gates, build). `test/llamar.test.ts`: 29 pruebas.
- Idiomas: los avisos («Has llamado a Ada.», «Vas muy deprisa…») están en español; **`en`, `ja`, `ko` y `pt-br` pendientes**.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/ia-llamar` (sobre S8), sin PR.
- Siguiente: S11 (botón «Hablar con ella» y tecla E), S12 (el puente lee el buzón y deja de detectar el nombre por su cuenta).
## 2026-10-21 21:20 · ia-llamar S12 (el puente atiende llamadas) · hecho
- Qué: el puente (`packages/agent/src/mcp-mundo.ts`) guarda un buzón con los eventos `llamada` de la función `llamar` (últimas 20, 10 minutos; `buzon-llamadas.ts`) y las herramientas `llamadas` (las no leídas: quién, qué, cómo, hace cuántos segundos; cada una se da una vez) y `esperar_llamada` {segundos 1–25} (vuelve en cuanto llega una llamada o alguien entra en la burbuja, vacía al cumplirse el tiempo; no bloquea las demás herramientas). Con servidor que tiene `llamar`, deja de buscar su nombre en el chat: la llamada del servidor es la que deja hablar a una IA dormida; con servidor antiguo, todo como antes. «Atenta»: cada `llamadas` / `esperar_llamada` envía `ia.atenta` (como mucho una cada 5 s) y la ficha pública pone `atenta: true` 90 s desde el último aviso (`features/ia`, versión 2); un pase nuevo no la reinicia.
- Números: `test/puente-llamadas.test.ts` (buzón, espera con relojes falsos, puente real en un mundo en memoria con chat, burbuja y `llamar`, servidor antiguo) y una prueba nueva en `test/ia-publica.test.ts`. `npm run puente` empaqueta sin `node:`. Para que el puente empaquete esta rama se trajo `tools/empaquetar-puente.mjs` de `agentes/puente-neutral` (240002dc) con `codeSplitting: false` (el cliente carga el terreno en un trozo aparte).
- Idiomas: los textos que lee el cerebro están en español; **`en`, `ja`, `ko` y `pt-br` pendientes**.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/ia-puente` (sobre `feat/ia-llamar`), sin PR.
- Siguiente: S13 (`gesto` y «En tu burbuja» en `mirar`), S14 (numinia-web refresca el paquete).

## 2026-10-21 21:40 · ia-llamar S13 (gesto y «En tu burbuja») · hecho
- Qué: herramienta `gesto` {tipo: saludar|asentir|pensar|señalar} del puente: manda un movimiento de la función `gestos` (lo ven quienes están a menos de 30 m). Solo «saludar» tiene animación propia; «asentir» usa `hablar`, «pensar» `agacharse` (ambos paran solos a los 2 y 4 s) y «señalar» `usar`; la herramienta lo dice y la tabla está en `packages/agent/src/gesto-ia.ts` (cuando haya clips propios se cambia una línea; una prueba comprueba que cada movimiento exista). `mirar` añade «En tu burbuja: nadie / N» y, dentro del material, quién (con distancia), a partir de los eventos de `burbuja`; sin esa función no dice nada de burbuja.
- Números: 4 pruebas nuevas en `test/puente-llamadas.test.ts` (tabla contra la lista real del mundo, `mirar`, gesto real visto por otra persona, mundo sin `gestos`).
- Idiomas: textos para el cerebro en español; **`en`, `ja`, `ko` y `pt-br` pendientes**.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/ia-puente`, sin PR.
- Siguiente: S14 (numinia-web refresca `puente-mundo.mjs` y lo reenvía).

## 2026-10-21 23:50 · ia-llamar S11 (Hablar con ella) y cierre de llamar a una IA · hecho
- Qué: Las IAs se pueden llamar: por su burbuja, por su nombre, con `/nombre` o con el botón «Hablar con ella»; la IA puede esperar llamadas y saludar. Página (S11): en la tarjeta y en la ficha de Gente de una IA, si su casilla de botón está encendida, sale «Hablar con ella»; la primera vez (por navegador) un aviso («Lo que le digas lo lee su cerebro (la empresa de esa IA) fuera del mundo, y su respuesta la ven quienes estén cerca.», Aceptar) y luego una cajita (hasta 190 bytes, con contador; si no cabe se rechaza, nunca se corta). Dentro de la burbuja de una IA sale «E: hablar con <nombre>» (el mismo «E» de los hologramas, la cerradura y el vídeo: lo enseña lo más cercano; al `entras` aparece y al `sales` se va) y abre la misma cajita. La tarjeta dice «Escuchando ahora» si su cerebro usó las herramientas de escucha hace menos de 90 s, y «No escucha ahora» si no (texto de S16). La tarjeta se coloca a un lado para no tapar la burbuja de respuesta.
- Números: ver el cuerpo de la PR. `test/llamar-ia.test.ts` (pruebas puras). Comprobado en navegador con una IA conectada por el puente (`esperar_llamada` devuelve «hola, ¿me oyes?», la IA responde con `decir` y `gesto saludar`; también `/ada hola` y la tecla E), PC 1400×900 y móvil 390×844; capturas en `work/ia-organizacion/capturas/llamar/`.
- Idiomas: los textos nuevos están en español; **`en`, `ja`, `ko` y `pt-br` pendientes** (caen en español).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/ia-llamar` (S8–S11 y el puente de `feat/ia-puente`, con origin/main 9573c2ae), PR contra `main`.
- Siguiente: S14 (numinia-web refresca `puente-mundo.mjs` para dar estas herramientas a las IAs conectadas); S16 completo en el puente; idiomas.

## 2026-10-21 21:58 · status-semver (0.33.1) · hecho
- Qué: `/status` dice la versión del motor en `semver` («0.32.1»), para que numinia.com sepa si un mundo entiende el bloque de la IA en el pase (desde 0.29.0); `version` y `commitHash` siguen como estaban. Se lee una sola vez al arrancar (del `build.json` del instalador, que ahora la lleva, o del `package.json` en un checkout), nunca por petición. Y la burbuja de una IA ya no tiñe de verde la vista cuando la cámara está dentro: el relleno se dibuja solo por su cara delantera, y las líneas del borde siguen.
- Números: `test/flota.test.ts` (`/status` trae `semver` = la del `package.json`), `test/version.test.ts` (`semverMotor`, el sello de `build-deploy`), `test/burbuja-vista.test.ts` (el relleno es `FrontSide`). Captura desde dentro en `work/ia-organizacion/capturas/llamar/` (`*-v4.png`).
- Idiomas: sin textos nuevos.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/status-semver` (desde origin/main 1a771dfb).
- Siguiente: numinia-web (#232) lee `semver` para decidir si da el bloque `ia` al pase.


## 2026-10-21 · funciones f3 · hecho
- Qué: historia f3 (0.33.0): el bloque «Funciones de este mundo» en el cajón Entorno (PC y móvil), debajo de «Espacio base»: interruptores
  «Normas de entrada», «Dardos» y «Pesca» con el mismo aspecto que el de «Espacio base», el estado real del servidor, `fija` desactivado con
  «Lo fija el servidor.», y sin bloque para quien no construye. Lógica pura y textos es/en en `features/funciones/panel.ts` (+ `frases.*.ts`).
- Pruebas: `test/funciones-panel.test.ts`; pierna de navegador `tools/e2e-piernas/funciones-interruptores.mjs` (8871/5271): normas apagadas →
  una página nueva entra sin burbuja, encendidas → la siguiente la ve; dardos apagados → la diana desaparece; capturas PC y móvil.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `funciones/f3-interruptores-pc-movil` (sobre f2), sin subir.
- Pendiente: ja, ko, pt-br de los textos del bloque.
## 2026-10-21 19:00 · T1 paso de misión `hace` + `senala` · hecho
- Qué: nuevo tipo de paso `hace` en `mision@1` (13 acciones: coloca, mueve, gira, escala, oculta, borra, crea/edita/borra/dispara_cable y las tres de página abre_construir, abre_cable, abre_biblioteca) y el campo `senala` (id del botón al que apuntará la flecha; vale en cualquier paso; solo se valida, se guarda y viaja con el paso). El servidor lo decide oyendo eventos que ya existían: nuevos `objetos.hizo` y `disparadores.hizo` (solo-servidor, con la entidad autora; `mover` dice si cambió sitio, giro o escala) y `persona` en `disparadores.senal`; las tres acciones de página entran por la orden nueva `misiones.hace`, que solo acepta esas tres. Sin permiso de construir no cuenta nada; un `hace` que no es el paso actual no cuenta. Nada en el tick. El cliente expone `misiones.hace(accion)` y `misiones.senala()`; la plaza avisa al abrir Construir, Añadir y Cable solo si un paso lo pide. Aditivo: `misiones` v7 (el evento `paso` gana `accion` y `senala`, intent `hace`); `objetos` y `disparadores` no cambian de versión (eventos solo-servidor).
- Números: `test/misiones-hace.test.ts` (7 pruebas) nuevo; tres pruebas viejas actualizadas (lista de campos del paso, versión 7). Huella de determinismo intacta (un mundo con misiones `hace` hashea igual que sin ellas).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `taller` (desde origin/main a4e967ec), sin subir.
- Siguiente: la flecha que lea `misiones.senala()` y señale el botón; las 11 misiones del Taller.

## 2026-10-21 18:54 · T3 flecha · hecho
- Qué: la flecha que señala el botón del paso actual (`#flecha-guia`, `apps/plaza/flecha.ts`). Lee `misiones.senala()` y se pega al borde del botón (debajo si está en la mitad de arriba de la pantalla, encima si no), con latido suave que `prefers-reduced-motion` apaga. Si el botón no se ve señala el que lleva a él (`objetivoDeFlecha`, módulo sin DOM `flecha-logica.ts`): `cable-nuevo` → `dock-cable` → `construir` → `mas` (móvil). Sin flecha no hay observador ni bucle: se arma solo mientras hay una (MutationObserver + un rAF por cambio + resize).
- Números: `test/flecha.test.ts` (6 pruebas) nuevo; `npm test` 1638 bien, 0 mal; puertas en verde; página D2 593,4 kB → 594,3 kB gz (+0,9 kB). Prueba real `plantillas/taller/flecha.mjs` (Chromium, escritorio): flecha a 4 px de «Construir» y de «Añadir»; fotos `fotos/20-flecha-construir.png` y `21-flecha-anadir.png`.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `taller`, sin subir.
- Siguiente: T4 (zip del Taller).

## 2026-10-21 21:50 · T4 recorrido del Taller · dos arreglos hallados al recorrerlo en el navegador
- Qué: el paso 2 de la misión 5 del Taller señalaba `cable-probar`, que no existe en la página (el botón «Probar» de cada fila era solo una clase) y la flecha no salía. Ahora cada «Probar» lleva `id="cable-probar-<cable>"` (`apps/plaza/cable.ts`) y `padreDeBoton` manda `cable-probar-<id>` → `dock-cable` → `construir` → `mas` (`apps/plaza/flecha-logica.ts`). La misión usa `senala: "cable-probar-boton-rojo"`. Segundo hallazgo: el «Guardar» de la frase del cable (`editarDisparador`) no avisaba con `hizo`, así que un paso `edita_cable` nunca se cumplía desde la interfaz (solo desde el JSON de «Ver datos», `editarReceptores`); ahora `features/disparadores/server.ts` lo emite también.
- Números: `test/flecha.test.ts` +1 prueba y una aserción; `test/misiones-hace.test.ts` +1 prueba (falla sin el arreglo); `npm test` 1639 bien, 0 mal; puertas en verde; build ok (594,4 kB gz). Prueba real: `plantillas/taller/recorrido.mjs`.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `taller`, sin subir.

## 2026-10-21 21:05 · T4 Taller recorrido entero (11 misiones) · hecho
- Qué: la pierna `work/plantillas/taller/recorrido.mjs` recorre las 11 misiones de «La plaza a oscuras» con la interfaz real (C, arrastrar el Farolillo, asas, «se ve al jugar», Probar, «+ Nuevo cable», huecos de la frase, Lumen) y acaba con la insignia «Constructor»; `recorrido-movil.mjs` hace la misión 1 en móvil desde «…» → «más». Arreglo en `apps/plaza/flecha.ts`: cuando el paso pide un botón que nadie ve todavía (el diálogo o el cajón del móvil lo tapan), la flecha se escondía y DEJABA DE VIGILAR, así que no volvía nunca; ahora sigue vigilando mientras un paso pida algo y solo se apaga del todo cuando ningún paso lo pide (nada corre sin flecha).
- Números: escritorio 11/11 misiones (exit 0, cero errores de página); móvil 8/8 pasos; `taller.zip` 15 kB y `lienzo.zip` 6,4 kB (`comprobar` ok, importados y arrancados: «Taller», 11 misiones, 1 cable; «Lienzo»). Tests/puertas/build en el commit.
- Consumo: sin medir · Fable 5.1 (Ursa, en el escritorio) + Sonnet 5.5 (subagente T4, que murió a mitad; su trabajo se recogió).
- Commit: rama `taller`, sin subir.
- Siguiente: PR de la rama `taller` (T1 paso `hace`, T3 flecha, arreglos) cuando Pablo diga; farola de pie CC0; ja/ko/pt-br.


## 2026-10-21 · funciones v3 · hecho
- Qué: historia v3: «Ajustes» del menú de VR acaba con «Este mundo» (Normas de entrada, Dardos, Pesca) con las filas y los textos de `panel.ts` (los del
  bloque de PC), el estado real del servidor, `fija` con el botón apagado y «Lo fija el servidor.», y sin bloque para quien no construye. Sin cambio de versión.
- Pruebas: `test/funciones-menu-vr.test.ts`; pierna IWER `tools/e2e-piernas/funciones-menu-vr.mjs` (rayo + gatillo en «Dardos» → la diana desaparece y vuelve; sin permiso no
  hay bloque; puerta fijada por el servidor). Capturas del lienzo del menú en `work/motor-vr/fotos-v3/`.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `vr/v3-interruptores-vr` (sobre `funciones/f3-panel`), sin subir. Toca `apps/plaza/xr-menu.ts` solo en `ajustes()`: se junta con v2-fin.
- Pendiente: el título «Este mundo» del menú VR va en castellano (el menú VR solo está en castellano); ja, ko, pt-br de los textos del bloque.

## 2026-10-21 23:52 · bolsa-enlace · hecho
- Qué: «La Bolsa galáctica» (Inventario como rejilla de 42 casillas con iconos, equipo, ficha, tooltip y arrastre; el servidor pone el tope; bolsa llena = el pez vuelve al agua; inventario v3) y «dardos enlazados» (en cualquier mundo el botón AR ofrece «Dardos de <mundo enlazado> en tu pared» / «El mundo en tu mesa»; visita ligera `?enlace=dardos` a la Torre de los Alquimistas; dardos v6; `/status` con `dardosEnlace` y `visitas`). El botón nombra el mundo enlazado (su `/status` → `nombre` del ajuste → host). Versión 0.41.0.
- Números: `npm run gates` en verde (1952 pruebas, 0 mal); página 624,5 kB gz (main 0.39.0: 618,2); piernas dardos-enlace, dardos-duelo, pesca y misiones en verde.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `juegos/bolsa-enlace` (junta `inventario/rejilla` y `dardos/enlazados`), PR contra main.
- Siguiente: probar con gafas y móvil reales y contra la Torre en producción (hace falta este motor desplegado allí y una diana `remoto` en su dardos.json).

## 2026-10-22 00:43 · vr v7 el chat en VR · hecho
- Qué: el menú de VR tiene una octava fila, «Chat» (misma id, icono y nombre que el botón de PC; sale de las excepciones del test de paridad, que ahora solo debe «grabar» y «teclas»). Enseña los últimos 6 mensajes del chat de la página (los mismos que la lista de PC: «Tú», «(a la zona)», «(antes)», avisos) con letra de 38 px (≥ 1,2° a 1,2 m) y seis frases rápidas en rejilla 2×3 («¡Hola!», «Sí», «No», «Gracias», «Ven aquí», «Un momento»). Pulsar una (rayo + gatillo) llama a `chat.decir(frase, "cerca")`: el mismo camino que la caja de chat de PC, así que el ritmo de la página y las reglas del servidor (silencio, normas de entrada) valen igual; si la página rechaza, sale su motivo como nota. Para que cupieran ocho filas de 84 px el lienzo del menú pasa de 1440×800 a 1440×880 (0,556 → 0,611 m de alto).
- Pruebas: `test/vr-chat.test.ts` (lógica pura en `packages/render/src/menu-chat.ts`, maqueta y tamaños, el panel con lienzo falso, pulsar una frase); `menu-paridad` y `vr-menu` actualizados; pierna `tools/e2e-piernas/menu-vr.mjs` con un paso nuevo: rayo + gatillo en «Chat» y en «Gracias» → la otra página lo recibe como línea `cerca`, A lo lee como «Tú: Gracias», A lee «De nada» de B y ocho pulsaciones seguidas no salen todas (ritmo de la página, con nota). Capturas del lienzo en `work/motor-vr/fotos-v7/`.
- Pendiente: teclado virtual para escribir en VR (fuera de alcance: hoy se escribe en el ordenador; la nota del panel lo dice); canal «Zona» y /órdenes desde VR; las frases y el título van en castellano (el menú de VR solo está en castellano); ja, ko, pt-br.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `vr/v7-chat-en-vr`, sin subir. Toca `xr-menu.ts` solo con `chat()` y su entrada en `porVista`.

## 2026-10-22 03:00 · E1 habitantes en el contenedor · hecho
- Qué: el contenedor del mundo arranca él mismo a sus habitantes IA (0.44.0). Si el motor entra por `entrada.ts` (la imagen de la flota) y `aventura/habitantes/` tiene al menos un habitante válido, lanza `packages/agent` como proceso hijo contra `ws://127.0.0.1:$PORT` y lo mantiene: si cae vuelve a los 5 s (10, 20, 40, 60 mientras cae joven), si el servidor para el hijo para con él, y como el hijo lee `habitantes/` solo al arrancar, el motor mira la carpeta cada 2 s y lo reinicia al añadir/quitar/editar uno (sin habitantes no hay proceso). Sin fichero a mano: el secreto de los agentes lo hace el motor al azar en memoria si el entorno no trae `MOTOR_AGENTES_SECRET`; el hijo recibe un entorno corto (`CEREBRO_*`, `ANTHROPIC_API_KEY`, `PATH`…), nunca `JWT_SECRET`/`MOTOR_SECRET`/`ADMIN_CODE`/`MOTOR_ADMIN`. `MOTOR_HABITANTES=no` lo apaga; el instalador lo pone en la unidad systemd del motor (ahí manda `numinia-habitantes`: nunca dos copias). Módulo nuevo `packages/server/src/habitantes-proceso.ts`; el aviso `systemctl restart numinia-habitantes` del servidor se apaga con `MOTOR_HABITANTES_SIN_RECARGA=1`. Versión 0.43.0 → 0.44.0 (algo nuevo que no rompe nada).
- Números: `test/habitantes-proceso.test.ts` nuevo (14 pruebas; dos arrancan `entrada.ts` de verdad y el hijo de verdad, y añaden/quitan habitantes por `POST`/`DELETE /habitantes` con un pase de gestor). `npm test`: 1966 pruebas, 0 mal. `tools/layers.mjs` y `npm run build` en verde. Carrera real con una copia del mundo TRG26 (15 habitantes, sin `claves.env` ni sesiones): `/status` → `agentes: 15`, `agentesDe.habitante: 15`; hijo ~150 MB, `nice` 10, montón a 192 MB; al enviar SIGTERM al servidor el hijo se fue con él. Imagen docker/podman: no construida (carga de la máquina 10–14).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/habitantes-contenedor` (sobre `origin/main` 5c23893a), sin subir; cuerpo del PR en `work/numinia-engine-PR-habitantes-contenedor-body.md`.
- Siguiente: construir la imagen y probar un mundo con habitantes en la flota (open-1); poner `CEREBRO_CLAVE` en `/srv/fleet/env/<mundo>.env` si se quiere que Lía/escalón 2 o 4 piensen con Claude.

## 2026-10-22 02:55 · habitante-saber · hecho
- Qué: historia E2 (0.44.0): un habitante IA puede leer un fichero de saber, `habitante@1` `cerebro.saber` = `saber/<nombre>.md|txt` de su aventura (opcional, hasta 16 KB = `SABER_MAX`; la persona sigue en 1500 bytes). El servicio de habitantes lo lee una vez al arrancar (`packages/agent/src/saber.ts`: dentro de la carpeta de la aventura, sin `..` ni rutas absolutas, sin enlaces que salgan, texto, sin claves) y lo añade al prompt del sistema justo después de la persona, bajo «## Lo que sabes» entre `<saber>`…`</saber>`. Si falta, pesa de más o se sale de la carpeta, ese habitante no se carga y el log lo dice en castellano. Sin `saber`, el prompt es idéntico al de antes. `aventura/saber/*.md|txt` ya viajaba en el zip `mundo@2` (la lista blanca de la aventura admite cualquier carpeta `[a-z0-9-]` con `.json|.md|.txt`): no hay cambio en el servidor, solo una prueba que lo fija.
- Números: `test/habitante-saber.test.ts` nuevo (7 pruebas: rutas, lector en disco, tope, prompt con y sin saber, mundo con cerebro eco, zip copia/comprobar/importar). Contenido TRG26 (fuera del repo): `gente/saber/procyon.md` (7.485 bytes) y `gente/con-saber/procyon.json`, validados con el lector de la rama; con `CEREBRO_ECO=1` el prompt de Procyon trae el saber (10.724 bytes en total). `npm test` 1959 pruebas, 1959 bien, 0 mal (main: 1952 + las 7 nuevas); `node tools/layers.mjs` ok; `npm run build` ok. Los prompts de Lía y Procyon sin `saber` dan el mismo hash que en `origin/main`.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/habitante-saber`, sin subir.
- Siguiente: que `node tools/aventura.ts` pase también el lector (hoy solo mira la ruta como texto); desplegar y poner `saber` en Procyon (reiniciar `numinia-habitantes`); decidir si el saber se recarga sin reiniciar.

## 2026-10-22 04:45 · pesca-peces-del-mundo (E4) · hecho
- Qué: un mundo trae sus propios peces. `MUNDO_DIR/pesca.json` admite `peces` (hasta 40: `id`, `nombre` ≤ 32 caracteres y ≤ 40 bytes, `rareza`, `peso`, `cm`, y `color` `"#RRGGBB"` más los números de la pelea si se quiere) y **sustituyen** la tabla de la casa en ese mundo; sin `peces` todo igual que antes. Se lee estricto en `features/pesca/esquema.ts` (`leerPeces`): una clave desconocida, un valor fuera de rango, un nombre largo, un id repetido o una lista vacía hacen que no se use el `pesca.json` entero (el mundo se queda con el estanque y los peces de la casa) y el log del servidor dice cada fallo con su ruta. La página enseña el nombre (ya lo hacía) y ahora el color del pez: `captura` y `fin` llevan `color` (pesca v5; `""` = pez de la casa, sin cambio visible), un punto junto al nombre en «¡Pescado!» y el cuerpo del pez en la mano. `notas` (texto) se admite en el fichero porque los mundos ya lo llevan.
- Números: `test/pesca-peces-mundo.test.ts` nuevo (6 pruebas: lector, 21 casos malos, sustituye la tabla de verdad con dos jugadores, sin `peces` idéntico, fichero malo rechazado, `peces` sin `sitios`); `test/pesca.test.ts` solo añade `color: ""` a tres comparaciones. La huella de la simulación no cambia (pesca es de servidor, fuera de la sim). `npm test`: 1958 pruebas, 0 mal (carga ~3–8); `node tools/layers.mjs` ok; `npm run build` ok.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/pesca-peces-del-mundo` (sobre main `5c23893a`), sin subir; versión sin tocar (la fija el PR conjunto).
- Siguiente: el `pesca.json` del estanque de los partners de la TRG26 (20 peces, uno por marca) está en `trg26/peces/pesca.json`; falta verlo en un navegador y subirlo con el mundo cuando el motor esté desplegado.

## 2026-10-22 01:43 · v9-carga-quest · hecho
- Qué: por qué tarda entrar en un mundo desde las gafas: la página abría el WebSocket tarde y corría la sonda de determinismo antes del primer cuadro. Se abre el socket al principio (lo que llega antes de la sesión espera en el transporte) y la sonda va después del primer cuadro. `tools/medir-entrada.mjs` repite la medida.
- Números: A/B alternado, mediana de 3, CPU ×4 · 10 Mb/s · 60 ms: welcome 1817 → 1010 ms, primer cuadro 1828 → 1125 ms, «Cargando» fuera 1914 → 1354 ms (−29 %); con CPU ×6 · 1,6 Mb/s · 150 ms: 5348 → 4721 ms (−12 %). Carga de la máquina 5–9. Detalle en `docs/CARGA-RAPIDA.md` («v9»).
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `vr/v9-carga-quest`, local, sin push.
- Siguiente: repetir en unas Quest reales; partir el JS de la página y las texturas del mundo (lo que queda de los ~700 kB antes del primer cuadro).

## 2026-10-22 07:35 · personas-quietas-enteras (E5) · hecho
- Qué: una persona que está quieta (`pnj@1`) o una cosa de misión se dibujaba cortada a ±1 m de su origen: un cocinero de 1,98 m con los pies en y 0 no tenía cabeza, y Pietro de la aventura de la TRG26 era un muñón. Causa: `hornear()` (`packages/render/src/index.ts`) metía la matriz del nodo en la posición tal cual venía del archivo, y el optimizador del servidor (`optimizar.ts`) guarda las posiciones como enteros de 16 bits normalizados (−1..1; el nodo de encima trae la escala y el desplazamiento). `applyMatrix4` escribía metros en una casilla que solo guarda −1..1 y todo lo que pasaba de 1 m se enrollaba (1,98 m → −0,02 m, bajo el suelo). Los modelos con el origen en la cintura (±0,99 m, el apaño de los mundos) nunca llegaban a 1 m y por eso se veían bien; los animados van por `fundir.ts` y tampoco. Arreglo: la lógica de hornear sale a `packages/render/src/hornear.ts` (pura, sin DOM) y copia posición y uv a `Float32` antes de aplicar la matriz (`aFlotante`), igual que ya hacía `fundir-quietos.ts` (`plano()`).
- Números: `test/hornear.test.ts` nuevo (5 pruebas: un cocinero de 1,98 m con los pies en el origen, optimizado por `optimizarGlb` y leído con el cargador de la página, vuelve a medir 1,98 m —antes del arreglo: la cabeza se enrollaba—; el mismo con el origen en la cintura queda donde estaba al milímetro; atributo cuantizado bajo escala de nodo; piezas del mismo material guardadas de formas distintas se siguen fundiendo; `aFlotante`). Puertas: `node tools/layers.mjs` ok, `npm run build` ok, peso antes de dibujar sin cambio apreciable (625,6 kB, tope 1000 kB). `npm test`: 1994/1994.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `fix/pnj-quietos-enteros` (sobre main `fba7d873`); versión 0.45.0 → 0.45.1 (arreglo).
- Siguiente: quitar de los mundos el apaño de la cintura (`CINTURA` en `trg26/espacio/comida.mjs`, la `y` de los pnj) cuando el motor esté desplegado; los modelos con el origen en la cintura siguen valiendo.

## 2026-10-22 · E3 avatares del mundo · hecho
- Qué: un mundo trae sus propios avatares en su zip (CC0, o CC BY con crédito visible) y su gente los elige en el selector de ese mundo. `entorno/avatares.json` (`numinia-engine/avatares-mundo@1`, hasta 8) + `.vrm`/miniatura en `datos/activos/<sha256>`: nada nuevo en el zip (ya viajan). `packages/server/src/avatares-mundo.ts` lo comprueba al arrancar con el lector `vrm.ts` (≤ 10.000 triángulos, la licencia del propio fichero = la declarada, CC BY exige `credito`, línea mala fuera con su motivo); `GET /status` lleva `avatares`; el selector de `apps/plaza/avatar.ts` añade «De este mundo» con el crédito pegado. La biblioteca de la casa sigue siendo solo CC0 (`revisarAvatar` intacto).
- Números: `test/avatares-mundo.test.ts` 13 pruebas; avatares TRG26 (4 × 9.997 triángulos, CC BY) leídos sin problemas por el lector nuevo. `npm test` 1966 (1964 bien; 2 de tiempo de naturaleza mal con la máquina cargada, loadavg 15–18 en 32 núcleos, y bien solas), `layers` y `build` ok; foto del selector con los 4 en `work/trg26/avatares/fotos-e3/`.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `feat/avatares-del-mundo` (sobre main `f226cf5f`); versión 0.45.1 → 0.46.0 (algo nuevo que no rompe nada).
- Pendiente: avatar por defecto del mundo (`ficha.avatar`) y de las IAs (`ia.cuerpo`) con uno propio; panel de créditos; mostrar el crédito de quien lleva uno puesto; `allowedUserName` no se mira (permiso de TRG/VIPE por escrito, fuera del motor).

## 2026-10-22 09:10 · e1 la puerta HTTP /funciones · hecho
- Qué: `GET|POST /funciones` en el servidor para que la administración de numinia.com encienda y apague Normas de entrada, Dardos y Pesca sin entrar al mundo. Misma forma que `/habitantes` (pase del mundo con `manage-organization` o dueño; sin clave de pase = 404; 401/403; CORS solo `https://numinia.com`; cuerpo ≤ 1 KiB). Un solo camino con el verbo `poner`: la lógica salió a `cambiar` en `features/funciones/server.ts` y el enlace `EnlaceFunciones` tiene ahora `estado()` y `cambiar()`. `fija` → 409 «Lo fija el servidor»; función desconocida → 400. El id de las normas es `normas` (el de `funciones.json` y del verbo); `puerta` se acepta como otro nombre al escribir. De paso `/habitantes` y `/funciones` salen en la lista `hay` del 404.
- Pruebas: `test/funciones-http.test.ts` (9: sin pase, pase malo/otro mundo, sin permiso, sin clave de pase, CORS y OPTIONS, GET con y sin condiciones, POST visto por dos páginas conectadas y por el verbo, `puerta`, `fija`, validación y fichero roto).
- Commit: rama `funciones/e1-funciones-http` (sobre `origin/main` d911f187), sin subir; versión sin tocar.
- Siguiente: w7, el bloque «Funciones de este mundo» en el panel de numinia.com, que lee y escribe aquí.

## 2026-10-22 · v11 el reloj de muñeca sale con la mano 10 cm más baja · hecho
- Qué: Pablo, en la Quest (mandos): «hay que levantarlo como 10 centímetros… tienes que poderlo ver así». Con la muñeca a la altura en que se mira un reloj de verdad (0,20–0,30 m delante de los ojos, ~0,10 m al lado, 0,22–0,40 m por debajo: 45–55° bajo la mirada) el reloj no salía; estaba justo fuera del cono de 45°. `muneca-gesto.ts`: `ABRIR.conoGrados` 45 → 55 y `CERRAR.conoGrados` 60 → 70 (la histéresis sigue en 15°); `ABRIR.cercaMaxM` 0,65 → 0,60 para que el cono más ancho no deje abrir con el brazo estirado (0,65–0,75 m). Con la cabeza recta y la muñeca 0,20–0,30 m delante, el reloj sale 9,5–13,5 cm más abajo que antes (mando y mano). El dorso (60°) y los 200 ms no cambian. El cartel de ayuda no se toca.
- Números: `test/vr-muneca.test.ts` 4 pruebas nuevas (bisección de los dos límites; tres poses de reloj cerradas antes y abiertas ahora, mando y mano; cabeza inclinada 10°; brazo estirado apuntando, mano al pecho, brazo que se balancea y brazo caído siguen cerrados; histéresis) y `test/vr-menu.test.ts` ajustado (0,6 m, 75° fuera). Pierna `tools/e2e-piernas/menu-vr.mjs` con IWER: brazo estirado a 0,71 m no saca el reloj, la pose de reloj (~52° bajo la mirada, medida 52,3°) sí, y bajar la muñeca lo esconde (rc 0). `npm test` 2015/2015 (rc 0); `npm run gates` rc 0 con la máquina a loadavg 4,9 (1 prueba de tiempo de `naturaleza-sonido` mal en la primera pasada de la puerta y bien sola); `npm run build` rc 0; página 626,5 kB gz.
- AR: el reloj solo existe en `vr.ts` (`createReloj`); `ar.ts` (immersive-ar) no lo crea. Donde la Quest sirve «En tu pared» como sesión VR con paso de cámara (`environmentBlendMode` no opaco) corre `vr.ts` y vale lo mismo; no se ha probado con IWER en `immersive-ar`.
- Consumo: sin medir · Sonnet 5.5 (subagente).
- Commit: rama `vr/v11-muneca-baja` (sobre main `4b4c3833`, 0.47.0); versión sin cambiar.
- Pendiente: medir en la Quest que 55° basta (no hay medidas de la pose del grip en las sesiones del 22-10: solo la transcripción); si el límite era el dorso (60°) y no el cono, habría que abrir también ese.
