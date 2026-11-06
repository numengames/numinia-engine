---
"numinia-engine": patch
---

## 2026-11-04 07:16 · P9 el original que el navegador guardó ya no se rechaza; un original con copia pendiente no es «immutable» · hecho
- Qué: quien entró a un mundo antes de que el servidor hiciera la copia ligera de un .glb (meshopt) tenía el ORIGINAL guardado un año («immutable») bajo la misma url; con la copia hecha el manifiesto trae el sha256 de la copia y la página lo rechazaba («el sha256 no coincide con el del manifiesto») y el objeto no se dibujaba. La página (`apps/plaza/manifiesto.ts`) acepta ahora también los bytes cuyo sha256 es el de la propia url `/a/<sha>.<ext>` (el original es auténtico por construcción; un nivel de detalle no) y los guarda bajo ese sha. El servidor (`activos.ts` + `optimizar-cola.ts`) manda un .glb subido que aún espera su copia con `max-age=300` en vez de `immutable` un año (la cola sabe cuáles están pendientes; con el optimizador apagado o ya probado queda `immutable`).
- Números: 2 pruebas nuevas en `test/manifiesto.test.ts` (página: manifiesto con el sha de la copia + fetch que devuelve el original; servidor: cabecera antes y después de la copia); antes del arreglo fallan las 2, después pasan; unos bytes que no casan con ninguno de los dos, o el modelo en la url de un nivel, siguen rechazados. `test/subidas.test.ts` pasa a `optimizar: false` en su prueba de subida (esperaba `immutable` justo tras subir). `npm test` 2751 en verde. En vivo (mundo v2 local, perfil con los originales guardados, main contra P9): 14 objetos «no se pudo cargar … no coincide» con main, 0 con P9. #300 sobre WebGL2 en v2: 252 → 0 `bindTexture` y con WebGPU 2 212 → 0 `Destroyed texture`; el mundo v3 no tiene cristal con transmisión y no tiene ninguno de los dos avisos ni con main.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch. Commit: rama `fix/manifest-original-bytes`, local.
- Siguiente: cuando se fusione, mirar en numinia.com si siguen saliendo «no coincide» (los .glb originales de los zips v1, v2 y v3).
