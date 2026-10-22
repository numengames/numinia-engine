// e2e leg N16 (teletransporte): «Gente» and /ir <nombre> take you next to someone connected now, with the light.
// PC (1280×720): L opens «Gente», the other tab is listed («Aquí ahora»), picking them and «Ir a su lado» → the light where you stood (both tabs draw it), and
// a moment later you stand 1–3.5 m from them (the server moved you; the page follows); asking again at once says
// «Espera…». The other tab goes back with the chat's /ir <nombre>. Tier D (simulated on the watching tab): nobody's
// light is drawn there, the trip still happens. Phone (390×844, touch): the people button, «Ir» by tapping, the panel
// inside the screen (ux2-gente: tapping the row shows their sheet, whose «Ir a su lado» is ≥ 44 px). VR (IWER Quest 3): /ir from the headset, the light at tier B (3 at most), the rig ends next to
// them. A photo's link in a world that does not allow it still leads with the waypoint (no trip); with BASE_FOTO (a
// second server whose MUNDO_DIR's entorno.json says `aparicionFoto: true`) the link puts you at the photo's place.
// Usage (tools/auto.sh e2e runs it): BASE=http://127.0.0.1:5174/?webgl2&server=ws://127.0.0.1:8792 node tools/e2e-piernas/teletransporte.mjs
import { createRequire } from "node:module";
import { existsSync, readFileSync, globSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1) ?? "";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];
const open = async (ctx, url = BASE) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch { /* */ } }, VERSION); // «Novedades» would cover the top bar on a phone
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who && globalThis.__numinia.viajar.estado.recibido, null, { timeout: 60000 });
  return p;
};
const checks = {};
const ok = (k, v, data) => { checks[k] = { ok: !!v, ...data }; };
const R = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const ent = (p) => p.evaluate(() => globalThis.__numinia.session.entity);
const yo = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
const luz = (p) => p.evaluate(() => globalThis.__numinia.view.teletransporte.estado());
const viaje = (p) => p.evaluate(() => globalThis.__numinia.viajar.estado.viaje);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** Where `p` sees `quien` (their remote position), or its own position. */
const donde = (p, quien) => p.evaluate((q) => { const n = globalThis.__numinia; return q === n.session.entity ? n.session.selfPosition(1) : n.session.remotePositions().find((r) => r.id === q) ?? null; }, quien);
/** Wait until `p` stands near `quien` (as `p` sees them), returning the last distance. */
async function hastaJunto(p, quien, ms = 8000) {
  let d = Infinity;
  for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
    const [m, o] = [await yo(p), await donde(p, quien)];
    if (m && o) { d = dist(m, o); if (d <= 3.5) break; }
    await p.waitForTimeout(150);
  }
  return d;
}
/** The name `p` knows `quien` by, from its «Gente» list. */
async function nombreDe(p, quien) {
  await p.evaluate(() => globalThis.__numinia.viajar.pedirGente());
  await p.waitForFunction((q) => globalThis.__numinia.viajar.estado.gente.some((g) => g.quien === q), quien, { timeout: 8000 });
  return p.evaluate((q) => globalThis.__numinia.viajar.estado.gente.find((g) => g.quien === q).nombre, quien);
}

try {
  // ---------------- PC ----------------
  // one context per person: tabs of one context share the guest identity (the same person twice)
  const pc = () => browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctx = await pc(), ctxB = await pc(), ctxC = await pc();
  const a = await open(ctx), b = await open(ctxB);
  const A = await ent(a), B = await ent(b);
  ok("mundo", await a.evaluate(() => globalThis.__numinia.viajar.activo() && !globalThis.__numinia.viajar.foto()), {});
  // L opens «Gente»; B is listed in «Aquí ahora»; picking B shows their sheet with «Ir a su lado»
  await a.bringToFront();
  await a.mouse.click(640, 420);
  await a.keyboard.press("KeyL");
  await a.waitForFunction((q) => document.getElementById("gente")?.open && !!document.querySelector(`#gente [data-quien="${q}"] .gente-fila`), B, { timeout: 8000 });
  const lista = await a.evaluate(() => [...document.querySelectorAll("#gente [data-quien]")].map((l) => Number(l.dataset.quien)));
  ok("lista", lista.includes(B) && !lista.includes(A), { lista, A, B });
  const luzA0 = await luz(a), luzB0 = await luz(b);
  await a.click(`#gente [data-quien="${B}"] .gente-fila`);
  await a.waitForSelector("#gente-ir:not([disabled])", { timeout: 3000 });
  await a.click("#gente-ir");
  const cerrado = await a.waitForFunction(() => !document.getElementById("gente").open, null, { timeout: 3000 }).then(() => true, () => false);
  // during the trip the watching tab hides A's body for a moment
  let oculto = 0;
  for (let i = 0; i < 20 && !oculto; i++) { oculto = (await luz(b)).ocultos; await b.waitForTimeout(60); }
  const dAB = await hastaJunto(a, B);
  await a.waitForTimeout(400);
  const luzA1 = await luz(a), luzB1 = await luz(b), vA = await viaje(a);
  ok("ir", cerrado && dAB >= 0.8 && dAB <= 3.5 && vA?.ok === true && /junto a/.test(vA.texto) && luzA1.lanzadas >= luzA0.lanzadas + 1 && luzB1.lanzadas >= luzB0.lanzadas + 1 && oculto >= 1,
    { distancia: R(dAB), viaje: vA, luzA: luzA1, luzB: luzB1, ocultoEnB: oculto });
  // again at once: wait
  await a.evaluate((q) => globalThis.__numinia.viajar.ir(q), B);
  await a.waitForFunction(() => /Espera \d+ s/.test(globalThis.__numinia.viajar.estado.viaje?.texto ?? ""), null, { timeout: 5000 }).catch(() => {});
  ok("espera", /Espera \d+ s/.test((await viaje(a))?.texto ?? ""), { viaje: await viaje(a) });

  // B walks away a little is not needed: B goes to A with the chat order, by name
  const nombreA = await nombreDe(b, A);
  const c = await open(ctxC);
  const C = await ent(c);
  await b.evaluate((n) => globalThis.__numinia.chat.decir(`/ir ${n}`), nombreA);
  const dBA = await hastaJunto(b, A);
  await b.waitForFunction(() => globalThis.__numinia.chat.lineas.some((l) => l.tipo === "aviso" && /Estás junto a/.test(l.texto)), null, { timeout: 6000 }).catch(() => {});
  const avisoB = await b.evaluate(() => globalThis.__numinia.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto).slice(-3));
  ok("chat", dBA <= 3.5 && avisoB.some((t) => /Estás junto a/.test(t)), { distancia: R(dBA), avisos: avisoB, nombreA });

  // tier D on A's tab: C comes to A; the trip happens, A's tab draws no light
  await a.evaluate(() => globalThis.__numinia.view.entorno.simularNivel("D"));
  const luzD0 = await luz(a);
  await c.evaluate((q) => globalThis.__numinia.viajar.ir(q), A);
  const dCA = await hastaJunto(c, A);
  await a.waitForTimeout(1600);
  const luzD1 = await luz(a), vC = await viaje(c);
  await a.evaluate(() => globalThis.__numinia.view.entorno.simularNivel(null));
  ok("nivelD", dCA <= 3.5 && luzD1.max === 0 && luzD1.lanzadas === luzD0.lanzadas && luzD1.saltadas > luzD0.saltadas && luzD1.activas === 0, { distancia: R(dCA), viaje: vC, antes: luzD0, despues: luzD1 });
  await ctxC.close();
  await ctxB.close();

  // ---------------- phone (touch) ----------------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const m = await open(mctx);
  // on a phone «Gente» lives in the «…» menu (movil.ts): tap it, then its «Gente» entry (behind «más» when needed)
  await m.waitForSelector("#mas", { state: "visible", timeout: 15000 });
  await m.touchscreen.tap(...(await m.evaluate(() => { const r = document.getElementById("mas").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })));
  await m.waitForTimeout(300);
  const visto = () => m.evaluate(() => (document.querySelector('#mas-menu [data-id="gente-abrir"]')?.getBoundingClientRect().width ?? 0) > 0);
  if (!(await visto())) { await m.tap("#mas-mas"); await m.waitForTimeout(300); }
  const boton = await m.evaluate(() => { const b = document.querySelector('#mas-menu [data-id="gente-abrir"]'), r = b?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.min(r.width, r.height), visible: r.width > 0 } : { visible: false, w: 0 }; });
  if (boton.visible) await m.touchscreen.tap(boton.x, boton.y);
  await m.waitForFunction((q) => document.getElementById("gente")?.open && !!document.querySelector(`#gente [data-quien="${q}"] .gente-fila`), A, { timeout: 8000 });
  const fila = await m.evaluate((q) => { const r = document.querySelector(`#gente [data-quien="${q}"] .gente-fila`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, A);
  await m.touchscreen.tap(fila.x, fila.y);
  await m.waitForFunction(() => { const b = document.getElementById("gente-ir"); return !!b && !b.disabled && b.getBoundingClientRect().width > 0; }, null, { timeout: 4000 });
  const ir = await m.evaluate(() => { const r = document.getElementById("gente-ir").getBoundingClientRect(), d = document.getElementById("gente").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, alto: r.height, dentro: d.right <= innerWidth + 0.5 && d.bottom <= innerHeight + 0.5 && d.x >= -0.5 && r.bottom <= innerHeight }; });
  await m.touchscreen.tap(ir.x, ir.y);
  const dMA = await hastaJunto(m, A);
  ok("movil", boton.visible && boton.w >= 44 && ir.alto >= 44 && ir.dentro && dMA <= 3.5, { boton, ir, distancia: R(dMA) });

  // a photo's link in a world that does not allow appearing there: the waypoint, no trip
  const fp = await yo(a);
  const q = await open(mctx, `${BASE}#foto=${R(fp.x + 30, 1)},1.5,${R(fp.z - 20, 1)},0,-10,6`);
  await q.waitForFunction(() => globalThis.__numinia.foto.guia()?.estado !== "esperando", null, { timeout: 20000 });
  const g = await q.evaluate(() => ({ guia: globalThis.__numinia.foto.guia(), viaje: globalThis.__numinia.viajar.estado.viaje }));
  ok("fotoApagada", g.guia?.estado === "en-camino" && !g.viaje, g);
  await q.close();
  await m.close();
  await mctx.close();

  // a world whose entorno.json says `aparicionFoto: true` (BASE_FOTO: a server started with such a MUNDO_DIR): the
  // photo's link puts you at its place with the light, no waypoint walk
  if (process.env.BASE_FOTO) {
    const fctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const f = await open(fctx, `${process.env.BASE_FOTO}#foto=31.5,1.5,-12.5,40,-10,6`);
    await f.waitForFunction(() => globalThis.__numinia.foto.guia()?.estado === "llegado", null, { timeout: 15000 }).catch(() => {});
    const r = await f.evaluate(() => ({ guia: globalThis.__numinia.foto.guia(), yo: globalThis.__numinia.session.selfPosition(1), viaje: globalThis.__numinia.viajar.estado.viaje, foto: globalThis.__numinia.viajar.foto(), luz: globalThis.__numinia.view.teletransporte.estado() }));
    ok("fotoAparecer", r.foto && r.guia?.estado === "llegado" && dist(r.yo, { x: 31.5, z: -12.5 }) <= 3 && r.viaje?.ok === true && r.luz.lanzadas >= 2, { ...r, distancia: R(dist(r.yo, { x: 31.5, z: -12.5 })) });
    await fctx.close();
  }

  // ---------------- VR (IWER Quest 3): /ir from the headset ----------------
  const vctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await vctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;`);
  const v = await open(vctx);
  await v.waitForFunction(() => getComputedStyle(document.getElementById("vr")).display !== "none", null, { timeout: 8000 });
  await v.evaluate(() => document.getElementById("vr").click());
  await v.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 15000 });
  await v.waitForTimeout(600);
  const nA = await nombreDe(v, A), luzV0 = await luz(v);
  await v.evaluate((n) => globalThis.__numinia.chat.decir(`/ir ${n}`), nA);
  const dVA = await hastaJunto(v, A);
  await v.waitForTimeout(500);
  const luzV1 = await luz(v);
  const rig = await v.evaluate(() => { const r = globalThis.__numinia.view.vr.rig.position; return { x: r.x, z: r.z }; });
  const aPos = await donde(v, A);
  ok("vr", dVA <= 3.5 && luzV1.max === 3 && luzV1.lanzadas >= luzV0.lanzadas + 1 && dist(rig, aPos) <= 4, { distancia: R(dVA), luz: luzV1, rig, a: aPos });
  // v8: the menu's «Ir a su lado» inside the headset, pressed again at once (the world allows one trip every ESPERA_S): the server's «Espera N s»
  // must be TOLD in the headset (the VR note), because the menu closes at once and the page's toast stack is not drawn there. Before v8 it was silent.
  await v.evaluate(() => globalThis.__numinia.view.vr.alternarMenu("gente"));
  const listaVR = await v.waitForFunction((n) => globalThis.__numinia.view.vr.menu.vista === "gente" && globalThis.__numinia.view.vr.menu.estado().filas.includes(n), nA, { timeout: 8000 }).then(() => true, () => false);
  await v.evaluate(() => globalThis.__numinia.view.vr.menu.pulsar(100)); // the first row's button
  const nota = await v.waitForFunction(() => /Espera \d+ s/.test(globalThis.__numinia.view.vr.estadoPaneles().nota), null, { timeout: 6000 }).then(() => true, () => false);
  ok("vrRechazo", listaVR && nota, { lista: listaVR, nota, panel: await v.evaluate(() => globalThis.__numinia.view.vr.estadoPaneles().nota) });
  await v.evaluate(() => globalThis.__numinia.view.vr.exit());
  await vctx.close();
  await ctx.close();
} catch (e) { checks.excepcion = { ok: false, error: String(e).split("\n").slice(0, 3).join(" | ") }; }
await browser.close();

const allOk = Object.values(checks).every((c) => c.ok) && errors.length === 0 && Object.keys(checks).length >= (process.env.BASE_FOTO ? 11 : 10);
console.log(JSON.stringify({ checks, errors }, null, 1));
console.log(allOk ? "E2E TELETRANSPORTE OK" : "E2E TELETRANSPORTE FALLA");
process.exit(allOk ? 0 : 1);
