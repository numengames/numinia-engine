# Carga rápida en móvil (N22)

Qué hace el motor para que un mundo pese menos por la red y se vea antes en un móvil, sin cambiar cómo se ve.
Código: `packages/server/src/optimizar*.ts`, `activos.ts`, `pagina.ts`; `packages/render/src/gltf.ts`, `carga-orden.ts`.
Pruebas: `test/carga-rapida.test.ts`.

## Qué se hace

| Pieza | Qué | Dónde |
|---|---|---|
| Modelos (.glb subidos) | dedup → prune → weld → cuantizar (posición 16 bits, normal 12, UV 14, color/peso 10) → reordenar → `EXT_meshopt_compression`. Se comprueba que la copia dibuja lo mismo (triángulos, nodos, texturas distintas, animaciones, caja con error ≤ 1/10.000 del lado); si no, se queda el original. | `optimizar.ts` |
| Texturas PNG dentro de un .glb | WebP **sin pérdida** (`EXT_texture_webp`): se decodifica de vuelta y se compara píxel a píxel. JPEG y KTX2 se quedan como vienen. | `optimizar.ts` |
| Imágenes PNG subidas | Su WebP sin pérdida, solo al navegador cuyo `Accept` dice `image/webp` (`Vary: Accept`); los demás reciben el PNG. Un PNG con perfil de color o gamma (iCCP, gAMA, cHRM), de 16 bits o animado se queda. | `optimizar.ts`, `activos.ts` |
| Cuándo | Al subir (y al arrancar, lo que falte), en un hilo aparte, uno a uno: el bucle de 20 Hz no espera nunca. El original no se toca y es el que va en el zip del mundo. `MOTOR_OPTIMIZAR=no` lo apaga. | `optimizar-cola.ts`, `optimizar-hilo.ts` |
| A mano | `npm run optimizar -- <mundo \| carpeta de activos \| fichero.glb/.png>`: hace las copias y dice cuánto baja el mundo y si pasa los topes (10 MB móvil, 12 MB Quest). | `optimizar-cli.ts` |
| Por la red | Los .glb, .vrm y .vrma van con gzip (hecho una vez y guardado); la página (JS, CSS, HTML, wasm) con brotli o gzip. | `activos.ts`, `pagina.ts` |
| Decodificadores | meshopt (de three, 7 kB) y KTX2 (Basis de three, servido por la propia página en `/basis/`, solo se baja si un modelo trae KTX2). Sin CDN. Draco no: el optimizador no lo escribe. | `gltf.ts`, `apps/plaza/vite.config.mjs` |
| Orden de carga | 1) la sala (objetos fijados o de decorado), 2) lo cercano (≤ 80 m), por distancia, 3) lo lejano, solo cuando no queda nada cercano por bajar. | `carga-orden.ts`, `index.ts` |

Licencias de lo que entra en el servidor: gltf-transform, meshoptimizer, property-graph, ktx-parse, ndarray* (MIT);
@jsquash/jpeg, @jsquash/png y @jsquash/webp, wasm-feature-detect (Apache-2.0; códecs de squoosh, libwebp BSD). `ndarray-pixels`
(que arrastraría sharp/libvips, LGPL) se sustituye por un paquete vacío (`tools/vacio/ndarray-pixels`): el motor no
reescala píxeles con una librería; las copias por nivel de una imagen (abajo) las reduce una promediadora de unas
40 líneas (`reducirRgba`, `optimizar.ts`). El instalador copia solo esas dependencias (`OPTIMIZAR_DEPS` en `tools/build-deploy.mjs`).

## Medidas (18-10-2026)

Chrome headless con SwiftShader, perfil móvil de N1 (412×915, DPR 2,625, CPU ×4), caché desactivada, en el PC de desarrollo
(Ryzen 9 7950X). «4G lento» = el perfil de N1 (1,6 Mb/s, 150 ms; el de Lighthouse). «4G» = 9 Mb/s, 1,5 Mb/s de subida, 165 ms.
Antes = punta del tren 2 sin N22 (`74a8704`); después = la rama de N22 con las copias hechas (entró en main con `5a88043`, v0.5.0).
«Sala» = el modelo de la nave de eventos (fijado).

**Cómo de fiables son:** **una sola pasada por fila**, con el guion `medir22.mjs` del informe de N22, que **no está en el
repositorio**: hoy no se pueden repetir desde aquí. Con SwiftShader valen los bytes y los tiempos que manda la red emulada, no los
fps ni lo que depende de la CPU. Una medida posterior con otro guion cuadra en orden de magnitud: página de `39a9f73` y `d76d71a`
«lista para jugar» en 3,06–3,23 s con 4G lento (18-10 14:58 UTC, mediana de 3 vueltas, plaza de ejemplo, no estos mundos).

| Mundo · red | Primer cuadro | Sala dibujada | Todo cargado | MB bajados (total) |
|---|---|---|---|---|
| Eventos · 4G lento, antes | 8,6 s | 84,8 s | 85,4 s | 15,37 |
| Eventos · 4G lento, después | **3,2 s** | 13,9 s | 14,3 s | **2,30** (15 %) |
| Eventos · 4G, antes | 2,4 s | 15,2 s | 15,7 s | 15,37 |
| Eventos · 4G, después | **1,5 s** | **3,5 s** | **4,1 s** | **2,30** |
| Muestra · 4G lento, antes | 8,5 s | – | 83,9 s | 10,82 |
| Muestra · 4G lento, después | **3,2 s** | – | 42,1 s | **4,43** (41 %) |
| Muestra · 4G, antes | 2,5 s | – | 14,9 s | 10,82 |
| Muestra · 4G, después | **2,2 s** | – | 12,9 s | **4,43** |

Lo que baja hasta el primer cuadro: 1,49 MB → 0,47 MB (la página con brotli, que es lo que se sirve también en vivo: `content-encoding: br` en alchemiststower, 18-10-2026).
Ficheros del mundo (`npm run optimizar`): eventos 12,43 MB → 1,41 MB por la red (11 %); la muestra 28,45 → 24,02 MB,
porque 20,9 MB son dos vídeos que no se recodifican (cambiaría la imagen); el navegador los pide por rangos, así que en
una visita bajan 0,12 MB.

Capturas (mismo build, original frente a copias, PC sin limitar): eventos 1,2 % de píxeles distintos (>8/255) y la
muestra 0,6 %, lo mismo que entre dos cargas del original (0,3–1,2 %: la animación de los PNJ y el texto del HUD).
En el perfil móvil, eventos antes/después: 1,2 %.

### Qué falta para «la sala en menos de 4 s» en 4G lento
La nave de eventos es 0,3 MB de geometría y una foto JPEG de 0,96 MB (hormigón): a 1,6 Mb/s son 6 s solo ella, más los
0,47 MB de la página. Bajarla de ahí sin cambiar cómo se ve no se puede (la JPEG ya es con pérdida); las vías son una
textura más pequeña en la plantilla (decisión de arte) o cargar primero una versión reducida y cambiarla por la buena.

## Probar
`npm test` (test/carga-rapida.test.ts) · `npm run optimizar -- <mundo>` · para medir, el guion de la noche
(`medir22.mjs` en el informe de N22, **fuera del repositorio**) arranca el servidor con el mundo y mide con el perfil de arriba.
Mientras no esté en `tools/`, la tabla de arriba no se puede repetir: trátala como una pasada, no como una línea base.

## v9: entrar en un mundo desde las gafas (Quest) · medido, 2026-10-22
Dos causas baratas de que la entrada fuera lenta, ambas por hacer los pasos uno detrás de otro:
1. **El socket se abría tarde.** `main.ts` pedía `/status`, montaba la vista 3D y solo entonces abría el WebSocket; su
   apretón (TLS + upgrade) y el `welcome` del servidor esperaban detrás. Ahora se abre arriba de todo y lo que llega antes de
   que haya sesión que lo lea se guarda en el transporte (`packages/net`; de los snapshots solo el último).
2. **La sonda de determinismo corría antes del primer cuadro** (un replay: ~60 ms en PC, ~220 ms a CPU ×4). Ahora va después.

Cómo se midió (`tools/medir-entrada.mjs`): Chromium headless, página y servidor locales con el mundo de alchemiststower,
**A y B alternados** (5281 = `origin/main`, 8881 = esta rama), un navegador nuevo por pasada, 3 pasadas, mediana.
Es un portátil sin GPU (SwiftShader): vale para comparar A con B, **no** como tiempo absoluto de unas Quest.

| Límites | Medida (mediana de 3) | Antes | Después | Diferencia |
|---|---|---|---|---|
| CPU ×4 · 10 Mb/s · 60 ms | `welcome` recibido | 1817 ms | 1010 ms | −807 ms (−44 %) |
| | primer cuadro | 1828 ms | 1125 ms | −703 ms (−38 %) |
| | pantalla «Cargando» fuera | 1914 ms | 1354 ms | −560 ms (−29 %) |
| CPU ×6 · 1,6 Mb/s · 150 ms | `welcome` recibido | 5243 ms | 4229 ms | −1014 ms (−19 %) |
| | primer cuadro | 5263 ms | 4462 ms | −801 ms (−15 %) |
| | pantalla «Cargando» fuera | 5348 ms | 4721 ms | −627 ms (−12 %) |

Las 3 pasadas de cada lado quedan a ±30 ms entre sí (CPU ×4: antes 1904–1921, después 1346–1401). Carga de la máquina
(`loadavg` 1 min) entre 5 y 9 durante las pruebas, parecida en A y B porque se alternaron. Detalle del CPU ×4: el socket abre a 1500 ms
(antes) y 849 ms (después) desde el inicio de la página; la sonda (223 ms) ya no está antes del primer cuadro.

**Lo que NO se ha tocado y es lo siguiente:** de los ~700 kB que bajan antes del primer cuadro, lo grande es el JS de la página y
el mundo; con 1,6 Mb/s eso ya son ~3,5 s de los 4,7. Partir el JS (cargar tarde lo que no se ve al entrar) y las texturas
del mundo son las dos palancas que quedan, y piden una decisión de qué se ve primero.
**Falta en Quest real:** esto es un navegador de PC con límites; hay que repetirlo en las gafas (`about:inspect` + `chrome://inspect`).

## Imagen de hueco al tamaño del nivel (t_dee4d0eb, 2026-10-26)
N22 baja los bytes por la red (PNG → WebP sin pérdida) pero no los píxeles: 22 obras de 3000×2000 subidas a 2.048 px eran ~340 MB de
texturas (w·h·4·4/3, la cuenta de `limits.json`) en el nivel B, con tope 256 MB. Ahora `cargarImagen(url, maxPx)` (`packages/render/src/medios.ts`)
rehace una imagen más grande que `IMAGEN_PX[nivel]` (`calidad.ts`; `limits.json` `image_px_max`: A 2.048, B 1.024, C 512, D 512) en un lienzo
de ese tamaño y solo esa copia es textura; la proporción del plano no cambia y nunca amplía. Al entrar en VR el nivel pasa a B y las
imágenes ya cargadas con más píxeles se sueltan y se piden otra vez a 1.024 px (el navegador tiene el fichero en caché, `immutable`).
Medido con `plantillas/galeria/carga-obras.mjs` (`SIMULAR=B`, Chromium SwiftShader; vale para comparar, no es una Quest):

| 22 huecos de 3000×2000 (subidos a 2.048 px) | Antes | Después |
|---|---|---|
| Texturas de la escena en nivel B (MB) | 340,3 | **105,8** (tope 256) |
| Bajada de las 22 imágenes por la red | 38,7 MB | 38,7 MB (sin cambio) |
| Llamadas de dibujo en B (p50) | 53 | 53 |

## El servidor guarda una copia por nivel (t_dee4d0eb, 2026-10-26)
Lo que faltaba arriba: que la **descarga** bajara también. Ahora el servidor, al recibir (o al arrancar, si no la tiene) una imagen
`png`, `jpg` o `webp` más grande que un tamaño de nivel, guarda en `optimizados/` una copia por cada tamaño que supera
(`<sha256>.<ext>.p2048.webp`, `.p1024.webp`, `.p512.webp`: WebP con pérdida calidad 82, lado largo al tamaño, misma proporción;
`IMAGEN_PX_COPIAS` en `packages/net/src/ficheros.ts`, igual que `image_px_max` de `limits.json`; una prueba lo comprueba). La página
pide `/a/<sha256>.<ext>?px=<IMAGEN_PX[nivel]>` y el servidor contesta con esa copia si el navegador acepta WebP; si no la hay
(aún no se ha hecho, la imagen ya cabe, lleva perfil de color o es animada) contesta con el fichero de siempre, y la página lo
reduce con el lienzo como antes. Ese caso se guarda 5 minutos (`max-age=300`) si la imagen es mayor que el tamaño pedido (puede que
la copia llegue luego) y un año si no (nunca habrá copia). El original no se toca; `informe.jsonl` anota `pxs` por imagen y una línea
sin `pxs` (de antes) se vuelve a mirar, así que los mundos que ya tenían imágenes las reciben al arrancar.
Descodifica con `@jsquash/jpeg` 1.6.0 (mozjpeg en wasm, 166 kB, Apache-2.0, sin compilar nada; el PNG y el WebP ya estaban) y reduce
en JS; no se añadió `@jsquash/resize` (otro paquete wasm de 250 kB) porque promediar el área que cubre cada píxel nuevo sirve para
reducir. Va en el hilo del optimizador, no en el bucle del servidor; no se descodifica nada de más de 4096×4096 px.

Medido con `plantillas/galeria/carga-obras.mjs` (`SIMULAR=B`, imágenes sintéticas: degradado, discos y grano):

| 22 huecos de 3000×2000 (subidos a 2.048 px) | Nivel A (2.048 px) | Nivel B (1.024 px) |
|---|---|---|
| Bajada de las 22 imágenes por la red | 38,7 MB | **0,8 MB** |
| Texturas de la escena (MB de vídeo) | 340,3 | 105,8 |

Una foto de verdad pesa más que ese grano a la misma calidad: la proporción esperada es de 8-12 veces, no de 48. **Falta:**
medirlo en una Quest con fotos reales, y que el manifiesto (`/manifiesto.json`) cuente los bytes de la copia y no los del original
(hoy solo afecta al total que enseña la barra de carga).
