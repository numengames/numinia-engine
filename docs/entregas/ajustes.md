# Entrega: ajustes (rama `wt/ajustes`) — fila N2, con trozos de H12, V7, V8 y V11

**Proyecto:** numinia-engine · **Para:** quien junta las ramas (y Pablo) · **De:** agente «ajustes» (sesión Opus 15-10) ·
**Fecha:** 2026-10-15 (14:46 UTC) · **Estado:** lista para juntar (puertas y e2e en verde; ver Números)

## Para Pablo: cómo crece el motor a partir de ahora

Pediste un menú de ajustes que aguante lo que venga. Lo que hay debajo del menú es un **registro**: cada ajuste es un
dato (qué es, cómo se dice en voz alta, qué valores admite, qué valor toma en cada aparato y qué necesita el aparato
para tenerlo). El menú, los lectores de pantalla y los agentes de IA leen ese mismo registro; nadie dibuja un ajuste a
mano. Crecer es añadir datos:

- **Llega una tecnología nueva** (WebGPU con medición de tiempos, seguimiento de manos, WebTransport…): es una
  **capacidad**. Una línea que dice qué significa y otra que dice cómo se lee. Desde ese momento cualquier ajuste puede
  pedirla (`requiere`) o cambiar su valor de partida si está; en los aparatos que no la tienen, ese ajuste ni aparece.
- **El motor gana un ajuste** (por ejemplo «niebla» cuando llegue H4): una entrada de datos y una línea con lo que hace.
  El menú lo pinta solo, con etiqueta, descripción hablada y aviso al cambiar.
- **Una función del juego quiere el suyo** (la linterna, el chat, las misiones): lo declara junto al resto de la función
  (`ajustes` en `defineFeature`) y sale en su propio apartado del menú. Ejemplo hecho: la aventura «Despertar» declara
  «Columna de luz» (quien la apaga sigue oyendo el aviso).
- **Una aventura o un mundo quiere sus valores**: trae un fichero `mundo.ajustes.json` que cambia valores de partida
  (también por tipo de aparato), oculta lo que allí no pinta (agua en un desierto) y añade los suyos. La plaza ya trae
  uno: enseña las estadísticas, que en el motor salen apagadas.

Los valores de partida salen del aparato (un móvil empieza sin sombras ni HDR para no calentarse; un escritorio, con
ellas) y de lo que dice el sistema (si tienes puesto «reducir movimiento» o «más contraste», el motor empieza así, antes
del primer cuadro). Lo que la persona elige se guarda en su navegador; cuando exista la identidad (I1/V8), irá con ella.

**Privacidad, como decidiste:** el informe de sesión (T1) sigue **encendido por defecto**; en Ajustes → Privacidad la
persona puede apagarlo y, desde ese momento, la página deja de mandarlo (no borra lo ya enviado).

## Qué

- **Formato y validación** (`packages/feature/src/ajustes.ts`): `AjusteDecl` = `id`, `grupo`, `tipo` (`bool`, `numero`
  con `min`/`max`/`paso`/`unidad`, `eleccion` con `opciones`, `tecla` solo para ver), `nombre` y `describe` (lo que lee el
  lector de pantalla), `defecto` (valor, o `{ valor, nivel: {A,B,C,D}, si: [{ requiere, valor }] }`), `requiere`
  (`"webgpu"`, `"!tactil"`, `"memoriaGB>=4"`, `"nivel=A"`), `nota`, `alcance`, `soloVer`, `preajuste`. Validación con
  rutas, nunca lanza. `defineFeature` acepta `ajustes` (campo opcional nuevo) y rechaza la función si uno está mal.
- **Registro** (`packages/client/src/ajustes.ts`, sin DOM, probado en Node): `crearAjustes` → `declarar` (motor,
  función o mundo), `aplicarMundo` (JSON `numinia-engine/ajustes-mundo@1`, todo o nada), `alAplicar`/`aplicarTodo` (lo que
  hace cada ajuste en la página), `get`/`set` (Result con ruta)/`forzar` (solo esta carga: `?bateria`)/`restablecer`,
  `lista`/`grupos` (JSON para el menú y los agentes), `alCambiar`. Un solo camino aplica y avisa de cada cambio de valor o
  de visibilidad (también cuando una capacidad llega tarde). Guardado en `localStorage`: claves `numinia.ajustes` (los del
  motor, para todo el aparato) y `numinia.ajustes.<mundo>` (funciones y mundo), `{ v: 1, valores }`, migraciones por
  versión, lo que ya no vale se tira, lo desconocido espera a una declaración tardía, tope 64 valores / 8 KB por clave.
- **Capacidades** (`packages/client/src/capacidades.ts`): un objeto plano y vivo (`window.__numinia.capacidades`):
  `nivel` A–D, `movil` (la misma regla de `power.ts`), `backend`, `webgpu`, `xrApi`/`xrVr`/`xrAr` (llegan tarde),
  `tactil`, `punteroGrueso`, `raton`, `mando` (eventos del Gamepad), `menosMovimiento`/`masContraste`/`oscuro` (se
  actualizan si el sistema cambia), `memoriaGB`, `nucleos`, `bateriaApi`, `ahorroDatos`, `dpr`, `maxTextura`
  (`packages/render/src/capacidades.ts`), `pantallaCompleta`, `vibracion`, `voz`, `webTransport`, `camara`, `entorno.*`.
  `?nivel=A|B|C|D` fuerza el nivel. Cada una con su significado (`ajustes.capacidades()`).
- **Los 24 ajustes del motor** (`packages/client/src/ajustes-motor.ts`):
  - Gráficos: calidad (automática/baja/media/alta; también fija las cuatro del entorno), resolución 50–100 %, cuadros por
    segundo máximos, modo batería (= tecla B, y empieza encendido con Save-Data), estadísticas en pantalla, y sombras,
    agua, partículas y cielo HDR por el contrato del entorno (H4).
  - Sonido: general, música, efectos, voz — se guardan y se leen; en el menú dicen «Llega con H5».
  - Controles: sensibilidad de la cámara e invertir el eje vertical (contrato de la cámara, N1); las teclas O y B (solo
    ver) y la lista de teclas de las funciones (G saludar, H bailar…).
  - Accesibilidad: menos movimiento y alto contraste (empiezan como diga el sistema), texto grande, anunciar lo que pasa.
  - Interfaz: tamaño de la interfaz 75–200 %, ayuda de teclas. Privacidad: enviar el informe de la sesión.
- **Política de energía** (`packages/render/src/power.ts`): `setCalidad` (baja: ratio 1, 30 fps, 12 parado; media: 1,5,
  60, 20; alta: 2, 60, 30; automática = lo de antes según la clase), `setResolucion` (parte del ratio, 0,25–1); el modo
  batería sigue mandando y la resolución dinámica sigue bajando si el cuadro cuesta. `stats` dice `calidad` y `resolucion`.
- **El menú** (`apps/plaza/menu-ajustes.ts` + `index.html`): botón ⚙ arriba a la derecha (AR, VR y Construir se corren
  un botón a la izquierda) y tecla **O**; un `<dialog>` modal de HTML de verdad: un `fieldset` por grupo, casillas,
  deslizadores y desplegables con su `label` y su descripción (`aria-describedby`), notas visibles, cambios en vivo y
  anunciados en una línea `role=status` (los deslizadores esperan 400 ms), «Restablecer todo», Escape o O cierran, un clic
  fuera también. Al abrir, el foco va al título (nada cambia por accidente). Las teclas pulsadas dentro no llegan al mundo
  y los toques no arrancan el joystick. Oculto en XR. Se aplica todo **antes del primer cuadro**.
- **Agentes:** `window.__numinia.ajustes` = `lista()`, `grupos()`, `get(id)`, `set(id, v)` (Result con ruta),
  `restablecer(id?)`, `abrir()`, `cerrar()`, `abierto`, `capacidades()`; `window.__numinia.capacidades`.
- **e2e:** `tools/e2e-piernas/ajustes.mjs` (chromium y firefox).

Ficheros nuevos: `packages/feature/src/ajustes.ts`, `packages/client/src/{ajustes,ajustes-motor,capacidades}.ts`,
`packages/render/src/capacidades.ts`, `apps/plaza/menu-ajustes.ts`, `apps/plaza/mundo.ajustes.json`,
`test/ajustes.test.ts`, `tools/e2e-piernas/ajustes.mjs`, este fichero.

**Ficheros compartidos tocados (para juntar):**
- `packages/feature/src/index.ts`: 3 líneas de import/export tras `import type { Fields }`; el campo `ajustes?` tras
  `store?` en `FeatureDecl`; 1 línea en `defineFeature` justo antes de `return Object.freeze`; el gancho `ajuste?(id)`
  (3 líneas) en `ViewHooks` tras `announce?`.
- `packages/render/src/power.ts`: `Calidad` y `CALIDADES` tras `isMobileClass`; dos `let`, `q()` y las tres funciones de
  tope en `createPower`; `calidad`/`setCalidad`/`resolucion`/`setResolucion` tras `get scale()`; la fórmula de
  `pixelRatio()`; dos campos más en `stats`.
- `packages/render/src/index.ts`: 1 línea `export { limitesGraficos }` tras el export de `power.ts`.
- `apps/plaza/main.ts`: 1 import tras el de `net`; el gancho `ajuste:` tras `beacon:`; un bloque de 4 líneas
  (`montarAjustes(…)`) entre la línea `__numinia = {…}` y el comentario de la tecla B. Nada más (la tecla B no cambia: el
  menú guarda lo que deja).
- `apps/plaza/index.html`: un bloque CSS al final del `<style>` (incluye `#ar, #vr, #construir { right: 62px }`: si otra
  rama mueve esos botones, revisar) y un bloque HTML tras `#avisos-urgentes`. La línea `#help` **no** se toca: «O ajustes»
  se añade desde el código (solo con ratón y teclado).
- `features/despertar/feature.ts` y `client.ts` (el ajuste de ejemplo; sin cambiar `version`: no toca la red).
- Documentos: `docs/EXTENDER.md` (dos secciones al final), `docs/JUGADOR.md` (marcas de 4 filas N2), `docs/MOVIL-FRIO.md`
  (3 filas y un párrafo), `docs/FICHA-TECNICA.md` (sección «Ajustes (N2)» antes de «Navegador»), `limits.json` (2
  entradas antes de `feature_saved_loss_on_crash`), `packages/client/README.md`, `packages/feature/README.md`.
- **Al juntar, añadir** en `packages/render/README.md` (Main API): `setCalidad`/`setResolucion` de `createPower` y
  `limitesGraficos` (no lo toqué: todas las ramas cambian esa línea).

## Contratos

- **Expuestos:** `window.__numinia.ajustes` y `window.__numinia.capacidades` (arriba); `defineFeature({ ajustes })` +
  `view.ajuste?.(id)` para las funciones; el fichero de mundo `numinia-engine/ajustes-mundo@1`; `escribiendo(e)` exportado
  desde `apps/plaza/menu-ajustes.ts` (copia exacta de la de la rama chat: al juntar, importar `./escribiendo.ts` y borrar
  la copia). La rama **mapa** llama a `window.__numinia.ajustes?.abrir?.()`: existe y devuelve `true` si abrió.
- **Consumidos (opcionales):**
  - `view.cam?.ajustar?.({ sensibilidad, invertirY })` — `sensibilidad` 1 = normal (0,25–3), `invertirY` booleano. **La
    rama cámara todavía no tiene `ajustar`**: hacen falta ~5 líneas en `camara.ts` (multiplicar los giros de ratón, dedo y
    mando por `sensibilidad` y cambiar el signo de la inclinación si `invertirY`). Mientras no exista, esos dos ajustes
    están ocultos (capacidad `camara` = `typeof view.cam?.ajustar === "function"`, leída al montar).
  - `view.entorno?.calidad?.({ sombras: "no"|"baja"|"media"|"alta", agua: "simple"|"reflejos", particulas:
    "pocas"|"normal"|"muchas", hdr })` y `view.entorno?.capacidades?.()` (`{ sombras?, agua?, particulas?, hdr? }`: un
    `false` oculta ese ajuste). Se llama con los cuatro valores al arrancar y cada vez que cambia uno. Sin entorno, los
    cuatro ajustes están ocultos.

## Decisiones

- **Sin paquete nuevo.** Un `packages/ajustes` obligaba a tocar `llms.txt` (la prueba de documentación exige que cada
  paquete salga allí) y a mandar un paquete más con el instalador del servidor. El formato y su validación van con el
  enchufe (`feature`: las funciones los declaran y el servidor ya los valida al cargar), el registro y las capacidades con
  el cliente (lado del jugador, sin DOM). Las capas no cambian.
- **Se guarda solo lo que la persona elige**; lo demás sigue al aparato (si cambia de móvil a escritorio, o el motor
  mejora un valor de partida, lo nota). Los del motor valen para todo el aparato; los de funciones y mundos, por mundo.
- **Lo que no puede funcionar no se enseña** (`requiere`): cámara y entorno aparecen al juntar sus ramas. El sonido sí se
  enseña, con «Llega con H5», como pediste: así sus valores ya existen cuando llegue el mezclador.
- **Calidad = preajuste:** elegirla fija sombras, agua, partículas y HDR; luego cada uno se puede cambiar suelto;
  «Automática» los devuelve a lo del aparato. Sin indicador «personalizada» (falta).
- **Los parámetros de la URL valen para esa carga** (`?bateria`, `?fps=` como significado de «Automático», `?nivel=`) y
  no se guardan; el siguiente cambio de la persona manda.
- **Diálogo modal y foco en el título:** el mundo no recibe teclas ni toques mientras está abierto; nada cambia por
  pulsar una flecha sin querer. La región `aria-live` del mundo queda fuera del diálogo (inerte): mientras está abierto,
  lo que pase en el mundo probablemente no se lea (sin comprobar con un lector).
- **Nivel del aparato por capacidad** (estimado): clase móvil + VR inmersiva = B; clase móvil con ≤ 2 GB = D; clase
  móvil = C; si no, A (también escritorio sin WebGPU). Los informes T1 de aparatos reales lo corregirán.
- **«Anunciar lo que pasa» apagado** = `aria-live="off"` en la región cortés; los avisos de seguridad (asertivos) se leen
  siempre. **«Menos movimiento»** quita las animaciones de la interfaz y los saltitos de las funciones; la cámara y los
  destellos son V7.
- **«Tamaño de la interfaz» con `zoom` de CSS** sobre todo lo que no es el lienzo ni el joystick: no hubo que tocar el CSS
  de las otras ramas. Firefox lo entiende desde la 126; uno más viejo lo ignora.
- **Nombre `menu-ajustes.ts` y no `ajustes.ts`:** en `dev:lan` el proxy `/a` se traga cualquier ruta que empiece por
  `/a` (la rama chat lo arregla con `/a/`; aun así, mejor no depender de eso).

## Números (de ejecuciones, 2026-10-15)

- Pruebas unitarias: **107 en verde** (92 + 15 nuevas en `test/ajustes.test.ts`: capacidades y nivel, `requiere`,
  valores por nivel y por preferencia del sistema, ocultar y aparecer al llegar la capacidad, validación con rutas, ida y
  vuelta del guardado, migración y versiones rotas, tope del guardado, `forzar`, preajuste de calidad, una función que
  falla, ajustes de una función, fichero de mundo y el de la plaza, `power` con calidad y resolución).
- Puertas (`npm run gates`, antes de cada commit): todas en verde; plaza de 1.000 tick p99 7,6–16,3 ms (según la carga de
  la máquina), 25,0 kbit/s.
- `tools/auto.sh e2e` con mis puertos (8810/5190/5200, núcleos 2-3), ~75 s cada vez, cuatro pasadas: la 1.ª, la 2.ª y la
  4.ª (con el último código) **chromium OK, firefox OK, AR OK, VR OK, ajustes OK, https OK**; en la 3.ª falló la de
  https solo en el paso de andar (`movedZ` −3,0, pide < −3,5; correcciones 0, gestos, objetos y sesiones bien): el fallo
  conocido de ese paso con la máquina cargada (carga ~11), el mismo que `tools/e2e.mjs` ya describe. No lo comparé con
  el árbol base.
- Pierna `ajustes` (igual en chromium y firefox): 23 controles, todos con etiqueta y descripción; O abre con el foco
  dentro; 3 tabuladores hasta «Resolución»; ← la deja en 95 % y el pixel ratio pasa de 1 a 0,95 (también el del
  renderizador); la línea de estado dice «Resolución: 95 %»; Escape cierra; al recargar sigue en 95 % y aplicado; B
  enciende el modo batería y queda guardado, otra B lo apaga; O dentro de una caja de texto no abre; un agente que pide
  3 % recibe `graficos.resolucion: a number from 50 to 100 %`; 19 tabuladores hasta «Restablecer todo», Intro vuelve a
  100 % y ratio 1; un navegador que pide menos movimiento (`reducedMotion: reduce`) arranca con la capacidad, el ajuste
  y la clase puestos; 0 errores de página.
- Peso de arranque (`npm run build`, `index` + `three.core`): **260,7 kB gz** con la rama frente a 248,7 kB en la base
  55b0b3a (**+12,0 kB**; gzip -9: 256,8 frente a 244,8 kB). Presupuesto 300 kB. Si aprieta, el dibujo del menú (~4 kB)
  puede cargarse al abrirlo la primera vez; el registro tiene que estar al arrancar.

## Sin comprobar

- **Aparatos reales**: qué nivel da un Quest o un Pico (¿clase móvil?), si llega «reducir movimiento» dentro de una sesión
  inmersiva (V2), el menú con el dedo en un móvil de verdad (solo en Chromium emulando un móvil, con captura).
- **Lectores de pantalla de verdad** (NVDA, VoiceOver, TalkBack): las etiquetas, descripciones y la línea de estado están
  en el árbol de accesibilidad (lo mira la pierna), pero nadie lo ha oído.
- **WebGPU**: el e2e dibuja con WebGL2 (`?webgl2`); `maxTextura` por WebGPU sale de `device.limits` sin probar.
- Los contratos de cámara y entorno (no existen en esta rama: sus ajustes salen ocultos), Safari, `zoom` en Firefox < 126.

## Lo que falta

- Panel de ajustes **dentro de VR** (en 3D; hoy el menú se oculta en XR) — fila nueva propuesta.
- **Cambiar teclas** (el tipo `tecla` solo enseña) — fila nueva propuesta.
- Posprocesado y antialias (H12: el antialias exige recrear el renderizador), paletas para daltonismo (JUGADOR §9),
  limitador de destellos, modo sentado y cámara tranquila (V7), lupa y contraste por función en el mundo (V11), el
  mezclador que use los volúmenes (V6/H5), los ajustes con la persona (V8, tras I1), indicador «personalizada» en la
  calidad, los ajustes de las funciones en el catálogo y en `npm run describe`, otros idiomas.

## Para el BACKLOG

- **N2 → `hecho`** (menú HTML, preferencias del sistema antes del primer cuadro, guardado local, paridad Hyperfy2:
  resolución, sombras por contrato, volúmenes guardados, tamaño de interfaz, ayuda de teclas, estadísticas). Lo que queda
  vive ya en H12, V7, V8, V11, H5.
- Filas nuevas propuestas: **N3 — Ajustes dentro de VR** (panel 3D legible, con su gemelo HTML) y **N4 — Cambiar teclas**
  (el tipo `tecla` deja de ser solo para ver; conflictos con las reservadas).
- Para el SABER: «un ajuste es un dato; lo que no puede funcionar no se enseña; se guarda solo lo elegido».

## Dependencias nuevas

Ninguna.
