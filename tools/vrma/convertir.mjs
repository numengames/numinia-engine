// tools/vrma/convertir.mjs — the house animations (CC0) as .vrma for this engine, and a check on real avatars.
// One original → one build: Quaternius UAL1 (CC0, ../movimientos/raw/quaternius/UAL1_Standard.fbx) → activos/animaciones/*.vrma
// (the Hyperfy .glb build of the same originals lives in ../movimientos/conversion/). Never hand-edit a build: rerun this.
// Runs in one headless Chromium (software GL), ~20 s of one core.
//
// Usage: nice -n 19 node tools/vrma/convertir.mjs [--fbx <UAL1_Standard.fbx>] [--vrm a.vrm,b.vrm] [--fotos <dir>] [--solo-comprobar]
//   --vrm      avatars to check the animations on (default: every activos/avatares/*.vrm)
//   --fotos    write one picture per avatar × animation there (for people; never committed)
//   --solo-comprobar   do not convert, only check what is in activos/animaciones/
import http from "node:http";
import { createRequire } from "node:module";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
// next to the main checkout (work/movimientos) or next to a worktree folder (work/numinia-engine-wt/<rama>)
const UAL1 = ["..", "../.."].map((up) => join(ROOT, up, "movimientos/raw/quaternius/UAL1_Standard.fbx"));
const FBX = resolve(arg("--fbx", UAL1.find((f) => existsSync(f)) ?? UAL1[0]));
const OUT = join(ROOT, "activos/animaciones");
const FOTOS = arg("--fotos", null);
const SOLO = process.argv.includes("--solo-comprobar");
// what we take from UAL1 and the name it gets here (the engine picks a clip by speed: quieto < 0.3 m/s ≤ andar … correr)
export const CLIPS = [
  { name: "quieto", clip: "Idle_Loop" },
  { name: "andar", clip: "Walk_Loop" },
  { name: "trotar", clip: "Jog_Fwd_Loop" },
  { name: "correr", clip: "Sprint_Loop" },
  { name: "saltar", clip: "Jump_Loop" },
];
const avatarDir = join(ROOT, "activos/avatares");
const VRMS = (arg("--vrm", null)?.split(",").map((f) => resolve(f))) ?? (existsSync(avatarDir) ? readdirSync(avatarDir).filter((f) => f.endsWith(".vrm")).map((f) => join(avatarDir, f)) : []);

const PW = process.env.PW_CORE ?? join(ROOT, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
if (!SOLO && !existsSync(FBX)) { console.error(`no encuentro el FBX de Quaternius en ${FBX} (--fbx <ruta>)`); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PW);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const extra = new Map(); // url path -> file outside the repo
extra.set("/fbx/UAL1.fbx", FBX);
VRMS.forEach((f, i) => extra.set(`/vrm/${i}.vrm`, f));
const server = http.createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = extra.get(path) ?? join(ROOT, path);
  if ((!extra.has(path) && !file.startsWith(ROOT)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 240, height: 320 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${BASE}/tools/vrma/pagina.html`);
await page.waitForFunction(() => window.ready && window.ready2, null, { timeout: 30000 });

const sha = (b) => createHash("sha256").update(b).digest("hex");
let report = null;
if (!SOLO) {
  const t0 = Date.now();
  const r = await page.evaluate(([u, c]) => window.convertir(u, c), ["/fbx/UAL1.fbx", CLIPS]);
  mkdirSync(OUT, { recursive: true });
  for (const [name, b64] of Object.entries(r.files)) {
    const bytes = Buffer.from(b64, "base64");
    writeFileSync(join(OUT, `${name}.vrma`), bytes);
    Object.assign(r.report.clips[name], { sha256: sha(bytes) });
  }
  report = { fuente: "Quaternius Universal Animation Library (UAL1 Standard), CC0", fbx: { bytes: statSync(FBX).size, sha256: sha(readFileSync(FBX)) }, convertMs: Date.now() - t0, ...r.report };
  writeFileSync(join(OUT, "conversion.json"), JSON.stringify(report, null, 1) + "\n");
}

// check every animation on every avatar
const vrmas = CLIPS.map((c) => `/activos/animaciones/${c.name}.vrma`).filter((u) => existsSync(join(ROOT, u)));
const checks = {};
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
for (const [i, f] of VRMS.entries()) {
  const name = f.split("/").pop().replace(/\.vrm$/, "");
  const r = await page.evaluate(([u, list]) => window.comprobar(u, list, [0, 0.25, 0.5, 0.75]), [`/vrm/${i}.vrm`, vrmas]);
  checks[name] = r;
  if (FOTOS) {
    await page.evaluate(() => window.pose(-1, 0));
    await page.screenshot({ path: join(FOTOS, `${name}-reposo.png`) });
    for (const [k, u] of vrmas.entries()) {
      await page.evaluate(([k, t]) => window.pose(k, t), [k, 0.3]);
      await page.screenshot({ path: join(FOTOS, `${name}-${u.split("/").pop().replace(".vrma", "")}.png`) });
    }
  }
}
await browser.close();
server.close();
console.log(JSON.stringify({ conversion: report && { convertMs: report.convertMs, rest: report.rest, missingBones: report.missingBones, clips: report.clips }, checks, errors }, null, 1));
process.exit(errors.length ? 1 : 0);
