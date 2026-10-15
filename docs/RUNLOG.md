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
