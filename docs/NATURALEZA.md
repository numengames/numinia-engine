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


## F2 · Mariposas y luciérnagas electrónicas (`naturaleza/mariposas.ts`)

Dos mallas instanciadas, **2 llamadas de dibujo en total** (una de día, una de noche en la práctica; nunca más de 2): todas las mariposas de las
12 razas en una, todas las luciérnagas de las 12 razas en otra. Sin texturas, sin luces, sin pasada extra, sin sombra, sin trabajo de CPU por animal
y fotograma. F4 la cablea; F2 no toca `naturaleza.ts`.

```ts
const ins = crearInsectos({ vientoU, nivel, camara, hora: () => entorno.hora, tabla }, { semilla, alturaEn, zonaEn }, { escena, densidad, especies });
ins.mallas      // [mariposas, luciérnagas] (Mesh, ya con boundingSphere; añadidas a opciones.escena si se da)
ins.actualizar(camara, tReloj)  // 1 vez por fotograma
ins.llenarTodo(camara, tReloj)  // pantalla de carga / pruebas: pide todo el anillo ya
ins.visibles(); ins.estadisticas(); ins.dispose()
```

**Quién hay y dónde.** `habitantes` de F1 por celdas de 32 m alrededor de la cámara; las celdas se piden **solo** al cruzar un borde de celda o al
cambiar la ventana de 120 s, repartidas en fotogramas (≤ 0,3 ms por fotograma, `presupuestoMs`) y el buffer se cambia de golpe cuando el anillo está
completo. Entran los más cercanos hasta `FAUNA_POR_NIVEL[nivel].enVista`. Medido (nivel A, andando 600 m): fotograma tranquilo 0,0003 ms (p99 0,0008),
fotograma con relleno mediana 0,14 ms, máximo 0,29 ms.

**Vuelo en el vertex shader.** Por instancia: ancla (x,y,z), raza, radio, velocidad angular, dos fases, amplitud vertical, fase de luz, jitter de tamaño
(3 buffers vec4; WebGPU permite 8 buffers de vértices). La fórmula de `trayectoria` de F1 está escrita **una sola vez** sobre un juego mínimo de
operadores (`trayectoriaOps`, `fundidoOps`, `pulsoOps`) y se instancia con números (CPU) y con nodos TSL (GPU): no puede divergir. Pruebas: la
versión numérica coincide con `trayectoria`/`fundido` de F1 a 1e-9, su derivada es la velocidad real (el animal mira hacia donde avanza), y la
versión TSL construye. **Prueba en GPU** (`.run/f2`, `escena=paridad`): una luciérnaga blanca fija, centroide del brillo en pantalla frente a la
proyección de `trayectoria` de F1 en 6 instantes: error 0,6–0,7 px (el medio píxel del centro del píxel); 5 de 6 dentro de pantalla.

**Mariposa** (31 triángulos en A–C, 23 en D): cuerpo-huso de metal oscuro (4), LED del tórax (1), 2 antenas (A–C), 2 alas × 4 triángulos con 2 líneas de
circuito brillantes y 2 almohadillas-LED por cara (en D solo cara superior). Aletea en el shader (ritmo por raza, rachas de planeo, vaivén del
cuerpo), tamaño = `tamano` de la tabla ±8 %. Los colores son **roles** en el vértice (ala, sombra, línea, luz) resueltos con la paleta de la raza por
máscaras sobre una tabla constante (sin indexar uniformes, sin texturas): una sola malla pinta las 12 razas (máx. 32, error claro si se pasa). Las
puntas de ala, las líneas y los LED no llevan luz (siguen brillando con niebla) y laten con el patrón de luz de la raza; el resto se sombrea con un
escalar (1 de día, 0,25 de noche).

**Luciérnaga:** quad que mira a la cámara (2 triángulos), halo suave + núcleo caliente en el fragment, mezcla aditiva (igual en WebGPU y WebGL2, sin
niebla, sin escritura de profundidad), solo con oscuridad × `fundido`. 8 patrones (`fijo, latido, parpadeo, onda, respiro, estrobo, morse, prisma`;
`prisma` cicla el tono) evaluados en el shader; la prueba comprueba que se distinguen entre sí y sus formas (morse = punto-raya-punto-punto, etc.).
Las raras son más grandes y brillantes (legendaria ≈ 1,9× de radio, 1,8× de brillo, **anillo + estrella de cuatro puntas** y ritmo 40 % más lento).

**Presupuesto** (todo lleno, peor caso, ambos grupos): A 2040 / B 1224 / C 816 / D 242 triángulos (tope de toda la fauna 6000/4000/4000/1500: queda ≥ 65 %
para los pájaros de F3); 2 llamadas; ≤ 7 200 bytes de instancias en A.

**Fotos** (`.run/f2`, terreno de prueba; en `work/naturaleza/fotos/f2-*.png`): mariposa de cerca a 1,7 m de día/noche, 12 razas en fila, prado de día,
prado de noche, las 12 luciérnagas en fila (identificación: se distinguen ≥ 10 colores), legendaria de cada grupo.

**Límites conocidos.** Las mariposas no usan el viento (`vientoU` queda en la firma). Sin colisión con la hierba. «Dibujadas ahora, se cambiarán»: la
geometría y los roles están aislados en `geometriaMariposa`. Las luciérnagas de día no se dibujan (no hay llamada de dibujo).

**Pruebas:** `test/naturaleza-mariposas.test.ts` (13).


## F3 · Aves electrónicas: 12 razas, 4 cuerpos, una sola llamada de dibujo (`naturaleza/aves.ts`)

`crearAves(h:{vientoU, nivel, camara?, hora(), tabla}, fuente:{semilla, alturaEn, zonaEn}, op?)` → `{ mallas, malla, actualizar(camara, tReloj), llenarTodo, exponer, fijarReloj, visibles, lideres, estadisticas, dispose, especies, plazas, lejosM, anillo, geometria }`.
No se cablea en `naturaleza.ts` (lo hace F4): el padre añade `aves.mallas` a la escena y llama `actualizar(camara, tReloj)` cada frame
(`tReloj` = reloj del mundo en segundos). `op`: `escena`, `nivel`, `densidad`, `especies` (lista blanca del mundo), `presupuestoMs`, `plazas`, `lejosM`.

**Qué se dibuja.** TODAS las aves del mundo son UNA malla instanciada: **1 llamada de dibujo en los cuatro niveles** (medido a nivel GL con la
página de fotos: la escena vacía hace 1, con las aves 2; sin texturas, sin luces, sin sombras, sin segunda pasada: `forceSinglePass`). Sin segunda
malla de lejos: la silueta lejana es la MISMA malla con otra pose (ver LOD).

**Un ave = 39 triángulos** (no indexada, 117 vértices, atributos `position, aF, aK, aC, aU` + por instancia `iA, iB, iC`): torso 9 (dos anillos de 3
caras: lomo con arista y vientre plano), cuello 6, cabeza 6 + pico 3, **dos ojos** 2 (triángulo en cada cara lateral, emisivo), abanico de cola 3,
dos alas de 4 (dos paneles internos, panel externo y pluma de borde de fuga), dos patas 2 (rastros que en la grulla llegan lejos tras la cola).
Se construye UNA vez en pose neutra; el vertex shader la estira a cada silueta con una fila de la tabla por raza (11 `vec4`, `NK`):

| Plan | Razas | Silueta |
|---|---|---|
| `cantor` | gorrion-laton, paloma-engranajes, estornino-cobre, petirrojo-valvula, colibri-filamento, mirlo-lente | cuerpo corto, cabeza redonda, pico corto (el colibrí: pico casi tan largo como el cuerpo y alas pequeñas a 24 Hz; el mirlo: cola larga; el petirrojo: pecho hinchado) |
| `dardo` | golondrina-bobina, martin-zafiro | alas largas barridas hacia atrás, cola en horquilla (golondrina) o corta y cabeza grande con pico largo (martín) |
| `rapaz` | buho-relojeria, cuervo-hierro, aguila-cuarzo | alas anchas y romas, cola corta; búho: cabeza enorme sin cuello; águila: alas muy anchas, planeo casi continuo |
| `zancuda` | grulla-mercurio | cuello largo, pico largo, patas largas tras la cola, alas largas y estrechas |

Una raza que la tabla del mundo trae y no está en `RAZAS_AVE` cae en un plan por tamaño y velocidad (`planPorTamano`): el motor no se rompe con razas nuevas.

**Dónde está (cero CPU por ave).** La posición sale del shader: es `trayectoria` de F1 portada 1:1 a TSL (Lissajous alrededor del ancla, mismas fases y
radios), con ancla y fase por instancia. `trayectoriaAve` es el gemelo en CPU (para tests y `lideres`; con `hover = 0` es idéntica a F1, un test lo fija).
- **Rumbo**: la derivada de la trayectoria. **Alabeo**: giro coordinado `atan(v·ω/g)` con la curvatura de la trayectoria (× un factor por plan: rapaces y
  grulla se inclinan más, el cantor poco). **Cabeceo**: velocidad vertical.
- **Alas**: batido en el shader con frecuencia y amplitud por plan, con retraso de la punta y un segundo armónico. Rapaces y grulla baten en ráfagas
  (`glide` 0,8–0,95) y planean entre ellas; el cantor hace **vuelo en arcos** (bate subiendo, pliega las alas cayendo, ciclo de 0,8 s); el colibrí
  **se cierne** (la trayectoria se recorre a «arranca-y-para», ciclo de 4 s, cabeceo hacia arriba). El viento (`vientoU`) añade un temblor a la punta del ala.
- **Bandadas** (`n` de F1): los miembros comparten la trayectoria del líder; el desfase se calcula en el shader del índice de miembro: **V** (grulla)
  o **nube** (secuencia R2 de la proporción áurea + un vaivén lento). `desfaseMiembro` es el gemelo en CPU.
- **Altura**: al leer una celda se muestrean 16 puntos de la trayectoria contra `alturaEn` y se sube el ancla hasta que todo el lazo queda a ≥ `max(2, 1,6·tamaño)` m
  del suelo (+ el arco del cantor y el radio de nube de las bandadas). Un test lo comprueba en 6 instantes de la ventana y en los 4 niveles.
- **Aparecer/desaparecer**: escala por `fundido` de F1 (4 s en los bordes de la ventana de 120 s), 1,5 s de entrada para un ave que se une al banco, y
  desvanecido por distancia solo muy lejos (`lejosM + 14 … + 30`), nunca a la vista.

**Quién y cuándo se recalcula (igual que el anillo de hierba).** `habitantes` de F1 decide quién vive en cada celda de 32 m y ventana de 120 s. Las
celdas alrededor de la cámara se piden UNA vez, por orden de cercanía, con presupuesto `presupuestoMs` (0,3 ms) por frame y caché; los búferes de
instancia se reconstruyen desde la caché solo cuando llega una celda, cuando la cámara cruza una celda o cambia la ventana o el tramo del día. Un
frame normal solo escribe dos uniformes. Tope de entradas por nivel = `FAUNA_POR_NIVEL.enVista.pajaro` (una bandada es UNA entrada), cada una con
hasta 8 aves: **plazas** = `enVista.pajaro × 8` = A 128 · B 80 · C 56 · D 24.

**Lejos (LOD) sin segunda malla.** Cada vértice lleva una segunda pose («lejana»); a más de `LEJOS_POR_NIVEL` (A 60 · B 48 · C 42 · D 32 m) el shader
la mezcla en 10 m: queda un cuerpo + dos alas + cola de **7 triángulos** y los otros 32 colapsan a un punto (triángulos degenerados: no cuestan
fragmentos). Es el mismo disco, así que no hay segunda llamada ni «salto» de malla.

**Aspecto.** Color plano facetado (Phong con `flatShading` y brillo suave = metal cepillado), dos tonos por plumaje (lomo y punta de ala `ala`, vientre
`cuerpo`), una **línea de circuito** a lo largo del lomo, las alas y la cola en el color `circuito` por donde corre una luz, **dos ojos** y una lámpara
de pecho en el color `luz` de la raza con su ritmo (`fijo, latido, parpadeo, onda, respiro, estrobo, morse, prisma`). El brillo es emisivo (no recibe
luz), así que sobrevive al ocaso y a la niebla.

**Cifras (medidas).**
| Nivel | Plazas | Triángulos del peor caso (todas lejos = 7 cada una, todas cerca = 39) | Llamadas |
|---|---|---|---|
| A | 128 | ≤ 4 992 (≤ 6 000) | 1 |
| B | 80 | ≤ 3 120 (≤ 4 000) | 1 |
| C | 56 | ≤ 2 184 (≤ 3 000 estim. del presupuesto) | 1 |
| D | 24 | ≤ 936 (≤ 1 500) | 1 |

En la escena de la foto de bandadas (nivel A, 75 aves, 16 entradas) se envían 2 925 triángulos; los que rasterizan de verdad (cerca 52 × 39 + lejos 18 × 7)
son 2 154. CPU: un frame estable < 0,3 ms (test: máximo de 300 frames); leer las 21 celdas del anillo A cuesta ~1–2 ms repartidos por el presupuesto
(0,3 ms por frame); reconstruir el banco es un volcado de ≤ 128 filas.

**Pruebas:** `test/naturaleza-aves.test.ts` (10: tabla/planos de las 12 razas, geometría 39/7 triángulos, gemelo CPU de `trayectoria`, desfases de
bandada, 1 malla por nivel, topes y altura mínima por nivel, refresco solo al cruzar celda/ventana, CPU, lista blanca y densidad, dispose).
**Fotos** (`work/naturaleza/fotos/f3-*.png`, página `.run/f3`, puerto 5408): `f3-12-razas` (las 12 en 3/4), `f3-linea-peq` / `f3-linea-grandes` (perfil),
`f3-bandada-suelo` (bandada desde 1,7 m), `f3-planeo-abajo` (águila y grulla desde abajo), `f3-buhos-ocaso` (búhos y cuervo al anochecer).

**Límites conocidos / para F4.** (1) Falta cablear en `naturaleza.ts`; `lejosM` de A/B/C/D no escala con la calidad de la cámara. (2) Las razas de una
tabla de mundo con más de 16 aves distintas se recortan a 16 (el `uniformArray`). (3) Sin sombra ni colisión; las aves no esquivan árboles (la
altura mínima basta sobre el relieve, no sobre las copas: las copas de N2 no entran en `alturaEn`). (4) El brillo del circuito a mediodía es sutil; el
de los ojos y la lámpara se ve sobre todo al anochecer. (5) «Dibujadas ahora, se cambiarán»: toda la forma vive en `geometriaAve` + `PLANES`/`RAZAS_AVE`.

## F4b · La noche (sin coste)

La naturaleza ya usaba materiales con luz (Lambert); lo que fallaba era el entorno: con `hora.mueveElSol` la hora solo movía el sol, y de noche la «luna» seguía a intensidad 3 y el ambiente a 1, así que lo que mira hacia arriba (hierba, suelo) quedaba iluminado como de día. Ahora `entorno.ts` (`aplicar`) baja sol y ambiente según la altura del sol y los tiñe de azul (solo con `solHora`; el preset «noche» a mano no cambia), y todo lo que tiene luz lo sigue: dos escalares, cero llamadas y cero triángulos más (medir: A 52 157 tris / 12 llamadas, igual que antes).
Luciérnagas: radio de halo ×4 (antes ×3; las raras siguen más grandes: legendaria 0,64 m), halo más ancho y brillo ×1,5; a 3/8/15 m una común mide ≈100/37/20 px de diámetro. Fotos en `work/naturaleza/fotos/f4b-*.png`.
Queda feo: la arena y el agua siguen más claras que la hierba de noche, y el cielo de noche del mundo demo es negro (lo decide el preset, no la naturaleza).

## F5 · Cómo suenan (sintetizado, casi gratis)

`packages/render/src/naturaleza/sonido.ts` → `crearSonidoFauna({nucleo, nivel, camara, tabla, fauna}).actualizar(camara, tReloj)` / `.dispose()`. Ningún archivo de audio: todo sale de osciladores.

| Criatura | Qué suena | Alcance | Cuándo |
|---|---|---|---|
| Pájaro | trino de 2–5 notas (triángulo/cuadrada/sierra + FM suave, desafinación cuantizada «bit-crush»); tono por tamaño (pequeño = agudo, 700–4800 Hz), contorno (sube, baja, trino, arco), notas y periodo por raza (`perfilAve`); las raras suman FM | 40 m | día y crepúsculo |
| Luciérnaga | ping sinusoidal de 30–60 ms en cada pico de su luz (`PICOS_LUZ`, mismo patrón y fase que el shader); tono por el matiz del color (700–3700 Hz, rojo grave → magenta agudo); las raras suman parcial FM inarmónico y las legendarias resbalan hacia abajo | 12 m | noche (`oscuro ≥ 0,5`) |
| Mariposa | siseo de ruido filtrado (banda 1,8–3,2 kHz, modulado al ritmo de su aleteo), ganancia máx. 0,035 | 4 m | día |

- **Determinista sin red:** *quién* suena es F1 `habitantes` (celdas de 32 m alrededor de la cámara, cache por ventana de 120 s); *cuándo* es forma cerrada: las llamadas de un pájaro son función del hash de su `id` (periodo + desfase + 35 % de jitter), los pings de una luciérnaga de su patrón de luz, su `fase` y el reloj. Dos personas en el mismo sitio oyen los mismos trinos a la vez.
- **Pool:** voces creadas UNA vez (osc + modulador FM + ganancia + `StereoPanner`) y reprogramadas con la automatización del reloj de audio; tope por nivel **A 6 · B 4 · C 3 · D 0** (D no crea ni un nodo, ni pide el contexto). A y B añaden una cadena de siseo (ruido en bucle de 1 s compartido). Si no hay sitio, suena la más cercana (roba la voz más lejana). Nodos totales: A 38 · B 28 · C 16 · D 0; no crece nunca (test).
- **Panning:** `StereoPanner` por voz con el ángulo cámara-relativo (no `PannerNode`: no hay que actualizar el `AudioListener` ni HRTF; elegido por diseño, NO se midió contra `PannerNode`).
- **Cierra con el núcleo de audio (S1):** bus `ambiente` (deslizador «efectos» de la persona, ducking al hablar −6 dB, limitador del máster, pausa por pestaña oculta). No construye nada hasta el primer gesto compartido y a que el contexto esté `running`; en pausa/oculta no programa nada; sin criaturas cerca desconecta su nodo `trim` del bus tras 2,5 s (el grafo no se procesa).
- **Cableado:** `naturaleza.ts` lo importa con `import()` tras crear la fauna (tercer chunk perezoso: mundos sin fauna o en nivel D no bajan ni un byte); `index.ts` le pasa `audio()`. Apagar la fauna o cambiar su densidad lo desmonta (`dispose` para y desconecta todo).
- **Medido** (Chromium headless, `tools/naturaleza-sonido-wav.mjs`): CPU por tick (10 Hz) media 0,04–0,08 ms, máx. 2,5–5,4 ms solo al cruzar celda/ventana (relee 25 celdas); chunk `sonido-*.js` **4,0 kB gz** (página principal sin cambio); 0 llamadas de dibujo y 0 triángulos más.
- **Prueba de render offline:** `work/naturaleza/audio/{noche,dia,dia-B,noche-C}.wav` (10 s, 44,1 kHz estéreo, `OfflineAudioContext` por la misma cadena bus→VCA→máster→limitador): picos −18,4 dBFS (día) y −23 dBFS (noche), sin recorte, centroide 1,5 kHz (noche) / 5 kHz (día), nada bajo 80 Hz.
- **Límites conocidos:** la posición del sonido usa la trayectoria de F1 (los pájaros de F3 llevan además un vuelo propio: unos metros de diferencia); suena todo `habitantes` en alcance aunque el tope de dibujo (`enVista`) no lo muestre; el reloj es el local de la pestaña (como el dibujo); sin oído real aún (Quest/móvil sin probar); los grillos no hacen falta.
- **Pruebas:** `test/naturaleza-sonido.test.ts` (11).

### F5b · Noche: la orilla
La arena/orilla «más clara que la hierba» de noche no era la paleta del terreno (Lambert, ya atenuado por F4b) sino la **espuma y los destellos del agua** (`agua-estilo.ts`): llevan luz propia (`emissive = color del sol × 0,35`) y `aguaLuz.sol` era el color del sol sin intensidad, así que no bajaba de noche, y la espuma es opaca. Arreglo (`entorno.ts`, cero coste): `solColorU` se escala con el sol del reloj (`0,06 + 0,94·día`) cuando `solHora`. Fotos: `fotos/f5-noche-estanque-antes.png` / `-despues.png`.

## N6 · Una porción pequeña de la escena: el presupuesto de naturaleza se encoge

La casa adoptó el presupuesto de **escena entera** (PC ≤ 100 llamadas, 50 k triángulos, 40 MB de texturas, 24 sombras; móvil ≤ 60 / 25 k; visor ≤ 80 / 35 k).
Un mundo sin naturaleza ya gasta 82-96 llamadas y 32-53 k triángulos, así que la naturaleza entera (terreno + árboles + hierba + agua + fauna) pasa a ser una porción pequeña.
**Única fuente: `PRESUPUESTO_NATURALEZA` en `naturaleza/niveles.ts`** (totales + reparto por pieza `reparto`); `limits.json` (`nature_*`) y `FICHA-TECNICA.md` los repiten; los tests comprueban cada pieza contra su parte.

| Nivel | triángulos | llamadas | reparto de triángulos (terreno / árboles / hierba / fauna) |
|---|---|---|---|
| A (PC) | ≤ 15 000 | ≤ 8 | 3 600 / 5 200 / 4 500 / 1 700 |
| B (visor) | ≤ 10 000 | ≤ 7 | 1 800 / 3 000 / 2 500 / 1 100 |
| C (móvil) | ≤ 8 000 | ≤ 6 | 1 400 / 2 700 / 1 900 / 800 |
| D (móvil viejo) | ≤ 4 000 | ≤ 5 | 700 / 1 200 / 1 100 / 400 |

**Qué se hizo (elecciones, no recortes lineales).**
- **Árboles: 5 llamadas → 2 (A/B) o 1 (C/D).** Las cuatro especies son *una* plantilla de 40 triángulos (tronco de 5 lados + 3 copas de bipirámide pentagonal) con cuatro juegos de posiciones por vértice
  (`position`, `pos1..3`); el shader elige el juego por instancia (`especie`). Los colores de hoja (otoño, flor) van por instancia. Lejos: silueta de 26 triángulos (tronco de 3 lados). En C/D no hay malla lejana.
  Árboles cerca/visibles: A 24/184 (antes 55/340), B 16/106 (28/245), C 66/66, D 30/30.
- **Hierba: 2 llamadas → 1.** Las flores son matas de la misma malla (3 triángulos); la punta de la hoja lleva el color de la flor (`FLOR_MARCA` en `iCol.w`). Matas más anchas y altas, radio menor: A 24 m / 1 400 matas (antes 38 m / 5 600),
  B 16 m / 800, C 14 m / 600, D 10 m / 340. El fundido por distancia ya existía y reparte la densidad.
- **Terreno:** celdas A 40 (antes 72), B 28 (48), C 24 (40), D 16 (28): es de caras planas y el relieve es el mismo. En D el estanque se pinta en la propia malla del terreno (14 triángulos, sin animación): una llamada menos.
- **Fauna: se dibujan menos, no hay menos en el mundo.** `enVista` (los N más cercanos que se dibujan) baja: A 24 mariposas / 60 luciérnagas / 6 pájaros (antes 60/90/16); B 16/40/4; C 10/24/3; D 6/12/2.
  `celda` (cuántos hay en el mundo por celda de 32 m) **no cambia**, y por eso **las probabilidades de rareza publicadas no cambian** (la tabla de arriba sigue valiendo). Comprobado: los N dibujados cubren siempre más de 12 m a la redonda
  (peor caso, D con pájaros: ≈ 20 m), que es lo que mira el modelo (`aviso` = 12 m). Se conservan las 12 razas por grupo.

### Antes / después (naturaleza entera, peor hora, mundo de semilla 1234, `tools/naturaleza-medir.ts`)

| Nivel | triángulos antes → ahora | llamadas antes → ahora | buffers GPU antes → ahora | construcción (ms) antes → ahora* |
|---|---|---|---|---|
| A | 52 157 → 14 192 | 12 → 8 | 1 036 KB → 321 KB | 53 → 36 |
| B | 29 839 → 8 126 | 10 → 7 | 512 KB → 173 KB | 31 → 22 |
| C | 27 566 → 6 520 | 10 → 6 | 403 KB → 133 KB | 33 → 20 |
| D | 12 276 → 3 245 | 8 → 5 | 226 KB → 73 KB | 19 → 14 |

\* terreno + esparcido + árboles + hierba (el esparcido, ~15 ms, no cambia). Buffers: atributos de vértice + instancias + índices de terreno, árboles, hierba y fauna (sin el agua animada, que no cambia).
Ahora la naturaleza ocupa, sobre el presupuesto de escena entera: A ≈ 8 llamadas y 14 k triángulos de 100 y 50 k; B ≈ 7 y 8 k de 80 y 35 k; C ≈ 6 y 6,5 k de 60 y 25 k.

**Qué se ve peor** (fotos reales, `.run/n6/`, contra las de F4): copas más sencillas (3 bipirámides en vez de 3 octaedros más ramas; las ramas visibles de cerca desaparecen);
hierba que acaba antes (24 m en vez de 38) y menos densa en el horizonte; menos mariposas y luciérnagas a la vez; el relieve se ve igual pero el contorno de las colinas lejanas es algo más anguloso;
en D el estanque es un disco plano sin olas. **Cero opciones nuevas** (no hay `calidad` en `naturaleza.json`).

## N7 · Belleza dentro del presupuesto de N6: árboles con ramas y hierba junto a los pies

N6 dejó los árboles como setas (bipirámides apiladas, sin ramas) y el suelo desnudo delante del avatar. N7 los arregla **sin tocar los topes** (`PRESUPUESTO_NATURALEZA` no cambia; los repartos por pieza tampoco, todo cabe en ellos).

**Árboles (`naturaleza/arboles.ts`).**
- **Plantilla cercana con detalle (niveles A/B, 78 triángulos):** tronco de 4 lados en 2 tramos con curva y conicidad (16) + 3 ramas de prisma de 3 lados (18) con una mata de hojas facetada en la punta (3 octaedros de ring irregular, 24) + copa de icosaedro con vértices desplazados (20). Las 4 especies siguen siendo **el mismo conjunto de vértices con 4 juegos de posiciones** (`position`, `pos1..3`), así que una sola llamada. Roble: copa grande irregular + ramas con matas colgando; pino: tres pisos de cono con borde dentado + punta de cono; abedul: tronco blanco curvo, copa alta estrecha, ramas finas; arbusto: copa baja y aplastada con matas a ras.
- **Plantilla sencilla (niveles C/D, 36 triángulos):** tronco recto + copa icosaedro + una mata. Sin ramas (en C/D no hay segunda llamada que pagar, y 66 y 30 árboles cerca caben con 36 triángulos cada uno, no con 78).
- **Lejos (A/B, 22 triángulos):** tronco de 3 lados + dos octaedros irregulares en vez de dos bipirámides pentagonales (antes 26).
- **Viento en el shader:** cada vértice lleva un peso de balanceo `mov` (0 en la raíz de la rama, 1 en la punta); la punta se mueve con `mov²` (fase propia por vértice, hacia el viento y de lado), encima de la inclinación del árbol entero y del aleteo de hojas (que sigue apagado en D). Cero CPU por árbol.
- **Luz:** la cara sin sol de una copa se veía negra; ahora la normal de una hoja se inclina hacia el cielo (plana + arriba × 0,15 corteza … 0,65 hoja; las caras siguen leyéndose planas), la corteza es más clara y el color va ×1,25. Sin luces nuevas.
- **Cuántos:** cerca A 24 (como en N6; 30 m), B 16, C 66, D 30 (simples); lejos A 148 (antes 160), B 78 (antes 90).

**Hierba (`naturaleza/hierba.ts`).** Dos anillos de celdas en el **mismo buffer y la misma llamada**: el exterior (radio y celda de N6, menos matas) y un **anillo interior denso** (`cerca` en `HIERBA_POR_NIVEL`: A 7 m / 340 matas, B 6 / 190, C 5,5 / 140, D 4,5 / 80). Las matas del interior llevan `CERCA_MARCA` (+100) en su canal de escala y el shader las desvanece, **encogiéndolas**, sobre su radio propio: sin borde ni salto. Densidad: ≈ 0,6 matas/m² fuera, ≈ 2,9 dentro (antes 0,77 plana). El total de matas por nivel no sube (A 1 030 + 340 frente a 1 400).

### Antes / después (mundo semilla 1234, peor hora, `tools/naturaleza-medir.ts`)

| Nivel | triángulos N6 → N7 (tope) | llamadas N6 → N7 (tope) | árboles: cerca/visibles y triángulos N6 → N7 | hierba enviada N6 → N7 (reparto) |
|---|---|---|---|---|
| A | 14 192 → 14 505 (15 000) | 8 → 8 (8) | 24/184, 5 120 → 24/172, 5 018 (5 200) | 4 200 → 4 419 (4 500) |
| B | 8 126 → 8 030 (10 000) | 7 → 7 (7) | 16/106, 2 980 → 16/94, 2 832 (3 000) | 2 400 → 2 442 (2 500) |
| C | 6 520 → 6 154 (8 000) | 6 → 6 (6) | 66/66, 2 640 → 66/66, 2 376 (2 700) | 1 800 → 1 773 (1 900) |
| D | 3 245 → 3 003 (4 000) | 5 → 5 (5) | 30/30, 1 200 → 30/30, 1 044 (1 200) | 1 020 → 945 (1 100) |

Fotos reales (SwiftShader, `.run/n7/fotos.mjs`) en `work/naturaleza/fotos/n7-*.png`: `n7-dia-plaza`, `n7-prado-cerca`, `n7-arbol-viento` y `n7-arbol-viento-b` (1,5 s después: las matas y ramas se han movido), `n7-noche-estanque`.

**Qué sigue peor que en F4:** en C/D los árboles no tienen ramas; lejos (>30 m en A) siguen siendo dos octaedros; no hay flores nuevas. **Cero opciones nuevas.**

## R5.1 · Sin caras negras: relleno de sombra en los materiales de la naturaleza (`naturaleza/relleno.ts`)

**Causa:** los materiales Lambert de three r186 (terreno con los Residuos horneados, árboles) ignoran `scene.environment`, y `entorno.ts` trata ese entorno como LA luz ambiente cuando hay HDR (nivel A) y baja el hemisferio a 0,3 (≈ 0,1 del albedo tras el 1/π de Lambert). Toda cara sin sol —bajos de ruinas y rocas, el envés de las ramas, el suelo bajo una sombra— se quedaba con un 3–4 % de su color: negro puro.

**Arreglo:** un término emisivo en esos materiales que devuelve el ambiente perdido como un hemisferio horneado de la paleta (`RELLENO` en `paleta.ts`: abajo verdemar hacia verdín, arriba arena velada con un toque de verdemar), pesado por la normal plana de cada faceta (las facetas siguen leyéndose), con suelo de albedo (el hierro también toma tinte) y más fuerza abajo (rebote del suelo). Su intensidad sale de los números del motor (`scene.environmentIntensity`, que ya sigue a la hora, × el brillo del color del hemisferio, que de noche vira a azul): de noche casi desaparece. Cero luces, pases, llamadas o triángulos nuevos; `entorno.ts` sin tocar. Píxeles medidos en las fotos (nivel A, 10 h; antes → después): bajo de ruina `#000` → `#153f2e`, sombra en el suelo `#081a03` → `#374516`, rama a contraluz `#251806` → `#313827`; suelo al sol `#879152` → `#95a15f`; noche sin cambio visible. Presupuesto igual: A 13 951 tri/8 llamadas, B 8 063/7, C 6 096/6, D 3 039/5. Fotos `work/naturaleza/fotos/r5-1-*-{antes,despues}.png`.

## R5.2 · El estanque y la estación salen de la paleta

**Antes:** `naturaleza.ts` seguía con los hex de antes de la dirección de arte: el agua en `0x2f6f8f` (azul petróleo saturado; en el nivel D el estanque pintado usaba otra mezcla, más clara) y una tabla de colores por estación (`COLORES_PALETA`) que el terreno y la hierba volvían a traducir a `ESTACIONES` por cercanía.

**Ahora:** `COLOR_ESTANQUE` vive en `paleta.ts` (Turquesa profundo + 35 % Verdemar, apagado con 20 % Ceniza) y lo llevan el agua de A–C (`agua-estilo.ts` lo reexporta) y el estanque pintado del nivel D (centro `COLOR_ESTANQUE`, orilla hacia Verdemar). `naturaleza.ts` pasa la estación (`estacion`) al terreno, la hierba y los árboles, que toman sus colores de `ESTACIONES`; no queda ningún hex en `naturaleza.ts` (un test lo vigila). `naturaleza.json` acepta `"estacion": "otono"`; `"paleta"` sigue valiendo igual (si vienen los dos, manda `estacion`).

Píxel del fondo del estanque (10 h, antes → después): nivel A `#0d5872` → `#1f6d72`; nivel D `#42adab` → `#358683` (A y D ya se parecen). Otoño: idéntico (misma tabla `ESTACIONES.otono`, ahora por `estacion`). Presupuesto igual: A 13 951 tri/8 llamadas, B 8 063/7, C 6 096/6, D 3 039/5. Fotos `work/naturaleza/fotos/r5-2-*-{antes,despues}.png`.


## R5.3 · Los pilares de colores se visten de máquina

**De dónde salían:** no eran del mundo de demostración, sino del motor: `packages/render/src/index.ts` pone 24 cajas de 1×3×1 m en tres anillos (amarillo `0xd9a441`, azul `0x5b8cc0`, rojo `0xc0605b`, verde `0x6ea86a`) «para que se note el movimiento» en el suelo plano; el entorno las muestra salvo `hitos: false`. Con relieve, además, flotaban o se hundían (siempre a y = 1,5).

**Ahora:** solo mientras un mundo tiene la naturaleza encendida, `naturaleza/hitos.ts` los viste como postes de latón, verdín con musgo, cobre y ceniza (`HITOS` en `paleta.ts`, mezclas de tokens oscurecidas con Bronce porque son MeshStandardMaterial a pleno sol: claras se quemaban a cian y blanco), un poco metálicos y mate, y los asienta 0,35 m por debajo de la esquina más baja de su huella. Al apagar la naturaleza (o reconstruirla en otro nivel) vuelven exactamente como estaban. Los mundos sin naturaleza siguen viendo los colores de siempre. El orden de colores se respeta: el «pilar dorado del este» de la misión de ejemplo es el de latón. `index.ts` solo pasa `hitos: () => hitos` (nota en NOTAS-UX-LOWPOLY). Coste: cero llamadas y cero triángulos (los mismos 24 materiales).

En el mundo de demostración (`work/naturaleza/mundo-demo/aventura/cosas/`), la regadera pasa de `#3a7bd5` a Turquesa profundo `#016e7d` (sigue siendo «la azul» de la misión, ahora acento de señal pequeño) y el saco de semillas de `#e0b030` a Latón `#b98a2e`.

Píxel de los pilares en la vista general (antes → después): menta `(136,236,169)` → verdín `(75,142,125)`; amarillo `(245,212,107)` → latón `(166,148,85)`; rosa `(236,137,147)` → cobre `(153,117,94)`. Test: `test/naturaleza-r5-3.test.ts`.

## R6.1 · Los pilares del motor desaparecen con la naturaleza

**Por qué:** Pablo no quiere los 24 pilares de referencia del motor (`index.ts`, cajas de 1×3×1 m en tres anillos) en los mundos con naturaleza, ni recoloreados: el relieve, los árboles y los Residuos ya marcan el movimiento, y las cajas se leen como juguetes en el prado. R5.3 los vestía de latón/verdín/cobre/ceniza; R6.1 los quita.

**Ahora:** mientras la naturaleza está encendida, `naturaleza/hitos.ts` (`ocultarHitos`) los deja invisibles (`visible = false`): el renderizador no los dibuja, y el mapa cenital/minimapa (`cenital.ts`) y la maqueta AR (`ar.ts`) tampoco, porque los dos se saltan lo invisible. Si el entorno vuelve a aplicarse con la naturaleza encendida (cambio de nivel o de calidad: escribe `visible` según `hitos`), esa escritura se guarda pero no se ve; al apagar la naturaleza los pilares vuelven tal como el entorno los quiere, con su color y altura de motor intactos. Los mundos sin naturaleza no cambian. Se borran las mezclas `HITOS` de `paleta.ts` (ya nadie las usa). `index.ts` y `entorno.ts` sin tocar.

**Medido** (nivel A, 10 h, llamadas GL de un fotograma de toda la escena): vista general 75 → 46, prado 67 → 44; pilares visibles 24 → 0. Presupuesto de la naturaleza igual: A 13 951 tri/8 llamadas, B 8 063/7, C 6 096/6, D 3 039/5. Fotos `work/naturaleza/fotos/r6-1-{vista-general,prado}-{antes,despues}.png`. Test: `test/naturaleza-r5-3.test.ts`.


## R5.4 · El ciprés es una sola llama

**Antes:** el ciprés era cinco octaedros colgados de ramas casi verticales más un icosaedro estrecho arriba: de cerca y en grupo se leía como una pila de diamantes (fotos `r2-bosquete`, `r2-collar-cipres`), y de lejos como un rombo ancho a media altura.

**Ahora** (`naturaleza/arboles.ts`, campo `llama` de `FORMA.cipres`): con la MISMA topología que las demás especies (los mismos 103 triángulos de cerca, 36 en C/D, 16 de lejos), el icosaedro pasa a ser el cuerpo del huso — punta a 6,8 m, anillo ancho a ~1,95 m (≈29 % de la altura), anillo estrecho a 4,5 m — y los cinco octaedros dejan de ser matas: son vainas largas y finas sobre el mismo eje, con sus anillos a otras alturas y girados entre los vértices del cuerpo, que dan aristas verticales suaves y una base roma, sin muescas. Proporción ≈ 4,7 : 1, como los cipreses de columna del canon (detrás de la Humanita, `DISENO-LORE.md`). Pie de tronco corto visible (follaje desde 0,6 m), collar de bronce a 0,36 m. En el sombreado: tono por altura (pie oscuro `monteSombra` → copa algo más clara y cálida, `monte`+`musgo`), el viento mueve el huso entero por altura y en una sola fase (las vainas no se separan), ±8 % de altura por árbol y una inclinación que se curva (nada en el pie, más en la punta). De lejos, la silueta compartida baja su anillo solo para el ciprés (`LEJOS[...][5]`, desplazamiento del anillo): llama en vez de rombo.

Test nuevo en `test/naturaleza-arboles.test.ts`: corta el ciprés en 60 alturas y exige el máximo en el tercio inferior, que por encima solo se estreche (tolerancia 6 % del grosor), punta fina, ≥ 3,5 : 1 y pie de tronco; falla con el ciprés de R2. Presupuesto idéntico: A 13 951 tri/8 llamadas, B 8 063/7, C 6 096/6, D 3 039/5. Fotos `work/naturaleza/fotos/r5-4-*-{antes,despues}.png`.

## R6.3 · El sauce llorón del Virelai, solo junto al agua

**Antes:** junto al estanque crecían las mismas encinas, pinos y matas que en el jardín; nada contaba que allí hay agua (fotos `r6-3-sauce-*-antes.png`).

**Ahora** (`naturaleza/arboles.ts`, especie `sauce`, campo `lloron` de `FORMA.sauce`): sexta especie sobre la MISMA topología (103 triángulos de cerca, 36 en C/D, 16 de lejos; un juego de posiciones más, `pos5`). Tronco inclinado y fino; el icosaedro es una cúpula ALTA (anillo ancho a ~4,15 m de 5,5 m, base plana) y los cinco octaedros son cortinas: vértice de arriba escondido en el borde de la cúpula, las dos esquinas laterales justo debajo (la cortina empieza ancha), el vértice exterior y el de abajo colgando casi hasta el suelo y separados de lado, así el bajo es un fleco de dos puntas que se curva (el latigazo art nouveau de las láminas), no un rombo. En el sombreado (rama `esSau`): verde frío (`monteSombra`+`verdin`) bajo la cúpula → puntas claras (`hierba`+`verdemar`), las cortinas cuelgan a plomo aunque el tronco se incline y se mecen más por la punta. Collar de latón como las demás. De lejos, la silueta compartida sube su anillo, baja la punta (`TOPE_LEJOS`) y deja caer 3 de sus 5 vértices del anillo (`CUELGA_LEJOS`): cúpula con faldón colgante.

**Dónde** (`naturaleza/esparcir.ts`): solo junto al agua — en el anillo de 1,25–2,3 radios del estanque (`SAUCE_AGUA`) y en las orillas del cauce seco de R6.2 (`franjaEn().agua ≥ 0,6` con poco `lecho`, `SAUCE_ORILLA`); en la orilla sube un poco la probabilidad, en prado y bosque solo cambia la especie. Semilla 1234: 24 sauces de 850 árboles. Sin estanque, ninguno.

Tests en `naturaleza-arboles`: perfil del sauce (copa más ancha arriba que abajo, hoja más baja < 20 % de la altura, cortinas fuera del tronco en el tercio bajo y sin cintura), puntas colgantes de lejos, solo junto al agua, y el test de caras hacia fuera ahora recorre todas las especies. Presupuesto: A 13 951/8 → 13 951/8, B 8 063/7 → 8 063/7, C 6 096/6 → 6 024/6, D 3 039/5 → 3 039/5. Fotos `work/naturaleza/fotos/r6-3-sauce-{cerca,8m,30m}-{antes,despues}.png`.
