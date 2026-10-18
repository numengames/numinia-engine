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

## N2 · Árboles low poly con ramas y viento (`naturaleza/arboles.ts`, tabla en `naturaleza/niveles.ts`)

`crearArboles(h, puntos)` con `h = { vientoU, nivel, camara? }` y `puntos = [{x,y,z,escala,giro,especie,variante?}]` devuelve
`{ grupo, mallas, actualizar(t, desde?), repartir(x,y,z), estadisticas(), dispose }`. Cuatro especies (`roble` copa redonda con 3 masas
de hojas, `pino` de conos apilados, `abedul` esbelto, `arbusto`), cada una con 2 variantes (verde / otoño naranja · azulado ·
amarillo · flor rosa). Todo sale de la semilla (`crearAzar`, `hash2`): misma entrada, mismos árboles en cualquier dispositivo.

**Un árbol = una geometría fundida con color por vértice**: tronco facetado (prisma cónico de 5–6 lados), 3–5 ramitas (prismas finos
de 4 lados) que llevan manchas de hojas (icosaedro u octaedro con los vértices movidos), degradado oscuro abajo → claro arriba en
cada mancha y un 20 % más oscuro hacia el suelo (oclusión falsa gratis). Sin normales: sombreado plano por derivadas, sin texturas.

**Triángulos por árbol** (medidos en `test/naturaleza-arboles.test.ts`): cerca ≤ 220 (roble 136 · pino 130 · abedul 150 · arbusto 132;
el test lo comprueba contra 220), lejos 42 (tope 60): una silueta única para todas las especies (tronco de 5 lados + 2 bipirámides de 8).

**Draw calls: 5, pase lo que pase** (4 especies cerca + 1 lejos compartida). Las dos variantes de una especie tienen la MISMA topología y el
shader mezcla entre sus dos juegos de vértices (`posB`/`colB`) con un 0/1 por instancia: dos variantes en una sola llamada y sin doble
coste. No se funden las especies en una sola geometría instanciada porque cada instancia pagaría los vértices de las cuatro (×4 vértices,
y los triángulos degenerados cuentan en `renderer.info`). La silueta lejana es paramétrica (proporciones y color por instancia), por eso
sirve a todas. Instancias con `InstancedBufferGeometry` y atributos propios (x,y,z,escala · giro,fase,variante,tinte) en vez de
`instanceMatrix`: el viento necesita la altura del vértice ANTES de colocar el árbol.

**Viento** (TSL, `positionNode`, funciona en WebGPU y en el respaldo WebGL2): empuje en la dirección de `vientoU` + una brisa fija de
0,4 m/s (con viento 0 la copa respira un poco), peso = (altura/alto)² → el tronco casi no se mueve, la copa sí; ramas ×1,5; racha lenta
(2 senos) con fase por árbol sacada de su posición (no se mueven al unísono); balanceo lateral; las hojas añaden un aleteo rápido y
pequeño (solo vértices de hoja; apagado en el nivel D). A 14 m/s la copa de un roble de 4,7 m se desplaza ≈ 0,8 m. **CPU por árbol y
fotograma: cero** (`actualizar(t)` escribe un uniform).

**LOD por distancia**: cada 250 ms y solo si la cámara se movió ≥ 1,5 m, un paso O(n) sobre arrays tipados (2 histogramas de 64 cajas
para respetar los topes del nivel, sin ordenar ni reservar memoria). **Medido: 0,055–0,18 ms para 1500 árboles** (< 0,3 ms), así que se
queda este reparto por CPU en vez del radio fijo por chunk. Los árboles más allá de `arbolesLejosM` no se dibujan.

**Tabla** `NATURALEZA_POR_NIVEL` (cerca máx · visibles máx · radio cerca · radio lejos · aletean): A 110/650/55/240 m · B,C 45/400/40/170 m ·
D 20/170/26/110 m sin aleteo. Peor caso sobre el papel (todo cerca a 220 + todo lo demás a 60): A 56,6 k · B/C 31,2 k · D 13,4 k
triángulos, dentro de 60/35/15 k **solo para los árboles**: ojo, la hierba de N3 ya reclama 65–77 % del tope (ver su nota), así que N4
tiene que repartir el tope entre árboles y hierba (bajar `arbolesVisibles`/`tuftsMax`).

**Medidas** (600 árboles en 120×120 m, cámara en el centro, página de pruebas): A 600 árboles = 34 956 triángulos · B 378 = 20 152 ·
D 154 = 8 398; 5 draw calls en los tres; geometría 29 804 bytes en total (4 especies + silueta, 2 variantes); instancias 32 B por árbol
cerca (+80 B por árbol lejos): 59 680 / 36 160 / 15 480 bytes.

**Copiado / cambiado / combinado.** Copiado (técnica): copa de icosaedro/octaedro con vértices movidos (tabla de vértices de
`IcosahedronGeometry`, three.js, MIT); formas de referencia de los paquetes CC0 de Quaternius/Kenney (solo la silueta, ningún activo);
viento que crece con la altura (Codrops «foliage/grass with three.js TSL», GDC 2021 Ghost of Tsushima, solo la idea). Cambiado: todo
procedural por semilla, dos variantes con la misma topología mezcladas en el shader, silueta lejana paramétrica única. Combinado:
`vientoU` (entorno.ts), `semilla.ts` (N1), niveles de `calidad.ts`, luz de escena (Lambert) y niebla.

**Pruebas:** `test/naturaleza-arboles.test.ts` (10: topología de variantes, presupuesto 220/60 por especie, piezas cerradas con volumen
positivo, determinismo, esferas de recorte, topes por nivel, coste del reparto, grafo del material de viento).

**Fotos:** `work/naturaleza/fotos/n2-arboles-{linea,suelo,aire,viento-0,viento-fuerte}.png` (página en `.run/n2/`, puerto 5402).

## N4 · Una sola pieza: `naturaleza.json` enciende relieve + árboles + hierba

**Qué es.** `packages/render/src/naturaleza/naturaleza.ts` (`crearNaturaleza(h)`, expuesta como `view.naturaleza`) es la pieza que un mundo
enciende (R-1): construye el terreno (N1), los árboles (N2), la hierba (N3) y el agua del estanque como **un solo conjunto con un solo
presupuesto**, esconde el suelo plano **solo mientras está encendida** y, al apagarla, libera geometrías y materiales y devuelve el suelo.
`aplicar(datos)` es idempotente (mismos datos y mismo nivel de aparato = no hace nada; datos nuevos = reconstruye sin dejar restos; dos
llamadas seguidas: gana la última). `actualizar(dt)` mueve el viento y empuja la hierba con el jugador local (`yo`); si el aparato cambia de
nivel (VR dentro/fuera) se reconstruye para el nuevo. **Sin `naturaleza.json` no se crea ni un objeto ni se descarga un módulo**: los módulos
pesados se importan en el primer `aplicar` que pide encender.

**El fichero** (`MUNDO_DIR/naturaleza.json`, `numinia-engine/naturaleza@1`, todo opcional; el fichero mismo es el interruptor):
```json
{ "schema": "numinia-engine/naturaleza@1", "activa": true, "semilla": 1234, "tamano": 200, "plaza": 12,
  "densidad": { "arboles": 1, "hierba": 1 }, "estanque": true, "paleta": "verano" }
```
`semilla` 0–2147483647 (mismo número = mismo paisaje) · `tamano` 100–400 m · `plaza` 4–40 m de radio llano y sin árboles ·
`densidad.arboles` / `.hierba` 0–1 (fracción de lo que aguanta el aparato) · `estanque` · `paleta` `verano`|`otono`|`primavera`.
Claves desconocidas o valores malos se rechazan **con su ruta y cómo arreglarlos** (`features/naturaleza/esquema.ts`, todos a la vez). Un
fichero malo se registra en el log del servidor (`[mundo] naturaleza.json no se usa (suelo plano): …`) y el mundo sigue con el suelo de siempre.
El servidor solo guarda y manda el dato ya comprobado (feature `naturaleza`, una entrada de estado `mundo`); cada página construye el mismo paisaje.

**Esparcido** (`esparcir.ts`, puro, probado): rejilla con jitter (una candidata por cuadrado de 2,2 m movida por un hash de la semilla; es
función de la celda, no del orden) + pasada voraz con rejilla hash para la separación mínima (0,85 × la suma de radios de especie).
Por zona: **bosque** denso (pino/roble/abedul/arbusto), **prado** = manchas (ruido lento) + árboles sueltos, **orilla** pocos arbustos, **roca**
solo arbustos en su borde, **arena** nada; nada en la plaza (+2,5 m), en el estanque (×1,25), en pendiente > 1,05 ni a 7 m del borde del
mundo. Por encima del tope del nivel (`ARBOLES_MAX_POR_NIVEL`: 1100/750/750/300) se aclara parejo con un hash, sin cortar un lado del mundo.

**Paletas** (solo hojas y prado): `otono` pone ~82-88 % de robles y abedules en su segundo juego de color (naranja/amarillo) y tiñe prado,
suelo de bosque y hierba (`COLORES_PALETA`); `primavera` verde fresco y 72 % de arbustos con flor. Las posiciones no cambian con la paleta.

**Presupuesto** (`PRESUPUESTO_NATURALEZA` en `niveles.ts`; se reparte entre las tres piezas). Medido con `node tools/naturaleza-medir.ts`
(piezas reales, desde el punto de aparición, triángulos enviados a la GPU, sin navegador) y confirmado en la página real
(`view.naturaleza.estadisticas()`, semilla 1234):

| nivel | terreno | árboles (plantados / dibujados) | hierba (enviados / vivos) | **total** | tope | llamadas | tope |
|---|---|---|---|---|---|---|---|
| A | 10 944 | 18 528 (1085 / 314) | 18 857 / 14 633 | **48 329** | 60 000 | 9 | 12 |
| B | 4 992 | 12 128 (738 / 229) | 10 260 / 9 401 | **27 380** | 35 000 | 9 | 10 |
| C | 3 520 | 12 128 | 10 260 / 9 401 | **25 908** | 35 000 | 9 | 10 |
| D | 1 792 | 5 068 (295 / 97) | 4 995 / 4 980 | **11 855** | 15 000 | 8 | 8 |

Reajuste frente a N1–N3 (que iban cada una con su tope): `arbolesVisibles` 650/400/400/170 → 340/245/245/100 (y cerca/cerca-M/lejos-M a
la baja), `floresMax` de la hierba A 0,06 → 0,08, y se cambió el número de matas por celda que esperan dos tests de N3 (>10 en una celda llana;
el relleno inicial tarda >2 fotogramas). Llamadas: terreno 1 + árboles ≤ 5 (una por especie y LOD) + hierba ≤ 2 + agua 1. Construir de golpe
en el CPU (una vez, al cargar): terreno 25 ms + esparcido 20 ms + árboles 7 ms + hierba 27 ms en A (portátil cargado); en D ~19 ms.

**Sin colisión todavía (N5).** El terreno aún no es sólido para la simulación (`packages/sim` intacto): el avatar sigue pisando el suelo plano
a altura 0. Cerca de la plaza (radio llano, y por eso el punto de aparición sigue en altura 0) coincide con el relieve; lejos, en lomas y
cuencas, el avatar **flota o se hunde** respecto a lo dibujado hasta N5. Probado andando con el avatar real: pasea por el prado a y = 0,00 sin caerse.

**Tamaño de la página.** `npm run tamano`: 489,0 kB gz (era 482,5 antes de N4, ya sobre el tope de 480): N4 añade ~6,5 kB al arranque
(`naturaleza.ts` + la declaración de la feature); los módulos del paisaje van en trozos perezosos que no cuentan.

**Copiado / cambiado / combinado.** Rejilla con jitter y comprobación voraz de distancia en rejilla hash: la técnica interior del muestreo
Poisson-disc de Bridson (SIGGRAPH 2007) y el reparto por bioma del tutorial de mapas con ruido de Red Blob Games (solo la idea). Cambiado:
candidatas por hash de celda (independientes del orden), separación por pares de especie, tope por nivel. Combinado: `terreno.ts`, `arboles.ts`,
`hierba.ts`, `agua-estilo.ts` y el viento de `entorno.ts`.

**Pruebas:** `test/naturaleza-n4.test.ts` (17: esquema y errores, defectos iguales en servidor y página, cómo viaja con `conMundo` (log del
fichero malo, parte de la casa intacta sin fichero), servidor → página una sola vez, esparcido puro y reglas por zona, bosque vs prado,
topes por nivel, paletas, presupuesto en el peor caso, apagar devuelve el suelo y libera todo, `aplicar` idempotente, tope real desde la aparición).

**Fotos:** `work/naturaleza/fotos/n4-{plaza,bosque,estanque,cresta,otono,otono-aire}.png`; mundo de prueba `work/naturaleza/mundo-demo/`
(`entorno/naturaleza.json` + `entorno/entorno.json` con hora fija de día), servidor 8901 / página 5404.
