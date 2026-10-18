# Naturaleza low-poly (N1–N6)

Pieza reutilizable (R-1): cualquier mundo la activa con un JSON pequeño. Presupuesto, paleta y reglas: ver el brief del encargo
(`work/naturaleza/BRIEF.md`). Cada historia añade su sección aquí.

## N1 · Terreno con relieve y zonas (semilla)

Ficheros: `packages/render/src/naturaleza/semilla.ts` (azar y ruido puros), `packages/render/src/naturaleza/terreno.ts`
(`alturaEn`, `zonaEn`, `crearTerreno`), `test/naturaleza-terreno.test.ts`.

**Qué es.** Un número entero (la semilla) genera el paisaje: mismo número = mismo terreno en el móvil, en el servidor y en un
test, sin guardar nada. `alturaEn(semilla, x, z)` y `zonaEn(semilla, x, z)` son funciones puras (sin `Math.random`, sin reloj).
`crearTerreno({ semilla, nivel, tamano, plaza, niebla, escena })` construye **una sola malla** (1 draw call), sin texturas y sin
luces propias: normales planas (aspecto facetado), color por vértice que mezcla las cinco zonas y oscurece los valles.

**Zonas.** `prado` (verde cálido #9bc25a), `bosque` (verde hondo #4f8a3c), `arena` (#e6d3a1), `roca` (gris con violeta #8a8594),
`orilla` (arena mojada #b8a878). Pesos suaves; `zonaEn` devuelve la de más peso. Prioridad: orilla > arena > roca > bosque > prado.
La plaza (radio 12 m por defecto, opción `plaza`) es plana (altura 0) y siempre prado: el punto de aparición se puede andar.
Un estanque de radio ~15–20 m se cava en un sitio que elige la semilla (`estanqueDe`), con cinturón de arena; el agua va a
`NIVEL_AGUA` = −0,2 m (la dibuja `agua-estilo.ts`, no esta pieza).

**Bordes.** La altura se calma hacia el borde, el color se funde al de la niebla (opción `niebla`, usa la de la escena) y una
falda de 10 m cae por los cuatro lados: no se ve ni borde ni hueco.

**Niveles** (`CELDAS_TERRENO`): A 96 · B 64 · C 48 · D 32 celdas por lado en 200 m.

| Nivel | Triángulos | Vértices (sin índice) | Bytes de geometría | CPU construir (nodo, una vez) | Draw calls |
|---|---|---|---|---|---|
| A | 19 200 | 57 600 | 2,07 MB | ~17–35 ms | 1 |
| B | 8 704 | 26 112 | 0,94 MB | ~8–11 ms | 1 |
| C | 4 992 | 14 976 | 0,54 MB | ~3 ms | 1 |
| D | 2 304 | 6 912 | 0,25 MB | ~1,5 ms | 1 |

Triángulos = 2·n² + 8·n (la rejilla más la falda). Quedan por debajo del 40 % del tope de naturaleza de cada nivel
(60 k / 35 k / 35 k / 15 k), así que árboles y hierba tienen sitio. `alturaEn` por punto: unos microsegundos (4 octavas de simplex).
Nota de medida: `renderer.info.render.calls` de WebGPURenderer con el respaldo WebGL cuenta doble y trae pasadas de fondo; el
número fiable son los `drawElements/drawArrays` reales de GL: la malla del terreno suma exactamente 1.

**Copiado / cambiado / combinado.**
- Copiado (técnica, ni código ni activos): ruido simplex 2D de Stefan Gustavson («Simplex noise demystified», dominio público);
  fbm y ruido en crestas («morenoise») y el máximo suave de Inigo Quilez (iquilezles.org); idea de máscaras para elegir bioma de
  Red Blob Games («Making maps with noise»); PRNG mulberry32 (dominio público); mezcla de enteros tipo lowbias32 (Chris Wellons,
  dominio público). Estilo: facetas planas + color por vértice con paleta corta (low poly habitual, p. ej. Kenney / Quaternius
  como referencia de forma, nada de sus activos).
- Cambiado: todo va con semilla entera (sin tablas de permutación), los gradientes salen del hash, los resultados tienen rango
  conocido; plaza plana, estanque con cinturón de arena y borde que se funde con la niebla.
- Combinado: `calidad.ts` (niveles A–D), el material Lambert de la escena (luz del sol + hemisferio del motor).

**Enchufe (lo hace N4).** `crearTerreno` devuelve `{ malla, alturaEn, zonaEn, estanque, triangulos, vertices, dispose }`;
`alturaEn/zonaEn` sirven también para esparcir árboles/hierba y para la colisión (N5).

**Fotos:** `work/naturaleza/fotos/n1-{arriba,suelo,arena-orilla,roca}.png` (página suelta, solo el terreno, sol 45°/hemisferio del
motor, AgX; el disco azul es un adorno, no agua real).

## N3 · Hierba instanciada con viento y flores (`naturaleza/hierba.ts`)

**Qué es.** `crearHierba(h: { vientoU, nivel }, fuente: { alturaEn(x,z), zonaEn(x,z) }, { semilla, escena?, tabla?, empujaCamara?, hojas? })`
→ `{ malla (Group), mallas, actualizar(camara, t, movers?), llenarTodo(camara), visibles(x,z), estadisticas(), dispose() }`.
Pieza reutilizable (R-1): un mundo la enciende pasando su terreno; no hay nada atado a `entorno.ts` (el enchufe es de N4).

**Dibujo.** 2 draw calls en todos los niveles: una malla de matas (1 llamada) y una de flores (1 llamada). Mata = 3 triángulos
(3 hojas cónicas cruzadas, color de vértice oscuro en la raíz y claro en la punta, normal casi vertical para que el prado se lea
como una superficie y no como pinchos). Flor = tallo (1 triángulo) + capullo de 4 caras (4) = 5 triángulos. Sin texturas, sin luces
nuevas, sin pasadas, sin sombras propias. `InstancedBufferGeometry` (no `InstancedMesh`: nos ahorra los 64 bytes de la matriz por
mata): **32 bytes por mata** (2 × vec4). Esfera envolvente puesta a mano y recentrada con la cámara; `frustumCulled = true`.

**Por qué colocar en CPU y no 100 % en la GPU.** `alturaEn`/`zonaEn` son funciones de JavaScript (N1): un vertex shader no puede
preguntar «¿esto es arena?» ni calcular la pendiente sin copiar el terreno entero a una textura (y no queremos texturas). Así que
la colocación es CPU pero **una sola vez por celda**: el mundo se corta en celdas de 8 m; un anillo de celdas alrededor de la cámara
usa casillas fijas de dos buffers (una piscina: la celda que sale libera su casilla, la que entra coge una libre). Al cruzar el borde
de una celda solo se rellenan las celdas nuevas (resumible, la más cercana primero, tope `presupuestoMs` = 0,4 ms por fotograma).
Quieta la cámara no se toca ningún buffer; no hay bucle por instancia en cada fotograma. Subida a GPU: `addUpdateRange` solo de las
casillas tocadas. Todo lo demás (giro, escala, fundido, viento, empuje) va en el vertex shader, así que funciona igual en WebGPU y
en el respaldo WebGL2.

**Determinismo.** Cada mata es función pura de `(semilla, celda x, celda z, índice)` (`tuftDe`, `florDe`, `tuftsDeCelda`):
sin `Math.random`, sin reloj; hash de `semilla.ts` (N1) y secuencia R2 de baja discrepancia para repartirlas parejas. Misma semilla →
misma mata en el mismo sitio, en página y servidor, y da igual el orden en que se rellenen las celdas (test).

**Dónde crece.** Solo `prado` (todas) y `bosque` (40 %, más baja y más oscura); nunca en arena, roca ni orilla. Junto a una zona sin
hierba (sondeo a 0,7 m) la mitad de las matas ceden: la orilla no queda con flecos. La pendiente aclara (de 0,45 a 0,95 de
subida/avance, de 100 % a 0 %). Color por zona (`PALETA_HIERBA`: prado #9bc25a, bosque #558c3b), manchas grandes más claras/oscuras
(ruido de valor), manchas secas amarillentas, variación por mata. Flores 3–5 % de las matas del prado (medido 3,9 % en un llano),
en manchas de un solo color (blanco / amarillo / rosa) con algún suelto.

**Viento (vertex shader, TSL).** Desplazamiento ∝ (altura de la hoja)²; una racha que viaja por el campo en la dirección del viento
(`vientoU` + un uniform de tiempo; ola larga ≈ 37 m + una ola cruzada más lenta) con brillo que acompaña a la racha, y un aleteo
pequeño y rápido (solo en A, B y C; D no lo lleva). Sin viento queda una brisa mínima. **Empuje:** hasta 4 cuerpos (`movers` +
la cámara si `empujaCamara`) apartan la hierba en ~0,8 m y la aplastan un poco, en todos los niveles (es barato: 4 distancias).
**Fundido:** adelgazamiento con umbral propio por mata, desde el 70 % del radio, y la mata se encoge a 0 al llegar al borde: no hay saltos.

**Tabla** (`niveles.ts` → `HIERBA_POR_NIVEL`). Desvío respecto al encargo (A 30 k / B-C 12 k / D 4 k matas): con 3 triángulos por mata
eso serían 90 k / 36 k / 12 k triángulos enviados y el tope de TODA la naturaleza es 60 k / 35 k / 15 k, así que dejé A 14 000 ·
B-C 7 000 · D 3 000 (cambiar `tuftsMax` basta). Radios 38 / 22 / 22 / 14 m como pedía.

| Nivel | Radio | Matas máx. | Triángulos enviados (matas+flores) | Vivas | Rasterizadas (tras el fundido) | Draw calls | Bytes |
|---|---|---|---|---|---|---|---|
| A | 38 m | 14 000 | 46 216 | 35 299 | ~19 500 | 2 | 474 KB |
| B/C | 22 m | 7 000 | 22 950 | 20 031 | ~8 800 | 2 | 236 KB |
| D | 14 m | 3 000 | 9 731 | 9 120 | ~2 500 | 2 | 101 KB |

«Enviados» = lo que cuenta `renderer.info` (todas las casillas, también las vacías, que son triángulos degenerados). La hierba sola
ocupa 77 % / 66 % / 65 % del tope de naturaleza en enviados: si N4 mete los árboles al tope, bajar `tuftsMax`. **CPU:** relleno inicial
(`llenarTodo`, pantalla de carga) A ~8–12 ms una vez; andando, media 0,03 ms y pico 0,4–0,9 ms por fotograma con el terreno de prueba
(el terreno real de N1 cuesta más por punto: el presupuesto de 0,4 ms se respeta igual, solo tarda más fotogramas en completar).

**Copiado / cambiado / combinado.**
- Copiado (técnica, ni código ni activos): matas instanciadas con degradado de color de vértice y oscilación por onda viajera
  (ejemplos `webgpu_*` de three.js, MIT; Codrops «Rendering grass with three.js / TSL»); racha que rueda por el campo y hierba que
  se encoge a 0 con la distancia (Ghost of Tsushima, GDC 2021, solo la idea); secuencia R2 (Martin Roberts, 2018, «The Unreasonable
  Effectiveness of Quasirandom Sequences»).
- Cambiado: colocación en CPU por celdas con piscina de casillas (sin cómputo: el respaldo WebGL2 no lo tiene); la zona, la pendiente
  y el borde deciden la densidad; flores en manchas.
- Combinado: `vientoU` (entorno.ts), `semilla.ts` y `terreno.ts` (N1), niveles de `calidad.ts`, luz de escena Lambert (sol + hemisferio) y niebla.

**Pruebas:** `test/naturaleza-hierba.test.ts` (determinismo, zonas, pendiente, densidad por nivel y 3–5 % de flores, nada más allá del
radio, 2 draw calls, cámara quieta = cero escritura, el anillo tras cruzar una celda es igual a un relleno nuevo, CPU repartida).

**Fotos:** `work/naturaleza/fotos/n3-{suelo-calma,suelo-viento-empuje,arriba-calma,arriba-viento,suelo-nivelD}.png` (colinas de seno
de prueba, sin depender de N1; página en `.run/n3/`, puerto 5403).
