# Banco de pruebas gráfico (v1)

Qué cuesta en la GPU cada técnica que adoptamos, medido igual cada vez, para decidir con números. Herramienta:
`tools/banco.mjs` + página `apps/banco/`. Método completo, presupuestos de Meta y plantilla de ficha de coste en el
saber 3D: `saber-3d/concepts/banco-de-pruebas.md` (fuera del repo).

## Uso

```sh
# una sola instancia de Chromium en la máquina: siempre dentro del cerrojo
CHROME=/ruta/a/chrome flock <cerrojo> nice node tools/banco.mjs            # todas las técnicas, WebGPU y WebGL2, 3 rondas
node tools/banco.mjs --tecnicas sombras,agua --backend webgpu --rondas 5   # un subconjunto
node tools/banco.mjs --sonda                                               # solo: qué GPU y qué temporizador ve cada backend
node tools/banco.mjs --desde informes/banco/banco-<fecha>.json             # rehacer la tabla de un informe, sin navegador
```

Opciones: `--cuadros 240` (cuadros por pasada), `--calentar 40`, `--tam 3360x1760` (los dos ojos de Quest 3 a escala
100 %), `--nivel B` (Quest en XR), `--puerto 5801`, `--gpu real|swiftshader`, `--fotos` (una captura por configuración en
la primera ronda), `--salida informes/banco`. Escribe `informes/banco/banco-<fecha>.json` (crudo + estadística) y `.md`
(la tabla). `informes/` no se versiona.

## Qué hace

1. Arranca su propio Vite (`apps/banco/vite.config.mjs`, puerto 5801, con COOP/COEP para que `performance.now()` tenga
   resolución fina) y un Chromium headless.
2. Para cada configuración — `base` (escena fija sola), cada técnica sola, `todas` — carga una página nueva con
   `?on=<ids>` y vuela el recorrido fijo de cámara (cuadro a cuadro, nunca por reloj: dos pasadas dibujan lo mismo).
3. Por escala (100 % y 50 % por eje = 25 % de píxeles) mide, por cuadro: ms de GPU (consultas de tiempo de three:
   `trackTimestamp` + `resolveTimestampsAsync('render')`; WebGPU `timestamp-query`, WebGL2
   `EXT_disjoint_timer_query_webgl2`), ms de CPU de `renderer.render()`, llamadas de dibujo y triángulos
   (`renderer.info`, con `autoReset = false` y `reset()` por cuadro), y una **ráfaga** de control: el mismo recorrido
   seguido con una única espera a la GPU al final (= max(CPU, GPU) por cuadro). Al final, `renderer.info.memory`.
4. Rondas en orden rotado; la tabla da la mediana de las medianas, el rango entre rondas, el Δ frente a `base`, la
   parte del Δ que escala con píxeles (fill-rate frente a vértices/fijo) y si el temporizador pasa el control.

Se dibuja en un render target 4× MSAA fuera de pantalla del tamaño medido (`?salida=rt`): en headless con
`--disable-vulkan-surface` el lienzo WebGPU no se puede mostrar (medido: sale negro), y en XR también se dibuja en un
framebuffer propio, no en el lienzo.

## Añadir una técnica

`apps/banco/tecnicas.ts`: `registrar({ id, nombre, origen, montar(ctx) })`. `montar` recibe el renderer, la escena, el
grupo `world` (lo que proyecta y recibe sombra), la cámara, el sol y el nivel, y devuelve `{ cuadro(dt, t)?, quitar(),
cuenta? }`. `cuadro` recibe un paso FIJO (1/72 s). Usar siempre el código real del motor (`packages/render`) con los
ajustes del nivel; nada de copias. Las piezas de naturaleza y la capa de partículas entran así sin tocar el runner.

## En esta máquina (2026-10-19)

- El contenedor ve la GPU real: con las banderas de `FLAGS.real` (receta de Chrome para headless en Linux:
  `--use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu`) WebGL2 sale por ANGLE
  sobre Vulkan en la NVIDIA GeForce RTX 4080 y WebGPU por Dawn sobre Vulkan en la misma tarjeta, `isFallbackAdapter:
  false`, con `timestamp-query`. Sin banderas: SwiftShader.
- El primer `requestAdapter()` de cada página devuelve `null` y el segundo da la GPU; three pide uno solo y cae en
  silencio a WebGL2, así que la página pide antes hasta tener adaptador.
- **WebGPU: temporizador fiable** (rondas a ±3 µs, siempre por debajo de la ráfaga). **WebGL2 (ANGLE/Vulkan headless):
  la extensión existe pero los ms no sirven** (la misma configuración da 0,46–1,98 ms entre rondas y supera a la
  ráfaga). La ráfaga de WebGL2 va en escalones de ~0,07 ms porque `readRenderTargetPixelsAsync` sondea por cuadro.
- Los ms absolutos son de una GPU de escritorio: sirven para ordenar técnicas y ver si su coste es de píxeles o de
  vértices, no para decir cuánto cuesta en un Quest. Para eso: el procedimiento por USB del saber 3D (pendiente).
