// Versions without collisions: the logic behind `npm run cambios:juntar` (tools/juntar-cambios.mjs) and the news
// generator (tools/novedades-generar.mjs). A pull request leaves ONE file of its own, `.changeset/<branch>.md`, in the
// format of Changesets (https://github.com/changesets/changesets): a frontmatter that names the package and the jump
// (`"numinia-engine": minor`) and a body — here the diary entry, as docs/RUNLOG.md writes them. Nothing here is
// clever on purpose: the official CLI can replace this file later without changing a single fragment.
// Pure functions first (tested by test/cambios.test.ts), the file work at the bottom.
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SALTOS = ["patch", "minor", "major"];
/** The heading of a diary entry — the same shape packages/client/src/novedades.ts reads. */
const ENCABEZADO = /^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · .+ · (hecho|bloqueada|en curso)\s*$/;
/** Files of .changeset/ that are not fragments. */
const NO_FRAGMENTOS = new Set(["README.md", "config.json"]);

/** One fragment's text → { nombre, bumps: {paquete: salto}, cuerpo, fecha, hora }. Throws with the file name and the reason. */
export function parseFragmento(texto, nombre = "fragmento") {
  const t = String(texto).replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n?---\n?([\s\S]*)$/.exec(t);
  if (!m) throw new Error(`${nombre}: debe empezar con un bloque --- … --- (frontmatter) que nombre el paquete y el salto`);
  const bumps = {};
  for (const linea of m[1].split("\n").map((l) => l.trim()).filter(Boolean)) {
    const k = /^(?:"([^"]+)"|'([^']+)'|([^:\s]+))\s*:\s*(\S+)$/.exec(linea);
    if (!k) throw new Error(`${nombre}: línea del frontmatter no entendida: «${linea}» (se espera "paquete": minor)`);
    const [, a, b, c, salto] = k;
    if (!SALTOS.includes(salto)) throw new Error(`${nombre}: salto «${salto}» no válido (patch, minor o major)`);
    bumps[a ?? b ?? c] = salto;
  }
  if (!Object.keys(bumps).length) throw new Error(`${nombre}: el frontmatter no nombra ningún paquete`);
  const cuerpo = m[2].trim();
  const cabecera = ENCABEZADO.exec(cuerpo.split("\n")[0] ?? "");
  if (!cabecera) throw new Error(`${nombre}: el cuerpo debe empezar con la cabecera del diario «## AAAA-MM-DD HH:MM · tema · título · hecho» (docs/RUNLOG.md)`);
  if (!/^- Qué: \S/m.test(cuerpo)) throw new Error(`${nombre}: falta la línea «- Qué: …» (es lo que enseña la barra de novedades)`);
  return { nombre, bumps, cuerpo, fecha: cabecera[1], hora: cabecera[2] };
}

/** The highest jump any fragment asks of `paquete`, or null when none does. */
export function saltoMayor(fragmentos, paquete) {
  let mejor = -1;
  for (const f of fragmentos) {
    const i = SALTOS.indexOf(f.bumps[paquete]);
    if (i > mejor) mejor = i;
  }
  return mejor < 0 ? null : SALTOS[mejor];
}

/** `version` moved by `salto`. Before 1.0.0 a major is applied as a minor (docs/VERSIONES.md, Semantic Versioning point 4). */
export function siguienteVersion(version, salto) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!m) throw new Error(`versión no semántica: ${version}`);
  let [a, b, c] = m.slice(1).map(Number);
  if (salto === "major" && a === 0) salto = "minor";
  if (salto === "major") { a += 1; b = 0; c = 0; } else if (salto === "minor") { b += 1; c = 0; } else if (salto === "patch") c += 1;
  else throw new Error(`salto no válido: ${salto}`);
  return `${a}.${b}.${c}`;
}

/** Fragments in the order of their heading's time, ties by file name (the same on every machine, whatever order they merged in). */
export function ordenar(fragmentos) {
  return [...fragmentos].sort((x, y) => `${x.fecha} ${x.hora}`.localeCompare(`${y.fecha} ${y.hora}`) || (x.nombre < y.nombre ? -1 : x.nombre > y.nombre ? 1 : 0));
}

/** The diary with the fragments' entries appended (already ordered by the caller), one blank line apart, one final newline. */
export function anadirARunlog(runlog, fragmentos) {
  if (!fragmentos.length) return runlog;
  return `${runlog.replace(/\s*$/, "")}\n${fragmentos.map((f) => `\n${f.cuerpo}\n`).join("")}`;
}

/** Text of a package.json / package-lock.json with the first `cuantas` `"version": "…"` set to `nueva`; the rest byte for byte. */
export function ponerVersion(texto, nueva, cuantas = 1) {
  let n = 0;
  const salida = texto.replace(/("version":\s*")[^"]*(")/g, (todo, a, b) => (++n <= cuantas ? `${a}${nueva}${b}` : todo));
  if (n < cuantas) throw new Error(`se esperaban ${cuantas} apariciones de "version" y hay ${n}`);
  return salida;
}

/** Reads and validates every fragment of a `.changeset/` folder (README.md and config.json are not fragments). Any bad one stops all. */
export function leerFragmentos(dir) {
  if (!existsSync(dir)) return [];
  const nombres = readdirSync(dir).filter((f) => f.endsWith(".md") && !NO_FRAGMENTOS.has(f)).sort();
  return ordenar(nombres.map((f) => parseFragmento(readFileSync(join(dir, f), "utf8"), f)));
}

/**
 * The release step. Reads `<raiz>/.changeset`, picks the highest jump, and — unless `comprobar` — writes the version once
 * in package.json and package-lock.json, appends the entries to docs/RUNLOG.md and deletes the fragments. Every check runs
 * before the first write, so a bad fragment leaves the tree as it was.
 * Returns { paquete, actual, nueva, salto, fragmentos }; with no fragments `nueva` = `actual` and `salto` = null.
 */
export function juntar({ raiz, comprobar = false }) {
  const pkgFile = join(raiz, "package.json"), lockFile = join(raiz, "package-lock.json"), logFile = join(raiz, "docs/RUNLOG.md");
  const dir = join(raiz, ".changeset");
  const pkgTexto = readFileSync(pkgFile, "utf8");
  const pkg = JSON.parse(pkgTexto);
  const fragmentos = leerFragmentos(dir);
  for (const f of fragmentos) {
    const otros = Object.keys(f.bumps).filter((p) => p !== pkg.name);
    if (!(pkg.name in f.bumps)) throw new Error(`${f.nombre}: nombra ${Object.keys(f.bumps).join(", ")} pero el paquete es ${pkg.name}`);
    if (otros.length) throw new Error(`${f.nombre}: nombra paquetes que este repositorio no tiene (${otros.join(", ")})`);
  }
  const salto = saltoMayor(fragmentos, pkg.name);
  const resultado = { paquete: pkg.name, actual: pkg.version, nueva: pkg.version, salto, fragmentos };
  if (!salto) return resultado;
  resultado.nueva = siguienteVersion(pkg.version, salto);
  if (comprobar) return resultado;
  const nuevoPkg = ponerVersion(pkgTexto, resultado.nueva, 1);
  const nuevoLock = existsSync(lockFile) ? ponerVersion(readFileSync(lockFile, "utf8"), resultado.nueva, 2) : null;
  const nuevoLog = anadirARunlog(readFileSync(logFile, "utf8"), fragmentos);
  writeFileSync(pkgFile, nuevoPkg);
  if (nuevoLock) writeFileSync(lockFile, nuevoLock);
  writeFileSync(logFile, nuevoLog);
  for (const f of fragmentos) unlinkSync(join(dir, f.nombre));
  return resultado;
}
