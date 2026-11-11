---
"numinia-engine": patch
---

## 2026-11-11 13:04 · colision · Un triángulo inclinado ya no bloquea el aire de su caja · hecho
- Qué: un triángulo de pared muy inclinado (la tela de una tienda, 25 m de alto) ya no frena a quien camina por el aire de su AABB: tras el filtro por caja, `blockedMesh` pregunta a `triCrossesBox` (test de ejes separadores, float64 exacto en múltiplos de 1/64 m) si el triángulo cruza de verdad el cuerpo. Visto en vivo: no se podía entrar en una isla.
- Números: `test/tri-cruza-caja.test.ts` 4 pruebas (la de simulación falla antes del arreglo); huella de referencia y formato de la simulación sin cambios (la referencia no usa malla).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch. Commit: branch `fix/sim-steep-triangle-sat`.
- Siguiente: si algún mundo tiene paredes inclinadas que antes frenaban de más y ahora dejan pasar, revisar su colisión.
