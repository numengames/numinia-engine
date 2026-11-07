// Check an adventure folder (J5) without starting anything: every file against its format (objeto@1, mision@1, pnj@1, cosa@1, secuencia@1, habitante@1, ficha@1, agente@1)
// and the references between them. Prints what loads and each problem with its file and path; exit 1 if any.
// U14 (5): a sequence's models are looked for where a server would find them: the house library (activos/) and, when the
// folder is a world's aventura/, that world's datos/activos/<sha256>.glb.
// Usage: node tools/aventura.ts [carpeta]   (default aventuras/ejemplo)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTES_CARPETA, leerAgentes, leerFicha, lectorAventura } from "../packages/server/src/aventura.ts";
import { LEEME_IA, leerLeemeIA } from "../packages/server/src/leeme-ia.ts";
import { IDIOMAS_CARPETA, IDIOMA_CODIGO, IDIOMA_DEFECTO, idiomaDelMundo, paridad } from "../packages/server/src/idiomas.ts";
import { Activos, BIBLIOTECA } from "../packages/server/src/activos.ts";
import { cargarAventura } from "../features/misiones/formato.ts";
import { leerHabitantes } from "../packages/agent/src/formato.ts";
import { leerEscena } from "../features/director/escena.ts";
import { leerCatalogo } from "../features/inventario/objeto.ts";

const dir = process.argv[2] ?? "aventuras/ejemplo";
const leer = lectorAventura(dir, (l) => console.log(l));
const subidas = join(dirname(dir.replace(/\/+$/, "")), "datos", "activos"); // a world folder: <mundo>/aventura next to <mundo>/datos/activos
let activos: Activos | null = null; // indexed only if a sequence shows a model (the library is hashed on the way)
const objetos = leerCatalogo(leer("objetos")); // Y3: the weapons and relics the adventure defines (objeto@1); a `coge` step may hand one over
const r = cargarAventura({ misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas"), secuencias: leer("secuencias") }, { objetos: new Set(objetos.objetos.keys()), modelo: (sha) => (activos ??= new Activos(BIBLIOTECA, existsSync(subidas) ? subidas : null)).buscar(sha, "glb") !== null });
const a = r.aventura;
console.log(`${dir}: ${a.misiones.size} misiones (${[...a.misiones.keys()].join(", ") || "-"}), ${a.pnjs.size} personas (${[...a.pnjs.keys()].join(", ") || "-"}), ${a.cosas.size} cosas (${[...a.cosas.keys()].join(", ") || "-"})`);
if (a.secuencias.size) console.log(`  ${a.secuencias.size} secuencias (${[...a.secuencias.values()].map((s) => `${s.id}, ${s.duracion} s`).join("; ")})`);
const h = leerHabitantes(leer("habitantes")); // P4: AI inhabitants (packages/agent)
console.log(`  ${h.habitantes.length} habitantes IA (${h.habitantes.map((x) => `${x.id}, E${x.escalon}`).join("; ") || "-"})`);
const ag = leerAgentes(leer(AGENTES_CARPETA), new Set(h.habitantes.map((x) => x.id))); // ADR-080: outside AIs by public key
console.log(`  ${ag.agentes.length} agentes de fuera (${ag.agentes.map((x) => `${x.id}${x.rol ? `, rol ${x.rol}` : ""}; responde ${x.responsable}`).join(" · ") || "-"})`);
const escenas = leer("escenas").filter((f) => /\.json$/i.test(f.fichero)).map((f) => ({ f, r: leerEscena(f.fichero, f.texto) })); // N6: the director's scenes
const malas = escenas.flatMap(({ f, r }) => (r.ok ? [] : r.issues.map((i) => `escenas/${f.fichero.replace(/^.*\//, "")}: ${i.path}: ${i.message}`)));
if (escenas.length) console.log(`  ${escenas.length} escenas para quien dirige (${escenas.flatMap(({ r }) => (r.ok ? [r.value.id] : [])).join(", ") || "-"})`);
const fi = leerFicha(dir); // ADR-074: what the world is called (aventura/ficha.json)
console.log(fi.ficha ? `  ficha: «${fi.ficha.nombre}»${fi.ficha.portada ? `, portada ${fi.ficha.portada} (el servidor mira al arrancar que la tiene)` : ""}` : "  sin ficha.json (la página y /status no dicen cómo se llama el mundo)");
// R-1: the world's language (ficha.json `idioma`, English by default) and its translations (idiomas/<lang>.<folder>.<file>): each one
// must name an English file that exists and, if JSON, differ from it only in words (idiomas.ts `paridad`).
const idioma = idiomaDelMundo(dir);
const traducidos = leer(IDIOMAS_CARPETA).flatMap(({ fichero, texto }) => {
  const nombre = fichero.replace(/^.*\//, ""), m = /^([a-z]{2,3}(?:-[a-z]{2,4})?)\.(.+)$/.exec(nombre);
  return m && IDIOMA_CODIGO.test(m[1]) ? [{ lang: m[1], ruta: /^(ficha\.json|LEEME-IA\.md)$/.test(m[2]) ? m[2] : m[2].replace(".", "/"), nombre, texto }] : [{ lang: "", ruta: "", nombre, texto }];
});
const malasTrad: string[] = [];
for (const t of traducidos) {
  if (!t.lang) { malasTrad.push(`idiomas/${t.nombre}: a translation is called <lang>.<folder>.<file> (idiomas/es.pnj.lumen.json) or <lang>.<file> (idiomas/es.ficha.json)`); continue; }
  const base = join(dir, t.ruta);
  if (!existsSync(base)) { malasTrad.push(`idiomas/${t.nombre}: there is no ${t.ruta} to translate`); continue; }
  if (!t.ruta.endsWith(".json")) continue;
  try { for (const d of paridad(JSON.parse(readFileSync(base, "utf8")), JSON.parse(t.texto))) malasTrad.push(`idiomas/${t.nombre}${d}`); } catch (e) { malasTrad.push(`idiomas/${t.nombre}: ${(e as Error).message}`); }
}
const langs = [...new Set(traducidos.map((t) => t.lang).filter(Boolean))];
console.log(`  idioma: ${idioma}${idioma === IDIOMA_DEFECTO ? " (default)" : ""}${langs.length ? `; translations: ${langs.map((l) => `${l} (${traducidos.filter((t) => t.lang === l).length} files)`).join(", ")}` : "; no translations"}`);
const li = leerLeemeIA(dir); // t_06071dee: the world's note for the AIs that come in (aventura/LEEME-IA.md)
console.log(li.texto !== null ? `  ${LEEME_IA}: ${Buffer.byteLength(li.texto)} bytes (la IA que entra por el puente lo recibe con «leeme_ia»)` : li.problema ? "" : `  sin ${LEEME_IA} (una IA que entre no sabe qué puede construir aquí; el modelo: plantillas/taller/aventura/${LEEME_IA})`);
if (objetos.objetos.size) console.log(`  ${objetos.objetos.size} objetos (${[...objetos.objetos.values()].map((o) => `${o.id}: ${o.tipo} de ${o.competencia}`).join(", ")})`);
for (const a of objetos.avisos) console.log(`  aviso: objetos/${a.replace(/^.*\//, "")}`);
const problemas = [...r.issues.map((i) => `${i.path}: ${i.message}`), ...h.problemas, ...ag.problemas, ...malas, ...fi.problemas, ...malasTrad, ...(li.problema ? [li.problema] : []), ...objetos.problemas.map((p) => `objetos/${p.replace(/^.*\//, "")}`)];
for (const p of problemas) console.log(`  ✗ ${p}`);
// Pedido de Pablo (motor-vr t_5eb6d923): un mundo sin ninguna misión se queda sin hilo conductor del que colgar lo
// demás — un aviso, no un error (una aventura vacía de verdad sigue cargando: misiones/ ausente no rompe nada).
if (a.misiones.size === 0) console.log("  ⚠ sin ninguna misión: este mundo no tiene hilo conductor (la plantilla trae «Primeros pasos»; aventuras/ejemplo/misiones/primeros-pasos.json)");
console.log(problemas.length ? `${problemas.length} problema(s): lo que los tiene no se carga.` : "Todo en orden.");
process.exit(problemas.length ? 1 : 0);
