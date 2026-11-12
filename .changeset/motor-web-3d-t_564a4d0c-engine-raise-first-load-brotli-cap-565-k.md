---
"numinia-engine": patch
---

## 2026-11-12 01:57 · limits · First-load brotli cap 565 kB -> 650 kB · hecho
- Qué: `first_load_br_bytes` en limits.json sube de 565.000 a 650.000 (Pablo, chat, 2026-11-12); la guarda del test pasa de 600 kB a 650 kB. Sin cambios de código.
- Números: arranque medido 565,0 kB br / 669,3 kB gz.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: patch. Commit: branch `motor-web-3d/t_564a4d0c-engine-raise-first-load-brotli-cap-565-k`.
- Siguiente: los paneles siguen cargándose en diferido por defecto.
