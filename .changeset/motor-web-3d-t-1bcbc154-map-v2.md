---
"numinia-engine": minor
---

## 2026-11-11 21:40 · map · Map v2: points of interest, one filter list, painted old-map look, house icons · hecho
- Qué: the default map shows what matters (quests, places, portals, screens, information, schedule, people) instead of every object; a world declares its points in `ficha.json` `mapa` (read by the server, sent in /status). One filter list in a panel of its own (magnifying glass on the minimap and the big map), remembered per device. The zone is drawn as a painted old map; markers are the house icons (Phosphor). The farthest zoom-out is where the whole space fits the screen. Every label is English first with Spanish through the i18n catalogue. Tested by Pablo in the Symposium world.
- Números: default map in the Symposium 143 → 16 markers; `test/mapa-interes.test.ts` 16 tests.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor.
