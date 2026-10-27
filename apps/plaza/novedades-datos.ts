// Generado por tools/novedades-generar.mjs a partir de docs/RUNLOG.md y package.json — no editar a mano.
// Vuelve a generarlo con `npm run novedades` (también corre antes de "dev" y "build").
/** La versión del motor cuando se generó este fichero (solo para quien lo lea; la comparación real la hace
 * apps/plaza/novedades.ts contra la versión del paquete que corre la página). */
export const version = "0.93.0";
/** Hasta 3 líneas, la más nueva primero. Vacío si el diario no tenía ninguna entrada con «Qué». */
export const items: readonly string[] = [
  "cuatro piernas fallaban en main (también en 0.80.0).",
  "(1) Al salir de VR la cámara plana puede traer la posición en NaN un cuadro; el oyente de audio la copiaba, la distancia a cada sonido salía NaN y volumen…",
  "(1) «Gente» en el menú de VR dice «IA · Activa · a 5 m» cuando el tamaño del modelo no se sabe o no viene (antes, un dato ausente salía como «Tama…"
];
