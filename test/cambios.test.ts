// Versions without collisions: a pull request leaves ONE file of its own in .changeset/ (the format of Changesets,
// https://github.com/changesets/changesets) and never touches the version, docs/RUNLOG.md or the generated news; the
// release step (tools/juntar-cambios.mjs, logic in tools/lib/cambios.mjs) folds the pending files into one bump.
// This file checks every real fragment in the tree and the folding logic on synthetic ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// @ts-ignore plain .mjs tool
import { anadirARunlog, juntar, leerFragmentos, ordenar, parseFragmento, ponerVersion, saltoMayor, siguienteVersion } from "../tools/lib/cambios.mjs";
import { novedadesDeRunlog } from "../packages/client/src/novedades.ts";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const paquete = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).name as string;

const frag = (salto: string, cabecera: string, extra = "- Qué: algo.\n- Números: 1 prueba.") =>
  `---\n"${paquete}": ${salto}\n---\n\n## ${cabecera}\n${extra}\n`;

// ---- the real fragments waiting in this checkout ----

test("every pending .changeset/*.md parses: names this package, a valid jump, a diary heading", () => {
  const dir = join(raiz, ".changeset");
  assert.ok(existsSync(join(dir, "README.md")), ".changeset/README.md explains the folder to people");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md") && x !== "README.md")) {
    const r = parseFragmento(readFileSync(join(dir, f), "utf8"), f);
    assert.deepEqual(Object.keys(r.bumps), [paquete], `${f}: must name ${paquete}`);
    assert.ok(["patch", "minor", "major"].includes(r.bumps[paquete]), `${f}: bad jump`);
    assert.match(r.cuerpo, /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2} · .+ · (hecho|bloqueada|en curso)$/m, `${f}: no diary heading`);
    assert.match(r.cuerpo, /^- Qué: /m, `${f}: the news line «Qué» is missing`);
  }
});

test("this change ships its own fragment, a minor one, and does not move the version itself", () => {
  const f = join(raiz, ".changeset/versions-without-collisions.md");
  // after the release PR folds it the file is gone; until then it is the proof the tool is used by its own PR
  if (existsSync(f)) assert.equal(parseFragmento(readFileSync(f, "utf8"), "versions-without-collisions.md").bumps[paquete], "minor");
  assert.ok(existsSync(join(raiz, "tools/juntar-cambios.mjs")));
  assert.equal(JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).scripts["cambios:juntar"], "node tools/juntar-cambios.mjs");
});

test("the generated news file is not tracked: it is made from the diary and the pending fragments", () => {
  assert.match(readFileSync(join(raiz, ".gitignore"), "utf8"), /^apps\/plaza\/novedades-datos\.ts$/m);
  const git = spawnSync("git", ["ls-files", "apps/plaza/novedades-datos.ts"], { cwd: raiz, encoding: "utf8" });
  if (git.status === 0) assert.equal(git.stdout.trim(), "", "novedades-datos.ts must not be in git");
});

test("the PR template asks for the kind of change, not for a version number", () => {
  const t = readFileSync(join(raiz, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8");
  assert.match(t, /## Change kind/);
  assert.doesNotMatch(t, /## Version/);
});

// ---- parsing ----

test("parseFragmento: frontmatter with the package and the jump, then the diary entry", () => {
  const r = parseFragmento(frag("minor", "2026-11-04 07:10 · tema · título · hecho"), "x.md");
  assert.deepEqual(r.bumps, { [paquete]: "minor" });
  assert.equal(r.fecha, "2026-11-04");
  assert.equal(r.hora, "07:10");
  assert.ok(r.cuerpo.startsWith("## 2026-11-04 07:10 · tema · título · hecho\n- Qué: algo."));
  assert.ok(!r.cuerpo.endsWith("\n"), "the body is trimmed");
});

test("parseFragmento: quotes are optional, CRLF is fine, several packages are read", () => {
  const t = `---\r\n${paquete}: patch\r\n'otro': minor\r\n---\r\n\r\n## 2026-11-04 07:10 · a · hecho\r\n- Qué: x.\r\n`;
  assert.deepEqual(parseFragmento(t, "x.md").bumps, { [paquete]: "patch", otro: "minor" });
});

test("parseFragmento: says what is wrong (file name first) instead of guessing", () => {
  const mal = (t: string, re: RegExp) => assert.throws(() => parseFragmento(t, "malo.md"), re);
  mal("sin frontmatter\n", /malo\.md.*---/);
  mal(`---\n"${paquete}": enorme\n---\n\n## 2026-11-04 07:10 · a · hecho\n- Qué: x.\n`, /malo\.md.*enorme/);
  mal(`---\n---\n\n## 2026-11-04 07:10 · a · hecho\n- Qué: x.\n`, /malo\.md.*paquete/);
  mal(`---\n"${paquete}": minor\n---\n\nsolo texto\n`, /malo\.md.*cabecera/);
  mal(`---\n"${paquete}": minor\n---\n\n## 2026-11-04 07:10 · a · hecho\n- Números: sin qué.\n`, /malo\.md.*Qué/);
});

// ---- the version ----

test("saltoMayor: the highest of the pending jumps for the package", () => {
  const f = (s: string) => parseFragmento(frag(s, "2026-11-04 07:10 · a · hecho"), `${s}.md`);
  assert.equal(saltoMayor([f("patch"), f("patch")], paquete), "patch");
  assert.equal(saltoMayor([f("patch"), f("minor"), f("patch")], paquete), "minor");
  assert.equal(saltoMayor([f("minor"), f("major"), f("patch")], paquete), "major");
  assert.equal(saltoMayor([], paquete), null);
});

test("siguienteVersion: before 1.0.0 a major is applied as a minor (docs/VERSIONES.md); from 1.0.0 it is a major", () => {
  assert.equal(siguienteVersion("0.104.1", "patch"), "0.104.2");
  assert.equal(siguienteVersion("0.104.1", "minor"), "0.105.0");
  assert.equal(siguienteVersion("0.104.1", "major"), "0.105.0");
  assert.equal(siguienteVersion("1.4.2", "patch"), "1.4.3");
  assert.equal(siguienteVersion("1.4.2", "minor"), "1.5.0");
  assert.equal(siguienteVersion("1.4.2", "major"), "2.0.0");
  assert.throws(() => siguienteVersion("1.4", "minor"), /1\.4/);
});

test("ponerVersion: writes the number once, in the first N appearances only (package-lock: root and packages[\"\"])", () => {
  const lock = `{\n  "name": "a",\n  "version": "0.104.1",\n  "packages": {\n    "": {\n      "version": "0.104.1"\n    },\n    "node_modules/x": {\n      "version": "0.104.1"\n    }\n  }\n}\n`;
  const r = ponerVersion(lock, "0.105.0", 2);
  assert.equal(r.match(/"version": "0\.105\.0"/g)?.length, 2);
  assert.equal(r.match(/"version": "0\.104\.1"/g)?.length, 1, "a dependency that happens to share the number is not touched");
  assert.equal(r.replace(/0\.105\.0/g, "0.104.1"), lock, "nothing else changed, formatting included");
  assert.throws(() => ponerVersion(lock, "0.105.0", 4), /version/);
});

// ---- the diary ----

test("ordenar: by the heading's time, then by file name; anadirARunlog appends in that order, one blank line apart", () => {
  const a = parseFragmento(frag("minor", "2026-11-04 09:00 · b · segundo · hecho"), "b.md");
  const b = parseFragmento(frag("patch", "2026-11-04 07:10 · a · primero · hecho"), "a.md");
  const c = parseFragmento(frag("patch", "2026-11-04 07:10 · a · primero-bis · hecho"), "0.md");
  assert.deepEqual(ordenar([a, b, c]).map((x: { nombre: string }) => x.nombre), ["0.md", "a.md", "b.md"]);
  const out = anadirARunlog("# Diario\n\n## 2026-11-03 10:00 · viejo · hecho\n- Qué: viejo.", ordenar([a, b]));
  const titulos = out.split("\n").filter((l: string) => l.startsWith("## "));
  assert.deepEqual(titulos, ["## 2026-11-03 10:00 · viejo · hecho", "## 2026-11-04 07:10 · a · primero · hecho", "## 2026-11-04 09:00 · b · segundo · hecho"]);
  assert.ok(out.endsWith("- Qué: algo.\n- Números: 1 prueba.\n"), "ends with one newline");
  assert.ok(!/\n\n\n/.test(out), "never two blank lines in a row");
  assert.equal(anadirARunlog("# Diario\n", []), "# Diario\n", "no fragments, no change");
});

test("the news bar reads the pending fragments too: they are the newest lines, before the version is folded", () => {
  const f = parseFragmento(frag("minor", "2026-11-04 09:00 · b · segundo · hecho", "- Qué: lo pendiente. Y más."), "b.md");
  const texto = anadirARunlog("# Diario\n\n## 2026-11-03 10:00 · viejo · hecho\n- Qué: lo viejo.\n", [f]);
  assert.deepEqual(novedadesDeRunlog(texto, 3), ["lo pendiente.", "lo viejo."]);
});

// ---- the whole release step, on a throwaway tree ----

function arbol(): string {
  const d = mkdtempSync(join(tmpdir(), "cambios-"));
  mkdirSync(join(d, ".changeset")); mkdirSync(join(d, "docs"));
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: paquete, version: "0.104.1", private: true }, null, 2) + "\n");
  writeFileSync(join(d, "package-lock.json"), JSON.stringify({ name: paquete, version: "0.104.1", lockfileVersion: 3, packages: { "": { name: paquete, version: "0.104.1" }, "node_modules/x": { version: "0.104.1" } } }, null, 2) + "\n");
  writeFileSync(join(d, "docs/RUNLOG.md"), "# Diario\n\n## 2026-11-03 10:00 · viejo · hecho\n- Qué: viejo.\n");
  writeFileSync(join(d, ".changeset/README.md"), "# not a fragment\n");
  writeFileSync(join(d, ".changeset/config.json"), "{}\n");
  writeFileSync(join(d, ".changeset/a-patch.md"), frag("patch", "2026-11-04 09:00 · a · parche · hecho"));
  writeFileSync(join(d, ".changeset/b-minor.md"), frag("minor", "2026-11-04 07:10 · b · menor · hecho"));
  return d;
}

test("juntar --comprobar: says which version would come out and changes nothing", () => {
  const d = arbol();
  const r = juntar({ raiz: d, comprobar: true });
  assert.deepEqual({ actual: r.actual, nueva: r.nueva, salto: r.salto, n: r.fragmentos.length }, { actual: "0.104.1", nueva: "0.105.0", salto: "minor", n: 2 });
  assert.equal(JSON.parse(readFileSync(join(d, "package.json"), "utf8")).version, "0.104.1");
  assert.equal(readdirSync(join(d, ".changeset")).length, 4);
});

test("juntar: one bump in package.json and the lock, entries in the diary by time, fragments deleted, README and config kept", () => {
  const d = arbol();
  const r = juntar({ raiz: d, comprobar: false });
  assert.equal(r.nueva, "0.105.0");
  assert.equal(JSON.parse(readFileSync(join(d, "package.json"), "utf8")).version, "0.105.0");
  const lock = JSON.parse(readFileSync(join(d, "package-lock.json"), "utf8"));
  assert.equal(lock.version, "0.105.0");
  assert.equal(lock.packages[""].version, "0.105.0");
  assert.equal(lock.packages["node_modules/x"].version, "0.104.1");
  const titulos = readFileSync(join(d, "docs/RUNLOG.md"), "utf8").split("\n").filter((l: string) => l.startsWith("## "));
  assert.deepEqual(titulos, ["## 2026-11-03 10:00 · viejo · hecho", "## 2026-11-04 07:10 · b · menor · hecho", "## 2026-11-04 09:00 · a · parche · hecho"]);
  assert.deepEqual(readdirSync(join(d, ".changeset")).sort(), ["README.md", "config.json"]);
  assert.equal(juntar({ raiz: d, comprobar: false }).fragmentos.length, 0, "a second run has nothing to fold and changes nothing");
  assert.equal(JSON.parse(readFileSync(join(d, "package.json"), "utf8")).version, "0.105.0");
});

test("juntar: a fragment that names another package, or is malformed, stops everything before any file is written", () => {
  const d = arbol();
  writeFileSync(join(d, ".changeset/c-otro.md"), frag("minor", "2026-11-04 08:00 · c · otro · hecho").replace(`"${paquete}"`, '"otro-paquete"'));
  assert.throws(() => juntar({ raiz: d, comprobar: false }), /c-otro\.md.*otro-paquete/);
  assert.equal(JSON.parse(readFileSync(join(d, "package.json"), "utf8")).version, "0.104.1");
  assert.equal(readdirSync(join(d, ".changeset")).length, 5);
  const e = arbol();
  writeFileSync(join(e, ".changeset/c-roto.md"), "nada\n");
  assert.throws(() => leerFragmentos(join(e, ".changeset")), /c-roto\.md/);
});

test("tools/juntar-cambios.mjs --comprobar on the real tree exits 0 and prints the version that would come out", () => {
  const r = spawnSync(process.execPath, ["tools/juntar-cambios.mjs", "--comprobar"], { cwd: raiz, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\d+\.\d+\.\d+|nada pendiente/, "a version, or «nothing pending» right after a release");
  // and the CLI itself works on another tree
  const d = arbol();
  const s = spawnSync(process.execPath, ["tools/juntar-cambios.mjs", "--comprobar", "--raiz", d], { cwd: raiz, encoding: "utf8" });
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.match(s.stdout, /0\.104\.1 → 0\.105\.0/);
});
