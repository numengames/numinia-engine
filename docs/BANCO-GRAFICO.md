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
- **WebGPU: temporizador fiable** en las dos pasadas completas (rondas a ±3 µs, siempre por debajo de la ráfaga).
  **WebGL2 (ANGLE/Vulkan headless): fiable en una pasada y no en otra** — en la primera la misma configuración dio
  0,46–1,98 ms entre rondas y superó a la ráfaga; en la segunda, estable y con los mismos Δ que WebGPU. El control de la
  ráfaga lo detecta y la tabla lo marca (columna «Temporizador»); si sale «supera la ráfaga», repetir. La ráfaga de
  WebGL2 va en escalones de ~0,07 ms porque `readRenderTargetPixelsAsync` sondea por cuadro.
- En WebGPU `renderer.info.render.drawCalls` no cuenta las llamadas de la pasada de sombra (la pasada sí se dibuja y se
  cronometra: 4 µs); WebGL2 sí las cuenta (base 11 → sombras 22). Causa sin investigar.
- Los ms absolutos son de una GPU de escritorio: sirven para ordenar técnicas y ver si su coste es de píxeles o de
  vértices, no para decir cuánto cuesta en un Quest. Para eso: el procedimiento por USB del saber 3D (pendiente).

## Primera medida (commit 277bab4, 2026-10-19 14:08 UTC, RTX 4080, nivel B, 3360×1760, 3 rondas × 240 cuadros)

Δ GPU frente a `base` al 100 % (WebGPU / WebGL2) y parte del Δ que escala con píxeles (WebGPU):

| Técnica | Δ GPU WebGPU | Δ GPU WebGL2 | Píxeles | Llamadas (WebGL2) | Triángulos |
|---|---:|---:|---:|---:|---:|
| niebla | +0,002 ms | −0,002 ms | bajo el ruido | 11 (+0) | 122 |
| sombras (512 px, nivel B) | +0,017 ms | +0,018 ms | 96 % | 22 (+11) | 244 |
| partículas (7 emisores: 2 fuegos con chispas y humo + polvo; 594 partículas) | +0,038 ms | +0,037 ms | 91 % | 18 (+7) | 1,3 k |
| teletransporte (3 luces a la vez, el tope del nivel B, en bucle) | +0,003 ms | +0,005 ms | bajo el ruido | 22 (+11) | 342 |
| agua (30×30 m, 32 celdas por lado, 1 152 triángulos) | +0,007 ms | +0,008 ms | 65 % | 12 (+1) | 1,3 k |
| todas | +0,074 ms | +0,083 ms | 88 % | 37 | 2,7 k |

Base: 0,076 ms GPU (WebGPU), 0,145 ms (WebGL2); CPU de `render()` 0,10–0,15 ms; memoria de texturas ≈71 MB (sin desglosar; se supone que es sobre todo el lienzo de 3360×1760), +2 MB con sombras. Los dos backends coinciden en los Δ.
Lectura: en esta escena todo es barato en escritorio; lo que más pesa son las partículas y casi todo su coste es de
píxeles (sobredibujado), que es lo que limita en Quest. Informe completo en `informes/banco-v1/` (no versionado).
