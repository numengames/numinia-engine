// tools/vrma/convertir.mjs — the house animations (CC0) as .vrma for this engine, and a check on real avatars.
// One original → one build: Quaternius UAL1 (CC0, ../movimientos/raw/quaternius/UAL1_Standard.fbx) → activos/animaciones/*.vrma
// (the Hyperfy .glb build of the same originals lives in ../movimientos/conversion/). Never hand-edit a build: rerun this.
// Runs in one headless Chromium (software GL), ~20 s of one core.
//
// Usage: nice -n 19 node tools/vrma/convertir.mjs [--fbx <UAL1_Standard.fbx>] [--vrm a.vrm,b.vrm] [--fotos <dir>] [--solo-comprobar] [--clips a,b]
//   --vrm      avatars to check the animations on (default: every activos/avatares/*.vrm)
//   --clips    convert only these (comma-separated names) and merge them into conversion.json; the rest stay byte for byte
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
  // the movement wheel (J7b): moves a player picks, played over the speed-driven clip until they walk (features/gestos/movimientos.ts).
  // 33 of UAL1's 45 clips are used. Left out on purpose: A_TPose (the rest pose); the cycles that need the body to travel
  // (Walk_Formal_Loop, Crouch_Fwd_Loop, Swim_Fwd_Loop, Jump_Start, Jump_Land); the root-motion twins Roll_RM and
  // Sword_Attack_RM (the hips leave the capsule); two one-frame aim poses (Pistol_Aim_Down, Pistol_Aim_Neutral) and two
  // exits (Sitting_Exit, Spell_Simple_Exit: walking ends a move at once). `saludo`/`hasta`: see convertir.js.
  { name: "saludar", clip: "Idle_Loop", saludo: true, hasta: 2.5 }, // UAL1 has no wave: the idle body, a wave written in convertir.js
  // the other four gestures of an AI's body (packages/agent/src/gesto-ia.ts), written over the idle body like the wave
  { name: "asentir", clip: "Idle_Loop", gesto: "asentir", hasta: 1.5 },
  { name: "negar", clip: "Idle_Loop", gesto: "negar", hasta: 1.5 },
  { name: "pensar", clip: "Idle_Loop", gesto: "pensar", hasta: 3 },
  { name: "senalar", clip: "Idle_Loop", gesto: "senalar", hasta: 2 },
  { name: "hablar", clip: "Idle_Talking_Loop" },
  { name: "antorcha", clip: "Idle_Torch_Loop" },
  { name: "bailar", clip: "Dance_Loop" },
  { name: "agachado", clip: "Crouch_Idle_Loop" },
  { name: "caer-muerto", clip: "Death01" },
  { name: "conducir", clip: "Driving_Loop" },
  { name: "arreglar", clip: "Fixing_Kneeling" },
  { name: "golpe-pecho", clip: "Hit_Chest" },
  { name: "golpe-cabeza", clip: "Hit_Head" },
  { name: "usar", clip: "Interact" },
  { name: "coger", clip: "PickUp_Table" },
  { name: "pistola-arriba", clip: "Pistol_Aim_Up" },
  { name: "pistola-guardia", clip: "Pistol_Idle_Loop" },
  { name: "pistola-recargar", clip: "Pistol_Reload" },
  { name: "pistola-disparar", clip: "Pistol_Shoot" },
  { name: "directo", clip: "Punch_Cross" },
  { name: "jab", clip: "Punch_Jab" },
  { name: "empujar", clip: "Push_Loop" },
  { name: "rodar", clip: "Roll" },
  { name: "sentarse", clip: "Sitting_Enter" },
  { name: "sentado", clip: "Sitting_Idle_Loop" },
  { name: "sentado-hablar", clip: "Sitting_Talking_Loop" },
  { name: "hechizo-preparar", clip: "Spell_Simple_Enter" },
  { name: "hechizo-sostener", clip: "Spell_Simple_Idle_Loop" },
  { name: "hechizo-lanzar", clip: "Spell_Simple_Shoot" },
  { name: "flotar", clip: "Swim_Idle_Loop" },
  { name: "espada-tajo", clip: "Sword_Attack" },
  { name: "espada-guardia", clip: "Sword_Idle" },
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
  const SOLO_CLIPS = arg("--clips", null)?.split(",");
  const r = await page.evaluate(([u, c]) => window.convertir(u, c), ["/fbx/UAL1.fbx", SOLO_CLIPS ? CLIPS.filter((c) => SOLO_CLIPS.includes(c.name)) : CLIPS]);
  mkdirSync(OUT, { recursive: true });
  for (const [name, b64] of Object.entries(r.files)) {
    const bytes = Buffer.from(b64, "base64");
    writeFileSync(join(OUT, `${name}.vrma`), bytes);
    Object.assign(r.report.clips[name], { sha256: sha(bytes) });
  }
  report = { fuente: "Quaternius Universal Animation Library (UAL1 Standard), CC0", fbx: { bytes: statSync(FBX).size, sha256: sha(readFileSync(FBX)) }, convertMs: Date.now() - t0, ...r.report };
  if (SOLO_CLIPS && existsSync(join(OUT, "conversion.json"))) { // only some clips were made: keep the rest of the report
    const antes = JSON.parse(readFileSync(join(OUT, "conversion.json"), "utf8"));
    report = { ...antes, clips: Object.fromEntries(CLIPS.filter((c) => (SOLO_CLIPS.includes(c.name) ? report.clips[c.name] : antes.clips[c.name])).map((c) => [c.name, SOLO_CLIPS.includes(c.name) ? report.clips[c.name] : antes.clips[c.name]])) };
  }
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
      const nombre = u.split("/").pop().replace(".vrma", "");
      const d = report?.clips[nombre]?.duration ?? 0.75; // the middle of a move says more than its first frames
      await page.evaluate(([k, t]) => window.pose(k, t), [k, Math.max(0.3, d * 0.45)]);
      await page.screenshot({ path: join(FOTOS, `${name}-${u.split("/").pop().replace(".vrma", "")}.png`) });
    }
  }
}
await browser.close();
server.close();
// feet planting (t_3f0e5846): how far the engine moves the body for the calm postures (same arithmetic as metaApoyo, max 0.12 m)
// and where the lowest point of the mesh ends up after it; ~0 means the feet stand on the floor
const apoyo = {};
for (const [name, r] of Object.entries(checks)) {
  for (const clip of ["sentado", "sentado-hablar", "agachado"]) {
    const s = r.clips[`/activos/animaciones/${clip}.vrma`]?.samples?.at(-1);
    if (!s) continue;
    const meta = Math.max(-0.12, Math.min(0.12, r.avatar.pie - s.pie));
    (apoyo[name] ??= {})[clip] = { sinCorregir: s.lowest, mueve: +meta.toFixed(3), despues: +(s.lowest + meta).toFixed(3) };
  }
}
console.log(JSON.stringify({ conversion: report && { convertMs: report.convertMs, rest: report.rest, missingBones: report.missingBones, clips: report.clips }, apoyo, checks, errors }, null, 1));
process.exit(errors.length ? 1 : 0);
