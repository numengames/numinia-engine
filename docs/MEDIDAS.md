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
**steal ≤ 2 %**, **espera de CPU ≤ 2 %** y los robots no están saturados (bucle de los robots p99 ≤ 20 ms y CPU ≤ 85 % por proceso). Si la medida no es fiable el veredicto es **NO FIABLE**, no «no pasa», y el informe entero lo dice arriba con el motivo: se repite con otra máquina de robots o con el servidor en un núcleo libre (`tools/swarm.sh` local lo pone en el 6 con prioridad normal, `SRV_CPUS`; los agentes usan el 2-5).
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
con `npm run gates` y `npm run tamano`** (PC de desarrollo: Ryzen 9 7950X, Node 24.21). Meta D2: 300 kB. Tope de la puerta: 1 MB
(`TOPE_GZ` en `tools/tamano.mjs`; decisión de Pablo 19-10, antes 480 kB = la medida + 10 %). La puerta corre también en `npm run gates`.
La rama `naturaleza/low-poly` llevaba la medida anterior (434,9 kB gz, 18-10, `5362797`) y el mismo tope de 1 MB (Pablo 18-10).

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

### Medida del 26-10-2026 por trozo (MIS-253, `resto/motor-b` sobre `origin/main` `2ea4b64f`)

`npm run tamano` dio **666,0 kB gz** antes de tocar nada (665.966 bytes, 28 ficheros: la página ha crecido de 451,5 a 666 kB desde el 18-10, sobre todo
`index` 103→222 kB: cada pieza nueva de la plaza entra en la entrada) y **661,7 kB** después (661.726 bytes, el mismo método). Sigue bajo el tope de 1 MB y sobre la meta de 300 kB. `npm run tamano:trozos` (`tools/tamano-trozos.mjs`) construye en una carpeta
aparte e imprime **todos** los trozos (arranque o perezoso, gz -9) y, con `--modulos=N`, los N módulos de fuente más grandes dentro de cada trozo de
arranque (bytes ya minificados: dicen de dónde viene el peso, no cuánto comprime).

Qué se cortó: el **trozo de VR** (`xr-menu` + `constructor-xr` + `condiciones-xr`, 9,3 kB gz) ya no baja en un ordenador o un móvil sin
gafas: `main.ts` lo pide solo cuando `view.vrSupported()` dice que sí; `__numinia.menuVR` y `.constructorVR` aparecen cuando llega.

Arranque tras el corte (suma de ficheros JS: 638,1 kB gz; los 12 mayores):

| Trozo | gz -9 |
|---|---|
| `index.js` | 196,6 kB |
| `three.tsl.js` | 190,7 kB |
| `src.js` | 76,9 kB |
| `three.core.js` | 69,1 kB |
| `gente-ia.js` | 16,1 kB |
| `paneles.js` | 13,2 kB |
| `src.js` | 10,7 kB |
| `escribiendo.js` | 9,8 kB |
| `inventario.js` | 5,0 kB |
| `voces.js` | 4,2 kB |
| `client.js` | 4,0 kB |
| `dardos.js` | 3,9 kB |

Perezosos más grandes (no entran en la cifra): 

| Trozo | gz -9 |
|---|---|
| `avatares-vrm.js` | 65,8 kB |
| `meshoptimizer.js` | 51,8 kB |
| `KTX2Loader.js` | 23,9 kB |
| `terreno.js` | 15,3 kB |
| `fauna.js` | 14,8 kB |
| `arboles.js` | 13,2 kB |
| `GLTFLoader.js` | 12,9 kB |
| `pesca.js` | 8,7 kB |

Lo que queda por cortar, de mayor a menor, leído con `--modulos` en `index` (222 kB gz; 58 kB de fuente solo `constructor.ts`): el **grupo del
constructor** (`constructor.ts` 58 k, `entorno.ts` 27 k, `cable.ts` 20 k, `foto.ts` 19 k: unos 30 kB gz, solo lo usa quien construye; hoy cuelgan de
`constructorUI.cajon(…)` y se leen desde `main.ts` al construirse, así que cortarlo es una refactorización, no un `import()`), `condiciones.ts` (32 k de
fuente; solo con la puerta de normas encendida, pero `ar-elegir.ts` y 19 pruebas de extremo a extremo lo leen en `__numinia.condiciones`), `voz.ts` y
`rueda.ts`. `three.tsl` (190,7 kB) y `three.core` (69,1 kB) no se pueden partir: es `three.webgpu.js` entero.

### Primera carga en el móvil: de 0,72 a 0,575 MB (t_45ef2f70, 26-10-2026)

Medida en la red de verdad, no en el HTML: Chromium headless (shell 1248, SwiftShader), perfil de móvil de N22 (412×915, DPR 2,625, CPU ×4, sin caché),
«4G lento» 1,6 Mb/s / 150 ms, servidor propio del motor (gzip/brotli como en vivo). Cifra = bytes por el cable de las respuestas terminadas antes de
`__numinia.informe.primerCuadroMs` (los bytes no dependen de la carga de la máquina; el tiempo sí: 2 vueltas por rama, dispersión < 0,1 s).

| Commit | Bytes hasta el primer cuadro | Primer cuadro |
|---|---|---|
| `dad2011c` (fin del 18-10) | 543 kB | 3,84 s |
| `83810091` (0.71.0, 26-10) | 720 kB | 4,59 s |
| 0.73.0 (primera pasada, con main) | 575 kB | 3,95 s |
| esta rama (0.78.0: constructor, mapa, ajustes y cajón Cable tras el primer cuadro) | 551 kB | 3,80 s |

**Qué subió.** No hay un commit culpable: el arranque fue creciendo con cada pieza nueva que `main.ts` monta antes de dibujar. Fichero a fichero
(gz -9 de la puerta, `dad2011c` → `83810091`): `index` 136 → 198 kB, `src` 54 → 81 kB, `gente-ia` 0 → 16 kB, `paneles` 0 → 13 kB, `index.css` 8 → 16 kB,
más ~25 trozos pequeños (inventario, voces, dardos, dados, ficha-objeto, condiciones…) que no existían. Además, antes del primer cuadro bajaban
**115 kB de fuentes** (Geist, Geist Mono: ya estaban el 18-10) y **25 kB de `sonidos.json`** (nuevo), que comparten el enlace con el código.

**Qué se hizo.** `apps/plaza/primer-cuadro.ts` (`alPrimerCuadro`) guarda lo que el primer cuadro no necesita y lo lanza cuando el bucle lo dibuja (o a los 15 s
si nunca se dibuja, pestaña oculta): las fuentes (`fuentes.ts`, ya no en `tema.css`; `font-display: swap` ya era la regla, así que se ve la letra
del sistema los primeros segundos), la tabla de sonidos, y el montaje de «Entorno», «Ficha del mundo», «Director», dados y burbujas, que ahora son
trozos perezosos (`import()`). Lo que no se movió: `three` (260 kB gz: no se puede) y el resto de `main.ts` (mapa, ajustes, constructor, gente, ficha…): cada
uno devuelve algo que otras piezas leen en el acto, y sacarlo es un cambio de arquitectura de la plaza, no un parche.

**Resultado y por qué no llega a 0,5 MB.** 0,57 MB / 3,9 s: de vuelta a +32 kB y +0,1 s sobre el 18-10. Lo que queda por encima de 0,5 MB son 75 kB de
funciones nuevas de la plaza (constructor 13 kB gz, mapa 7, ajustes 5,5, gente 5, foto 4, condiciones 4, ficha 4…) que hoy van dentro de la entrada. Pablo dio el
19-10 «hasta 1 MB sin problema» para el arranque; esta tarjeta no lo cambia. **Tope nuevo:** `first_load_br_bytes` en `limits.json`
(585.000 bytes brotli 11 de lo que el HTML pide antes de ejecutar `main.ts`: 557.271 hoy + 5 %), comprobado por `npm run tamano`, por la puerta de `npm run gates`
y por `test/tamano-primera-carga.test.ts`. Siguiente recorte, si se quiere llegar a 0,5: sacar de la entrada el constructor y su cajón (≈ 25 kB br) y «Gente»/«Tú» (≈ 20 kB).

**Segunda pasada (0.78.0, t_45ef2f70).** Hecho el recorte de arriba: el constructor (`constructor.ts`), el mapa (`mapa.ts`), la ventana de ajustes (`menu-ajustes-ui.ts`, lo que dibuja; el registro y lo que cada ajuste *hace* se queda en `menu-ajustes.ts`) y el cajón «Cable» (`cable.ts`) ya no van en la entrada: `main.ts` monta una **puerta** (`constructor-puerta.ts`, `mapa-puerta.ts`, `cable-puerta.ts`, `puerta.ts`) con el mismo objeto de siempre; lo que se le pide antes de que llegue el trozo se encola y se repite en orden cuando llega (después del primer cuadro, por `alPrimerCuadro`), y lo que pide una persona (Construir, C, M, «Ir», el engranaje) trae el trozo en el acto. El constructor sigue entregando los cuerpos de los cajones y la ranura de la ficha vacíos desde el principio y el real los adopta. Bytes hasta el primer cuadro: **575 → 551 kB**, primer cuadro 3,95 → 3,80 s (mismo perfil, 2 vueltas, dispersión < 0,01 MB); brotli de la puerta 557,3 → 529,4 kB; tope `first_load_br_bytes` 585.000 → 555.000. **No llega a 0,5 MB** (faltan ≈ 50 kB): `iconos` (10 kB) y `perfil-aparato` (9 kB) pasaron a trozos propios pero los siguen pidiendo piezas que se quedan en la entrada (no se ahorra nada), y lo que queda dentro de `index` son ~25 funciones de `features/` (≈ 30 kB), «Gente» (7 kB + `gente-ia` 14 kB que también usa `llamar-ia`), foto (4 kB; tiene la llegada por enlace al arrancar) y condiciones (4 kB; es la puerta de las normas, no se difiere sin pensarlo). Cada una es el mismo tipo de recorte, pero ninguna sola cierra los 50 kB.
Guion de la medida: `work/motor-vr/lotes/medidas-resto/medir-carga.mjs` (el mismo perfil) y el bisect por trozo del 26-10.

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

## Espacio base: la base es lo más ligero (B7)

Medido el 2026-10-21 con `tools/medir-base.mjs` (Chromium headless con swiftshader, 1280×720, mundo de prueba con
base semilla 42 y naturaleza 1234; carga del PC 4-9 → fiable; valen llamadas, triángulos, ms de JS y objetos, NO fps ni GPU).
Tres estados en la misma sesión, cambiando con los interruptores de la página; 180 cuadros cada uno tras 5 s de reposo.

| estado | draw calls | triángulos | ms JS/cuadro (mediana / p95) | objetos visibles | `actualizar` base ms/cuadro | `actualizar` naturaleza ms/cuadro |
|---|---|---|---|---|---|---|
| a · base + naturaleza | 22 | 48.722 | 0,8 / 1,0 | 164 (55 meshes, 3 líneas) | 0,002 | 0,053 |
| b · solo base (con relleno) | 16 | 27.717 | 0,6 / 0,8 | 154 (48 meshes, 3 líneas) | 0,006 | 0,005 |
| c · solo plano | 13 | 11.087 | 0,6 / 0,8 | 151 (46 meshes, 2 líneas) | 0,002 | 0,002 |

Lectura: la base cuesta **3 draw calls y 16.600 triángulos** (líneas 8.760, relleno 2 triángulos por celda, puntos de acento)
y **nada por cuadro**: su `actualizar` solo mueve uniformes (0,002-0,006 ms). La naturaleza añade 6 llamadas, 21.000
triángulos y 0,05 ms de JS por cuadro (viento de la hierba, fauna). Los 11.000 triángulos y 13 llamadas que quedan en el plano
son avatar, objetos del mundo, hitos y UI, no suelo. Memoria JS 69 MB en los tres (la base no reserva nada al apagar la naturaleza).
Servidor con la base (`tools/swarm.sh --url … --n 200 --secs 30`): 200/200 conectados, tick p50 2,69 / p99 5,26 ms,
CPU del proceso 8,5 %, RSS 178 MB, 27 kbit/s por persona, 0 fallos.
Repetir: motor en 8895 y página en 5335 sobre el mundo de prueba, `TMPDIR=/tmp node tools/medir-base.mjs salida.json`.

## Niveles de detalle e ingesta por hash: bytes y llamadas (H13, M16)

Medido con `tools/e2e-piernas/lod-manifiesto.mjs` sobre el mundo de la plantilla de eventos (227 piezas colocadas, 5 modelos `.glb`),
Chromium headless con GPU por software, antes = `origin/main` 7cc658de y después = `lote7/activos`. Los JSON están en
`work/motor-vr/lotes/capturas-lote7-activos/`.

| | antes | después |
|---|---|---|
| ficheros de nivel hechos en la ingesta (2 por modelo) | 0 | 10 (los 5 modelos) |
| triángulos del modelo de más peso | 3.668 | 3.668 · nivel 1: 1.708 · nivel 2: 424 |
| 1.ª visita, bytes de `/a/` | 1.429.763 | 1.429.763 (los niveles no se bajan hasta que hacen falta; en la plaza de 200 copias lejanas, +34.360 de nivel) |
| 2.ª visita, caché HTTP apagada, bytes de `/a/` | 763.172 (28 peticiones) | 321.068 (20 peticiones), **-58 %** |
| 2.ª visita, caché HTTP encendida | 0 | 0 |
| pantalla de carga | «231 de 231 piezas» | «231 de 231 piezas · 1,1 de 1,1 MB»; pendientes dentro de la vista 0 (`carga-entera.mjs`, ok) |
| llamadas y triángulos del último cuadro (plantilla, 2.ª visita) | 74 · 271.447 | 74 · 271.447 (todo está cerca: igual, como debe ser) |

Plaza de 200 copias del modelo de 3.668 triángulos a 100–420 m (`COPIAS=200`): después, 427 piezas cargadas, 0 fallidas; el último cuadro
dio 100 llamadas y 539.983 triángulos. **No hay cifra «antes» fiable de llamadas y triángulos de esa plaza**: el cuadro leído por el
GPU por software salió a 0 en el motor sin tarjeta (la lectura varía con el cuadro y con la posición, de 100 a 333 llamadas en
el mismo mundo). Lo medido de verdad es el peso de cada nivel (arriba); las llamadas no bajan con el nivel, bajan los triángulos.

## Cómo acaban las conexiones, y el INPUT con la pestaña de fondo (MIS-233, 26-10-2026)

Falta que cerraba la nota de biblioteca del 16-10 («medir cuántas desconexiones sin despedida tenemos»): el servidor solo contaba `cerradas`, sin decir
cómo. Ahora `/metrics` trae `cierres` y `/metrics.prom` trae `numinia_connections_closed_total{motivo=…}` con siete motivos por código de cierre
(`limpio` 1000/1001, `sin_codigo` 1005, **`sin_despedida` 1006** = el socket murió sin trama de cierre, **`silencio` 4005** = lo cortó el servidor porque el
latido se paró, `expulsado`, `protocolo`, `otro`; suman `cerradas`). **Sin despedida = `sin_despedida` + `silencio`.** Una página cortada por silencio
acaba en el navegador como 1006 (no contesta la trama de cierre); el servidor la apunta aparte para no contarla dos veces. Prueba: `test/cierres.test.ts`
(WebSocket real: 2 limpios, 1 muerto, 1 congelado cortado, 1 que sigue; las cuentas suman).

Medida con pestañas reales (`tools/medir-cierres.mjs`, un Chromium sin cabeza, servidor propio con datos vacíos, 26-10 ~12:40 UTC, PC compartido):

| Qué le pasa a la pestaña | Cierre contado | Tarda en notarlo el servidor |
|---|---|---|
| se cierra (`page.close`) | `limpio` | 0,26 s |
| navega a otra página | `limpio` | 0,34 s |
| se queda sin red (CDP `offline`, el socket no se cierra) | `silencio` | **16,4 s** (el tope es `SILENCIO_MS` = 15 s + el muestreo) |
| congelada (`Page.setWebLifecycleState frozen`) | nada en 18 s | **no concluyente**: el Chromium sin cabeza no paró sus temporizadores, el latido siguió |
| se cae el proceso de la pestaña (`Page.crash`) | **no medido**: cuelga la conexión CDP del Chromium sin cabeza | — |

Lo que NO se ha medido, y no se puede aquí: cuántas desconexiones sin despedida hay en los **mundos reales** (esto es una prueba en banco; con `cierres` en
producción la cifra sale de `numinia_connections_closed_total` en Grafana, ratio `sin_despedida+silencio` sobre el total).

**INPUT con la pestaña de fondo.** Con la tecla W pulsada, la página mandó (5 s por ventana): visible **86 INPUT** (17/s), luego «minimizada» **98** y de nuevo
visible **100** (20/s), más 12 latidos por ventana (tipo 16: un temporizador de 400 ms que lleva `oculta`, `apps/plaza/main.ts:733`). Pero el Chromium sin cabeza
**no cambió `document.visibilityState`** al minimizar (siguió `visible`), así que esa fila **no es una pestaña oculta**: no mide nada de fondo. Lo que sí dice el
código: el INPUT se manda dentro del bucle de dibujo (`view.loop` → `session.tick`), que el navegador **para** en una pestaña oculta (el móvil, además, la
congela); el latido va por `setInterval`, que sí sigue (a 1 Hz como mucho) y por eso el servidor admite 150 s de silencio a quien dijo `oculta`
(`SILENCIO_OCULTA_MS`) y 15 s al resto. Medirlo de verdad pide un Chromium con ventana o un móvil (`chrome://inspect`, lote de móviles). Pendiente.

## Lo que la niebla tapa, también en las piezas de función: la Torre de los Alquimistas entera (t_43143556)

El corte por niebla de N12 solo miraba las cosas, las personas y los rótulos. Los grupos que dibujan las funciones
del mundo (`pesca:`, `dardos:`, `elemento:`, `ancestros:`) se seguían dibujando a 110 m con una niebla que acaba en 60.
Ahora entran en el mismo corte con su esfera englobante (re-medida cada 60 cuadros: la línea de la caña o un dardo en
vuelo la agrandan). La luz de la sala de los Ancestros no se oculta nunca (ocultar una luz recompila todos los materiales).
Medida en la muestra de la Torre (mundo `muestra-torre`, niebla 60 m, GL por software, planta B = sin sombras, el
punto más caro: de pie en el porche de la Torre mirando al este, con todo el mundo delante):

| vista | antes | después |
|---|---|---|
| Quest simulada (nivel B), llamadas | 88 | 55 |
| PC (nivel A, con sombras), llamadas | 112 | 77 |
| llegada, Quest | 40 | 20 |
| junto al Ayuntamiento, Quest | 65 | 49 |

Con casco emulado (IWER Meta Quest 3 sobre la misma página, `?medidor`): los 12 rumbos del porche dan como peor caso
125 llamadas en total = 62 por ojo (`ojos: 2` en el censo); tope de la plantilla B: 150 por ojo (`limits.json`), objetivo de la
tarjeta: 80. `muestra-torre/medir.mjs` y `medir-vr.mjs` lo repiten.
