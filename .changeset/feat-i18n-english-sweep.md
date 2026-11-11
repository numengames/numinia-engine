---
"numinia-engine": minor
---

## 2026-11-11 19:00 · i18n · Every menu and interface text in English, with Spanish second · hecho
- Qué: the world's language wins when the player has not chosen one (stored choice > world > navigator > English). Every player-visible Spanish-only literal in `apps/plaza`, `packages/client`, `features/*/client.ts` moves into `tx(en, es)` / `ligar` / `data-en`+`data-es`; the notices (`avisos-en.ts`) and the bar, F1, E prompt and shared-screen texts follow the language live. Tests: a new Spanish-only literal in the swept files fails `test/idioma-barrido*.test.ts`; a Spanish announce without English fails `test/avisos-en.test.ts`.
- Números: first load 548.8 → 561.4 kB brotli; cap 560 → 565 kB (`limits.json`, for Pablo to confirm).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor.
