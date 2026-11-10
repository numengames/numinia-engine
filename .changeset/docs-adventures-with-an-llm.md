---
"numinia-engine": patch
---

## 2026-11-10 10:00 · docs · J16: recipe for writing adventures with an LLM, tested · hecho
- Qué: `docs/extender/aventuras-con-llm.md`: the brief to give a model, the check-and-paste-back loop around `node tools/aventura.ts`, a worked example («The lighthouse lamp»: ficha, one quest of three steps, one person, one thing) and what a person must still review (the checker does not know the terrain or the tone).
- Números: `test/aventuras-con-llm.test.ts` (4 tests) reads the example's files from the page itself, checks they pass `tools/aventura.ts`, that the page's typical mistake fails with the file and path, and plays the quest to the end over the real plug.
- Siguiente: the e2e in a browser of the same adventure (the BACKLOG «hecho cuando» says e2e; this slice proves it headless over the plug); rewards that are objects, secuencias and AI inhabitants in the brief.
