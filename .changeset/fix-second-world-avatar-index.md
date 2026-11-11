---
"numinia-engine": patch
---

## 2026-11-11 20:00 · avatars · Second uploaded/world avatar no longer indexed past the catalogue (capsule instead of avatar) · hecho
- Qué: in `apps/plaza/avatar.ts` the second uploaded or «De este mundo» avatar got index `casas.length + subidos.size`, one past its entry, so the player drew as a brown capsule after switching twice. The index is now `casas.length` (the entry about to be pushed).
- Números: `test/avatar-segundo-del-mundo.test.ts` (fails before the fix, passes after); sim, wire format and fingerprint untouched.
- Consumo: not measured · Sonnet 5.5.
- Cambio: patch. Commit: branch `motor-web-3d/t_22deabcd-pr-second-uploaded-world-avatar-indexed`.
- Siguiente: none.
