// H11 CLI (the .hyp half): node tools/importar-hyp.ts <fichero.hyp> <carpeta apps/ del mundo> [--licencia CC0-1.0] [--autor "Nombre"] [--id nombre] [--reemplazar]
// Reads the .hyp (never writes to it) and makes <apps/>/<id>/ in the engine's app format, the script kept apart as «por portar».
// --licencia = the licence of the SOURCE as you know it (SPDX). Without it the licence is «desconocida» and no file or script is
// copied: they are listed as omitted with the reason (docs/SABER.md §3.3). Exit 1 when the .hyp cannot be read.
import { informeTexto, importarHyp } from "../packages/server/src/importar-hyp.ts";

const args = process.argv.slice(2), pos: string[] = [], op: Record<string, string | true> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) { const k = args[i].slice(2); op[k] = k === "reemplazar" ? true : (args[++i] ?? ""); } else pos.push(args[i]);
}
if (pos.length !== 2) {
  console.error("uso: node tools/importar-hyp.ts <fichero.hyp> <carpeta apps/> [--licencia CC0-1.0] [--autor \"Nombre\"] [--id nombre] [--reemplazar]");
  process.exit(2);
}
try {
  const informe = importarHyp({ hyp: pos[0], destino: pos[1], licencia: typeof op.licencia === "string" && op.licencia ? op.licencia : undefined, autor: typeof op.autor === "string" ? op.autor : undefined, id: typeof op.id === "string" && op.id ? op.id : undefined, reemplazar: op.reemplazar === true });
  console.log(informeTexto(informe));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
