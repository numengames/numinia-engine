// Layer rule: a package may import only the packages listed for it in tools/layers.json.
// Usage: node tools/layers.mjs [root]   (exit 1 and a list of violations if any)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function checkLayers(root) {
  const rules = JSON.parse(readFileSync(join(root, "tools/layers.json"), "utf8"));
  const violations = [];
  const pkgs = join(root, "packages");
  for (const pkg of readdirSync(pkgs)) {
    const allowed = rules[pkg];
    if (!allowed) { violations.push(`${pkg}: package not declared in tools/layers.json`); continue; }
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|mts|js|mjs)$/.test(f)) continue;
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
          const spec = m[1] ?? m[2];
          const hit = spec.match(/(?:^|\/)packages\/([^/]+)\/|^\.\.\/\.\.\/([^/]+)\/src/);
          const target = hit ? (hit[1] ?? hit[2]) : null;
          if (target && target !== pkg && !allowed.includes(target)) {
            violations.push(`${relative(root, p)}: '${pkg}' may not import '${target}' (allowed: ${allowed.join(", ") || "nothing"})`);
          }
        }
      }
    };
    walk(join(pkgs, pkg));
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? join(fileURLToPath(import.meta.url), "../..");
  const v = checkLayers(root);
  if (v.length) { console.error(v.join("\n")); process.exit(1); }
  console.log("layers ok");
}
