// MIS-292: a release says its semantic version (imagen.json `version`) and attaches novedades.json (kind + text per
// change since the last release). Built here from fixture fragments, and the real script is checked for writing both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// @ts-ignore plain .mjs tool
import { construirRelease, textoQue, ultimaEntradaRunlog } from "../tools/novedades-release.mjs";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const frag = (salto: string, hora: string, titulo: string, que: string) =>
  `---\n"numinia-engine": ${salto}\n---\n\n## 2026-11-06 ${hora} · tema · ${titulo} · hecho\n- Qué: ${que}\n  segunda línea.\n- Números: 1 prueba.\n`;

function arbol(version: string, fragmentos: Record<string, string>, runlog = "# Diario\n") {
  const d = mkdtempSync(join(tmpdir(), "rel-"));
  mkdirSync(join(d, ".changeset")); mkdirSync(join(d, "docs"));
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "numinia-engine", version }));
  writeFileSync(join(d, "docs/RUNLOG.md"), runlog);
  for (const [n, t] of Object.entries(fragmentos)) writeFileSync(join(d, ".changeset", n), t);
  return d;
}

test("pending fragments: the version is the one the highest jump gives; one entry per fragment with kind and text", () => {
  const d = arbol("0.105.1", {
    "a.md": frag("patch", "10:00", "arreglo", "arregla algo."),
    "b.md": frag("minor", "11:00", "nuevo", "añade algo."),
  });
  const r = construirRelease(d);
  assert.equal(r.version, "0.106.0");
  assert.equal(r.novedades.length, 2);
  assert.deepEqual(r.novedades.map((n: any) => n.kind), ["patch", "minor"]);
  assert.equal(r.novedades[1].text, "añade algo. segunda línea.");
  for (const n of r.novedades) { assert.ok(n.kind && n.text, "kind and text are never empty"); }
});

test("no fragments pending: package.json's version and the newest diary entry", () => {
  const log = `# Diario\n\n## 2026-11-05 08:00 · t · viejo · hecho\n- Qué: viejo.\n\n## 2026-11-06 09:00 · t · nuevo · hecho\n- Qué: lo nuevo.\n- Cambio: minor. Commit: x.\n`;
  const r = construirRelease(arbol("0.105.1", {}, log));
  assert.equal(r.version, "0.105.1");
  assert.deepEqual(r.novedades.map((n: any) => [n.kind, n.text]), [["minor", "lo nuevo."]]);
  assert.equal(ultimaEntradaRunlog("nada"), null);
  assert.equal(textoQue("## x\n- Números: 1"), "");
});

test("a bad fragment stops the release with its name (nothing half published)", () => {
  assert.throws(() => construirRelease(arbol("0.1.0", { "mal.md": "sin frontmatter" })), /mal\.md/);
});

test("the CLI writes novedades.json and prints a valid semver; publicar-version.sh puts both in the release", () => {
  const out = join(mkdtempSync(join(tmpdir(), "rel-")), "novedades.json");
  const v = spawnSync("node", ["tools/novedades-release.mjs", "version"], { cwd: raiz, encoding: "utf8" });
  assert.equal(v.status, 0, v.stderr);
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+$/);
  const n = spawnSync("node", ["tools/novedades-release.mjs", "novedades", out], { cwd: raiz, encoding: "utf8" });
  assert.equal(n.status, 0, n.stderr);
  const lista = JSON.parse(readFileSync(out, "utf8"));
  assert.ok(Array.isArray(lista) && lista.length >= 1);
  for (const e of lista) { assert.ok(e.kind && e.text); }
  const sh = readFileSync(join(raiz, "tools/publicar-version.sh"), "utf8");
  assert.match(sh, /"version":"%s"/, "imagen.json carries version");
  assert.match(sh, /\$dir\/novedades\.json" \$\(for/, "novedades.json is attached to the release");
  assert.match(sh, /sha256sum instalar-motor\.sh imagen\.json novedades\.json/);
});
