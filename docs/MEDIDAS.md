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

`GET /metrics.prom` da los mismos números en el formato de texto de Prometheus (nombres con unidades base y `_total` en los contadores, como pide su guía de nombres), para VictoriaMetrics, Prometheus o cualquier recolector. Si quien pregunta manda `Accept: application/openmetrics-text`, la respuesta es **OpenMetrics 1.0** (mismas cifras; las familias de contador sin `_total`, y termina en `# EOF`); si no, texto 0.0.4 como siempre. Sigue sin ser público: Caddy solo expone `/ws` y `/health`.

**Por qué va lento (B2).** `/metrics` (esquema `metrics@1`: todo lo nuevo se añade, nada cambia de nombre) dice dónde se va el tiempo de cada tick, en ms, sobre los mismos 200 ticks (10 s) que `tickMs`:

| Campo | Qué es |
|---|---|
| `fasesTickMs.<fase>` `{p50,p99,peor}` | cada fase de `Instance.tick()`: `entradas` (leer lo que mandó cada uno), `solidos` (rehacer las cajas sólidas, solo cuando una pieza cambia su estado), `simulacion` (el paso), `seguro` (el sitio seguro del suelo, cada medio segundo), `piezas` (todas las piezas juntas), `instantaneas` (lo que se manda, cada dos ticks) |
| `piezas.<id>` | una entrada por pieza que hace algo dentro del tick, **la más cara primero** (por el p99 de `totalMs`): `totalMs` (la suma de sus ganchos en un tick), `tickMs` (`onTick`), `intentMs` (sus `on(…)`), `vueltaMs` (`onVuelta`), `cercaMs` (mandar sus cosas a quien se acerca) y `errores` (desde el arranque; el log solo dice el primero de cada gancho) |
| `piezasTotales` | intenciones aceptadas, `descartados` (límite de ritmo), `malos` (mal formados) y errores de todas las piezas, desde el arranque |
| `proceso.bucleRealMs` | el retraso del bucle de eventos **de verdad**: `bucleMs` menos la resolución del muestreo (`bucleResolucionMs`, 10). cada muestra incluye la resolución (medido con Node 24 en el PC: un servidor sin nadie da `bucleMs.p50` 10,06 y `bucleRealMs.p50` 0,06; con `resolution: 1` el suelo pasa a 1 ms, no a 0, y despierta el proceso 1.000 veces por segundo en vez de 100). `bucleMs` se queda igual para no romper a quien lo lea: **los umbrales se leen sobre `bucleRealMs`** |
| `proceso.gcAcumulado` | pausas de GC y sus ms **desde el arranque** (nunca baja), y lo mismo por tipo (`minor`, `minor_mark_sweep`, `major`, `incremental`, `weakcb`). `proceso.gc` sigue siendo la ventana de 10 s |
| `memoriaBytes` | `memoriaMB` en bytes exactos (lo que usa `/metrics.prom`) |

En `/metrics.prom`, histogramas acumulados desde el arranque con **los mismos bordes fijos** (s): 0,0001 · 0,00025 · 0,0005 · 0,001 · 0,0025 · 0,005 · 0,01 · **0,025** (medio tick: el presupuesto del tick) · **0,05** (un tick: el de la respuesta) · 0,1 · 0,25 · 1. Se pueden sumar entre raspados y entre mundos (los percentiles no): `numinia_tick_seconds`, `numinia_tick_phase_seconds{phase}`, `numinia_feature_hook_seconds{feature,hook}` (`hook` = intent, tick, vuelta, cerca), `nodejs_gc_duration_seconds{kind}`. Contadores nuevos: `numinia_feature_errors_total{feature}`, `numinia_feature_intents_total{result}` (accepted, dropped, bad), `numinia_gc_pauses_total`. Cardinalidad: unas 50 parejas pieza-gancho en la plaza de serie, ~1.000 líneas y ~78 kB por raspado.

Tres arreglos de medida (los encontró R4, `HUECOS-METRICAS.md`):
- **`numinia_gc_pause_seconds_total` ya es un contador de verdad**: suma desde el arranque. Antes valía la última ventana de 10 s, subía y bajaba, y `rate()` lo habría leído como reinicios. La ventana sigue en `numinia_gc_pause_window_seconds` (gauge).
- **Bucle sin los 10 ms de serie**: `numinia_eventloop_delay_p99_seconds` y `_max_seconds` restan la resolución. `nodejs_eventloop_lag_p99_seconds` sigue igual (así lo da también prom-client) y su `# HELP` lo dice.
- **Nombres y unidades**: `process_resident_memory_bytes` y `nodejs_heap_size_used_bytes` son bytes exactos (antes MB redondeados × 1.048.576); `numinia_players` dice en su ayuda que cuenta personas **y** agentes; los percentiles en gauge (`numinia_tick_duration_p99_seconds`…) avisan en su ayuda de que no se pueden sumar y remiten al histograma.

Lo que cuestan los cronómetros: un `performance.now()` antes y después de cada fase y de cada gancho de pieza (31 por tick en la plaza de serie con 50 robots, ~40 ns cada uno ≈ 1,3 µs, **~0,5 % de un tick de 0,25 ms**), y 1,3–1,6 µs fuera del tick para guardarlo en las ventanas. `npm run bench` (1.000 personas, sin piezas) da la misma huella y p50 dentro del ruido (mediana de 4 pasadas alternas: 6,87 ms antes, 6,96 después, +1,4 %, con la máquina a carga 16–21); 50 robots locales por WebSocket: tick p50 0,68 → 0,64 ms (ruido).

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
