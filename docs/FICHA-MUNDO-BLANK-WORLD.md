# World sheet · Blank World

Format of Pablo's `DECISIONES-MUNDOS.md` (2026-11-07, second and third round), for the world in `plantillas/blank-world`
(formerly the «lienzo» template). A blank is written «pending»; nothing is invented.

| Field | Value |
|---|---|
| name | Blank World (formerly «Lienzo»); publication path `numinia-assets/mundos/blank-world/` |
| description | An empty world to build from scratch: flat ground, a daytime sky and nothing else. |
| type | template world (`plantillas/blank-world`, chosen with `MOTOR_PLANTILLA=blank-world`) |
| state | ready to publish; the signature of an Oráculo (STD-014 / PRO-018) and the history scan (PUB-001..005) are pending |
| creator | Numen Games (`creador` in `ficha.json`) |
| owner | pending (consultation with ATH21; `dueno: "pending"` in `ficha.json`) |
| version | 1.0.0 (`version` in `ficha.json`; see «Version» below) |
| machine | pending |
| capacity (Small 20 / Medium 50 / Large 100) | pending (the engine's default applies) |
| weight (deck of missions) | none: the world has no missions |
| remaining hours | pending |
| size | 6.9 kB of files (`du -sb plantillas/blank-world`); the zip of the old «lienzo» was 5.9 kB |
| pieces, creator, licence, provenance | see `aventura/LICENSE.md`: texts and data, CC0-1.0, Numen Games, person with AI (confirm). No model, sound or image |
| mark check | no logo or other mark in any file; the base space is off, so the «Logo Khepri» object is not planted. The library still offers it as a piece, trademark and not CC0 |
| playable languages | English only, which is the default; there is nothing else to translate (no missions, no dialogue). The sheet and the note for AIs are English |
| visibility | public |
| dependencies | engine with `entorno/ancestros.json` and the cable writer for a folder without `disparadores.json` (numinia-engine#197; its commit `da2b6a85` was squash-merged as `a4e967ec`, so it is in `main`) |
| evidence | `node tools/aventura.ts plantillas/blank-world/aventura` → «Todo en orden»; `test/mundo-nuevo-blank-world.test.ts` (including the real server started with `MOTOR_PLANTILLA=blank-world`: «el mundo se llama Blank World», pond 0, creatures 0, dartboards 0) |

## Version

Pablo asked for the semantic version in `mundo.json`. `mundo.json` is written by the server at every start («the engine that last
opened it») and is not part of a template, so a version put there would be overwritten. The version of the world is therefore in
`ficha.json` (`version`, a field the sheet reader keeps), which travels with the world in its zip. Putting it in `mundo.json`
needs an engine change (the server would have to copy it); to be decided.
