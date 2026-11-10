# Fauna (F1): quién hay en el mundo, sin red y sin reloj

Para repartir bichos (o cualquier cosa «viva» que salga y se vaya) sin mandar ni un mensaje, copia `packages/relieve/src/fauna.ts`: una **tabla**
de razas con `rareza` y `peso` (como `features/pesca/peces.json`, más una `epica`) y una función pura
`habitantes(semilla, celda, ventana, tabla, ctx)` que dice quién vive en una celda de 32 m durante 120 s del reloj del mundo; servidor y páginas
dan el mismo resultado. La tabla de la casa es `features/naturaleza/fauna.json` (36 razas: mariposas, luciérnagas por color, pájaros, todos
electrónicos); un mundo trae el suyo con `fauna.json` y lo enciende o recorta con `naturaleza.json` → `fauna: { activa, densidad, especies }`.
`probabilidad()` y `pVerRareza()` dan la tabla de probabilidades para documentos y diarios. Detalle, números y objetivo de rareza: `docs/NATURALEZA.md` sección F1.
