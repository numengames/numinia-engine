# Backlog del motor — lo que hacen los turnos (y nosotros)

**Regla:** cada turno desatendido coge la **primera** fila con estado `pendiente` y desatendible `sí`,
la hace entera (o la parte en trozos y lo dice), la deja con las puertas en verde y escribe una
entrada en `docs/RUNLOG.md`. El orden de la tabla ES la prioridad. Solo Pablo (o una sesión con él)
reordena. Estados: `pendiente` · `en curso` · `hecho` · `bloqueada` (con motivo) · `necesita aprobación`.

## Principios que mandan sobre cualquier tarea (Pablo, 14-10 noche)

1. **Nativo para IA:** el motor tiene que ser el más fácil de entender y de navegar para un LLM —
   en el código (mapa de una página, contratos cortos por paquete, esquemas, errores que dicen cómo
   arreglarse, repeticiones deterministas) y dentro del mundo (los agentes entran como jugadores, ven
   el mundo como texto estructurado y actúan con verbos simples).
2. **Que no caliente los móviles (súper importante):** en móvil se dibuja lo justo — tope de cuadros,
   resolución contenida, nada de trabajo cuando no cambia nada, bajar calidad antes de que el aparato
   se caliente.
3. **Límites publicados:** quien quiera montar algo en el motor tiene que poder leer sus límites
   según servidor, aparato, navegador y gráfica, con cada número marcado como medido o estimado.

## Cola

| ID | Tarea | Estado | Desatendible |
|---|---|---|---|
| S1 | Kit de despliegue para un servidor pequeño (para mañana) | hecho | sí |
| S2 | Métricas del servidor (`/health`, `/metrics`) y enjambre contra una URL remota (para mañana) | hecho | sí |
| P1 | Ficha técnica: características y límites del motor (humana + `limits.json`) | hecho | sí |
| J0 | Catálogo de todo lo que espera un jugador + receta para añadir funciones nuevas | pendiente | sí |
| J7 | Módulos de juego: añadir una función sin tocar el núcleo, con un ejemplo real (gestos) | pendiente | sí |
| P2 | Móvil frío: política de energía del cliente + puerta de coste por cuadro | pendiente | sí |
| P3 | Nativo para IA v1: `llms.txt`, mapa, README-contrato por paquete, `npm run describe` | pendiente | sí |
| J1 | Avatares VRM de verdad (CC0) con animaciones CC0 en la plaza | pendiente | sí |
| J2 | Salto y altura en la simulación (cambia la huella fijada; permiso de Pablo, 14-10) | pendiente | sí |
| J3 | Chat y bocadillos de texto sobre los avatares, con nombres | pendiente | sí |
| B1 | HTTPS en la red de casa para los visores (certificado propio, `/ws` en el mismo origen) | pendiente | sí |
| J6 | VR de verdad: entrar en VR/AR, moverse, manos y mandos, paneles 3D (emulador IWER) | pendiente | sí |
| J4 | Interacciones: puerta, botón y objeto que se coge, igual en escritorio, móvil y VR | pendiente | sí |
| J5 | Libro de misiones, mapa y minimapa con marcadores | pendiente | sí |
| A1 | Página de multitud (50/200/1.000/2.000 robots, completos vs horneados) | pendiente | sí |
| D1 | Puerta de tipos: TypeScript 7 estricto, 0 errores | pendiente | sí |
| S3 | Dilatación de tiempo cuando el tick no cabe (4.000 bots) | pendiente | sí |
| P4 | Agentes como jugadores v1: SDK con verbos y observación textual | pendiente | sí |
| A2 | Banco de multitud con la GPU real (si Chromium la usa sin pantalla) | pendiente | sí |
| A3 | Normales horneadas en la animación de textura (luz correcta al girar) | pendiente | sí |
| A4 | Robots en la plaza: cercanos completos, lejanos horneados | pendiente | sí |
| B3 | Telemetría en el visor: p99 de cuadro y cuadros perdidos | pendiente | sí |
| D2 | Puerta de tamaño del cliente (≤ 300 kB comprimido) | pendiente | sí |
| D3 | Fuzz de todos los decodificadores de red | pendiente | sí |
| D4 | El formato de red sale del esquema, no escrito a mano | pendiente | sí |
| X1 | Probar en Quest 3 y Pico 4 | pendiente | no |
| X2 | Probar Safari de verdad (iPhone o Mac) | pendiente | no |
| X3 | Montarlo en un servidor pequeño real y medir sus límites (con Pablo, 15-10) | pendiente | no |
| X4 | Nombre del motor (Pablo y Christian, 15-10) | pendiente | no |
| X5 | Medir temperatura y batería en un Android real (`adb`) | pendiente | no |

## Detalle

### S1 — Kit de despliegue
**Por qué:** el 15-10 Pablo lo monta en un servidor pequeño para ver los límites.
**Hecho cuando:** `deploy/instalar-motor.sh` (un solo fichero, generado por `tools/build-deploy.mjs`,
que incrusta servidor + página construida) instala en Ubuntu 24.04 / Debian 12: Node LTS oficial con
sha256 comprobado, usuario de sistema, servicio systemd con límites (`LimitNOFILE`, `MemoryMax`),
Caddy sirviendo la página y pasando `/ws` al servidor (HTTPS automático si se le da un dominio; sin
dominio, HTTP por IP para pruebas), ufw 22/80/443. El cliente usa `wss://<mismo origen>/ws` cuando no
está en localhost. `bash -n` limpio. Prueba en un contenedor `podman` ubuntu:24.04 hasta donde se
pueda sin systemd: arrancar el servidor a mano dentro y conectar un bot que recibe snapshots. Si
podman no está o no va, decirlo y dejar la prueba local equivalente.
**Hecho (14-10 noche):** `npm run deploy` → `deploy/instalar-motor.sh` (534 kB, fuera de git) desde
`deploy/instalar-motor.plantilla.sh`; Node 24.22.0 LTS con sha256 fijado (x64 y arm64) en
`tools/build-deploy.mjs`; opciones `--dominio`, `--memoria`, `--sin-cortafuegos`, `--solo-extraer`,
`--version`. Cliente: `serverUrl()` en `packages/client` (localhost → `:8790`, fuera → `/ws` del mismo
origen). Instrucciones en `deploy/README.md`. **Sin podman ni docker en esta máquina:** la prueba
equivalente es `node tools/deploy-check.mjs [node]` (desempaqueta, comprueba la página, arranca el
servidor desempaquetado en :8793 y un cliente recibe 10 snapshots en ~955 ms; huella `fa94375e`) —
pasada con Node 24.22.0 y con 26.7.0. **Sin probar:** apt, systemd, Caddy y ufw de verdad (eso es X3).

### P1 — Ficha técnica
**Por qué:** si alguien técnico decide montar algo en el motor, necesita saber sus límites; dependen
del servidor, del aparato, del navegador y de la gráfica.
**Hecho cuando:** `docs/FICHA-TECNICA.md` (español, para personas) y `limits.json` (para máquinas, con
`schema` y versión). Ejes: servidor (VPS-1, VPS-2, SYS-3…), aparato (A escritorio WebGPU, B Quest 3 /
Pico 4, C móvil medio, D móvil viejo), motor del navegador (Chromium, Gecko, WebKit), backend
gráfico (WebGPU, WebGL2), red (WebTransport, WebSocket). Contenido: características por nivel
(Base / Mejorado / Frontera) y límites (personas por instancia, kbit/s por persona, triángulos, draw
calls, texturas, avatares completos y horneados, luces, fuentes de audio, MB por zona, tiempo hasta
jugar, fps objetivo). Cada número lleva `estado: medido | estimado`, y si es medido la prueba que lo
mide (`tools/...` o test) y la fecha. Fuentes: `../mmo-browser-study/LIMITES.md`,
`FUNCIONALIDADES.md`, `EL-MOTOR.md` y las medidas del RUNLOG. Un test valida `limits.json` y comprueba
que cada valor medido apunta a una prueba que existe.

### S2 — Métricas y enjambre remoto
**Hecho cuando:** el servidor sirve por HTTP en su puerto `/health` (ok + versión) y `/metrics`
(JSON: conectados, tick p50/p99, kbit/s por persona, memoria, factor de dilatación). `tools/swarm.sh`
acepta una URL (`wss://…/ws`) y un modo "en el propio servidor". Test de `/metrics` en local.
**Hecho (15-10 madrugada):** `packages/server/src/server.ts` (`startServer`, HTTP + WebSocket en el
mismo puerto) y `metrics.ts` (ventanas: últimos 200 ticks = 10 s; bytes por segundo, 10 s). `/health`
→ `{ok, version, huella, conectados}`; `/metrics` → JSON `numinia-engine/metrics@1` (conectados,
capacidad, tick p50/p99/peor, presupuesto 25 ms, retraso del bucle, kbit/s por persona, memoria RSS y
heap, `dilatacion` = 1 fija hasta S3). Versión: `ENGINE_BUILD` o `../VERSION` del instalador. Caddy
publica `/health`; `/metrics` solo en 127.0.0.1 (túnel `ssh -L 18790:…`). Enjambre:
`packages/server/src/swarm.ts` (va dentro del instalador) con `--url`, `--en-servidor`, `--metrics`,
`--procs`, tope 120 s; `tools/swarm.sh --url …` lo llama. Los bots conectan en tandas de 25 en paralelo
y cuentan fallos. Medido aquí: swarm local 1.000 → `/metrics` tick p50 13,8 / p99 16,2 ms, 25,5 kbit/s,
RSS 169 MB, conexión de 500 bots en ~0,4 s. **Sin probar:** `wss://` de verdad (aquí no hay TLS) → X3.

### P2 — Móvil frío
**Hecho cuando:** política de energía en el cliente, decidida por capacidad (nunca por nombre de
navegador): en móvil tope de 30 fps por defecto (60 a petición), pixel ratio ≤ 1,25,
`powerPreference: 'low-power'`, 10–15 fps cuando no se mueve nada ni hay entrada, nada cuando la
pestaña está oculta, resolución dinámica si el tiempo de cuadro sube de forma sostenida (señal de
calentamiento), y un "modo batería". Puerta de coste por cuadro para el nivel D (CPU ms, draw calls,
triángulos) medida sin pantalla. `docs/MOVIL-FRIO.md` con el protocolo para medir temperatura y
batería en un Android real durante 10 min (`adb shell dumpsys battery`).

### A1 — Página de multitud
El módulo ya existe sin probar: `packages/render/src/crowd.ts` (animación horneada en textura VAT,
mil figuras en una llamada; y figuras completas con esqueleto). Falta `apps/plaza/crowd.html` + su
`.ts`: modos `full` / `vat` / `mix` (los 20 primeros completos), N = 50/200/1.000/2.000 (completos
como mucho 200), HUD en español (fps, cuadro p50/p99, CPU ms, draw calls, triángulos, backend),
medida automática (2 s de calentamiento + 5 s) en `globalThis.__crowd.result`. **Hecho cuando:** un
e2e sin pantalla carga la página en chromium y firefox sin errores y comprueba que `vat` con 1.000
figuras usa ≤ 10 draw calls.

### P3 — Nativo para IA v1
**Hecho cuando:** `llms.txt` en la raíz (una página: qué es cada paquete, contratos, comandos,
límites), `docs/MAPA.md`, un `README.md` corto por paquete (qué hace, qué no, de qué depende, cómo se
prueba), `npm run describe` que imprime el estado de una instancia sin pantalla como JSON legible
(entidades, posiciones, quién ve a quién). Test de "documentación verdadera": cada paquete tiene
README y aparece en `llms.txt`.

### B1 — HTTPS en la red de casa
**Hecho cuando:** `npm run dev:lan` genera (si no existe) un certificado propio con openssl en
`.cert/` (fuera de git), sirve la página por https en la IP de la red de casa y pasa `/ws` al servidor
por el mismo origen; el cliente usa `wss://` en https. e2e por https ignorando el certificado.

### D1 — Puerta de tipos
TypeScript 7 (`tsc --noEmit`, estricto) con las dependencias de tipos que hagan falta (licencias
libres, versión exacta). 0 errores. Entra en `npm run gates` con su coste medido.

### S3 — Dilatación de tiempo
Si el tick no cabe en su presupuesto, la simulación va más despacio (como EVE) en vez de acumular
retraso; el factor sale en métricas. Probado en local con 4.000 bots, `nice`, ≤ 30 s.

### P4 — Agentes como jugadores v1
`packages/agent`: un agente entra por el mismo protocolo que una persona; verbos `irA`, `mirar`,
`decir`, `seguir`; observación textual de lo cercano. Sin LLM (el cerebro es otro servicio). Test
sin pantalla: el agente llega a un destino y su observación lista a los cercanos.

### J0 — Lo que espera un jugador (Pablo, 14-10: "todas esas cosas las tenemos que tener previstas")
`docs/JUGADOR.md`: catálogo de lo que cualquier jugador da por hecho en un mundo social / MMO en 2026,
por grupos (moverse, verse, comunicarse, interactuar, progresar —libro de misiones, logros, sellos—,
orientarse —mapa, minimapa, brújula, marcadores—, interfaz y ajustes, VR, móvil, accesibilidad,
social —amigos, grupo—, eventos). Para cada cosa: qué es en una línea, capa (motor o ciudad), nivel
(Base / Mejorado / Frontera), cómo es en escritorio, móvil y VR, qué primitivas del motor necesita
(componente con esquema, mensaje, sistema del servidor, panel), coste para el móvil, y qué fila de
esta cola lo construye (o una fila nueva). Más `docs/EXTENDER.md`: la receta de una página para añadir
una función (esquema → sistema → mensaje → panel → prueba), que J7 convierte en código. Fuentes:
`../mmo-browser-study/FUNCIONALIDADES.md` y lo que hacen VRChat, Roblox, WoW/FFXIV, Hyperfy (citar
la URL si se consulta). **Hecho cuando:** existen los dos documentos y la cola tiene una fila por cada
pieza de nivel Base que falte.

### J7 — Módulos de juego (flexible: "que sea muy fácil implementar algo nuevo")
Una API `defineFeature({ id, components, messages, server, client, panels })`: una función nueva se
añade en su propia carpeta sin tocar el núcleo. Ejemplo real hecho con ella: gestos (saludar / bailar
con una tecla) que viajan por la red y se ven en la otra pestaña. **Hecho cuando:** test sin pantalla
del ejemplo; quitar el módulo no rompe nada; `docs/EXTENDER.md` usa el ejemplo. J3, J4 y J5 se
construyen después como módulos.

### J1 — Avatares VRM de verdad
`@pixiv/three-vrm` 3.5.5 (MIT, versión exacta). 2–3 VRM CC0 con la licencia comprobada dentro del
propio fichero (metadatos VRM) y en su fuente (candidato: 100Avatars de Polygonal Mind), cada uno con
su nota de licencia; animaciones CC0 (candidato: Universal Animation Library de Quaternius —
comprobar) reasignadas al esqueleto humanoide: quieto, andar, correr. En la plaza: tu avatar y los
cercanos en VRM (como mucho 12 en móvil, 25 en visor, 60 en escritorio, `LIMITES` §3), el resto
como hoy; rechazar avatares de más de 10.000 triángulos. **Hecho cuando:** e2e chromium + firefox
cuenta avatares VRM cargados sin errores; peso de descarga por avatar medido y apuntado.

### J2 — Salto y altura
La simulación gana altura, velocidad vertical, gravedad y suelo, y la entrada un bit de salto; la
predicción sigue exacta (0 correcciones). Cambia la huella fijada y el formato de entrada y de
snapshot. **Permiso de Pablo (14-10, "que no pare el desarrollo"): se hace en `auto`**, con versión de
formato nueva, la huella nueva fijada en el test y el cambio explicado en el diario.

### J3 — Chat y bocadillos
Mensaje nuevo CHAT (aditivo: tipo nuevo, texto UTF-8 ≤ 200 bytes, límite de ritmo en el servidor,
alcance por cercanía de 20 m); bocadillo sobre quien habla durante ~6 s, legible en VR; nombre sobre
la cabeza; caja de chat en la página (Enter para escribir; en móvil, un botón). **Hecho cuando:** e2e:
la pestaña A escribe "hola" y la B ve el bocadillo; el servidor descarta textos largos o seguidos.

### J6 — VR de verdad
Botón "Entrar en VR" (y "AR" donde haya passthrough) solo si `navigator.xr.isSessionSupported`;
`renderer.xr` (WebGL2 en Quest); moverse con el stick (intenciones), teletransporte con arco, giro a
saltos de 30°, viñeta de confort ajustable, mandos y manos, un panel 3D legible. Probado con el
emulador IWER (Meta, MIT, versión exacta) inyectado en Playwright: entra en sesión, dibuja cuadros,
el stick mueve el avatar. Después X1 con Pablo (necesita B1).

### J4 — Interacciones ("cómo interactúan unas cosas con otras")
Componente Interactuable (usar / agarrar, texto del aviso, radio) y un sistema del servidor que decide;
aviso "E: abrir" en escritorio, botón en móvil, rayo y gatillo en VR. Tres ejemplos: puerta que se
abre, botón que enciende una luz, objeto que se coge y se suelta; todo se ve igual en la otra
pestaña. **Hecho cuando:** e2e de los tres.

### J5 — Libro de misiones y mapa
Formato de misión en JSON con esquema (pasos; condiciones "llega a", "usa", "habla con";
recompensas), estado por jugador en el servidor, panel del libro (lista, detalle, seguimiento en el
HUD), mapa de la zona (vista cenital generada) y minimapa con marcadores (tú, gente, objetivo,
portales); en VR, panel en la muñeca. El formato y los paneles son del motor; las misiones concretas,
de la ciudad. **Hecho cuando:** una misión de ejemplo de tres pasos se completa en un e2e y el mapa
marca su objetivo.

### A2, A3, A4, B3, D2, D3, D4
Ver su línea en la cola. B2: el emulador IWER (Meta, MIT) se inyecta en Playwright para simular una
Quest 3; comprobar licencia y versión antes de instalar.

**P1 hecho (15-10):** `limits.json` (`numinia-engine/limits@1`; lista plana de `limits` con eje/ámbito/clave/valor/unidad/estado + `features`), `docs/FICHA-TECNICA.md` y `test/limits.test.ts` (esquema, sin duplicados, mismas claves en A–D, cada `measured` apunta a un archivo que existe, cada `estimated` lleva fuente). Medido: tick, kbit/s, memoria, conexión, e2e Chromium/Firefox; estimado: tabla A–D, VPS-1/2, voz. WebKit sin probar.
