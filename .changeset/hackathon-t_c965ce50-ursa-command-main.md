---
"numinia-engine": minor
---

## 2026-11-11 20:40 · llamar · «/<agent> <text>» answered read-only from the agent's card when its brain is not listening · hecho
- Qué: with `AGENTE_TARJETA` (or `--tarjeta`) set, the MCP bridge answers a call to an AI (`/ursa hello`, the «Hablar con ella» button, its name) with one short line taken from the agent's card (`agents/<id>/OPERATOR.md`), said near, when the AI's brain has not reported itself attentive in the last 90 s. No model, no writes, no new protocol frame; the caller's words only choose which part of the card is read and are never echoed. Re-targeted from #356 (base `feat/ia-llamar`, whose PR #205 is already in `main`) onto `main`.
- Números: `test/puente-tarjeta.test.ts` 5 tests pass; with `test/llamar*.test.ts` and `test/puente-llamadas.test.ts` 55 of 57 pass, the two others (`puente-org`, `puente-sin-node`) need `ws`/`rolldown` not installed here and fail the same on `main`.
- Consumo: not measured · Sonnet 5.5.
- Cambio: minor. Commit: branch `hackathon/t_c965ce50-ursa-command-main`.
- Siguiente: Pablo merges.
