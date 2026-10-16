// Check an adventure folder (J5) without starting anything: every file against its format (mision@1, pnj@1, cosa@1, habitante@1, ficha@1, agente@1)
// and the references between them. Prints what loads and each problem with its file and path; exit 1 if any.
// Usage: node tools/aventura.ts [carpeta]   (default aventuras/ejemplo)
import { AGENTES_CARPETA, leerAgentes, leerFicha, lectorAventura } from "../packages/server/src/aventura.ts";
import { cargarAventura } from "../features/misiones/formato.ts";
import { leerHabitantes } from "../packages/agent/src/formato.ts";

const dir = process.argv[2] ?? "aventuras/ejemplo";
const leer = lectorAventura(dir, (l) => console.log(l));
const r = cargarAventura({ misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") });
const a = r.aventura;
console.log(`${dir}: ${a.misiones.size} misiones (${[...a.misiones.keys()].join(", ") || "-"}), ${a.pnjs.size} personas (${[...a.pnjs.keys()].join(", ") || "-"}), ${a.cosas.size} cosas (${[...a.cosas.keys()].join(", ") || "-"})`);
const h = leerHabitantes(leer("habitantes")); // P4: AI inhabitants (packages/agent)
console.log(`  ${h.habitantes.length} habitantes IA (${h.habitantes.map((x) => `${x.id}, E${x.escalon}`).join("; ") || "-"})`);
const ag = leerAgentes(leer(AGENTES_CARPETA), new Set(h.habitantes.map((x) => x.id))); // ADR-080: outside AIs by public key
console.log(`  ${ag.agentes.length} agentes de fuera (${ag.agentes.map((x) => `${x.id}${x.rol ? `, rol ${x.rol}` : ""}; responde ${x.responsable}`).join(" · ") || "-"})`);
const fi = leerFicha(dir); // ADR-074: what the world is called (aventura/ficha.json)
console.log(fi.ficha ? `  ficha: «${fi.ficha.nombre}»${fi.ficha.portada ? `, portada ${fi.ficha.portada} (el servidor mira al arrancar que la tiene)` : ""}` : "  sin ficha.json (la página y /status no dicen cómo se llama el mundo)");
const problemas = [...r.issues.map((i) => `${i.path}: ${i.message}`), ...h.problemas, ...ag.problemas, ...fi.problemas];
for (const p of problemas) console.log(`  ✗ ${p}`);
console.log(problemas.length ? `${problemas.length} problema(s): lo que los tiene no se carga.` : "Todo en orden.");
process.exit(problemas.length ? 1 : 0);
