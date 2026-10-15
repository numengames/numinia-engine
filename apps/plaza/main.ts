// The PP1 page: one plaza, your capsule, everyone else's, and the determinism probe.
import { hex } from "../../packages/core/src/index.ts";
import { referenceRecording, replayFingerprint, TICK_HZ, STICK_MAX } from "../../packages/sim/src/index.ts";
import { webSocketClient } from "../../packages/net/src/index.ts";
import { ClientSession, serverUrl } from "../../packages/client/src/index.ts";
import { createView } from "../../packages/render/src/index.ts";
import funciones from "../../features/cliente.ts";

const params = new URLSearchParams(location.search);
const hud = document.getElementById("hud")!;
const view = await createView(document.body, { forceWebGL: params.has("webgl2"), arMaxMs: Number(params.get("armax")) || undefined, battery: params.has("bateria"), maxFps: Number(params.get("fps")) || undefined });
const url = serverUrl(location);
const transport = webSocketClient(url);
// game features (J7): their client parts, and how they may draw (a label, a hop) over any avatar
const session = new ClientSession(transport, {
  features: funciones,
  view: {
    label: (e, text, ms) => view.label(e === session.entity ? "self" : e, text, ms),
    bounce: (e, ms) => view.bounce(e === session.entity ? "self" : e, ms),
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
  arBtn.onclick = () => { if (view.ar.state === "off") void view.ar.enter(); else void view.ar.exit(); };
});
setInterval(() => { arBtn.textContent = arLabel[view.ar.state]; }, 250);

// ---- VR (J6): same idea; the stick becomes the same two int8 intentions as keyboard and touch ----
const vrBtn = document.getElementById("vr") as HTMLButtonElement;
view.vrSupported().then((ok) => {
  if (!ok) return;
  vrBtn.style.display = "block";
  vrBtn.onclick = () => { if (view.vr.state === "off") void view.vr.enter(); else void view.vr.exit(); };
});
setInterval(() => { vrBtn.textContent = view.vr.active ? "Salir de VR" : "Entrar en VR"; }, 250);

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
    `Tú: avatar ${session.entity} · conectados a la vista: ${s.visible + 1}\n` +
    `Ping: ${s.rttMs < 0 ? "—" : s.rttMs + " ms"} · correcciones de tu predicción: ${s.corrections}\n` +
    `Huella navegador = servidor: ${det}`;
  if (view.vr.active) view.vr.setPanel([`${view.backend} · ${fps} fps`, `Conectados: ${s.visible + 1}`, `Ping: ${s.rttMs < 0 ? "—" : s.rttMs + " ms"}`, `Huella ${probe.browser === probe.server ? "✓" : "…"}`]);
}

// handle for automated checks (tools/e2e.mjs)
(globalThis as unknown as { __numinia: unknown }).__numinia = { session, view, probe, cost: () => cost };

// battery mode: press B (or open ?bateria)
addEventListener("keydown", (e) => { if (e.code === "KeyB") { view.power.setBattery(!view.power.battery); view.applyPixelRatio(); } });
