---
"numinia-engine": minor
---

## 2026-11-07 06:00 · game · Weighty blow: hit pause, flash and thud, with a «Reduce motion» switch (Y25) · hecho
- Qué: a blow you land now has weight on your page. The picture holds 3 frames (hit pause, only the page's draw; the ticks and the server are untouched), the creature flashes for 100 ms (never the whole screen, at most 3 flashes per second) and a low thud plays. Only your own blow pauses; no pause in VR/AR. The engine setting «Reducir movimiento» (`accesibilidad.menosMovimiento`, default from the system's prefers-reduced-motion, live) turns off pause and flash; the «−N» text, the announcement and the sound always stay. New optional view hooks `movimientoReducido()` and `pausa(frames)` (L5 will read the same switch). Piece: `features/lucha/peso.ts`; recipe in `docs/EXTENDER.md` (Lucha).
- Números: `test/lucha-peso.test.ts` 8 tests green; fingerprint, wire format and `sim` untouched.
- Consumo: not measured · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_2cf6aed3-ola-1-y25-golpe-con-peso-jugador-y-maest`.
- Siguiente: L5 (camera shake and vignette) inherits the switch; Y26 (local acknowledgement) goes after this.
