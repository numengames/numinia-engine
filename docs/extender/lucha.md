# Lucha (v1, L1): criaturas con coherencia y un golpe que decide el servidor

`features/lucha` es el ejemplo de **cosa del mundo que se golpea**. Una criatura es una entrada de estado con `at` y ficha
`criatura` (`interact: { intent: "golpear", prompt: "golpear a {nombre}", radius: "radio" }`): «E: golpear a Guardián de
Crisálida» al acercarte. Diseño completo (combate y bestiario de 12): `mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md`.
- **Caja sólida sin tocar la simulación**: el valor lleva `solido: true` y `bx0 by0 bz0 bx1 by1 bz1` (m), igual que
  `objetos`; la instancia y la página rehacen las cajas solas (`solidsFrom`). Al disolverse, `solido: false` y se atraviesa.
- **Coherencia, no vida**: en Numinia las criaturas se disuelven, no mueren. `coherencia`/`coherenciaMax` vienen de la
  ficha (`bestiario.ts`: nombre, caja, radio, color y la cita del canon). A 0: `modo: "disuelta"`, evento `disuelta`, y
  `vuelve` entera a los `REAPARICION_S` (20 s; `reaparicion: 0` en el mundo = nunca).
- **El golpe** (`feature.ts`): `golpear { objetivo }` → `api.within` (radio + margen J4; si no, `aire` solo a ti) →
  enfriamiento por jugador como «tick desde el que puede» (`ENFRIAMIENTO_TICKS` 12 = 0,6 s; el segundo golpe se traga sin
  evento) → daño `DANO_BASE + rngNext % DANO_VAR` (3-5) con el PRNG del motor mezclando el tick (misma semilla, mismos
  golpes) → `golpe { objetivo, de, dano, queda }` a 40 m. Nada de trabajo cuando nada cambia: `onTick` solo mira la lista
  de disueltas pendientes.
- **La página** (`client.ts`) dibuja la criatura con el bloque de la casa escalado a su caja y pintado del color de la
  ficha (`view.place("lucha:<clave>")`), el nombre encima (`view.tag`), flash blanco 100 ms y «−N» 700 ms al golpe; el
  tinte va a gris con la coherencia. Sin partículas, sin 3D nuevo.
- **Golpe con peso (Y25) and the «reduce motion» contract** (`features/lucha/peso.ts`, presentation only: no `sim`, no fingerprint, no wire
  format, no new event). A blow you land does three things on your page: the picture holds for `PAUSA_FOTOGRAMAS` (3; always 2-5) frames
  through `view.pausa(n)` (the page skips only its draw; the 20 Hz ticks and the network go on), the creature (never the screen) flashes
  `DESTELLO_MS` (100 ms) and a low thud plays (`golpe-material`, through `view.sonido`). Only YOUR blow pauses; other people's blows
  flash and thud but never stutter your picture. A flash never repeats more than `DESTELLOS_POR_S_MAX` (3) per second, however many
  blows, abilities and lunges land. Inside a headset (VR/AR) there is no pause.
  - **The switch** is the engine setting `accesibilidad.menosMovimiento` («Reducir movimiento»): its default follows the system's
  `prefers-reduced-motion` (`menosMovimiento` capability, updated live) and the person may force it. A feature reads it with
  `view.movimientoReducido?.()` on every use (pull, never cache). With it on: no pause, no flash, no shake, no vignette. What stays: the
  «−N» text, the announcement (`Golpe: −{dano}, le quedan {queda}.`) and the sound, so a blow is never left without a signal.
  - **Contract for the next ones** (L5 camera shake and vignette, Y26 local acknowledgement): ask `view.movimientoReducido?.()` or
  `crearPeso({ reducido, enXR })` before moving anything that is not the person's own input; never add an event for it. The verb the
  juice serves is «golpear»; other verbs get no extra shake.
  - Tests: `test/lucha-peso.test.ts` (both switch positions, the burst limit, the live change, text/announcement/sound always present).
- **Un mundo** trae sus criaturas en `MUNDO_DIR/lucha.json` (`{ "criaturas": [{ id, especie, x, y, z, nombre?,
  reaparicion? }] }`, `features/mundo.ts`); sin fichero, el Guardián de la casa en (24, 10). Especie desconocida = se
  avisa y no se pone.
- **PVE por defecto**: el objetivo es una criatura salvo que el mundo active el PVP en su `entorno.json` (`pvp` / `zonasPvp`, arriba; objetivo `p:<entidad>`); que la criatura se mueva es fila L2-L8.
