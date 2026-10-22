// e2e leg «hud-solapes»: on a phone, in portrait and landscape, no two visible touch controls (chat, action button, «…»,
// menu, map, joystick) overlap by more than 6 px and none leaves the screen. Gets BASE (?webgl2&server=…) from
// tools/auto.sh e2e. Prints JSON; exit 0 only when no overlap is found.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PW);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const result = { tamanos: {}, ok: true };
try {
  for (const [n, w, h] of [["360x740", 360, 740], ["390x844", 390, 844], ["740x360", 740, 360], ["844x390", 844, 390]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
    await sleep(2500);
    const r = await p.evaluate(() => {
      const els = [...document.body.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); if (!(s.position === "fixed" || s.position === "absolute") || s.display === "none" || s.visibility === "hidden" || +s.opacity === 0 || s.pointerEvents === "none") return false; const a = e.getBoundingClientRect(); return a.width >= 24 && a.height >= 24 && a.width < innerWidth * 0.9 && e.tagName !== "CANVAS" && a.right > 0 && a.bottom > 0 && a.left < innerWidth && a.top < innerHeight; });
      const hojas = els.filter((e) => !els.some((o) => o !== e && e.contains(o))); // leaves only
      const nm = (e) => (e.id ? "#" + e.id : e.tagName.toLowerCase());
      const solapes = [];
      for (let i = 0; i < hojas.length; i++) for (let j = i + 1; j < hojas.length; j++) { const a = hojas[i], c = hojas[j]; if (a.contains(c) || c.contains(a)) continue; const x = a.getBoundingClientRect(), y = c.getBoundingClientRect(); const ox = Math.min(x.right, y.right) - Math.max(x.left, y.left), oy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top); if (ox > 6 && oy > 6) solapes.push(`${nm(a)} × ${nm(c)} (${Math.round(ox)}×${Math.round(oy)})`); }
      const fuera = hojas.filter((e) => { const a = e.getBoundingClientRect(); return a.right > innerWidth + 1 || a.bottom > innerHeight + 1 || a.left < -1; }).map(nm);
      return { controles: hojas.length, solapes, fuera };
    });
    result.tamanos[n] = r; if (r.solapes.length || r.fuera.length || r.controles < 3) result.ok = false;
    await ctx.close();
  }
} catch (e) { result.error = String(e).split("\n")[0]; result.ok = false; }
await browser.close();
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
