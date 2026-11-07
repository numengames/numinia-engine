---
"numinia-engine": minor
---

## 2026-11-07 03:38 · idiomas · The Taller is public: English by default, Spanish as a translation file, CC0 licence · hecho
- Qué: R-1 first slice, `packages/server/src/idiomas.ts`: a world's words are English; a translation is a file `aventura/idiomas/<lang>.<folder>.<file>` and the world's language is `idioma` in `ficha.json` (default `en`). The adventure reader, the sheet and the note for AIs read the translation, falling back to English; the settings panel keeps the translated name in step; `tools/aventura.ts` checks that a translation differs only in words. The Taller (sheet, Lumen, 11 missions, LEEME-IA, sample cable) is now English with the Spanish text in `idiomas/es.*`. Licence file `aventura/LICENSE.md` (CC0-1.0 except the logo/marks, see TRADEMARKS.md), `REUSE.toml` annotation for `plantillas/taller/**`, world sheet `docs/FICHA-MUNDO-TALLER.md`. The engine licence is untouched.
- Números: `test/idiomas.test.ts` 3 tests; `node tools/aventura.ts plantillas/taller/aventura` passes. The browser run (`tools/e2e-piernas/mundo-nuevo-taller.mjs`) was edited for the new names and NOT run.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_59476c84-taller-p-blico-misiones-jugables-en-ingl`.
- Siguiente: one language per player; `entorno/` and page buttons in English; Oráculo signature (PRO-018).
