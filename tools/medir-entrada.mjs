// v9: how long entering a world takes under headset-like limits (CPU x4, 10 Mb/s, 60 ms by default). One browser per run.
//   node tools/medir-entrada.mjs <etiqueta> [--runs 3] [--cpu 4] [--mbps 10] [--rtt 60] [--url http://127.0.0.1:8881/] [--warm]
// Needs the server up with a built page (npm run build, then WWW_DIR=dist/plaza PORT=8881 node packages/server/src/main.ts).
// Env: CHROME_HEADLESS = path of chrome-headless-shell (else the one playwright installed); SALIDA = folder for res-<etiqueta>.json.
// Compare two builds by running them on two ports, A and B alternating, and say the load (uptime) next to each number.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const a = process.argv.slice(2);
const etiqueta = a[0];
const opt = (k, d) => { const i = a.indexOf("--" + k); return i < 0 ? d : a[i + 1]; };
const runs = Number(opt("runs", 3)), cpu = Number(opt("cpu", 4)), mbps = Number(opt("mbps", 10)), rtt = Number(opt("rtt", 60));
const url = opt("url", "http://127.0.0.1:8881/");
const warm = a.includes("--warm");
const exe = process.env.CHROME_HEADLESS || chromium.executablePath();
const salida = [];
for (let r = 0; r < runs; r++) {
  const load0 = readFileSync("/proc/loadavg", "utf8").split(" ")[0];
  const browser = await chromium.launch({ executablePath: exe, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    const W = globalThis.WebSocket; globalThis.__ws = {};
    globalThis.WebSocket = class extends W { constructor(...a) { super(...a); __ws.crea = Math.round(performance.now()); this.addEventListener("open", () => { __ws.abre = Math.round(performance.now()); }); this.addEventListener("message", () => { __ws.msg ??= Math.round(performance.now()); }); } };
    const f = globalThis.fetch; globalThis.__fe = [];
    globalThis.fetch = function (u, ...r) { const t = Math.round(performance.now()); return f.call(this, u, ...r).finally(() => __fe.push([String(u).replace(/^https?:\/\/[^/]+/, "").slice(0, 40), t, Math.round(performance.now())])); };
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const reqs = new Map();
  let t0 = null;
  cdp.on("Network.requestWillBeSent", (e) => { if (t0 === null) t0 = e.timestamp; reqs.set(e.requestId, { url: e.request.url.replace(/^https?:\/\/[^/]+/, ""), tipo: e.type, ini: (e.timestamp - t0) * 1000, bytes: 0, fin: null, desdeCache: false }); });
  cdp.on("Network.responseReceived", (e) => { const q = reqs.get(e.requestId); if (q) { q.status = e.response.status; q.enc = e.response.headers["content-encoding"] || e.response.headers["Content-Encoding"] || ""; q.resp = (e.timestamp - t0) * 1000; q.desdeCache = !!e.response.fromDiskCache; } });
  cdp.on("Network.loadingFinished", (e) => { const q = reqs.get(e.requestId); if (q) { q.fin = (e.timestamp - t0) * 1000; q.bytes = e.encodedDataLength; } });
  cdp.on("Network.requestServedFromCache", (e) => { const q = reqs.get(e.requestId); if (q) q.desdeCache = true; });
  const ws = { crea: null, primero: null };
  cdp.on("Network.webSocketCreated", (e) => { if (ws.crea === null) ws.crea = (e.timestamp ?? 0); });
  cdp.on("Network.webSocketFrameReceived", (e) => { if (ws.primero === null) ws.primero = e.timestamp; });
  await cdp.send("Performance.enable");
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e).slice(0, 120)));
  const emular = async () => {
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: rtt, downloadThroughput: (mbps * 1e6) / 8, uploadThroughput: (mbps * 1e6) / 16 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  };
  const esperarListo = async () => {
    const ini = Date.now();
    for (;;) {
      const s = await page.evaluate(() => { const n = globalThis.__numinia; const c = document.getElementById("carga"); return n ? { b: n.informe?.bienvenidaMs, p: n.informe?.primerCuadroMs, oculta: c ? c.hidden || c.classList.contains("ida") : null, now: performance.now(), ent: n.session?.entity, probe: n.probe?.done, pms: n.probe?.ms } : null; }).catch(() => null);
      if (s && s.p > 0 && s.oculta) return s;
      if (Date.now() - ini > 240000) return s ?? { timeout: true };
      await page.waitForTimeout(100);
    }
  };
  await emular();
  const marca = Date.now();
  await page.goto(url, { waitUntil: "commit" });
  const s = await esperarListo();
  // when the loading screen actually left, measured from the page's clock
  const tListo = s.now;
  const met = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const fcp = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)])));
  await page.waitForTimeout(8000); // late loads after the first frame
  const antes = [...reqs.values()].filter((q) => q.fin !== null && q.fin <= tListo + 50);
  const todos = [...reqs.values()].filter((q) => q.fin !== null);
  const suma = (l) => l.reduce((x, q) => x + q.bytes, 0);
  const res = { etiqueta, run: r + 1, cargaAntes: load0, cargaDespues: readFileSync("/proc/loadavg", "utf8").split(" ")[0], bienvenidaMs: s.b, primerCuadroMs: s.p, pantallaFueraMs: Math.round(tListo), probeMs: s.pms, nPeticionesAntes: antes.length, bytesAntes: suma(antes), nPeticionesTotal: todos.length, bytesTotal: suma(todos), errores: errores.length };
  res.ws = await page.evaluate(() => __ws); res.fetches = await page.evaluate(() => __fe.slice(0, 6));
  res.scriptMs = Math.round((met.ScriptDuration ?? 0) * 1000); res.taskMs = Math.round((met.TaskDuration ?? 0) * 1000); res.fcp = fcp["first-contentful-paint"];
  res.peticiones = todos.map((q) => ({ url: q.url.slice(0, 90), tipo: q.tipo, ini: Math.round(q.ini), fin: Math.round(q.fin), bytes: q.bytes, enc: q.enc, st: q.status, cache: q.desdeCache }));
  if (warm) {
    // second visit in the same context (HTTP cache warm)
    reqs.clear(); t0 = null; await emular();
    await page.goto(url, { waitUntil: "commit" });
    const s2 = await esperarListo();
    await page.waitForTimeout(3000);
    const t2 = [...reqs.values()].filter((q) => q.fin !== null);
    res.caliente = { bienvenidaMs: s2.b, primerCuadroMs: s2.p, pantallaFueraMs: Math.round(s2.now), bytes: suma(t2), n: t2.length, red: t2.filter((q) => !q.desdeCache && q.status !== 304 && q.bytes > 0).length, r304: t2.filter((q) => q.status === 304).length };
  }
  salida.push(res);
  console.log(JSON.stringify({ ...res, peticiones: undefined }));
  await browser.close();
}
writeFileSync(`${process.env.SALIDA ?? "."}/res-${etiqueta}.json`, JSON.stringify(salida));
