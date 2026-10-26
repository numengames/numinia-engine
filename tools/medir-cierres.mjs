// MIS-233 (t_3e18259a): measure with real tabs (1) how a page's connection ends — closed tab, navigated away, crashed, frozen — as the server
// counts it (`/metrics` → `cierres`, test/cierres.test.ts), and (2) whether a tab in the BACKGROUND keeps sending INPUT (the 20 Hz client tick
// runs inside the animation loop, `view.loop` → `session.tick`, so a hidden tab, where the browser stops requestAnimationFrame, may stop sending it).
// Starts its own server and page on spare ports with empty data; ONE headless Chromium (run it under the machine's flock). Prints JSON.
// Env: CHROME, PW_CORE, E2E_SERVER_PORT (8922), E2E_VITE_PORT (5322), CONGELADA_S (seconds to wait for the silence cut, default 18).
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME;
const SP = Number(process.env.E2E_SERVER_PORT ?? 8922), VP = Number(process.env.E2E_VITE_PORT ?? 5322), ESPERA_S = Number(process.env.CONGELADA_S ?? 18);
if (!existsSync(PW) || !CHROME || !existsSync(CHROME)) { console.error("set CHROME (headless shell) and PW_CORE"); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PW);
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "medir-cierres-"));
cpSync(join(REPO, "aventuras/ejemplo"), join(tmp, "aventura"), { recursive: true });
const procs = [], logs = [];
const arrancar = (cmd, args, env) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); procs.push(p); for (const f of [p.stdout, p.stderr]) f.on("data", (d) => { logs.push(String(d)); if (logs.length > 60) logs.shift(); }); p.on("exit", (c, sg) => logs.push(`[${cmd} ${args[0]} salió ${c ?? sg}]`)); };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), AVENTURA_DIR: join(tmp, "aventura"), DATOS_DIR: join(tmp, "datos"), SESIONES_DIR: join(tmp, "sesiones") });
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) });
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/metrics`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
const metricas = async () => { for (let i = 0; ; i++) { try { return await (await fetch(`http://127.0.0.1:${SP}/metrics`)).json(); } catch (e) { if (i >= 8) throw e; await new Promise((r) => setTimeout(r, 500)); } } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { escenarios: {}, segundoPlano: {} };
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("numinia.novedades.version", "99.0.0"); } catch {}
    // count what the page sends, by message type (first byte): 1 = INPUT; the heartbeat has its own type
    const cuenta = (globalThis.__envios = { total: 0, porTipo: {} }), send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) { try { const t = d instanceof ArrayBuffer ? new Uint8Array(d)[0] : d?.buffer ? new Uint8Array(d.buffer, d.byteOffset, 1)[0] : -1; cuenta.total++; cuenta.porTipo[t] = (cuenta.porTipo[t] ?? 0) + 1; } catch {} return send.call(this, d); };
  });
  const abrir = async () => { const p = await ctx.newPage(); await p.goto(BASE); await p.waitForFunction(() => globalThis.__numinia?.session.entity >= 0, null, { timeout: 60000 }); await dormir(1500); return p; };
  const antes = async () => (await metricas()).cierres;
  const delta = (a, b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v - a[k]]).filter(([, v]) => v));

  // (1) how it ends
  for (const [nombre, hacer] of [
    ["pestaña cerrada (page.close)", (p) => p.close()],
    ["navega a otra página (goto about:blank)", (p) => p.goto("about:blank")],
    ["la pestaña se cae (Page.crash)", async (p) => { const c = await ctx.newCDPSession(p); await c.send("Page.crash").catch(() => {}); }],
    ["se queda sin red (Network.emulateNetworkConditions offline)", async (p) => { const c = await ctx.newCDPSession(p); await c.send("Network.enable"); await c.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }); }],
  ]) {
    const p = await abrir(), a = await antes(); const t0 = Date.now();
    await hacer(p);
    let d = {}; for (let i = 0; i < (nombre.includes("sin red") ? ESPERA_S * 4 : 40); i++) { await dormir(250); d = delta(a, await antes()); if (Object.keys(d).length) break; }
    out.escenarios[nombre] = { cierres: d, tardoMs: Object.keys(d).length ? Date.now() - t0 : null };
    await p.close().catch(() => {});
    await dormir(500);
  }
  { // frozen: the page keeps its socket but its timers stop (a phone that sleeps the tab, a frozen background tab)
    const p = await abrir(), a = await antes(), c = await ctx.newCDPSession(p); const t0 = Date.now();
    await c.send("Page.enable"); await c.send("Page.setWebLifecycleState", { state: "frozen" });
    let d = {}; for (let i = 0; i < ESPERA_S * 4; i++) { await dormir(250); d = delta(a, await antes()); if (Object.keys(d).length) break; }
    out.escenarios["congelada (Page.setWebLifecycleState frozen, sin cerrar)"] = { cierres: d, tardoMs: Object.keys(d).length ? Date.now() - t0 : null, esperadoMs: "SILENCIO_MS 15000 (150000 si dijo que está oculta)" };
    await p.close().catch(() => {}); await dormir(500);
  }

  // (2) input in the background: B visible (what it sends in 5 s), then B in a minimised window (hidden), then back
  const B = await abrir(), cdp = await ctx.newCDPSession(B);
  const leer = () => B.evaluate(() => ({ ...globalThis.__envios.porTipo, oculta: document.hidden, vis: document.visibilityState }));
  const ventana = async (ms) => { const a = await leer(); await dormir(ms); const b = await leer(); const r = {}; for (const k of Object.keys(b)) if (!isNaN(+k)) r[k] = ((b[k] ?? 0) - (a[k] ?? 0)); return { porTipo: r, segundos: ms / 1000, oculta: b.oculta, visibilidad: b.vis }; };
  await B.keyboard.down("w"); // hold a walking key so there is input to send
  out.segundoPlano.visible = await ventana(5000);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } }).catch((e) => { out.segundoPlano.minimizar = String(e); });
  await dormir(1000);
  out.segundoPlano.oculta = await ventana(5000);
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } }).catch(() => {});
  await dormir(1000);
  out.segundoPlano.denuevoVisible = await ventana(5000);
  await B.keyboard.up("w");
  out.tipos = "porTipo: clave = tipo de mensaje (1 = INPUT, 2.. ver MSG en packages/net/src/index.ts; el latido tiene el suyo)";
  out.metricasFinal = (await metricas()).cierres;
} catch (e) { out.error = String(e?.stack ?? e); out.registro = logs.slice(-12); }
console.log(JSON.stringify(out, null, 1));
await browser.close().catch(() => {});
for (const p of procs) p.kill("SIGTERM");
rmSync(tmp, { recursive: true, force: true });
process.exit(out.error ? 1 : 0);
