---
"numinia-engine": patch
---

## 2026-11-11 21:13 · feature · Habitantes: CEREBRO_URL y CEREBRO_ESPERA_S · hecho
- Qué: el servicio de habitantes lee `CEREBRO_URL` (base de la API de mensajes del proveedor; por defecto la de Anthropic) y `CEREBRO_ESPERA_S` (segundos de espera por respuesta; 20 por defecto), para usar un cerebro externo (Hermes) sin copiar `main.ts`. Sin las variables, igual que antes.
- Cambio: patch.
