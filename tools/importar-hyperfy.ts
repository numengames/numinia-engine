// CLI for H11 (importar de Hyperfy, db.sqlite+assets half): node tools/importar-hyperfy.ts <db.sqlite> <assets/> <carpeta-destino>
// Prints the Spanish "informe de lo traído" and exits 1 if nothing at all could be imported (a wrong path, an
// empty db). Never touches the source db or assets folder: read-only in, a fresh/updated world folder out.
import { importarMundoHyperfy, informeTexto } from "../packages/server/src/importar-hyperfy.ts";

const [dbPath, assetsDir, destino] = process.argv.slice(2);
if (!dbPath || !assetsDir || !destino) {
  console.error("uso: node tools/importar-hyperfy.ts <db.sqlite> <carpeta assets/> <carpeta destino del mundo>");
  process.exit(1);
}
const informe = importarMundoHyperfy({ dbPath, assetsDir, destino });
console.log(informeTexto(informe));
if (informe.objetos.importados === 0 && informe.entidades.leidas > 0) {
  console.error("ninguna entidad se pudo importar (revisa el informe de arriba)");
  process.exit(1);
}
