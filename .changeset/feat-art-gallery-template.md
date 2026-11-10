---
"numinia-engine": minor
---

## 2026-11-07 04:20 · plantillas · Art Gallery: the former Galeria Stoa as a public CC0 template · hecho
- Qué: new template `plantillas/art-gallery` (chosen with `MOTOR_PLANTILLA=art-gallery`): the built stoa with its 21 holes (`datos/`, 30 files by sha256), the curator, the critic, Lia, Pau, Nora, three visitors, three missions, five postcards, three scenes. Every word is English, the 22 signs and object names too; the Spanish translation sits in `aventura/idiomas/es.*`. English sheet and note for AIs, semantic `version`, creator Numen Games, owner pending, CC0 licence file (marks excluded, none shipped), `REUSE.toml` annotation, world sheet `docs/FICHA-MUNDO-ART-GALLERY.md`. `sembrar` also copies a template's `datos/` when it has one (additive; the other templates have none). The huecos (U12) were already in `main`: no separate PR.
- Números: `test/mundo-nuevo-art-gallery.test.ts` (8 tests, real server included); `node tools/aventura.ts plantillas/art-gallery/aventura` passes.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: branch `motor-web-3d/t_6e535c94-art-gallery-p-blico-nombre-textos-en-ing`.
- Siguiente: people still show as robots in game photos (documented in the sheet); play the Spanish files once the language mechanism (R-1) is merged; the Oraculo signature.
