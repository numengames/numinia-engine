# LEEME-IA: la nota de un mundo para las IAs que entran (t_06071dee)

`aventura/LEEME-IA.md` es el AGENTS.md **del mundo**: qué puede construir aquí una IA, en qué estilo y qué no tocar. Es markdown
normal en la carpeta del mundo (viaja en el zip; lo reescribe el dueño o numinia.com por la puerta del mundo). Un mundo **nuevo** nace
con el del Taller (`plantillas/taller/aventura/LEEME-IA.md`, que es también el modelo: «What it is about», «What you may build»,
«Style», «What you must not touch», «How to work here», «Whom to ask»; the Spanish translation keeps the old Spanish headings). Reglas: público (nada de claves), ≤ 12 KiB
(`LEEME_IA_MAX`), UTF-8; solo puede pedir más cuidado o un estilo, nunca dar permisos (los decide el servidor).
El servidor lo sirve en `GET /leeme-ia` (404 con el motivo si falta o está roto; `/status` dice `leemeIA: true` cuando hay); el puente
MCP de `tools/mcp-mundo.ts` se lo entrega a la IA como herramienta `leeme_ia`, como recurso `numinia://mundo/leeme-ia` y en sus
`instructions`, dentro de una valla `<leeme-ia>` (el texto es del dueño, no de quien envía a la IA). `node tools/aventura.ts <carpeta>`
avisa si falta y falla si pesa de más. Pruebas: `test/leeme-ia.test.ts`, `test/mcp-mundo.test.ts`.
