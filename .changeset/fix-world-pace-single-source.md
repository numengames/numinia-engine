---
"numinia-engine": patch
---

## 2026-11-12 06:10 · movimiento · el ritmo del mundo, una sola fuente · hecho
- Qué: `movimientoDelMundo` valida el `entorno.json` entero (como la página); una clave mala en cualquier sitio ya no deja al servidor andando a 3/6 y a la página prediciendo 1,5/4. `leerMovimiento` redondea al paso del cable (0,1 m/s, 1°). Tope de andar y correr: 6 m/s (antes 10 y 20), porque un paso de 1 m por tic saltaba paredes finas. Prueba de control: sin el ritmo en la página, la predicción se corrige.
- Cambio: patch (arreglos tras #364).
- Siguiente: la velocidad del mando en VR (`vr-paso.ts`) sigue fija en 1,5/4: decide Pablo.
