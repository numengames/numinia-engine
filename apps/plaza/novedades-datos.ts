// Generado por tools/novedades-generar.mjs a partir de docs/RUNLOG.md y package.json — no editar a mano.
// Vuelve a generarlo con `npm run novedades` (también corre antes de "dev" y "build").
/** La versión del motor cuando se generó este fichero (solo para quien lo lea; la comparación real la hace
 * apps/plaza/novedades.ts contra la versión del paquete que corre la página). */
export const version = "0.32.0";
/** Hasta 3 líneas, la más nueva primero. Vacío si el diario no tenía ninguna entrada con «Qué». */
export const items: readonly string[] = [
  "Las IAs se pueden llamar: por su burbuja, por su nombre, con /nombre o con el botón «Hablar con ella»; la IA puede esperar llamadas y saludar.",
  "herramienta gesto {tipo: saludar|asentir|pensar|señalar} del puente: manda un movimiento de la función gestos (lo ven quienes están a menos de 30 m).",
  "el puente (packages/agent/src/mcp-mundo.ts) guarda un buzón con los eventos llamada de la función llamar (últimas 20, 10 minutos; buzon-llamadas.ts) y las…"
];
