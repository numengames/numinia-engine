// e2e leg (MIS-246 Y2, el arma en la mano): the render half in a real tab. Starts its own server and page on spare ports, with a COPY of
// the example world (which defines a relic as objeto@1: the server must load it without a word of complaint). Then, on the page:
//  - the weapon slot: view.vestir("self", { model, donde: "mano" }, "arma") loads the real Farolillo .glb and draws it at hand height;
//  - a good in the same hand waits while the weapon is held (never two things in one hand) and comes back when it is put away;
//  - view.vestir("self", null, "arma") takes only the weapon off (the good stays), and a good on the head is never hidden by a weapon.
// The network half (equipar → shared state a:<entity> → every page) is test/inventario-arma.test.ts over the real plug: no mission
// hands a weapon out yet (the `coge` step is Y3's next story), so this leg cannot equip one from the page.
// Env: SHOTS=<folder> saves pictures; E2E_SERVER_PORT / E2E_VITE_PORT (default 8914 / 5314). Exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8914), VP = Number(process.env.E2E_VITE_PORT ?? 5314);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const FAROLILLO = "911db167762103bbf472a72941f59c22f0c8953d631185b3225d89d87e89baaa";
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-arma-"));
const aventura = join(tmp, "aventura");
cpSync(join(REPO, "aventuras/ejemplo"), aventura, { recursive: true });

const procs = [];
const arrancar = (cmd, args, env, log) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre: log }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), AVENTURA_DIR: aventura, DATOS_DIR: join(tmp, "datos"), SESIONES_DIR: join(tmp, "sesiones") }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/a/${FAROLILLO}.glb`).catch(() => null); if (r.ok && s) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], out = { errors }, checks = {};
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  const puestos = () => p.evaluate(() => globalThis.__numinia.view.puestos());
  const hasta = (fn, ms = 20000) => p.waitForFunction(fn, null, { timeout: ms });
  checks.servidorSinQuejas = !/objeto@1 inválido/.test(procs[0].log());
  // a good in the right hand first
  await p.evaluate((m) => globalThis.__numinia.view.vestir("self", { model: m, donde: "mano", nombre: "Farolillo" }), FAROLILLO);
  await hasta(() => Object.values(globalThis.__numinia.view.puestos()).some((x) => x.cargado && x.dibujado));
  out.bien = await puestos();
  checks.bienEnMano = Object.keys(out.bien).length === 1 && Object.values(out.bien)[0].dibujado === true;
  // then a weapon in the same hand: the good waits
  await p.evaluate((m) => globalThis.__numinia.view.vestir("self", { model: m, donde: "mano", nombre: "Espada" }, "arma"), FAROLILLO);
  await hasta(() => { const v = globalThis.__numinia.view.puestos(); return Object.keys(v).length === 2 && Object.values(v).every((x) => x.cargado); });
  await p.waitForTimeout(400);
  out.conArma = await puestos();
  const arma = Object.entries(out.conArma).find(([k]) => k.endsWith("#arma"))?.[1], bien = Object.entries(out.conArma).find(([k]) => !k.endsWith("#arma"))?.[1];
  checks.armaDibujada = !!arma && arma.cargado && arma.dibujado && arma.donde === "mano";
  checks.bienEspera = !!bien && bien.cargado && bien.dibujado === false;
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/arma-mano.png` });
  // the weapon goes away: the good comes back
  await p.evaluate(() => globalThis.__numinia.view.vestir("self", null, "arma"));
  await p.waitForTimeout(400);
  out.sinArma = await puestos();
  checks.soloQuitaElArma = Object.keys(out.sinArma).length === 1 && !Object.keys(out.sinArma)[0].endsWith("#arma") && Object.values(out.sinArma)[0].dibujado === true;
  // a good on the head is not hidden by a weapon
  await p.evaluate((m) => { const v = globalThis.__numinia.view; v.vestir("self", { model: m, donde: "cabeza", nombre: "Sombrero" }); v.vestir("self", { model: m, donde: "mano", nombre: "Espada" }, "arma"); }, FAROLILLO);
  await p.waitForTimeout(1500);
  out.cabeza = await puestos();
  checks.cabezaNoSeOculta = Object.values(out.cabeza).some((x) => x.donde === "cabeza" && x.dibujado);
  checks.sinErrores = errors.length === 0;
  out.checks = checks;
  ok = Object.values(checks).every(Boolean);
} catch (e) { errors.push(String(e?.stack ?? e)); }
finally {
  out.ok = ok; out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close().catch(() => {});
  for (const { p, log, nombre } of procs) { if (!ok) console.error(`--- ${nombre} ---\n${log().slice(-2500)}`); p.kill("SIGTERM"); }
  rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
