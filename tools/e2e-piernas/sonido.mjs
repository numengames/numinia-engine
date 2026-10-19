// e2e leg S6f-5 (sound in a real browser): one real tab, no fake AudioContext. The page fetches its sound table from the
// SERVER (in dev another port: CORS), and each file by its sha256 from that same server (not from the page's port). After
// a click (the gesture that unlocks audio), walking and jumping: the context runs, the files arrive (200) and decode, and
// sources start — files (footsteps) and recipes (the jump). Nothing is heard here; what it proves is that the chain from
// table to speaker is whole, so the headphones test only has to judge the mix. Prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], avisos = [], tabla = [], ficheros = [];
const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
const out = { errors, avisos, tabla, ficheros };
const checks = {};

// count what the real Web Audio does, without replacing it
await ctx.addInitScript(() => {
  const c = (globalThis.__oido = { contextos: [], decodificados: 0, fallos: 0, arranques: 0 });
  const AC = globalThis.AudioContext;
  globalThis.AudioContext = class extends AC { constructor(...a) { super(...a); c.contextos.push(this); } };
  const dec = AC.prototype.decodeAudioData;
  AC.prototype.decodeAudioData = function (b, ...r) { return dec.call(this, b, ...r).then((x) => { c.decodificados++; return x; }, (e) => { c.fallos++; throw e; }); };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { c.arranques++; return start.apply(this, a); };
});
const oido = (p) => p.evaluate(() => { const c = globalThis.__oido; return { estados: c.contextos.map((x) => x.state), decodificados: c.decodificados, fallos: c.fallos, arranques: c.arranques }; });

try {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (/\[sonidos\]|\[sonar\]/.test(m.text())) avisos.push(m.text().slice(0, 200)); });
  p.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/sonidos.json") tabla.push({ origen: u.origin, status: r.status(), tipo: r.headers()["content-type"] ?? "" });
    else if (/^\/a\/[0-9a-f]{64}\.(opus|m4a)$/.test(u.pathname)) ficheros.push({ origen: u.origin, status: r.status() });
  });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  const servidor = await p.evaluate(() => { const s = new URLSearchParams(location.search).get("server"); return s ? new URL(s.replace(/^ws/, "http")).origin : location.origin; });
  out.antes = await oido(p);

  // the gesture, then walk (footsteps: files) and jump (the jump: a recipe)
  await p.mouse.click(240, 150);
  await p.keyboard.down("KeyW"); await p.waitForTimeout(2500); await p.keyboard.up("KeyW");
  await p.keyboard.press("Space"); await p.waitForTimeout(1500);
  out.despues = await oido(p);

  checks.tablaDelServidor = tabla.length >= 1 && tabla.every((t) => t.status === 200 && /json/.test(t.tipo) && t.origen === servidor);
  checks.ficherosDelServidor = ficheros.length >= 1 && ficheros.every((f) => f.status === 200 && f.origen === servidor);
  checks.contextoEnMarcha = out.despues.estados.length >= 1 && out.despues.estados.every((s) => s === "running");
  checks.decodifican = out.despues.decodificados >= 1 && out.despues.fallos === 0;
  checks.suenan = out.despues.arranques >= 2;
  checks.sinAvisosDeCarga = !avisos.some((a) => /no pude traer|no se deja tocar/.test(a));
  checks.sinErrores = errors.length === 0;
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser.close();
}
out.checks = checks;
out.ok = Object.keys(checks).length > 0 && Object.values(checks).every(Boolean);
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
