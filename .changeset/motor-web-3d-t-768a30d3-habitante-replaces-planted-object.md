---
"numinia-engine": minor
---

## 2026-11-11 21:10 · agentes · An AI inhabitant can replace a planted object (`apariencia.objeto`) · hecho
- Qué: `habitante@1` accepts `apariencia.objeto` (the exact name of a planted object, e.g. «Moñoni 1»). While that AI is connected the server hides the object and its «<name> boca» companion (`oculto`, like the cable's `oculta`); they show again when the AI leaves or the server restarts. Without the field nothing changes. `features/espaciobase/bolitas.ts` and `docs/extender/misiones-y-personas-pnj.md` now describe it.
- Números: `test/habitante-objeto.test.ts` 5 tests; reference fingerprint and wire format unchanged (the server-only event `roles.ia` gained the optional text field `cuerpoObjeto`).
- Consumo: not measured · Sonnet 5.5.
- Cambio: minor. Commit: branch `wt/t_768a30d3`.
- Siguiente: none.
