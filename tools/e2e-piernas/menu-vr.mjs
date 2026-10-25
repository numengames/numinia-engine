// e2e leg rediseño v2 story E (the VR wrist watch and menu, maquetas p6/p7): page A enters VR with IWER (Quest 3);
// the left controller is turned so the back of the wrist faces the eyes (the head pitched down to look at it) → the
// watch shows on the wrist with «Menú» and its four buttons; the right controller's ray on «Menú» + a trigger press
// opens the menu panel still in front of you at ~1.2 m with the computer's seven sections; the ray on «Gente» changes
// section; B closes it; lowering the wrist hides the watch. Not a Quest: IWER only. Env: BASE, SERVER_HTTP
// (tools/auto.sh e2e); CANVAS=<dir> also writes the watch's and the menu's canvases there (vr-reloj.png,
// vr-menu-<section>.png) — IWER draws the scene poorly, so the pictures are the canvases themselves.
// v7: the panel's eighth row is «Chat» (the last lines + six quick phrases sent with ray + trigger; page B must receive one).
// v2 paridad: the panel's seven rows are the computer's (one list: menu-secciones.ts); «Ir a su lado» from Gente puts you next to the
// other person; «Construir» says «Entra con tu nombre para construir» to a guest without the role and, with it, turns the builder's
// hands on (constructor-xr.ts).
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");
const CANVAS = process.env.CANVAS ?? "";
const ID_SECCION = (i) => 10 + i; // menu-vr.ts idSeccion

async function pierna() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    // the quaternion turning unit vector a onto unit vector b (THREE's setFromUnitVectors), as [x, y, z, w]
    const giro = (a, b) => { const d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; let x = a[1]*b[2]-a[2]*b[1], y = a[2]*b[0]-a[0]*b[2], z = a[0]*b[1]-a[1]*b[0], w = 1 + d;
      if (w < 1e-6) { x = 0; y = 0; z = 1; w = 0; } const n = Math.hypot(x, y, z, w); return [x/n, y/n, z/n, w/n]; };
    // look at your left wrist like at a watch: head pitched 40° down, the wrist 0.42 m along that gaze, the back of
    // the controller (its −X: muneca-gesto.ts normalDorsoLocal) towards the eyes
    globalThis.__mirarMuneca = () => {
      const d = globalThis.__iwer, h = d.position, p = -40 * Math.PI / 180;
      d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2));
      const g = [0, Math.sin(p), -Math.cos(p)], L = 0.42, c = d.controllers.left;
      c.position.set(h.x + g[0] * L, h.y + g[1] * L, h.z + g[2] * L);
      const q = giro([-1, 0, 0], [-g[0], -g[1], -g[2]]); c.quaternion.set(q[0], q[1], q[2], q[3]);
      // the other hand between the eyes and the watch, to its right (the watch's glass faces the eyes: front side only)
      const r = d.controllers.right; r.position.set(h.x + 0.15, h.y - 0.12, h.z - 0.12);
    };
    // v11: the pose in which you read a real watch — head level, the wrist 0.25 m ahead, 0.10 m to the left and ~0.29 m UNDER the
    // eyes (52° below the gaze: outside the old 45° cone), the back of the controller towards the eyes
    globalThis.__relojNatural = () => {
      const d = globalThis.__iwer, h = d.position, c = d.controllers.left; d.quaternion.set(0, 0, 0, 1);
      const w = [-0.1, -0.26, -0.25]; c.position.set(h.x + w[0], h.y + w[1], h.z + w[2]);
      const q = giro([-1, 0, 0], [-w[0], -w[1], -w[2]].map((v) => v / Math.hypot(...w))); c.quaternion.set(q[0], q[1], q[2], q[3]);
      const r = d.controllers.right; r.position.set(h.x + 0.15, h.y - 0.2, h.z - 0.15);
    };
    // v11: the left arm stretched out in front (0.71 m from the eyes), the back of the hand up: it must not open the watch
    globalThis.__brazoEstirado = () => {
      const d = globalThis.__iwer, h = d.position, c = d.controllers.left; d.quaternion.set(0, 0, 0, 1);
      c.position.set(h.x - 0.15, h.y - 0.25, h.z - 0.65); const q = giro([-1, 0, 0], [0, 1, 0]); c.quaternion.set(q[0], q[1], q[2], q[3]);
    };
    globalThis.__bajarMuneca = () => { const d = globalThis.__iwer, h = d.position; d.quaternion.set(0, 0, 0, 1);
      const c = d.controllers.left; c.position.set(h.x - 0.2, h.y - 0.8, h.z - 0.1); c.quaternion.set(0, 0, 0, 1); };
    // aim the right controller from where it is at a world point: its position is local to the rig (the player's root)
    globalThis.__apuntar = (w) => {
      const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right, p = c.position;
      const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
      c.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
    };`);
  const ctxB = await browser.newContext({ viewport: { width: 640, height: 400 } }); // someone else here, for «Gente»
  const r = { ok: false, pasos: [] };
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  let a, b;
  const ctl = (code, arg) => a.evaluate(code, arg);
  const esperar = (fn, arg, ms = 8000) => a.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const boton = (b, nombre, v) => a.evaluate(([b, nombre, v]) => globalThis.__iwer.controllers[b].updateButtonValue(nombre, v), [b, nombre, v]);
  const gatillo = async (ms = 80) => { await boton("right", "trigger", 1); await a.waitForTimeout(ms); await boton("right", "trigger", 0); await a.waitForTimeout(200); };
  const lienzo = async (que, nombre) => {
    if (!CANVAS) return;
    const url = await ctl((que) => { const v = globalThis.__numinia.view.vr; return (que === "reloj" ? v.reloj.lienzo : v.menu.lienzo).toDataURL("image/png"); }, que);
    mkdirSync(CANVAS, { recursive: true });
    writeFileSync(`${CANVAS}/${nombre}.png`, Buffer.from(url.split(",")[1], "base64"));
  };
  try {
    a = await ctx.newPage(); a.on("pageerror", (e) => errors.push(String(e))); a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    b = await ctxB.newPage(); b.on("pageerror", (e) => errors.push("B: " + String(e)));
    await Promise.all([a.goto(BASE), b.goto(BASE0)]);
    paso("la página arranca", await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 30000));
    // MIS-200 (t_9687b5fc): once the world has loaded, «Entrar en VR» is active and says so in text (not «Preparando…», not aria-disabled)
    const botonVR = () => ({ texto: document.getElementById("vr").textContent, ariaDisabled: document.getElementById("vr").getAttribute("aria-disabled") });
    const activoTrasCargar = await esperar(() => { const v = document.getElementById("vr"); return v.textContent === "Entrar en VR" && v.getAttribute("aria-disabled") === "false"; }, null, 15000);
    paso("«Entrar en VR» activo tras cargar (no «Preparando…»)", activoTrasCargar, { boton: await ctl(botonVR) });
    await b.waitForFunction(() => globalThis.__numinia?.probe.done && !!globalThis.__numinia.session.who, null, { timeout: 30000 });
    const nombreB = await b.evaluate(() => globalThis.__numinia.session.who.nombre);
    await ctl(() => document.getElementById("vr").click());
    paso("entra en VR", await esperar(() => globalThis.__numinia.view.vr.active, null, 15000));
    // v1: the FIRST time on this device a notice says where the menu is (and says so in the page's language, Spanish here)
    const verAviso = await esperar(() => globalThis.__numinia.view.vr.aviso.visible, null, 12000);
    const av = await ctl(() => globalThis.__numinia.view.vr.aviso.diagnostico());
    paso("la primera vez sale el aviso «Gira la muñeca…»", verAviso && /Gira la muñeca y mírate el reloj/.test(av.texto), { aviso: av });
    if (CANVAS) { mkdirSync(CANVAS, { recursive: true }); writeFileSync(`${CANVAS}/vr-aviso.png`, Buffer.from((await ctl(() => globalThis.__numinia.view.vr.aviso.lienzo.toDataURL("image/png"))).split(",")[1], "base64")); }
    await esperar(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando" && globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000);
    await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(600);
    // t_166720f3: a dialogue opens with the help card in front → the card steps aside; Y does not open the menu over it
    paso("la ayuda de mandos está delante al entrar", (await ctl(() => globalThis.__numinia.view.vr.estadoPaneles())).panel === true);
    await ctl(() => globalThis.__numinia.view.vr.dialogo({ nombre: "Prueba", texto: "Una frase de prueba.", opciones: ["Sí", "No"] }));
    await a.waitForTimeout(300);
    const conDialogo = await ctl(() => { const v = globalThis.__numinia.view.vr; return { dialogo: v.estadoPaneles().dialogo, ayuda: v.estadoPaneles().panel, menu: v.menu.abierto }; });
    paso("un diálogo deja la ayuda escondida y solo el diálogo delante", conDialogo.dialogo === true && conDialogo.ayuda === false && conDialogo.menu === false, { conDialogo });
    await boton("left", "y-button", 1); await a.waitForTimeout(120); await boton("left", "y-button", 0); await a.waitForTimeout(300);
    paso("con el diálogo abierto, Y no abre el menú encima", (await ctl(() => globalThis.__numinia.view.vr.menu.abierto)) === false);
    await ctl(() => globalThis.__numinia.view.vr.dialogo(null)); await a.waitForTimeout(200);
    paso("sin diálogo, la ayuda sigue escondida (vuelve al entrar, no al hablar)", (await ctl(() => globalThis.__numinia.view.vr.estadoPaneles())).panel === false);
    await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(600);
    paso("con la muñeca bajada no hay reloj", !(await ctl(() => globalThis.__numinia.view.vr.reloj.visible)));
    // 1. turn the wrist towards you: the watch shows (after ABRIR.ms, 300 ms)
    await ctl(() => globalThis.__mirarMuneca());
    const visto = await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000);
    paso("girar la muñeca hacia ti enseña el reloj", visto, { reloj: await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico()) });
    const diag = await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico());
    paso("el reloj tiene Menú, micro, cámara y avisos", ["menu", "micro", "camara", "avisos"].every((b) => diag.botones.includes(b)), { botones: diag.botones });
    await a.waitForTimeout(400); await lienzo("reloj", "vr-reloj");
    // 2. the right ray on «Menú» + trigger: the menu opens in front of you, with seven sections
    const abrirMenu = async () => { // the whole way: wrist towards you, ray on «Menú», trigger, wrist down again
      await ctl(() => globalThis.__mirarMuneca());
      await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000); await a.waitForTimeout(300);
      const en = await ctl(() => globalThis.__numinia.view.vr.reloj.botonMundo("menu"));
      await ctl((w) => globalThis.__apuntar(w), en); await a.waitForTimeout(250);
      await gatillo();
      const ok = await esperar(() => globalThis.__numinia.view.vr.menu.abierto, null, 3000);
      await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(100);
      return ok;
    };
    const pulsarZona = async (id) => { // ray on a zone of the open panel + trigger
      const en = await ctl((id) => globalThis.__numinia.view.vr.menu.zonaMundo(id), id);
      if (!en) return false;
      await ctl((w) => globalThis.__apuntar(w), en); await a.waitForTimeout(250);
      await gatillo(); return true;
    };
    const menuEn = await ctl(() => globalThis.__numinia.view.vr.reloj.botonMundo("menu"));
    await ctl((w) => globalThis.__apuntar(w), menuEn); await a.waitForTimeout(250);
    await gatillo();
    const abierto = await esperar(() => globalThis.__numinia.view.vr.menu.abierto, null, 3000);
    const e = await ctl(() => globalThis.__numinia.view.vr.menu.estado());
    paso("rayo + gatillo en «Menú» abre el panel", abierto, { reloj: await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico()), e });
    // the names the computer's bar and the phone's «…» menu show, read from the live page (one list: menu-secciones.ts)
    const delOrdenador = await ctl(() => ["hud-personaje-abrir", "gente-abrir", "inventario-abrir", "misiones", "minimapa-abrir", "construir", "ajustes-abrir", "chat-boton"].map((id) => (document.getElementById(id)?.getAttribute("aria-label") || document.getElementById(id)?.textContent || "").replace(/\s*\(.\)\s*$/, "").replace(/\s*·.*$/, "").trim()));
    paso("el panel tiene las 7 secciones del ordenador y Chat", e.secciones.map((s) => s.nombre).join("·") === "Tú·Gente·Bolsa·Misiones·Dónde estoy·Construir·Ajustes·Chat", { secciones: e.secciones });
    paso("y se llaman igual que los botones de la página (PC)", e.secciones.every((s, i) => delOrdenador[i].startsWith(s.nombre)), { vr: e.secciones.map((s) => s.nombre), pc: delOrdenador });
    paso("el panel está a ~1,2 m y empieza en «Tú»", Math.abs(e.diagnostico.distanciaM - 1.2) < 0.25 && e.vista === "tu", { diag: e.diagnostico, vista: e.vista });
    await a.waitForTimeout(300); await lienzo("menu", "vr-menu-tu");
    // 3. the ray on «Gente» + trigger changes section
    await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(100);
    const genteEn = await ctl((id) => globalThis.__numinia.view.vr.menu.zonaMundo(id), ID_SECCION(1));
    await ctl((w) => globalThis.__apuntar(w), genteEn); await a.waitForTimeout(250);
    await gatillo();
    paso("rayo + gatillo en «Gente» cambia de sección", await esperar(() => globalThis.__numinia.view.vr.menu.vista === "gente", null, 3000), { vista: await ctl(() => globalThis.__numinia.view.vr.menu.vista) });
    const genteOk = await esperar((n) => globalThis.__numinia.view.vr.menu.estado().filas.includes(n), nombreB, 5000);
    const eg = await ctl(() => globalThis.__numinia.view.vr.menu.estado());
    paso("«Gente» lista a quien está aquí, con «Ir a su lado»", genteOk && eg.botones >= 1, { filas: eg.filas, botones: eg.botones, nombreB });
    await a.waitForTimeout(300); await lienzo("menu", "vr-menu-gente");
    // 3a. an AI in «Gente» reads as on the computer: after the people, robot icon, «IA · Activa · distance», «Ir hacia ella», and the title counts it
    //     (the page's AI card is stubbed for B: a real AI needs a signed world pass, see the e2e-agente-ia reference)
    const entB0 = await b.evaluate(() => globalThis.__numinia.session.entity);
    await ctl((q) => { const n = globalThis.__numinia; globalThis.__iaDe = n.ia.de; n.ia.de = (x) => (x === q ? { estado: "activa", responde: { comunidad: "La Torre", nombre: "Ana" }, puede: { construir: false }, atenta: false } : null); n.view.vr.menu.pintar(); }, entB0);
    await a.waitForTimeout(300);
    const gia = await ctl(() => globalThis.__numinia.menuVR.contenido("gente"));
    paso("«Gente» pone a una IA con «IA · Activa», su icono y «Ir hacia ella», y la cuenta en el título", /IA$/.test(gia.titulo) && gia.filas.length >= 1 && gia.filas[0].icono === "robot" && /^IA · Activa/.test(gia.filas[0].detalle) && gia.filas[0].botones[0].texto === "Ir hacia ella" && !/ · IA$/.test(gia.filas[0].texto), { titulo: gia.titulo, fila: gia.filas[0] && { texto: gia.filas[0].texto, detalle: gia.filas[0].detalle, icono: gia.filas[0].icono, boton: gia.filas[0].botones[0].texto } });
    await lienzo("menu", "vr-menu-gente-ia");
    await ctl(() => { const n = globalThis.__numinia; n.ia.de = globalThis.__iaDe; n.view.vr.menu.pintar(); }); await a.waitForTimeout(200);
    if (CANVAS) for (const [i, s] of [[2, "bolsa"], [3, "misiones"], [4, "mapa"], [6, "ajustes"]]) {
      await ctl(([i]) => globalThis.__numinia.view.vr.menu.pulsar(10 + i), [i]); await a.waitForTimeout(300); await lienzo("menu", `vr-menu-${s}`);
    }
    // 3b. «Ir a su lado» from Gente (ray + trigger on the row's button) puts you next to B and folds the menu
    await ctl(() => globalThis.__numinia.view.vr.menu.pulsar(10 + 1)); await a.waitForTimeout(300); // back to «Gente» (the captures above moved on)
    const entB = await b.evaluate(() => globalThis.__numinia.session.entity);
    const lejos = await a.evaluate((q) => { const n = globalThis.__numinia, y = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === q); return o ? Math.hypot(y.x - o.x, y.z - o.z) : null; }, entB);
    paso("pulsar «Ir a su lado» con el rayo", await pulsarZona(100));
    const junto = await esperar(([q]) => { const n = globalThis.__numinia, y = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === q); return !!o && Math.hypot(y.x - o.x, y.z - o.z) <= 3.5; }, [entB], 10000);
    const cerca = await a.evaluate((q) => { const n = globalThis.__numinia, y = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === q); return o ? Math.hypot(y.x - o.x, y.z - o.z) : null; }, entB);
    paso("«Ir a su lado» desde Gente te deja junto a la otra persona", junto, { antes: lejos, despues: cerca });
    paso("y el menú se pliega", await esperar(() => !globalThis.__numinia.view.vr.menu.abierto, null, 3000));
    // 4. «Construir»: a guest without the role is told to come in with their name; with the role it turns the builder's hands on
    paso("se vuelve a abrir el menú", await abrirMenu());
    paso("rayo + gatillo en «Construir» cambia de sección", (await pulsarZona(ID_SECCION(5))) && await esperar(() => globalThis.__numinia.view.vr.menu.vista === "construir", null, 3000));
    paso("«Construir» no está apagado para quien puede", (await ctl(() => globalThis.__numinia.view.vr.menu.estado())).secciones[5].activa === true);
    paso("sin construir aún", (await ctl(() => globalThis.__numinia.constructorVR.activo())) === false);
    await a.waitForTimeout(300); await lienzo("menu", "vr-menu-construir");
    const quien = await ctl(() => globalThis.__numinia.session.who);
    const puedeAntes = await ctl(() => globalThis.__numinia.constructor.estado.puede);
    await ctl(() => { globalThis.__puedeReal = globalThis.__numinia.constructor.estado.puede; globalThis.__numinia.constructor.estado.puede = false; });
    const negado = await ctl(() => globalThis.__numinia.menuVR.contenido("construir"));
    const invitado = /^Invitado [0-9A-Z]{4}$/.test(quien.nombre);
    paso("sin permiso, un invitado lee «Entra con tu nombre para construir»", invitado ? negado.vacio === "Entra con tu nombre para construir" : /permiso/.test(negado.vacio), { vacio: negado.vacio, nombre: quien.nombre });
    await ctl(() => globalThis.__numinia.view.vr.menu.pintar()); await a.waitForTimeout(200); await lienzo("menu", "vr-menu-construir-sin-permiso");
    await ctl(() => { globalThis.__numinia.constructor.estado.puede = globalThis.__puedeReal; globalThis.__numinia.view.vr.menu.pintar(); });
    paso("el permiso vuelve", (await ctl(() => globalThis.__numinia.constructor.estado.puede)) === puedeAntes);
    // 4b. v7 «Chat»: the eighth row lists the last lines and six quick phrases; ray + trigger on «Gracias» says it near (B is next to A now)
    //     and page B receives it. The page's chat client keeps its pace (1 s): a second press right away is refused with a note.
    const FRASES = ["¡Hola!", "Sí", "No", "Gracias", "Ven aquí", "Un momento"];
    paso("rayo + gatillo en «Chat» cambia de sección", (await pulsarZona(ID_SECCION(7))) && await esperar(() => globalThis.__numinia.view.vr.menu.vista === "chat", null, 3000));
    const ec = await ctl(() => globalThis.__numinia.view.vr.menu.estado());
    paso("«Chat» pone seis frases rápidas como botones", ec.contenido === "chat" && ec.botones === 6, { contenido: ec.contenido, botones: ec.botones });
    const frases = await ctl(() => globalThis.__numinia.menuVR.contenido("chat").frases.map((f) => f.texto));
    paso("y son las del encargo", JSON.stringify(frases) === JSON.stringify(FRASES), { frases });
    await a.waitForTimeout(300); await lienzo("menu", "vr-menu-chat-vacio");
    const antesB = await b.evaluate(() => globalThis.__numinia.chat.lineas.length);
    paso("pulsar «Gracias» con el rayo", await pulsarZona(100 + 3));
    const llega = await b.waitForFunction(() => globalThis.__numinia.chat.lineas.some((l) => l.texto === "Gracias"), null, { timeout: 8000 }).then(() => true, () => false);
    const lineaB = await b.evaluate(() => globalThis.__numinia.chat.lineas.filter((l) => l.texto === "Gracias").map((l) => ({ tipo: l.tipo, nombre: l.nombre, tuyo: l.tuyo })));
    paso("la otra página recibe «Gracias» por el chat de siempre", llega && lineaB.length === 1 && lineaB[0].tipo === "cerca" && lineaB[0].tuyo === false, { antesB, lineaB });
    paso("y A lo lee en su Chat del menú como «Tú: Gracias»", await esperar(() => globalThis.__numinia.view.vr.menu.estado().filas.includes("Tú: Gracias"), null, 4000), { filas: (await ctl(() => globalThis.__numinia.view.vr.menu.estado())).filas });
    // the answer comes back: B says something, A reads it in the list
    await b.evaluate(() => globalThis.__numinia.chat.decir("De nada"));
    paso("A lee lo que dice B", await esperar(() => globalThis.__numinia.view.vr.menu.estado().filas.some((f) => /: De nada$/.test(f)), null, 6000), { filas: (await ctl(() => globalThis.__numinia.view.vr.menu.estado())).filas });
    await a.waitForTimeout(400); await lienzo("menu", "vr-menu-chat");
    // a burst of presses: the page's chat client keeps its pace (burst of 3, then one a second); the rest are refused with a note
    // («Vas muy deprisa…») and nothing more is sent. Pressed in one go through the panel's own press (a ray takes ~0.5 s each).
    const antesRitmo = await b.evaluate(() => globalThis.__numinia.chat.lineas.length);
    await a.waitForTimeout(3500); // let the pace refill
    await ctl(() => { const v = globalThis.__numinia.view.vr, n0 = v.nota.bind(v); globalThis.__notas = []; v.nota = (t) => { globalThis.__notas.push(t); n0(t); }; for (let k = 0; k < 8; k++) v.menu.pulsar(100); });
    await a.waitForTimeout(1500);
    const nuevas = await b.evaluate((n) => globalThis.__numinia.chat.lineas.slice(n).map((l) => l.texto), antesRitmo);
    const notas = await ctl(() => globalThis.__notas);
    paso("ocho pulsaciones seguidas: no salen todas (el ritmo de la página) y la rechazada dice por qué", nuevas.length >= 1 && nuevas.length < 8 && notas.some((t) => /deprisa/.test(t)), { enviadas: nuevas.length, notas });
    await a.waitForTimeout(300); await lienzo("menu", "vr-menu-chat-lleno");
    // 5. B closes it; the watch hides once the wrist is lowered
    await boton("right", "b-button", 1); await a.waitForTimeout(120); await boton("right", "b-button", 0);
    paso("B cierra el menú", await esperar(() => !globalThis.__numinia.view.vr.menu.abierto, null, 3000));
    // 5b. «Construir → Empezar» enters the builder's mode (and folds the menu); «Dejar de construir» leaves it
    paso("se vuelve a abrir el menú otra vez", await abrirMenu());
    paso("en «Construir»", (await pulsarZona(ID_SECCION(5))) && await esperar(() => globalThis.__numinia.view.vr.menu.vista === "construir", null, 3000));
    paso("pulsar «Empezar» con el rayo", await pulsarZona(100));
    paso("«Construir» entra en el modo construir de VR", await esperar(() => globalThis.__numinia.constructorVR.activo(), null, 3000), { activo: await ctl(() => globalThis.__numinia.constructorVR.activo()) });
    paso("y el menú se pliega", await esperar(() => !globalThis.__numinia.view.vr.menu.abierto, null, 3000));
    paso("se abre otra vez y ofrece «Dejar de construir»", (await abrirMenu()) && (await pulsarZona(ID_SECCION(5))) && (await ctl(() => globalThis.__numinia.menuVR.contenido("construir"))).filas[0].botones[0].texto === "Dejar de construir");
    paso("«Dejar de construir» sale del modo", (await pulsarZona(100)) && await esperar(() => !globalThis.__numinia.constructorVR.activo(), null, 3000));
    await boton("right", "b-button", 1); await a.waitForTimeout(120); await boton("right", "b-button", 0); await a.waitForTimeout(200);
    paso("bajar la muñeca esconde el reloj", await esperar(() => !globalThis.__numinia.view.vr.reloj.visible, null, 4000));
    // v11: the watch comes out at the height where a real watch is read (52° under the gaze, was outside the 45° cone), and not with the arm stretched out
    await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(600);
    paso("v11: con el brazo estirado delante (0,71 m) no sale el reloj", (await ctl(() => globalThis.__brazoEstirado()), await a.waitForTimeout(1500), !(await ctl(() => globalThis.__numinia.view.vr.reloj.visible))), { reloj: await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico()) });
    await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(600);
    await ctl(() => globalThis.__relojNatural());
    const natural = await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000);
    const dn = await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico());
    paso("v11: con la muñeca a la altura de un reloj de verdad (~52° bajo la mirada, ~0,29 m bajo los ojos) sale el reloj", natural && dn.medida && dn.medida.angulo > 46 && dn.medida.angulo < 55, { reloj: dn });
    await a.waitForTimeout(400); await lienzo("reloj", "vr-reloj-bajo");
    await ctl(() => globalThis.__bajarMuneca());
    paso("v11: y bajar la muñeca lo vuelve a esconder", await esperar(() => !globalThis.__numinia.view.vr.reloj.visible, null, 4000));
    // v1: Y on the left controller opens and closes the same menu (the wrist is not the only way in with controllers)
    await boton("left", "y-button", 1); await a.waitForTimeout(500); await boton("left", "y-button", 0); await a.waitForTimeout(500);
    paso("Y (mando izquierdo) abre el mismo menú", await esperar(() => globalThis.__numinia.view.vr.menu.abierto, null, 3000));
    await boton("left", "y-button", 1); await a.waitForTimeout(500); await boton("left", "y-button", 0); await a.waitForTimeout(500);
    paso("Y otra vez lo cierra", await esperar(() => !globalThis.__numinia.view.vr.menu.abierto, null, 3000));
    await ctl(() => globalThis.__numinia.view.vr.exit());
    paso("sale de VR", await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000));
    // v1: the second time on the same device there is no notice (the page keeps `numinia.vr.avisoMuneca` in localStorage)
    paso("el aparato recuerda que ya lo vio", await ctl(() => localStorage.getItem("numinia.vr.avisoMuneca")) === "1");
    await ctl(() => document.getElementById("vr").click());
    paso("entra en VR otra vez", await esperar(() => globalThis.__numinia.view.vr.active, null, 15000));
    await a.waitForTimeout(3500); // longer than the notice's calm wait (1.5 s)
    const av2 = await ctl(() => globalThis.__numinia.view.vr.aviso.diagnostico());
    paso("la segunda vez no sale el aviso", !av2.visible && av2.fase === "hecho" && av2.vistas === 1, { aviso: av2 });
    await ctl(() => globalThis.__numinia.view.vr.exit());
    await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000);
    r.ok = errors.length === 0;
  } catch (e) {
    r.error = String(e).split("\n")[0].slice(0, 400);
  } finally {
    r.errors = errors;
    await browser.close();
  }
  return r;
}

const resultado = await pierna();
console.log(JSON.stringify(resultado, null, 1));
console.log(resultado.ok ? "E2E MENU-VR OK" : "E2E MENU-VR FALLA");
process.exit(resultado.ok ? 0 : 1);
