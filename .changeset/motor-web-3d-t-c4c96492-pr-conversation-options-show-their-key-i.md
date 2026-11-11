---
"numinia-engine": patch
---

## 2026-11-11 16:27 · plaza · Conversation options show their key in a box: E first, Q last · hecho
- Qué: in an open conversation the first answer is E, the last one (with two or more) is Q, the ones between keep their number. The key is drawn as a boxed <kbd> like the bottom bar's badges (no «E.»), phones show no keys. Q is caught in capture while the box is open, so it neither opens the microphone nor drops what you hold.
- Números: tests for teclaDeOpcion and for Q not reaching other listeners (test/dialogo-e.test.ts).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch.
