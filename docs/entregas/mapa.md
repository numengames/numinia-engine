
## Map v2 — places of interest, not noise (2026-11-11)
The default map shows you, the world's **declared places**, the active quest marks, people, AIs and the characters that matter; seats, objects
(buttons, signs, things) and decorative characters are off. Search still finds everything.
- **World data** (`aventura/ficha.json`, validated by `leerMapa`, served in `/status` as `mapa`): `puntos: [{ nombre, tipo, x, z, detalle?, id? }]`
  with `tipo` = `zona` (island/zone: its name is written large), `portal` (door to another space), `pantalla`, `info`, `agenda`; and
  `ocultar.pnj: ["publico-*", "paseante-sol"]` (characters that are only decoration). A bad entry drops only itself and the log says which.
- **Layers** (`packages/client/src/mapa-interes.ts`, `CAPAS`): the legend is the switches («Show: …»), saved per browser (`numinia.mapa.capas`,
  only the differences from the defaults). The minimap, the big map and the list follow the same filter; «you» is never filtered.
- The big map opens fitted to all the places; JS console: `__numinia.mapa.capas.estado()/poner(id, si)`, `contarTodos()`.
- Probes: `herramientas/sonda-r9.mjs` (photos + quest), `sonda-r9-capas.mjs` (toggle + reload).
