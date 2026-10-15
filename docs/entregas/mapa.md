# Entrega: mapa (rama `wt/mapa`) — fila J5 (parte del mapa) y una fila nueva, «ficha de jugador»

**Proyecto:** numinia-engine · **Para:** quien junta las ramas (y Pablo) · **De:** agente «mapa» (sesión Opus 15-10) ·
**Fecha:** 2026-10-15 · **Estado:** lista para juntar (puertas y e2e en verde; ver Números)

## Qué

- **Minimapa** (esquina inferior derecha, redondo, 150 px o el 30 % del lado corto): tú como flecha con tu rumbo (el
  `yaw` de la cámara si existe `view.cam`, si no la dirección de tus pasos), las personas que esta página ya recibe
  (`remotePositions`, con el nombre del chat si existe `__numinia.chat.nombres`), cada ficha con `at`
  (`session.features.cards()`, forma y color según su rol; un rol desconocido es un punto), los objetivos de misión
  (contrato opcional de la rama misiones) y tu destino. Norte arriba por defecto; botón «N/⟳» para que gire con la
  cámara; zoom «+ −» (15, 30, 60, 120 m). Los objetivos, salidas y el destino que quedan fuera se pegan al borde
  (dirección hacia ellos). Rejilla cada 10 m y las huellas de lo que hay en la zona (pilares, cosas colocadas).
  Clic o toque en el minimapa = abre el mapa grande. Botones «Mapa» y «Ficha» debajo. Oculto en AR/VR.
- **Mapa grande** (tecla **M** o «Mapa»; `<dialog>` modal; Escape cierra): la zona vista desde arriba (imagen
  generada, abajo), con desplazar (arrastrar, flechas), acercar (rueda, pellizco, `+ −`, botones), centrar (`0`,
  Inicio, «◎»), escala gráfica y leyenda (forma + color + nombre de cada tipo). Elegir un marcador **o cualquier punto
  del mapa** → detalle (nombre, tipo, «al noreste, a 23 m», descripción de su ficha) y **«Marcar destino»**.
- **Destino (waypoint):** una columna de luz en el mundo (`view.waypoint`, la misma de `view.beacon`) y un marcador
  en los dos mapas; pulsar otra vez el mismo «Marcar destino» (que ya dice «Quitar destino») lo quita; al llegar
  (< 2,5 m, tras haber estado lejos) se quita solo y se avisa. Avisos por `#avisos` (aria-live educado): «Destino
  marcado: Bloque, al norte, a 3 m», «Has llegado: Bloque».
- **Gemelo HTML** (en el mapa grande): lista «Lo que hay cerca», lo más cercano primero (hasta 50), cada fila
  «Bloque · objeto · al norte, a 3 m» como botón (centra el mapa y muestra el detalle) + botón «Marcar destino»
  (`aria-label` «Marcar destino: Bloque»). Se actualiza en su sitio una vez por segundo: el foco nunca salta; solo se
  reordena cuando el foco no está dentro. El minimapa tiene además un texto para lector (no «live»: no interrumpe) con
  el resumen: cuántas personas/cosas, las 3 más cercanas con dirección, el destino.
- **Ficha del jugador** (tecla **I** o «Ficha»; `<dialog>` modal): nombre e identificador corto de invitado (I1),
  número de avatar, aparato y calidad (WebGL2/WebGPU, clase escritorio/móvil, tope de cuadros moviéndote y en reposo,
  resolución dinámica, modo batería, pantalla/VR/AR), tiempo conectado, ping, personas a la vista, misiones e
  insignias (contrato opcional `misiones.resumen()`), botón «Ajustes» (contrato opcional `ajustes.abrir()`; si no
  existe dice «próximamente» y lo anuncia), y **Avatar (H10)** e **Inventario** marcados como «Próximamente».
- **Imagen cenital** (`packages/render/src/cenital.ts`): una cámara ortográfica dibuja el mundo una vez en un render
  target pequeño (512 px; 256 en móvil) y se lee (`readRenderTargetPixelsAsync`, WebGPU y su respaldo WebGL2); se
  pasa de lineal a sRGB y se dan la vuelta a las filas en WebGL. Solo entra la zona: suelo, rejilla, pilares y cosas
  colocadas (`userData.mapa` o `objeto:<clave>`); personas, etiquetas, balizas, gizmos y cielos se ocultan durante ese
  dibujo y la niebla se aparta (sus valores son uniformes: sin recompilar). Si la lectura falla (o en XR) se pintan
  **huellas** (la caja de cada cosa, en su color) en un canvas 2D. Se regenera al abrir el mapa si algo cambió en la
  zona (`view.cenitalVersion()`), y con el mapa abierto como mucho cada 5 s.

Ficheros nuevos: `packages/client/src/mapa.ts` (la cuenta, pura), `test/mapa.test.ts` (13 pruebas),
`packages/render/src/cenital.ts`, `apps/plaza/mapa.ts`, `apps/plaza/ficha.ts`, `apps/plaza/paneles.ts` (diálogos y la
guarda `escribiendo`), `apps/plaza/mapa.css` (importado desde `mapa.ts`: `index.html` no se toca),
`tools/e2e-piernas/mapa.mjs`, este fichero.

## Cómo crece (versátil: nuevos marcadores, fuentes y secciones sin tocar el motor)

Todo está en `window.__numinia.mapa` y `window.__numinia.ficha` (y lo mismo desde código de la página):

```ts
const mapa = __numinia.mapa;
// 1) un tipo de marcador nuevo (forma: flecha, punto, cuadrado, rombo, estrella, anillo, triangulo)
mapa.registrar("tesoro", { nombre: "Tesoro", color: "#d4a017", forma: "estrella", alBorde: true });
// 2) que las fichas con un rol se dibujen como ese tipo (los roles vienen de packages/feature ROLES)
mapa.rol("cofre", "tesoro");
// 3) una fuente de marcadores propia (se llama 5 veces por segundo; si lanza un error se salta y se nombra en fallos())
mapa.fuente("aventura", () => [{ id: "t1", tipo: "tesoro", nombre: "Cofre del faro", x: 40, z: -12, detalle: "Pista 2" }]);
// 4) una sección nueva en la ficha (vivo: se repinta cada segundo mientras está abierta)
__numinia.ficha.seccion("reputacion", { titulo: "Reputación", orden: 45, vivo: true, pintar: (caja) => { caja.textContent = "Amable"; } });
```

Lo mismo sirve para un agente: `mapa.marcadores()`, `mapa.contar()`, `mapa.marcarDestino(id)`, `ficha.texto()`.
Una función de juego (features/) no importa la página: pone fichas con `at` y el mapa las muestra solas por su rol.

## Contratos

**Consume (todos opcionales, con `?.`: si no están, no pasa nada):**
- `__numinia.misiones?.objetivos?.()` → `[{ mision, paso, nombre, x, z }]`: marcadores «Objetivo de misión» (estrella,
  pegados al borde si están lejos), con «Marcar destino».
- `__numinia.misiones?.resumen?.()` → texto, lista o `{ activas|enCurso|misiones: [...], hechas|completadas: n|[...],
  insignias: [...] }`; cada elemento puede ser texto u objeto con `nombre|name|titulo` y `paso`/`progreso`/`hechos+pasos`.
- `__numinia.ajustes?.abrir?.()`: el botón «Ajustes» de la ficha.
- `__numinia.chat?.nombres?.get?.(entidad)`: el nombre de cada persona en el mapa y la lista (si no, «Persona N»).
- `view.cam?.yaw?.()` (rama cámara): el rumbo de tu flecha y el giro del minimapa.

**Expone:** `__numinia.mapa` (`registrar`, `rol`, `registro`, `fuente`, `quitarFuente`, `marcadores`, `contar`,
`fallos`, `dibujado` = lo que se pintó por tipo en cada mapa, `stats` = redibujos y vueltas del reloj, `abrir`,
`cerrar`, `abierto`, `imagen` = modo/coste/tamaño de la imagen cenital, `muestra(x, z)` = color de la imagen en un
punto, `destino`, `marcarDestino(id)`, `quitarDestino`, `minimapa.girar/zoom`), `__numinia.ficha` (`abrir`, `cerrar`,
`abierto`, `seccion`, `quitarSeccion`, `texto`), y en `view`: `waypoint(x, z, texto) → id`, `dropWaypoint(id)`,
`cenital(opciones) → Promise<ImagenCenital>`, `huellas()`, `cenitalVersion()`. Teclas: **M** (mapa) e **I** (ficha);
Escape cierra el panel abierto (lo hace el navegador con el `<dialog>` modal).

## Ficheros compartidos tocados (para juntar)

- `packages/render/src/index.ts`: 2 líneas tras el export de `sesion.ts` (import de `crearCenital` y tipos); 3 líneas
  tras el bucle de los pilares (`userData.mapa` en suelo, rejilla y pilares); 1 línea tras `const vr = createVR(...)`
  (`const cenital = ...`); 3 líneas tras `dropBeacon` (el mapa `waypoints`); 1 línea al principio de
  `updateDecorations` (las etiquetas de los destinos miran a la cámara); `beaconCount()` suma `waypoints.size`; 7
  líneas nuevas tras `beaconCount` (`waypoint`, `dropWaypoint`, `cenital`, `huellas`, `cenitalVersion`). `busy()` y
  `place()` **no** se tocan.
- `apps/plaza/main.ts`: 2 imports tras el de `constructor.ts`; un bloque de 5 líneas tras `montarConstructor(...)`;
  `mapa, ficha` añadidos al objeto `__numinia` (la línea que tocan todas las ramas: unir).
- `apps/plaza/index.html`: **sin cambios** (el CSS va en `apps/plaza/mapa.css`).
- `docs/JUGADOR.md`: estados de las filas Minimapa, Mapa grande, Brújula y marcadores y Teletransporte (§ 6) y una
  fila nueva «Ficha de jugador» (§ 5); `packages/client/README.md` y `packages/render/README.md`: una línea cada uno.
- **Al juntar con chat (J3):** `apps/plaza/paneles.ts` define su propia `escribiendo(e)` (mismo código que
  `apps/plaza/escribiendo.ts` de la rama chat): cambiarla por `export { escribiendo } from "./escribiendo.ts";`. Y un
  aviso: con un panel mío abierto, Intro sobre un botón del panel no debería abrir el chat (la caja del chat queda
  fuera del diálogo modal, inerte): que la guarda del chat ignore Intro si `document.querySelector("dialog[open]")`.
- **Al juntar con entorno y avatares:** la imagen cenital solo dibuja lo marcado como zona: hijos de `world` con
  `userData.mapa` (`"suelo"` = fondo; `true` = cosa con huella) o con nombre `objeto:<clave>`; todo lo demás (avatares
  VRM, cielos, gizmos, agua o fuego sin marcar) se oculta mientras se hace la foto. Para que el agua salga en el mapa,
  `userData.mapa = "suelo"` en su malla; sus fichas con `at` ya salen como marcadores.

## Decisiones

- **El minimapa no toca el bucle 3D:** su propio reloj de 200 ms mira, y solo pinta si cambió la «firma» de lo que se
  ve (el centro en píxeles enteros, cada marcador en píxeles enteros, el giro en pasos de 2°, el zoom; los de fuera que
  van pegados al borde, por su dirección). Quieto = 0 dibujos; andando ≤ 5 por segundo. No entra en `view.busy()`.
  Las fichas de las funciones se releen una vez por segundo (las cosas casi no se mueven). Pestaña oculta o XR: nada.
- **Los destinos no calientan:** `view.waypoint` es la columna de `view.beacon` pero fuera de la lista que mantiene
  `busy()` en verdadero (una baliza normal dura segundos; un destino, minutos). Su etiqueta se orienta cuando la página
  dibuja por otra razón.
- **Norte = -z** (la cámara en yaw 0 mira a -z; el constructor coloca «3 m delante» en -z). Este = +x.
- **Mapa grande siempre norte arriba**; solo el minimapa puede girar. Cambia menos y orienta mejor (y el texto usa
  puntos cardinales: «al noreste»). La cuenta para «a tu izquierda» (`lado`) ya está, para V4/V5.
- **Forma + color** en cada tipo (nunca solo color: daltonismo); leyenda en HTML con texto.
- **Diálogos `<dialog>` modales:** foco atrapado y devuelto, Escape del navegador, el resto de la página inerte. WASD
  sigue moviéndote con el mapa abierto (el mapa se actualiza). Las teclas del lienzo del mapa (flechas, `+ − 0`,
  Inicio) se paran en el lienzo: ni andan ni mueven la cámara. Toques, arrastres y rueda dentro de un panel tampoco
  llegan al joystick ni a la cámara. Un botón pulsado con ratón suelta el foco (Espacio salta, no repite el botón).
- **La imagen cenital por GPU es lo primero; las huellas, el respaldo**, y el minimapa usa siempre huellas (vector,
  nítido a cualquier zoom, sin GPU). Se mide cada paso (`partes`: dibujar, leer, copiar, contar).
- **Privacidad:** el mapa solo muestra lo que la página ya recibe (área de interés); no pide a nadie posiciones.
- **Sin dependencias nuevas.** Nada copiado de Hyperfy2 (GPL): solo comportamiento común de cualquier juego.

## Números (de ejecuciones, no de memoria)

- **Pruebas:** 105 en verde (13 nuevas en `test/mapa.test.ts`: proyección norte arriba y girada, inversa, flecha,
  borde, rumbos, distancias, lados, duración, limitador, registro, fuentes, firma). `npm run gates` en verde
  (unidad, capas, determinismo, 25,0 kbit/s, plaza p99 8–19 ms según la carga de la máquina; una pasada con la carga
  a 12 dio una puerta en rojo y la repetición sobre el mismo árbol salió toda en verde).
- **`tools/auto.sh e2e`** (puertos 8809/5189/5199, núcleos 0-1) sobre el último commit de código (`33d1692`): e2e
  chromium OK (movedZ −4,59), firefox OK (−6,0), AR (IWER) OK, VR (IWER) OK, **mapa OK**, https OK (−5,8). La pasada
  anterior, sobre `88208c9`, también toda en verde (−5,8 / −6,0 / −3,8).
- **Pierna `mapa.mjs`** (900×600, GL por software, 10 comprobaciones por navegador, chromium y firefox, sin errores de
  página): el minimapa pinta «tú» y la pestaña B; un bloque colocado es un marcador «Bloque» y una fila
  «Bloque · objeto · al norte, a 3 m»; el árbol de accesibilidad tiene `button "Marcar destino: Bloque"`; M abre el
  mapa con imagen no vacía (≈ 40.000–44.000 píxeles con cosas de 262.144) y **norte arriba** (el pilar del noreste sale
  azul y el del sureste verde); «Marcar destino» con Intro → balizas 0 → 1 y marcador en los dos mapas, otra vez → 0;
  I abre la ficha con tu nombre y el aparato; Escape la cierra; el bloque se deshace al final.
- **Redibujo del minimapa:** quieto **0** dibujos en 2 s (los dos navegadores, todas las pasadas); andando 2 s
  (6–8 m): 4–7 en chromium, 8–10 en firefox (tope 10 = 5 por segundo). `view.busy()` falso quieto con el minimapa y
  con un destino puesto. (Un primer intento se olvidaba de redibujar al andar por suelo vacío: la firma no llevaba el
  centro; arreglado y con prueba.)
- **Coste de la imagen cenital (512 px, WebGL2 por software):** firefox **74–123 ms la primera vez** (con
  `compileAsync`: compilar 52–80 ms sin bloquear el dibujo, dibujar 1 ms, leer 14–46 ms), **16–62 ms** las
  siguientes; huellas 1–12 ms. Chromium con SwiftShader (2 núcleos, máquina con carga 11–12): 2,2–6,0 s la primera y
  0,3–4,9 s las siguientes, casi todo **esperando la lectura** (three la sondea con `requestAnimationFrame`; SwiftShader
  va muy cargado); la llamada que bloquea (`render`) pasó de 230–1.364 ms a 0,3–35 ms al compilar antes con
  `compileAsync` (400–885 ms de espera, no medido si bloquea en parte); huellas 1,7–12 ms. Solo se paga al abrir el
  mapa si algo cambió, y con él abierto como mucho cada 5 s.
- **WebGPU:** en el chromium sin pantalla de esta máquina WebGPU arranca pero su dispositivo SwiftShader pierde la
  instancia (también falla el render normal de la página); la imagen cayó a huellas sola, con el error guardado en
  `imagen().error`. Sin medida real de WebGPU.
- **Peso inicial** (`npm run build`, gzip de vite): `index` 184,64 → 196,06 kB (+11,4 kB: solo código de esta rama;
  `three.core` no cambia, 64,02 kB), CSS nuevo 1,06 kB → **261 kB gz al empezar** (presupuesto 300). Si al juntar todas
  las ramas el presupuesto aprieta: el mapa grande y la ficha pueden ir en un trozo perezoso (estimado ~7 kB gz).

## Sin comprobar

- WebGPU de verdad (imagen cenital por GPU: orientación y coste); móvil real, gafas reales (en XR el minimapa se
  oculta; el panel de muñeca no existe todavía).
- NVDA, VoiceOver y TalkBack de verdad: comprobado solo el árbol de accesibilidad de Playwright (la lista y sus
  botones con nombre).
- El contrato de misiones y ajustes con sus ramas reales (comprobado con la forma acordada, sin su código).
- Con la rama cámara: el giro del minimapa y la flecha con `view.cam.yaw()` (sin ella, el rumbo sale de tus pasos).
- Muchas cosas en la zona (2.000 objetos): el coste de releer las fichas (una vez por segundo) y del dibujo cenital.

## Lo que falta

- Panel de muñeca en VR (minimapa + lista en 3D) — J5 lo pide «más tarde».
- Portales en el mapa: cuando existan (F2) bastará con que su ficha tenga rol `salida`/`puerta` (ya se dibujan como
  «Salida o portal»).
- Retrato del avatar en la ficha (H10, rama avatares) e inventario (S4/J4).
- La imagen cenital: quizá una imagen por teselas para zonas de más de 512 m; medir en un móvil real el primer
  `compileAsync` y la lectura.
- Un aviso sonoro (V6) al llegar al destino; «¿dónde está X?» (V5) puede usar `lado()` y `enPalabras()`.

## Para el BACKLOG

- **J5:** el mapa, el minimapa con marcadores, la brújula al borde y los destinos, hechos; el libro de misiones es de
  la rama misiones. Cuando las dos estén en main: «Hecho cuando» (una misión de ejemplo de tres pasos se completa en un
  e2e y el mapa marca su objetivo) se prueba con `__numinia.mapa.contar().objetivo` en la pierna de misiones.
- **Fila nueva J11 — Ficha de jugador** (`hecho` con esta rama): nombre, identificador, aparato y calidad, tiempo
  conectado, misiones e insignias, ajustes; secciones por registro. Pendiente: retrato (H10) e inventario.
- **Fila nueva J12 — Panel de muñeca en VR** (minimapa, lista de lo cercano y ficha en 3D; `pendiente`).
- **V4** puede empezar desde el gemelo de esta rama (`apps/plaza/mapa.ts`: lista con nombre, tipo, dirección y
  botones, actualizada en su sitio sin mover el foco).
- **Para `docs/SABER.md`:** «un mapa que solo pinta cuando cambia su firma no cuesta nada quieto»; «una baliza larga
  (destino) no debe mantener `busy()`».

## Dependencias nuevas

Ninguna.
