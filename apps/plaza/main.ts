// The PP1 page: one plaza, your capsule, everyone else's, and the determinism probe.
import { hex } from "../../packages/core/src/index.ts";
import { referenceRecording, replayFingerprint, TICK_HZ, STICK_MAX } from "../../packages/sim/src/index.ts";
import { webSocketClient } from "../../packages/net/src/index.ts";
import { ClientSession, serverUrl } from "../../packages/client/src/index.ts";
import { createView, leerAparato, leerBateria, medidorDeCuadros } from "../../packages/render/src/index.ts";
import funciones from "../../features/cliente.ts";
import { constructor } from "../../features/objetos/client.ts";
import { montarConstructor } from "./constructor.ts";
import { montarMapa } from "./mapa.ts";
import { montarFicha } from "./ficha.ts";

const params = new URLSearchParams(location.search);
const hud = document.getElementById("hud")!;
const url = serverUrl(location);
// H1: files of things in the world come from the instance's server by their sha256 (ws://h:p -> http://h:p/a/<sha256>.glb)
const activos = new URL(url.replace(/^ws/, "http")).origin;
const view = await createView(document.body, { forceWebGL: params.has("webgl2"), arMaxMs: Number(params.get("armax")) || undefined, battery: params.has("bateria"), maxFps: Number(params.get("fps")) || undefined, assetUrl: (m) => `${activos}/a/${m}.glb` });
const transport = webSocketClient(url);
// game features (J7): their client parts, and how they may draw (a label, a hop) over any avatar
// I1: the guest token stays in this browser (no account, no personal data); private mode = a new guest each time
const GUARDA = "numinia.invitado";
const session = new ClientSession(transport, {
  features: funciones,
  identity: { load: () => localStorage.getItem(GUARDA), save: (t) => localStorage.setItem(GUARDA, t) },
  view: {
    label: (e, text, ms) => view.label(e === session.entity ? "self" : e, text, ms),
    bounce: (e, ms) => view.bounce(e === session.entity ? "self" : e, ms),
    beacon: (x, z, text, ms) => view.beacon(x, z, text, ms),
    // H1: things placed in the world, and where I am (a builder puts things in front of me)
    place: (key, o) => view.place(key, o),
    here: () => { if (session.entity < 0) return null; const p = session.selfPosition(0); return { x: p.x, y: 0, z: p.z }; },
    // V1: every announced event reaches screen readers (polite; safety = assertive). V3 adds the engine's own voice.
    announce: (a) => {
      const box = document.getElementById(a.importance >= 3 ? "avisos-urgentes" : "avisos")!;
      const p = document.createElement("p"); p.textContent = a.text; box.appendChild(p);
      while (box.childElementCount > 3) box.firstElementChild!.remove();
    },
  },
});
transport.opened.catch(() => { hud.textContent = `No llego al servidor ${url}.\n¿Está arrancado (npm run server)?`; });

// ---- the features' actions: a key on desktop, a button on touch screens; the help line lists them ----
const acts = session.features.actions();
addEventListener("keydown", (e) => { if (!e.repeat) acts.find((a) => a.key === e.code)?.run(); });
if (matchMedia("(pointer: coarse)").matches) {
  const bar = document.getElementById("acciones")!;
  for (const a of acts) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = a.label; b.title = a.describe ?? "";
    b.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); a.run(); }); // not a joystick touch
    bar.appendChild(b);
  }
} else if (acts.length) {
  document.getElementById("help")!.textContent += " · " + acts.map((a) => `${(a.key ?? "").replace(/^Key/, "")} ${a.label.toLowerCase()}`).join(" · ");
}

// ---- H1: the builder, for whoever may build (the server says so on entering) ----
montarConstructor(constructor, document.getElementById("construir") as HTMLButtonElement, document.getElementById("panel-construir")!);

// ---- J5: minimap (corner), big map (M, «Mapa») and player sheet (I, «Ficha»); other branches' contracts are read
// from __numinia when present (misiones.objetivos/resumen, ajustes.abrir, chat.nombres) ----
const otros = () => (globalThis as unknown as { __numinia?: Record<string, unknown> }).__numinia ?? {};
const mapa = montarMapa({ session, view, otros });
const ficha = montarFicha({ session, view, desde: () => informe.bienvenidaMs, otros }, mapa.botonFicha);

// ---- determinism probe: replay the reference run here and compare with the server's number ----
const probe = { browser: -1, server: -1, ms: 0, done: false };
const runProbe = () => {
  const w = session.welcome!;
  const t0 = performance.now();
  probe.browser = replayFingerprint(referenceRecording(w.ref.seed, w.ref.ticks, w.ref.n));
  probe.ms = Math.round(performance.now() - t0);
  probe.server = w.ref.hash; probe.done = true;
};

// ---- input: keyboard and a touch joystick, both reduced to two int8 axes ----
const keys = new Set<string>();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const joy = document.getElementById("joy")!, knob = document.getElementById("knob")!;
let touch: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" || touch) return;
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  joy.style.display = "block"; joy.style.left = `${e.clientX - 55}px`; joy.style.top = `${e.clientY - 55}px`;
});
addEventListener("pointermove", (e) => {
  if (!touch || e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y, len = Math.hypot(dx, dy), max = 45, k = len > max ? max / len : 1;
  touch.dx = (dx * k) / max; touch.dy = (dy * k) / max;
  knob.style.left = `${35 + touch.dx * max}px`; knob.style.top = `${35 + touch.dy * max}px`;
});
const endTouch = (e: PointerEvent) => { if (touch && e.pointerId === touch.id) { touch = null; joy.style.display = "none"; } };
addEventListener("pointerup", endTouch); addEventListener("pointercancel", endTouch);

function readAxes(): [number, number] {
  let x = 0, z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  if (touch) { x = touch.dx; z = touch.dy; }
  if (view.vr.active) { const [vx, vz] = view.vr.axes(); if (vx || vz) { x = vx; z = vz; } }
  return [Math.round(x * STICK_MAX), Math.round(z * STICK_MAX)];
}

// ---- AR (J8): the button exists only where the device can do immersive-ar; no WebXR (iPhone) = no button ----
const arBtn = document.getElementById("ar") as HTMLButtonElement;
const arLabel = { off: "Entrar en AR", searching: "Busca el suelo… (salir)", ready: "Toca para colocar (salir)", placed: "Colocado (salir)" };
view.arSupported().then((ok) => {
  if (!ok) return;
  arBtn.style.display = "block";
  arBtn.onclick = () => { if (view.ar.state === "off") void view.ar.enter().then((ok) => { if (!ok) session.report({ k: "xr", modo: "ar", accion: "falla", detalle: view.ar.lastError }); }); else void view.ar.exit(); };
});
setInterval(() => { arBtn.textContent = arLabel[view.ar.state]; }, 250);

// ---- VR (J6): same idea; the stick becomes the same two int8 intentions as keyboard and touch ----
const vrBtn = document.getElementById("vr") as HTMLButtonElement;
view.vrSupported().then((ok) => {
  if (!ok) return;
  vrBtn.style.display = "block";
  vrBtn.onclick = () => { if (view.vr.state === "off") void view.vr.enter().then((ok) => { if (!ok) session.report({ k: "xr", modo: "vr", accion: "falla", detalle: view.vr.lastError }); }); else void view.vr.exit(); };
});
setInterval(() => { vrBtn.textContent = view.vr.active ? "Salir de VR" : "Entrar en VR"; }, 250);

// ---- T1: tell the server how this player entered and how it is going (device, browser, XR, frames, ping,
// battery; no personal data). The server keeps it per session: GET /sesiones, npm run sesiones. ?pulso=ms ----
const PULSO_MS = Math.max(1000, Number(params.get("pulso")) || 10_000);
const medidor = medidorDeCuadros();
const informe = { entrada: false, bienvenidaMs: 0, primerCuadroMs: 0, errores: 0, oculta: false, pulsos: 0 };
let bateria: { nivel: number; cargando: boolean } | null = null;
const modo = () => (view.vr.active ? "vr" : view.ar.state !== "off" ? "ar" : "plano");
const enviarEntrada = async () => {
  informe.entrada = true;
  const [vr, ar] = await Promise.all([view.vrSupported(), view.arSupported()]);
  const aparato = await leerAparato({ backend: view.backend, gpu: await view.gpu(), xr: { vr, ar } });
  const r = { k: "entrada", ...aparato, tiempos: { bienvenidaMs: informe.bienvenidaMs, primerCuadroMs: informe.primerCuadroMs, huellaMs: probe.ms }, huellaIgual: probe.browser === probe.server, origen: location.protocol.replace(":", ""), motorPagina: "plaza" };
  if (!session.report(r)) session.report({ ...r, ua: String(r.ua).slice(0, 60), gpu: String(r.gpu).slice(0, 60) }); // too long: shorter texts
};
setInterval(async () => {
  if (!informe.entrada) return;
  bateria = (await leerBateria()) ?? bateria;
  const s = session.stats, mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  session.report({
    k: "pulso", modo: modo(), ...medidor.ventana(), objetivoFps: view.vr.active || view.ar.state !== "off" ? view.xrHz() || 72 : view.power.stats.targetFps,
    hzXR: view.xrHz(), escala: view.power.scale, modoBateria: view.power.battery, rttMs: s.rttMs, correcciones: s.corrections, visibles: s.visible,
    oculta: informe.oculta || document.hidden, bateria: bateria ?? undefined, errores: informe.errores, memoriaMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : undefined,
  });
  informe.oculta = document.hidden; informe.pulsos++;
}, PULSO_MS);
addEventListener("visibilitychange", () => { if (document.hidden) informe.oculta = true; });
let modoAntes = "plano";
setInterval(() => { const m = modo(); if (m !== modoAntes) { session.report({ k: "xr", modo: m === "plano" ? modoAntes : m, accion: m === "plano" ? "sale" : "entra", detalle: m === "plano" ? "" : `${view.xrHz() || "?"} Hz` }); modoAntes = m; } }, 250);
const informarError = (mensaje: unknown, donde: string) => { informe.errores++; if (informe.errores <= 5) session.report({ k: "error", mensaje: String(mensaje).slice(0, 160), donde: donde.slice(0, 160) }); };
addEventListener("error", (e) => informarError(e.message, `${(e.filename ?? "").split("/").pop()}:${e.lineno}`));
addEventListener("unhandledrejection", (e) => informarError((e.reason as Error)?.message ?? e.reason, "promesa"));
let lastDrawAt = 0;

// ---- loop: fixed 20 Hz client ticks inside the display loop, drawing blends between ticks ----
const TICK_MS = 1000 / TICK_HZ;
let lastActive = 0, lastSig = "", cost: { calls: number; triangles: number; cpuMs?: number } = { calls: 0, triangles: 0 };
const signature = () => { const s = session.entity >= 0 ? session.selfPosition(0) : null; let h = s ? s.x + s.z : 0; for (const r of session.remotePositions()) h += r.x * 3 + r.z; return h.toFixed(2); };
let last = performance.now(), acc = 0, frames = 0, fps = 0, fpsT = last;
setInterval(() => session.ping(), 1000);
view.loop((now) => {
  const dt = Math.min(250, now - last); last = now;
  acc += dt;
  while (acc >= TICK_MS) { const [mx, mz] = readAxes(); session.tick(mx, mz); acc -= TICK_MS; }
  if (session.welcome && !probe.done) runProbe();
  if (session.welcome && !informe.bienvenidaMs) informe.bienvenidaMs = Math.round(performance.now());
  if (probe.done && informe.primerCuadroMs && !informe.entrada) void enviarEntrada();
  // power policy (P2): skip the draw when hidden or when nothing changes; the 20 Hz ticks above never skip
  const sig = lastSig; lastSig = signature();
  if (sig !== lastSig || keys.size > 0 || touch || view.vr.active || view.ar.state !== "off" || view.busy()) lastActive = now;
  const active = now - lastActive < 600;
  if (view.vr.active || view.ar.state !== "off" || view.power.shouldDraw(now, { hidden: document.hidden, active })) {
    view.sync(session.entity >= 0 ? session.selfPosition(acc / TICK_MS) : null, session.remotePositions(now));
    const t0 = performance.now();
    view.draw(dt / 1000);
    cost = view.lastFrame(); cost.cpuMs = Math.round((performance.now() - t0) * 100) / 100;
    if (view.power.reportCost(cost.cpuMs, dt)) view.applyPixelRatio();
    frames++;
    // T1: interval between draws against the target of the moment (a pause over 1 s is not a lost frame)
    const xr = view.vr.active || view.ar.state !== "off";
    if (lastDrawAt && now - lastDrawAt < 1000) medidor.cuadro(now - lastDrawAt, cost.cpuMs, xr ? view.xrHz() || 72 : view.power.targetFps(active));
    lastDrawAt = now;
    if (session.welcome && !informe.primerCuadroMs) informe.primerCuadroMs = Math.round(performance.now());
  }
  if (now - fpsT >= 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; drawHud(); }
});

function drawHud() {
  const s = session.stats;
  const det = !probe.done ? "calculando…"
    : probe.browser === probe.server ? `<b>${hex(probe.browser)} = ${hex(probe.server)} ✓</b> (${probe.ms} ms)`
    : `${hex(probe.browser)} ≠ ${hex(probe.server)} ✗`;
  hud.innerHTML =
    `Render: <b>${view.backend}</b> · ${fps} fps${view.power.battery ? " · modo batería" : ""}${view.power.scale < 1 ? ` · resolución ${Math.round(view.power.scale * 100)} %` : ""}\n` +
    `Tú: ${session.who?.nombre ?? "…"} (avatar ${session.entity}) · conectados a la vista: ${s.visible + 1}\n` +
    `Ping: ${s.rttMs < 0 ? "—" : s.rttMs + " ms"} · correcciones de tu predicción: ${s.corrections}\n` +
    `Huella navegador = servidor: ${det}`;
  if (view.vr.active) view.vr.setPanel([`${view.backend} · ${fps} fps`, `Conectados: ${s.visible + 1}`, `Ping: ${s.rttMs < 0 ? "—" : s.rttMs + " ms"}`, `Huella ${probe.browser === probe.server ? "✓" : "…"}`]);
}

// handle for automated checks (tools/e2e.mjs)
(globalThis as unknown as { __numinia: unknown }).__numinia = { session, view, probe, cost: () => cost, informe, constructor, mapa, ficha };

// battery mode: press B (or open ?bateria)
addEventListener("keydown", (e) => { if (e.code === "KeyB") { view.power.setBattery(!view.power.battery); view.applyPixelRatio(); } });
