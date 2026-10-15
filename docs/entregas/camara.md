# Entrega: cámara (rama `wt/camara`) — fila N1, parte de cámara

**Proyecto:** numinia-engine · **Para:** quien junta las ramas (y Pablo) · **De:** agente «cámara» (sesión Opus 15-10) ·
**Fecha:** 2026-10-15 · **Estado:** lista para juntar (puertas y e2e en verde; ver Números)

## Qué

- **Cámara nueva** (`packages/render/src/camara.ts`; la cuenta, pura y probada, en `camara-orbita.ts`), en `view.cam`.
  Sustituye la cámara fija que seguía al avatar (6 m arriba, 9 m atrás); la vista de partida es la misma
  (10,4 m del ojo, 30° hacia abajo).
- **Jugar (ratón):** botón derecho arrastrando = girar alrededor de tu avatar (inclinación ±80°); el izquierdo sobre el
  mundo también gira, pero un clic sin mover (menos de 5 px) sigue siendo un clic, y el clic que sigue a un arrastre se
  traga. Rueda = acercar o alejar suave, de 1,5 a 20 m; una muesca más hacia dentro = 1.ª persona (ojo a 1,6 m, tu
  cuerpo deja de dibujarse); una hacia fuera, otra vez 1,5 m. Sin menú contextual en el lienzo.
- **Moverse hacia donde mira la cámara:** `readAxes()` (apps/plaza/main.ts) gira el teclado, el joystick táctil y el mando
  por `view.cam.yaw()` antes de redondear a int8. La simulación no cambia (ni la huella); el stick de VR, igual que antes.
  La cámara solo gira por lo que hace el jugador: con yaw 0, W sigue siendo -z (`tools/e2e.mjs` intacto).
- **Teclas** (libres; la lista de reservadas está en `docs/JUGADOR.md`): `,` `.` giran (mantener), RePág/AvPág inclinan
  (mantener), `+` `−` acercan/alejan (también `=` y el teclado numérico), V = 1.ª ↔ 3.ª persona, Inicio = cámara detrás
  otra vez. Se ignoran escribiendo en cajas de texto y con Ctrl/Alt/Meta.
- **Táctil:** el dedo que empieza en la mitad izquierda es el joystick de siempre; en la derecha, mira alrededor; dos
  dedos pellizcan (y, construyendo, desplazan). En pantallas táctiles la línea de ayuda dice solo eso.
- **Mando:** palanca izquierda = andar (relativo a la cámara), derecha = mirar, RB/LB = acercar/alejar. Solo se lee
  `navigator.getGamepads()` cuando hay uno conectado.
- **Cámara de construir (API para la rama constructor):** `view.cam.modo("construir")` la suelta del avatar: derecho =
  orbitar un punto; central o Mayús+derecho = desplazar el punto; Alt+izquierdo = orbitar (panel táctil); rueda =
  acercar hacia lo que hay bajo el puntero (hasta 80 m; en el límite cercano el punto avanza); el izquierdo sin Alt es
  del constructor. `frame(centro, radio)` mira a una cosa; `bloquear(true)` congela arrastres y rueda mientras el gizmo
  arrastra; `modo("juego")` vuelve suave detrás de tu avatar con la distancia de antes.
- **Pantalla completa:** botón real «Pantalla completa / Salir de pantalla completa» arriba a la izquierda, bajo el HUD;
  no aparece donde el navegador no puede (iPhone) ni mientras hay AR/VR.
- **Ahorro (P2):** `view.busy()` incluye `cam.ocupada()`: verdadero solo mientras se arrastra, hay tecla o palanca
  pulsada, o la cámara aún se asienta; la suavidad se detiene exactamente en su destino, así que una cámara quieta no
  cuesta nada.

Ficheros nuevos: `packages/render/src/camara.ts`, `packages/render/src/camara-orbita.ts`, `test/camara.test.ts`,
`tools/e2e-piernas/camara.mjs`, este fichero. **API de `view.cam`** (tabla con cada llamada):
`packages/render/README.md` § «The camera»: `update(dt, pies|null)`, `yaw()`, `modo(m?)`, `frame(centro, radio)`,
`bloquear(on)`, `ocupada()`, `primeraPersona()`, y además `acercar(pasos)`, `girar(dYaw, dPitch?)`, `reiniciar()`,
`alternarVista()`, `tieneDedo(pointerId)`, `mando()`, `estado()`.

**Ficheros compartidos tocados (para juntar):**
- `packages/render/src/index.ts`: 3 líneas tras el export de `sesion.ts` (import y re-exports de la cámara); las dos
  líneas `const target/wanted` (tras `const others = new Map`) pasan a crear `cam` y `feet`; `busy()` añade
  `|| cam.ocupada()`; en `draw()` las 4 líneas de la cámara fija pasan a `cam.update(...)` más una línea
  `selfMat.visible = …` antes de la rama XR (la rama XR no cambia); `cam` en el objeto devuelto, antes de `draw`.
- `apps/plaza/main.ts`: el import de render (+`haciaMundo`); 1 línea en la rama `pointer: coarse` (ayuda táctil); la
  guarda del `pointerdown` del joystick (+`view.cam.tieneDedo`); 3 líneas en `readAxes()` tras la del joystick; un
  bloque nuevo de pantalla completa tras el botón de VR.
- `apps/plaza/index.html`: la regla CSS `#help` (ancho `max-content`, para que no se parta a media pantalla), una regla
  `#pantalla` tras `#construir`, el texto de `#help`, y `<button id="pantalla">` tras `#construir`.
- `docs/JUGADOR.md`: 3 filas de § 1 (cámara, táctil, mando) y una sección nueva al final; `packages/render/README.md`.

## Decisiones

- **Controlador propio, no OrbitControls:** la entrada se reparte con el constructor (botón izquierdo, rueda, gizmo),
  y hay dos modos; la cuenta (≈ 200 líneas) es pura y se prueba en Node. Ideas tomadas: OrbitControls (ángulos
  esféricos, rueda exponencial, zoom al cursor escalando la cámara alrededor del punto), OnCyber AWE (MIT: pose
  deseada y pose dibujada que la persigue; editor con suavizado), Hyperfy2 (solo comportamiento: rueda que acerca,
  inclinación limitada, 1.ª persona). Nada copiado.
- **La cámara nunca gira sola detrás del avatar** (lo pidió el integrador; además el avatar aún no mira a ningún sitio).
  `reiniciar()` acepta un yaw para cuando la rama avatares tenga hacia dónde mira.
- **Construir: el punto de la cámara va pegado a tu avatar con un desplazamiento.** Si andas mientras construyes, la
  vista viaja contigo en vez de quedarse atrás; sin andar es una cámara de editor libre.
- **El zoom al cursor apunta al suelo (y 0)** bajo el puntero; si el rayo no lo toca, acerca hacia el punto de giro.
  Sin raycast contra objetos (más barato; suficiente en la plaza plana).
- **Suelo como única colisión:** mirando hacia arriba desde abajo, la cámara se acerca para no meterse bajo tierra.
- **El clic tras un arrastre izquierdo se traga** (solo ese, con una ventana de 300 ms): así J4 «clic sobre cosas»
  puede escuchar `click` sin confundir un giro con un clic. La cámara no para ningún otro evento: el joystick pregunta
  `tieneDedo()` en vez de que la cámara corte la propagación, para que otros oyentes de `window` sigan viéndolo todo.
- **Tiempo real entre dibujos:** `update()` mide el tiempo desde el dibujo anterior (con tope de 0,1 s) en vez de fiarse
  del `dt` del bucle, que con el tope de 30 fps del móvil sería la mitad.
- **Botón de pantalla completa bajo el HUD a la izquierda** y no abajo: abajo a la izquierda es donde cae el pulgar del
  joystick.

## Números (de ejecuciones, 2026-10-15)

- Pruebas unitarias: **103 en verde** (92 + 11 nuevas en `test/camara.test.ts`).
- Puertas (`npm run gates`, antes de cada commit): todas en verde; tick p99 7,74 ms (plaza de 1.000), 25,0 kbit/s por
  persona, determinismo igual (la simulación no se toca).
- e2e (`E2E_SERVER_PORT=8801 E2E_VITE_PORT=5181 E2E_HTTPS_PORT=5191 E2E_CPUS=4-7 tools/auto.sh e2e`), última pasada,
  todo en verde: chromium (A anda −5,19 m en z, 0 correcciones, 6 llamadas / 243 triángulos), firefox (−6,0 m, 0),
  AR (IWER), VR (IWER), `camara` (11 de 11), https (−3,61 m, 0). La pasada anterior, con la máquina a carga 25 (los
  navegadores de las otras ramas), falló chromium y https solo en la distancia andada (−3,19 y −2,8 m, umbral −3,5;
  0 correcciones): el fallo conocido de GL por software que pierde ticks; repetida enseguida, verde.
- Pierna `camara` (última pasada): rueda 10,4 → 18,95 m → 0 (1.ª persona, ojo 1,60 m) → 1,5 m; Inicio 10,4 m; V 0 ↔
  10,4 m; `−` 12,08 m, `=` 10,4 m; `,` 400 ms = +0,71 rad; clic sin mover = 1 clic y yaw igual; arrastre izquierdo de
  200 px = −1,10 rad y ningún clic; arrastre derecho de 286 px = −90,1°, menú contextual parado; **W 1,5 s tras girar
  90° = 6,0 m por +x, error 0,1°, 0 correcciones**; construir: `frame` deja el punto en (3; 0,5; −4) a 2,4 m, izquierdo
  sin Alt 0 rad, Alt+izquierdo −0,88 rad, central 0,67 m, rueda al cursor 2,4 → 1,78 m con el punto movido 0,38 m,
  bloqueada no se mueve; vuelta a jugar: sobre ti, 10,4 m y quieta (`ocupada()` falso); mando (falso): −1,14 rad y
  3,8 m hacia la cámara, error 0,1°, 0 correcciones; pantalla completa entra y sale; táctil (Chromium, CDP): dedo
  derecho +0,785 rad sin andar, dedo izquierdo 5,05 m, pellizco 10,4 → 6,76 m.
- Peso de arranque (`vite build`, `gzip -9` de `index` + `three.core`; GLTFLoader y SkeletonUtils siguen siendo
  perezosos): **248,6 kB** frente a 244,8 kB en `55b0b3a` (**+3,8 kB**; 9,5 kB sin comprimir). Presupuesto D2 ≤ 300 kB.

## Sin comprobar

- Ningún aparato real: ni ratón de verdad con aceleración, ni panel táctil de portátil (Alt+izquierdo, pellizco de
  panel = rueda con Ctrl), ni móvil, ni tableta, ni mando físico (el e2e usa uno falso tras `navigator.getGamepads`).
- Firefox no pasa la pierna `camara` (corre solo en Chromium, como todas las piernas); la rueda en modo «líneas» de
  Firefox se normaliza (×33) sin probar con una rueda real.
- En AR con la cámara girada antes de entrar, el joystick táctil sigue girado por el yaw de la cámara normal (en AR
  manda la cámara del teléfono); sin probar.
- La convivencia real con la rama constructor (gizmo + `bloquear`) y con la de avatares (ocultar el VRM en 1.ª
  persona con `primeraPersona()`): la API está, el uso conjunto no se ha probado.

## Lo que falta

- **Colisión de la cámara con lo construido** (necesita la física, fila M6): hoy solo evita el suelo.
- **El avatar no se gira hacia donde anda** (rama avatares); cuando lo haga, «Inicio» puede ir detrás de su espalda
  con `reiniciar(yaw)`.
- Bloqueo del puntero (pointer lock) para girar sin límite: opcional, no hecho.
- Orientación de pantalla (bloquear apaisado en móvil) dentro de pantalla completa: no hecho.
- Zoom al cursor contra objetos (raycast), no solo contra el suelo.
- Ajustes de cámara para N2 (sensibilidad, invertir eje Y, movimiento reducido = sin suavizado): las constantes están
  juntas (`CAMARA` en `camara-orbita.ts`, `RATON`/`PALANCA` en `camara.ts`).

## Para el BACKLOG

- **N1:** parte de cámara, táctil, mando y pantalla completa **hecha**; propongo dejar N1 `hecho` salvo la orientación
  de pantalla (pequeña) y la prueba en aparatos reales (va con X5 y con las sesiones T1).
- Fila nueva propuesta: **N1b — cámara que choca con lo construido** (`espera a M6`).
- `docs/HYPERFY2-PARIDAD.md`, fila «Cámara en 1.ª y 3.ª persona con zoom»: pasa de ◐ a ✔.

## Dependencias nuevas

Ninguna.
