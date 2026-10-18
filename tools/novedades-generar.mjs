#!/usr/bin/env node
// Generates apps/plaza/novedades-datos.ts from docs/RUNLOG.md + package.json: the 3 most recent diary entries'
// «Qué» line, baked into the bundle at build time so the browser never downloads the diary (t_bdc2c2db).
// Run by hand (`npm run novedades`) or automatically before dev/build ("predev"/"prebuild" in package.json).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { novedadesDeRunlog } from "../packages/client/src/novedades.ts";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const version = JSON.parse(readFileSync(`${raiz}package.json`, "utf8")).version;
const diario = readFileSync(`${raiz}docs/RUNLOG.md`, "utf8");
const items = novedadesDeRunlog(diario, 3);

const out = `// Generado por tools/novedades-generar.mjs a partir de docs/RUNLOG.md y package.json — no editar a mano.
// Vuelve a generarlo con \`npm run novedades\` (también corre antes de "dev" y "build").
/** La versión del motor cuando se generó este fichero (solo para quien lo lea; la comparación real la hace
 * apps/plaza/novedades.ts contra la versión del paquete que corre la página). */
export const version = ${JSON.stringify(version)};
/** Hasta 3 líneas, la más nueva primero. Vacío si el diario no tenía ninguna entrada con «Qué». */
export const items: readonly string[] = ${JSON.stringify(items, null, 2).replace(/\n/g, "\n")};
`;
writeFileSync(`${raiz}apps/plaza/novedades-datos.ts`, out);
console.log(`[novedades] ${items.length} novedades para v${version} escritas en apps/plaza/novedades-datos.ts`);
