// e2e leg (flying on desktop): a HELD Space keeps climbing and a HELD Ctrl keeps descending; on the ground a held Space is one jump.
// Starts its own server (world with `vuelo: "todos"`) and the page. Env: CHROME, E2E_SERVER_PORT (8950), E2E_VITE_PORT (5350).
// Exit 0 = right. (Before the fix a held Space climbed one step: the page ignored the browser's key-repeat.)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const PW = process.env.PW_CORE ?? REPO + "/node_modules/playwright-core";
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const { chromium } = createRequire(import.meta.url)(PW);
const SP = Number(process.env.E2E_SERVER_PORT ?? 8950), VP = Number(process.env.E2E_VITE_PORT ?? 5350), DIR = `${process.env.TMPDIR ?? tmpdir()}/vuelo-espacio-${process.pid}`;
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR + "/entorno", { recursive: true }); mkdirSync(DIR + "/datos", { recursive: true });
writeFileSync(DIR + "/entorno/entorno.json", JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 }, vuelo: "todos" }));
const run = (cmd, args, env) => spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: "ignore", detached: true });
const srv = run("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: DIR + "/entorno", DATOS_DIR: DIR + "/datos" });
const vite = run("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) });
const kill = () => { for (const p of [srv, vite]) try { process.kill(-p.pid); } catch { /* gone */ } rmSync(DIR, { recursive: true, force: true }); };
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${SP}/status`)).ok && (await fetch(`http://127.0.0.1:${VP}/`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const out = {}, fallos = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const p = await (await browser.newContext({ viewport: { width: 480, height: 300 } })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  const y = () => p.evaluate(() => globalThis.__numinia.session.selfPosition(1).y);
  const volando = () => p.evaluate(() => globalThis.__numinia.session.volando());
  // on foot: a held Space (one keydown, no repeats, then the browser's repeats) is ONE jump, not a flight upwards
  await p.waitForTimeout(1500);
  const suelo = await y();
  await p.keyboard.down("Space"); await p.waitForTimeout(300);
  for (let i = 0; i < 8; i++) { await p.keyboard.down("Space"); await p.waitForTimeout(120); } // key-repeat events
  const pie = await y(); await p.keyboard.up("Space"); await p.waitForTimeout(2500);
  out.suelo = +suelo.toFixed(2); out.picoSaltando = +pie.toFixed(2);
  if (!(pie < suelo + 3)) fallos.push("on foot a held Space climbed like a flight: " + pie);
  await p.evaluate(() => globalThis.__numinia.chat.decir("/volar")); await p.waitForTimeout(1500);
  await p.evaluate(() => document.activeElement?.blur?.());
  if (!(await volando())) fallos.push("did not take off");
  const a0 = await y();
  await p.keyboard.down("Space"); // held, never tapped again
  const m = [];
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(700); m.push(+(await y()).toFixed(2)); }
  await p.keyboard.up("Space"); await p.waitForTimeout(600);
  const alto = await y(); await p.waitForTimeout(800);
  out.vuelo = { a0: +a0.toFixed(2), mientrasSePulsa: m, alto: +alto.toFixed(2), enReposo: +(await y()).toFixed(2) };
  if (!m.every((v, i) => v > (i ? m[i - 1] : a0) + 0.8)) fallos.push("held Space did not keep climbing: " + m.join());
  if (Math.abs((await y()) - alto) > 0.3) fallos.push("it did not hold its height after letting go");
  await p.keyboard.down("Control"); await p.waitForTimeout(1500);
  const bajando = await y(); await p.waitForTimeout(500); const mas = await y(); await p.keyboard.up("Control");
  out.bajar = { de: +alto.toFixed(2), a: +bajando.toFixed(2), luego: +mas.toFixed(2) };
  if (!(bajando < alto - 2 && mas < bajando - 0.5)) fallos.push("held Ctrl did not keep descending: " + [alto, bajando, mas].join());
  if (errs.length) fallos.push("page errors: " + errs.join("; ").slice(0, 300));
} catch (e) { fallos.push("error: " + e.message); }
out.fallos = fallos; await browser.close().catch(() => {}); kill();
console.log(JSON.stringify(out, null, 1)); process.exit(fallos.length ? 1 : 0);
