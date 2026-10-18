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

## Otras formas de leer el servidor

`GET /metrics.prom` da los mismos números en el formato de texto de Prometheus (nombres con unidades base y `_total` en los contadores, como pide su guía de nombres), para Grafana o cualquier recolector. Sigue sin ser público: Caddy solo expone `/ws` y `/health`.

## Tamaño de la página: lo que baja antes de dibujar (D2)

**Una sola cifra: 451,5 kB gz (451.457 bytes) en 11 ficheros, medida el 18-10-2026 a las 15:06 UTC en `30da0fd` (v0.10.0)
con `npm run gates` y `npm run tamano`** (PC de desarrollo: Ryzen 9 7950X, Node 24.21). Meta D2: 300 kB. Tope de la puerta: 480 kB
(`TOPE_GZ` en `tools/tamano.mjs`; se puso el 18-10 como la medida de entonces + 10 %). La puerta corre también en `npm run gates`.

Qué entra (y por eso la cifra es comparable de una medida a otra): `dist/plaza/index.html` y lo que ese HTML referencia antes de
ejecutar `main.ts`: la hoja `<link rel="stylesheet">`, el `<script type="module">` de entrada y cada `<link rel="modulepreload">`
(el grafo de imports estáticos que escribe Vite). Cada fichero se comprime solo con gzip nivel 9 (`node:zlib`). **No entra:** los
trozos perezosos (`import()`: avatares VRM, cielo, agua, gizmo, manos, pesca…), el transcodificador Basis (solo con texturas KTX2),
manifiesto y los ficheros del mundo (.glb, .vrm, .vrma).

**Lo que de verdad viaja es brotli, no gzip.** El propio motor comprime la página con brotli calidad 11 (`pagina.ts`) a quien lo
acepta, y Caddy lo pasa tal cual: desde fuera, `alchemiststower.numinia.com` respondió `content-encoding: br` en todos los ficheros
del arranque (18-10-2026 14:28 UTC, `curl -H 'Accept-Encoding: br, gzip'`, build `39a9f73`: 363,7 kB br). Los mismos 11 ficheros de
`30da0fd` en brotli 11 suman **376,3 kB** (`node:zlib`, uno a uno, 18-10 15:07 UTC). La puerta cuenta gzip -9 a propósito: es
~17 % más pesimista y vale para un navegador o un proxy que no pida brotli.

| Fichero (`30da0fd`) | gz -9 |
|---|---|
| `three.tsl` | 189,6 kB |
| `index` (entrada) | 103,3 kB |
| `three.core` | 68,5 kB |
| `src` (paquetes del motor) | 46,4 kB |
| `escribiendo` | 10,3 kB |
| `client` | 10,2 kB |
| `iconos` (nuevo en v0.10.0) | 9,1 kB |
| `index.css` | 7,1 kB |
| `index.html` | 4,3 kB |
| `gltf` | 1,9 kB |
| `calidad` | 0,8 kB |
| **Total** | **451,5 kB** |

Cifras anteriores, con su versión: 434,9 kB en 10 ficheros (18-10, `5362797`), 437,2 kB (`39a9f73`, el build del mundo vivo) y
442,7 kB (`d76d71a`, v0.9.0), estas dos con la misma regla en la medida del 18-10 entre las 14:28 y las 14:59 UTC. Históricas y no comparables (contaban otros
ficheros): 342 kB (15-10, solo los .js del arranque de entonces), 423,3 kB (18-10, diseño M6: sin html ni css, gzip por defecto de
Vite). Desde hoy manda esta sección.

## Pruebas unitarias: cuántas y cuánto tardan

La cuenta no se copia aquí: la imprime `npm run gates` en cada pasada (fila «pruebas unitarias», sacada de la línea `ℹ pass N`
del reporter de `node --test`, no de un grep). Para tener una referencia: **625 en verde, 26,2 s**, el 18-10-2026 a las 15:06 UTC
en `30da0fd`, Ryzen 9 7950X con carga 2,7. La cifra de cada turno del RUNLOG es la de su rama en su momento.

## Reglas del método

1. Calentamiento descartado (el JIT y la ráfaga de conexión); 10 s o 1 s por cada 100 robots, lo que sea mayor.
2. Se juzga por la **mediana de las ventanas**, no por la peor; en un PC en calma aparece un pico suelto de 40–60 ms en ~1 de cada 10 ventanas, con o sin ajustes.
3. Cada informe lleva el entorno de la máquina del servidor y la de los robots (procesador, núcleos, núcleo Linux, Node, versión del motor).
4. Percentiles y no medias; histogramas (1 % de precisión) y no listas de muestras, para poder fusionar procesos.
5. Un cambio de ajuste (BBR, núcleos…) se mide con la misma pasada antes y después.
6. Cada cifra que se escribe en un documento o en `limits.json` lleva **fecha, versión (commit), aparato y orden**. Si la pasada
   no dejó informe guardado, se escribe «sin informe guardado» y la fila de `limits.json` queda como `estimated`, nunca `measured`.
   Una constante del código (20 Hz, un snapshot cada 2 ticks) es `config`: un ajuste no es una medida.
7. Una cifra se nombra por la prueba que la da: la plaza de 1.000 **sin red** (`npm run gates`, ~8–9 ms) y **por WebSocket**
   (`tools/swarm.sh`) son dos pruebas distintas y no se mezclan; el «p99» de la puerta, con 80 ticks, es el peor de 80.
