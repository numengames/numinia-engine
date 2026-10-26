# bloque-giratorio — an example app (format `numinia-engine/app@1`)

A folder an AI or a person can read and edit with no tool but a text editor.

| File | What it is |
|---|---|
| `app.json` | name, version, licence, the model by hash, the properties and events (with their schema), the accessible card |
| `main.ts` | the script. Stored and listed by the engine; **not run yet** (the sandbox is M20) |
| `assets/<sha256>.glb` | the model, named by the SHA-256 of its bytes (the same name `/a/` serves); the engine checks the name |

Use it: copy this folder into your world's `apps/` (`<mundo>/apps/bloque-giratorio/`), restart, then
`GET /apps` lists it and `node tools/apps.ts listar <mundo>/apps` prints it. Break `app.json` on purpose (a wrong
`tipo`, a missing asset) and the engine refuses the app and says the file and the JSON path.

Licences: the app is AGPL-3.0-only (Numen Games); its model is `activos/casa/bloque.glb`, CC0 (own work).
