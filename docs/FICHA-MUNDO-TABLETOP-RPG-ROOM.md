# World sheet · Tabletop RPG Room

Format of Pablo's `DECISIONES-MUNDOS.md` (2026-11-07, fifth round), for the world in `plantillas/tabletop-rpg-room`
(formerly «Sala de rol para 5», the tholos). A blank is written «pending»; nothing is invented.

| Field | Value |
|---|---|
| name | Tabletop RPG Room (formerly «Sala de rol para 5 (tholos)»); publication path `numinia-assets/mundos/tabletop-rpg-room/`; git tag `tabletop-rpg-room-v1.0.0` after the merge |
| description | A round Greek-style hall for five players and whoever runs the game: an olive-wood table with the map at its centre, seats you really sit in, a director's staff, a voice bubble only the table hears, a gear dice tower rolled by the server and scenes that change light, fog and sky. Senet teaches newcomers in two short missions. |
| type | template world (`plantillas/tabletop-rpg-room`, chosen with `MOTOR_PLANTILLA=tabletop-rpg-room`); it carries its built things in `datos/` |
| state | ready to publish; the signature of an Oráculo (STD-014 / PRO-018) and the history scan (PUB-001..005) are pending |
| creator | Numen Games (`creador` in `ficha.json`) |
| owner | pending (consultation with ATH21; `dueno: "pending"` in `ficha.json`) |
| version | 1.0.0 (`version` in `ficha.json`; one version per template in `main`, work in progress lives on its branch) |
| machine | pending |
| capacity (Small 20 / Medium 50 / Large 100) | pending (the engine's default applies; the table seats 6) |
| weight (deck of missions) | pending: two missions, to be given a weight of the deck (0·1·2·3·5·8·13·20·40·100·∞·?) by Pablo |
| remaining hours | pending |
| size | about 0.8 MB of files (`du -sb plantillas/tabletop-rpg-room`), of which 0.58 MB is the hall model |
| pieces, creator, licence, provenance | see `aventura/LICENSE.md`: the hall model (8,026 triangles), the invisible collider, the sample map, the built world, texts and environment; all CC0-1.0, Numen Games, person with AI (confirm). Senet's body (house robot, CC0 Quaternius), the staff (house model, CC0) and the sit animations (CC0 Quaternius) live in the engine. Each piece was checked: none is third party inside this folder |
| mark check | no logo or other mark in any file; «Numen Games» appears only as a statement of origin (sheet and glb `copyright`). The word «Numinia» was removed from the English and Spanish texts |
| playable languages | English (default) and Spanish. Every file of `aventura/` and `entorno/` is English; `aventura/idiomas/es.*` holds the Spanish translation of Senet, 2 missions, 2 things, 6 scenes, the sheet and the note for AIs. The names of the objects, the seat, bubble and tower labels and the sample map are English only |
| visibility | public |
| dependencies | engine with seats (`features/asiento`), staff (`features/baculo`), voice bubble (`features/burbujas`), dice (`features/dados`), holes (`objetos` v5) and the `sentarse` animation; a template that carries `datos/` (same change as the Art Gallery PR); the language mechanism R-1 (branch `motor-web-3d/t_59476c84-…`) to play the Spanish files |
| evidence | `node tools/aventura.ts plantillas/tabletop-rpg-room/aventura`; `test/mundo-nuevo-tabletop-rpg-room.test.ts` (the real server started with `MOTOR_PLANTILLA=tabletop-rpg-room`) |

## Check: the engine pieces are in `main`

Seat, staff and voice bubble (and the dice tower) were briefs of 2026-10-21 built on side branches. They are in `main` (version 0.105.1
at the time of writing): `features/asiento`, `features/baculo`, `features/burbujas` and `features/dados` hold `feature.ts`, `server.ts` and
`client.ts`, with `test/asiento.test.ts`, `test/baculo.test.ts`, `test/burbujas.test.ts` and `test/dados.test.ts`; `activos/animaciones/sentarse.vrma` is
there. No separate pull request was needed.

## Version

`mundo.json` is written by the server at every start and is not part of a template, so the version of the world is in `ficha.json`
(`version`), which travels with the world in its zip, as for the other public worlds.

## What is left (documented, not fixed)

- **The 13 photos of the old local run** (`work/plantillas/mesa-rol/fotos/`) show the Spanish version; they are not shipped. The English
  version was not played in a browser here: only the real server start and the file checks were run.
- **Dice are a card, a label and an announcement**, not 3D dice falling on the tray (old note of the template).
- **The map of the table is one for the whole world**, not one per scene (`escena@1` carries no image).
- **The old live-run files** (roles, current scene, sessions, keys) were left out on purpose; the world is born with the engine's default roles.
