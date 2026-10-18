// e2e leg J7b (rueda de movimientos): A holds G, the wheel opens; A points up-right (favourite 2, «Bailar») and lets
// go: A's VRM dances, B (near) sees A's VRM dance, the dance clip is fetched only then (lazy) and once per tab; A walks:
// the dance ends on both screens. Then the keyboard path: G held and let go without pointing keeps the wheel open, ↓
// goes to «Social», → marks, Enter makes it; F pins a move in the favourites (saved in this browser); Esc closes, and
// while open WASD does not walk. A tap of G still waves (J7). Prints JSON; exit 0 only when all is right.
// Receives BASE and SERVER_HTTP from tools/auto.sh e2e (tools/e2e-piernas/README.md). FOTOS=<dir> saves pictures.
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const FOTOS = process.env.FOTOS ?? null;
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const W = FOTOS ? 900 : 480, H = FOTOS ? 640 : 340;
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
const errors = [], descargas = [];
const open = async (tab) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${tab}: ${e}`));
  p.on("response", (r) => { const m = /\/a\/([0-9a-f]{64})\.vrma$/.exec(r.url()); if (m) descargas.push({ tab, sha: m[1] }); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  return p;
};
const foto = async (p, n) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${n}.png` }); };
const yo = (p) => p.evaluate(() => globalThis.__numinia.view.avatares().lista.find((x) => x.id === "yo") ?? null);
const de = (p, w) => p.evaluate((w) => globalThis.__numinia.view.avatares().lista.find((x) => x.id === w) ?? null, w);
const rueda = (p) => p.evaluate(() => globalThis.__numinia.rueda.estado());
const result = {};
let ok = false;
try {
  const a = await open("a"), b = await open("b");
  const A = await a.evaluate(() => globalThis.__numinia.session.entity);
  await b.waitForFunction((w) => globalThis.__numinia.session.remotePositions().some((r) => r.id === w), A, { timeout: 10000 });
  // B walks to within 6 m of A (moves play within 40 m; a near picture shows them)
  const offset = () => b.evaluate((w) => { const n = globalThis.__numinia, me = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === w); return o ? { dx: o.x - me.x, dz: o.z - me.z } : null; }, A);
  await b.bringToFront();
  for (const t0 = Date.now(); Date.now() - t0 < 25000; ) {
    const d = await offset();
    if (!d || Math.hypot(d.dx, d.dz) <= 6) break;
    const yaw = await b.evaluate(() => globalThis.__numinia.view.cam.yaw());
    // camera-relative: turn the camera towards A, then W walks there
    await b.evaluate(([dx, dz, y]) => globalThis.__numinia.view.cam.girar(Math.atan2(-dx, -dz) - y), [d.dx, d.dz, yaw]);
    await b.keyboard.down("KeyW"); await b.waitForTimeout(Math.min(900, 120 * Math.hypot(d.dx, d.dz))); await b.keyboard.up("KeyW");
  }
  for (const p of [a, b]) await p.waitForFunction(() => globalThis.__numinia.view.avatares().dibujados >= 2, null, { timeout: 40000 });
  { const d = await offset(); const y = await b.evaluate(() => globalThis.__numinia.view.cam.yaw()); await b.evaluate(([dx, dz, y]) => globalThis.__numinia.view.cam.girar(Math.atan2(-dx, -dz) - y, 0), [d.dx, d.dz, y]); }
  await a.evaluate(() => globalThis.__numinia.view.cam.girar(Math.PI)); // A looks at its own face
  if (FOTOS) for (const p of [a, b]) await p.evaluate(() => globalThis.__numinia.view.cam.acercar(2)); // pictures from closer
  await b.waitForTimeout(1200);
  const bailarAntes = descargas.length;

  // ---- 1. hold G, point up-right (favourite 2: Bailar), let go ----
  await a.bringToFront();
  await a.mouse.move(W / 2, H / 2);
  await a.keyboard.down("KeyG");
  await a.waitForTimeout(400);
  const abierta = await rueda(a);
  await a.mouse.move(W / 2 + 60, H / 2 - 60, { steps: 4 });
  await a.waitForTimeout(150);
  const marcada = await rueda(a);
  await foto(a, "1-rueda-abierta");
  await a.keyboard.up("KeyG");
  await a.waitForFunction(() => globalThis.__numinia.view.avatares().lista.find((x) => x.id === "yo")?.clip === "bailar", null, { timeout: 15000 });
  await b.waitForFunction((w) => globalThis.__numinia.view.avatares().lista.find((x) => x.id === w)?.clip === "bailar", A, { timeout: 15000 });
  await a.waitForTimeout(700);
  const yoBaila = await yo(a), bVe = await de(b, A);
  await foto(a, "2-a-baila-su-vista"); await foto(b, "3-b-ve-bailar-a-a");
  const tras = descargas.slice(bailarAntes);
  // ---- 2. A walks: the move ends on both screens ----
  await a.evaluate(() => globalThis.__numinia.view.cam.girar(Math.PI));
  await a.keyboard.down("KeyW"); await a.waitForTimeout(700); await a.keyboard.up("KeyW");
  await b.waitForFunction((w) => { const x = globalThis.__numinia.view.avatares().lista.find((x) => x.id === w); return x && x.movimiento === null && x.clip !== "bailar"; }, A, { timeout: 6000 }).catch(() => {});
  const trasAndar = { a: await yo(a), b: await de(b, A) };

  // ---- 3. the keyboard: G held without pointing stays open; ↓ Social, → marks, F (un)pins, Enter makes it, Esc closes ----
  await a.waitForTimeout(1100); // the page's pace: one move a second
  await a.keyboard.down("KeyG"); await a.waitForTimeout(350); await a.keyboard.up("KeyG");
  const fija = await rueda(a);
  const posAntes = await a.evaluate(() => { const p = globalThis.__numinia.session.selfPosition(1); return [p.x, p.z]; });
  await a.keyboard.down("KeyW"); await a.waitForTimeout(500); await a.keyboard.up("KeyW"); // swallowed: choosing never walks
  const posDespues = await a.evaluate(() => { const p = globalThis.__numinia.session.selfPosition(1); return [p.x, p.z]; });
  await a.keyboard.press("ArrowDown"); // → Social
  await a.keyboard.press("ArrowRight"); await a.keyboard.press("ArrowRight"); await a.keyboard.press("ArrowRight"); // Sentarse (4th)
  const social = await rueda(a);
  await a.keyboard.press("KeyF"); // «Sentarse» is one of the default favourites: F takes it out (a slot is free now)
  const tras_f = await a.evaluate(() => ({ estado: document.querySelector("#rueda .estado")?.textContent, guardado: localStorage.getItem("numinia.rueda.favoritos") }));
  await a.keyboard.press("ArrowRight"); // Charlar sentado
  await foto(a, "4-rueda-teclado-social");
  const foco = await a.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await a.keyboard.press("Enter");
  await a.waitForFunction(() => globalThis.__numinia.view.avatares().lista.find((x) => x.id === "yo")?.movimiento === "charlar-sentado", null, { timeout: 15000 });
  await b.waitForFunction((w) => globalThis.__numinia.view.avatares().lista.find((x) => x.id === w)?.movimiento === "charlar-sentado", A, { timeout: 15000 });
  await a.waitForTimeout(2200);
  await foto(b, "5-b-ve-a-sentado");
  const sentado = { a: await yo(a), b: await de(b, A), cerrada: !(await rueda(a)).abierta };
  // favourites: on «Favoritos», take «Bailar» out with F, then pin «Conducir» from Social: it takes the first free slot; saved
  await a.waitForTimeout(1100);
  await a.evaluate(() => globalThis.__numinia.rueda.abrir());
  await a.keyboard.press("ArrowRight"); // 2nd = Bailar (the first is marked on open)
  await a.keyboard.press("KeyF");
  await a.keyboard.press("ArrowDown"); for (let k = 0; k < 6; k++) await a.keyboard.press("ArrowRight"); // Social, 7th: «Conducir»
  await a.keyboard.press("KeyF");
  const favs = await a.evaluate(() => ({ estado: globalThis.__numinia.rueda.estado().favoritos, guardado: JSON.parse(localStorage.getItem("numinia.rueda.favoritos") ?? "null") }));
  await a.keyboard.press("Escape");
  const trasEsc = await rueda(a);
  // ---- 4. a tap of G still waves (J7) ----
  await a.waitForTimeout(1100);
  await a.keyboard.press("KeyG");
  await a.waitForFunction(() => globalThis.__numinia.view.avatares().lista.find((x) => x.id === "yo")?.movimiento === "saludar", null, { timeout: 6000 }).catch(() => {});
  const saluda = { yo: (await yo(a))?.movimiento, etiqueta: await a.evaluate(() => globalThis.__numinia.view.labels().includes("self")), rueda: (await rueda(a)).abierta };

  Object.assign(result, {
    A, abierta: { abierta: abierta.abierta, anillo: abierta.anillo }, marcadaAlApuntar: marcada.marcada,
    yoBaila: yoBaila && { clip: yoBaila.clip, movimiento: yoBaila.movimiento }, bVeA: bVe && { clip: bVe.clip, movimiento: bVe.movimiento, cerca: bVe.cerca },
    vrmaTrasBailar: tras.length, trasAndar: { a: trasAndar.a?.movimiento, aClip: trasAndar.a?.clip, b: trasAndar.b?.movimiento, bClip: trasAndar.b?.clip },
    teclado: { fija: fija.abierta, noAnda: Math.hypot(posDespues[0] - posAntes[0], posDespues[1] - posAntes[1]) < 0.05, social: social.anillo, marcada: social.marcada, foco, f: tras_f.estado },
    sentado: { a: sentado.a?.clip, b: sentado.b?.clip, cerrada: sentado.cerrada }, favs, trasEsc: trasEsc.abierta, saluda,
    errors,
  });
  ok = abierta.abierta && abierta.anillo === "favoritos" && marcada.marcada === 1 && yoBaila?.clip === "bailar" && bVe?.clip === "bailar"
    && tras.length >= 1 && tras.length <= 4 && trasAndar.a?.movimiento === null && trasAndar.b?.movimiento === null
    && fija.abierta && result.teclado.noAnda && social.anillo === "social" && social.marcada === 3 && /Sentarse: fuera de favoritos/.test(tras_f.estado ?? "")
    && ["sentarse", "sentado-hablar"].includes(sentado.a?.clip) && ["sentarse", "sentado-hablar"].includes(sentado.b?.clip) && sentado.cerrada
    && !favs.estado.includes("bailar") && !favs.estado.includes("sentarse") && favs.estado[1] === "conducir" && JSON.stringify(favs.estado) === JSON.stringify(favs.guardado)
    && trasEsc.abierta === false && saluda.yo === "saludar" && saluda.etiqueta && !saluda.rueda && errors.length === 0;
} catch (e) { result.error = String(e).split("\n")[0]; result.errors = errors; }
await browser.close();
console.log(JSON.stringify({ ok, ...result }, null, 1));
process.exit(ok ? 0 : 1);
