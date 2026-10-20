// e2e leg N2 (settings and capabilities), chromium + firefox: O opens the menu; keyboard only (Tab + ArrowLeft) moves
// «Resolución» and the power policy's pixel ratio follows (renderer included); the status line says it; Escape closes;
// a reload keeps the value (applied before the first frame); B is kept like any other choice; O typed in a text box does
// not open it; agents get validation with paths; every control has a label; «Restablecer todo» (keyboard) restores; a
// browser that asks for reduced motion starts with «Menos movimiento» on (V7).
// No page errors. Leaves everything at the defaults. Receives BASE (and SERVER_HTTP, unused). Prints JSON; exit 0 = right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const BASE = BASE0 + (BASE0.includes("?") ? "&" : "?") + "pulso=2000";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
};
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox").split(",");

const listo = (p) => p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.ajustes, null, { timeout: 30000 });
const potencia = (p) => p.evaluate(() => {
  const n = globalThis.__numinia, pw = n.view.power;
  return { res: n.ajustes.get("graficos.resolucion"), pr: pw.pixelRatio(), renderer: n.view.renderer.getPixelRatio(), scale: pw.scale, statsRes: pw.stats.resolucion };
});
const abierto = (p) => p.evaluate(() => document.getElementById("ajustes").open);
async function tabHasta(p, id, max = 80) {
  for (let i = 1; i <= max; i++) {
    await p.keyboard.press("Tab");
    if (await p.evaluate((x) => document.activeElement?.id === x, id)) return i;
  }
  return -1;
}

async function pierna(engine) {
  const r = { engine, errors: [] };
  const browser = await launchers[engine]();
  try {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => r.errors.push(String(e)));
    await p.goto(BASE);
    await listo(p);
    r.capacidades = await p.evaluate(() => { const c = globalThis.__numinia.capacidades; return { nivel: c.nivel, backend: c.backend, movil: c.movil, maxTextura: c.maxTextura, menosMovimiento: c.menosMovimiento }; });
    r.ocultosSinContrato = await p.evaluate(() => globalThis.__numinia.ajustes.lista().filter((s) => !s.visible).map((s) => s.id));
    r.etiquetas = await p.evaluate(() => { // every control in the menu has a label and a description (screen readers)
      const cs = [...document.querySelectorAll("#ajustes-grupos input, #ajustes-grupos select")];
      return { controles: cs.length, sinEtiqueta: cs.filter((c) => !c.labels?.length).map((c) => c.id), sinDescripcion: cs.filter((c) => !c.getAttribute("aria-describedby")).map((c) => c.id) };
    });
    const antes = await potencia(p);
    r.antes = antes;
    // 1. O opens the bar's «Menú» (ux2-barra) with the focus on «Ajustes»; Enter opens it, focus inside
    await p.keyboard.press("KeyO");
    await p.waitForFunction(() => !document.getElementById("menu-lista").hidden && document.activeElement?.id === "ajustes-abrir", null, { timeout: 3000 });
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => document.getElementById("ajustes").open, null, { timeout: 3000 });
    r.abreConO = true;
    r.focoDentro = await p.evaluate(() => document.getElementById("ajustes").contains(document.activeElement));
    // 2. keyboard only: Tab to «Resolución», one step left
    await p.click('#ajustes nav button[data-cat="graficos"]'); // the window shows one category at a time
    r.tabsHastaResolucion = await tabHasta(p, "ajuste-graficos.resolucion");
    await p.keyboard.press("ArrowLeft");
    await p.waitForFunction(() => globalThis.__numinia.ajustes.get("graficos.resolucion") === 95, null, { timeout: 3000 });
    const despues = await potencia(p);
    r.despues = despues;
    const norm = (x) => x.pr / x.scale; // the dynamic resolution may move on its own: compare without it
    r.ratioCambia = despues.statsRes === 0.95 && despues.renderer === despues.pr && Math.abs(norm(despues) / norm(antes) - 0.95) < 0.011;
    await p.waitForTimeout(700); // the status waits 400 ms after a slider moves
    r.estado = await p.evaluate(() => document.getElementById("ajustes-estado").textContent);
    // 3. Escape closes
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !document.getElementById("ajustes").open, null, { timeout: 3000 });
    r.cierraConEscape = true;
    // 4. reload: kept, and applied before anything else reads it
    await p.reload();
    await listo(p);
    r.recargado = await potencia(p);
    r.guardado = await p.evaluate(() => JSON.parse(localStorage.getItem("numinia.ajustes") ?? "{}"));
    // 5. B toggles battery mode and is kept like any other choice; B again restores it
    await p.keyboard.press("KeyB");
    await p.waitForFunction(() => globalThis.__numinia.ajustes.get("graficos.bateria") === true, null, { timeout: 3000 }).catch(() => {});
    r.bateriaConB = await p.evaluate(() => ({ ajuste: globalThis.__numinia.ajustes.get("graficos.bateria"), power: globalThis.__numinia.view.power.battery }));
    await p.keyboard.press("KeyB");
    await p.waitForFunction(() => globalThis.__numinia.ajustes.get("graficos.bateria") === false, null, { timeout: 3000 }).catch(() => {});
    r.bateriaOtraVez = await p.evaluate(() => globalThis.__numinia.ajustes.get("graficos.bateria"));
    // 6. O typed in a text box does not open it (the chat box, an inspector…)
    await p.evaluate(() => { const i = document.createElement("input"); i.id = "prueba-texto"; document.body.append(i); i.focus(); });
    await p.keyboard.press("KeyO");
    await p.waitForTimeout(200);
    r.oEscribiendoAbre = (await abierto(p)) || (await p.evaluate(() => !document.getElementById("menu-lista").hidden));
    await p.evaluate(() => { document.getElementById("prueba-texto")?.remove(); document.activeElement?.blur?.(); });
    // 7. agents: validation with paths, never a throw
    r.agente = await p.evaluate(() => globalThis.__numinia.ajustes.set("graficos.resolucion", 3));
    // 8. «Restablecer todo» with the keyboard (O → «Menú», Enter → «Ajustes»)
    await p.keyboard.press("KeyO");
    await p.waitForFunction(() => document.activeElement?.id === "ajustes-abrir", null, { timeout: 3000 });
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => document.getElementById("ajustes").open, null, { timeout: 3000 });
    r.tabsHastaRestablecer = await tabHasta(p, "ajustes-restablecer", 120);
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => globalThis.__numinia.ajustes.get("graficos.resolucion") === 100, null, { timeout: 3000 }).catch(() => {});
    await p.waitForFunction(() => /restablecidos/.test(document.getElementById("ajustes-estado").textContent), null, { timeout: 3000 }).catch(() => {});
    r.restablecido = await potencia(p);
    r.estadoFinal = await p.evaluate(() => document.getElementById("ajustes-estado").textContent);
    // the version at the foot of the settings: «v<major.minor.patch>» from package.json, no brand (docs/VERSIONES.md)
    r.version = await p.evaluate(() => document.getElementById("version-motor")?.textContent ?? "");
    await p.keyboard.press("Escape");
    r.guardadoFinal = await p.evaluate(() => JSON.parse(localStorage.getItem("numinia.ajustes") ?? "{}"));
    await p.evaluate(() => globalThis.__numinia.ajustes.restablecer()); // leave it as it was found
    // 9. the system's preference (V7): a browser that asks for reduced motion starts with «Menos movimiento» on
    const ctx2 = await browser.newContext({ viewport: { width: 480, height: 300 }, reducedMotion: "reduce" });
    const q = await ctx2.newPage();
    q.on("pageerror", (e) => r.errors.push(String(e)));
    await q.goto(BASE);
    await listo(q);
    r.sistemaMenosMovimiento = await q.evaluate(() => ({ capacidad: globalThis.__numinia.capacidades.menosMovimiento, ajuste: globalThis.__numinia.ajustes.get("accesibilidad.menosMovimiento"), clase: document.documentElement.classList.contains("menos-movimiento") }));
    await ctx2.close();
  } catch (e) { r.fallo = String(e).split("\n")[0]; }
  await browser.close();
  r.ok = !r.fallo && r.abreConO && r.focoDentro && r.tabsHastaResolucion > 0 && r.ratioCambia && /Resolución: 95 %/.test(r.estado ?? "") && r.cierraConEscape
    && r.recargado?.res === 95 && r.recargado?.statsRes === 0.95 && r.guardado?.valores?.["graficos.resolucion"] === 95
    && r.bateriaConB?.ajuste === true && r.bateriaConB?.power === true && r.bateriaOtraVez === false && r.oEscribiendoAbre === false
    && r.agente?.ok === false && r.agente?.issues?.[0]?.path === "graficos.resolucion"
    && r.tabsHastaRestablecer > 0 && r.restablecido?.res === 100 && r.restablecido?.statsRes === 1 && /restablecidos/.test(r.estadoFinal ?? "") && /^v\d+\.\d+\.\d+$/.test(r.version ?? "")
    && r.etiquetas?.controles > 0 && r.etiquetas.sinEtiqueta.length === 0 && r.etiquetas.sinDescripcion.length === 0
    && r.sistemaMenosMovimiento?.capacidad === true && r.sistemaMenosMovimiento?.ajuste === true && r.sistemaMenosMovimiento?.clase === true
    && r.errors.length === 0;
  return r;
}

const out = [];
for (const e of ENGINES) out.push(await pierna(e));
console.log(JSON.stringify(out, null, 1));
const ok = out.every((r) => r.ok);
console.log(ok ? "E2E AJUSTES OK" : "E2E AJUSTES FALLA");
process.exit(ok ? 0 : 1);
