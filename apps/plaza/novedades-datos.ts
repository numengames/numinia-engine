// Generado por tools/novedades-generar.mjs a partir de docs/RUNLOG.md y package.json — no editar a mano.
// Vuelve a generarlo con `npm run novedades` (también corre antes de "dev" y "build").
/** La versión del motor cuando se generó este fichero (solo para quien lo lea; la comparación real la hace
 * apps/plaza/novedades.ts contra la versión del paquete que corre la página). */
export const version = "0.87.0";
/** Hasta 3 líneas, la más nueva primero. Vacío si el diario no tenía ninguna entrada con «Qué». */
export const items: readonly string[] = [
  "(1) Al salir de VR la cámara plana puede traer la posición en NaN un cuadro; el oyente de audio la copiaba, la distancia a cada sonido salía NaN y volumen…",
  "(1) «Gente» en el menú de VR dice «IA · Activa · a 5 m» cuando el tamaño del modelo no se sabe o no viene (antes, un dato ausente salía como «Tama…",
  "una imagen png/jpg/webp mayor que 2.048, 1.024 o 512 px tiene en el servidor una copia WebP (calidad 82) por cada tamaño que supera (optimizados/<sha>.<ext>…"
];
