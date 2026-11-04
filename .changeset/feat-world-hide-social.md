---
"numinia-engine": minor
---

## 2026-11-04 07:06 · P7 un mundo puede quitar los botones sociales (Saludar, Bailar, Movimientos) · hecho
- Qué: la ficha del mundo (`ficha@1`) gana `interfaz: { ocultar: ["gestos"] }` (R-1: una línea y el mundo no los enseña). Con él, «Saludar», «Bailar» y «Movimientos» desaparecen de la barra de abajo en escritorio, del menú «…» del móvil y del botón «Movimientos» de la pantalla táctil. Solo quita botones: las teclas G y H y el «Saludar» de la tarjeta de una persona siguen. Un nombre que no existe se deja fuera y se dice en el registro; sin el campo, ni `/status` ni la pantalla cambian. Lo lee `leerInterfaz` (servidor, como `tema`), sale en `GET /status` y la página lo aplica en `apps/plaza/interfaz-mundo.ts`; documentado en `docs/EXTENDER.md`.
- Números: `test/interfaz-mundo.test.ts` nuevo (7 pruebas; antes del cambio no cargaba: faltaba el módulo). Medido en Chromium contra el mundo v3 con y sin el campo: barra de escritorio `Saludar, Bailar H, Movimientos, Recoger F, Soltar Q` → `Recoger F, Soltar Q`; menú «…» del móvil (412 px) sin Saludar, Bailar ni Movimientos; botón táctil `hidden` = true. Suite 2756 bien.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `feat/world-hide-social`.
- Siguiente: la copia del mundo v3 con el campo (`mundo-v3-p7`) y reimportarla cuando la rama se fusione.
