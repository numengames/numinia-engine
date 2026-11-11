---
"numinia-engine": patch
---

## 2026-11-11 13:04 · aparato · Solo un puntero grueso hace móvil a un aparato · hecho
- Qué: la clase móvil de potencia (`isMobileClass`, `decidirAparato`) depende solo del puntero grueso; `navigator.deviceMemory` (los navegadores lo recortan a 2-4 GB) ya no convierte un PC en móvil (sin antialias, sombras recortadas). `nivelDe` solo manda a la nivel D por memoria baja si el aparato es móvil.
- Números: `test/aparato.test.ts` 14 pruebas, `test/power.test.ts` +2 (fallan antes del arreglo).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch. Commit: branch `fix/client-mobile-class-pointer-only`.
- Siguiente: `capacidades.ts` `esMovil` aún cuenta la memoria (la página lo pisa con el valor de power); alinearlo si hace falta.
