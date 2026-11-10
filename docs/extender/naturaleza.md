# Naturaleza (N4): relieve, árboles y hierba que enciende un fichero

`features/naturaleza` es la pieza más corta de copiar para «el servidor solo guarda y manda un fichero del mundo; la página construye»:
`MUNDO_DIR/naturaleza.json` (`numinia-engine/naturaleza@1`: `activa`, `semilla`, `tamano`, `plaza`, `densidad: { arboles, hierba }`,
`estanque`, `paleta`; todo opcional, claves de más rechazadas con cómo arreglarlas) → `features/mundo.ts` lo valida (si está mal, lo dice en
el log y el mundo sigue plano) → la página llama a `view.naturaleza.aplicar(datos)`. Sin el fichero no cambia nada. Detalle, números y
la advertencia de que aún no hay colisión con el terreno (N5): `docs/NATURALEZA.md` sección N4.
