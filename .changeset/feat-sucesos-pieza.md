---
"numinia-engine": minor
---

## 2026-11-06 06:30 · sucesos · «Suceso» piece: a world event that announces itself, advances alone and rewards everyone (Y48, slice 1) · hecho
- Qué: `features/sucesos` (the server decides, R-1). A world declares its events in `sucesos.json` (`numinia-engine/sucesos@1`): each is announced to whoever is near (voice + bell, no «!» and no quest to accept), advances by itself even with nobody there, every person in its zone speeds it up (integers: `ayuda` % per person up to `ayudaMax`), it has no failure, and when it ends EVERY participant gets the whole reward and the result chains another event by a weighted draw from the engine's integer RNG (mulberry32, fixed seed). Verbs `mirar` and `lanzar` (who directs) and the chat order `/evento <id> [lanzar]`; the event card carries `interact`; taking part is standing in the zone (no gesture). Server-only events `otorga` and `cadena` for inventory/cable. Without the file the piece does nothing. Not to be confused with the facts book `evento@1` (`packages/server/src/eventos.ts`).
- Números: `test/sucesos.test.ts` 12 tests (file reader, integer pace, weighted draw, an event with nobody there, whole reward to two and none to the far one, same seed = same chain, mirar/lanzar, chat, conMundo). Simulation fingerprint unchanged (f455ffc1). `npm run gates`: types, layers, determinism, bandwidth and plaza green; the page-weight gate and its test were already red on origin/main (536277 B br > 536000) with identical numbers before and after this change.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_68c0064f-jugador-y-gm-pieza-evento-de-mundo-que-s`.
- Siguiente: Entorno switch, panel and e2e, persistence and repetition (rows Y48b–Y48d of `docs/BACKLOG.md`).
