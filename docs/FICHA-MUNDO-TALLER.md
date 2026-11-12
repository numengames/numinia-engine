# World sheet · Learn to Build (the former Taller, «La plaza a oscuras»)

Format of Pablo's `DECISIONES-MUNDOS.md` (2026-11-07), for the world in `plantillas/taller`. A blank is written «pending»; nothing is invented.

| Field | Value |
|---|---|
| name | Learn to Build (Spanish: «Aprende a construir»). Internal id and folder stay `taller` (`plantillas/taller`, renaming would break the template default); publication path `numinia-assets/mundos/learn-to-build/` |
| version | 1.0.0 (semantic; `version` in `aventura/ficha.json`; a published version is never rewritten) |
| creator | Numen Games |
| description | A newborn world, at night, with Lumen, the guardian of the workshop; 11 short missions teach to build: place, move, switch off and wire cables. |
| type | template world (`plantillas/taller`), what every new world is born with |
| state | ready to publish; the signature of an Oráculo (STD-014 / PRO-018) is pending |
| owner | pending (to be confirmed with ATH21; `dueno: "pending"` in `ficha.json`) |
| machine | pending |
| capacity (Small 20 / Medium 50 / Large 100) | pending (the engine's default applies) |
| weight (deck of missions) | pending (not weighed) |
| remaining hours | pending |
| size | 49.6 kB of files (`du -sb plantillas/taller`), without the shared models |
| pieces, creator, licence, provenance | see `aventura/LICENSE.md`: texts and data, CC0-1.0, Numen Games S.L., person with AI (confirm); Lumen's model, CC0-1.0, Quaternius; Lantern, CC0-1.0, Numen Games S.L. (script). **Not CC0:** the Khepri logo object planted by the base space (trademark, `TRADEMARKS.md`) |
| playable languages | English (default, required) and Spanish (`aventura/idiomas/es.*`, `"idioma": "es"` in `ficha.json`); checked against the real reader and a real server start in `test/idiomas.test.ts` and `test/mundo-nuevo-taller.test.ts`. Known limits: one language per world, not per player; the page buttons (Construir, Añadir…) are still Spanish; `entorno/` has no translation mechanism |
| visibility | public |
| dependencies | engine with the `hace` mission step and the guide arrow (numinia-engine#210, 0.34.0) |
| evidence | `node tools/aventura.ts plantillas/taller/aventura` → «Todo en orden»; `test/idiomas.test.ts`, `test/mundo-nuevo-taller.test.ts`; Suma checks: LIC-001/002/007/008/009/011/012 (STD-010) reviewed in this change, history scan and signature (PUB-001..005, PRO-018) NOT done |
