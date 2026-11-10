---
"numinia-engine": patch
---

## 2026-11-10 07:55 · documentación · EXTENDER.md en un fichero por pieza y llms.txt más corto · hecho
- Qué: la receta de funciones se reparte en un fichero por pieza (`docs/extender/`) y `llms.txt` deja una frase por paquete, para que los PR dejen de chocar en esos dos ficheros.
- Números: `docs/EXTENDER.md` pasa de 2464 líneas / 279 KB a 135 líneas / 8,8 KB (receta + índice); 40 secciones movidas línea por línea a `docs/extender/<pieza>.md` (2092 líneas no vacías, conjunto idéntico); 8 viñetas de paquete de `llms.txt` acortadas (la de `server` pasa de 4003 a 235 caracteres) y sus datos extra pasan a «Details moved from llms.txt» en cada README.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: patch. Commit: branch `docs/split-extender-llms`.
- Siguiente: que una pieza nueva documente en su fichero y añada una línea al índice (regla en CONTRIBUTING.md y AGENTS.md).
