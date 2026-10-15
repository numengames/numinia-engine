# Entrega de la rama `wt/salto` — J2: salto, doble salto y correr

Proyecto: numinia-engine · Para: quien junta las ramas (y Pablo) · De: agente «salto» (Opus) · Fecha: 2026-10-15 13:45 UTC ·
Estado: hecho en la rama, sin juntar con `main`.

## Qué

Paridad de movimiento con Hyperfy2 (`docs/HYPERFY2-PARIDAD.md`, filas «Correr» y «Saltar y doble salto»):

- **Simulación** (`packages/sim`): altura `y`, velocidad vertical, gravedad y suelo. Salto desde el suelo, **un salto
  más en el aire** (se recupera al aterrizar), **correr a 8 m/s** frente a andar a 4, todo en coma fija Q16.16.
  El suelo sale de una sola función, `groundHeight(x, z)` (0 en toda la plaza): M6 la sustituye.
  Componentes: `Transform` v2 (gana `y`) y `Motion` v1 (`vy`, `air`, `buf`). `getBody`/`setBody`/`sameBody` dan el
  estado completo que decide el siguiente paso.
- **Entrada**: `step(s, [entidad, mx, mz, botones])` (`INPUT_STRIDE` 4); `BTN_JUMP` = «pulsado desde la entrada
  anterior» (la página guarda el toque hasta el siguiente tick de 20 Hz: nunca se pierde un toque rápido),
  `BTN_RUN` = mantenido. Bits desconocidos se ignoran.
- **Red** (`packages/net`): INPUT gana un sexto byte de botones; SNAPSHOT lleva el estado vertical propio exacto
  (y, vy, salto en el aire gastado, búfer de salto) y la altura de los demás solo si están por encima del suelo;
  WELCOME acaba con `WIRE_FORMAT` (2).
- **Cliente** (`packages/client`): `session.tick(mx, mz, botones?)`; la predicción y la reconciliación comparan el
  estado entero (cualquier diferencia cuenta como corrección). `selfPosition(alpha)` → `{x, y, z, speed, grounded}`;
  `remotePositions()` → `{id, x, y, z, speed}` (altura interpolada como x/z; `speed` horizontal en m/s).
- **Instancia y bots** (`packages/instance`): aplica los botones; solo avanza quien mandó entrada en ese tick. Los
  bots corren en uno de cada cuatro tramos y saltan de vez en cuando (~cada 8 s).
- **Vista** (`packages/render`): cápsulas a su altura (`y + 0.85`); `Placed` gana `y?` y `speed?` (opcionales, para
  los avatares VRM); en VR el suelo del jugador sube con el salto; **A o X** saltan (`vr.takeJump()`).
- **Página** (`apps/plaza`): **Espacio** salta (otra vez en el aire: más alto; `preventDefault`; se ignora si escribes
  en un INPUT/TEXTAREA/SELECT/contentEditable), **Mayús** corre; en pantallas táctiles un botón HTML «Saltar» (el
  primero de `#acciones`) y el dedo al borde del joystick (≥ 90 %) corre; en VR, el stick al borde corre. Línea de
  ayuda con «Espacio saltar · Mayús correr».
- `describe` (lo que leen los agentes) gana `y`.
- Ficheros nuevos: `test/salto.test.ts` (10 pruebas), `tools/e2e-piernas/salto.mjs` (pierna del e2e).

## Decisiones

1. **Números de Hyperfy2, leídos y no copiados** (`PlayerLocal.js` es GPL: solo números y comportamiento): gravedad
   20 m/s², altura de salto 1,5 m (v = √(2gh) = 7,75 m/s), correr 8 m/s y andar 4, un salto en el aire que también
   pone la velocidad de salto completa. Integración de parábola exacta por tick (media de velocidades): cima 1,498 m a
   los 0,4 s, 0,8 s en el aire; doble salto en la cima: 2,996 m. Velocidad de caída máxima 50 m/s.
2. **Un avatar solo avanza cuando se aplica una entrada suya (la gravedad también)**, como los «usercmd» de
   Quake/Source. Por qué: el cliente predice un paso por entrada enviada; si el servidor aplicara la gravedad en ticks
   sin entrada, cada entrada tardía o agrupada sería una corrección. Con esto las correcciones siguen en 0 aunque la
   red agrupe o retrase entradas (probado en `test/salto.test.ts`). Consecuencia: una pestaña que deja de mandar
   (oculta) se queda quieta donde estaba, también en el aire, hasta que vuelve. **Marcar en SABER** (regla de la red).
3. **El salto es un flanco, no «mantener»**: `BTN_JUMP` significa «pulsado desde la entrada anterior». La simulación
   no necesita guardar el botón anterior y un cliente que mande el bit en cada tick no consigue más de dos saltos por
   aterrizaje ni más altura (probado). Mantener Espacio no repite saltos (en Hyperfy2 sí repite el de suelo).
4. **Búfer de salto de 3 ticks (150 ms) en la simulación**: si pulsas en el aire con el salto del aire gastado, la
   pulsación espera al suelo y saltas al aterrizar. Va en el estado (2 bits) y en el snapshot propio.
5. **Formato**: INPUT **aditivo** (6.º byte; una entrada de 5 bytes sigue valiendo = sin botones). SNAPSHOT **no
   aditivo**, formato 2: cabecera de 19 a 30 bytes (y, vy, banderas y dos cuentas) y los demás en dos listas: a ras
   de suelo (6 bytes, como antes) y con altura (8 bytes), así una multitud de pie cuesta lo mismo que antes. WELCOME
   gana `WIRE_FORMAT` al final (aditivo; un servidor antiguo da 0). Versión nueva: simulación 2 y red 2.
6. **Correr en táctil y VR = stick al borde** (≥ 0,9, como Hyperfy2) en vez de un botón de alternar: no añade
   botones y es lo que hace Hyperfy2. Consecuencia: el e2e de VR, que empuja el stick a fondo, ahora corre (19,6 m en
   2,5 s).
7. **VR: A (mano derecha) o X (izquierda)**, `buttons[4]` del mapa xr-standard; Hyperfy2 solo usa la A derecha, aquí
   valen las dos manos (zurdos). El suelo del jugador sube con el salto: si no, en VR no verías tu propio salto.
8. **Espacio nunca pulsa un botón con el foco** (`preventDefault` salvo en campos de texto): si no, quien abre
   «Construir» con el ratón y luego salta volvería a pulsar ese botón. Intro sigue activando botones.
9. **La firma de cambios de la política de energía incluye la altura**: si no, un salto sin moverse no contaba como
   cambio y se dibujaba a la cadencia de reposo.
10. La cámara sigue a la cápsula también en vertical (no toqué `draw()`: es de la rama «cámara»).

## Números (de ejecuciones del 15-10, en esta rama, núcleos 16-19)

- **Pruebas**: 102 bien, 0 mal (antes 92; +10 en `test/salto.test.ts`).
- **Puertas** (`npm run gates`, última): pruebas 102/0 · capas 0 · determinismo `f719d31b` = `f719d31b` (antes
  `e398ea35`) · ancho de banda K=50 **26,7 kbit/s** (antes 25,0) · plaza de 1.000 p50 6,7 ms · **p99 8,1 ms**
  (antes 6,5 / 8,4).
- **Huella de referencia**: **`93b192c8`** (antes `fa94375e`), igual en Node, Chromium y Firefox (sonda del e2e);
  la repetición de 10.000 ticks tarda 60–78 ms.
- **Enjambre de 1.000 por WebSocket real** (receta de `tools/swarm.sh` en mis núcleos: servidor en 1 núcleo, 30 s,
  puerto 8804): J2 tick p99 **19,3 ms** (peor 20,0; p50 14,9), **27,2 kbit/s por persona**, 179 MB, 1.000 de 1.000,
  0 caídos, steal 0 %. El mismo enjambre sobre `main` 55b0b3a (sacado con `git archive`) en la misma máquina el
  mismo día: p99 19,95 ms (peor 20,5; p50 13,1), 25,6 kbit/s, 171 MB. Actualizados `limits.json` y
  `docs/FICHA-TECNICA.md` (27,2).
- **e2e** (`tools/auto.sh e2e` con los puertos 8804/5184/5194, última pasada sobre el último commit): chromium OK
  (avanza −5,39 m con W, 0 correcciones, huella igual) · firefox OK (−6 m, 0, igual) · AR OK · VR OK (19,6 m: corre) ·
  **salto OK** · https OK (−3,8 m, 0, igual; el umbral es −3,5 m y `tools/e2e.mjs` ya avisa de que con la máquina
  cargada pierde ticks: carga media ~17 durante la pasada; en la pasada anterior, −4,2 m).
- **Pierna `salto`** (última pasada): B ve a A subir a **1,48 m** y volver a 0 · doble salto **2,79 m** y vuelta a 0 ·
  W 1,5 s = 6 m a 4 m/s, Mayús+W = 11,6 m a 8 m/s (**×1,93**; ×2,0–2,07 en pasadas anteriores) · Espacio en un campo
  de texto escribe « » y no salta · Espacio con el foco en un botón salta y no lo pulsa (0 clics) · 0
  correcciones · huella `93b192c8` = `93b192c8` · formato 2 · móvil (emulado): botón «Saltar» salta (0,67 m al primer
  muestreo), dedo a media carrera 2,68 m/s, al borde 8 m/s, 0 correcciones · VR (IWER Quest 3): la A salta y aterriza,
  0 correcciones · 0 errores de página.

## Sin comprobar y lo que falta

- **Aparatos reales**: el botón «Saltar» y correr al borde en un móvil de verdad, y A/X en unas Quest/Pico reales
  (solo emulados). El mareo en VR con el suelo que sube al saltar, sin probar en unas gafas.
- La pierna `salto` corre solo en Chromium (Firefox pasa la sonda de huella con la simulación nueva, pero no salta).
- **Una pestaña oculta a mitad de salto se queda en el aire** para los demás hasta que vuelve (decisión 2). Arreglo
  posible: el servidor deja caer a quien lleve N ticks sin mandar, a costa de una corrección al volver.
- La página no avisa todavía si su servidor habla otro formato (`session.welcome.format` ya lo dice: 0 = servidor
  antiguo); falta una línea en el HUD («recarga»).
- **Para M6**: con suelo que no sea plano harán falta «pegarse al suelo» al bajar pendientes (si no, bajar es una
  serie de caídas y solo queda el salto del aire) y el «tiempo de coyote» al salir de un borde; el criterio de la
  lista «con altura» del snapshot debería pasar a «por encima del suelo bajo sus pies».
- Volar es de H2. Mantener Espacio para encadenar saltos (Hyperfy2) no está.
- Los avatares (rama «avatares») tienen `y`, `speed` (≈4 andando, ≈8 corriendo) y, para el propio, `grounded`; para
  los demás, «en el aire» = `y > 0,02` mientras el suelo sea plano.
- Textos que quedan viejos y no podía tocar: `llms.txt` («6 bytes per visible entity» → 6 a ras de suelo, 8 con
  altura), `AGENTS.md` línea «25.5 kbit/s per person» (→ 27,2), `docs/SABER.md` §2 líneas 55–56 (huella `fa94375e` →
  `93b192c8`; 25,5 kbit/s → 27,2).

## Para el BACKLOG

- **J2 → `hecho`** (salto, doble salto y correr; números arriba). Filas que esperen a J2: pasarlas a `pendiente`.
- Fila nueva propuesta (pequeña, para turno): «Avisar en el HUD cuando el servidor habla otro formato
  (`welcome.format !== WIRE_FORMAT`): recarga la página».
- Añadir al detalle de **M6**: sustituir `groundHeight(x, z)`; pegarse al suelo en pendientes; tiempo de coyote;
  criterio de «con altura» del snapshot relativo al suelo; quien no manda entradas no avanza (mantenerlo).

## Ficheros compartidos tocados (para juntar ramas)

- `apps/plaza/main.ts`: import de `BTN_JUMP, BTN_RUN` (línea 3); bloque nuevo justo **después** de `readAxes()` (sin
  tocar su cuerpo): `saltoPendiente`, `escribiendo`, oyente de Espacio, botón «Saltar», `readButtons()`; la línea
  `signature` (incluye `y`); la línea del bucle `session.tick(mx, mz, readButtons())`. Si «cámara» cambia
  `readAxes()` de firma, solo choca esa línea del bucle.
- `apps/plaza/index.html`: solo el texto de `#help`.
- `packages/render/src/index.ts`: tipo `Placed` (+`y?`, `speed?`), tipo de `selfXZ`, y `sync()` (altura). `draw()`
  sin tocar.
- `packages/render/src/vr.ts`: `jumpWanted`/`jumpHeld`, el bucle de `inputSources` en `update()` (botón 4), el `rig`
  a la altura del avatar, y `takeJump()`.
- `packages/client/src/index.ts`: predicción, reconciliación y posiciones (todo el estado propio pasa a `Body`).
- Atención: `step()` ahora recibe **cuádruplas** (`INPUT_STRIDE`); cualquier llamada nueva con tríos en otra rama
  tiene que añadir la columna de botones. `session.tick(mx, mz)` sin botones sigue valiendo.

## Dependencias nuevas

Ninguna.
