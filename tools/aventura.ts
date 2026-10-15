// Check an adventure folder (J5) without starting anything: every file against its format (mision@1, pnj@1, cosa@1)
// and the references between them. Prints what loads and each problem with its file and path; exit 1 if any.
// Usage: node tools/aventura.ts [carpeta]   (default aventuras/ejemplo)
import { lectorAventura } from "../packages/server/src/aventura.ts";
import { cargarAventura } from "../features/misiones/formato.ts";

const dir = process.argv[2] ?? "aventuras/ejemplo";
const leer = lectorAventura(dir, (l) => console.log(l));
const r = cargarAventura({ misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") });
const a = r.aventura;
console.log(`${dir}: ${a.misiones.size} misiones (${[...a.misiones.keys()].join(", ") || "-"}), ${a.pnjs.size} personas (${[...a.pnjs.keys()].join(", ") || "-"}), ${a.cosas.size} cosas (${[...a.cosas.keys()].join(", ") || "-"})`);
for (const i of r.issues) console.log(`  ✗ ${i.path}: ${i.message}`);
console.log(r.issues.length ? `${r.issues.length} problema(s): lo que los tiene no se carga.` : "Todo en orden.");
process.exit(r.issues.length ? 1 : 0);
