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

## Reglas del método

1. Calentamiento descartado (el JIT y la ráfaga de conexión); 10 s o 1 s por cada 100 robots, lo que sea mayor.
2. Se juzga por la **mediana de las ventanas**, no por la peor; en un PC en calma aparece un pico suelto de 40–60 ms en ~1 de cada 10 ventanas, con o sin ajustes.
3. Cada informe lleva el entorno de la máquina del servidor y la de los robots (procesador, núcleos, núcleo Linux, Node, versión del motor).
4. Percentiles y no medias; histogramas (1 % de precisión) y no listas de muestras, para poder fusionar procesos.
5. Un cambio de ajuste (BBR, núcleos…) se mide con la misma pasada antes y después.
