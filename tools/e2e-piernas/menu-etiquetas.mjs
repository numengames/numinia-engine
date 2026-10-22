// e2e leg «menu-etiquetas»: on a phone (4 sizes) every label of the «…» menu fits inside its own button (±0.5 px).
// Reads BASE (?webgl2&server=…) like the other legs. Exit 0 only when no label spills out of its button.
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
  for (const [n, w, h, d] of [["320x568", 320, 568, 1], ["360x740", 360, 740, 2], ["390x844", 390, 844, 3], ["568x320", 568, 320, 1]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
    await sleep(2000);
    await (await p.$("#mas")).tap();
    await sleep(700);
    const r = await p.evaluate(() => {
      const desborda = [], botones = [...document.querySelectorAll("#mas-menu button")].filter((b) => b.getBoundingClientRect().width > 0);
      for (const b of botones) {
        const a = b.getBoundingClientRect(), walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          if (!t.textContent.trim() || t.parentElement.closest(".solo-lector")) continue; // screen-reader-only text is 1 px on purpose
          const rg = document.createRange(); rg.selectNodeContents(t);
          for (const rc of rg.getClientRects()) if (rc.width > 0 && (rc.left < a.left - 0.5 || rc.right > a.right + 0.5)) desborda.push(`${t.textContent.trim().slice(0, 20)} (${Math.round(rc.width)} px en un botón de ${Math.round(a.width)})`);
        }
      }
      return { botones: botones.length, desborda: [...new Set(desborda)] };
    });
    result.tamanos[n] = r; if (r.desborda.length || r.botones < 6) result.ok = false;
    await ctx.close();
  }
} catch (e) { result.error = String(e).split("\n")[0]; result.ok = false; }
await browser.close();
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
