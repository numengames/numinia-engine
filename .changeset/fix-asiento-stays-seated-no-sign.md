---
"numinia-engine": patch
---

## 2026-11-11 13:04 · asiento · Sentado se queda sentado y sin rótulo en muebles del mundo · hecho
- Qué: el movimiento de sentarse lleva `sujeto`: la política de avatares ya no levanta al avatar al final del deslizamiento; un asiento con `dibujo: false` no pone rótulo sobre quien se sienta; `SITIOS_MAX` pasa de 24 a 64 (una sala tiene 34 sillas).
- Números: `test/asiento.test.ts` 17 pruebas (+3); sin cambios en la simulación ni en la huella.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch. Commit: branch `fix/asiento-stays-seated-no-sign`.
- Siguiente: ninguno conocido.
