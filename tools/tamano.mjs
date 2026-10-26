// Size gate (BACKLOG D2): how many compressed bytes the page downloads BEFORE it can draw the first frame.
// Usage: npm run tamano            → builds if dist/plaza is missing, prints the table, exits 1 above TOPE_GZ
//        npm run tamano -- --build → always rebuilds first (what `npm run gates` does)
//
// What counts (the "start bundle", one figure, measured the same way every time):
//   dist/plaza/index.html itself, every <link rel="stylesheet">, the <script type="module"> entry and every
//   <link rel="modulepreload"> chunk — i.e. the static import graph Vite writes into the HTML, which the browser
//   fetches before main.ts runs. Each file is compressed alone with gzip level 9 (node:zlib), like a web server
//   would serve it. NOT counted: lazy chunks (dynamic import(): VRM avatars, sky, water, gizmo, hands, fishing…),
//   the Basis transcoder (fetched only for KTX2 textures), fonts/icons/manifest, world assets (.glb/.vrm/.vrma).
// The measured figure is quoted in docs/MEDIDAS.md «Tamaño de la página»; keep that section and TOPE_GZ together.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { spawnSync } from "node:child_process";

export const TOPE_GZ = 1_000_000; // bytes gz. Pablo 2026-10-19: «podemos ir hasta 1 MB sin problema» (the nature branch had the same 1 MB from his 18-10 «la página puede pesar 1 MB»). Before: 480 kB (measure + 10 %, 18-10). Goal (D2): 300 kB.
export const META_GZ = 300_000;
// t_45ef2f70: the first-load cap is the SECOND figure of this gate and the one that is closer to the wire: the same files, each compressed
// alone with brotli 11 (what pagina.ts serves to any browser that asks for br). Its cap lives in limits.json (`first_load_br_bytes`), the one
// place the published limits are kept; `npm run tamano` and test/tamano-primera-carga.test.ts both read it from there.
export const LIMITS_JSON = join(fileURLToPath(import.meta.url), "../../limits.json");
export const topeBr = () => JSON.parse(readFileSync(LIMITS_JSON, "utf8")).limits.find((e) => e.key === "first_load_br_bytes").value;
export const AVISO_GZ = 600_000; // bytes gz. Soft warning (Pablo 2026-10-19): prints a notice, never fails the gate.

const root = join(fileURLToPath(import.meta.url), "../..");
const dist = join(root, "dist/plaza");

export const gz = (buf) => gzipSync(buf, { level: constants.Z_BEST_COMPRESSION }).length;
export const br = (buf) => brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;

/** Files the page downloads before drawing, from dist/plaza/index.html. */
export function medirArranque(distDir = dist) {
  const html = readFileSync(join(distDir, "index.html"), "utf8");
  const refs = [];
  for (const m of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const attrs = m[2];
    const src = /\b(?:src|href)="([^"]+)"/.exec(attrs)?.[1];
    if (!src) continue;
    const tag = m[1];
    const rel = /\brel="([^"]+)"/.exec(attrs)?.[1] ?? "";
    if (tag === "script" && /type="module"/.test(attrs)) refs.push({ tipo: "entrada", src });
    else if (tag === "link" && rel === "modulepreload") refs.push({ tipo: "módulo", src });
    else if (tag === "link" && rel === "stylesheet") refs.push({ tipo: "css", src });
  }
  const ficheros = [{ tipo: "html", nombre: "index.html", bytes: Buffer.byteLength(html), gz: gz(Buffer.from(html)), br: br(Buffer.from(html)) }];
  for (const r of refs) {
    const p = join(distDir, r.src.replace(/^\.?\//, ""));
    const buf = readFileSync(p);
    ficheros.push({ tipo: r.tipo, nombre: r.src.replace(/^\/assets\//, ""), bytes: buf.length, gz: gz(buf), br: br(buf) });
  }
  const totalGz = ficheros.reduce((s, f) => s + f.gz, 0);
  const totalBytes = ficheros.reduce((s, f) => s + f.bytes, 0);
  const totalBr = ficheros.reduce((s, f) => s + f.br, 0);
  const tb = topeBr();
  return { ficheros, totalGz, totalBr, totalBytes, tope: TOPE_GZ, topeBr: tb, meta: META_GZ, pasa: totalGz <= TOPE_GZ && totalBr <= tb };
}

export function construir(outDir) {
  const r = spawnSync("npx", ["vite", "build", "--config", "apps/plaza/vite.config.mjs", ...(outDir ? ["--outDir", outDir, "--emptyOutDir"] : [])], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`vite build failed: ${r.stderr || r.stdout}`);
}

const kB = (n) => (n / 1000).toFixed(1).replace(".", ",") + " kB";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--build") || !existsSync(join(dist, "index.html"))) construir();
  const m = medirArranque();
  const w = (s, n) => String(s).padEnd(n);
  console.log(`\n${w("Fichero", 36)}${w("Tipo", 10)}${w("Bytes", 12)}gz -9`);
  console.log("-".repeat(70));
  for (const f of m.ficheros.sort((a, b) => b.gz - a.gz)) console.log(`${w(f.nombre, 36)}${w(f.tipo, 10)}${w(kB(f.bytes), 12)}${kB(f.gz)}`);
  console.log("-".repeat(70));
  console.log(`${w("Antes de dibujar", 46)}${w(kB(m.totalBytes), 12)}${kB(m.totalGz)} (${m.totalGz} B)`);
  console.log(`Tope ${kB(TOPE_GZ)} · meta D2 ${kB(META_GZ)} · ${m.totalGz <= TOPE_GZ ? "PASA" : "FALLA"}`);
  console.log(`Primera carga en brotli 11 (lo que viaja): ${kB(m.totalBr)} (${m.totalBr} B) · tope ${kB(m.topeBr)} (limits.json first_load_br_bytes) · ${m.totalBr <= m.topeBr ? "PASA" : "FALLA"}`);
  if (m.pasa && m.totalGz > AVISO_GZ) console.log(`AVISO: ${kB(m.totalGz)} supera ${kB(AVISO_GZ)}; el tope es ${kB(TOPE_GZ)}. Recorta antes de que llegue.`);
  process.exit(m.pasa ? 0 : 1);
}
