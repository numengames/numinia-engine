# Idiomas del mundo (R-1, primer trozo): inglés por defecto, traducciones como ficheros

Las palabras de un mundo (ficha, personas, misiones, `LEEME-IA.md`) se escriben en **inglés**, el idioma por defecto de todo el sistema
(Pablo, 2026-11-07: todo mundo público se puede jugar siempre en inglés). Una traducción es **un fichero más** (file over app), nunca código:
`aventura/idiomas/<lang>.<carpeta>.<fichero>` (`es.misiones.01-abre-el-taller.json`, `es.pnj.lumen.json`) o `aventura/idiomas/<lang>.<fichero>`
(`es.ficha.json`, `es.LEEME-IA.md`). Es el fichero **entero** traducido (mismos ids, pasos y números). El idioma del mundo es `idioma` en
`ficha.json` (`"es"`, `"pt-br"`…; sin él, `en`): el servidor lee la traducción en lugar del fichero inglés, y si a un fichero le falta la suya
lee el inglés. `ficha.json` traducida cambia `nombre` y `descripcion`; el panel de ajustes, al guardar un nombre, lo escribe también en la
traducción activa. `node tools/aventura.ts <carpeta>` dice el idioma, las traducciones, y falla si una traducción no tiene su fichero inglés o
cambia algo que no sean palabras (`paridad`, claves de texto: `titulo descripcion texto nombre aceptada completada notas aviso frase oficio`).
Código: `packages/server/src/idiomas.ts`; pruebas: `test/idiomas.test.ts`. **Para añadir un idioma:** copia la carpeta `idiomas/es.*` con el
nuevo código, traduce los valores, pon `"idioma"` en la ficha.
**Lo que NO hace todavía** (siguientes trozos): un idioma por jugador (hoy es el del mundo); `entorno/` (el cable de muestra «Red button») y
los botones de la página (Construir, Añadir…; por eso el inglés de las misiones los cita con su nombre en castellano entre paréntesis).
