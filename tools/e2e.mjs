// e2e: two real browser tabs against the running server + page. Light: 480x300, software GL, no screenshots
// unless SHOTS=1. Needs `npm run server` and `npm run dev` running.
// Usage: taskset -c 0-1 nice -n 19 node tools/e2e.mjs
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../node_modules/playwright-core", import.meta.url).pathname; // devDependency, exact version (1.64.1: Firefox 1555)
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const BASE = BASE0 + (BASE0.includes("?") ? "&" : "?") + "pulso=2000"; // T1: a session pulse every 2 s instead of 10
// the server's HTTP side, for GET /sesiones (T1): SERVER_HTTP, or the ?server= ws URL when it has no path
const serverParam = new URL(BASE0).searchParams.get("server");
const SERVER_HTTP = process.env.SERVER_HTTP ?? (!serverParam ? "http://127.0.0.1:8790" : ["", "/"].includes(new URL(serverParam).pathname) ? `http://${new URL(serverParam).host}` : null);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
// cron/Hermes shells point HOME at the profile home, where Playwright would look for its browsers in vain
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox, webkit } = createRequire(import.meta.url)(PW);
const ENGINE = process.env.BROWSER ?? "chromium"; // chromium | firefox | webkit
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
  webkit: () => webkit.launch(),
};
const browser = await launchers[ENGINE]();
// HTTPS=1: the page uses our own certificate (dev:lan), so ignore certificate errors
const ctx = await browser.newContext({ viewport: { width: 480, height: 300 }, ignoreHTTPSErrors: process.env.HTTPS === "1" });
const errors = [];
const open = async () => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  return p;
};
const state = (p) => p.evaluate(() => {
  const n = globalThis.__numinia;
  return { entity: n.session.entity, who: n.session.who, backend: n.view.backend, probe: n.probe, stats: n.session.stats, remotes: n.session.remotePositions(), cost: n.cost(), power: n.view.power.stats };
});

const a = await open(), b = await open();
const A = await state(a);
await b.waitForFunction((id) => globalThis.__numinia.session.remotePositions().some((r) => r.id === id), A.entity, { timeout: 10000 });
const before = (await state(b)).remotes.find((r) => r.id === A.entity);
await a.bringToFront();
await a.keyboard.down("KeyW");
await a.waitForTimeout(1500);
await a.keyboard.up("KeyW");
await a.waitForTimeout(700);
const after = (await state(b)).remotes.find((r) => r.id === A.entity);
const A2 = await state(a), B2 = await state(b);

// J7 gesture leg: tab B first walks towards A until it stands within 25 m (at most 20 s), so the near side
// is checked too. Then A presses G: A must hear its own gesture and draw a label over itself; B must hear it
// and draw a label over A when near, and must not hear it when far (if the walk ran out of time).
const offset = () => b.evaluate((w) => { const n = globalThis.__numinia, me = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === w); return o ? { dx: o.x - me.x, dz: o.z - me.z } : null; }, A.entity);
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
await b.waitForTimeout(300);
await a.bringToFront();
await a.keyboard.press("KeyG");
const heard = (p, who) => p.evaluate((w) => globalThis.__numinia.session.features.log.filter((e) => e.event === "hecho" && e.msg.quien === w).length, who);
await a.waitForFunction((w) => globalThis.__numinia.session.features.log.some((e) => e.event === "hecho" && e.msg.quien === w), A.entity, { timeout: 5000 }).catch(() => {});
const selfLabel = await a.evaluate(() => globalThis.__numinia.view.labels().includes("self"));
await b.waitForTimeout(600);
const gesture = {
  catalog: await a.evaluate(() => globalThis.__numinia.session.features.catalog?.features.map((f) => f.id) ?? []),
  selfHeard: await heard(a, A.entity), selfLabel,
  distanceAB: await b.evaluate((w) => { const n = globalThis.__numinia, me = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === w); return o ? Math.round(Math.hypot(o.x - me.x, o.z - me.z) * 10) / 10 : null; }, A.entity),
  bHeard: await heard(b, A.entity),
  bLabel: await b.evaluate((w) => globalThis.__numinia.view.labels().includes(w), A.entity),
  // V1: the same gesture reaches screen readers as text in the page's aria-live region
  aAviso: await a.evaluate(() => document.getElementById("avisos")?.textContent ?? ""),
  bAviso: await b.evaluate(() => document.getElementById("avisos")?.textContent ?? ""),
};
const near = gesture.distanceAB !== null && gesture.distanceAB <= 28, far = gesture.distanceAB === null || gesture.distanceAB >= 32;
const gestureOk = gesture.catalog.includes("gestos") && gesture.selfHeard === 1 && gesture.selfLabel && gesture.aAviso.includes("Gesto: saludar")
  && (!near || (gesture.bHeard === 1 && gesture.bLabel && gesture.bAviso.includes("Gesto: saludar"))) && (!far || gesture.bHeard === 0);
// H1 leg: things placed in the world. A places a block 3 m in front of itself; B (wherever it is: the zone's list
// reaches everyone) gets it, draws the model and reads its card; A turns it 90°, B sees it; A undoes twice: back to
// 0°, then gone (so nothing is left behind). With building closed (MOTOR_CONSTRUIR not "todos"): refused, said why.
const objs = (p) => p.evaluate(() => { const n = globalThis.__numinia; return { estado: { ...n.constructor.estado }, ids: [...n.session.features.stateOf("objetos").keys()], dibujo: n.view.objects() }; });
const objetos = { puede: null, ok: false };
try {
  const o0 = { a: await objs(a), b: await objs(b) };
  objetos.puede = o0.a.estado.puede;
  const ry = (p, k) => p.evaluate((k) => globalThis.__numinia.session.features.stateOf("objetos").get(k)?.ry, k);
  if (objetos.puede) {
    await a.evaluate(() => globalThis.__numinia.constructor.colocar("bloque"));
    await a.waitForFunction((n0) => { const n = globalThis.__numinia; return !!n.constructor.estado.seleccionado && n.session.features.stateOf("objetos").size > n0; }, o0.a.ids.length, { timeout: 5000 });
    const id = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    await b.waitForFunction((k) => globalThis.__numinia.session.features.stateOf("objetos").has(k), id, { timeout: 5000 });
    await b.waitForFunction((n0) => globalThis.__numinia.view.objects().loaded > n0, o0.b.dibujo.loaded, { timeout: 20000 });
    const card = await b.evaluate((k) => globalThis.__numinia.session.features.cards().find((c) => c.key === k) ?? null, id);
    const dibujadoEnB = await b.evaluate(() => globalThis.__numinia.view.objects()); // the model file arrived and is drawn
    await a.evaluate(() => globalThis.__numinia.constructor.girar(90));
    await b.waitForFunction((k) => Math.abs((globalThis.__numinia.session.features.stateOf("objetos").get(k)?.ry ?? 0) - 90) < 0.05, id, { timeout: 5000 });
    const girado = await ry(b, id);
    await a.evaluate(() => globalThis.__numinia.constructor.deshacer());
    await b.waitForFunction((k) => Math.abs(globalThis.__numinia.session.features.stateOf("objetos").get(k)?.ry ?? 99) < 0.05, id, { timeout: 5000 });
    await a.evaluate(() => globalThis.__numinia.constructor.deshacer());
    await b.waitForFunction((k) => !globalThis.__numinia.session.features.stateOf("objetos").has(k), id, { timeout: 5000 });
    const o1 = await objs(b);
    Object.assign(objetos, { id, card: card && { role: card.role, name: card.name }, girado, dibujadoEnB, alFinalEnB: o1.dibujo, ok: card?.name === "Bloque" && card?.role === "objeto" && o1.dibujo.failed === 0 && !o1.ids.includes(id) });
  } else {
    await a.evaluate(() => globalThis.__numinia.constructor.colocar("bloque"));
    await a.waitForTimeout(800);
    const o1 = await objs(a);
    objetos.rechazo = o1.estado.ultimoRechazo;
    objetos.ok = o1.ids.length === o0.a.ids.length && /construir/.test(objetos.rechazo) && !(await a.evaluate(() => !!document.getElementById("construir")?.offsetParent));
  }
} catch (e) { objetos.error = String(e).split("\n")[0]; }
// T1 leg: both tabs told the server how they entered (entrada) and how it goes (pulso), with the right backend
const sesiones = { comprobado: !!SERVER_HTTP, ok: false, conEntrada: 0, conPulso: 0, clases: [], navegadores: [] };
if (SERVER_HTTP) {
  for (const t0 = Date.now(); Date.now() - t0 < 8000 && !sesiones.ok; ) {
    const r = await (await fetch(`${SERVER_HTTP}/sesiones`)).json().catch(() => ({ ahora: [] }));
    const mine = (r.ahora ?? []).filter((s) => s.entrada);
    Object.assign(sesiones, { conEntrada: mine.length, conPulso: mine.filter((s) => s.pulso?.cuadros > 0).length, clases: mine.map((s) => s.entrada.clase), navegadores: mine.map((s) => s.entrada.navegador) });
    sesiones.ok = mine.length >= 2 && sesiones.conPulso >= 2 && mine.every((s) => s.entrada.backend === A2.backend && s.entrada.clase === "escritorio" && s.entrada.navegador);
    if (!sesiones.ok) await a.waitForTimeout(500);
  }
}
// H3b: a page opened with #pass=<token> takes the token out of the address bar at once and still enters (this server has no pass
// key: the pass is ignored and the person is a guest, exactly as before). The token here is shaped like a pass, signed by nobody.
const paseFalso = "e30.e30.c2lnbmVkLWJ5LW5vYm9keQ";
const pase = { hashAntes: `#pass=${paseFalso}`, hashDespues: null, entro: false, invitado: false };
{
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}#pass=${paseFalso}`);
  await p.waitForFunction(() => globalThis.__numinia?.session.entity >= 0 && globalThis.__numinia.session.who, null, { timeout: 30000 });
  const s = await p.evaluate(() => ({ hash: location.hash, entity: globalThis.__numinia.session.entity, who: globalThis.__numinia.session.who }));
  Object.assign(pase, { hashDespues: s.hash, entro: s.entity >= 0, invitado: !!s.who && !s.who.id.startsWith("p_") });
  await p.close();
}
pase.ok = pase.hashDespues === "" && pase.entro && pase.invitado;
if (process.env.SHOTS === "1") { await a.screenshot({ path: "e2e-a.png" }); await b.screenshot({ path: "e2e-b.png" }); }
await browser.close();

// P2 cost gate (tier D, no screen needed): numbers come from limits.json, so there is one source
const lim = JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")).limits;
const maxD = (k) => lim.find((e) => e.axis === "device" && e.scope === "D" && e.key === k).value;
const triD = Number(String(maxD("triangles_on_screen")).split("-")[0]);
const costBreaches = [];
if (A2.cost.calls > maxD("draw_calls")) costBreaches.push(`draw calls ${A2.cost.calls} > ${maxD("draw_calls")}`);
if (A2.cost.triangles > triD) costBreaches.push(`triangles ${A2.cost.triangles} > ${triD}`);
if (A2.cost.calls === 0) costBreaches.push("no draw measured");
const dz = after.z - before.z;
const result = {
  engine: ENGINE,
  backend: A2.backend,
  probe: { browser: A2.probe.browser.toString(16), server: A2.probe.server.toString(16), equal: A2.probe.browser === A2.probe.server, ms: A2.probe.ms },
  tabBSeesTabA: { entity: A.entity, movedZ: Math.round(dz * 100) / 100, expectedZ: -6 },
  costFrame: A2.cost, power: A2.power, costBreaches,
  corrections: A2.stats.corrections, rttMs: A2.stats.rttMs, visibleFromB: B2.stats.visible, gesture, objetos, sesiones, pase,
  identidad: { a: A2.who, b: B2.who }, // I1: two tabs of the same browser are the same guest
  errors,
};
// movement: 1.5 s at 1.5 m/s (human walking pace, J3) = 2.25 m. The https pass failed once at exactly -4.0 (J6 saw a
// one-off too, back when walk was 4 m/s); likely cause: software GL drops frames under load and the 250 ms dt clamp
// in the page loses ticks. Past 1 m proves the path; corrections === 0 is the real netcode check.
const ok = result.probe.equal && dz < -1 && dz > -3.75 && result.corrections === 0 && costBreaches.length === 0 && gestureOk && objetos.ok && pase.ok && (!sesiones.comprobado || sesiones.ok) && !!A2.who?.id && A2.who.id === B2.who?.id && errors.length === 0;
console.log(JSON.stringify(result, null, 1));
console.log(ok ? "E2E OK" : "E2E FALLA");
process.exit(ok ? 0 : 1);
