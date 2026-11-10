# World sheet · Art Gallery

Format of Pablo's `DECISIONES-MUNDOS.md` (2026-11-07, fourth round), for the world in `plantillas/art-gallery`
(formerly the «Galeria Stoa» template). A blank is written «pending»; nothing is invented.

| Field | Value |
|---|---|
| name | Art Gallery (formerly «Galeria Stoa»); publication path `numinia-assets/mundos/art-gallery/` |
| description | A Mediterranean stoa for showing art: a colonnade around a courtyard with a fountain, 21 empty frame slots and two pedestals. A curator, a critic, three visiting AIs and three short missions walk you round it. |
| type | template world (`plantillas/art-gallery`, chosen with `MOTOR_PLANTILLA=art-gallery`); it carries its built things in `datos/` |
| state | ready to publish; the signature of an Oráculo (STD-014 / PRO-018) and the history scan (PUB-001..005) are pending |
| creator | Numen Games (`creador` in `ficha.json`) |
| owner | pending (consultation with ATH21; `dueno: "pending"` in `ficha.json`) |
| version | 1.0.0 (`version` in `ficha.json`; see «Version» below) |
| machine | pending |
| capacity (Small 20 / Medium 50 / Large 100) | pending (the engine's default applies) |
| weight (deck of missions) | pending: three missions, to be given a weight of the deck (0·1·2·3·5·8·13·20·40·100·∞·?) by Pablo |
| remaining hours | pending |
| size | 1.70 MB of files (`du -sb plantillas/art-gallery`), of which 1.49 MB are the 30 files of `datos/activos/` |
| pieces, creator, licence, provenance | see `aventura/LICENSE.md`: 8 models (the stoa, a collider, a sample sculpture, 5 people), 22 signs, the built world, texts and environment; all CC0-1.0, Numen Games, person with AI (confirm). Each piece was checked: every one is own work, none is third party |
| mark check | no logo or other mark in any file (the sign that said «Galería de Numinia» now says «Gallery template»); the names Numen Games and Numinia appear only as statements of origin. The base space is not part of this template |
| playable languages | English (default) and Spanish. Every file of `aventura/` is English; `aventura/idiomas/es.*` holds the Spanish translation of the 5 people, 4 AI inhabitants, 3 missions, 5 postcards, 3 scenes, the sheet and the note for AIs. The 22 signs and the names of the objects in the world are English only |
| visibility | public |
| dependencies | engine with the huecos (U12: `objetos` v5 with `huecoAncho`/`huecoAlto`/`huecoLleno`, verbs `hueco` and `rellenar`; already in `main`, see «Check» below); a template that carries `datos/` (this PR); the language mechanism R-1 (`aventura/idiomas/`, numinia-engine branch `motor-web-3d/t_59476c84-…`) to play the Spanish files |
| evidence | `node tools/aventura.ts plantillas/art-gallery/aventura`; `test/mundo-nuevo-art-gallery.test.ts` (the real server started with `MOTOR_PLANTILLA=art-gallery`: «el mundo se llama Art Gallery», 64 objects, 21 holes) |

## Check: the huecos branch is in `main`

The old note said the gallery needed the engine «with huecos» (branch `plantillas/huecos`, version 0.2.0, not in `main`). It is in `main`
(version 0.105.1 at the time of writing): `features/objetos/feature.ts` holds `huecoAncho`, `huecoAlto` and `huecoLleno`, `features/objetos/server.ts`
the verbs `hueco` and `rellenar`, `packages/net/src/ficheros.ts` `medidasImagen`, and `test/huecos.test.ts` and `test/cable-huecos.test.ts`
cover them; `docs/BACKLOG.md` lists U12 as `hecho`. No separate pull request was needed.

## Version

Pablo asked for the semantic version in `mundo.json`. `mundo.json` is written by the server at every start («the engine that last
opened it») and is not part of a template, so a version put there would be overwritten. The version of the world is therefore in
`ficha.json` (`version`), which travels with the world in its zip, as for Blank World and Learn to Build.

## What is left (documented, not fixed)

- **The people show as robots in the game photos.** The five own models (curator, critic, Ana, Teo, Iris) load (HTTP 200) and the sheet
  of the five models shows them; the photos taken in the game (`#foto=`, SwiftShader) came out with the house robot in their place, also after
  40 s of waiting. It is not known whether it is slow loading or a fault; it could not be settled without the old local test rig (the engine
  worktree it ran on no longer exists). To check by a person in a normal browser, or with `ESPERA=120000 SOLO=teo node fotos-personas.mjs`
  on a rebuilt rig.
- **The visiting AIs (Lía, Pau and Nora) walk as the house robot.** An AI inhabitant cannot carry a model of the world; the engine story
  «a look of their own for an inhabitant» is missing (`apariencia.modelo` in `habitante@1`, or `ia.cuerpo` `{tipo: "mundo", modelo}`).
- **Big pictures weigh on the Quest** (22 slots full of 2,048 × 1,365 images: about 339 MB of textures against the 256 MB of tier B, measured
  2026-10-26). The picture cap by device tier of 0.73.0 lowers it; it was not measured again here.
- **The ticket booth does not charge**: it is scenery with the curator in it.
