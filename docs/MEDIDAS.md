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
| Espera de CPU % | tiempo que el hilo principal estuvo listo pero otro proceso tenía el núcleo (`/proc/thread-self/schedstat`, solo Linux; `/metrics.prom`: `numinia_mainthread_cpu_wait_*`) | el steal no lo ve en una máquina compartida: con espera > 2 % (como el steal) los ticks lentos son de la máquina, no del motor (D3) |
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

## El banco con las piezas puestas (`bench --escena piezas`, C3)

**Por qué.** La escena de siempre es una plaza plana y vacía: mide el corazón del motor (simulación, área de interés y fotos)
y nada más. Un mundo de verdad tiene sólidos, una malla de colisión (M6), cable, temporizadores, objetos, movedores y
cerraduras, y además todas las funciones de la casa. `--escena piezas` carga ese mundo, siempre igual, y lo mide con el
**mismo método** `bench@2` (rondas, calentamiento fuera, tick con y sin envío, ciclo, p99 de todas las rondas juntas). La escena
de siempre sigue por defecto y no cambia: misma huella (`e1fe4763` con 1.000 personas en `0ea08ce`).

`node packages/server/src/bench.ts --escena piezas [--sin solidos,malla,cable,contadores,objetos,movedores,cerradura]`

**El mundo** (`packages/server/src/bench-piezas.ts`, todo determinista): las 1.000 personas de siempre; **todas** las funciones
de la casa (`features/servidor.ts` pasadas por `conMundo`, como el servidor); 200 cajas sólidas; una malla de terreno de
80 × 80 m y 7.200 triángulos que construye la `construirMalla` real del servidor a partir de un .glb generado; 20 zonas del
cable (que mueven un movedor, muestran u ocultan un objeto o suenan); 10 contadores (6 cuentas atrás y 2 relojes en marcha,
2 marcadores); 300 objetos (las 200 cajas, el terreno y 99 de decorado); 12 movedores (10 de vaivén, 2 que mueve el cable);
5 cerraduras. Objetos, contadores en marcha y cerraduras llegan como lo guardado (S4) de un mundo que se reinicia.

**Qué añade a la salida** (además de todo lo de `bench@2`, con `escena: "piezas"` y su propia `huella`):

| Campo | Qué es |
|---|---|
| `costePorTickMs` | ms por tick de cada pieza (media de los ticks medidos, mediana de las rondas): cable, contadores, objetos, movedores, cerradura, «otras de la casa», «motor» (lo que queda del tick: simulación con cajas y malla, lista de sólidos, fotos) y «entre ticks» |
| `porFuncion` | lo mismo por cada función de la casa, por su id, con mediana, mínimo, máximo y dispersión de las rondas |
| `metricas.entreTicks*`, `poblaciones.entreTicks` | lo que el hilo del servidor gasta **entre dos ticks**: ahí se rehace la malla (una promesa, fuera del tick) |
| `cambiosDeEstadoPorSegundo`, `mallaPedidaPorSegundo` | cuántas veces cambia el estado compartido (cada cambio rehace la lista de sólidos en el tick siguiente) y cuántas se pide rehacer la malla |

**Cómo se reparte el coste por pieza.** Cada gancho que registra una función (`on`, `onTick`, `onJoin`, `onLeave`,
`onIdentify`, `listen`, `onVuelta`) lleva un cronómetro de tiempo **exclusivo**: si el cable oye a un contador dentro del
gancho del contador, ese rato se le cuenta al cable y no dos veces. Lo que no pasa por un gancho (la simulación pisando cajas
y malla) no tiene cronómetro propio: se saca **por diferencia** con `--sin`. Los cronómetros de B2 (`fasesTickMs`, `piezas.<id>`
de `/metrics`) no estaban aún en el tren; cuando entren, esta escena puede leerlos en vez de los suyos.

**Comprobado** (Ryzen 9 7950X, Node 24.21, `0ea08ce` = tren `motor-2026-10-18-5`, 18-10-2026 16:34–16:36 UTC, carga 1,5–5,1;
1.000 personas, 5 rondas × 400 ticks medidos; **sin** el candado `.medir.lock`: lo tuvo cogido más de 25 min un proceso que no
medía y la máquina estaba en calma):

| Escena | ciclo p50 (100 ms de juego) | tick con envío p50 | tick sin envío p50 | entre ticks p50 | margen del ciclo | huella |
|---|---|---|---|---|---|---|
| plaza (por defecto), dos pasadas | 7,65 · 7,51 ms | 7,44 · 7,28 ms | 0,20 · 0,22 ms | — | ×13,1 · ×13,3 | `e1fe4763` |
| **piezas**, dos pasadas | **19,89 · 20,07 ms** | 13,81 · 13,94 ms | 6,04 · 6,07 ms | 1,12 · 1,14 ms | ×5,0 · ×5,0 | `f58d19cb` |
| piezas `--sin malla` | 15,85 ms | 11,62 ms | 4,27 ms | 0,01 ms | ×6,3 | `929cd9d0` |
| piezas `--sin solidos` | 18,75 ms | 13,26 ms | 5,33 ms | 1,20 ms | ×5,3 | `4b9b5029` |
| piezas `--sin solidos,malla` | 14,28 ms | 10,84 ms | 3,42 ms | 0,01 ms | ×7,0 | `637d1054` |

Dispersión entre rondas del 1,5–3,8 % en todas; p99 de verdad del tick con envío 17,2 ms con piezas (8,5 ms en la plaza).

**La cifra:** con las piezas puestas, el ciclo cuesta **2,6 veces** lo de la plaza (≈ 20 ms frente a ≈ 7,6 ms por cada 100 ms de
juego) y el margen baja de ×13 a ×5. El tick sin envío, que en la plaza casi no cuesta (0,2 ms), pasa a 6 ms: con piezas ya no
hay tick barato. De dónde salen los ~12,4 ms de más por ciclo (dos ticks):

| Pieza | ms por ciclo | Cómo se sabe |
|---|---|---|
| malla de 7.200 triángulos (simulación pisándola) | ≈ 4,1 | diferencia con `--sin malla`; además ≈ 2,2 ms por ciclo **entre ticks** rehaciéndola |
| cable (20 zonas × 1.000 personas cada tick) | ≈ 3,1 | cronómetro (1,57 ms por tick) |
| otras de la casa (casi todo `chat`: ≈ 1,1 ms por tick con 1.000) | ≈ 2,2 | cronómetro; también está en cualquier mundo real y la plaza no lo veía |
| 200 cajas sólidas | ≈ 1,3 | diferencia con `--sin solidos` |
| movedores (12) | ≈ 0,6 | cronómetro |
| contadores (10), objetos (300), cerraduras (5) | ≈ 0,1 · < 0,02 · 0 | cronómetro: sin gancho por tick, solo cuando alguien hace algo |
| el resto (fotos con el estado de las funciones, lista de sólidos al cambiar el mundo) | ≈ 1 | lo que no cuadra con lo anterior |

Dos cosas que solo se ven con esta escena: el estado compartido cambia **~71 veces por segundo** (contadores una vez por
segundo, movedores cinco, cable al entrar en una zona) y la instancia pide rehacer la malla entera **~16 veces por segundo**
(en cuanto cambia cualquier cosa, aunque no sea un objeto con malla), ≈ 1,1 ms de hilo por tick fuera del tick. Arreglarlo
(rehacer la malla solo cuando cambia un objeto `malla`) es otra historia; esta solo lo mide.

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
