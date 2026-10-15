// Layer rule: a package may import only the packages listed for it in tools/layers.json.
// Usage: node tools/layers.mjs [root]   (exit 1 and a list of violations if any)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const IMPORTS = /(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const targetOf = (spec) => { const hit = spec.match(/(?:^|\/)packages\/([^/]+)\/|^\.\.\/\.\.\/([^/]+)\/src/); return hit ? (hit[1] ?? hit[2]) : null; };
function walk(dir, fn) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p, fn); continue; }
    if (/\.(ts|mts|js|mjs)$/.test(f)) fn(p, readFileSync(p, "utf8"));
  }
}

export function checkLayers(root) {
  const rules = JSON.parse(readFileSync(join(root, "tools/layers.json"), "utf8"));
  const composition = rules._composition ?? [];
  const violations = [];
  const pkgs = join(root, "packages");
  for (const pkg of readdirSync(pkgs)) {
    const allowed = rules[pkg];
    if (!allowed) { violations.push(`${pkg}: package not declared in tools/layers.json`); continue; }
    walk(join(pkgs, pkg), (p, src) => {
      for (const m of src.matchAll(IMPORTS)) {
        const spec = m[1] ?? m[2];
        if (/(?:^|\/)features\//.test(spec) && !composition.includes(relative(root, p))) {
          violations.push(`${relative(root, p)}: packages never import features/ (only the composition roots in tools/layers.json "_composition")`);
          continue;
        }
        const target = targetOf(spec);
        if (target && target !== pkg && !allowed.includes(target)) {
          violations.push(`${relative(root, p)}: '${pkg}' may not import '${target}' (allowed: ${allowed.join(", ") || "nothing"})`);
        }
      }
    });
  }
  // game features (features/<id>/): they talk to the engine only through the plug, and never import libraries
  const feats = join(root, "features"), allowedF = rules.features ?? [];
  if (existsSync(feats)) {
    walk(feats, (p, src) => {
      for (const m of src.matchAll(IMPORTS)) {
        const spec = m[1] ?? m[2];
        if (!spec.startsWith(".")) { violations.push(`${relative(root, p)}: features import nothing outside the repo ('${spec}'); ask the engine through packages/feature`); continue; }
        const target = targetOf(spec);
        if (target && !allowedF.includes(target)) violations.push(`${relative(root, p)}: a feature may not import '${target}' (allowed: ${allowedF.join(", ")})`);
      }
    });
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(fileURLToPath(import.meta.url), "../..");
  const v = checkLayers(root);
  if (v.length) { console.error(v.join("\n")); process.exit(1); }
  console.log("layers ok");
}
