---
"numinia-engine": minor
---

## 2026-11-10 15:00 · feature · Flash limiter (V7, first slice) · hecho
- Qué: `packages/feature/src/destellos.ts`, a pure sliding-window limiter (≤ 3 flash starts per second, WCAG 2.3.1; a caller may be stricter, never looser). The Y25 hit flash in `features/lucha/peso.ts` now asks it instead of its own copy. Not in the client first-load path.
- Falta de V7: modo sentado, `prefers-reduced-motion`/`prefers-contrast` antes del primer cuadro, e2e con `reducedMotion: 'reduce'`, other effects (despertar column, H8 particles) asking the shared limiter.
- Cambio: minor.
