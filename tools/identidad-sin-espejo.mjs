// identidad-sin-espejo (mundo-hermes M5): proves a world WITHOUT espejo/tema flags behaves the same on two checkouts of the engine.
//   Run (browser lock held by the caller):  node tools/identidad-sin-espejo.mjs <checkout A, built> <checkout B, built>
//   Each checkout needs `npm run build` done and a node_modules. For each one, with the DEFAULT template (Taller, no MOTOR_PLANTILLA) and fixed keys:
//     1. SEED     start the server on an empty world folder, then hash every file of the folder it made (relative path + sha256).
//                 `mundo.json` holds the engine's commit and a clock, so only its keys are compared.
//     2. STATUS   GET /status, compared as JSON after dropping the fields that name the build (commit, build, imagen, uptime-like clocks): the dropped
//                 fields are printed, so nothing is hidden. Also the keys: a key that only one side has (`temaHud`, `espejo`...) is a failure.
//     3. ASSETS   (a) the files of dist/plaza by name with the build hash stripped and by sha256 for everything that is not js/css;
//                 index.html is hashed with the build hashes of its asset names stripped.
//                 (b) the requests a real Chromium makes when it loads the page (names with the hash stripped) and what /status says it needs.
//                 Chunks of the new pieces (espejo, formas, tema) may EXIST in B's dist but must never be REQUESTED by a world without the flags.
//   Exit 0 only when SEED and STATUS are identical and the requested list of (b) is identical.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const [A, B] = process.argv.slice(2);
if (!A || !B) { console.error("usage: node tools/identidad-sin-espejo.mjs <checkout A> <checkout B>"); process.exit(2); }
const VOLATILE = /^(commit|commitHash|build|imagen|version|motor|desde|uptime|arranque|hora|ahora|t|tiempo|up)$/i;
const PUERTO = /https?:\/\/127\.0\.0\.1:\d+\//g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const sha = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);
const quitarHash = (n) => n.replace(/-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/i, "-HASH$1");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const puertaLibre = () => new Promise((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const recorrer = (dir, raiz = dir) => readdirSync(dir).sort().flatMap((n) => { const f = join(dir, n); return statSync(f).isDirectory() ? recorrer(f, raiz) : [relative(raiz, f)]; });
const limpio = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_|AVENTURA_DIR|DATOS_DIR|MUNDO_DIR|ACTIVOS_DIR|SESIONES_DIR|JWT_SECRET|ADMIN_CODE|WWW_DIR|APPS_DIR|PORT|HOST)/.test(k)));

/** JSON without the volatile fields, recursively; returns the clean copy and the list of paths dropped. */
function sinVolatiles(x, ruta = "", fuera = []) {
  if (Array.isArray(x)) return [x.map((v, i) => sinVolatiles(v, `${ruta}[${i}]`, fuera)[0]), fuera];
  if (x && typeof x === "object") {
    const o = {};
    for (const [k, v] of Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) { if (VOLATILE.test(k)) { fuera.push(`${ruta}.${k}`); continue; } o[k] = sinVolatiles(v, `${ruta}.${k}`, fuera)[0]; }
    return [o, fuera];
  }
  return [x, fuera];
}

async function medir(raiz) {
  const carpeta = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ident-")), mundo = join(carpeta, "mundo"), puerto = await puertaLibre();
  const env = { ...limpio(), PORT: String(puerto), HOST: "127.0.0.1", MOTOR_MUNDO: mundo, MOTOR_HABITANTES: "no", MOTOR_SECRET: "secreto-de-prueba-identidad-largo-0123456789", MOTOR_ADMIN: "codigo-de-administracion-identidad-largo", WWW_DIR: join(raiz, "dist/plaza") };
  const hijo = spawn(process.execPath, ["packages/server/src/main.ts"], { cwd: raiz, env, stdio: ["ignore", "pipe", "pipe"] });
  const log = []; hijo.stdout.on("data", (d) => log.push(String(d))); hijo.stderr.on("data", (d) => log.push(String(d)));
  try {
    for (let i = 0; i < 300 && !log.join("").includes("[instancia]"); i++) { if (hijo.exitCode !== null) throw new Error(`server exited:\n${log.join("")}`); await dormir(100); }
    if (!log.join("").includes("[instancia]")) throw new Error(`server did not start:\n${log.join("")}`);
    const url = `http://127.0.0.1:${puerto}`;
    const estado = await (await fetch(`${url}/status`)).json();
    const [estadoLimpio, dropped0] = sinVolatiles(estado), dropped = dropped0.map((d) => `${d}=${JSON.stringify(estado[d.slice(1)])}`.slice(0, 90));
    // the world folder as seeded
    const archivos = {};
    for (const r of recorrer(mundo)) {
      const b = readFileSync(join(mundo, r));
      archivos[r] = r === "mundo.json" ? `keys:${Object.keys(JSON.parse(String(b))).join(",")}` : sha(b);
    }
    // what the page is made of
    const dist = join(raiz, "dist/plaza"), existentes = {};
    for (const r of recorrer(dist)) existentes[quitarHash(r)] = /\.(js|css|map)$/.test(r) ? `size-class:${Math.round(statSync(join(dist, r)).size / 1024)}k` : sha(String(readFileSync(join(dist, r))).replace(/-[A-Za-z0-9_-]{8}(\.(js|css))/g, "-HASH$1"));
    // what a real browser asks for
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
    const { chromium } = createRequire(import.meta.url)(process.env.PW_CORE ?? join(raiz, "node_modules/playwright-core"));
    const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"] });
    const pedidos = new Set();
    try {
      const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
      p.on("request", (r) => { const u = new URL(r.url()); if (u.origin === url) { const n = u.pathname.replace(/^\//, "").replace(PUERTO, "").replace(UUID, "UUID") || "index.html"; pedidos.add(n); }; });
      await p.goto(`${url}/?webgl2`); await p.waitForFunction(() => globalThis.__numinia?.session, null, { timeout: 30000 }).catch(() => {}); await dormir(4000);
    } finally { await browser.close(); }
    return { estado: estadoLimpio, dropped, claves: Object.keys(estado).sort(), archivos, existentes, pedidos: [...pedidos].filter((n) => !/^(ws|socket)/.test(n)).map((n) => { const f = join(dist, n); let bytes = 0, espejo = false; try { const b = readFileSync(f); bytes = b.length; espejo = /espejo/.test(String(b)); } catch {} return { n, firma: `${quitarHash(n)} [${bytes} B, sha ${bytes ? sha(readFileSync(f)) : "-"}]`, espejo }; }).sort((x, y) => (x.firma < y.firma ? -1 : 1)) };
  } finally { if (hijo.exitCode === null) { hijo.kill("SIGTERM"); await new Promise((r) => { hijo.once("exit", r); setTimeout(r, 3000); }); } rmSync(carpeta, { recursive: true, force: true }); }
}

const diff = (a, b) => { const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(); return claves.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k}: A=${JSON.stringify(a[k])} B=${JSON.stringify(b[k])}`); };
const a = await medir(A), b = await medir(B);
let mal = 0;
const informe = (titulo, lineas, esFallo = true) => { console.log(`${lineas.length === 0 ? "IDENTICAL" : esFallo ? "DIFFERENT" : "differs (expected)"} · ${titulo}`); for (const l of lineas) console.log(`    ${l}`); if (lineas.length && esFallo) mal++; };

console.log(`A = ${A}\nB = ${B}`);
console.log(`/status fields dropped as build-specific: A ${JSON.stringify(a.dropped)} · B ${JSON.stringify(b.dropped)}`);
console.log(`/status keys (A): ${a.claves.join(",")}`);
informe("seed: files of the world folder (path → sha256; mundo.json by keys) · " + Object.keys(a.archivos).length + " vs " + Object.keys(b.archivos).length + " files", diff(a.archivos, b.archivos));
informe("/status JSON without build-specific fields", diff(a.estado, b.estado));
informe("/status key set", a.claves.filter((k) => !b.claves.includes(k)).concat(b.claves.filter((k) => !a.claves.includes(k))).map((k) => `only one side has «${k}»`));
// Requests are grouped by name with the build hash stripped (several chunks share a stripped name: «client-HASH», «src-HASH»).
//   FAIL    a name only one side loads, or a name B loads MORE times than A unless the extra file (its sha is not among A's) is a chunk of the espejo piece
//   NOTE    the same name with different bytes: the page's code changed between the two checkouts (that is the diff itself; a page cannot be byte-identical
//           across commits that change code), printed with both sizes so the size of the change is visible
const porNombre = (xs) => { const m = new Map(); for (const x of xs) m.set(quitarHash(x.n), [...(m.get(quitarHash(x.n)) ?? []), x]); return m; };
const gA = porNombre(a.pedidos), gB = porNombre(b.pedidos), fallos = [], notas = [];
for (const nombre of [...new Set([...gA.keys(), ...gB.keys()])].sort()) {
  const xa = gA.get(nombre) ?? [], xb = gB.get(nombre) ?? [];
  if (!xa.length) { fallos.push(`only B loads ${nombre}`); continue; }
  if (!xb.length) { fallos.push(`only A loads ${nombre}`); continue; }
  const shaA = new Set(xa.map((x) => x.firma.replace(/^.*sha /, ""))), extra = xb.length > xa.length ? xb.filter((x) => !shaA.has(x.firma.replace(/^.*sha /, ""))).slice(0, xb.length - xa.length) : [];
  for (const x of extra) { if (x.espejo) notas.push(`B loads ${xb.length} × ${nombre} against A's ${xa.length}: the extra one, ${x.firma}, is the client half of the espejo piece (it mentions «espejo»); inert without entorno/espejo.json`); else fallos.push(`B loads an extra ${x.firma} that is not part of the espejo piece`); }
  if (xa.length > xb.length) fallos.push(`A loads ${xa.length} × ${nombre}, B only ${xb.length}`);
  const resto = xb.filter((x) => !extra.includes(x)), tam = (x) => Number(/\[(\d+) B/.exec(x.firma)[1]);
  const cambia = xa.map(tam).sort((p, q) => p - q).join(",") !== resto.map(tam).sort((p, q) => p - q).join(",") || xa.map((x) => x.firma).sort().join() !== resto.map((x) => x.firma).sort().join();
  if (cambia) notas.push(`code differs: ${nombre} · A [${xa.map(tam).sort((p, q) => p - q).join(", ")}] B [${resto.map(tam).sort((p, q) => p - q).join(", ")}] bytes`);
}
informe("requests a real browser makes loading the page (names with the hash stripped): " + a.pedidos.length + " (A) vs " + b.pedidos.length + " (B)", fallos);
for (const n of notas) console.log(`    note: ${n}`);
const nuevos = Object.keys(b.existentes).filter((n) => !(n in a.existentes));
informe("files of dist/plaza (informative: B may carry the chunks of the new pieces, never requested above)", diff(a.existentes, b.existentes).filter((l) => !/^assets\/.*(js|css)/.test(l) || /only/.test(l)), false);
console.log(`new files in B's dist: ${nuevos.join(", ") || "none"}`);
const pedidosNuevos = b.pedidos.filter((x) => nuevos.some((n) => quitarHash(x.n) === n));
console.log(`requested by B and among the files that only B has (chunks of the new pieces): ${pedidosNuevos.map((x) => x.firma).join(", ") || "none"}`);
if (pedidosNuevos.some((x) => !x.espejo)) mal++;
process.exit(mal ? 1 : 0);
