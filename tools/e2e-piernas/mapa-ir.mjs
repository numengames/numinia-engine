// e2e leg (lote 3, MIS-257 + t_9cb3f636): the minimap's north button and the map's «Ir» (walks), plus the teleport mark.
// 1) the minimap is zoomed out and turned, a REAL click on #minimapa-norte brings it back (radius 30, north up, recentrados 1);
// 2) in the big map's list a REAL click on a row's «Ir andando» button walks the avatar to a marked point: it arrives (within 1.6 m)
//    without a jump (no step of more than 1 m between samples), the marker is cleared with the arrival, and a key press stops a walk;
// 3) (when the world allows teleports) tab A «Ir de golpe» 40 m away and tab B (another context) sees A's position jump: the samples
//    of A in B's remotePositions() never fall between the two ends (no slide).
// Usage: BASE=… SERVER_HTTP=… [SHOTS=<folder>] [CHROME=…] node tools/e2e-piernas/mapa-ir.mjs   (BASE like http://127.0.0.1:5173/?webgl2)
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const SHOTS = process.env.SHOTS ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { checks: {}, errors: [] };
const ok = (k, v, extra) => { out.checks[k] = !!v; if (extra !== undefined) out[k] = extra; };

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle", "--ignore-gpu-blocklist", "--no-sandbox"] });
const abrir = async (w = 1000, h = 640) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, version);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => out.errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  return p;
};
const yo = (p) => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(1); return { x: s.x, z: s.z }; });
try {
  const a = await abrir();
  const foto = async (n) => { if (SHOTS) await a.screenshot({ path: `${SHOTS}/${n}.png` }); };

  // ---- 1) the north button recentres the minimap
  await a.evaluate(() => { const m = globalThis.__numinia.mapa.minimapa; m.zoom(3); m.girar(true); });
  await sleep(600);
  const antes = await a.evaluate(() => globalThis.__numinia.mapa.minimapa.estado());
  if (SHOTS) await (await a.$("#minimapa")).screenshot({ path: `${SHOTS}/norte-antes-minimapa.png` });
  await foto("norte-antes-pantalla");
  await a.click("#minimapa-norte");
  await sleep(600);
  const despues = await a.evaluate(() => globalThis.__numinia.mapa.minimapa.estado());
  if (SHOTS) await (await a.$("#minimapa")).screenshot({ path: `${SHOTS}/norte-despues-minimapa.png` });
  await foto("norte-despues-pantalla");
  ok("norteRecentra", antes.zoom === 3 && antes.gira === true && despues.zoom === 1 && despues.gira === false && despues.recentrados === antes.recentrados + 1, { antes, despues });

  // ---- 2) «Ir» walks. A marker source with points in several directions; a REAL click on the list row's walk button.
  const p0 = await yo(a);
  const rumbos = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]];
  await a.evaluate(({ p0, rumbos }) => { globalThis.__numinia.mapa.fuente("leg", () => rumbos.map((r, i) => ({ id: `leg:${i}`, tipo: "hecho", nombre: `Punto ${i}`, x: p0.x + r[0] * 12, z: p0.z + r[1] * 12 }))); }, { p0, rumbos });
  const intentos = [];
  let llego = false;
  for (let i = 0; i < rumbos.length && !llego; i++) {
    await a.keyboard.press("m"); // the big map
    await a.waitForSelector("#mapa-grande li[data-id='leg:" + i + "'] button.andar", { timeout: 10000 });
    const inicio = await yo(a);
    await a.click(`#mapa-grande li[data-id='leg:${i}'] button.andar`);
    // sample the position while it walks
    const t0 = Date.now(); let max = 0, prev = inicio, d = 99; const aviso = [];
    while (Date.now() - t0 < 30000) {
      await sleep(100);
      const q = await yo(a);
      max = Math.max(max, Math.hypot(q.x - prev.x, q.z - prev.z)); prev = q;
      d = Math.hypot(q.x - (p0.x + rumbos[i][0] * 12), q.z - (p0.z + rumbos[i][1] * 12));
      if (SHOTS && Date.now() - t0 > 2500 && Date.now() - t0 < 2700) await a.screenshot({ path: `${SHOTS}/ir-caminando-${i}.png` });
      if (d <= 1.6 || !(await a.evaluate(() => globalThis.__numinia.andar.activo()))) break;
    }
    const recorrido = Math.hypot(prev.x - inicio.x, prev.z - inicio.z);
    const texto = await a.evaluate(() => document.getElementById("avisos")?.textContent ?? "");
    intentos.push({ i, recorrido: +recorrido.toFixed(1), faltan: +d.toFixed(2), maxPaso: +max.toFixed(2), s: +((Date.now() - t0) / 1000).toFixed(1), destino: await a.evaluate(() => globalThis.__numinia.mapa.destino()), texto: texto.slice(-120) });
    if (d <= 1.6) { llego = true; await sleep(800); await foto("ir-llegada"); }
    else { await a.evaluate(() => globalThis.__numinia.andar.cancelar()); }
  }
  const ultimo = intentos[intentos.length - 1];
  ok("irLlega", llego, intentos);
  ok("irSinSalto", llego && ultimo.maxPaso < 1, ultimo?.maxPaso);
  ok("irLimpiaDestino", llego && (await a.evaluate(() => globalThis.__numinia.mapa.destino())) === null);
  ok("irParaAlTerminar", !(await a.evaluate(() => globalThis.__numinia.andar.activo())));
  // a key press stops a walk
  const p1 = await yo(a);
  const r = await a.evaluate(({ p1 }) => globalThis.__numinia.mapa.irAndando({ id: "leg:tecla", nombre: "Punto lejano", x: p1.x + 40, z: p1.z }), { p1 });
  await sleep(800);
  const andaba = await a.evaluate(() => globalThis.__numinia.andar.activo());
  await a.keyboard.down("KeyW"); await sleep(500); await a.keyboard.up("KeyW");
  const paro = !(await a.evaluate(() => globalThis.__numinia.andar.activo()));
  ok("teclaParaElPaseo", r && andaba && paro, { r, andaba, paro });
  await a.evaluate(() => globalThis.__numinia.mapa.quitarDestino());

  // ---- 3) teleport mark: another context sees A jump, never slide
  const activo = await a.evaluate(() => globalThis.__numinia.viajar.activo());
  out.teletransporteActivo = activo;
  if (activo) {
    const b = await abrir(320, 240); // small: the less it draws, the denser its samples
    const A = await a.evaluate(() => globalThis.__numinia.session.entity);
    await b.evaluate((A) => { globalThis.__muestras = []; setInterval(() => { const o = globalThis.__numinia.session.remotePositions().find((q) => q.id === A); if (o) globalThis.__muestras.push({ t: Math.round(performance.now()), x: o.x, z: o.z }); }, 16); }, A);
    await sleep(1500);
    const desde = await yo(a);
    await a.evaluate(({ desde }) => globalThis.__numinia.viajar.irAPunto(desde.x + 40, desde.z, "marca de salto"), { desde });
    await sleep(3500);
    const hasta = await yo(a);
    const m = await b.evaluate(() => globalThis.__muestras);
    const lejos = Math.hypot(hasta.x - desde.x, hasta.z - desde.z);
    const entre = m.filter((s) => { const d0 = Math.hypot(s.x - desde.x, s.z - desde.z), d1 = Math.hypot(s.x - hasta.x, s.z - hasta.z); return d0 > 3 && d1 > 3; });
    const llegoB = m.length && Math.hypot(m[m.length - 1].x - hasta.x, m[m.length - 1].z - hasta.z) < 1.5;
    ok("saltoSinDeslizar", lejos > 20 && m.length > 100 && entre.length === 0 && llegoB, { lejos: +lejos.toFixed(1), muestras: m.length, intermedias: entre.length, llegoB: !!llegoB, ejemplo: entre.slice(0, 3) });
  }
  ok("sinErroresDePagina", out.errors.length === 0);
} catch (e) { out.fallo = String(e?.stack ?? e); }
await browser.close().catch(() => {});
console.log(JSON.stringify(out, null, 1));
process.exit(out.fallo || !Object.values(out.checks).every(Boolean) ? 1 : 0);
