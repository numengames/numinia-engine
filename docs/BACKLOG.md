# Backlog del motor — lo que hacen los turnos (y nosotros)

**Regla:** cada turno desatendido coge la **primera** fila con estado `pendiente` y desatendible `sí`,
la hace entera (o la parte en trozos y lo dice), la deja con las puertas en verde y escribe una
entrada en `docs/RUNLOG.md`. El orden de la tabla ES la prioridad. Solo Pablo (o una sesión con él)
reordena. Estados: `pendiente` · `en curso` · `hecho` · `bloqueada` (con motivo) · `necesita aprobación` ·
`para Opus` (mucho razonamiento: la hace la sesión de Pablo con Opus, nunca un turno; Pablo, 15-10) ·
`espera a <ID>` (no empieza hasta que esa fila esté `hecho`).

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
| S5 | Batería de pruebas de capacidad para X3: banco de CPU, escalera/remojo/tormenta, robots que miden, steal, informe, `/metrics.prom` (`docs/MEDIDAS.md`) | hecho | sí |
| P1 | Ficha técnica: características y límites del motor (humana + `limits.json`) | hecho | sí |
| J0 | Catálogo de todo lo que espera un jugador (la receta para añadir funciones es de J7) | hecho | sí |
| J7 | Módulos de juego: añadir una función sin tocar el núcleo, con un ejemplo real (gestos) | hecho | no |
| T1 | Cómo entra cada jugador: el aparato, el navegador, la gráfica, la XR, los cuadros, el ping y la batería de cada sesión, guardados en el servidor (Pablo, 15-10) | hecho | sí |
| I1 | Identidad de invitado (sin vincular aparatos: Pablo, 15-10, «de momento no») | para Opus | no |
| S4 | Persistencia mínima del mundo (puntos de enlace, inventario, cosas plantadas) | hecho | no |
| V1 | Ficha `accesible` en el esquema (nombre, función, estado, descripción, importancia, sonido, acciones) + reglas en J7: nombre hablado, sonido↔texto, verbo sin gesto; puerta en los tests | hecho | no |
| J9 | Estado y objetos de las funciones por cercanía (mundos grandes): a cada uno, solo lo que tiene cerca | para Opus | no |
| B1 | HTTPS en la red de casa para móviles y visores (certificado propio, `/ws` en el mismo origen) | hecho | sí |
| J8 | AR de verdad: entrar en AR en Android, Quest 3 y Pico 4, suelo, anclar un objeto; iPhone en plano | hecho (emulado; falta probar en aparato real) | sí |
| J6 | VR de verdad: entrar en VR, moverse, mandos, giro a saltos, viñeta, panel 3D (emulador IWER) | hecho (emulado) | sí |
| R1 | Realidad cruzada 1 «Despertar»: un QR real hace que la plaza reaccione para todos (trozo 1 hecho; falta lo de «Falta de R1» en su detalle) | pendiente | sí |
| R2 | Realidad cruzada 2 «Semilla del Conocimiento»: pregunta en un sitio real → semilla que se planta en el mundo | espera a I1, S4 | sí |
| R3 | Realidad cruzada 3 «Célula del Prisma» + herramienta del DJ para marcar puntos reales | espera a I1, S4 | sí |
| R4 | Realidad cruzada 4 «Caza de invisibles»: la cámara, el color y la hora deciden qué aparece | pendiente | sí |
| J10 | VR: teletransporte con arco, manos (hand-tracking) y viñeta ajustable desde un menú; resto de J6 (antes «J6b»: `auto.sh` solo reconoce letra + cifras) | pendiente | sí |
| P2 | Móvil frío: política de energía del cliente + puerta de coste por cuadro | hecho (sin medir en móvil real → X1) | sí |
| P3 | Nativo para IA v1: `llms.txt`, mapa, README-contrato por paquete, `npm run describe` | hecho | sí |
| J1 | Avatares VRM de verdad (CC0) con animaciones CC0 en la plaza | pendiente | sí |
| J2 | Salto y altura en la simulación (cambia la huella fijada; permiso de Pablo, 14-10) | pendiente | sí |
| J3 | Chat y bocadillos de texto sobre los avatares, con nombres | pendiente | sí |
| J4 | Interacciones: puerta, botón y objeto que se coge, igual en escritorio, móvil y VR | pendiente | sí |
| J5 | Libro de misiones, mapa y minimapa con marcadores | pendiente | sí |
| N1 | Entrada táctil, gamepad, cámara en 3.ª persona y pantalla completa (de `docs/JUGADOR.md`) | pendiente | sí |
| N2 | Menú de ajustes y accesibilidad básica, guardado local (de `docs/JUGADOR.md`) | pendiente | sí |
| V3 | Voz propia del motor: cola con prioridades, se puede cortar, baja lo demás (la región `aria-live` ya existe, V1) | pendiente | sí |
| V4 | Lista HTML de lo cercano (escritorio y móvil) que leen NVDA, VoiceOver y TalkBack, navegable con teclado | pendiente | sí |
| V5 | «¿Dónde estoy / qué hay cerca / dónde está X / quién hay?» contestado desde los datos, sin modelo | espera a V3 | sí |
| V6 | Audio espacial que sigue a la cabeza + volumen aparte para avisos + modo mono + baliza simple (un sonido fijo en el destino) | pendiente | sí |
| V7 | Comodidad y seguridad: limitador de destellos (≤ 3/s), modo sentado, «menos movimiento» del sistema; giro a saltos y viñeta ya en J6 | pendiente | sí |
| F1 | Amigos, bloqueo, moderación y roles (toca red y guardado; de `docs/JUGADOR.md`) | para Opus | no |
| F2 | Portales entre instancias y grupo (toca red e instancias; de `docs/JUGADOR.md`) | para Opus | no |
| A1 | Página de multitud (50/200/1.000/2.000 robots, completos vs horneados) | pendiente | sí |
| D1 | Puerta de tipos: TypeScript 7 estricto, 0 errores | pendiente | sí |
| S3 | Dilatación de tiempo cuando el tick no cabe (4.000 bots) | para Opus | no |
| P4 | Agentes como jugadores v1: SDK con verbos y observación textual | para Opus | no |
| A2 | Banco de multitud con la GPU real (si Chromium la usa sin pantalla) | pendiente | sí |
| A3 | Normales horneadas en la animación de textura (luz correcta al girar) | pendiente | sí |
| A4 | Robots en la plaza: cercanos completos, lejanos horneados | pendiente | sí |
| B3 | Telemetría en el visor: p99 de cuadro y cuadros perdidos | hecho (dentro de T1; sin probar en un visor real → X1) | sí |
| D2 | Puerta de tamaño del cliente (≤ 300 kB comprimido) | pendiente | sí |
| D3 | Fuzz de todos los decodificadores de red | pendiente | sí |
| D4 | Los mensajes del núcleo (entrada, snapshot, bienvenida) salen del esquema, como ya los de las funciones (J7) | para Opus | no |
| M16 | Carga de zonas: manifiesto por zona (arranque / fondo / perezoso), sha256 por fichero, caché del navegador por hash | pendiente | sí |
| O2 | Origen de reserva fuera de Cloudflare: el cliente prueba una lista de orígenes (LaLiga bloquea rangos de Cloudflare en España) | espera a M16 | sí |
| M21 | Ingesta de contenido: glTF → validar presupuestos y licencia → comprimir (colisionadores sin cuantizar) → publicar por hash | espera a M16 | sí |
| M23 | CLI completa: `check`, `shot`, `diff-shot`, `replay` (ya hay `run` y `describe`) | pendiente | sí |
| M25 | Imágenes de referencia en los dos backends (WebGPU y WebGL2), fuera de las puertas por defecto | pendiente | sí |
| V10 | Avisos de personas: quién se acerca, quién habla, quién me mira, con tope en multitudes | espera a V3 | sí |
| V11 | Baja visión: contraste por función, contornos en lo importante, lupa, texto a 200 % (coste medido) | pendiente | sí |
| V14 | Página compañera accesible: el móvil o el PC muestra lo que pasa en las gafas (chat, avisos, lista) | espera a V4 | sí |
| M18 | Medios: vídeo en pantallas del mundo sincronizado con el reloj del servidor (función J7) | pendiente | sí |
| V8 | Perfil de accesibilidad en la identidad, aplicado antes del primer fotograma en cualquier aparato | espera a I1 | sí |
| P5 | Habitante IA en la plaza con las reglas de Procyon y STD-050 (política en código, `<material>`, verbos del catálogo) | espera a P4 | sí |
| V12 | Guía IA: un agente que acompaña, describe y lleva (primero desde datos) | espera a P5 | sí |
| M6 | Física: Rapier determinista en WASM y controlador de personaje compartido (cambia la huella) | para Opus | no |
| M10 | Servidor de instancia completo: regiones en hilos (horizonte de 5.000) y copias cuando se llena | para Opus | no |
| V9 | Mapa de caminos (navmesh) en el servidor + guía paso a paso + «mírame al objetivo» + escáner direccional | para Opus | no |
| M19 | Formato de app: carpeta de texto (`app.json` + `main.ts` + activos por hash) → paquete glTF con `NUM_app` | para Opus | no |
| M20 | Scripts de mundo en el servidor, en sandbox (SES) y con límite de CPU | para Opus | no |
| M9 | WebTransport como escalón de arriba detrás de la misma interfaz que WebSocket | para Opus | no |
| M22 | Estudio en el navegador: mover, rotar, propiedades, deshacer; produce un PR, no toca el servidor | espera a M19 | sí |
| M26 | Servidor MCP del motor: leer zona, proponer cambio, abrir PR (nunca publica solo) | espera a M19, P4 | sí |
| O4 | Seguridad: billete firmado para entrar a una instancia, tope de conexiones por IP, exportar y borrar lo tuyo | espera a I1, S4 | sí |
| O3 | Observabilidad: panel y alertas sobre `/metrics` del servidor real | espera a X3 | sí |
| M17 | Voz por cercanía (LiveKit) con tope de voces audibles, DTX y modo escenario | necesita aprobación (Pablo: cuántas voces a la vez, `docs/SABER.md` §5) | no |
| V13 | Subtítulos del chat de voz (con quién habla y desde dónde) + texto que habla | espera a M17 | sí |
| X1 | Probar en Quest 3 y Pico 4 | pendiente | no |
| X2 | Probar Safari de verdad (iPhone o Mac) | pendiente | no |
| X3 | Montarlo en un servidor pequeño real y medir sus límites (con Pablo, 15-10) | pendiente | no |
| X4 | Nombre del motor (Pablo y Christian, 15-10) | pendiente | no |
| X5 | Medir temperatura y batería en un Android real (`adb`) | pendiente | no |
| I2 | Vincular el móvil con el ordenador o el visor (el ordenador enseña un QR, el móvil lo escanea) | necesita aprobación (Pablo, 15-10: de momento no) | no |
| V2 | Con Pablo, 15 min con las gafas: ¿funcionan `speechSynthesis`, el reconocimiento de voz, «menos movimiento» y la vibración dentro de una sesión inmersiva (Quest 3, Pico 4) y en iPhone? | pendiente | no |
| W1 | La plaza de entrada: primer mundo, al presupuesto de la Quest, con un portal a un mundo Hyperfy | necesita aprobación (Pablo: qué mundo lo estrena) | no |
| O5 | ADR y SYS del motor en la Summa (numinia.org) | necesita aprobación (Pablo) | no |

**Punto de parada «accesible» (como los PP de `CONSTRUIR.md`):** con V1, V3, V4, V5, V6 y V7 hechas, una
persona ciega entra en la plaza desde el ordenador con su lector de pantalla, pregunta qué hay cerca, sigue
una baliza hasta otra persona y la saluda; con baja visión, lo mismo en las gafas. Ahí se invita a las dos
ponentes de la Commit Conf a probarlo (`../mmo-browser-study/ACCESIBILIDAD-3D.md` §6).

**Lo que sabemos y por qué:** `docs/SABER.md` (decisiones, medidas, reglas, preguntas abiertas). Léelo antes
de diseñar una fila.

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
**Hecho 15-10:** `packages/render/src/power.ts` + bucle de `apps/plaza/main.ts` + `docs/MOVIL-FRIO.md`. Falta medir temperatura/batería en un Android real (protocolo en el doc).
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
esta cola lo construye (o una fila nueva). `docs/EXTENDER.md` (la receta para añadir una función) ya
no es de J0: la escribe J7 junto con el código. Fuentes:
`../mmo-browser-study/FUNCIONALIDADES.md` y lo que hacen VRChat, Roblox, WoW/FFXIV, Hyperfy (citar
la URL si se consulta). **Hecho cuando:** existe el catálogo y la cola tiene una fila por cada
pieza de nivel Base que falte; las filas nuevas que cambien el núcleo (red, simulación, formato) entran
como `para Opus`, y las que sean una función de juego, como `espera a J7`.

### J7 — Módulos de juego (flexible: "que sea muy fácil implementar algo nuevo")
Una API `defineFeature({ id, components, messages, server, client, panels })`: una función nueva se
añade en su propia carpeta sin tocar el núcleo. Ejemplo real hecho con ella: gestos (saludar / bailar
con una tecla) que viajan por la red y se ven en la otra pestaña. **Hecho cuando:** test sin pantalla
del ejemplo; quitar el módulo no rompe nada; `docs/EXTENDER.md` usa el ejemplo. J3, J4 y J5 se
construyen después como módulos.
**Para Opus (15-10):** incluye `docs/EXTENDER.md`; se diseña junto con D4 (los mensajes de cada función
se declaran con esquema) y pensando en P4 (cada función declara sus verbos y un agente los recibe sin
código extra). Al cerrarla, J3, J4 y J5 pasan a `pendiente`.
**Lo que añade la realidad cruzada (15-10):** una función puede registrar rutas HTTP propias (la URL
que abre un QR) y tener estado guardado (con S4). El primer módulo real después de los gestos es R1.
**Hecho (15-10, sesión con Opus).** Paquete `packages/feature` (capa entre `net` y `client`/`instance`):
`defineFeature` (declaración solo de datos: intentos = verbos, eventos, estado por clave; campos por
esquema, con dos tipos nuevos en `schema`: `enum` y `text`), catálogo JSON que cada cliente recibe al
entrar (lo que un agente lee como verbos; `npm run describe -- --catalogo`), códec que sale del esquema
(`writeFields`/`readFields` en `net`), `ServerRuntime` dentro de la instancia (validación, límite de ritmo
por jugador e intento, cola hasta el tick, alcance `to`/`near`/`all`, estado replicado a todos y al que
llega tarde, rutas HTTP en el puerto de la instancia, fallos aislados) y `ClientRuntime` dentro de la
sesión (acciones = tecla o botón táctil, `view.label`/`bounce`, registro de eventos). Formato aditivo:
mensajes 6 CATALOG, 7 FEATURE, 8 STATE, solo si el servidor corre funciones; sin funciones la red es
idéntica. Las funciones viven en `features/<id>/` (solo pueden importar `core`, `schema`, `feature`; lo
comprueba `tools/layers.mjs`), y entran por dos listas (`features/servidor.ts`, `features/cliente.ts`).
Ejemplo: `features/gestos` (G saluda, H baila; alcance 30 m). Receta: `docs/EXTENDER.md`. Medido: 12
pruebas nuevas (42 en total; antes 30); puertas en verde (tick p99 8,5 y 8,7 ms en dos pasadas en la
plaza de 1.000, que corre sin funciones; antes 7,7–8,5; 25,0 kbit/s); e2e chromium, firefox y https: la
pestaña B camina hasta ~25 m de A, A pulsa G, las dos ven el texto. La simulación no cambia: la huella
fijada pasa y la prueba de gestos da la misma huella con y sin funciones. Límites nuevos en `limits.json`
y `docs/FICHA-TECNICA.md`. Sin hacer (otras filas): estado por cercanía y objetos (J9), guardar (S4),
identidad (I1), rutas públicas `/e/` en el proxy de casa y en Caddy (R1).

### J1 — Avatares VRM de verdad
`@pixiv/three-vrm` 3.5.5 (MIT, versión exacta). 2–3 VRM CC0 con la licencia comprobada dentro del
propio fichero (metadatos VRM) y en su fuente (candidato: 100Avatars de Polygonal Mind), cada uno con
su nota de licencia; animaciones CC0 (candidato: Universal Animation Library de Quaternius —
comprobar) reasignadas al esqueleto humanoide: quieto, andar, correr. En la plaza: tu avatar y los
cercanos en VRM (como mucho 12 en móvil, 25 en visor, 60 en escritorio, `LIMITES` §3), el resto
como hoy; rechazar avatares de más de 10.000 triángulos. **Hecho cuando:** e2e chromium + firefox
cuenta avatares VRM cargados sin errores; peso de descarga por avatar medido y apuntado.
**Lo que ya sabemos (15-10, `docs/SABER.md` §3.4):** las animaciones salen de la colección «Movimientos»
(`../movimientos/`: todo CC0; un original → `.vrma` para este motor y `.glb` para Hyperfy; Mixamo y bases de
VRoid prohibidos). UAL1 de Quaternius (CC0, 45 clips, nombres de huesos estilo Unreal) ya se convirtió y
funciona (`../movimientos/conversion/`): rotación de mundo respecto a su propia pose T, caderas normalizadas.
Al cambiar de animación, **mantener la vieja hasta que cargue la nueva y entonces fundir** (si no, salta la
pose de reposo un cuadro). Cargar `.vrma` con `VRMAnimationLoaderPlugin` de three-vrm. Los cinco gestos que
pide el agente: saludar, asentir, negar, pensar, señalar — los gestos de `features/gestos` pasan a usar clips
cuando existan.

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
Botón "Entrar en VR" solo si `navigator.xr.isSessionSupported('immersive-vr')` (la AR es J8);
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

### X5 — Móvil real en modo depuración
Pablo conectará en algún momento un móvil viejo por USB en modo depuración: entonces `adb` (temperatura y
batería, `docs/MOVIL-FRIO.md`) y la depuración remota de Chrome (`adb forward` + CDP) para medir de verdad.
Hasta entonces se aprende de las sesiones reales (T1).

### A2, A3, A4, B3, D2, D3, D4
Ver su línea en la cola. B2: el emulador IWER (Meta, MIT) se inyecta en Playwright para simular una
Quest 3; comprobar licencia y versión antes de instalar.

**P1 hecho (15-10):** `limits.json` (`numinia-engine/limits@1`; lista plana de `limits` con eje/ámbito/clave/valor/unidad/estado + `features`), `docs/FICHA-TECNICA.md` y `test/limits.test.ts` (esquema, sin duplicados, mismas claves en A–D, cada `measured` apunta a un archivo que existe, cada `estimated` lleva fuente). Medido: tick, kbit/s, memoria, conexión, e2e Chromium/Firefox; estimado: tabla A–D, VPS-1/2, voz. WebKit sin probar.

## Realidad cruzada: la calle (AR) y el mundo digital (VR) juntos (Pablo, 15-10)

Diseño completo, fuentes y reglas: `../mmo-browser-study/REALIDAD-CRUZADA.md`. Las mecánicas concretas
(Semilla, Célula) son de la ciudad; el motor pone las piezas: puntos de enlace, reclamaciones que decide
el servidor, efectos, inventario, persistencia, sesión AR. Reglas que valen para todas: GPS solo para
zonas (≥ 30 m), nunca para colocar; la posición se manda solo al reclamar un punto y no se guarda; la
cámara no sale del aparato; AR y cámara a ráfagas (≤ 90 s); todo lo que usa cámara, GPS o WebXR exige
HTTPS (B1); cada mecánica tiene versión plana para iPhone y ordenador.

### T1 — Cómo entra cada jugador (hecho, 15-10)
**Por qué (Pablo, 15-10):** «cuando monte la máquina y me meta con el móvil, captura la información de la
sesión: ahí es donde aprenderás más; igual con las gafas; distingue cómo entra cada jugador en el mundo».
**Hecho:** la página manda al servidor un mensaje nuevo REPORT (tipo 9, JSON ≤ 1.000 bytes, aditivo):
`entrada` una vez tras el primer cuadro (clase visor/móvil/tableta/escritorio, modelo si el navegador lo dice,
sistema, navegador, UA, backend y GPU, núcleos, memoria, pantalla, XR posible, red, batería, preferencias del
sistema, tiempos hasta la bienvenida y el primer cuadro, huella igual), `pulso` cada 10 s (modo plano/VR/AR,
cuadro p50/p99/peor, cuadros perdidos frente al objetivo del momento, Hz de la XR, coste por cuadro, escala de
resolución, modo batería, ping, correcciones, visibles, pestaña oculta, batería, errores, memoria), `xr` al
entrar, salir o fallar (con el motivo) y `error` (los 5 primeros). `packages/server/src/sesiones.ts` solo
guarda las claves que conoce, en `SESIONES_DIR/sesiones-<día UTC>.jsonl` (una línea por informe, 14 días, sin
IP ni identidad; una conexión que nunca informa —robots— no escribe nada), y al cerrar escribe `sale` con la
duración. `GET /sesiones` (como `/metrics`, nunca publicado por Caddy) da quién está dentro y su último pulso;
`npm run sesiones` lo cuenta para personas (un bloque por sesión + resumen por aparato y navegador). El
instalador crea `/var/lib/numinia-motor/sesiones` (`StateDirectory`). Nombrar el aparato por el UA vale aquí
porque es solo un informe: el comportamiento sigue decidiéndose por capacidad.
**Medido:** 8 pruebas nuevas; e2e chromium, firefox y https comprueban que las dos pestañas mandan `entrada` y
`pulso` con su backend; el emulador IWER aparece como «visor · Quest Browser 33.0».
**Falta:** datos de aparatos reales (lo dará el X3: Pablo entra con su móvil y las gafas). Más adelante, Pablo
conectará un móvil viejo en modo depuración (X5) para pruebas serias con `adb`.

### I1 — Identidad de invitado (para Opus)
**Pablo (15-10): vincular el móvil con el ordenador «de momento no»** → esa parte pasa a I2 (aparcada); I1 es
solo la identidad de invitado guardada en el aparato.
Hoy el motor no sabe quién es nadie. La Semilla y la Célula necesitan una identidad de invitado (sin
cuenta) guardada en el aparato y **vincular** el móvil con el ordenador o el visor (el ordenador enseña un
QR, el móvil lo escanea) para que lo que haga el móvil cuente para la misma persona. Tokens firmados con
caducidad; ningún dato personal.

### S4 — Persistencia mínima del mundo (para Opus)
Hoy todo vive en memoria y se pierde al reiniciar. Guardar: puntos de enlace, inventarios, cosas plantadas
o dejadas, y quién reclamó qué y cuándo (sin coordenadas). Decidir formato (SQLite de Node, JSON o
registro de eventos), cómo convive con la simulación determinista y cómo se prueba (reinicio sin pérdida).
**Hecho (15-10, sesión con Opus). Decisiones:** (1) **la simulación nunca se guarda**: los avatares son de
paso; se guarda lo de las funciones, que vive fuera de la huella, así que el determinismo no se toca.
(2) **Ficheros de texto, no SQLite**: por función, `DATOS_DIR/<id>.json` (foto) + `<id>.jsonl` (cambios desde
la foto, uno por línea); un agente o una persona los lee con `cat`; sin dependencias (`node:sqlite` aún es
experimental en Node 24). Al cargar: foto + diario; una línea cortada por un apagón se salta; pasado
`COMPACT_AT` (1.000) líneas, el diario se pliega en una foto nueva (`.tmp` + renombrar). Se escribe cada
segundo y al cerrar (SIGTERM): un apagón pierde ≤ 1 s; un reinicio normal, nada. (3) **Declarado**:
`state.persist: true` guarda el estado compartido (y vuelve antes de que entre nadie, comprobado contra el
esquema de hoy: lo que ya no cabe se descarta y se dice); `store: { describe }` da `api.store` (solo servidor,
nunca a las páginas; JSON ≤ 4.096 bytes por clave, ≤ 10.000 claves). El almacenamiento lo da el servidor
(`packages/server/src/datos.ts`, `FileStorage`) por la interfaz `FeatureStorage`; sin carpeta, todo en memoria
y la función lo avisa. `despertar` guarda cuándo se despertó cada punto y cuántas veces. Falta: «quién»
(necesita I1), copias de seguridad (las hace quien administra la máquina, carpeta `/var/lib/numinia-motor/datos`)
y migraciones con código (hoy: lo que no cabe en el esquema nuevo se descarta).

### J8 — AR de verdad (Pablo, 15-10: «la AR me interesa muchísimo»)
Botón «Entrar en AR» solo si `navigator.xr.isSessionSupported('immersive-ar')` (Android Chrome con
ARCore, Quest 3, Pico 4); en iPhone no hay WebXR: no sale y se juega en plano. Sesión `immersive-ar` con
fondo transparente, `hit-test` para el suelo, retícula, tocar o gatillo para colocar un objeto, `anchors`
para que se quede quieto, `dom-overlay` en Android para el HUD. Los ejemplos de AR de three r186 son solo
para `WebGLRenderer`: leer `src/renderers/common/XRManager.js` (el nuestro es `WebGPURenderer`, backend
WebGL2 en XR) antes de escribir. La sesión se cierra sola a los 90 s (móvil frío). **Hecho cuando:** e2e
con el emulador IWER (MIT) si emula AR — comprobarlo; si no, decirlo y dejar escrita la prueba a mano para
Pablo (necesita B1); la página no da errores cuando no existe `navigator.xr`.

**J8 hecho (15-10):** `packages/render/src/ar.ts` (`arSupported`, `createAR`: sesión `immersive-ar` con `hit-test`, `anchors`/`dom-overlay` opcionales, retícula, tocar/gatillo coloca un cubo, se cierra a los 90 s) y botón «Entrar en AR» que solo aparece si el aparato lo soporta. `tools/e2e-ar.mjs` (dentro de `tools/auto.sh e2e`): sin WebXR no hay botón ni errores; con IWER 2.6.0 (MIT, devDependency exacta) haciendo de Quest 3 con un suelo falso: entra → «ready» → gatillo → «placed» → cierre automático (con `?armax=6000`) → «off», 0 errores. Límites del emulador: su capa base tiene framebuffer nulo (el test lo parchea) y el hit-test es un suelo inventado, así que **no prueba** que el vídeo de la cámara se vea detrás ni que los anclajes aguanten. Prueba a mano (necesita `npm run dev:lan` por https): Android Chrome con ARCore y Quest 3: abrir la página, «Entrar en AR», mover el aparato hasta ver el aro, tocar, comprobar que el cubo se queda quieto. Pendiente para otra fila: sincronizar el objeto colocado con los demás, pintar avatares en AR.

### R1 — Despertar (primera prueba de realidad cruzada)
Módulo hecho con J7: `enlaces.json` con esquema (id, nombre, zona y posición en la plaza, efecto, reglas);
cada punto tiene una URL firmada `GET /e/<token>` que contesta con una página corta («Has despertado la
fuente: mírala en la plaza») y suelta un evento en la instancia; la plaza muestra el efecto (columna de
luz y texto) unos 10 s para todos. `npm run enlaces -- qr` imprime los QR (SVG) con la URL de la red de
casa; opción para que el servidor escuche en la red de casa (hoy solo en 127.0.0.1). **Hecho cuando:**
e2e: una petición a un código válido hace aparecer el efecto en una pestaña sin pantalla; un código falso
o repetido no hace nada; medido el tiempo del escaneo al efecto.
**Ojo (J7, 15-10):** el código va en `features/despertar/` con `api.route("GET", "/e/:token", …)` y
`api.emit(…, "all")` (receta: `docs/EXTENDER.md`). Hoy, desde fuera, a la instancia solo llega `/ws` (y
`/health` en un servidor instalado): en casa lo pasa el proxy de `apps/plaza/vite.config.mjs` (modo LAN) y
en un servidor instalado, Caddy (`deploy/instalar-motor.plantilla.sh`). R1 añade `/e/` en los dos sitios,
nunca `/metrics` (se queda en 127.0.0.1). El secreto que firma los tokens va en una variable de entorno,
nunca en el repositorio.

**R1, trozo 1 hecho (15-10, turno):** `features/despertar/` (declaración, tokens, servidor, cliente, `enlaces.json` con 2 puntos). `GET /e/<id>.<firma>`: firma = HMAC-SHA256 con el secreto del servidor (`MOTOR_SECRET`, 16+ caracteres; el motor lo da a las funciones como `api.sign(texto)`, porque una función no puede importar `node:crypto`). Token falso o sin secreto → 404 sin efecto; token válido → un evento `despertado` a todos y página «Has despertado…»; mientras dura el efecto (`ms`), un segundo escaneo no repite. Página: `view.beacon` (opcional en `ViewHooks`) pinta columna de luz + texto. `npm run enlaces -- <base>` imprime las URLs firmadas. Proxy `/e` en modo LAN (`vite.config.mjs`) y en Caddy; el instalador crea `$PREFIX/secreto.env` una vez (root, 600) y lo carga el servicio. Medido: escaneo → efecto en la página 4 ms (WebSocket local); 51 pruebas en verde (4 nuevas); e2e verde.
**Falta de R1:** imprimir los QR como SVG (hace falta un codificador QR: escribirlo o dependencia MIT exacta); opción para que el servidor escuche en la red de casa; comprobar en un navegador real que la columna se dibuja (hoy solo se prueba el evento sin pantalla; `beaconCount()` en render permite hacerlo en e2e); medir el tiempo con un móvil real.

### R2 — Semilla del Conocimiento
El punto hace una pregunta que solo se responde estando allí; la respuesta la fija el DJ (un agente puede
redactar la pregunta desde la ficha `.md` del sitio, nunca decidir si se acierta). Acierto → Semilla en
el inventario de la persona (I1); en el mundo digital se planta, crece con el tiempo real y los demás la
ven (S4). Base: Semillas del Conocimiento del manual (`lore/game/manual/es/06-inventario-y-bestiario.md`).
**Hecho cuando:** e2e: responder bien en una pestaña-móvil hace aparecer la semilla en la pestaña-ordenador
vinculada (sin I2, que está aparcada: en la misma pestaña o desde otra con la misma identidad); después de
reiniciar el servidor sigue plantada.

### R3 — Célula del Prisma + herramienta del DJ
Página para directores de juego: soltar un punto en el mapa (zona de 30–50 m), elegir la prueba final (QR
escondido o pregunta), imprimir el QR y esconder una Célula en su hueco digital. En el móvil, el mapa
avisa «algo late en esta zona»; al llegar se hace la prueba; quien la encuentra se la lleva y en el mundo
se ve quién fue. **Hecho cuando:** e2e con geolocalización simulada (Playwright) dentro y fuera de la zona.

### R4 — Caza de invisibles (homenaje a Invizimals)
Momento de cámara de ≤ 60 s: el color dominante, la luz, la hora y el tiempo real deciden qué aparece;
pitido de frío/caliente; se captura con el cuerpo (soplar al micrófono, agitar, tapar la cámara). En
Android y Quest se posa en el suelo (J8); en iPhone, dibujada sobre el vídeo. Lo capturado aparece en el
mundo digital. Todo se analiza en el aparato. **Hecho cuando:** e2e con la cámara falsa de Chromium
(`--use-fake-device-for-media-stream` + vídeo de un color) hace aparecer la criatura que toca.
**Intento guardado (15-10):** el turno de las 11:30 empezó R4 (`features/invisibles/` con `regla.ts`, cliente,
servidor y `test/invisibles.test.ts`) y se cortó a las 11:47 por un reinicio del gateway, sin pasar las
puertas. Está en `git stash list` de la copia `auto` («turno 11:30: R4 sin terminar»): el próximo turno que
coja R4 lo mira con `git stash show -p stash@{0}`, lo recupera con `git stash pop` si le sirve, y lo
termina o lo descarta diciéndolo en el diario.

## Accesibilidad (V) — de `../mmo-browser-study/ACCESIBILIDAD-3D.md` (15-10)

Reglas que valen para todas las filas V (y para cualquier función nueva): `docs/SABER.md` §3.6. La idea
central: **una sola ficha `accesible` por cosa del mundo** alimenta el lector de pantalla, la voz propia del
motor y a los agentes de IA. Lo que no se ha medido en un aparato real se dice (V2).

### V1 — Ficha accesible y reglas de las funciones (para Opus)
Componente con esquema `accesible`: `nombre` (texto corto que se dice), `funcion` (enum: puerta, botón,
persona, cartel, objeto, lugar, salida…), `estado` (texto o enum), `descripcion` (≤ 140 caracteres),
`importancia` (0–3), `sonido` (id), `acciones` (ids de verbos del catálogo). Casi todo es **dato fijo**: viaja
con el contenido y el catálogo, no en cada tick (coste de red ≈ 0); lo que cambia va por el estado de las
funciones (J7). En `defineFeature`: cada intento lleva nombre hablado y al menos una forma sin gesto; cada
evento que se ve lleva sonido y cada sonido, texto. Si falta, la función **no se registra** y el error dice
qué falta. `npm run describe -- --catalogo` enseña las fichas (un agente las lee igual). **Hecho cuando:**
`features/gestos` y `features/despertar` cumplen; una función sin nombre hablado falla en un test con un
mensaje que dice cómo arreglarlo; huella sin cambios.
**Hecho (15-10, sesión con Opus).** En `packages/feature`: `ROLES`, `SOUNDS`, `Importance`; intentos con
`spoken` (obligatorio), eventos con `announce` (`{ text con {campo}, sound, importance, at | who }`) o `"silent"`
(obligatorio), `state.card` (`role`, `name`, `description`, `importance`, `sound`, `actions`, `at`); los huecos
`{campo}` se comprueban contra los campos; `state.set` con `at` sin ficha se niega. El catálogo lleva todo eso
(un agente lee lo mismo que un lector de pantalla). En el cliente: `features.announcements`, `view.announce`,
`features.cards()`, `fillTemplate`. La plaza tiene dos regiones `aria-live` (educada y urgente) donde cae cada
anuncio. `gestos` («Gesto: saludar», suave, sobre quien lo hace) y `despertar` (su texto, magia, importancia 2,
en su punto) cumplen. Diferencia con el plan: la ficha no es un componente de la simulación sino parte de la
declaración de cada función (dato fijo en el catálogo + estado con ficha): coste de red por tick 0 y la huella
no cambia. Las personas (avatares) tendrán su ficha cuando haya nombres (J3) y la usarán V4/V5.

### V3 — Voz propia del motor
Cola con prioridades (aviso de seguridad > respuesta a una pregunta > descripción > ambiente), se puede
cortar con una tecla o botón, baja el resto del audio mientras habla. En plano, además, una región
`aria-live` para que el lector del sistema lo diga. Motor de voz: `speechSynthesis` del navegador donde
exista (V2 dice si existe dentro de las gafas); si no, texto en el panel. **Hecho cuando:** test sin pantalla
de la cola (prioridad, cortar) y e2e: un evento con ficha llega a la región `aria-live`.

### V4 — Lista HTML de lo cercano (el «gemelo HTML»)
Una lista invisible a la vista y visible para el lector, con lo que el área de interés ya eligió, recortada
a 30–50 cosas por importancia y distancia; cada entrada: nombre, distancia, lado («a tu izquierda»), y sus
acciones como botones de verdad. Navegable con teclado (Tab, flechas) y sin trampas de foco. Referencia:
el «HTML twin» de Babylon.js. **Hecho cuando:** e2e chromium + firefox: el árbol de accesibilidad
(`locator.ariaSnapshot()` de Playwright) lista a la otra pestaña por su nombre y el botón «Saludar» funciona con
teclado.

### V5 — Preguntas desde los datos
Cuatro órdenes (tecla, botón y, donde exista, voz): ¿dónde estoy? (zona y lo más importante), ¿qué hay
cerca? (las 5 cosas más importantes con distancia y lado), ¿dónde está X? (dirección y distancia, en
relativo: «a 12 m, delante a la derecha»), ¿quién hay? (personas cerca). Sin LLM: todo sale de las fichas y
de las posiciones. **Hecho cuando:** test sin pantalla con un mundo fijo da las respuestas exactas.

### V6 — Audio espacial y baliza simple
Fuentes posicionales (Web Audio `PannerNode` HRTF) que siguen a la cabeza en VR; tope de 16–32 fuentes,
las de accesibilidad primero; volumen aparte para avisos; modo mono (para quien oye por un solo oído). La
baliza simple: un sonido que se repite en el destino elegido (una persona, una salida); el guiado paso a paso
es V9. Móvil frío: sin audio cuando la pestaña está oculta. **Hecho cuando:** test de la mezcla (tope,
prioridad, mono) y e2e sin errores con la baliza activa.

### V7 — Comodidad y seguridad
Limitador de destellos (≤ 3 por segundo, WCAG 2.3.1) en efectos como la columna de `despertar`; modo
sentado (altura ajustable en VR); leer `prefers-reduced-motion` y `prefers-contrast` del sistema y aplicarlos
**antes del primer cuadro**; nada se mueve solo con «menos movimiento». Giro a saltos y viñeta ya existen (J6).
**Hecho cuando:** test del limitador; e2e con `reducedMotion: 'reduce'` emulado sin animaciones automáticas.

### V8 — Perfil de accesibilidad en la identidad (espera a I1)
Los ajustes de V3–V11 van con la persona (identidad de I1), no con el aparato; se aplican antes del primer
cuadro en el móvil, el PC o las gafas; la primera vez se rellenan con lo que dice el sistema.

### V9 — Caminos, guía, «mírame al objetivo» y escáner (para Opus)
Mapa de caminos (navmesh) generado en el servidor para cada zona; guía paso a paso que suena en la próxima
esquina; una tecla que gira la vista hacia el objetivo (The Last of Us II, God of War); escáner direccional
(mueves el stick o la cabeza y oyes qué hay en esa dirección: NavStick). Andar solo hasta un punto genera
entradas normales: la predicción no cambia. Decidir dónde vive el navmesh (¿sim o funciones?) y si toca la
huella.

### V10 — Avisos de personas (espera a V3)
Quién se acerca (entra en 2–3 m), quién habla, quién me mira (VRBubble, señales no verbales); con tope en
multitudes (agrupar: «cinco personas a tu izquierda»). Burbuja de espacio personal de ~1,2 m opcional.

### V11 — Baja visión
Contraste por función (aliados, objetos, salidas pintados con colores fijos y el escenario apagado, como
TLOU2), contornos en lo importante, lupa (×2–×10), texto de los paneles escalable a 200 %, subtítulos de
32 caracteres × 2 líneas. Cuesta GPU en gafas: **medir** en el banco de cuadro antes de prometerlo en Quest.

### V12 — Guía IA (espera a P5)
Un agente que acompaña, describe y lleva: primero desde los datos (V5), luego un LLM que razona sobre esos
datos (sin píxeles, no inventa objetos), y solo al final un modelo que mira la imagen, marcado como IA.

### V13 — Subtítulos de voz (espera a M17)
Transcripción una vez por quien habla, en el servidor, solo si cerca hay alguien con subtítulos; nombre de
quien habla y flecha si está fuera de la vista; quien habla ve que hay subtítulos activos. Texto que habla
para quien no puede hablar. Coste: ~0,7–1,7 céntimos por minuto de quien habla.

### V14 — Página compañera (espera a V4)
El móvil o el PC, vinculados (I1), muestran en HTML accesible lo que pasa en las gafas: chat, avisos, lista
de lo cercano, tienda. Así una persona usa su lector o su línea braille mientras otra lleva las gafas. Solo
es posible porque somos web.

### V2 — Prueba en aparatos (con Pablo)
Quince minutos: en Quest 3 y Pico 4, dentro de una sesión inmersiva (`npm run dev:lan`), ¿habla
`speechSynthesis`? ¿escucha el reconocimiento de voz? ¿llega «menos movimiento»? ¿vibran los mandos? En
iPhone: Safari no vibra desde la web. El resultado va a `docs/SABER.md` §2 y decide V3.

### N2 — Menú de ajustes (lo que añade la accesibilidad)
Los menús, la tienda, la cuenta y el chat son **HTML de verdad**, no dibujos en el lienzo (los lee el lector
y lo exige la ley para servicios al público: RD 193/2023). Lee las preferencias del sistema antes del primer
cuadro (V7). Guarda en local hasta que exista I1 (V8).

### F2 — Grupos (lo que decidió `PREGUNTAS.md` #19)
La pieza ahora, la pantalla después: un grupo es un id compartido que el servidor conoce; a los de tu grupo
los ves siempre aunque la plaza esté llena (prioridad en el área de interés), cruzan un portal juntos
(reserva de plaza conjunta) y tienen su canal de chat y voz.

## Lo que faltaba de `CONSTRUIR.md` (piezas M, O, W, 15-10)

Mismos números que en `../mmo-browser-study/CONSTRUIR.md` para poder seguirlos. Las piezas de la ciudad
(C1–C8: cuentas, Postgres, roles de la casa, la interfaz de Numinia) no son del motor y no entran aquí.

### M16 — Carga de zonas
Manifiesto JSON con esquema por zona: cada fichero con su sha256, tamaño, clase (`arranque` para jugar,
`fondo` justo después, `perezoso` al acercarse) y orígenes. El cliente descarga por clases, comprueba el
hash, guarda en la caché del navegador (Cache API u OPFS) por hash y no vuelve a bajar lo que ya tiene.
Trozos con Brotli desde una CDN, nunca desde el VPS del juego. **Hecho cuando:** e2e: segunda carga de la
zona sin descargas (todo de caché); un fichero con hash falso se rechaza; tiempo hasta jugar medido.

### O2 — Origen de reserva (espera a M16)
El manifiesto lista varios orígenes; si el primero no contesta en ~3 s (o da error), el cliente usa el
siguiente y lo recuerda un rato. El segundo origen real (fuera de Cloudflare) lo monta Pablo. **Hecho
cuando:** e2e con el primer origen caído carga la zona desde el segundo.

### M21 — Ingesta de contenido (espera a M16)
Herramienta de línea de órdenes: glTF/GLB → validar (triángulos, draw calls, texturas, tamaño por zona del
nivel B: `limits.json`), exigir licencia por fichero (CC0/CC-BY/propia) y por VRM (sus campos de licencia),
aceptar los sufijos de colisión de Hyperfy y convertirlos en datos de física, **colisionadores sin
cuantizar**, comprimir (gltfpack/meshopt, KTX2), escribir el manifiesto de M16. Rechaza lo que se pasa, con
un error que dice cuánto sobra. **Hecho cuando:** tests con tres ficheros de prueba (uno bueno, uno que se
pasa, uno sin licencia).

### M23 — CLI completa
`check` (valida esquemas, manifiestos y licencias de una carpeta), `shot` (captura sin pantalla desde una
cámara con nombre), `diff-shot` (compara con una imagen de referencia y da el porcentaje distinto),
`replay` (reproduce una grabación de entradas y comprueba la huella). Ya existen `run` y `describe`.

### M25 — Imágenes de referencia
La plaza con semilla fija, capturada en WebGPU y en WebGL2 (GL por software) desde 3 cámaras; `diff-shot`
contra las guardadas con un umbral. Fuera de las puertas por defecto (cuesta segundos y CPU): entra en
`tools/auto.sh e2e`.

### M18 — Medios (función J7)
Pantalla de vídeo en el mundo; la reproducción sigue el reloj del servidor (todos ven el mismo segundo);
solo se reproduce si está cerca y a la vista (móvil frío).

### P5 — Habitante IA en la plaza (espera a P4)
Lo que enseñó el agente de Hyperfy (`../procyon-hyp/`, `docs/SABER.md` §3.5) llevado al motor: un cerebro
que es otro servicio y entra con el SDK de P4; contesta solo si lo llaman (nombre o `/p`); órdenes cortas
decididas en código; prioridad de quien administra; presencia por teletransporte; responde en JSON con los
verbos del catálogo J7, validado en código; el texto no fiable va en un bloque `<material>` vallado, nunca en
las instrucciones (STD-050); lee la ficha `.md` del sitio y las fichas `accesible` (V1); dice que es una IA.
Sin LLM en las pruebas: cerebro de eco. **Hecho cuando:** test sin pantalla: le hablan por su nombre, se
presenta delante, contesta con un gesto de la lista y descarta uno inventado; un texto con «SISTEMA:» dentro
del material no cambia sus instrucciones.

### M6 — Física (para Opus)
Rapier determinista (`rapier3d-deterministic-compat` de dimforge, 0.21.0 comprobada el 14-10, Apache-2.0;
versión exacta) en el
servidor y en el cliente dentro de la simulación compartida; controlador de personaje (suelo, pendientes,
escalones); colisionadores desde M21. Cambia la huella: versión de formato nueva. Medir el coste por tick con
1.000 personas antes de decidir (¿física para todos o solo cápsulas?).

### M10 — Servidor de instancia completo (para Opus)
Regiones en `worker_threads` (una sola hebra se rompe entre 3.000 y 4.000), traspaso entre regiones sin
saltos, y copias de la instancia cuando se llena (con grupos que entran juntos, F2). Junto con S3
(dilatación).

### M19 — Formato de app (para Opus)
La unidad de contenido decidida en `EVALUACION-MOTORES-2026.md` §3.4: carpeta `app.json` (con `schema` y
versión, nombre, licencia, modelo por hash, propiedades y eventos con esquema, dependencias, ficha
`accesible`) + `main.ts` tipado contra la API pública + `assets/<sha256>` + `README.md`; `build` produce el
paquete de entrega (glTF con la extensión `NUM_app`, o zip firmado) que nunca se edita. Migraciones
automáticas entre versiones. Leer antes `notes/16-content-unit-hyp-vs-alternatives.md` y `16a`.

### M20 — Scripts de mundo (para Opus)
`main.ts` de cada app corre en el servidor, en un compartimento SES (clases congeladas) con tope de CPU por
tick y de memoria; solo ve la API pública (la de J7 ampliada). `KHR_interactivity` como escalón sin código
cuando three o nosotros lo lean.

### M9 — WebTransport (para Opus)
Mismo esquema de mensajes, transporte por HTTP/3 con datagramas para los snapshots. No hay servidor de
producción en JavaScript: decidir entre un proxy (Caddy/quic-go) o un servicio aparte; el transporte doble de
Hytopia (MIT) es lo más aprovechable. UDP 443 abierto en el servidor.

### M22 — Estudio (espera a M19)
Editar en el navegador: mover, rotar, escalar, propiedades por esquema, deshacer. Guarda cambios de la
carpeta de M19 y produce un PR; nunca toca el servidor en marcha. Cantera: `oncyberio/awe` (MIT).

### M26 — MCP del motor (espera a M19 y P4)
Tres herramientas: leer una zona (como `describe`), proponer un cambio de manifiesto, abrir un PR. Nunca
publica sola: la etapa de autonomía la abre Pablo (`docs/SABER.md` §5).

### O4 — Seguridad (espera a I1 y S4)
Billete firmado y con caducidad para entrar a una instancia (de I1); tope de conexiones por IP y de mensajes
por segundo; sin grabar voz; exportar y borrar lo tuyo. Lo legal (consentimiento a los 16) lo confirma Pablo.

### O3 — Observabilidad (espera a X3)
Con los números del servidor real: un panel (lo mínimo: una página que lee `/metrics` por el túnel) y avisos
cuando el p99 del tick, el steal o la memoria pasan de su umbral (`puertas.ts`).

### M17 — Voz por cercanía (necesita aprobación)
LiveKit (Apache-2.0); suscripción solo a las N voces más cercanas (N lo decide Pablo), DTX, modo escenario
para eventos grandes (una voz para todos). Es el coste que manda a escala (`docs/SABER.md` §3.1).

### W1 — La plaza de entrada (necesita aprobación)
El primer mundo, al presupuesto de la Quest (`limits.json`, nivel B), con un portal a un mundo Hyperfy de
hoy. Qué mundo lo estrena es pregunta abierta de Pablo.

### O5 — El motor en la Summa (necesita aprobación)
Un ADR y un SYS del motor en numinia.org, cuando Pablo lo diga (rama, PR y revisores según sus reglas).

