// e2e leg (MIS-222 t_1b395abe, J18b story 2–3): a brush stroke is VISIBLE, and the other tab sees it. Starts its own server (8920, as a world
// that lets guests build) and page (5320) on spare ports, empty data folder. Tab A uploads a `trazo@1` file (the same PUT /a/<sha>.trazo the
// brush will do) and places it as an `objetos` thing of kind «trazo» in front of tab B's avatar; B must download the file, build the tube
// (`view.objects().loaded` goes up, `failed` stays 0) and its picture must show the stroke's colour where the stroke is (a pixel test on the
// canvas: not the same picture without it). Then A deletes it and B's picture goes back. No upload of a broken stroke is drawn (failed, never thrown).
// Env: SHOTS=<folder> saves pictures; E2E_SERVER_PORT / E2E_VITE_PORT. Exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8920), VP = Number(process.env.E2E_VITE_PORT ?? 5320);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-trazo-"));
cpSync(join(REPO, "aventuras/ejemplo"), join(tmp, "aventura"), { recursive: true });

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: false }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), AVENTURA_DIR: join(tmp, "aventura"), DATOS_DIR: join(tmp, "datos"), SESIONES_DIR: join(tmp, "sesiones"), MOTOR_CONSTRUIR: "todos" }, "server");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/status`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const out = {}, checks = {}, errors = [];
let ok = false;
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("numinia.novedades.version", "99.0.0"); } catch {} });
  const open = async (nombre) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${nombre}: ${e}`));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
    return p;
  };
  const a = await open("A"), b = await open("B");
  await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && !!localStorage.getItem("numinia.invitado"), null, { timeout: 15000 });
  await b.bringToFront();
  // where B stands: strokes go 2.5 m from it in the four directions (one is where its camera looks), at eye height
  const cam = await b.evaluate(() => ({ p: globalThis.__numinia.session.selfPosition(1) }));

  // a stroke: a big sine wave drawn in a plane, 0.9 m wide, brightest palette colour 2 (amber), thick brush
  const puntos = Array.from({ length: 60 }, (_, i) => { const x = (i / 59 - 0.5) * 0.9; return [Math.round(x * 1000) / 1000, Math.round(Math.sin(i / 5) * 150) / 1000, 0, 1]; });
  const fichero = JSON.stringify({ schema: "numinia-engine/trazo@1", pincel: "tubo", color: 2, grosor: 0.06, puntos, nota: undefined });
  const sha = createHash("sha256").update(fichero).digest("hex");
  const subida = await a.evaluate(async ({ fichero, sha, base }) => {
    const billete = localStorage.getItem("numinia.invitado");
    const r = await fetch(`${base}/a/${sha}.trazo`, { method: "PUT", body: fichero, headers: { authorization: `Bearer ${billete}`, "x-nombre-fichero": "ola.trazo", "content-type": "application/json" } });
    return { status: r.status, cuerpo: (await r.text()).slice(0, 200) };
  }, { fichero, sha, base: `http://127.0.0.1:${SP}` });
  out.subida = subida; checks.subido = subida.status === 201;

  // pictures: B's canvas before and after; the stroke's amber (#EFA517) must appear
  // a canvas read-back of a WebGL canvas comes back empty, so the picture is the page's screenshot, decoded in the page and counted
  const pixeles = async (p) => {
    const png = (await p.screenshot()).toString("base64");
    return p.evaluate(async (png) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let ambar = 0;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], gr = d[i + 1], bl = d[i + 2]; if (r > 170 && gr > 100 && gr < 210 && bl < 80 && r - bl > 110) ambar++; }
      return { w: bmp.width, h: bmp.height, ambar };
    }, png);
  };
  const antes0 = await b.evaluate(() => globalThis.__numinia.view.objects());
  await b.waitForFunction(() => { const o = globalThis.__numinia.view.objects(); return o.placed > 0 && o.loaded + o.failed >= o.placed; }, null, { timeout: 40000 }).catch(() => {});
  await b.waitForTimeout(800);
  const px0 = await pixeles(b); out.pixelesAntes = px0; out.objetosAntes = await b.evaluate(() => globalThis.__numinia.view.objects());
  // place it 2.5 m in front of B (try the four directions the camera might face: the one that shows amber wins)
  const yo = cam.p;
  const intentos = [[0, -2.5], [0, 2.5], [2.5, 0], [-2.5, 0]];
  const ids = [];
  for (const [dx, dz] of intentos) {
    await a.evaluate(({ sha, x, y, z }) => globalThis.__numinia.session.features.send("objetos", "colocar", { modelo: sha, x, y, z, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "trazo" }), { sha, x: yo.x + dx, y: (yo.y ?? 0) + 1.5, z: yo.z + dz });
    await a.waitForTimeout(300);
  }
  await b.waitForFunction((n0) => globalThis.__numinia.view.objects().loaded >= n0 + 4, antes0.loaded, { timeout: 30000 }).catch(() => {});
  await b.waitForFunction(() => { const o = globalThis.__numinia.view.objects(); return o.loaded + o.failed >= o.placed; }, null, { timeout: 30000 }).catch(() => {});
  const tras = await b.evaluate(() => globalThis.__numinia.view.objects());
  out.objetosB = { antes: antes0, tras }; checks.bCargaLosTrazos = tras.loaded >= antes0.loaded + 4 && tras.failed === antes0.failed;
  await b.waitForTimeout(800);
  const px = await pixeles(b); out.pixelesConTrazos = px;
  // the stroke is in B's own scene
  const colocados = await b.evaluate(() => [...globalThis.__numinia.session.features.stateOf("objetos")].filter(([, v]) => v.kind === "trazo" || v.tipo === "trazo").map(([id]) => id));
  out.trazosEnB = colocados.length; checks.bVeLosColocados = colocados.length === 4;
  if (SHOTS) await b.screenshot({ path: `${SHOTS}/trazo-b.png` });
  // delete all four (A): B's amber goes back
  for (const id of colocados) await a.evaluate((id) => globalThis.__numinia.constructor.borrarId(id), id);
  await b.waitForFunction((n) => globalThis.__numinia.view.objects().placed <= n, antes0.placed, { timeout: 15000 }).catch(() => {});
  out.objetosDespues = await b.evaluate(() => globalThis.__numinia.view.objects());
  await b.waitForTimeout(600);
  const px2 = await pixeles(b); out.pixelesSinTrazos = px2;
  checks.ambarAparece = px.ambar > px0.ambar + 100; checks.ambarVuelve = px2.ambar < px0.ambar + 30;
  checks.sinErrores = errors.length === 0;
  out.errors = errors; out.ids = ids;
  ok = Object.values(checks).every(Boolean);
} catch (e) { errors.push(String(e?.stack ?? e)); }
finally {
  out.checks = checks; out.ok = ok; out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close().catch(() => {});
  for (const { p, log, nombre } of procs) { if (!ok) console.error(`--- ${nombre} ---\n${log().slice(-2500)}`); p.kill("SIGTERM"); }
  rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
