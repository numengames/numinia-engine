---
"numinia-engine": patch
---

## 2026-11-10 14:20 · limits · First-load cap 537 → 560 kB (brotli) · hecho
- Qué: `first_load_br_bytes` in `limits.json` goes from 537.000 to 560.000 bytes. Main measures 536.4 kB, so any change to the page failed `npm run tamano` by a hair. Asked by Pablo (2026-11-10). No code changes.
- Números: `node tools/tamano.mjs` and `test/tamano-primera-carga.test.ts` read the cap from `limits.json`.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch.
