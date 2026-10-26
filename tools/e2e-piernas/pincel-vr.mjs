// e2e leg (MIS-222 t_1b395abe, J18b story 4 second slice): tab A is in VR (IWER, Quest 3) and PAINTS WITH THE CONTROLLER: the emulated right controller's trigger held
// and its tip moved draws a live tube under the hand (ONE draw call, capped points), letting go of the trigger saves the stroke (pincel.ts → PUT /a/ → colocar) and tab B (a flat tab,
// same world) downloads it and its picture shows the stroke's colour. Also: B (the cancel button) throws a stroke away and nothing reaches B; a slip of the finger is no line.
// (First slice, kept below the header: the same save from code.) Starts its own server (8921, as a world
// that lets guests build) and page (5321) on spare ports, empty data folder. Tab A uploads a `trazo@1` file (the same PUT /a/<sha>.trazo the
// brush will do) and places it as an `objetos` thing of kind «trazo» in front of tab B's avatar; B must download the file, build the tube
// (`view.objects().loaded` goes up, `failed` stays 0) and its picture must show the stroke's colour where the stroke is (a pixel test on the
// canvas: not the same picture without it). Then A deletes it and B's picture goes back. No upload of a broken stroke is drawn (failed, never thrown).
// Env: SHOTS=<folder> saves pictures; E2E_SERVER_PORT / E2E_VITE_PORT. Exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8921), VP = Number(process.env.E2E_VITE_PORT ?? 5321);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-trazo-vr-"));
cpSync(join(REPO, "aventuras/ejemplo"), join(tmp, "aventura"), { recursive: true });

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: false }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), AVENTURA_DIR: join(tmp, "aventura"), DATOS_DIR: join(tmp, "datos"), SESIONES_DIR: join(tmp, "sesiones"), MOTOR_CONSTRUIR: "todos" }, "server");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/status`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const out = {}, checks = {}, errors = [];
let ok = false;
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("numinia.novedades.version", "99.0.0"); } catch {} });
  const open = async (nombre) => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${nombre}: ${e}`));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
    return p;
  };
  const IWER = (await import("node:fs")).readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");
  const ctxA = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctxA.addInitScript(() => { try { localStorage.setItem("numinia.novedades.version", "99.0.0"); } catch {} });
  await ctxA.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;`);
  const openA = async () => {
    const p = await ctxA.newPage();
    p.on("pageerror", (e) => errors.push(`A: ${e}`));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
    return p;
  };
  const a = await openA(), b = await open("B");
  await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && !!localStorage.getItem("numinia.invitado"), null, { timeout: 15000 });
  await b.bringToFront();
  // where B stands: strokes go 2.5 m from it in the four directions (one is where its camera looks), at eye height
  const cam = await b.evaluate(() => ({ p: globalThis.__numinia.session.selfPosition(1) }));

  // pictures: B's canvas before and after; the stroke's amber (#EFA517) must appear
  // a canvas read-back of a WebGL canvas comes back empty, so the picture is the page's screenshot, decoded in the page and counted
  const pixeles = async (p) => {
    const png = (await p.screenshot()).toString("base64");
    return p.evaluate(async (png) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let ambar = 0;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], gr = d[i + 1], bl = d[i + 2]; if (r > 170 && gr > 100 && gr < 210 && bl < 80 && r - bl > 110) ambar++; }
      return { w: bmp.width, h: bmp.height, ambar };
    }, png);
  };
  const esperarA = (fn, arg, ms = 15000) => a.waitForFunction(fn, arg, { timeout: ms });
  await esperarA(() => document.getElementById("vr").getAttribute("aria-disabled") !== "true", null, 20000).catch(() => {});
  await a.evaluate(() => document.getElementById("vr").click());
  await esperarA(() => globalThis.__numinia.view.vr.active, null, 20000);
  await esperarA(() => globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 25000);
  await a.waitForTimeout(500);
  checks.enVR = true;
  // the mode: refused outside the menu's rules? here the world lets guests build, so it enters; the hand is the brush's
  await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("trigger", 1)); await a.waitForTimeout(300); // the press that chose the menu row is still down
  const entro = await a.evaluate(() => { const n = globalThis.__numinia; return { r: n.pintarVR.entrar(), ocupada: n.view.manos.estado().der }; });
  out.entrada = entro; checks.entra = entro.r.ok === true;
  await a.waitForTimeout(600); // the live-tube chunk loads (lazy)
  const bloqueado = await a.evaluate(() => globalThis.__numinia.pintarVR.estado());
  await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("trigger", 0)); await a.waitForTimeout(300);

  // controller helpers: the controller's position is local to the rig; a world point is rig + local
  const rig = await a.evaluate(() => { const p = globalThis.__numinia.view.vr.rig.position; return { x: p.x, y: p.y, z: p.z }; });
  out.rig = rig;
  const mover = (w) => a.evaluate((w) => { const r = globalThis.__numinia.view.vr.rig.position; globalThis.__iwer.controllers.right.position.set(w.x - r.x, w.y - r.y, w.z - r.z); }, w);
  const gatillo = (v) => a.evaluate((v) => globalThis.__iwer.controllers.right.updateButtonValue("trigger", v), v);
  const vivo = () => a.evaluate(() => ({ ...globalThis.__numinia.view.pincelVR.contar(), est: globalThis.__numinia.pintarVR.estado() }));
  // one stroke: a sine wave 0.9 m wide at `c` (world), the trigger pressing harder along it; `soltar` false = keep holding at the end
  const trazar = async (c, { pasos = 60, soltar = true, ms = 55 } = {}) => {
    await gatillo(0); await mover({ x: c.x - 0.45, y: c.y, z: c.z }); await a.waitForTimeout(250);
    await gatillo(0.5); await a.waitForTimeout(150);
    let calls = 0, maxTri = 0;
    for (let i = 0; i < pasos; i++) {
      const t = i / (pasos - 1);
      await mover({ x: c.x + (t - 0.5) * 0.9, y: c.y + Math.sin(t * 11) * 0.15, z: c.z });
      await gatillo(0.5 + 0.5 * t);
      await a.waitForTimeout(ms);
      if (i % 10 === 5) { const v = await vivo(); calls = Math.max(calls, v.llamadas); maxTri = Math.max(maxTri, v.triangulos); }
    }
    const durante = await vivo();
    if (soltar) { await gatillo(0); await a.waitForTimeout(300); }
    return { calls, maxTri, durante };
  };

  const yo = cam.p, antes0 = await b.evaluate(() => globalThis.__numinia.view.objects());
  await b.waitForFunction(() => { const o = globalThis.__numinia.view.objects(); return o.placed > 0 && o.loaded + o.failed >= o.placed; }, null, { timeout: 40000 }).catch(() => {});
  await b.waitForTimeout(800);
  const px0 = await pixeles(b); out.pixelesAntes = px0;
  const placed0 = (await b.evaluate(() => [...globalThis.__numinia.session.features.stateOf("objetos")].filter(([, v]) => v.kind === "trazo" || v.tipo === "trazo").length));

  // 0. the live tube DRAWS (a picture of it, not only numbers): tab B (flat) feeds the live mesh the same sine wave at the four places and counts amber
  //    — the tube grown point by point, with the tip marker, in one draw call; then it is switched off (B's later picture must be clean again)
  await b.bringToFront();
  const vivoB = [];
  for (const [dx, dz] of [[0, -2.5], [0, 2.5], [2.5, 0], [-2.5, 0]]) {
    await b.evaluate(async ({ x0, y0, z0 }) => {
      const pv = globalThis.__numinia.view.pincelVR, v = await pv.cargar(); v.apagar(); v.empezar(2, 0.06);
      for (let i = 0; i < 40; i++) { const t = i / 39; v.anadir([x0 + (t - 0.5) * 0.9, y0 + Math.sin(t * 11) * 0.15, z0, 0.5 + 0.5 * t]); }
      v.seguir([x0 + 0.5, y0, z0, 1]); pv.actualizar(0);
    }, { x0: yo.x + dx, y0: 1.3, z0: yo.z + dz });
    await b.waitForTimeout(500);
    const px = await pixeles(b), c = await b.evaluate(() => globalThis.__numinia.view.pincelVR.contar());
    vivoB.push({ dx, dz, ambar: px.ambar, llamadas: c.llamadas, triangulos: c.triangulos });
  }
  await b.evaluate(() => { globalThis.__numinia.view.pincelVR.real()?.apagar(); globalThis.__numinia.view.pincelVR.actualizar(0); });
  out.tuboVivoEnB = vivoB;
  checks.tuboVivoSePinta = vivoB.every((v) => v.ambar > px0.ambar + 20) && vivoB.every((v) => v.llamadas === 1 && v.triangulos > 300);
  if (SHOTS) await b.screenshot({ path: `${SHOTS}/pincel-vr-vivo-b.png` });
  await a.bringToFront();

  // 1. the tip shows between strokes (just the marker) and the press that chose the menu row starts nothing
  out.bloqueado = bloqueado.pintando;
  const punta = await vivo(); out.punta = punta;
  checks.puntaSinTrazo = punta.est.modo === true && punta.est.pintando === false && punta.visible === true && punta.llamadas === 1 && bloqueado.pintando === false && bloqueado.bloqueado === true;

  // 2. a SLIP of the finger: a tap that hardly moves paints nothing and sends nothing
  await mover({ x: yo.x, y: 1.3, z: yo.z - 2.5 }); await a.waitForTimeout(200);
  await gatillo(1); await a.waitForTimeout(200); await gatillo(0); await a.waitForTimeout(400);
  const rozado = await vivo(); out.rozado = rozado.est;
  checks.rozeNoEsLinea = rozado.est.tirados >= 1 && rozado.est.trazos === 0;

  // 3. THROWN AWAY: a stroke is started, the cancel (B) arrives: the live tube goes and nothing is sent
  const tirado = await trazar({ x: yo.x, y: 1.3, z: yo.z - 2.5 }, { soltar: false, pasos: 30 });
  const mientras = tirado.durante;
  out.mientrasTirar = mientras;
  checks.vivoMientrasPinta = mientras.est.pintando && mientras.puntos >= 8 && mientras.triangulos > 100 && mientras.llamadas === 1 && tirado.calls === 1;
  await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("b-button", 1)); await a.waitForTimeout(200); await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("b-button", 0)); await a.waitForTimeout(100);
  const trasB = await vivo(); await gatillo(0); await a.waitForTimeout(300);
  out.trasB = trasB;
  checks.bTiraElTrazo = trasB.est.pintando === false && trasB.est.tirados >= 2 && trasB.puntos === 0;

  // 4. FOUR real strokes, one per direction around B (one is where its camera looks)
  out.ajuste = await a.evaluate(() => globalThis.__numinia.pintarVR.ajustar({ color: 2, grosor: 0.06 })); // a thick brush: visible from 2.5 m in a 640 px picture
  out.trazos = [];
  for (const [dx, dz] of [[0, -2.5], [0, 2.5], [2.5, 0], [-2.5, 0]]) {
    const t = await trazar({ x: yo.x + dx, y: 1.3, z: yo.z + dz });
    out.trazos.push({ dx, dz, calls: t.calls, maxTri: t.maxTri, puntos: t.durante.puntos });
    if (SHOTS && dx === 0 && dz === -2.5) await a.screenshot({ path: `${SHOTS}/pincel-vr-a-soltado.png` });
  }
  await esperarA(() => globalThis.__numinia.pintarVR.estado().pintar.trazos >= 4, null, 15000).catch(() => {});
  const pintado = await vivo(); out.tras = pintado;
  checks.unaLlamadaYTopes = out.trazos.every((t) => t.calls === 1 && t.maxTri > 150 && t.maxTri <= 9600 && t.puntos >= 20 && t.puntos <= 600);
  checks.guardadosEnA = pintado.est.trazos === 4 && pintado.est.pintar.trazos >= 4 && pintado.est.pintar.rechazados === 0;
  // the live tube stays as a ghost until the save is answered (+0.7 s) and is gone after: the world's tube takes its place
  await a.waitForTimeout(1500);
  const fantasmas = await vivo(); out.fantasmas = fantasmas;
  checks.fantasmaSeVa = fantasmas.fantasmas === 0 && fantasmas.llamadas === 1 /* only the tip marker */;

  // 5. B sees them: four placed, the file loaded, no failures; the amber appears in B's picture
  await b.bringToFront();
  await b.waitForFunction((n0) => globalThis.__numinia.view.objects().loaded >= n0 + 1, antes0.loaded, { timeout: 30000 }).catch(() => {});
  await b.waitForFunction(() => { const o = globalThis.__numinia.view.objects(); return o.loaded + o.failed >= o.placed; }, null, { timeout: 30000 }).catch(() => {});
  const tras = await b.evaluate(() => globalThis.__numinia.view.objects());
  out.objetosB = { antes: antes0, tras };
  checks.bCargaLosTrazos = tras.loaded >= antes0.loaded + 4 && tras.failed === antes0.failed;
  await b.waitForTimeout(800);
  const px = await pixeles(b); out.pixelesConTrazos = px;
  const colocados = await b.evaluate(() => [...globalThis.__numinia.session.features.stateOf("objetos")].filter(([, v]) => v.kind === "trazo" || v.tipo === "trazo").map(([id]) => id));
  out.trazosEnB = colocados.length; checks.bVeLosColocados = colocados.length - placed0 === 4;
  checks.ambarAparece = px.ambar > px0.ambar + 100;
  if (SHOTS) await b.screenshot({ path: `${SHOTS}/pincel-vr-b.png` });

  // 6. leaving the mode frees the hand and removes the marker
  const salida = await a.evaluate(() => { const n = globalThis.__numinia; n.pintarVR.salir(); return n.view.manos.estado().der; });
  await a.waitForTimeout(300);
  const sin = await vivo(); out.salida = sin;
  checks.saleLimpio = sin.est.modo === false && sin.visible === false;

  // delete the four (A): B's amber goes back
  for (const id of colocados) await a.evaluate((id) => globalThis.__numinia.constructor.borrarId(id), id);
  await b.waitForFunction((n) => globalThis.__numinia.view.objects().placed <= n, antes0.placed, { timeout: 15000 }).catch(() => {});
  await b.waitForTimeout(600);
  const px2 = await pixeles(b); out.pixelesSinTrazos = px2;
  checks.ambarVuelve = px2.ambar < px0.ambar + 30;
  checks.sinErrores = errors.length === 0;
  out.errors = errors;
  ok = Object.values(checks).every(Boolean);
} catch (e) { errors.push(String(e?.stack ?? e)); }
finally {
  out.checks = checks; out.ok = ok; out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close().catch(() => {});
  for (const { p, log, nombre } of procs) { if (!ok) console.error(`--- ${nombre} ---\n${log().slice(-2500)}`); p.kill("SIGTERM"); }
  rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
