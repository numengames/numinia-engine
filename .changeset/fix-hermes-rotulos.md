---
"numinia-engine": patch
---

## 2026-11-05 09:30 · mundo-hermes · Rótulos del espejo sin solapes ni cortes (M10) · hecho
- Qué: las placas planas sobre las cosas del espejo se deslizan hacia dentro de la pantalla (ya no se cortan en los bordes), no suben por encima del borde superior (si no caben, se ocultan), nunca tapan su propia figura y no parpadean entre fotogramas (histéresis: la que se vio antes cuenta como algo más cercana). Además, si el puerto del enlace local (8791 por defecto) está ocupado, el motor lo dice en una línea clara y sigue sin enlace, en lugar de caerse con un error sin capturar. Sin espejo nada cambia.
- Números: ver la descripción del PR.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: patch. Commit: rama `hermes/rotulos`.
- Siguiente: los rótulos que quedan bajo los paneles de la interfaz y los que tapan figuras de otras filas.
