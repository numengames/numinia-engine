---
"numinia-engine": minor
---

## 2026-11-11 18:30 · plaza · Keymap v1: one key, one function, two-column Controls, push-to-talk microphone on V · hecho
- Qué: `apps/plaza/teclas.ts` is the single table of the world's keys (E use, Q opposite, V microphone, I bag, C sheet, B build, Tab people, Ctrl+H hide the interface; fishing reels in with E and lets go with Q). Every listener asks it. Settings → Controls shows Default / Yours with swap-or-cancel on conflict and «Reset all»; F1 and the bar badges show the key in effect. The microphone is hold-to-talk on V (toggle in Settings), never opens by itself (also not when entering VR) and shows a fixed red «Your microphone is on».
- Números: `test/teclas.test.ts` (12 tests); freed L, R, X, Q-as-microphone; battery mode no longer has the B key (Settings only).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor.
