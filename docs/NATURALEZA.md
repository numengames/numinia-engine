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

**Colisión.** Hecha en N5 (sección siguiente): el avatar pisa el relieve en servidor y página.

**Tamaño de la página (N4b, carga perezosa).** Medido con `npm run tamano`: origen limpio (82a612c) 482,5 kB gz; N4 sin perezosa 489,0; con N4b 483,4 (+0,9 kB sobre el origen; el origen ya pasa el tope de 480).
En el arranque solo queda `render/naturaleza/cargador.ts` (sin three) y la declaración de la feature; `naturaleza.ts` y todo el paisaje son un trozo aparte (`naturaleza-*.js`) que se pide con `import()` la primera vez que el servidor manda datos; un mundo sin `naturaleza.json` no baja ni un byte de naturaleza.
La validación vive en el servidor (`esquema.ts`); la página se fía del dato y solo comprueba `typeof === "object"`. Lo que no se puede quitar del arranque: la declaración de la feature (el cliente la necesita para leer el estado) y unos ~0,15 kB de `three/tsl`/`three.core` que los trozos compartidos conservan porque el paisaje los usa.

**Copiado / cambiado / combinado.** Rejilla con jitter y comprobación voraz de distancia en rejilla hash: la técnica interior del muestreo
Poisson-disc de Bridson (SIGGRAPH 2007) y el reparto por bioma del tutorial de mapas con ruido de Red Blob Games (solo la idea). Cambiado:
candidatas por hash de celda (independientes del orden), separación por pares de especie, tope por nivel. Combinado: `terreno.ts`, `arboles.ts`,
`hierba.ts`, `agua-estilo.ts` y el viento de `entorno.ts`.

**Pruebas:** `test/naturaleza-n4.test.ts` (17: esquema y errores, defectos iguales en servidor y página, cómo viaja con `conMundo` (log del
fichero malo, parte de la casa intacta sin fichero), servidor → página una sola vez, esparcido puro y reglas por zona, bosque vs prado,
topes por nivel, paletas, presupuesto en el peor caso, apagar devuelve el suelo y libera todo, `aplicar` idempotente, tope real desde la aparición).

**Fotos:** `work/naturaleza/fotos/n4-{plaza,bosque,estanque,cresta,otono,otono-aire}.png`; mundo de prueba `work/naturaleza/mundo-demo/`
(`entorno/naturaleza.json` + `entorno/entorno.json` con hora fija de día), servidor 8901 / página 5404.

## N5 · Andar por las colinas: el terreno es la malla de colisión del mundo

**Qué cambia.** Antes el avatar flotaba a y = 0 sobre un relieve dibujado. Ahora, si el mundo tiene `naturaleza.json` encendido, el
**servidor** construye los triángulos del terreno con `alturaEn(semilla, x, z)` (la MISMA función que dibuja la página), los pasa por el
camino de M6 que ya existía para una malla GLB (`quantizeTriangles` a 1/64 m → `buildBvh` → `setMesh` → `groundHeight`, pendiente máxima
`MAX_SLOPE_COS` = 50°, pared por `blockedMesh`) y la página construye **la misma malla** del mismo estado para predecir igual. Un mundo sin
`naturaleza.json` no cambia ni un bit: sin malla, sin `piso`, sin ramas nuevas en `step`; la huella de referencia `7e630965` sigue fijada
(`test/engine.test.ts` y `test/naturaleza-colision.test.ts`).

**Ficheros.** `packages/relieve/` (nuevo paquete puro, sin three: `semilla.ts` y `relieve.ts` con `alturaEn`/`zonaEn`/`estanqueDe`, movidos
de `render/naturaleza/`, que ahora los reexporta: nada de la página cambia) · `packages/sim/src/terreno-malla.ts` (triángulos, muro,
`terrenoDelEstado`, `combinarMallas`, suelo mínimo) · `packages/instance/src/index.ts` (`sincronizarTerreno`, `aparicionTerreno`,
`sueloEfectivo`) · `packages/client/src/index.ts` (`sincronizarTerreno`) · `packages/sim/src/index.ts` (`piso`, ver abajo) ·
`tools/layers.json` (`relieve` nuevo; lo pueden importar `render` y `sim`) · `tools/naturaleza-colision.ts` (prueba headless en el mundo real) ·
`test/naturaleza-colision.test.ts` (15 pruebas). `packages/server/src` y `features/naturaleza/server.ts` **no** hicieron falta: el servidor ya
publica el estado `naturaleza:mundo` y la instancia lo lee (lo mismo que hace con las cajas sólidas de U10).

**Una sola fuente de verdad.** El servidor no puede importar `render` (capas: `tools/layers.json`) ni arrastrar three. Por eso `alturaEn` y
su ruido viven ahora en `packages/relieve` y `render/naturaleza/terreno.ts` los importa. Los flotantes salen de `Math.hypot/cos/pow`;
se cuantizan UNA vez por vértice a 1/64 m. Que dos motores JS redondeen distinto justo en un borde de 1/64 m es de orden 1e-9 por malla;
si pasara, el servidor manda y la página se corrige (cuenta en `stats.corrections`).

**Resolución (decidido y medido).** Celdas de **2 m**, como mucho 100 por lado (mundo de 400 m → celdas de 4 m): **20 800 triángulos**
(20 000 de suelo + 800 de muro), construir **11 ms** de mediana (10–29 ms) en servidor y lo mismo en la página, una vez; ≈ 0,9 MB de
memoria. Misma diagonal alternada que el dibujo (`(i+j)&1`). Error contra `alturaEn` (semilla 1234, sobre suelo caminable, 88 000 puntos):
mediana 2 cm, p95 15 cm, p99 32 cm, máx. 1,4 m en las aristas vivas de las crestas (semilla 77, muy rocosa: p95 49 cm). El dibujo mismo
tiene el problema (nivel A, 2,8 m/celda: p95 25 cm contra la función), así que **no** subimos a 1 m (80 000 triángulos). Diferencia entre la colisión y lo
**dibujado** por nivel (p50 / p95 / p99, semilla 1234): A 2,5 / 18 / 37 cm · B 5 / 34 / 61 · C 7 / 44 / 78 · D 11 / 64 / 101. O sea: en un
móvil viejo los pies pueden hundirse o flotar hasta ~0,6 m en el 5 % peor del suelo (lomas con detalle fino) y ~1 m en el 1 %; en llano y
prado casi nada. Seguimiento posible: que el avatar dibujado use `groundHeight` de la malla (ya lo usa) y que el nivel D dibuje más celdas.

**Reglas decididas.**
- **Agua no sólida.** Se **vadea**: el fondo del estanque (hasta −1,65 m, agua en −0,2 m) se pisa como cualquier suelo; no hay nadar, ni corriente, ni
  regla de calado. (Si algún día hace falta, es una pieza aparte, R-1.)
- **Pendiente.** Triángulos a más de 50° (`MAX_SLOPE_COS`) son pared: no se suben ni se pisan (se resbala por ellos, M6 h6). Prado y bosque
  quedan casi siempre por debajo; las crestas de roca sí bloquean.
- **Borde del mundo.** Un muro invisible alrededor del cuadrado (de 4 m bajo el borde a 8 m sobre él; pared de triángulos verticales) y, por
  detrás, el «suelo de la muerte» D-045: si el mundo no trae `sueloMinimo` y la naturaleza está encendida, la instancia usa **el punto más bajo
  del terreno − 8 m** (`sueloMinimoTerreno`; unos −10 m con la semilla 1234) y devuelve a la última posición segura. Un `sueloMinimo` del mundo manda
  siempre. Por fuera de la malla no hay suelo: la persona cae hasta ese mínimo y vuelve.
- **Aparición.** Sin `aparicion` en `entorno.json`, la gente aparece **dentro de la plaza** (cuadrado de lado 1,2 × `plaza`, el 60 % del radio, que cabe en
  el disco llano) y a la altura del terreno (`groundHeight` desde arriba). La plaza vale 0 exacto (probado), así que coincide con la altura
  antigua. Con `aparicion` propio se respeta (y se pone encima del terreno).
- **Árboles: sin colisión en esta historia** (coste: ~1000 cilindros que consultar por persona y tick; tope de 512 cajas `solids`).
  Se atraviesan. Seguimiento: troncos como cajas solo dentro del anillo de la plaza o una rejilla de ocupación en el servidor.
- **Mundo con malla GLB y naturaleza a la vez:** se juntan los triángulos de las dos en un solo árbol (`combinarMallas`).

**El único cambio en la simulación (y por qué no toca la huella).** `SimState.piso` (0 por defecto): la altura del «suelo plano» que
`groundHeight` usa como base. Con terreno vale −500 m (`PISO_SIN_SUELO`); sin terreno sigue 0 y todo es idéntico. Hacía falta porque el
terreno baja de 0 (estanque, cuencas) y con la base en 0 el avatar **flotaba a 0 m sobre el fondo** — lo encontró la prueba de andar 45 m.
Además `onFloor` miraba solo `solids` y ahora mira «hay geometría» (cajas o malla): arreglo para mundos con malla GLB, que no guardaban
la posición segura. `piso` no está en `snapshot`/`stateHash`: es geometría del mundo, como `solids`.

**Medidas** (`node tools/naturaleza-colision.ts` en `mundo-demo` y un script de `step` solo; portátil compartido, Node):
- Coste de `step` con terreno vs sin él (p50; 1 / 50 / 200 / 1000 avatares andando y algunos corriendo): 0,006 / 0,033 / 0,069 / **0,317 ms** con terreno
  frente a 0,002 / 0,008 / 0,020 / **0,076 ms** sin él. **≈ 0,3 µs más por avatar y tick** (rayo abajo + caja-triángulo, M6). p99 con 1000: 0,54 ms.
- Tick entero de la instancia con bots reales (p50; snapshots y todo): 50 avatares 0,29 ms con terreno vs 0,22 sin él; 200: 1,48 vs 1,33 ms.
- Prueba de 2 minutos de juego con 1 / 50 / 200 bots sobre el relieve real: 602 400 muestras, **0 flotando, 0 hundidos, 0 sin suelo**.
- Construir la malla: 11 ms (una vez por cambio de números del mundo, no por tick), en servidor y en la página.

**Pruebas** (`test/naturaleza-colision.test.ts`, 15): clave del estado y validación · malla ≤ 22 000 triángulos, mismos bits dos veces y fijados · mundo de
400 m con el mismo presupuesto · andar 45 m en 16 direcciones con dos semillas (siempre sobre la malla, 0 ticks en el aire, ≤ 0,9 m de
`alturaEn`) · línea tranquila de 40 m dentro de ±0,05 m de `alturaEn` · correr · plaza plana y fondo del estanque pisable · cuesta de 30° se sube y de 60°
no · muro del borde en 4 direcciones corriendo · suelo mínimo por defecto · `combinarMallas` · sin naturaleza: sin malla y huella de referencia intacta · misma huella
dos veces con terreno y `setMesh` no cambia el hash · instancia + cliente reales (aparece en la plaza, camina 500 ticks, **0 correcciones**) ·
caer fuera del mapa vuelve por el suelo mínimo por defecto.

**Copiado / cambiado / combinado.** Copiado: todo M6 (`bvh.ts`, `setMesh`, `groundHeight`, `MAX_SLOPE_COS`, `blockedMesh`, `sitioLibre`), D-045 (suelo de la
muerte) y la diagonal alternada de `terreno.ts`. Cambiado: la fuente de los triángulos (una función en vez de un GLB), una malla gruesa
(2 m) frente a la dibujada, un muro en el borde, `piso`. Combinado: terreno + malla GLB en un árbol. Nada nuevo en `step`.


## F1 · Fauna electrónica: la tabla y «quién hay en el mundo» (`relieve/fauna.ts`, `naturaleza/fauna.json`)

**Qué es.** Mariposas de día, luciérnagas de noche y pájaros, **electrónicos / biomecánicos** (cuerpo de metal, alas con líneas de circuito que
brillan, lucecitas), de **36 razas** (12 por grupo) con una **rareza** cada una. Esta historia es **solo la parte pura**: la tabla, su
validación y la función que dice qué individuos viven en una celda de 32 m durante una ventana de 120 s. **No dibuja nada**: F2 (mariposas +
luciérnagas) y F3 (pájaros) leen lo que devuelve. Todo es función de enteros: sin `Math.random`, sin reloj, sin red; el servidor y todas las
páginas calculan **los mismos bichos** para el mismo `(semilla, celda, ventana)`.

**Dónde está.**
- `packages/relieve/src/fauna.ts` — puro, sin dependencias (en `relieve` para que lo compartan servidor y página; la regla de capas
  `tools/layers.json` no cambia para `relieve`, pero **`features` puede importar `relieve`** desde ahora: una línea).
- `features/naturaleza/fauna.json` — la tabla de la casa (`numinia-engine/fauna@1`, con su `_doc` en español, mismo estilo que `peces.json`).
- `features/naturaleza/fauna-casa.ts` — la tabla ya validada (`FAUNA_CASA`: colores `"#rrggbb"` → enteros); la página la recibe por la raíz de
  composición (`apps/plaza/main.ts` puede importar `features/`), nunca desde `render/`.
- `packages/render/src/naturaleza/niveles.ts` — reexporta `FAUNA_POR_NIVEL` (los números viven en `relieve` porque servidor y páginas deben coincidir).
- `naturaleza.json` gana `fauna: { activa?, densidad?, especies? }` (`esquema.ts`).

### La interfaz (estable; F2 y F3 solo leen esto)

```ts
import { habitantes, ventanaDe, fundido, trayectoria, especiesDe, probabilidad, pVerRareza, FAUNA_POR_NIVEL, CELDA_M, VENTANA_S } from "packages/relieve/src/fauna.ts";
// la celda: cx = Math.floor(x / 32), cz = Math.floor(z / 32); la ventana: ventanaDe(segundosDelRelojDelMundo)  (= floor(t / 120))
const vivos = habitantes(semilla, { cx, cz }, ventana, tabla, { zonaEn, alturaEn, hora, densidad, nivel, especies? });
// → Habitante[] = { id, especie, x, y, z, fase, semillaPropia, n }
```

- `tabla` = `TablaFauna` (`{ schema, especies: Especie[] }`): `FAUNA_CASA` o la propia del mundo (ya validada con `validarTabla`).
- `ctx.zonaEn(x,z)` y `ctx.alturaEn(x,z)` son las del terreno (`relieve.ts`, semilla del mundo); `ctx.hora` = hora 0–24 del reloj de día de
  `entorno` (`faseDelDia(h)`: crepúsculo 5,5–7,5 y 18–20,5; día 7,5–18; noche el resto); `ctx.densidad` 0–1 (`naturaleza.faunaDensidad`);
  `ctx.nivel` `"A"|"B"|"C"|"D"` (el de `calidad.ts`); `ctx.especies` = la lista blanca del mundo (`faunaEspecies.split(",")`, vacía = todas).
- Un `Habitante` es un **punto de anclaje** (`x,y,z`, con `y` ya sobre el suelo y a la altura de vuelo de su raza), no una trayectoria: la página
  lo mueve como quiera (`vuelo.radio`, `vuelo.velocidad`); `trayectoria(h, especie, t)` da una por defecto (lazo de Lissajous alrededor del
  ancla, determinista, dentro de `vuelo.radio`). `fase` 0–1 desfasa el aleteo/pulso; `semillaPropia` es un entero para variar tinte o tamaño;
  `n` = cuántos van juntos (pájaros en bandada, 1–8; el resto 1). **Cuenta como una sola entrada** para los topes.
- `id` es único en el mundo durante esa ventana (`m|l|p` + celda + ventana + hueco). Para no hacer saltos al cambiar de ventana (cada 120 s sale
  otra población) usa `fundido(segundosDentroDeLaVentana)` (0→1 en 4 s al entrar, 1→0 en los 4 últimos).
- **Cada nivel es un prefijo del anterior**: el nivel D ve los primeros huecos de los mismos bichos que ve el A (mismos `id`); el nivel solo
  recorta la lista. `FAUNA_POR_NIVEL[nivel]` = `{ radio, enVista, celda }`: radio de la vista (m), tope de bichos a la vez en esa vista y tope por celda.
- La página pide las celdas dentro de `FAUNA_POR_NIVEL[nivel].radio` de la cámara y vuelve a pedirlas **solo al cruzar de celda o de ventana**
  (coste: ~0,01 ms por celda; nada por fotograma).

### Cómo se decide quién está (el modelo)

Por cada **celda × ventana × grupo** hay `celda[grupo]` huecos (los topes del nivel). Cada hueco, con 8 números del flujo `crearAzar(hash(semilla,
celda, ventana, grupo))` (mismo consumo siempre → por eso un nivel es prefijo del otro):
1. Se sortea un punto de la celda; `zonaEn` da su zona.
2. Peso efectivo de cada raza = `peso × actividad(hora de la raza, parte del día) × afinidad(zona)`. **Actividad**: su hora = 1; en el
   crepúsculo las de día/noche 0,4; las de crepúsculo vuelan un poco de día (0,3) y de noche (0,15). **Afinidad**: 1 en sus zonas, 0,25 fuera.
3. El hueco se llena con probabilidad `0,8 × densidad × (Σ pesos efectivos / Σ pesos)` (a mediodía en pleno prado se llena el 80 % de los huecos
   de mariposa; sin su zona, menos; de noche, ninguno), y la raza sale por ruleta con esos pesos, igual que `elegirPez` de la pesca.
4. Altura = suelo + un valor entre `vuelo.altura`; `n` entre `bandada`.

**Copiado / cambiado / combinado.** *Copiado*: el estilo de la tabla, el vocabulario (`rareza` comun/rara/legendaria, `peso`) y la ruleta de
`features/pesca` (`peces.json`, `elegirPez`); `crearAzar`/`hash2` de `semilla.ts`; la idea de «una celda y una ventana de tiempo deciden quién vive
ahí» sin estado (la de los generadores por trozo de los juegos de bloques). *Cambiado*: la pesca saca **un** pez por lance y por eso reparte
70/25/5; aquí un visitante cruza **cientos** de bichos por media hora, así que las mismas palabras llevan cuotas ~100 veces menores (abajo); se
añade `epica` **solo en fauna** (el enum de la pesca viaja por el cable y no se toca). *Combinado*: las zonas del terreno (N1), el reloj de día de
`entorno`, los niveles A/B/C/D de `calidad.ts`, y `fauna.json` propio del mundo como `peces.json`/`pesca.json`.

### Rarezas: el objetivo y los números

Objetivo declarado (un visitante que **camina 30 min a 1,2 m/s** y se fija en lo que pasa a menos de **12 m**; nivel B, la referencia):
**P(ver ≥1 legendaria) ≈ 10–20 %** (una vez cada 3-5 horas andando), **P(épica) ≈ 40 %**, **P(rara) ≥ 85-90 %** (casi todas las visitas), **común siempre**.
Modelo: bichos vivos por m² (`celda × 0,8 × densidad / 1024` por la mezcla de zonas del mundo de semilla 1234: 65 % prado, 16 % bosque, 3 % arena,
12 % roca, 4 % orilla) × área barrida por ventana (`π·12² + 2·12·1,2·120 ≈ 3 900 m²`) × 15 ventanas; `P(ver) = 1 − e^(−esperados)`
(`probabilidad()` por raza, `pVerRareza()` por rareza; una prueba lo fija y otra lo compara con una simulación de `habitantes`).
**Cuotas por grupo** (suman 100 000; `peso` de cada fila): común **98 960** · rara **800** · épica **180** · legendaria **60** (≈ 99,0 / 0,8 / 0,18 / 0,06 %),
repartidas dentro de la rareza. La afinidad por zona (0,25 fuera de las suyas) hace que las razas de una sola zona escasa (orilla, roca) salgan menos de lo que dice su cuota: los números de abajo ya lo incluyen.

Probabilidad de ver al menos un bicho de cada rareza en 30 min andando (peso → resultado, tabla de la casa, mundo semilla 1234):

| Nivel | hora | común | rara | épica | legendaria |
|---|---|---|---|---|---|
| A | día | 100.0 % | 94.6 % | 42.6 % | 16.6 % |
| A | noche | 100.0 % | 90.5 % | 53.4 % | 18.7 % |
| B | día | 100.0 % | 94.6 % | 42.6 % | 16.6 % |
| B | noche | 100.0 % | 90.5 % | 53.4 % | 18.7 % |
| C | día | 100.0 % | 93.1 % | 39.8 % | 15.2 % |
| C | noche | 100.0 % | 90.5 % | 53.4 % | 18.7 % |
| D | día | 100.0 % | 83.1 % | 28.7 % | 10.4 % |
| D | noche | 100.0 % | 81.4 % | 42.1 % | 13.8 % |

Nivel D: ve menos bichos a la vez (10 mariposas en vista contra 36), así que ve menos raros; es lo que se pretende. Para jugar con la tabla:
sube o baja las cuatro cuotas de **todos los grupos a la vez** (un mundo propio lo hace en su `fauna.json`) y mira `probabilidad()` / `pVerRareza()`; doblar
el peso de una raza dobla casi su aparición.

### Topes por nivel (`FAUNA_POR_NIVEL`)

| Nivel | radio de vista | mariposas a la vez | luciérnagas a la vez | pájaros (entradas) | tope por celda (mar/luc/páj) |
|---|---|---|---|---|---|
| A | 48 m | 60 | 90 | 16 | 10 / 14 / 3 |
| B | 36 m | 36 | 54 | 10 | 10 / 14 / 3 |
| C | 30 m | 24 | 36 | 7 | 9 / 14 / 3 |
| D | 24 m | 10 | 16 | 3 | 6 / 10 / 2 |

El tope por celda es `ceil(enVista / celdas de 32 m que caben en el disco de la vista)` (+1 donde hacía falta para que un nivel mayor nunca
tenga menos que uno menor). Un pájaro-entrada puede ser una bandada de hasta 8: F3 cuenta pájaros como `Σ n`. Una prueba mira que ninguna
celda pase su tope y que el disco entero se quede por debajo de `enVista`.

### `fauna` en `naturaleza.json` y `fauna.json` propio

```json
{ "semilla": 1234, "fauna": { "activa": true, "densidad": 0.7, "especies": ["luciernaga-ambar", "luciernaga-lima", "mariposa-rele"] } }
```
Todo opcional (sin `fauna`, o sin `especies`: activa, densidad 1, todas las razas). Claves de más, tipos malos o un id que no existe en la tabla
se rechazan **con su ruta y cómo arreglarlo** (`naturaleza.fauna.especies: no existe(n) en la tabla: "dragon"; los ids son: …`), todos a la vez; el
fichero malo no se usa y el mundo sigue plano (como el resto de `naturaleza.json`). Viaja en el estado `naturaleza:mundo` como `fauna` (bool),
`faunaDensidad` (0–1) y `faunaEspecies` (ids separados por comas, ≤ 512 bytes; vacío = todas). Un mundo puede traer **su propio `fauna.json`**
(misma forma que la tabla de la casa; `features/mundo.ts` lo valida con `validarTabla`; si está mal, se registra `[mundo] fauna.json no se usa (uso la
tabla de la casa): …` y vale la de la casa; los ids de `naturaleza.fauna.especies` se comprueban contra la tabla que valga). **Pendiente para F2:**
la tabla propia llega hasta el servidor pero **aún no viaja a la página** (8 kB no caben en el estado; hay que elegir cómo servirla, p. ej. como
fichero estático del mundo); mientras tanto la página usa `FAUNA_CASA`. Nota: `normalizar()` de `naturaleza.ts` ya lleva los tres campos, así que
cambiar la densidad reconstruye toda la naturaleza; F2 puede separarlo si molesta.

### Las 36 razas

Colores: `luz` = el brillo de la lucecita (lo que distingue a las luciérnagas; las 12 están a ΔE Lab ≥ 20 entre sí, una prueba lo comprueba),
`ala` = ala o plumaje; además cada raza lleva `cuerpo` (el metal) y `circuito` (las líneas que brillan) en `fauna.json`. Los nombres usan los
materiales de los Residuos del glosario (válvulas, lentes, bobinas, engranajes): máquinas y piezas, sin inventar sucesos ni lugares de la lore.
Pulsos de luz: `fijo`, `latido`, `parpadeo`, `onda`, `respiro`, `estrobo`, `morse`, `prisma` (cambia de tono). Cuanto más rara, más
inusual el color o el pulso (las épicas y legendarias usan `estrobo`, `morse`, `prisma` o un latido lento rojo).

**Mariposas** (día; envergadura en m)

| Nombre | id | Rareza | peso | Luz (color · pulso) | Ala / plumaje | Zonas | Hora | Tamaño m | Bandada |
|---|---|---|---|---|---|---|---|---|---|
| Mariposa de relé | `mariposa-rele` | comun | 30000 | `#5ad8ff` · parpadeo | `#7fa6d9` | prado, orilla | dia | 0.16 | — |
| Mariposa de bobina | `mariposa-bobina` | comun | 25000 | `#ffd24a` · latido | `#e7a15a` | prado, bosque | dia | 0.15 | — |
| Mariposa de latón | `mariposa-laton` | comun | 20000 | `#fff08a` · fijo | `#e6cf6a` | prado, arena | dia | 0.14 | — |
| Mariposa de lente | `mariposa-lente` | comun | 13960 | `#8affd0` · respiro | `#9fd9b0` | bosque, orilla | dia | 0.16 | — |
| Mariposa de engranaje | `mariposa-engranaje` | comun | 10000 | `#c9a8ff` · onda | `#b3a9c9` | roca, prado | dia | 0.17 | — |
| Mariposa de válvula | `mariposa-valvula` | rara | 330 | `#ff9a6a` · latido | `#e0675a` | prado, bosque | dia | 0.18 | — |
| Mariposa de cobre verdín | `mariposa-verdin` | rara | 270 | `#7affd8` · onda | `#4fb59a` | orilla, roca | dia | 0.17 | — |
| Mariposa de filamento | `mariposa-filamento` | rara | 200 | `#ffc24a` · respiro | `#ffe7a8` | arena, prado | dia | 0.16 | — |
| Mariposa de condensador | `mariposa-condensador` | epica | 100 | `#7aa2ff` · estrobo | `#3f62d9` | bosque, orilla | dia | 0.21 | — |
| Mariposa de cuarzo | `mariposa-cuarzo` | epica | 80 | `#f0b8ff` · onda | `#c58ae6` | roca, prado | dia | 0.22 | — |
| Mariposa de aurora | `mariposa-aurora` | legendaria | 32 | `#b6fff0` · prisma | `#6ff0c8` | prado | dia | 0.28 | — |
| Mariposa de mercurio | `mariposa-mercurio` | legendaria | 28 | `#ffffff` · morse | `#e6ecf5` | roca, orilla | dia | 0.26 | — |

**Luciérnagas** (noche; largo del cuerpo en m; se distinguen por el color de la luz)

| Nombre | id | Rareza | peso | Luz (color · pulso) | Ala / plumaje | Zonas | Hora | Tamaño m | Bandada |
|---|---|---|---|---|---|---|---|---|---|
| Luciérnaga ámbar | `luciernaga-ambar` | comun | 35000 | `#ffa81f` · latido | `#4a4756` | prado, bosque | noche | 0.06 | — |
| Luciérnaga lima | `luciernaga-lima` | comun | 28000 | `#b4e83c` · parpadeo | `#4a4756` | prado, orilla | noche | 0.06 | — |
| Luciérnaga esmeralda | `luciernaga-esmeralda` | comun | 20960 | `#2edc5f` · respiro | `#4a4756` | bosque | noche | 0.06 | — |
| Luciérnaga turquesa | `luciernaga-turquesa` | comun | 15000 | `#35e0b0` · onda | `#4a4756` | orilla, bosque | noche | 0.06 | — |
| Luciérnaga cobalto | `luciernaga-cobalto` | rara | 240 | `#4d7dff` · latido | `#59607a` | orilla | noche | 0.065 | — |
| Luciérnaga rosa | `luciernaga-rosa` | rara | 210 | `#ff7eb6` · respiro | `#6a5a6e` | prado | noche | 0.065 | — |
| Luciérnaga bermellón | `luciernaga-bermellon` | rara | 190 | `#ff5a2a` · parpadeo | `#6a5258` | roca, arena | noche | 0.065 | — |
| Luciérnaga violeta | `luciernaga-violeta` | rara | 160 | `#9a6bff` · onda | `#5c5470` | bosque, roca | noche | 0.065 | — |
| Luciérnaga magenta | `luciernaga-magenta` | epica | 100 | `#e83cff` · estrobo | `#5c4a70` | bosque, prado | noche | 0.07 | — |
| Luciérnaga cian | `luciernaga-cian` | epica | 80 | `#00e5ff` · morse | `#3f5a72` | orilla, bosque | noche | 0.07 | — |
| Luciérnaga carmesí | `luciernaga-carmesi` | legendaria | 32 | `#ff1a3c` · latido | `#5a2a3a` | roca | noche | 0.08 | — |
| Luciérnaga de prisma | `luciernaga-prisma` | legendaria | 28 | `#f5f5ff` · prisma | `#e6ecf5` | prado, orilla | noche | 0.08 | — |

**Pájaros** (día, algunos al crepúsculo; envergadura en m; `bandada` = pájaros juntos)

| Nombre | id | Rareza | peso | Luz (color · pulso) | Ala / plumaje | Zonas | Hora | Tamaño m | Bandada |
|---|---|---|---|---|---|---|---|---|---|
| Gorrión de latón | `gorrion-laton` | comun | 30000 | `#ffd86a` · parpadeo | `#c9a24a` | prado, arena | dia | 0.2 | 2–5 |
| Paloma de engranajes | `paloma-engranajes` | comun | 25000 | `#a8d8ff` · respiro | `#9aa3b5` | arena, prado, roca | dia | 0.45 | 2–6 |
| Estornino de cobre | `estornino-cobre` | comun | 20000 | `#ff9a5a` · onda | `#b8693d` | prado, bosque | dia | 0.3 | 3–8 |
| Golondrina de bobina | `golondrina-bobina` | comun | 13960 | `#7aa2ff` · latido | `#4f5f9a` | orilla, prado | crepusculo | 0.32 | 2–5 |
| Petirrojo de válvula | `petirrojo-valvula` | comun | 10000 | `#ff6a4a` · fijo | `#8a8594` | bosque, prado | dia | 0.22 | 1–2 |
| Colibrí de filamento | `colibri-filamento` | rara | 330 | `#ffe27a` · estrobo | `#6fd08a` | prado, orilla | dia | 0.14 | — |
| Mirlo de lente | `mirlo-lente` | rara | 270 | `#8affd0` · respiro | `#3a3744` | bosque | crepusculo | 0.34 | 1–2 |
| Martín pescador de zafiro | `martin-zafiro` | rara | 200 | `#5ad8ff` · latido | `#3f7fd9` | orilla | dia | 0.3 | — |
| Búho de relojería | `buho-relojeria` | epica | 100 | `#ffc24a` · morse | `#8a6a3a` | bosque, roca | crepusculo | 0.9 | — |
| Cuervo de hierro | `cuervo-hierro` | epica | 80 | `#c9a8ff` · onda | `#4a4756` | roca, bosque | dia | 0.95 | 1–3 |
| Grulla de mercurio | `grulla-mercurio` | legendaria | 32 | `#ffffff` · prisma | `#e6ecf5` | orilla | dia | 1.8 | 1–2 |
| Águila de cuarzo | `aguila-cuarzo` | legendaria | 28 | `#f0b8ff` · latido | `#c58ae6` | roca | dia | 2 | — |

Probabilidad por raza (nivel B; «% de su grupo vivo» = qué parte de los bichos de su grupo que hay vivos es de esa raza en ese momento, mezcla
de zonas de la semilla 1234; «P(ver)» = al menos uno en 30 min andando; `—` = no sale a esa hora):

| Especie | Rareza | % de su grupo vivo (día) | P(ver ≥1) en 30 min, día | % de su grupo vivo (noche) | P(ver ≥1) en 30 min, noche |
|---|---|---|---|---|---|
| Mariposa de relé | comun | 31.03 % | 100.0 % | — | — |
| Mariposa de bobina | comun | 28.89 % | 100.0 % | — | — |
| Mariposa de latón | comun | 20.49 % | 100.0 % | — | — |
| Mariposa de lente | comun | 7.53 % | 100.0 % | — | — |
| Mariposa de engranaje | comun | 11.15 % | 100.0 % | — | — |
| Mariposa de válvula | rara | 0.38 % | 72.6 % | — | — |
| Mariposa de cobre verdín | rara | 0.13 % | 36.7 % | — | — |
| Mariposa de filamento | rara | 0.20 % | 50.2 % | — | — |
| Mariposa de condensador | epica | 0.054 % | 16.7 % | — | — |
| Mariposa de cuarzo | epica | 0.089 % | 26.2 % | — | — |
| Mariposa de aurora | legendaria | 0.032 % | 10.2 % | — | — |
| Mariposa de mercurio | legendaria | 0.014 % | 4.6 % | — | — |
| Luciérnaga ámbar | comun | — | — | 45.63 % | 100.0 % |
| Luciérnaga lima | comun | — | — | 32.67 % | 100.0 % |
| Luciérnaga esmeralda | comun | — | — | 11.79 % | 100.0 % |
| Luciérnaga turquesa | comun | — | — | 9.12 % | 100.0 % |
| Luciérnaga cobalto | rara | — | — | 0.10 % | 35.0 % |
| Luciérnaga rosa | rara | — | — | 0.24 % | 63.0 % |
| Luciérnaga bermellón | rara | — | — | 0.10 % | 35.7 % |
| Luciérnaga violeta | rara | — | — | 0.11 % | 37.6 % |
| Luciérnaga magenta | epica | — | — | 0.13 % | 42.3 % |
| Luciérnaga cian | epica | — | — | 0.049 % | 18.6 % |
| Luciérnaga carmesí | legendaria | — | — | 0.017 % | 6.7 % |
| Luciérnaga de prisma | legendaria | — | — | 0.033 % | 12.9 % |
| Gorrión de latón | comun | 31.06 % | 100.0 % | — | — |
| Paloma de engranajes | comun | 28.95 % | 100.0 % | — | — |
| Estornino de cobre | comun | 23.37 % | 100.0 % | — | — |
| Golondrina de bobina | comun | 4.38 % | 98.8 % | 98.66 % | 89.0 % |
| Petirrojo de válvula | comun | 11.68 % | 100.0 % | — | — |
| Colibrí de filamento | rara | 0.35 % | 29.4 % | — | — |
| Mirlo de lente | rara | 0.041 % | 4.0 % | 0.92 % | 2.0 % |
| Martín pescador de zafiro | rara | 0.076 % | 7.4 % | — | — |
| Búho de relojería | epica | 0.019 % | 1.9 % | 0.42 % | 0.9 % |
| Cuervo de hierro | epica | 0.050 % | 4.9 % | — | — |
| Grulla de mercurio | legendaria | 0.012 % | 1.2 % | — | — |
| Águila de cuarzo | legendaria | 0.013 % | 1.3 % | — | — |

**Pruebas:** `test/naturaleza-fauna.test.ts` (13: tabla válida con ≥ 10 razas por grupo y ids ascii, ≥ 10 colores de luciérnaga distintos (ΔE),
determinismo y pureza (sin reloj ni azar), 100 000 sorteos dentro de 4σ del modelo en los tres grupos, día/noche/crepúsculo, afinidad por zona,
densidad y lista blanca, topes por nivel y nivel = prefijo del mayor, objetivo de rareza (legendaria 10–20 %, épica 33–55 %, rara ≥ 85 %), el modelo
contra una simulación, trayectoria, errores de validación de la tabla y de `fauna` en `naturaleza.json`, `fauna.json` propio con `conMundo`, capas).
