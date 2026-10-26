// MIS-253 (t_d55fbc9b): the client's weight PER CHUNK, and what each chunk is made of. `tools/tamano.mjs` gives ONE figure (what the page
// downloads before the first frame); this one builds the page into a scratch folder and prints (1) every chunk of the build, gz -9, marked
// «arranque» (in the start bundle) or «perezoso» (fetched later), and (2) with `--modulos[=N]`, the N biggest source modules inside the biggest
// start chunks (Rollup's rendered length, before gzip: it says where the bytes come from, not what they compress to).
// Usage: node tools/tamano-trozos.mjs [--modulos[=25]] [--json]    (writes nothing into dist/)
import { build } from "vite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { gzipSync, constants } from "node:zlib";

const repo = join(fileURLToPath(import.meta.url), "../..");
const { default: cfg } = await import("../apps/plaza/vite.config.mjs");
const out = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "trozos-"));
const modulos = process.argv.find((a) => a.startsWith("--modulos")), topN = Number(modulos?.split("=")[1] ?? 25), json = process.argv.includes("--json");
const trozos = [];
const medir = { name: "medir-trozos", generateBundle(_o, bundle) { for (const [n, c] of Object.entries(bundle)) if (c.type === "chunk") trozos.push({ nombre: n, entrada: c.isEntry, imports: c.imports, mods: Object.entries(c.modules).map(([id, m]) => ({ id: id.replace(repo + "/", ""), len: m.renderedLength })) }); } };
await build({ ...cfg, configFile: false, plugins: [...(cfg.plugins ?? []), medir], build: { ...cfg.build, outDir: out, emptyOutDir: true }, logLevel: "error" });
const gz = (b) => gzipSync(b, { level: constants.Z_BEST_COMPRESSION }).length;
const html = readFileSync(join(out, "index.html"), "utf8");
const arranque = new Set([...html.matchAll(/(?:src|href)="\/?([^"]+\.js)"/g)].map((m) => m[1]));
const filas = trozos.map((t) => { const b = readFileSync(join(out, t.nombre)); return { ...t, bytes: b.length, gz: gz(b), arranque: arranque.has(t.nombre) }; }).sort((a, b) => b.gz - a.gz);
const kB = (n) => (n / 1000).toFixed(1).replace(".", ",") + " kB";
if (json) console.log(JSON.stringify(filas.map(({ mods, ...f }) => f), null, 1));
else {
  console.log("Trozo                               Cuándo      Bytes       gz -9");
  for (const f of filas) console.log(f.nombre.replace(/^assets\//, "").padEnd(36) + (f.arranque ? "arranque" : "perezoso").padEnd(10) + kB(f.bytes).padStart(10) + kB(f.gz).padStart(11));
  const suma = (a) => filas.filter((f) => f.arranque === a).reduce((s, f) => s + f.gz, 0);
  console.log(`Arranque (JS): ${kB(suma(true))} en ${filas.filter((f) => f.arranque).length} trozos · perezosos: ${kB(suma(false))} en ${filas.filter((f) => !f.arranque).length} trozos`);
  if (modulos) for (const f of filas.filter((x) => x.arranque).slice(0, 3)) {
    console.log(`\n${f.nombre} (${kB(f.gz)} gz): los ${topN} módulos más grandes (bytes ya minificados, sin comprimir)`);
    for (const m of [...f.mods].sort((a, b) => b.len - a.len).slice(0, topN)) console.log("  " + String(m.len).padStart(8) + "  " + m.id.slice(0, 110));
  }
}
rmSync(out, { recursive: true, force: true });
