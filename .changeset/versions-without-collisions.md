---
"numinia-engine": minor
---

## 2026-11-04 09:22 · V1 · cambios sin choques entre PR (fragmentos tipo Changesets) · hecho
- Qué: un PR ya no mueve la versión ni escribe en el diario: deja un fichero propio `.changeset/<rama>.md` (el formato de Changesets: el paquete y el salto arriba, la entrada del diario debajo). El número lo mueve un único PR de versión con `npm run cambios:juntar`, que toma el salto más alto, escribe la versión una vez, pasa las entradas al diario por su hora y borra los fragmentos. Antes todos los PR tocaban las mismas líneas (`package.json`, `package-lock.json`, `docs/RUNLOG.md`, `novedades-datos.ts`) y al entrar uno los demás quedaban en conflicto y la cola de fusión los echaba (hoy, #301–#305). `apps/plaza/novedades-datos.ts` deja de estar en git: se genera del diario y de los fragmentos pendientes.
- Números: `tools/juntar-cambios.mjs` + `tools/lib/cambios.mjs` (lógica pura) nuevos, `test/cambios.test.ts` con 16 pruebas (antes: la herramienta no existía y el fichero no cargaba); seis ramas mezcladas en dos órdenes sin un solo conflicto (ver el PR).
- Consumo: sin medir · Sonnet 5.5.
- Cambio: minor (esta entrada es el propio fragmento; el número no se mueve aquí). Commit: rama `chore/versions-without-collisions`, local.
- Siguiente: rehacer #301–#305 con su fragmento; abrir el primer PR de versión (`chore(release): x.y.z`) cuando haya varios fusionados.
