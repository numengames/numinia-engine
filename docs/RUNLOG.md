# Diario de turnos

Una entrada por turno (desatendido o con Pablo), la más nueva abajo. En español, para personas.
Formato: `## AAAA-MM-DD HH:MM · <ID> · <estado>` y cinco líneas: Qué, Números, Consumo (semana a % →
b %, de `hermes usage`, y el modelo), Commit, Siguiente.
Horas en UTC (`date -u`). Las entradas de los turnos hasta la de las 09:35 del 15-10 están en hora de Madrid
(CEST, UTC+2); desde la de las 10:08, en UTC.

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
