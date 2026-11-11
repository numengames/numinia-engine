---
"numinia-engine": patch
---

## 2026-11-11 15:00 · fix · Turning the camera no longer raycasts the whole scene · hecho
- Qué: the link-hover pick (`apps/plaza/enlaces.ts`) no longer runs while a mouse button is held or the pointer is locked, and is spaced by 8x its own cost. Measured on the Symposium world (RTX 4080): the pick costs 47 ms p50; turning the camera fell to 26-43 fps, and 60 fps without the pick.
- Falta: make `view.pickThing` itself cheap (only things with a link, or a BVH).
- Cambio: patch.
