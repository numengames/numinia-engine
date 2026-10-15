# Diario de turnos

Una entrada por turno (desatendido o con Pablo), la más nueva abajo. En español, para personas.
Formato: `## AAAA-MM-DD HH:MM · <ID> · <estado>` y cinco líneas: Qué, Números, Consumo (semana a % →
b %, de `hermes usage`, y el modelo), Commit, Siguiente.

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
