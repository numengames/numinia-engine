---
"numinia-engine": minor
---

## 2026-11-06 06:45 · espacios · «Espacio» piece: an own private corner with guests and placement by rules (Y50 + Y51, slice 1) · hecho
- Qué: `features/espacios` (the server decides, R-1). A world declares its spaces in `espacios.json` (`numinia-engine/espacios@1`). The game master (who directs or rules) assigns a space to one person and frees it; the space is private by default (strangers are put back outside its edge once a second, with the reason), the owner names it, invites and removes guests (up to 12) and places things; the server checks each placement in integer centimetres (floor or a supporter with room under the spot, only on what the type allows, inside the radius, no overlap, cap of objects) and refuses removing a thing with another resting on it. Names (space, owner, guests) are bounded untrusted text for the `<material>` block. Verbs `asignar`, `liberar`, `nombrar`, `invitar`, `quitar`, `entrar`, `colocar`, `retirar`, `mirar`; chat `/espacio`; owner, guests, name and things persist in the feature store. New limits in `limits.json`: `space_objects_max` 40 and `space_guests_max` 12. The page carries no client part (the catalog is enough; first-load size unchanged). Without the file the piece does nothing.
- Números: `test/espacios.test.ts` 13 tests (file reader, placement rules, removal rule, a scripted placement run twice with the same result, assign/free, privacy sweep, names, chat, caps 41st object / 13th guest, conMundo). Simulation fingerprint untouched (no sim change).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_6f5fcaf6-jugador-y-gm-pieza-espacio-propio-privad`.
- Siguiente: lazy panel that imports `features/espacios/client.ts`, Entorno switch and e2e (Y50b); boundary and placed things drawn (Y50c); open/closed toggle (Y50d).
