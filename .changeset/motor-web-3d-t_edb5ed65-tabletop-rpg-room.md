---
"numinia-engine": minor
---

## 2026-11-07 05:30 · plantillas · Tabletop RPG Room: the former tholos as a public CC0 template (1.0.0) · hecho
- Qué: new template `plantillas/tabletop-rpg-room` (chosen with `MOTOR_PLANTILLA=tabletop-rpg-room`): the built tholos with the table and the hole for the director's map (`datos/`, 3 files by sha256), Senet, two missions, two things, six scenes, and an `entorno/` that switches on seats, director's staff, voice bubble and dice tower and keeps the house pond, target, creature and Hall of Ancestors out. Every word is English (object names, sign-free: the sample map was redrawn in English, the glb materials renamed); the Spanish translation sits in `aventura/idiomas/es.*`. English sheet and note for AIs, semantic `version` 1.0.0, creator Numen Games, owner pending, CC0 licence file (marks excluded, none shipped), `REUSE.toml` annotation, world sheet `docs/FICHA-MUNDO-TABLETOP-RPG-ROOM.md`. `sembrar` copies a template's `datos/` (same two lines as the Art Gallery PR). Seats, staff, voice bubble and dice were already in `main` (`features/asiento`, `baculo`, `burbujas`, `dados`): no separate PR.
- Números: `test/mundo-nuevo-tabletop-rpg-room.test.ts` (9 tests, real server included); `node tools/aventura.ts plantillas/tabletop-rpg-room/aventura` passes.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_edb5ed65-tabletop-rpg-room-v1.0.0-p-blico-el-thol`; git tag `tabletop-rpg-room-v1.0.0` after the merge.
- Siguiente: play the Spanish files once the language mechanism (R-1) is merged; the Oraculo signature; the history scan (PUB-001..005).
