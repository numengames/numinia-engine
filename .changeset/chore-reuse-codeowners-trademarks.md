---
"numinia-engine": patch
---

## 2026-11-05 14:07 · licencias · REUSE verde, CODEOWNERS y TRADEMARKS · hecho
- Qué: el repositorio declara ahora la licencia de cada fichero: `LICENSES/` con los textos (AGPL-3.0-only, CC0-1.0, CC-BY-4.0, MIT, OFL-1.1 y la reserva de Numen), `REUSE.toml` por rutas (código AGPL-3.0-only, documentación CC-BY-4.0, activos CC0 de su fuente, tipografías Geist y Bebas Neue en OFL-1.1, Phosphor y Bruno Simon/three.js en MIT dentro de `iconos.ts` y `follaje.ts`), `CODEOWNERS` con @PabloFMM y `TRADEMARKS.md`. La sección de licencia del README coincide. Sin cambios de código.
- Números: `reuse lint` antes: 7 de 1595 ficheros con información, no conforme; después: 1598/1598, conforme con REUSE 3.3. Sin puertas que correr: no toca código.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch. Commit: rama `chore/reuse-codeowners-trademarks`.
- Siguiente: un trabajo de CI con `reuse lint` (necesita la puerta de `.github/workflows/`).
