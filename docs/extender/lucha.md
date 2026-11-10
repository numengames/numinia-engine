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
  ficha (`view.place("lucha:<clave>")`), el nombre encima (`view.tag`), flash blanco 80 ms y «−N» 700 ms al golpe; el
  tinte va a gris con la coherencia. Sin partículas, sin 3D nuevo.
- **Un mundo** trae sus criaturas en `MUNDO_DIR/lucha.json` (`{ "criaturas": [{ id, especie, x, y, z, nombre?,
  reaparicion? }] }`, `features/mundo.ts`); sin fichero, el Guardián de la casa en (24, 10). Especie desconocida = se
  avisa y no se pone.
- **PVE por defecto**: el objetivo es una criatura salvo que el mundo active el PVP en su `entorno.json` (`pvp` / `zonasPvp`, arriba; objetivo `p:<entidad>`); que la criatura se mueva es fila L2-L8.
