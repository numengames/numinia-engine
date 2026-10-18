# Medidas: qué se mide, cómo se lanza y cómo se lee

Para quien monta el motor en una máquina y quiere saber **cuánta gente aguanta** y **si el número es de fiar**.
La versión citada, con las normas y métodos en que se apoya, está en el archivo de Numinia (estudio del 15-10-2026).

## Cuatro pruebas, de más barata a más cara

| Qué | Comando | Dura | Para qué |
|---|---|---|---|
| **Banco de CPU** (`bench`) | `npm run bench` (o `node packages/server/src/bench.ts`) | ~15 s | Cuánto tarda **un núcleo de esta máquina** en el trabajo real del motor (una plaza de 1.000 dentro de una instancia, sin red). Dos máquinas con el mismo índice llevan la misma gente. Se pasa en cada máquina candidata **antes** de la prueba de carga. |
| **Escalera** | `tools/swarm.sh --url wss://… --metrics http://localhost:18790/metrics --pasos 100,300,600,1000` | ~1 min por nivel | Prueba de **punto de ruptura**: sube la gente por niveles y para en el primero que no pasa. Da el **límite medido**. |
| **Remojo** | `tools/swarm.sh --url … --metrics … --n 500 --remojo 30` | 30–60 min | Prueba de **resistencia**: carga constante; mira si la memoria sube (fuga) y si el tick se degrada con las horas. |
| **Tormenta** | `tools/swarm.sh --url … --metrics … --n 500 --tormenta 3 --retener 10` | ~1 min | Prueba de **pico**: todos entran a la vez, se quedan, se van todos y vuelven a entrar. Mide tiempo de conexión y fallos. |

`--en-servidor` en lugar de `--url`/`--metrics` lanza los robots en la propia máquina (no es el número bueno: compiten por la CPU).
Las métricas del servidor no son públicas: desde casa, `ssh -N -L 18790:127.0.0.1:8790 usuario@IP` y `--metrics http://localhost:18790/metrics`.
Cada orden escribe un informe `informes/AAAA-MM-DD-HH-MM-<etiqueta>.json` (para máquinas) y `.md` (para personas). `--etiqueta nombre` lo bautiza.

## Qué hay en cada informe

**Del servidor** (`GET /metrics`, ventanas de ~10 s; el enjambre usa la **mediana** de las ventanas posteriores al calentamiento y también guarda la peor):

| Columna | Qué es | Por qué |
|---|---|---|
| Tick p50 / p99 | duración de un tick. **El p50 es el tick barato** (sin snapshot); manda el p99 (el tick con snapshot) | duración |
| Respuesta p99 | retraso de arranque **más** duración: cuándo estuvo listo el tick contando desde cuándo tocaba | si el bucle se atrasa, la duración sola miente |
| Bucle ocupado | utilización del bucle de eventos, 0–1 (Node `eventLoopUtilization`) | saturación del hilo único |
| CPU proceso % | del proceso, en % de **un** núcleo | utilización |
| CPU máquina / steal % | CPU ocupada de toda la máquina y tiempo que el hipervisor se llevó (`/proc/stat`) | steal > 2 % = la medida es de los vecinos |
| RSS MB | memoria residente | utilización |
| kbit/s por persona | salida media por conectado | tráfico |

**De los robots** (cada robot es un cliente que mide lo que sentiría un jugador; los histogramas de todos los procesos se fusionan):

| Columna | Qué es |
|---|---|
| RTT p50 / p99 | ida y vuelta de un PING (uno por robot y segundo): incluye red, Caddy y la cola del bucle del servidor |
| Hueco snapshots p99 | tiempo entre dos snapshots seguidos que recibe un robot (nominal 100 ms) |
| Jitter | variación de ese hueco frente a lo que marcaba el servidor (estimador de la RFC 3550 §6.4.1) |
| Fallos / caídas | conexiones que no abrieron / que se cortaron durante la prueba |
| (en el .json) tiempo de conexión, tiempo hasta el primer snapshot, snapshots saltados y tardíos | |

## Cuándo pasa un nivel (`packages/server/src/puertas.ts`)

Pasa si: **tick p99 ≤ 25 ms**, **respuesta p99 ≤ 50 ms**, 0 fallos, 0 caídas, ≥ 99 % conectaron, 0 rechazadas por «instancia llena» **y** la medida es fiable:
**steal ≤ 2 %** y los robots no están saturados (bucle de los robots p99 ≤ 20 ms y CPU ≤ 85 % por proceso). Si la medida no es fiable el veredicto es **NO FIABLE**, no «no pasa»: se repite con otra máquina de robots.
Los umbrales son de la casa; los que tengan fuente externa la citan en el estudio. Para el RTT y los huecos no hay umbral todavía: primero se mide.

## El banco de CPU por dentro (`bench@2`) y cómo comparar dos pasadas

**Por qué cambió (B1, 18-10-2026).** El motor hace dos clases de tick: uno de cada dos **envía** la foto del mundo a cada
persona (~7,3 ms con 1.000) y el otro no (~0,2 ms). `bench@1` sacaba un solo p50 de las dos clases mezcladas, y la mitad
justa caía en la frontera entre ellas: con `--ticks 400` decía 7,1 ms y margen ×7,0; con `--ticks 401`, **0,5 ms y margen ×94**.
`bench@2` mide cada clase por separado y además el **ciclo** completo (los dos ticks de un periodo de foto = 100 ms de juego).
Qué tick envía lo dice la propia instancia, así que ni `--ticks` ni `--warmup` pueden moverlo.

**Qué sale** (una línea JSON por la salida normal; un resumen para personas por la de errores):

| Campo | Qué es |
|---|---|
| `tickP50Ms`, `margenSobreElTick` | el **índice**: p50 del tick **con envío** (mediana de las rondas) y cuántas veces cabe en los 50 ms del tick. Mismos nombres que en `bench@1` |
| `margenSobreElCiclo` | cuántas veces cabe el ciclo típico en sus 100 ms (≈ el doble del anterior: el tick sin envío casi no cuesta) |
| `tickP99Ms`, `poblaciones.*.p99` | p99 **de verdad**: todas las rondas juntas, 1.000 ticks con envío por defecto, así que 10 quedan por encima. Con menos de 1.000 el banco avisa (`p99Fiable: false`) |
| `metricas.*` | ciclo, tick con envío y tick sin envío, p50 y p99: **mediana, mínimo, máximo y dispersión** (desviación típica ÷ mediana) de las rondas |
| `entorno` | además de procesador, núcleos, Linux y Node: versión y commit del motor, carga media, núcleos permitidos y gobernador de la CPU |
| `fiable`, `avisos` | «NO FIABLE» si la carga media pasa de la mitad de los núcleos o si las rondas no acaban con la misma huella |

Por defecto: 1.000 personas, 5 rondas de 460 ticks con los 60 primeros fuera (~10 s). `rondasP50`, `peorMs` y `huella` siguen.

**Comprobado** (Ryzen 9 7950X, Node 24.21, `30da0fd`, con otras sesiones midiendo: carga 9–18, 18-10-2026 15:07–15:19 UTC,
`flock work/motor-rendimiento/.medir.lock node packages/server/src/bench.ts --ticks N`):

| Orden | `bench@1` índice / margen | `bench@2` índice / margen | `bench@2` ciclo |
|---|---|---|---|
| `--ticks 400` (dos veces) | 7,10 · 7,05 ms / ×7,0 | 7,23 · 7,28 ms / ×6,9 | 7,45 · 7,47 ms |
| `--ticks 401` (dos veces) | **0,53 · 0,43 ms / ×94 · ×116** | 7,34 · 7,15 ms / ×6,8 · ×7,0 | 7,55 · 7,35 ms |
| por defecto · `--ticks 461` · `--warmup 61` | — | 7,35 · 7,30 · 7,38 ms | 7,55 · 7,51 · 7,60 ms |

Entre 400 y 401 el índice nuevo se mueve un 1,5–1,8 %, menos que entre dos pasadas iguales. La dispersión del p50 entre rondas
fue del 0,7–3,5 %; la del p99 por ronda, del 3–92 % (por eso el p99 bueno es el de todas las rondas juntas).

**Comparar con una línea base:** `node tools/banco-comparar.mjs base.json nuevo.json` (dos salidas guardadas de `npm run bench`,
misma máquina). Por cada métrica da base, nuevo, cambio en %, **«se ve desde»** (el menor cambio que esas dos pasadas pueden
distinguir del ruido: 3 errores típicos de la diferencia, sacados de la dispersión de las rondas) y un veredicto: **EMPEORA** si
sube más del 10 % (`--umbral`) y además más que el ruido; **ruido** si sube más del 10 % pero la dispersión no deja afirmarlo
(más rondas, `--rounds 9`, o una máquina más tranquila); **igual** o **mejora**. Sale con **1 si algo empeora**, 0 si no, y 2 si
no se pueden comparar: otro esquema (un `bench@1` hay que volver a medirlo), otras personas o ticks, otra **huella** (la escena
cambió) u otro aparato; `--forzar` compara igual cuando eso es lo que se quiere. Con 5 rondas el p50 distingue un 2 % y el p99
casi nunca (76–96 %): un empeoramiento del p99 se confirma con el enjambre, no con el banco.
Ejemplo real: dos pasadas iguales → todo «igual», salida 0; 1.100 personas frente a 1.000 (`--forzar`) → tick con envío +11 %,
ciclo +11,3 %, «EMPEORA», salida 1. Para medir la base de un commit antiguo con este banco: copia este `bench.ts` a su árbol.

## Sesiones reales: cómo entra cada jugador (T1)

Cada página cuenta al servidor con qué entró (aparato, navegador, gráfica, XR, tiempos hasta jugar) y, cada
10 s, cómo le va (cuadro p50/p99, cuadros perdidos, Hz de la XR, ping, batería, errores). Se guarda una
línea por informe en `SESIONES_DIR/sesiones-<día UTC>.jsonl` (en casa, `informes/sesiones/`; en el servidor,
`/var/lib/numinia-motor/sesiones/`), 14 días, sin IP ni identidad.
- `npm run sesiones` — un bloque por sesión y un resumen por aparato y navegador (`-- --dias 7`, o un fichero).
- `npm run sesiones -- --url http://localhost:18790` — quién está dentro ahora (por el túnel, como `/metrics`).
- `curl -s localhost:8790/sesiones` — lo mismo en JSON.
Un número de aparato real vale más que uno emulado: cuando una sesión real contradiga `limits.json`, se
corrige allí (y en `docs/SABER.md` §2) con la fecha y el aparato.

Qué quiere decir cada cifra del pulso (`packages/render/src/sesion.ts`, `medidorDeCuadros`). El intervalo de un
cuadro es el tiempo entre dos dibujos; el objetivo es el de ese momento (la política de energía lo baja cuando
nadie se mueve: menos cuadros con la plaza quieta no es lentitud; en VR, los Hz del visor):
- **Perdido**: intervalo > 1,5 × el periodo objetivo (a 60 fps, > 25 ms).
- **Largo** (`largos`): perdido **y** > 50 ms (el umbral de los Long Animation Frames del W3C). Es el tirón que se
  nota; un cuadro espaciado a propósito (8-12 fps en reposo) no cuenta.
- **Congelación** (`congelado {n, ms, peor}`): intervalo ≥ 1 s con la página visible. **No** entra en `cuadroMs` ni
  en `perdidos` (siguen como antes, comparables con los pulsos viejos), se cuenta aparte. No es congelación el hueco
  tras ocultar la pestaña, cuando el navegador congela la página (`freeze`, `pagehide`) o al entrar/salir de VR.
  Ojo: en VR, quitarse el visor o abrir el menú del sistema también para los cuadros, y la página aún no lo
  distingue (el render no expone el `visibilityState` de la sesión XR): mira `modo` antes de culpar al motor.
- `dc {p50, peor}` y `kTri {p50, peor}`: draw calls y miles de triángulos por cuadro en la ventana
  (`view.lastFrame()`, contadores de three).
- `cambiosRes` y `ratio`: cuántas veces cambió la resolución (`view.power.pixelRatio()`: escala automática, calidad o
  resolución elegidas) y la de ahora. Cada cambio redimensiona el lienzo (0,1-0,4 s de hilo, `CLIENTE-PERFIL`).
- `programas` y `programasNuevos`: programas de shader vivos y los que aparecieron en la ventana. **Hoy no llegan**:
  `view.lastFrame()` no da `programs` (`renderer.info.memory.programs`); en cuanto lo dé, salen solos.
- `loaf {n, bloqMs, peorMs}`: Long Animation Frames del navegador (solo Chromium: Quest Browser, Chrome Android):
  cuántos cuadros de más de 50 ms, la suma de su `blockingDuration` y el más largo. Si no aparece, el navegador no
  lo mide (no quiere decir «ninguno»).
La línea `sale` añade `cliente {pulsos, congelaciones, congeladoMs, congeladoPeorMs, largos, cambiosRes, loaf,
programasMax}` sumado de toda la sesión, y `GET /sesiones` da lo mismo en `resumen.cliente` para los que están
dentro (más `sesionesConCongelacion`). Tamaño del pulso: 325-331 bytes antes y 458-507 después en la plaza
(headless); el peor caso posible, con todos los campos y las cifras más anchas, **610 de 1.000** (`REPORT_MAX`),
comprobado en `test/sesiones.test.ts`.

## Otras formas de leer el servidor

`GET /metrics.prom` da los mismos números en el formato de texto de Prometheus (nombres con unidades base y `_total` en los contadores, como pide su guía de nombres), para Grafana o cualquier recolector. Sigue sin ser público: Caddy solo expone `/ws` y `/health`.

## Tamaño de la página: lo que baja antes de dibujar (D2)

**Una sola cifra: 434,9 kB gz (434.850 bytes), medida el 18-10-2026 en `5362797` con `npm run tamano`.** Meta D2: 300 kB. Tope
de la puerta hoy: 480 kB (la medida + 10 %, redondeado; `TOPE_GZ` en `tools/tamano.mjs`). La puerta corre también en `npm run gates`.

Qué entra (y por eso la cifra es comparable de una medida a otra): `dist/plaza/index.html` y lo que ese HTML referencia antes de
ejecutar `main.ts`: la hoja `<link rel="stylesheet">`, el `<script type="module">` de entrada y cada `<link rel="modulepreload">`
(el grafo de imports estáticos que escribe Vite). Cada fichero se comprime solo con gzip nivel 9 (`node:zlib`), como lo serviría el
servidor web (Caddy sirve gzip/zstd, no brotli). **No entra:** los trozos perezosos (`import()`: avatares VRM, cielo, agua, gizmo,
manos, pesca…), el transcodificador Basis (solo con texturas KTX2), iconos, manifiesto y los ficheros del mundo (.glb, .vrm, .vrma).

| Fichero | gz -9 |
|---|---|
| `three.tsl` | 189,6 kB |
| `index` (entrada) | 98,2 kB |
| `three.core` | 68,5 kB |
| `src` (paquetes del motor) | 45,5 kB |
| `client` | 10,2 kB |
| `escribiendo` | 10,0 kB |
| `index.css` | 6,2 kB |
| `index.html` | 3,9 kB |
| `gltf` | 1,9 kB |
| `calidad` | 0,8 kB |
| **Total** | **434,9 kB** |

Cifras anteriores (históricas, no comparables entre sí porque cada una contaba ficheros distintos): 342 kB (15-10, solo los .js del
arranque de entonces), 423,3 kB (18-10, diseño M6: sin html ni css, gzip por defecto de Vite). Desde hoy manda esta sección.

## Pruebas unitarias: cuántas y cuánto tardan

**Una sola cifra: 537 pruebas, 537 en verde, 26,5 s** (`npm test` en `5362797`, 18-10-2026, Ryzen 9 7950X con carga 5; la cuenta
sale de la línea `ℹ tests N` del reporter de `node --test`, no de un grep). La cifra de cada turno del RUNLOG es la de su rama en su
momento; cuando una entrada diga otra cosa, manda la más nueva.

## Reglas del método

1. Calentamiento descartado (el JIT y la ráfaga de conexión); 10 s o 1 s por cada 100 robots, lo que sea mayor.
2. Se juzga por la **mediana de las ventanas**, no por la peor; en un PC en calma aparece un pico suelto de 40–60 ms en ~1 de cada 10 ventanas, con o sin ajustes.
3. Cada informe lleva el entorno de la máquina del servidor y la de los robots (procesador, núcleos, núcleo Linux, Node, versión del motor).
4. Percentiles y no medias; histogramas (1 % de precisión) y no listas de muestras, para poder fusionar procesos.
5. Un cambio de ajuste (BBR, núcleos…) se mide con la misma pasada antes y después.
