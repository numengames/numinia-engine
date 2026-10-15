// e2e leg J1 (avatares): two tabs load VRM avatars without errors (own + the other's), B sees A's avatar go from
// idle to walking while A walks and back to idle when A stops, the download weight of every avatar/animation file is
// measured, and the frame's draw calls and triangles stay inside device tier D (limits.json). Prints JSON; exit 0 only
// when all is right. Receives BASE and SERVER_HTTP from tools/auto.sh e2e (tools/e2e-piernas/README.md).
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const ENGINE = process.env.BROWSER ?? "chromium";
const browser = ENGINE === "firefox" ? await firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } })
  : await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
const errors = [], avisos = [], descargas = [];
const open = async (tab) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${tab}: ${e}`));
  p.on("console", (m) => { if (/\[avatares\]/.test(m.text())) avisos.push(`${tab}: ${m.text()}`); });
  p.on("response", async (r) => {
    const m = /\/a\/([0-9a-f]{64})\.(vrma?)$/.exec(r.url());
    if (!m) return;
    const bytes = await r.body().then((b) => b.length).catch(() => -1);
    descargas.push({ tab, sha256: m[1].slice(0, 12), ext: m[2], status: r.status(), bytes });
  });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.carga?.estado === "listo" && globalThis.__numinia.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  return p;
};
const av = (p) => p.evaluate(() => globalThis.__numinia.view.avatares());
const result = { engine: ENGINE };
let ok = false;
try {
  const a = await open("a"), b = await open("b");
  const A = await a.evaluate(() => globalThis.__numinia.session.entity);
  const B = await b.evaluate(() => globalThis.__numinia.session.entity);
  // B walks towards A until within 25 m (animations play only within 40 m of you), at most 20 s
  const offset = () => b.evaluate((w) => { const n = globalThis.__numinia, me = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === w); return o ? { dx: o.x - me.x, dz: o.z - me.z } : null; }, A);
  await b.waitForFunction((w) => globalThis.__numinia.session.remotePositions().some((r) => r.id === w), A, { timeout: 10000 });
  await b.bringToFront();
  for (const t0 = Date.now(); Date.now() - t0 < 20000; ) {
    const d = await offset();
    if (!d || Math.hypot(d.dx, d.dz) <= 25) break;
    const held = [];
    if (Math.abs(d.dx) > 3) held.push(d.dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(d.dz) > 3) held.push(d.dz > 0 ? "KeyS" : "KeyW");
    for (const k of held) await b.keyboard.down(k);
    await b.waitForTimeout(400);
    for (const k of held) await b.keyboard.up(k);
  }
  // both tabs: your own VRM and the other player's, loaded and drawn
  const t0 = Date.now();
  await a.waitForFunction(() => globalThis.__numinia.view.avatares().dibujados >= 2, null, { timeout: 40000 });
  await b.waitForFunction(() => globalThis.__numinia.view.avatares().dibujados >= 2, null, { timeout: 40000 });
  result.vrmListosMs = Date.now() - t0;
  await b.waitForTimeout(800); // B's view of A settles (interpolation, smoothing)
  const deA = async () => (await av(b)).lista.find((x) => x.id === A) ?? null;
  const antes = await deA();
  // A walks forward 2.5 s; B samples what A's avatar does
  await a.bringToFront();
  await a.keyboard.down("KeyW");
  const vistos = [];
  for (const t1 = Date.now(); Date.now() - t1 < 2500; ) { const e = await deA(); vistos.push(`${e?.estado}/${e?.clip}`); await b.waitForTimeout(100); }
  await a.keyboard.up("KeyW");
  await b.waitForFunction((w) => globalThis.__numinia.view.avatares().lista.find((x) => x.id === w)?.clip === "quieto", A, { timeout: 6000 }).catch(() => {});
  const despues = await deA();
  const [sa, sb] = [await av(a), await av(b)];
  const [ca, cb] = [await a.evaluate(() => globalThis.__numinia.cost()), await b.evaluate(() => globalThis.__numinia.cost())];
  const yoA = sa.lista.find((x) => x.id === "yo"), yoB = sb.lista.find((x) => x.id === "yo");
  const distanciaAB = await b.evaluate((w) => { const n = globalThis.__numinia, me = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === w); return o ? Math.round(Math.hypot(o.x - me.x, o.z - me.z) * 10) / 10 : null; }, A);
  // download weight per file (a file fetched by both tabs is counted once: the second comes from the cache)
  const porFichero = {};
  for (const d of descargas) porFichero[`${d.sha256}.${d.ext}`] ??= d;
  const vrm = Object.values(porFichero).filter((d) => d.ext === "vrm"), vrma = Object.values(porFichero).filter((d) => d.ext === "vrma");
  const lim = JSON.parse(readFileSync(new URL("../../limits.json", import.meta.url), "utf8")).limits;
  const maxD = (k) => lim.find((e) => e.axis === "device" && e.scope === "D" && e.key === k).value;
  const triD = Number(String(maxD("triangles_on_screen")).split("-")[0]);
  const coste = [ca, cb].every((c) => c.calls > 0 && c.calls <= maxD("draw_calls") && c.triangles <= triD);
  const andando = vistos.some((v) => v.startsWith("andar/"));
  Object.assign(result, {
    entidades: { A, B }, distanciaAB, cupo: sa.cupo,
    tabA: { dibujados: sa.dibujados, modelos: sa.modelos, animaciones: sa.animaciones, errores: sa.errores, yo: yoA },
    tabB: { dibujados: sb.dibujados, modelos: sb.modelos, animaciones: sb.animaciones, errores: sb.errores, yo: yoB },
    avatarDeAEnB: { antes, mientrasAnda: [...new Set(vistos)], despues },
    descargas: { vrm, vrma, kBPorAvatar: vrm.map((d) => Math.round(d.bytes / 1024)), kBAnimaciones: Math.round(vrma.reduce((s, d) => s + d.bytes, 0) / 1024) },
    coste: { a: ca, b: cb, limiteD: { calls: maxD("draw_calls"), triangles: triD } },
    avisos, errors,
  });
  ok = sa.dibujados >= 2 && sb.dibujados >= 2 && sa.modelos.fallidos === 0 && sb.modelos.fallidos === 0 && sa.errores === 0 && sb.errores === 0
    && yoA?.dibujado && yoB?.dibujado && antes?.estado === "quieto" && andando && despues?.estado === "quieto"
    && vrm.length >= 1 && descargas.every((d) => d.status === 200 && d.bytes > 0) && coste && errors.length === 0;
} catch (e) { result.error = String(e).split("\n")[0]; result.errors = errors; result.avisos = avisos; }
await browser.close();

// the other engine (Gecko, or Chromium when the leg ran on Firefox): two tabs load and draw both VRMs, no errors.
// Light on purpose (no walking): the decisions are the same code; what can differ per engine is loading and drawing.
const OTRO = ENGINE === "firefox" ? "chromium" : "firefox";
const otro = { engine: OTRO, ok: false };
if (ok && process.env.AVATARES_UN_MOTOR !== "1") {
  const br = OTRO === "firefox" ? await firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } })
    : await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const cx = await br.newContext({ viewport: { width: 480, height: 300 } });
  const errs = [];
  try {
    const pages = [];
    for (const tab of ["a", "b"]) {
      const p = await cx.newPage();
      p.on("pageerror", (e) => errs.push(`${tab}: ${e}`));
      await p.goto(BASE);
      await p.waitForFunction(() => globalThis.__numinia?.carga?.estado === "listo" && globalThis.__numinia.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
      pages.push(p);
    }
    for (const p of pages) await p.waitForFunction(() => globalThis.__numinia.view.avatares().dibujados >= 2, null, { timeout: 40000 });
    const s = await Promise.all(pages.map((p) => p.evaluate(() => { const n = globalThis.__numinia, v = n.view.avatares(); return { backend: n.view.backend, dibujados: v.dibujados, modelos: v.modelos, errores: v.errores, coste: n.cost() }; })));
    Object.assign(otro, { tabs: s, errors: errs, ok: s.every((t) => t.dibujados >= 2 && t.modelos.fallidos === 0 && t.errores === 0) && errs.length === 0 });
  } catch (e) { Object.assign(otro, { error: String(e).split("\n")[0], errors: errs }); }
  await br.close();
  result.otroMotor = otro;
  ok = ok && otro.ok;
}
console.log(JSON.stringify(result, null, 1));
console.log(ok ? "AVATARES OK" : "AVATARES FALLA");
process.exit(ok ? 0 : 1);
