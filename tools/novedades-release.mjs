#!/usr/bin/env node
// What a release says about itself (MIS-292): the semantic version it ships and the notes of every change since the
// previous release, as data. tools/publicar-version.sh writes `version` into imagen.json and attaches novedades.json.
//   node tools/novedades-release.mjs version            → prints the version (stdout)
//   node tools/novedades-release.mjs novedades <file>   → writes novedades.json
// Source: the pending .changeset/ fragments (they wait for the next chore(release) PR, so "pending" means "since the
// last release"): version = package.json's moved by the highest jump; one entry per fragment. With none pending the
// version is package.json's and the single entry is the newest docs/RUNLOG.md entry. Pure first, file work at the bottom.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { leerFragmentos, saltoMayor, siguienteVersion, SALTOS } from "./lib/cambios.mjs";

const ENCABEZADO = /^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · (.+) · (hecho|bloqueada|en curso)\s*$/;

/** The text of the «- Qué:» line of a diary entry's body (continuation lines joined), or "". */
export function textoQue(cuerpo) {
  const lineas = String(cuerpo).split("\n");
  const i = lineas.findIndex((l) => /^- Qué: /.test(l));
  if (i < 0) return "";
  const partes = [lineas[i].replace(/^- Qué: /, "")];
  for (let j = i + 1; j < lineas.length && /^\s+\S/.test(lineas[j]); j++) partes.push(lineas[j].trim());
  return partes.join(" ").trim();
}

/** The «hecho» title of a heading: «## fecha hora · tema · título · estado» → «título» (or the topic if there is only one). */
function titulo(cuerpo) {
  const m = ENCABEZADO.exec(String(cuerpo).split("\n")[0] ?? "");
  return m ? m[3] : "";
}

/** The newest entry of a diary text as { kind, text, title, date }, or null. `kind` comes from «- Cambio: minor.» (patch if absent). */
export function ultimaEntradaRunlog(runlog) {
  const trozos = String(runlog).replace(/\r\n/g, "\n").split(/^(?=## \d{4}-\d{2}-\d{2} \d{2}:\d{2} · )/m);
  let mejor = null;
  for (const t of trozos) {
    const m = ENCABEZADO.exec(t.split("\n")[0] ?? "");
    if (!m || !textoQue(t)) continue;
    const clave = `${m[1]} ${m[2]}`;
    if (!mejor || clave >= mejor.clave) mejor = { clave, t, fecha: m[1] };
  }
  if (!mejor) return null;
  const c = /^- (?:Cambio|Versión)[^\n]*?\b(patch|minor|major|parche|menor|mayor)\b/m.exec(mejor.t);
  const kind = c ? { parche: "patch", menor: "minor", mayor: "major" }[c[1]] ?? c[1] : "patch";
  return { kind, text: textoQue(mejor.t), title: titulo(mejor.t), date: mejor.fecha };
}

/** { version, novedades: [{ kind, text, title, date }] } for the tree at `raiz`. Throws with the reason if a fragment is bad. */
export function construirRelease(raiz) {
  const pkg = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
  const fragmentos = leerFragmentos(join(raiz, ".changeset"));
  const salto = saltoMayor(fragmentos, pkg.name);
  const version = salto ? siguienteVersion(pkg.version, salto) : pkg.version;
  let novedades = fragmentos.map((f) => ({ kind: f.bumps[pkg.name], text: textoQue(f.cuerpo), title: titulo(f.cuerpo), date: f.fecha }));
  if (!novedades.length) {
    const u = ultimaEntradaRunlog(readFileSync(join(raiz, "docs/RUNLOG.md"), "utf8"));
    if (u) novedades = [u];
  }
  return { version, novedades };
}

export { SALTOS };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const [modo, destino] = process.argv.slice(2);
  try {
    const r = construirRelease(raiz);
    if (modo === "version") console.log(r.version);
    else if (modo === "novedades" && destino) writeFileSync(destino, JSON.stringify(r.novedades, null, 2) + "\n");
    else { console.error("uso: novedades-release.mjs version | novedades <fichero>"); process.exit(2); }
  } catch (e) { console.error(`[novedades-release] ${e.message}`); process.exit(1); }
}
