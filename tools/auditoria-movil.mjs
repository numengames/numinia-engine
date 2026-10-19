// Auditoría UI móvil (N1/P2/U10/U11): abre la plaza con Playwright en viewport móvil (iPhone 390x844,
// Android 412x915), emulación táctil, y hace capturas de HUD, barra de iconos, minimapa, libro de misiones,
// ajustes y chat. Uso: node tools/auditoria-movil.mjs [antes|despues]
// Necesita: npm run server (puerto PORT, por defecto 8791) y npm run dev (PLAZA_SERVER_PORT=8791 PLAZA_PORT=5174).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5174/?webgl2&server=ws://127.0.0.1:8791/ws";
const TAG = process.argv[2] ?? "capturas"; // "antes" | "despues"
const OUT = new URL(`../docs/auditoria-movil/${TAG}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const DEVICES = [
  { name: "iphone", width: 390, height: 844, dpr: 3 },
  { name: "android", width: 412, height: 915, dpr: 2.6 },
];

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  await page.waitForTimeout(500);

  const shot = async (label) => page.screenshot({ path: `${OUT}${d.name}-${label}.png` });

  // 1) HUD inicial: barra de iconos, minimapa, libro de misiones cerrado, ayuda, acciones
  await shot("01-hud");

  // 2) Botones de acción táctiles (Saltar, correr) medidos
  const tamanos = await page.evaluate(() => {
    const out = {};
    for (const sel of ["#menu-abrir", "#misiones", "#saltar", "#minimapa canvas", "#misiones", "#chat-boton", "#interactuar", "#construir", "#microfono", "#pantalla"]) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = null; continue; }
      const r = el.getBoundingClientRect();
      out[sel] = { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), right: Math.round(window.innerWidth - r.right), bottom: Math.round(window.innerHeight - r.bottom) };
    }
    return out;
  });
  console.log(`[${d.name}] tamaños:`, JSON.stringify(tamanos));

  // 3) Simular un toque de movimiento en la zona inferior izquierda (joystick virtual) y comprobar solapes
  const touchPoint = { x: Math.round(d.width * 0.22), y: Math.round(d.height * 0.78) };
  await page.touchscreen.tap(touchPoint.x, touchPoint.y);
  await page.mouse.move(touchPoint.x, touchPoint.y); // deja el joystick visible para la foto
  await page.evaluate(([x, y]) => {
    const ev = new PointerEvent("pointerdown", { pointerId: 101, pointerType: "touch", clientX: x, clientY: y, bubbles: true });
    window.dispatchEvent(ev);
  }, [touchPoint.x, touchPoint.y]);
  await page.waitForTimeout(150);
  await shot("02-joystick");
  await page.evaluate((x) => {
    const ev = new PointerEvent("pointerup", { pointerId: 101, pointerType: "touch", clientX: x, bubbles: true });
    window.dispatchEvent(ev);
  }, touchPoint.x);

  // 4) Libro de misiones abierto
  await page.click("#misiones");
  await page.waitForTimeout(200);
  await shot("03-misiones");
  await page.click("#misiones");
  await page.waitForTimeout(100);

  // 5) Menú de ajustes abierto
  await page.click("#menu-abrir"); await page.click("#ajustes-abrir"); // ux2-barra: «Ajustes» lives in the bar's «Menú»
  await page.waitForTimeout(200);
  await shot("04-ajustes");
  await page.click("#ajustes-cerrar");
  await page.waitForTimeout(100);

  // 6) Chat abierto
  const chatBtn = await page.$("#chat-boton");
  if (chatBtn && await chatBtn.isVisible()) { await chatBtn.click(); await page.waitForTimeout(150); }
  await shot("05-chat");

  // 7) Minimapa: comprobar si su zona se solapa con la zona de toque de movimiento (bottom-left)
  const solape = await page.evaluate(() => {
    const mini = document.querySelector("#minimapa"); if (!mini) return null;
    const r = mini.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, innerW: window.innerWidth, innerH: window.innerHeight };
  });
  console.log(`[${d.name}] minimapa rect:`, JSON.stringify(solape));

  await ctx.close();
}

await browser.close();
console.log(`Capturas en ${OUT}`);
