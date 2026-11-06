---
"numinia-engine": minor
---

## 2026-11-06 07:20 · game · Derribado: falling is not dying, lifting a companion and reappearing without loss (Y45+Y46+Y47) · hecho
- Qué: new `derribado` piece (slice 1, server only). If the world has `entorno/derribado.json`, whoever falls in a fight is downed: held still, losing nothing, with `pedirAyuda`, `rendirse` or waiting for a companion to lift them (`levantar`, «E» beside them or by verb, no item, no cost). If nobody comes, after 30 s they return to the reappearance spot the world declares. `lucha`'s `jugadorCaido` event now says `quien`. Without the file nothing changes.
- Números: `test/derribado.test.ts` 7 tests green (same seed, same result and same hash).
- Consumo: not measured · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_c9331c8a-jugador-y-gm-estado-derribado-levantar-a`.
- Siguiente: Y45b (action-bar buttons, Entorno switch, join the PVP fall).
