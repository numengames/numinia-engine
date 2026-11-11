// cli: `node packages/cli/src/check.ts <folder>` (M23) — validates a folder: every .json parses, every `numinia-engine/<name>@<n>`
// manifest names files that exist (with the sha256 it states) and gives each a licence (or leaves it to a LICENCIAS.md), and every binary asset is covered by a
// licence (a manifest entry, or a LICENCIAS.md / LICENSES.md in its folder or above, or a CC0/CC-BY annotation in REUSE.toml). Exit 1 on any problem; one line per problem.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export type CheckIssue = { path: string; message: string };
export type CheckResult = { schema: "numinia-engine/check@1"; folder: string; files: number; manifests: number; assets: number; issues: CheckIssue[] };

const ASSET = /\.(glb|gltf|vrm|vrma|opus|m4a|ogg|wav|mp3|png|jpe?g|webp|ktx2|hdr)$/i;
const LICENCE_OK = /^(CC0|CC-BY|propia|own)/i; // CC0 / CC-BY(-n.n) / our own work
const LICENCE_FILES = ["LICENCIAS.md", "LICENSES.md", "LICENCES.md", "LICENCE.md", "LICENSE.md"];
const SKIP = new Set(["node_modules", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir).sort()) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** Every object under `v` that names a file (`fichero` or `file`), with the nearest licence above it (a variant inherits its sound's). */
function entries(v: unknown, lic: unknown, out: { file: string; sha?: string; lic: unknown }[] = []): typeof out {
  if (Array.isArray(v)) { for (const x of v) entries(x, lic, out); return out; }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const l = o.licencia ?? o.licence ?? o.license ?? lic;
    const f = o.fichero ?? o.file;
    if (typeof f === "string") out.push({ file: f, sha: typeof o.sha256 === "string" ? o.sha256 : undefined, lic: l });
    for (const x of Object.values(o)) if (x && typeof x === "object") entries(x, l, out);
  }
  return out;
}

/** The globs of REUSE.toml annotations whose licence is acceptable (assets of our own work are licensed there, not in LICENCIAS.md). */
function reuseGlobs(cwd: string): RegExp[] {
  const f = join(cwd, "REUSE.toml");
  if (!existsSync(f)) return [];
  const out: RegExp[] = [];
  for (const block of readFileSync(f, "utf8").split("[[annotations]]").slice(1)) {
    const lic = block.match(/SPDX-License-Identifier\s*=\s*"([^"]+)"/)?.[1];
    if (!lic || !LICENCE_OK.test(lic)) continue;
    const paths = block.match(/^path\s*=\s*(\[[^\]]*\]|"[^"]*")/m)?.[1] ?? "";
    for (const g of paths.match(/"([^"]+)"/g) ?? []) {
      const glob = g.slice(1, -1);
      if (glob === "**") continue;
      out.push(new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`));
    }
  }
  return out;
}

export function checkFolder(folder: string, cwd = process.cwd()): CheckResult {
  const root = resolve(cwd, folder);
  const issues: CheckIssue[] = [];
  const bad = (p: string, message: string) => issues.push({ path: relative(cwd, p) || ".", message });
  if (!existsSync(root) || !statSync(root).isDirectory()) { bad(root, "not a folder"); return { schema: "numinia-engine/check@1", folder, files: 0, manifests: 0, assets: 0, issues }; }
  const files = walk(root);
  const covered = new Set<string>(); // absolute paths of assets that a manifest entry licenses
  let manifests = 0;
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    let j: unknown;
    try { j = JSON.parse(readFileSync(f, "utf8")); } catch (e) { bad(f, `invalid JSON: ${(e as Error).message}`); continue; }
    const schema = (j as { schema?: unknown } | null)?.schema;
    if (schema === undefined) continue; // plain data: parsing is all we ask
    if (typeof schema !== "string" || !/^numinia-engine\/[a-z0-9-]+@\d+$/.test(schema)) { bad(f, `"schema" must look like numinia-engine/<name>@<version>, got ${JSON.stringify(schema)}`); continue; }
    manifests++;
    for (const e of entries(j, undefined)) {
      const abs = [resolve(cwd, e.file), resolve(dirname(f), e.file)].find(existsSync);
      if (!abs) { bad(f, `${e.file}: file not found`); continue; }
      if (e.sha && createHash("sha256").update(readFileSync(abs)).digest("hex") !== e.sha) bad(f, `${e.file}: sha256 does not match the file`);
      if (e.lic === undefined) continue; // no licence stated here: a LICENCIAS.md must cover the file (checked below)
      if (typeof e.lic !== "string" || !LICENCE_OK.test(e.lic)) bad(f, `${e.file}: licence ${JSON.stringify(e.lic)} (want CC0, CC-BY or propia)`);
      else covered.add(abs);
    }
  }
  const hasLicenceFile = (dir: string): boolean => { // a licence file in the asset's folder or any folder above, up to cwd
    for (let d = dir; ; d = dirname(d)) {
      if (LICENCE_FILES.some((n) => existsSync(join(d, n)))) return true;
      if (d === resolve(cwd) || d === dirname(d)) return false;
    }
  };
  const assets = files.filter((x) => ASSET.test(x));
  const reuse = reuseGlobs(cwd);
  for (const a of assets) if (!covered.has(a) && !reuse.some((g) => g.test(relative(cwd, a))) && !hasLicenceFile(dirname(a))) bad(a, "no licence: add it to a manifest entry, a LICENCIAS.md or REUSE.toml");
  return { schema: "numinia-engine/check@1", folder, files: files.length, manifests, assets: assets.length, issues };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const folder = process.argv[2];
  if (!folder) { console.error("usage: check.ts <folder>"); process.exit(2); }
  const r = checkFolder(folder);
  for (const i of r.issues) console.error(`${i.path}: ${i.message}`);
  console.log(JSON.stringify({ ...r, issues: r.issues.length }));
  process.exit(r.issues.length ? 1 : 0);
}
