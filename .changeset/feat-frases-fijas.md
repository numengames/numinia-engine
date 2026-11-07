---
"numinia-engine": minor
---

## 2026-11-07 06:00 · frases · Fixed phrases: a closed list of 20 with stable ids, read in each person's language (Y29) · hecho
- Qué: `features/frases` (the server decides, R-1). `frases.json` (`numinia-engine/frases@1`): 20 phrases in 4 groups with a stable id and text in en (default) and es. Verb `frase` {id}: the server checks the id, applies the pace of the near chat (1/s, burst 3, with the reason when too fast) and tells whoever is within 20 m THE ID, never text. Each page translates when it paints (bubble with « … » marks over the speaker, a line for screen readers); changing language redraws what is on screen without resending. The list is shared state, so agents read it as cards. Page: panel «Phrases» (key Backquote, top-bar button, buttons of at least 44 px, focus in and back). The page's start bundle only holds a light door (`client.ts`); the logic loads when first needed.
- Números: `test/frases.test.ts` 11 tests (list, pinned ids in `test/frases-ids.json`, reader, language, near/far, repaint, unknown id, pace, cards, light door, accessibility). Simulation fingerprint unchanged (f455ffc1).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_aceb31db-ola-1-y29-frases-fijas-jugador-y-maestro`.
- Siguiente: VR selection of a phrase (the HTML panel is not drawn in VR; the `frase` verb and the bubble are).
