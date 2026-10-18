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
