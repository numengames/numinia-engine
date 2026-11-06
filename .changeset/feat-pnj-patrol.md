---
"numinia-engine": minor
---

## 2026-11-04 21:40 · P16 · las personas hacen una ronda por la casa, con paradas · hecho
- Qué: una persona puede andar por una ronda de 2 a 8 puntos según la fase del jugador, parándose en cada uno el tiempo que diga el autor, con su clip de caminar; al hablar con ella se para y le mira, y al despedirse sigue por donde iba. Se activa con `"ronda"` dentro de una entrada de `posiciones` del `pnj@1`; sin él, todo igual.
- Números: `test/pnj-ronda.test.ts` 12 pruebas (cuenta pura, formato, servidor y página); el cálculo de 20 personas cuesta ~1 µs por cuadro.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor. Commit: rama `feat/pnj-patrol`.
- Siguiente: fotografiar la ronda de la Cabo en el mundo v3 con la GPU.
