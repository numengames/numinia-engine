// M19 CLI: read the apps of a world the way the engine does, without starting it.
//   node tools/apps.ts listar  <carpeta apps/>   what loads (id, properties, events, files) and what is rejected, with where and why
//   node tools/apps.ts validar <carpeta apps/>   the same, exit 1 when any app is rejected (for a script or a CI step)
//   node tools/apps.ts json    <carpeta apps/>   what GET /apps answers
// Nothing is written and no script runs: main.ts is stored, hashed and listed (the SES sandbox is M20).
import { leerApps, listaDeApps, textoDeApps } from "../packages/server/src/apps.ts";

const [orden, dir] = process.argv.slice(2);
if (!["listar", "validar", "json"].includes(orden ?? "") || !dir) {
  console.error("uso: node tools/apps.ts listar|validar|json <carpeta apps/>");
  process.exit(2);
}
const l = leerApps(dir);
if (orden === "json") console.log(JSON.stringify(listaDeApps(l), null, 2));
else console.log(textoDeApps(l));
if (orden === "validar" && l.rechazadas.length) process.exit(1);
