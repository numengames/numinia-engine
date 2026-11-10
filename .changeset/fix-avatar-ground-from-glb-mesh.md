---
"numinia-engine": patch
---

## 2026-11-10 13:58 · avatars · Avatars read a GLB collision floor as ground (no more «flying» on an island) · hecho
- Qué: in a world whose floor is only a collision GLB (`colision: "malla"` things, no `naturaleza.json` hills) avatars no longer play the jump/fall clip all the time. The page's ground for avatars (`ClientSession.sueloTerreno()`) was only set when a terrain existed, so «in the air» was measured against the flat plaza; it now also comes from the GLB mesh. Seen live on an island at 19 m.
- Números: `test/avatar-suelo-glb.test.ts` 3 tests (the first fails before the fix, all pass after); sim, wire format and fingerprint untouched.
- Consumo: not measured · Sonnet 5.5.
- Cambio: patch. Commit: branch `fix/avatar-ground-from-glb-mesh`.
- Siguiente: with terrain and a GLB mesh together the avatar ground still reads the terrain alone; unify if a world needs both.
