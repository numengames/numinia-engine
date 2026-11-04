#!/usr/bin/env node
// Release step: folds the pending `.changeset/*.md` fragments into ONE version bump (npm run cambios:juntar).
//   npm run cambios:juntar                 → writes the version once in package.json and package-lock.json, appends the
//                                            fragments' entries to docs/RUNLOG.md, deletes the fragments, regenerates the news
//   npm run cambios:juntar -- --comprobar  → only validates and says which version would come out (changes nothing)
// Only the release PR (`chore(release): x.y.z`) runs the first form; every other PR just adds its fragment.
// Why: docs/VERSIONES.md «Cómo». Logic and tests: tools/lib/cambios.mjs, test/cambios.test.ts.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { juntar } from "./lib/cambios.mjs";
import { generarNovedades } from "./novedades-generar.mjs";

const args = process.argv.slice(2);
const comprobar = args.includes("--comprobar");
const i = args.indexOf("--raiz");
const raiz = i >= 0 && args[i + 1] ? args[i + 1] : fileURLToPath(new URL("..", import.meta.url));

try {
  const r = juntar({ raiz, comprobar });
  if (!r.salto) { console.log("[cambios] nada pendiente en .changeset/: no hay versión que mover"); process.exit(0); }
  const lista = r.fragmentos.map((f) => `  - ${f.nombre} (${f.bumps[r.paquete]})`).join("\n");
  console.log(`[cambios] ${r.actual} → ${r.nueva} (${r.salto}) con ${r.fragmentos.length} cambio(s):\n${lista}`);
  if (comprobar) { console.log("[cambios] --comprobar: no se ha escrito nada"); process.exit(0); }
  if (existsSync(join(raiz, "apps/plaza"))) generarNovedades(raiz);
  console.log("[cambios] hecho: package.json, package-lock.json y docs/RUNLOG.md escritos, fragmentos borrados. Commit: chore(release): " + r.nueva);
} catch (e) {
  console.error(`[cambios] ${e.message}`);
  process.exit(1);
}
