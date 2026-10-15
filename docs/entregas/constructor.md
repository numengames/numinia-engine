# Entrega: rama `wt/constructor` (M22, constructor en el mundo)

Proyecto: numinia-engine · Para: quien junta las ramas (y Pablo) · De: agente «constructor» (Opus, sesión del
15-10) · Fecha: 2026-10-15 · Estado: listo para juntar (escritorio); VR y táctil, sin probar en aparatos.

## Qué

Lo que pidió Pablo para quien construye: seleccionar con el ratón, un gizmo con los ejes X, Y y Z para mover, girar
y escalar, colocar donde apuntas, coger y llevar, inspector con números, duplicar, borrar, deshacer y **rehacer**,
fijar y encuadrar. Todo cambio pasa por el servidor (`features/objetos`) y llega a todos al momento.

- **`packages/render/src/gizmo.ts` (nuevo, solo three):** `pick(x, y)` (la clave de lo colocado bajo el puntero),
  `puntoBajo(x, y, ignorar?)` (punto en el suelo y = 0 o encima de otras cosas), un marco amarillo alrededor de lo
  seleccionado (`Box3Helper`, se ve a través de todo) y el `TransformControls` de three (asas X roja, Y verde,
  Z azul; mover, girar, escalar; ejes del mundo o locales; paso; un solo eje) que se **descarga la primera vez**
  (import dinámico, 5,45 kB gz aparte). Mueve el grupo en el acto y avisa del arrastre (`empieza / cambia / acaba`,
  en grados YXZ redondeados a los pasos del cable). Mientras algo está cogido, los ecos del servidor para esa cosa
  solo actualizan lo que se quiere (`retiene`): nada salta atrás a medio arrastre; al soltar, se espera a que vuelva
  el último envío (o 1,5 s: si el servidor lo negó, vuelve a donde él diga). `busy()` sigue `editor.activo()`.
- **`packages/render/src/index.ts` (cambios pequeños):** crea el editor, `place()` pregunta `editor.retiene`,
  `busy()` y `draw()` lo llaman, `view.editor`, `view.pick`, `view.puntoBajo`; `objects()` no cuenta las vistas
  previas (`~fantasma`).
- **`features/objetos`:** intento **`rehacer`** (pila por constructor que llena `deshacer`; cualquier cambio nuevo
  tuyo la vacía; mismo permiso), `hecho.accion` gana `rehacer`, versión 2 (el estado no cambia de forma: lo
  guardado se carga igual). Deshacer y rehacer **respetan lo fijado** salvo que lo deshecho sea el propio fijar o el
  nombre. El cliente guarda la selección y la herramienta (`estado.seleccionado`, `estado.modo`) para que el gizmo,
  el inspector y un agente compartan un estado: `seleccionar(id)`, `transformar(id, {x…sz} parcial)` (acotado a
  `LIMITES`, giros a [-180, 180]), `colocarEn(id, punto, ry)`, `objeto(id)`, `nombrar`, `modo(m)`, `rehacer()`,
  `escuchar(fn)`. Se mantiene todo lo de H1 (`colocar`, `girar`, `deshacer`, `estado.seleccionado`…).
- **`apps/plaza/constructor.ts` (rehecho):** barra de herramientas (Coger 1, Mover 2/G, Girar 3/R, Escalar 4, con
  `aria-pressed` y la tecla en el título), ejes (todos/X/Y/Z, Mundo/Local), paso (libre, 0,1, 0,5, 1 m; libre, 5,
  15, 45°), biblioteca (el modelo sigue al puntero y un clic lo coloca: «colocar donde apuntas»), «Delante de ti»
  (sin ratón), línea de selección, acciones (duplicar, fijar, borrar, deshacer, rehacer, encuadrar), inspector
  (nombre + decorado, posición, giro en grados, escala por eje y toda, fijado: Intro o salir del campo aplica),
  los botones de paso de H1 (plegados), la ayuda de teclas y una línea `role=status`. Quien no puede construir no
  ve nada de esto.
- **`tools/e2e-piernas/constructor.mjs` (nuevo):** la pierna del e2e, con ratón y teclado de verdad, en chromium y
  firefox (ver Números).
- Documentos: `docs/JUGADOR.md` §11 (teclas y ratón), `docs/EXTENDER.md` (el constructor compartido),
  `packages/render/README.md` (API de `gizmo.ts`), la línea de ayuda de `apps/plaza/index.html`.

### Teclas y ratón (también en la ayuda del panel)

| Tecla o ratón | Qué hace |
|---|---|
| C, o Tab | abrir y cerrar construir (Tab solo si se usó el ratón en los últimos 30 s y el foco no está en un control) |
| clic izquierdo | seleccionar; en el suelo o Esc, nada (en coger: clic coge, otro clic suelta) |
| 1 / 2 o G / 3 o R / 4 | coger / mover / girar / escalar |
| X, Y, Z | solo ese eje (otra vez: todos), en mover, girar y escalar |
| T | ejes del objeto o del mundo |
| Ctrl mantenido | sin paso (en coger, Ctrl + rueda gira de 1 en 1°) |
| rueda / Mayús + rueda | en coger y con la biblioteca: girar (el paso de giro, 15°) / escalar ×1,1 |
| Esc | cancela la biblioteca; en coger devuelve la cosa a donde estaba; si no, deselecciona |
| Mayús + D o Ctrl + D | duplicar: la copia queda seleccionada y cogida (como Blender) |
| Supr o Retroceso | borrar |
| Ctrl + Z / Ctrl + Mayús + Z o Ctrl + Y | deshacer / rehacer |
| P · F · N | fijar o soltar · encuadrar (con la cámara nueva) · inspector |
| botones derecho y central, rueda | de la cámara (rama `camara`) |

## Decisiones

1. **Gizmo = `TransformControls` de three, no uno propio.** Se dibuja y acierta con WebGPURenderer: backend WebGL2
   en chromium y firefox (la pierna del e2e) y backend WebGPU de verdad en chromium sin pantalla con SwiftShader
   Vulkan (prueba a mano: `backend: WebGPU`, clic selecciona, arrastre de X mueve, 0 errores). Viene con three
   (MIT): ninguna dependencia nueva.
2. **La selección y la herramienta viven en el cliente de la función** (no en la página): así un agente
   (`window.__numinia.constructor`) selecciona, cambia de herramienta y transforma igual que el panel.
3. **`hecho` solo selecciona lo que se crea o vuelve** (colocar, duplicar, deshacer, rehacer). En H1 cualquier
   `hecho` seleccionaba: el eco del último `mover` de un arrastre te quitaba lo que acababas de pulsar.
4. **Deshacer y rehacer respetan lo fijado** (cambio de comportamiento de H1: antes deshacer podía mover algo
   fijado por otro). Se puede deshacer el propio fijar y un nombre. Lo negado se queda en la pila.
5. **Z sola ya no deshace y R ya no gira 15°** (eran las teclas de H1 con el panel abierto): ahora Ctrl + Z, y R es
   la herramienta girar (Blender). Los botones de girar ±15° siguen en el panel.
6. **Tab, con cuidado para quien navega con teclado** (afina la decisión del integrador): Tab abre y cierra solo si
   el foco está en la página o el lienzo y se ha movido el ratón en los últimos 30 s; si no, Tab mueve el foco como
   siempre. C funciona siempre.
7. **Al abrir, la herramienta es mover** (Hyperfy2 empieza en coger): un clic y ya se ven las flechas.
8. **Coger como Hyperfy2, Esc como Blender:** en coger, el clic coge y el siguiente suelta (y deselecciona); Esc
   devuelve la cosa a donde estaba (y si ya se habían mandado movimientos, manda el original). La cosa sigue al
   punto bajo el puntero, con su origen en ese punto: sobre el suelo o **encima de otras cosas** (se apilan); el
   paso de posición se aplica a x y z (rejilla del mundo); y es la altura de la superficie.
9. **Red:** mientras se arrastra, como mucho 8 `mover` por segundo, un latido cada 0,5 s si la mano está quieta (así
   el servidor junta todo el arrastre en **un** paso de deshacer con su regla de 1 s) y uno final al soltar. Dos
   arrastres de la misma cosa con menos de 1 s entre ellos siguen siendo un solo paso (regla de H1).
10. **Nada salta atrás:** la página ignora los ecos de lo que tiene cogido hasta soltarlo y hasta que vuelve su último
    envío (máximo 1,5 s).
11. **Lo fijado no muestra gizmo ni se coge** (el servidor negaría cada movimiento); el panel dice cómo soltarlo.
12. **Teclas:** el constructor escucha en fase de captura y las que usa se paran ahí (G no saluda, D no camina,
    Retroceso no hace nada más); los campos de texto se quedan las suyas y el panel no deja que lo que escribes
    llegue a las otras teclas de la página (caminar, gestos, batería). La rama `chat` tendrá el mismo problema en
    `main.ts`: sus listeners no miran si escribes en un campo.
13. **Táctil:** un dedo sobre un asa, o llevando algo, no arranca el joystick de caminar.
14. **La vista previa de la biblioteca** es una copia normal del modelo dibujada solo en tu página (`~fantasma`), no
    transparente (los materiales se comparten con las demás copias).
15. **El paso de escala va con el de posición:** posición «libre» = escala libre.
16. **Tras un clic de ratón en un botón o un desplegable del panel, el foco vuelve a la página** (con teclado no):
    así Espacio (saltar, rama `salto`) no vuelve a pulsar «Borrar» ni «Construir», y 1–4 no eligen una opción.

De OnCyber AWE (MIT) se leyó `engine-edit/src/transformer/drag-handler.ts` y `selection/selector.ts`: un paso de
deshacer por arrastre y «un clic es una pulsación que no se movió»; **no se copió código** (no hace falta aviso MIT).
De Hyperfy2 (`ClientBuilder.js`, GPL) solo el comportamiento: herramientas en 1–4, Tab, T, Ctrl libre, P, rueda y
Mayús + rueda al coger. Substrata: no se leyó (falta de tiempo).

## Números (de ejecuciones de hoy)

- **Pruebas:** 96 (main tenía 92): 4 nuevas en `test/objetos.test.ts` (rehacer; deshacer y rehacer con lo fijado y
  con el mundo cerrado; API del constructor con límites; la regla de selección).
- **Puertas** (`npm run gates`, núcleos 8-11): 96 bien · capas 0 · determinismo e398ea35 = e398ea35 · 25,0 kbit/s ·
  plaza de 1.000: p50 6,3 ms, p99 7,8 ms.
- **e2e** (`tools/auto.sh e2e`, puertos 8802/5182/5192): chromium OK, firefox OK, AR OK, VR OK, constructor OK,
  https OK (1 min 26 s en total).
- **Pierna `constructor`** (31 s las dos): en chromium y en firefox, los 11 pasos bien: abrir con C (gizmo
  descargado) · Bloque de la biblioteca colocado donde apunta el ratón (x, z en la rejilla de 0,5 m) y B lo recibe ·
  Esc deselecciona y un clic en su posición en pantalla lo selecciona · el gizmo se dibuja (llamadas de dibujo
  17–18 → 30–31) · asa X bajo el ratón (a ~26 px del centro) · arrastre de 90 px: x +1,5–2 m en A y en B, y y z
  iguales · la página dibuja mientras arrastra (`busy()` verdadero) · anillo Y bajo el ratón · arrastre: ry 135° en
  A y en B, x igual · Ctrl+Z, Ctrl+Z, Ctrl+Mayús+Z, Ctrl+Y: B ve giro deshecho, movimiento deshecho, movimiento
  rehecho, giro rehecho (cada arrastre, un paso) · Supr: B ve que ya no está · 0 errores de página.
- **Prueba a mano** (script fuera del repo, chromium): Tab abre; coger sigue al puntero y B lo ve en directo; dos
  pasos de rueda = 30°, Mayús + rueda = 1,1; clic suelta; Esc devuelve (A y B); Mayús + D: copia seleccionada y
  cogida; inspector y = 2 y nombre llegan a B; escribir en el inspector no camina ni cambia la batería; N, X, T, P.
- **Peso del cliente al arrancar** (`npm run build`, gzip): `index` 192,49 kB + `three.core` 65,97 kB = **258,5 kB**
  (main 55b0b3a: 184,64 + 64,02 = 248,7 kB, así que +9,8 kB; D2 pide ≤ 300). Aparte, al primer uso:
  `TransformControls` 5,45 kB, `GLTFLoader` 13,36 kB, `SkeletonUtils` 1,53 kB.

## Sin comprobar

- Aparatos de verdad: móvil (táctil: solo razonado), Quest/Pico (no hay gizmo en VR).
- Con la rama `camara` de verdad. Lo que sí se probó (script, con un `view.cam` falso que apunta las llamadas):
  abrir → `modo("construir")`; F → `frame({y: 0,5}, 1,5)`; arrastre de asa, coger y vista previa de la biblioteca →
  `bloquear(true)` … `bloquear(false)` en pares; cerrar → `modo("juego")`.
- Lector de pantalla (NVDA/VoiceOver) sobre el panel: es HTML de verdad con etiquetas y `role=status`, sin probar.
- El gizmo de escalar y el Robot (malla con esqueleto) solo con un script a mano, no en la pierna: clic en su
  pecho lo selecciona, el asa X de escalar deja sx = 4,4 en el servidor. Entre las piernas del Robot no hay malla:
  el clic ahí no lo elige (el rayo va contra la malla de verdad, como en Blender).
- Coste de `pick`/`puntoBajo` con 2.000 cosas en la zona (rayo contra todas en cada movimiento al coger): sin medir.

## Lo que falta (otras filas)

- Construir en VR con el mando, y táctil probado en móvil.
- Puntos de encaje (`Snap` de Hyperfy2), selección múltiple, jerarquía, lista de apps con su coste, copiar entre
  mundos, resaltar al pasar el ratón, vista previa transparente.
- Un id de arrastre opcional en `mover` (cambio aditivo) para que dos arrastres seguidos sean dos pasos de deshacer.
- Bajar el peso de arranque: cargar `constructor.ts` + `gizmo.ts` (≈ 8 kB gz) solo cuando llega `permiso`.
- Para H9 (subir): `view.puntoBajo(x, y)` da el punto del suelo o de una cosa bajo un fichero soltado;
  `colocarEn` hoy solo acepta ids de la biblioteca.

## Para el BACKLOG

- **M22 → `hecho` en escritorio** (su «hecho cuando»: A entra en construir, mueve y gira con el gizmo y deshace;
  B ve cada paso — pierna `constructor`; «un visitante no ve el modo construir» lo cubre la pierna H1 de
  `tools/e2e.mjs` con el mundo cerrado, que `auto.sh e2e` no ejecuta porque abre el mundo con
  `MOTOR_CONSTRUIR=todos`).
- Fila nueva propuesta: **M22b — Construir en VR y en el móvil** (mando: rayo, coger, girar con el stick; táctil:
  probar en un móvil de verdad), `pendiente`, para Opus o turno.
- Fila nueva propuesta: **M22c — Encaje y selección múltiple** (nodo `Snap`, varias cosas a la vez, jerarquía).
- SABER (marcado): decisiones 3, 4, 6, 9 y 10 son reglas nuevas del constructor.

## Dependencias nuevas

Ninguna (`TransformControls` es parte de three 0.186.1, ya en el proyecto).

## Ficheros compartidos tocados (para juntar)

- `packages/render/src/index.ts`: import y tipos de `gizmo.ts` (arriba); creación del editor tras `updateThings`;
  una línea en `place()`; `objects()` (5 líneas) y `editor`, `pick`, `puntoBajo` en lo que devuelve `createView`;
  `busy()` (+ `editor.activo()`); `draw()` (+ `editor.frame()` tras `updateThings`).
- `apps/plaza/main.ts`: `montarConstructor(constructor, view, …)` (una línea).
- `apps/plaza/index.html`: la línea de ayuda («C o Tab construir»).
- `features/objetos/feature.ts`: `version: 2`, `LIMITES`, intento `rehacer`, `hecho.accion` + `rehacer`.
- `features/objetos/server.ts`: `rehechos`, una línea en `apuntar`, `deshacer` → `volver()` + `rehacer` (al final);
  `colocar` sin tocar (la rama `subir` lo cambia).
- `features/objetos/client.ts` y `apps/plaza/constructor.ts`: reescritos (la API de H1 sigue).
- `test/objetos.test.ts` (4 pruebas al final), `docs/JUGADOR.md` (§11 nueva), `docs/EXTENDER.md` (un punto),
  `packages/render/README.md` (un punto).
- Teclas que el constructor se queda **solo con el panel abierto**: C, Tab, Esc, 1–4, G, R, X/Y/Z (con gizmo), T, P,
  F, N, Supr, Retroceso, Ctrl/Cmd + Z/Y/D, Mayús + D. Si `chat` usa T o `salto` usa algo de esto, hay que hablarlo.
