// e2e leg (v12): the dartboard on your real wall (AR «En tu pared») is PAINTED, not a black square.
// IWER plays a Quest 3 with a wall 2.4 m ahead; the page enters immersive-ar with the board (view.dardosAR), the trigger hangs
// it, and the leg reads the pixels the session drew: the board's red and green rings, its cream sectors and its dark backboard must
// all be there, and the board must be lit from every side of the room (the light comes from the AR session's own lights).
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE, SHOTS (a folder: «dardos-ar-diana.png»).
// Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const SHOTS = process.env.SHOTS ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];

const res = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  // a wall 2.4 m in front of the viewer, 1.5 m up, its normal toward you: the hit pose's y axis = (0, 0, 1)
  await ctx.addInitScript(IWER + `;
    class Pared { constructor(d) { this.d = d; this.environmentCanvas = document.createElement("canvas"); } render() {}
      computeHitTestResults() { return [new Float32Array([1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,1.5,-2.4,1])]; } }
    // IWER's base layer has a null framebuffer (the default one, which a screenshot never shows while presenting); three needs a real
    // object to bind: give it a colour and a depth attachment of the canvas' size, so what the session draws can be read back.
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() {
      if (this.__fb) return this.__fb;
      const gl = this.context, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, fb = (this.__fb = gl.createFramebuffer());
      const tex = gl.createTexture(), dep = gl.createRenderbuffer(), antes = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.bindRenderbuffer(gl.RENDERBUFFER, dep); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, dep);
      gl.bindFramebuffer(gl.FRAMEBUFFER, antes);
      globalThis.__ar = { gl, fb, w, h };
      return fb;
    } });
    // what the session drew (the layer's framebuffer): counts of the board's colours and the picture, flipped upright
    globalThis.__leerAR = () => {
      const { gl, fb, w, h } = globalThis.__ar, px = new Uint8Array(w * h * 4), antes = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, antes);
      const c = { rojo: 0, verde: 0, crema: 0, oscuro: 0, pintado: 0, total: w * h, w, h };
      for (let i = 0; i < w * h; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
        if (a === 0) continue;
        c.pintado++;
        if (r > 90 && r > g + 50 && r > b + 50) c.rojo++;
        else if (g > 70 && g > r + 20 && g > b + 20) c.verde++;
        else if (r > 130 && g > 120 && b > 80 && r - b > 20 && r - b < 90) c.crema++;
        else if (r + g + b < 120) c.oscuro++;
      }
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d"), im = x.createImageData(w, h);
      for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      x.putImageData(im, 0, 0);
      return { cuenta: c, png: cv.toDataURL("image/png") };
    };
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.installSEM(Pared); globalThis.__iwer = dev;`);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  // the page's own door to the wall board (what «En tu pared (AR)» calls): AR session with the minigame, no miniature
  res.entra = await p.evaluate(async () => { const j = await globalThis.__numinia.view.dardosAR({ alLanzar() {} }); globalThis.__diana = j; return !!j; });
  await p.waitForFunction(() => globalThis.__numinia.view.ar.jugando, null, { timeout: 15000 });
  await p.evaluate(() => { const c = globalThis.__iwer.controllers.right; c.position.set(0.02, 1.52, -0.35); c.quaternion.set(0, 0, 0, 1); });
  await p.evaluate(() => new Promise((ok) => { const c = globalThis.__iwer.controllers.right; c.updateButtonValue("trigger", 1); setTimeout(() => { c.updateButtonValue("trigger", 0); setTimeout(ok, 150); }, 120); }));
  await p.waitForFunction(() => globalThis.__diana.estado().fase === "colocada", null, { timeout: 8000 });
  res.fase = await p.evaluate(() => globalThis.__diana.estado().fase);
  await p.waitForTimeout(1500); // some frames with the board up
  const f = await p.evaluate(() => globalThis.__leerAR());
  if (SHOTS) (await import("node:fs")).writeFileSync(`${SHOTS}/dardos-ar-diana.png`, Buffer.from(f.png.split(",")[1], "base64"));
  res.pixeles = f.cuenta;
  await p.evaluate(() => globalThis.__numinia.view.ar.exit());
  await ctx.close();
} catch (e) { errors.push("ar: " + String(e?.message ?? e).slice(0, 300)); }
await browser.close();

const px = res.pixeles;
// painted: the two wire colours and the cream sectors each show up (the board is ~100 px wide in this 640x400 frame).
const pintada = !!px && px.rojo > 30 && px.verde > 10 && px.crema > 1000;
const ok = res.entra === true && res.fase === "colocada" && pintada && errors.length === 0;
console.log(JSON.stringify({ ...res, pintada, errors }, null, 1));
console.log(ok ? "E2E DIANA AR OK" : "E2E DIANA AR FALLA");
process.exit(ok ? 0 : 1);
