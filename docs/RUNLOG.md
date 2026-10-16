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
