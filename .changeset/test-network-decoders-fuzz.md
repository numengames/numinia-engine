---
"numinia-engine": patch
---

## 2026-11-10 21:45 · test · Seeded fuzz of every network decoder (D3) · hecho
- Qué: `test/decodificadores-fuzz.test.ts` feeds noise, bit-flipped, truncated, extended and offset-view bytes to the 20 wire decoders (core messages, voice, feature catalog/message/state, `readFields`) and the upload checkers (`comprobarGlb/Trazo/Fichero`, `medidasImagen`). Each must not throw, stay under 250 ms and stay within its size cap. No engine code changes.
- Números: fixed seed, 400 cases per decoder; the file runs in about 0.3 s.
- Cambio: patch.
