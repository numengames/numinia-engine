// e2e leg N1 (camera): real mouse events on the canvas of one tab. The wheel changes the distance (down to first
// person and back); a click without moving stays a click and a left drag turns the camera without a click; a right
// drag turns it ~90° and then W walks where the camera looks (corrections 0); keys turn, zoom, toggle first person
// and reset; build mode (the builder's API): frame(), plain left ignored, Alt+left orbits, middle drag pans, the wheel
// zooms toward the cursor, bloquear() freezes it, back to play follows the avatar again; a (fake) gamepad turns and
// walks; the full-screen button goes in and out. Chromium also checks touch: a right-half finger orbits, a left-half
// finger is the joystick, two fingers pinch. Ends still (no work when still).
// Usage (tools/auto.sh e2e runs it): BASE=http://127.0.0.1:5174/?webgl2&server=ws://127.0.0.1:8792 node tools/e2e-piernas/camara.mjs
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const ENGINE = process.env.BROWSER ?? "chromium";
const browser = await (ENGINE === "firefox" ? firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }) : chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }));
const errors = [];
const open = async (ctx) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  // the loading screen (#carga) covers the view until the whole world is in (0.59.0): wait for it to go, or the wheel and the fingers land on it
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && (globalThis.__numinia.carga?.estado ?? "listo") === "listo" && !!document.getElementById("carga")?.hidden, null, { timeout: 60000 });
  return p;
};
const W = 480, H = 300, cx = W / 2, cy = 185; // the mouse row: clear of the HUD, the full-screen button and the help line
const R = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
const cam = (p) => p.evaluate(() => globalThis.__numinia.view.cam.estado());
const settle = (p) => p.waitForFunction(() => globalThis.__numinia.view.cam.estado().quieta, null, { timeout: 8000 });
const me = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
const drag = async (p, x0, y0, x1, y1, button = "left") => {
  await p.mouse.move(x0, y0); await p.mouse.down({ button });
  await p.mouse.move(x1, y1, { steps: 12 }); await p.mouse.up({ button });
};
const wheel = async (p, dy, n = 1) => { for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(30); } };
const checks = {};
const ok = (k, v, data) => { checks[k] = { ok: !!v, ...data }; };

const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const p = await open(ctx);
await p.bringToFront();
await p.evaluate(() => { // what reaches the page: clicks on the canvas, and whether the context menu was stopped
  globalThis.__clics = 0; globalThis.__menu = [];
  addEventListener("click", () => { globalThis.__clics++; });
  addEventListener("contextmenu", (e) => { globalThis.__menu.push(e.defaultPrevented); });
});
try {
  const s0 = await cam(p);
  ok("inicio", s0.modo === "juego" && Math.abs(s0.yaw) < 1e-6 && Math.abs(s0.distancia - 10.4) < 1e-3 && s0.quieta, { yaw: R(s0.yaw), distancia: R(s0.distancia) });

  // wheel: out, then all the way in (first person), then one notch out of it
  await p.mouse.move(cx, cy);
  await wheel(p, 200, 2); await settle(p);
  const fuera = await cam(p);
  await wheel(p, -300, 14); await settle(p);
  const dentro = await cam(p);
  await wheel(p, 100); await settle(p);
  const salir = await cam(p);
  ok("rueda", fuera.distancia > s0.distancia + 1 && dentro.distancia === 0 && dentro.primeraPersona && salir.distancia === 1.5 && !salir.primeraPersona,
    { lejos: R(fuera.distancia, 2), primeraPersona: dentro.primeraPersona, ojoY: R(dentro.camara.y, 2), unaMuescaFuera: R(salir.distancia, 2) });

  // keys: Home back behind at the start; V first person and back; - and = zoom; comma held turns left
  await p.keyboard.press("Home"); await settle(p);
  const casa = await cam(p);
  await p.keyboard.press("KeyV"); await settle(p);
  const v1 = await cam(p);
  await p.keyboard.press("KeyV"); await settle(p);
  const v2 = await cam(p);
  await p.keyboard.press("Minus"); await settle(p);
  const menos = await cam(p);
  await p.keyboard.press("Equal"); await settle(p);
  const mas = await cam(p);
  await p.keyboard.down("Comma"); await p.waitForTimeout(400); await p.keyboard.up("Comma"); await settle(p);
  const coma = await cam(p);
  await p.keyboard.press("Home"); await settle(p);
  ok("teclas", Math.abs(casa.distancia - 10.4) < 1e-3 && v1.distancia === 0 && Math.abs(v2.distancia - 10.4) < 1e-3 && menos.distancia > 10.5 && mas.distancia < menos.distancia && coma.yaw > 0.3,
    { inicio: R(casa.distancia, 2), v: [v1.distancia, R(v2.distancia, 2)], menos: R(menos.distancia, 2), mas: R(mas.distancia, 2), comaYaw: R(coma.yaw) });

  // a left click without moving reaches the page and does not turn; a left drag turns and is not a click
  const y0 = (await cam(p)).yaw;
  await p.mouse.click(cx, cy); await p.waitForTimeout(100);
  const clic = { clics: await p.evaluate(() => globalThis.__clics), yaw: (await cam(p)).yaw };
  await drag(p, cx - 100, cy, cx + 100, cy); await settle(p);
  const arr = { clics: await p.evaluate(() => globalThis.__clics), yaw: (await cam(p)).yaw };
  ok("izquierdo", clic.clics === 1 && Math.abs(clic.yaw - y0) < 1e-6 && arr.clics === 1 && arr.yaw < y0 - 0.5, { clic, arrastre: { ...arr, yaw: R(arr.yaw) } });

  // a right drag of ~286 px turns ~90° to the right; the context menu never opens
  await p.keyboard.press("Home"); await settle(p);
  await drag(p, cx - 143, cy, cx + 143, cy, "right"); await settle(p);
  const giro = await cam(p);
  const menu = await p.evaluate(() => globalThis.__menu);
  ok("derecho", giro.yaw < -1.2 && giro.yaw > -1.9 && menu.length > 0 && menu.every(Boolean), { yawGrados: R((giro.yaw * 180) / Math.PI, 1), menuParado: menu });

  // walking speed of packages/sim/src/index.ts (SPEED): 1.5 m/s since #24 (was 4); 1.5 s of W ≈ 2.25 m, 1 s of stick ≈ 1.5 m
  const ANDA = 1.5;
  // W walks where the camera looks (yaw ≈ -90° → +x), with no prediction corrections
  const a0 = await me(p);
  await p.keyboard.down("KeyW"); await p.waitForTimeout(1500); await p.keyboard.up("KeyW"); await p.waitForTimeout(700);
  const a1 = await me(p);
  const d = { x: a1.x - a0.x, z: a1.z - a0.z }, len = Math.hypot(d.x, d.z);
  const f = { x: -Math.sin(giro.yaw), z: -Math.cos(giro.yaw) };
  const err = (Math.acos(Math.max(-1, Math.min(1, (d.x * f.x + d.z * f.z) / (len || 1)))) * 180) / Math.PI;
  const corr = await p.evaluate(() => globalThis.__numinia.session.stats.corrections);
  ok("andarHaciaLaCamara", len > 1.5 * ANDA * 0.65 && len < 1.5 * ANDA * 1.6 + 0.5 && err < 8 && corr === 0, { movido: { x: R(d.x, 2), z: R(d.z, 2) }, metros: R(len, 2), errorGrados: R(err, 1), correcciones: corr });

  // build mode (what the builder calls): frame(), plain left ignored, Alt+left orbits, middle pans, wheel to the cursor
  await p.evaluate(() => globalThis.__numinia.view.cam.modo("construir")); await settle(p);
  const b0 = await cam(p);
  const fr = await p.evaluate(() => { const n = globalThis.__numinia, s = n.session.selfPosition(1); return n.view.cam.frame({ x: s.x + 3, y: 0.5, z: s.z - 4 }, 1); });
  await settle(p);
  const b1 = await cam(p), at = await me(p);
  await drag(p, cx - 80, cy, cx + 80, cy); await settle(p);
  const b2 = await cam(p);
  await p.keyboard.down("Alt"); await drag(p, cx - 80, cy, cx + 80, cy); await p.keyboard.up("Alt"); await settle(p);
  const b3 = await cam(p);
  await drag(p, cx, cy, cx + 60, cy + 40, "middle"); await settle(p);
  const b4 = await cam(p);
  // off-centre, on the 3D view itself: the minimap and the panels sit in the corners and take their own wheel
  const [wx, wy] = await p.evaluate(([x0, y0]) => {
    const lienzo = globalThis.__numinia.view.renderer.domElement;
    for (let r = 0; r <= 200; r += 6) for (let k = 0, n = Math.max(1, Math.round(r / 3)); k < n; k++) {
      const a = (k / n) * 2 * Math.PI, x = x0 + r * Math.cos(a), y = y0 + r * Math.sin(a);
      if (document.elementFromPoint(x, y) === lienzo) return [x, y];
    }
    return [x0, y0];
  }, [cx + 120, cy + 60]);
  await p.mouse.move(wx, wy); await wheel(p, -200); await settle(p);
  const b5 = await cam(p);
  await p.evaluate(() => globalThis.__numinia.view.cam.bloquear(true));
  await wheel(p, 300); await drag(p, cx - 80, cy, cx + 80, cy, "right"); await settle(p);
  const b6 = await cam(p);
  await p.evaluate(() => globalThis.__numinia.view.cam.bloquear(false));
  const movedPivot = (a, b) => Math.hypot(a.pivote.x - b.pivote.x, a.pivote.y - b.pivote.y, a.pivote.z - b.pivote.z);
  ok("construir", b0.modo === "construir" && b0.distancia >= 8 && fr === true
    && Math.hypot(b1.pivote.x - (at.x + 3), b1.pivote.z - (at.z - 4)) < 0.05 && Math.abs(b1.pivote.y - 0.5) < 0.05
    && Math.abs(b2.yaw - b1.yaw) < 1e-6 && Math.abs(b3.yaw - b2.yaw) > 0.4 && movedPivot(b3, b4) > 0.3
    && b5.distancia < b4.distancia && movedPivot(b4, b5) > 0.1 && b6.distancia === b5.distancia && b6.yaw === b5.yaw && b6.bloqueada,
    { distancia: R(b0.distancia, 2), encuadre: { pivote: { x: R(b1.pivote.x - at.x, 2), y: R(b1.pivote.y, 2), z: R(b1.pivote.z - at.z, 2) }, distancia: R(b1.distancia, 2) },
      izquierdoSinAlt: R(b2.yaw - b1.yaw), altIzquierdo: R(b3.yaw - b2.yaw), panMedio: R(movedPivot(b3, b4), 2), ruedaCursor: { distancia: R(b5.distancia, 2), pivoteMovido: R(movedPivot(b4, b5), 2) }, bloqueada: b6.bloqueada });

  await p.evaluate(() => globalThis.__numinia.view.cam.modo("juego")); await settle(p);
  const j = await cam(p), feet = await me(p);
  const still = await p.evaluate(() => !globalThis.__numinia.view.cam.ocupada());
  ok("volverAJugar", j.modo === "juego" && Math.hypot(j.pivote.x - feet.x, j.pivote.z - feet.z) < 0.05 && Math.abs(j.pivote.y - 1.6) < 0.01 && Math.abs(j.distancia - 10.4) < 1e-3 && still,
    { pivoteSobreTi: R(Math.hypot(j.pivote.x - feet.x, j.pivote.z - feet.z), 3), distancia: R(j.distancia, 2), quietaSinTrabajo: still });

  // gamepad (a fake one behind navigator.getGamepads): the right stick turns, the left stick walks where the camera looks
  await p.evaluate(() => {
    const pad = { id: "falso", index: 0, connected: true, mapping: "standard", axes: [0, 0, 0.9, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    globalThis.__pad = pad;
    Object.defineProperty(navigator, "getGamepads", { value: () => [pad], configurable: true });
    dispatchEvent(new Event("gamepadconnected"));
  });
  await p.waitForTimeout(500);
  await p.evaluate(() => { globalThis.__pad.axes[2] = 0; }); await settle(p);
  const g1 = await cam(p), q0 = await me(p);
  await p.evaluate(() => { globalThis.__pad.axes[1] = -1; }); await p.waitForTimeout(1000);
  await p.evaluate(() => { globalThis.__pad.axes[1] = 0; }); await p.waitForTimeout(600);
  const q1 = await me(p);
  await p.evaluate(() => dispatchEvent(new Event("gamepaddisconnected")));
  const gd = { x: q1.x - q0.x, z: q1.z - q0.z }, gl = Math.hypot(gd.x, gd.z), gf = { x: -Math.sin(g1.yaw), z: -Math.cos(g1.yaw) };
  const gerr = (Math.acos(Math.max(-1, Math.min(1, (gd.x * gf.x + gd.z * gf.z) / (gl || 1)))) * 180) / Math.PI;
  const gcorr = await p.evaluate(() => globalThis.__numinia.session.stats.corrections);
  const gstill = await p.evaluate(() => !globalThis.__numinia.view.cam.ocupada());
  const dg = Math.atan2(Math.sin(g1.yaw - j.yaw), Math.cos(g1.yaw - j.yaw));
  ok("mando", dg < -0.5 && gl > 1.0 * ANDA * 0.6 && gerr < 8 && gcorr === 0 && gstill, { giro: R(dg), metros: R(gl, 2), errorGrados: R(gerr, 1), correcciones: gcorr, quietaAlSoltar: gstill });

  // full screen: a real button (the browser can do it here), on and off — ux2-barra: an entry of the bar's «Menú» (O)
  const fs0 = await p.evaluate(() => ({ soporta: document.fullscreenEnabled, visible: !document.getElementById("pantalla").hidden, texto: document.getElementById("pantalla").textContent }));
  await p.click("#menu-abrir"); await p.click("#pantalla");
  const fsOn = await p.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 3000 }).then(() => true, () => false);
  const fs1 = await p.evaluate(() => document.getElementById("pantalla").textContent);
  await p.click("#menu-abrir"); await p.click("#pantalla");
  const fsOff = await p.waitForFunction(() => !document.fullscreenElement, null, { timeout: 3000 }).then(() => true, () => false);
  ok("pantallaCompleta", !fs0.soporta || (fs0.visible && fsOn && fsOff && /Salir/.test(fs1)), { ...fs0, entra: fsOn, textoDentro: fs1, sale: fsOff });
} catch (e) { checks.excepcion = { ok: false, error: String(e).split("\n")[0] }; }

// touch (Chromium: CDP touch events become real touch pointers): right half orbits, left half walks, two fingers pinch
if (ENGINE === "chromium") {
  try {
    const tctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true });
    const t = await open(tctx);
    const cdp = await tctx.newCDPSession(t);
    const touch = async (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const swipe = async (pts0, pts1, steps = 10, holdMs = 0) => {
      await touch("touchStart", pts0);
      for (let i = 1; i <= steps; i++) await touch("touchMove", pts0.map(([x, y], k) => [x + ((pts1[k][0] - x) * i) / steps, y + ((pts1[k][1] - y) * i) / steps]));
      if (holdMs) await t.waitForTimeout(holdMs);
      await touch("touchEnd", []);
    };
    // the touch row: the first height where every finger of this check lands on the 3D view itself. The HUD panels, the
    // minimap and the touch buttons grow as features arrive (and will move: a layout of one's own), so it is searched,
    // not fixed; the help line and the HUD take no clicks, so a finger over them still reaches the view
    const pinza0 = [[W * 0.56], [W * 0.72]], pinza1 = [[W * 0.52], [W * 0.76]], orbitaX = [W * 0.75, W * 0.75 - 120];
    const ty = await t.evaluate(([xs, alto]) => {
      const lienzo = globalThis.__numinia.view.renderer.domElement;
      for (let y = 60; y < alto - 40; y += 6) if (xs.every((x) => document.elementFromPoint(x, y) === lienzo)) return y;
      return -1;
    }, [[...pinza0.flat(), ...pinza1.flat(), ...orbitaX], H]);
    if (ty < 0) throw new Error("ninguna fila libre para los dedos: la interfaz tapa la mitad derecha de la vista 3D");
    const t0 = await cam(t), m0 = await me(t);
    await swipe([[W * 0.75, ty]], [[W * 0.75 - 120, ty]]); await settle(t); await t.waitForTimeout(300);
    const t1 = await cam(t), m1 = await me(t);
    await swipe([[W * 0.25, 200]], [[W * 0.25, 160]], 6, 900); await t.waitForTimeout(700);
    const t2 = await cam(t), m2 = await me(t);
    await swipe(pinza0.map(([x]) => [x, ty]), pinza1.map(([x]) => [x, ty])); await settle(t);
    const t3 = await cam(t);
    const walked = Math.hypot(m2.x - m1.x, m2.z - m1.z);
    ok("tactil", t1.yaw > t0.yaw + 0.5 && Math.hypot(m1.x - m0.x, m1.z - m0.z) < 0.01 && Math.abs(t2.yaw - t1.yaw) < 1e-6 && walked > 0.5 && t3.distancia < t2.distancia - 1,
      { derechaGira: R(t1.yaw - t0.yaw), derechaNoAnda: R(Math.hypot(m1.x - m0.x, m1.z - m0.z), 3), izquierdaAnda: R(walked, 2), pellizco: { antes: R(t2.distancia, 2), despues: R(t3.distancia, 2) } });
  } catch (e) { checks.tactil = { ok: false, error: String(e).split("\n")[0] }; }
}
await browser.close();

const allOk = Object.values(checks).every((c) => c.ok) && errors.length === 0 && Object.keys(checks).length >= 10;
console.log(JSON.stringify({ engine: ENGINE, checks, errors }, null, 1));
console.log(allOk ? "E2E CAMARA OK" : "E2E CAMARA FALLA");
process.exit(allOk ? 0 : 1);
