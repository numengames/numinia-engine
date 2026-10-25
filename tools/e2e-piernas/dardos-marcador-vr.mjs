// e2e leg (dardos en VR, historia v6): the scoreboard beside the board, the change of turn and the dart held tip-forward, in
// the IWER Quest 3 emulator (Pablo, Quest 3S, 2026-10-21: «no salen las puntuaciones», «no sé cómo pasar turno», el dardo «sale
// amorfo, como al revés»). Walks to the line, presses E (a solo turn), enters VR, then:
//  1. the panel hangs beside the board: «Te toca · 3 dardos», one row «Tú 0», letters ≥ 1,2° at 3 m.
//  2. the right grip takes a dart and the controller is aimed at the board's middle: the held dart points WHERE THE CONTROLLER POINTS
//     (its tip is ahead of the hand, the flights behind: the tip is the end nearer the board), held by the tail (~9,5 cm behind the tip).
//     The same with the controller tilted up and turned aside (a fixed offset would only be right in one pose).
//  3. three darts (the agent route: `dardos.lanzar`) → the panel counts down («Te toca · 2 dardos», «1 dardo»), shows the last dart
//     («Triple 20 · 60»…) and the turn's points, then «Turno acabado» and a button «Otro turno».
//  4. the right ray on that button + the trigger starts a new turn: the panel is «Te toca · 3 dardos» again, 0 points.
//  CANVAS=<dir> writes the panel's canvases there (solo, fin, and the duel states painted with the same code: your turn, the
//  other's turn, «Pasar turno», waiting + «Empezar», end) — IWER draws the scene poorly, so the pictures are the canvases.
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE, CANVAS. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");
const CANVAS = process.env.CANVAS ?? "";
const MODULO = "/@fs" + new URL("../../packages/render/src/dardos-marcador.ts", import.meta.url).pathname; // vite serves files outside its root under /@fs

async function pierna() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const errors = [], r = { ok: false, pasos: [] };
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    // put the right controller at a WORLD point (its position is local to the rig) and aim it at another world point
    globalThis.__poner = (w) => { const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right; c.position.set(w[0] - r.x, w[1] - r.y, w[2] - r.z); };
    globalThis.__apuntar = (w, rollo = 0) => {
      const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right, p = c.position;
      const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
      c.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
    };`);
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok: !!ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  const ctl = (code, arg) => a.evaluate(code, arg);
  const esperar = (fn, arg, ms = 10000) => a.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const boton = (b, nombre, v) => a.evaluate(([b, nombre, v]) => globalThis.__iwer.controllers[b].updateButtonValue(nombre, v), [b, nombre, v]);
  const marc = () => ctl(() => { const m = globalThis.__numinia.view.dardosVR.real().marcador.estado(); return { visible: m.visible, sitio: m.sitio, fase: m.marcador?.fase, pie: m.marcador?.pie, nota: m.marcador?.nota, boton: m.marcador?.boton, filas: m.marcador?.filas.map((f) => [f.nombre, f.puntos]) }; });
  const yo = () => ctl(() => globalThis.__numinia.session.selfPosition(1));
  const guardar = async (nombre, expr, arg) => {
    if (!CANVAS) return;
    const url = await ctl(expr, arg);
    mkdirSync(CANVAS, { recursive: true });
    writeFileSync(`${CANVAS}/${nombre}.png`, Buffer.from(url.split(",")[1], "base64"));
  };
  const lienzo = (nombre) => guardar(nombre, () => globalThis.__numinia.view.dardosVR.real().marcador.lienzo().toDataURL("image/png"));
  async function caminar(x, z, cerca = 0.8, maxMs = 40000) {
    const t = Date.now(); let d = Infinity;
    while (Date.now() - t < maxMs) {
      const me = await yo(), dx = x - me.x, dz = z - me.z; d = Math.hypot(dx, dz);
      if (d <= cerca) break;
      const held = [];
      if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
      if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
      const corre = Math.max(Math.abs(dx), Math.abs(dz)) > 3;
      if (corre) held.unshift("Shift");
      const ms = Math.max(90, Math.min(1500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / (corre ? 4 : 1.5)) * 1000));
      for (const k of held) await a.keyboard.down(k);
      await a.waitForTimeout(ms);
      for (const k of held) await a.keyboard.up(k);
      await a.waitForTimeout(120);
    }
    return d;
  }
  try {
    await a.goto(BASE);
    paso("la página arranca", await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 40000));
    await esperar(() => globalThis.__numinia.session.features.cards().some((c) => c.feature === "dardos"), null, 15000);
    await esperar(() => !!globalThis.__numinia.view.dardos.linea("diana"), null, 15000);
    const l = await ctl(() => globalThis.__numinia.view.dardos.linea("diana"));
    await caminar(l.x, l.z);
    await esperar(() => /dardos/i.test(document.getElementById("interactuar")?.textContent ?? ""), null, 8000);
    await a.keyboard.press("KeyE");
    paso("E abre la tirada", await esperar(() => globalThis.__numinia.dardos.tirando(), null, 8000));
    await esperar(() => !!globalThis.__numinia.dardosHud?.vr(), null, 15000);
    await esperar(() => document.getElementById("vr").getAttribute("aria-disabled") !== "true", null, 15000).catch(() => {}); // MIS-200 (t_9687b5fc): the entry says «Preparando…» until the world has loaded
    await ctl(() => document.getElementById("vr").click());
    paso("entra en VR", await esperar(() => globalThis.__numinia.view.vr.active, null, 15000));
    await esperar(() => globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000);
    const c = await ctl(() => globalThis.__numinia.view.dardosVR.real().cara("diana"));
    paso("la cara de la diana existe", !!c, { c });

    // 1. the panel is beside the board, readable, with my solo turn
    paso("el marcador aparece junto a la diana", await esperar(() => globalThis.__numinia.view.dardosVR.real().marcador.estado().visible, null, 5000), await marc());
    let m = await marc();
    paso("«Te toca · 3 dardos» y una fila «Tú 0»", m.fase === "solo" && m.pie === "Te toca · 3 dardos" && m.filas?.[0]?.join() === "Tú,0" && m.boton === null, m);
    const geom = await ctl(() => {
      const mc = globalThis.__numinia.view.dardosVR.real().marcador, p = mc.panel.malla, v = new p.position.constructor();
      p.updateMatrixWorld(true); p.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z, ancho: p.geometry.parameters.width * p.scale.x, alto: p.scale.y };
    });
    const eye = await yo();
    const dist = Math.hypot(geom.x - eye.x, geom.z - eye.z);
    // the smallest letter is 58 px of a canvas drawn at 640 px per metre: its cap height (0.72) seen from m metres
    const grados = (m) => (2 * Math.atan((58 * 0.72 / 640) / (2 * m)) * 180) / Math.PI;
    paso("las letras se leen: la más pequeña mide ≥ 1,2° a 3 m", grados(3) >= 1.2, { a3m: Math.round(grados(3) * 100) / 100, aLaDistanciaDelJugador: Math.round(grados(Math.max(dist, 0.5)) * 100) / 100, dist: Math.round(dist * 100) / 100, ancho: Math.round(geom.ancho * 100) / 100 });
    paso("el marcador está al lado de la diana (no encima) y a la altura de la vista", Math.hypot(geom.x - c.c[0], geom.z - c.c[2]) > 0.6 && geom.y > 1 && geom.y < 3, { geom, cara: c.c });
    await a.waitForTimeout(300); await lienzo("solo-3-dardos");

    // 2. the held dart points where the controller points (two poses), held by the tail
    const base = [c.c[0] + c.n[0] * 2.5, c.c[1] - 0.2, c.c[2] + c.n[2] * 2.5];
    const diana = { x: c.c[0], y: c.c[1], z: c.c[2] };
    await ctl(([p]) => globalThis.__poner(p), [base]);
    await ctl((w) => globalThis.__apuntar(w), diana); await a.waitForTimeout(250);
    await boton("right", "squeeze", 1); await a.waitForTimeout(400);
    const comprobar = async (nombre, objetivo) => {
      const q = await ctl((o) => { const d = globalThis.__numinia.view.dardosVR.real(), h = d.mano(), p = d.posicion("der"); return { h, p }; }, objetivo);
      paso(`${nombre}: hay un dardo en la mano`, !!q.h, q);
      const t = [objetivo.x - q.p[0], objetivo.y - q.p[1], objetivo.z - q.p[2]], n = Math.hypot(...t), u = t.map((x) => x / n);
      const dot = u[0] * q.h.dir[0] + u[1] * q.h.dir[1] + u[2] * q.h.dir[2];
      const cola = Math.hypot(q.h.punta[0] - q.h.agarre[0], q.h.punta[1] - q.h.agarre[1], q.h.punta[2] - q.h.agarre[2]);
      const haciaDiana = (q.h.punta[0] - q.h.agarre[0]) * u[0] + (q.h.punta[1] - q.h.agarre[1]) * u[1] + (q.h.punta[2] - q.h.agarre[2]) * u[2];
      paso(`${nombre}: la punta mira hacia donde apunta el mando (cos ≥ 0,995)`, dot >= 0.995, { dot, dir: q.h.dir, hacia: u });
      paso(`${nombre}: la punta va DELANTE de la mano y se coge por la cola (9,5 cm de la punta)`, haciaDiana > 0.09 && Math.abs(cola - 0.095) < 0.006, { cola, haciaDiana });
    };
    await comprobar("mando recto a la diana", diana);
    await ctl((w) => globalThis.__apuntar(w), { x: diana.x + 1.2, y: diana.y + 0.9, z: diana.z }); await a.waitForTimeout(250);
    await comprobar("mando girado a un lado y hacia arriba", { x: diana.x + 1.2, y: diana.y + 0.9, z: diana.z });
    await boton("right", "squeeze", 0); await a.waitForTimeout(300);
    paso("soltar el agarre sin impulso deja el dardo (cae y se retira)", await esperar(() => globalThis.__numinia.view.dardosVR.contar()?.enMano === null, null, 4000));
    await ctl((w) => globalThis.__apuntar(w), diana);

    // 3. three darts: the panel counts them down, shows the last one and the turn's points, then says «Turno acabado»
    const lanzar = (x, y, f) => ctl(([x, y, f]) => globalThis.__numinia.dardos.lanzar(x, y, f, "diana"), [x, y, f]);
    const e0 = await ctl(() => { const e = globalThis.__numinia.dardos.estado(); return { sitio: e.sitio, dardos: e.dardos }; });
    paso("sigue en mi turno con 0 dardos tirados", e0.sitio === "diana" && e0.dardos === 0, e0);
    await lanzar(0, 0, 0.62);
    paso("tras el 1.º: «Te toca · 2 dardos», el dardo y los puntos", await esperar(() => { const m = globalThis.__numinia.view.dardosVR.real().marcador.estado().marcador; return m?.pie === "Te toca · 2 dardos" && m.nota && m.filas[0].puntos > 0; }, null, 5000), await marc());
    await a.waitForTimeout(300); await lienzo("solo-1-dardo");
    await lanzar(0, 0, 0.62);
    paso("tras el 2.º: «Te toca · 1 dardo»", await esperar(() => globalThis.__numinia.view.dardosVR.real().marcador.estado().marcador?.pie === "Te toca · 1 dardo", null, 5000), await marc());
    const pts2 = (await marc()).filas[0][1];
    await lanzar(0, 0, 0.62);
    paso("tras el 3.º: «Turno acabado» con «Otro turno» y los puntos de la tirada", await esperar(() => { const m = globalThis.__numinia.view.dardosVR.real().marcador.estado().marcador; return m?.fase === "fin-solo" && m.boton === "otra"; }, null, 6000), await marc());
    m = await marc();
    paso("los puntos de la tirada suman los tres dardos", m.filas[0][1] >= pts2, { m, pts2 });
    await a.waitForTimeout(300); await lienzo("solo-fin");

    // 4. the ray on «Otro turno» + the trigger starts a new turn
    const bm = await ctl(() => globalThis.__numinia.view.dardosVR.real().marcador.botonMundo());
    paso("el botón tiene sitio en el mundo", !!bm, { bm });
    await ctl(([p]) => globalThis.__poner(p), [base]);
    await ctl((w) => globalThis.__apuntar(w), bm); await a.waitForTimeout(350);
    await a.waitForTimeout(150); await lienzo("solo-fin-rayo-sobre-boton");
    await boton("right", "trigger", 1); await a.waitForTimeout(100); await boton("right", "trigger", 0);
    paso("rayo + gatillo en «Otro turno» abre un turno nuevo",
      await esperar(() => { const e = globalThis.__numinia.dardos.estado(), mm = globalThis.__numinia.view.dardosVR.real().marcador.estado().marcador; return e.sitio === "diana" && e.dardos === 0 && mm?.fase === "solo" && mm.pie === "Te toca · 3 dardos"; }, null, 6000),
      { m: await marc(), e: await ctl(() => { const e = globalThis.__numinia.dardos.estado(); return { sitio: e.sitio, dardos: e.dardos, aviso: e.aviso }; }) });

    // 5. the duel states, painted by the same code (pictures only; the words are asserted in test/dardos-marcador.test.ts)
    if (CANVAS) {
      const ana = { entity: 5, nombre: "Ana", puntos: 41, yo: true }, luis = { entity: 7, nombre: "Luis", puntos: 28 };
      const duelo = (o) => ({ sitio: "diana", ronda: 2, esperando: false, turnoDe: 5, yo: true, miTurno: true, rival: luis, yoPuntos: 41, a: ana, b: luis, fin: null, equipos: [ana, luis], retirando: false, puedeCambiar: true, ...o });
      const solo = (dardos, ultimo) => ({ sitio: "diana", dardos, tirada: 60 * dardos, ultimo, fin: null });
      const casos = {
        "duelo-tu-turno": [solo(1, { texto: "Triple 20 · 60", puntos: 60 }), duelo({})],
        "duelo-pasar-turno": [solo(3, { texto: "Doble 16 · 32", puntos: 32 }), duelo({ retirando: true })],
        "duelo-turno-de-otro": [{ sitio: "", dardos: 0, tirada: 0, ultimo: null, fin: null }, duelo({ miTurno: false, turnoDe: 7 })],
        "duelo-esperando-empezar": [{ sitio: "", dardos: 0, tirada: 0, ultimo: null, fin: null }, duelo({ esperando: true, ronda: 0, turnoDe: null, puedeEmpezar: true })],
        "duelo-fin": [{ sitio: "", dardos: 0, tirada: 0, ultimo: null, fin: null }, duelo({ fin: { ganador: 5, empate: false, abandono: false, texto: "Gana Ana 90-60", gane: true } })],
      };
      for (const [nombre, [s, d]] of Object.entries(casos)) {
        await guardar(nombre, async ([s, d, ruta]) => {
          const mod = await import(/* @vite-ignore */ ruta);
          const mm = mod.marcadorDe({ solo: s, duelo: d, rondas: 3, ahora: 0 });
          const cv = document.createElement("canvas"); cv.width = mod.ANCHO_PX; cv.height = mod.disposicion(mm).alto;
          mod.pintarMarcador(cv.getContext("2d"), mm); return cv.toDataURL("image/png");
        }, [s, d, MODULO]);
      }
    }
    await ctl(() => globalThis.__numinia.view.vr.exit());
    await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000);
    r.ok = errors.length === 0;
  } catch (e) {
    r.error = String(e).split("\n")[0].slice(0, 600);
  } finally {
    r.errors = errors;
    await browser.close();
  }
  return r;
}

const resultado = await pierna();
console.log(JSON.stringify(resultado, null, 1));
console.log(resultado.ok ? "E2E DARDOS-MARCADOR-VR OK" : "E2E DARDOS-MARCADOR-VR FALLA");
process.exit(resultado.ok ? 0 : 1);
