# Entrega: entorno (luz, texturas y los elementos)

- **Proyecto:** numinia-engine
- **Para:** quien junta las ramas en `main` (y Pablo)
- **De:** agente «entorno» (rama `wt/entorno`, desde `55b0b3a`)
- **Fecha:** 2026-10-15
- **Estado:** hecho y comprobado en el navegador (chromium y firefox, sin GPU); falta medirlo en un móvil y en unas Quest de verdad

Filas: **H4** (entorno como datos), **H8** (partículas en la GPU), **H12** (calidad por nivel), más agua y suelos
(«tierra»). Todo son **datos con esquema**: un mundo o una aventura trae su entorno y sus elementos en ficheros JSON,
y el aparato elige lo que dibuja según lo que puede hacer, no según el nombre del navegador.

## Qué

### 1. Función `entorno` (`features/entorno/`)
- Hay una entrada de estado por zona (`zona`), sin `at`, y se guarda (S4). Lleva cielo (`atmosfera` = SkyMesh de
  three, `degradado` o `color`, más una imagen equirectangular opcional), sol (altura, rumbo, intensidad y color), hora
  del día (`solHora`: el sol sale de la hora) y ciclo de día (minutos por día; lo hace avanzar el servidor cada 5 s).
  También luz ambiente (hemisferio cielo/suelo), luz HDR opcional (fichero `.hdr`), niebla (cerca, lejos, color; con
  `nieblaAuto` su color sale del horizonte del cielo), viento (rumbo y fuerza: un uniform que usan las partículas),
  suelo, mapeo de tonos (`agx`, `aces`, `neutro` o `ninguno`) con su exposición, y si se ven los hitos y la rejilla.
- Esquema del fichero: `numinia-engine/entorno@1` (`features/entorno/esquema.ts`). `validarEntorno()` devuelve un
  Result y nunca lanza: cada error trae su ruta en el fichero (`sol.altura: …`) y cómo arreglarlo.
- Valores por defecto: `por-defecto.json`, la casa (día claro, hierba). Los presets van en `presets.json`: **día,
  amanecer, atardecer, noche, niebla, tormenta y nublado** (el nublado usa la luz HDR). Un preset nunca cambia el suelo.
- Intentos: `preset {nombre}`, `ajustar {todos los valores}` y `restaurar {}`. Solo para quien tiene
  `api.puede(…, "construir")`; a los demás se les dice por qué no. Cada página aplica el cambio en cuanto llega.
- **Tierra** = los suelos (`suelos.json`, `numinia-engine/suelos@1`): hierba, tierra, arena, roca, nieve y liso. Son
  texturas PBR CC0 (color 1k y relieve 512 px) repetidas en el suelo, con su escala, rugosidad y color. Solo se baja
  la del suelo elegido. El terreno con altura espera a la física (fila M6).
- **Un mundo trae su entorno**: `MUNDO_DIR/entorno.json` (entorno@1, solo lo que cambia sobre la casa) y
  `MUNDO_DIR/elementos.json` (`numinia-engine/elementos@1`, `{ "elementos": [{ "tipo": "fuego", "x": 3, "z": -4 }, …] }`).
  Los lee la raíz del servidor (`packages/server/src/mundo.ts` → `features/mundo.ts`). Si falta un fichero, se usa el
  de la casa. Un fichero roto se rechaza y se apunta en el registro por qué. Los elementos del mundo se ponen una sola
  vez, en una zona que aún no tenga nada guardado.

### 2. Render del entorno (`packages/render/src/entorno.ts`, `calidad.ts`)
- **Cielo**: SkyMesh (TSL, perezoso; va en WebGPU y en WebGL2) o una cúpula en degradado. En móvil y en XR el cielo se
  «hornea» una vez por cambio en un cubo de 256 px, que pasa a ser el fondo; ya no se calcula en cada cuadro.
- **Sol**: una DirectionalLight. Sus sombras siguen a quien juega y dependen del nivel (H12): `no`, `baja` (512),
  `media` (1024) o `alta` (2048). Están apagadas en móvil y en Quest. Una vez por segundo se marcan para dar y recibir
  sombra las mallas nuevas; el mapa de sombra se rehace en cada cuadro que se dibuja (y la página solo dibuja si algo
  se mueve).
- **Luz de entorno**: el cielo horneado con PMREM a 64 px (sin el disco del sol queda liso y barato de rehacer), o
  un HDR CC0 de 1k (PMREM a 256 px), que se baja solo si se usa. Por defecto está apagada en móvil y en Quest.
- Niebla, suelo con texturas (color y normal, repetidas según los metros de cada textura) y mapeo de tonos con su
  exposición.
- Los **24 pilares** siguen ahí; el entorno puede ocultarlos (`hitos: false`).
- **Horneado barato**: solo se hornea si cambia algo del cielo; el sol cuenta en grados enteros, así que el ciclo de
  día hornea cada pocos pasos. Para el color de la niebla basta un cubo de 16 px en escritorio.

### 3. Función `elementos` (`features/elementos/`, render en `particulas.ts` y `elementos.ts`)
- Tipos:
  - **agua**: una superficie rectangular con ancho, fondo, altura y color.
  - **fuego**: una hoguera con llamas, chispas, humo y una luz que parpadea suave.
  - **humo**: una columna.
  - **polvo**: aire con polvo u hojas que empuja el viento.
- Cada uno es una entrada de estado con `at`: solo la reciben quienes están cerca (J9, 160 m). Se guarda, hay como
  mucho 300 por zona y cada uno lleva su ficha con nombre (Estanque, Hoguera, Columna de humo…). El polvo es decorado.
- Intentos: `poner`, `cambiar` (mover, agrandar o recolorear) y `quitar`, solo para quien puede construir.
- **Partículas (H8)**: un InstancedMesh por emisor, es decir, **una llamada de dibujo por emisor**. Todo se calcula
  en la GPU (TSL): vida, velocidad, fuerzas y viento, y tamaño, giro, color y alfa con curvas de 4 llaves. La
  aleatoriedad es un hash por ciclo. Mezcla aditiva o normal. Los emisores del mismo tipo comparten shader.
  - Hay un tope por emisor y otro total por nivel (`limits.json`: `particles_per_emitter`, `particles_total`).
  - Lo que está a más de 40 m o fuera de la pantalla se queda quieto, y a más de 150 m no se dibuja.
  - `view.busy()` solo es verdad mientras algo visible se anima.
- **Agua**: en escritorio y de cerca, WaterMesh de three (reflejos); en móvil, en Quest o de lejos, la variante
  barata: dos normales que se desplazan, con fresnel. El mapa de normales se genera en el código (no hay fichero).
- **Fuego**: la luz suma senos de ≤ 2,1 Hz y nunca destella más de 3 veces por segundo (V7, WCAG 2.3.1; lo
  comprueba una prueba). Solo las hogueras más cercanas tienen luz: 4 en A, 2 en B, 1 en C y ninguna en D.
- Todo el render de elementos se carga **perezoso** con el primer elemento (`elementos-vista.ts`). Un mundo sin
  elementos no paga nada.

### 4. Panel para quien construye (`apps/plaza/entorno.ts`)
- Es una sección propia, visible solo con el panel de construir abierto (`#panel-construir` sin `hidden`). Se monta
  con una línea desde `main.ts`.
- Botones de preset, deslizadores con etiqueta (altura y rumbo del sol, niebla, viento y exposición), selector de
  suelo y «Restaurar el del mundo». La hora, el ciclo de día, los colores y la escala del suelo se cambian con el
  intento `ajustar` (agentes y ficheros), todavía no desde el panel.
- **Elementos**: botones para poner agua, fuego, humo o polvo delante de ti (3 m). Seleccionar, «Más grande» y «Más
  pequeño», mover (← → ↑ ↓) y «Quitar».
- Todo son botones e inputs HTML con nombre accesible; no usa teclas.

### 5. Calidad para el menú de ajustes: el contrato de `view.entorno`
```ts
type Calidad = { sombras: "no" | "baja" | "media" | "alta"; agua: "simple" | "reflejos"; particulas: "pocas" | "normal" | "muchas"; hdr: boolean };
view.entorno.calidad(c?: Partial<Calidad>): Calidad   // aplica lo pedido (cualquier parte), recortado a lo que este aparato admite; devuelve lo vigente
view.entorno.capacidades(): {
  nivel: "A" | "B" | "C" | "D", backend: "WebGPU" | "WebGL2",
  sombras: string[], agua: string[], particulas: string[], hdr: boolean, // lo que se puede elegir aquí (para las opciones del menú)
  porDefecto: Calidad, topeParticulas: { emisor: number; total: number }, lucesFuego: number }
view.entorno.estado()          // solo lectura: preset, fondo, niebla, sol (altura, sombras, mapa), modoCielo, luzEntorno, nivel, calidad, horneados…
view.entorno.simularNivel(n | null)   // para pruebas y bancos: comportarse como otro nivel
view.elementos.contar()        // agua, fuego, humo, polvo, partículas, emisores, luces, animando, reflejos
```
Valores por defecto de cada nivel (`calidad.ts`; A = escritorio, B = Quest en XR, C = móvil medio, D = móvil viejo
o ahorro de datos):

| Nivel | sombras | agua | partículas | hdr | techo (lo máximo que se puede pedir) |
|---|---|---|---|---|---|
| A | media | reflejos | normal | sí | alta · reflejos · muchas · sí |
| B | no | simple | pocas | no | baja · simple · normal · sí |
| C | no | simple | pocas | no | baja · simple · normal · sí |
| D | no | simple | pocas | no | no · simple · pocas · no |

**Para el registro de ajustes**:
- Hay cuatro entradas (sombras, agua, partículas y luz HDR). Cada una ofrece `capacidades()[clave]` como opciones y
  `porDefecto[clave]` como valor inicial, y al cambiar llama a `view.entorno.calidad({ [clave]: valor })`.
- Lo elegido no lo guardo yo: el menú lo guarda y llama a `calidad()` al arrancar.
- Al entrar en XR el nivel pasa a B por sí solo: vuelven los valores por defecto y los techos de B.

## Decisiones (con su porqué)
1. **Una entrada de entorno por zona, sin `at`**: todos en la zona ven el mismo cielo. El servidor decide cada cambio
   y lo guarda. (SABER: «el entorno es estado de la zona, no del jugador».)
2. **Los elementos llevan `at`** (J9) y ficha. Quien no ve tiene que saber que ahí hay una hoguera o un estanque.
3. **Calidad por capacidad** (`nivelDe`: XR → B; saveData o ≤ 2 GB → D; móvil → C; si no, A). Nunca por el nombre
   del navegador (AGENTS, principio 2). Los topes están en `limits.json` (estimados; una prueba los compara con el
   código).
4. **El mapeo de tonos por defecto es `neutro`**, no AgX: AgX dejaba la escena lavada en las capturas. La luz de
   hemisferio y de entorno bajan cuando hay HDR, para no contar la luz dos veces.
5. **Niebla del color del horizonte** (`nieblaAuto`): el suelo se funde con el cielo, sin una raya en el horizonte.
   Se muestrea un cubo pequeño, leído de forma asíncrona.
6. **Hornear poco**: en la primera versión se horneaba un cubo de 256 px y un PMREM de 256 px en cada cambio. En
   SwiftShader eso paraba la GPU **~1,5 s** (la pata https de e2e se movía 0–0,4 m en vez de ~6 m). Ahora se hornea
   solo si cambia el cielo, con un cubo de 16 px para la niebla y un PMREM de 64 px para la luz: **sin parones**
   (https movedZ −5,8).
7. **`castShadow` no se vuelve a apagar**: en three r186, apagarlo libera el nodo de sombra que aún usan los
   materiales (firefox: «shadowMap is null»). «Sin sombras» es entonces no pasar la sombra y darle intensidad 0.
8. **Proxy de vite: `/e/` y `/a/` con barra** (`apps/plaza/vite.config.mjs`). Sin la barra, el proxy LAN mandaba
   `/entorno.ts` al servidor de juego (404). Lo mismo le pasaría a cualquier módulo que empiece por `/a` o `/e`
   (`ajustes.ts`, `avatares.ts`, `escribiendo.ts`…). **Hay que conservar este arreglo al juntar.**

## Números (de esta rama, último commit)
- **Pruebas unitarias**: 109 bien, 0 mal (17 nuevas: `test/entorno.test.ts` 8, `elementos.test.ts` 5, `particulas.test.ts` 4).
- **Puertas** (`npm run gates`): todas en verde. Capas 0; determinismo e398ea35 = e398ea35; ancho de banda 25,0 kbit/s;
  plaza de 1.000 con tick p99 11,8 ms.
- **e2e** (`tools/auto.sh e2e`, puertos 8807/5187/5197, núcleos 28-29), rc=0:
  - `e2e chromium OK` (movedZ −5,39; coste 26 llamadas, 903 triángulos, 0,6 ms CPU; sin exceder el P2 del nivel D)
  - `e2e firefox OK` (movedZ −6; 23 llamadas, 663 triángulos)
  - `e2e AR (IWER) OK` · `e2e VR (IWER) OK`
  - `e2e entorno OK`, en chromium y firefox:
    - Tras el preset de A, B pasa de día a noche: fondo `vivo` → `#152038`, niebla `#152038`, sol 42° → −20°.
    - A pone agua y fuego y B los dibuja: agua 1, fuego 1, 3 emisores, 120 partículas, 1 luz, 1 reflejo, con las
      fichas «Estanque» y «Hoguera».
    - Al final todo queda como estaba; 0 errores de página.
  - `e2e https (wss por /ws del mismo origen) OK` (movedZ −5,8)
- **Coste por cuadro y nivel** (pata entorno; A mira una hoguera y un estanque con el preset día; WebGL2 por
  SwiftShader, así que los ms no valen para un móvil):

| Nivel | chromium: llamadas / triángulos | firefox: llamadas / triángulos | partículas | luces de fuego | reflejos | sombras | cielo | luz de entorno |
|---|---|---|---|---|---|---|---|---|
| A | 67 / 2.227 | 64 / 2.191 | 120 | 1 | 1 | sí (1024) | vivo | cielo |
| B | 13 / 2.397 | 23 / 2.517 | 36 | 1 | 0 | no | horneado | no |
| C | 13 / 2.397 | 23 / 2.517 | 36 | 1 | 0 | no | horneado | no |
| D | 12 / 2.387 | 22 / 2.507 | 31 | 0 | 0 | no | horneado | no |

  - El salto de llamadas en A sale de la pasada de sombra (vuelve a dibujar lo que proyecta sombra) y de los
    reflejos del agua.
  - El nivel D queda dentro de su límite: 12–22 llamadas y ~2.400 triángulos.
  - CPU por cuadro: 0–2 ms.
  - Al arrancar, el entorno por defecto en A cuesta 26–28 llamadas y ~700 triángulos.
- **Peso del cliente** (`npm run build`, gzip -9 de `dist/plaza/assets/*.js`):
  - **Al arrancar: 285,5 kB** (vite dice 289,9 kB), dentro del presupuesto de 300 kB. `main` en `55b0b3a`: 244,9 kB.
  - Lo que se carga perezoso: `elementos` 4,6 kB, `SkyMesh` 1,8 kB, `HDRLoader` 1,5 kB y `WaterMesh` 0,9 kB.
  - Los +40 kB salen sobre todo de nodos TSL de three que solo usan las partes perezosas: el empaquetador los mete
    en el trozo común de three, que se carga al arrancar.
  - Medido aparte: con un alias a las fuentes de three en `vite.config.mjs` (`three`, `three/webgpu` y `three/tsl`
    apuntando a `node_modules/three/src/…`), el arranque baja a **261,0 kB**. Lo propongo; no lo he metido.
- **Activos**:
  - 10 WebP: suelos de 52 a 375 kB cada fichero; un suelo entero ocupa 127–509 kB.
  - 1 HDR de 1,4 MB, que solo se baja con el preset nublado en un aparato con luz HDR.
  - Total en el repositorio: 3,03 MB.

## Activos y licencias
Todos son de Poly Haven, **CC0**. Se comprobó en la página de cada activo («CC0 1.0 Universal - public domain
dedication») y en <https://polyhaven.com/license>. El md5 de cada descarga coincide con el de su API. Fuente,
autor, bytes y fecha están en `activos/texturas/LICENCIAS.md`, con una fila más en `activos/README.md`.
- Suelos: `leafy_grass` (Charlotte Baglioni), `brown_mud_dry`, `sand_01`, `aerial_rocks_02` y `snow_02` (Rob Tuytel).
- Cielo: `kloofendal_48d_partly_cloudy_puresky` (Greg Zaal y Jarod Guest).

**No se usa ninguna textura de los ejemplos de three.** Las normales del agua y las partículas se generan en el código.

## Sin comprobar
- **No se ha medido en un móvil ni en unas Quest de verdad.** Los niveles B, C y D se han simulado
  (`simularNivel`) en un escritorio sin GPU. Faltan los ms de GPU, la temperatura y la batería (T1 / MOVIL-FRIO).
- No se ha probado el backend **WebGPU** con GPU: todas las pruebas fueron WebGL2 por SwiftShader. SkyMesh, WaterMesh y
  las partículas TSL están escritas para los dos backends.
- No se ha probado dentro de XR que el nivel pase a B al entrar; está en el código y la prueba unitaria cubre `nivelDe`.
- No hay prueba e2e del panel de quien construye: las patas usan los controladores, no los botones. Tampoco se ha
  comprobado el panel con un lector de pantalla.
- La primera vez que se dibuja el entorno completo hay un tirón de compilar shaders: corto con GPU, ~1 s en
  SwiftShader. `renderer.compileAsync` lo quitaría; no lo he hecho.

## Lo que falta (filas propuestas)
- **H4b** Ajustes finos del entorno en el panel: colores (cielo, niebla, sol), equirect de fondo y elección de HDR
  desde la biblioteca o desde subidas (H9).
- **H8b** Editor de emisores como datos (`particulas@1`: forma, ritmo y ráfagas, curvas, hojas de sprites) para que
  una aventura traiga los suyos. El motor ya acepta esos parámetros (`particulas.ts`), pero aún no hay fichero ni
  panel.
- **H12b** Sombras en cascada o suaves para A, y postproceso (bloom/AO) en A. En Quest, nada.
- **H4c** Agua mejor: espuma de orilla, refracción en A, ríos (cinta con dirección) y olas que muevan objetos (con
  la física, M6).
- **M6b** Terreno con altura (heightmap y pintura de suelos por capas) cuando haya física. La «tierra» de hoy es solo
  el material del suelo plano.
- **H12c** `renderer.compileAsync` al aplicar un entorno, sin dibujar hasta tenerlo, para quitar el tirón de
  compilar.
- **Q3** Alias a las fuentes de three en `vite.config.mjs`: −24,5 kB gz al arrancar (medido arriba).
- **Ajustes**: conectar las cuatro perillas al registro del menú (contrato arriba) y guardar la elección.

## Para el BACKLOG
- **H4 hecho**: entorno@1 como datos; presets; suelos CC0; un mundo trae su entorno; cambio en directo para quien
  construye; e2e en chromium y firefox.
- **H8 hecho (primera parte)**: partículas en la GPU, una llamada por emisor, topes por nivel, paradas fuera de vista
  y limitador de destellos. Queda **H8b** (emisores como fichero).
- **H12 en curso**: sombras no/baja/media/alta por nivel y perillas para el menú. El postproceso queda para **H12b**.
- Filas nuevas: H4b, H4c, H8b, H12b, H12c, M6b y Q3 (arriba).

## Ficheros
- **Nuevos**:
  - `features/entorno/{feature,esquema,server,client}.ts`, `por-defecto.json`, `presets.json`, `suelos.json`
  - `features/elementos/{feature,server,client}.ts`, `features/mundo.ts`
  - `packages/render/src/{entorno,calidad,curvas,particulas,elementos,elementos-vista}.ts`
  - `packages/server/src/mundo.ts`, `apps/plaza/entorno.ts`
  - `activos/texturas/*` (con `LICENCIAS.md`) y `activos/cielos/*`
  - `test/{entorno,elementos,particulas}.test.ts`, `tools/e2e-piernas/entorno.mjs`
- **Tocados** (cambios pequeños y locales; posibles choques al juntar con `main`, que ya tiene la primera tanda):
  - `packages/render/src/index.ts`:
    - Guardar `hemi` y los `hitos`.
    - Crear `entorno` y `elementos` tras el suelo.
    - `entorno` y `elementos` en la vista.
    - `busy()` (choca con la línea de `main`, que ahora tiene `cam.ocupada()…`: sumar las dos).
    - `entorno.actualizar(); elementos.actualizar(dt)` al principio de `draw()`, antes del camino XR.
  - `apps/plaza/main.ts`:
    - 3 imports.
    - 2 ganchos de vista (`entorno` y `elemento`).
    - `montarEntorno(...)`.
    - `ambiente` y `elementos` en `__numinia` (choca con `chat: chatDePagina, cajaChat` de `main`: sumar).
  - `packages/feature/src/index.ts`: `entorno?` y `elemento?` en `ViewHooks`, junto a los `nameTag?`/`bubble?` de `main`.
  - `features/cliente.ts` y `features/servidor.ts`: una línea cada una.
  - `packages/server/src/main.ts`: `MUNDO_DIR` → `conMundo(...)`.
  - `apps/plaza/vite.config.mjs`: `/e/` y `/a/`.
  - `limits.json`: 12 filas `device` (particles_per_emitter, particles_total y fire_lights por nivel).
  - `docs/EXTENDER.md`, `packages/render/README.md` y `activos/README.md`: unas líneas.
- **Dependencias nuevas: ninguna.** SkyMesh, WaterMesh, HDRLoader y PMREM vienen con three r186 (MIT).
