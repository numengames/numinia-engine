// The PP1 page: one plaza, your capsule, everyone else's, and the determinism probe.
import { hex } from "../../packages/core/src/index.ts";
import { referenceRecording, replayFingerprint, TICK_HZ, STICK_MAX } from "../../packages/sim/src/index.ts";
import { webSocketClient } from "../../packages/net/src/index.ts";
import { ClientSession, serverUrl } from "../../packages/client/src/index.ts";
import { createView } from "../../packages/render/src/index.ts";

const params = new URLSearchParams(location.search);
const hud = document.getElementById("hud")!;
const view = await createView(document.body, { forceWebGL: params.has("webgl2"), arMaxMs: Number(params.get("armax")) || undefined });
const url = serverUrl(location);
const transport = webSocketClient(url);
const session = new ClientSession(transport);
transport.opened.catch(() => { hud.textContent = `No llego al servidor ${url}.\n¿Está arrancado (npm run server)?`; });

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
let last = performance.now(), acc = 0, frames = 0, fps = 0, fpsT = last;
setInterval(() => session.ping(), 1000);
view.loop((now) => {
  const dt = Math.min(250, now - last); last = now;
  acc += dt;
  while (acc >= TICK_MS) { const [mx, mz] = readAxes(); session.tick(mx, mz); acc -= TICK_MS; }
  if (session.welcome && !probe.done) runProbe();
  view.sync(session.entity >= 0 ? session.selfPosition(acc / TICK_MS) : null, session.remotePositions(now));
  view.draw(dt / 1000);
  frames++;
  if (now - fpsT >= 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; drawHud(); }
});

function drawHud() {
  const s = session.stats;
  const det = !probe.done ? "calculando…"
    : probe.browser === probe.server ? `<b>${hex(probe.browser)} = ${hex(probe.server)} ✓</b> (${probe.ms} ms)`
    : `${hex(probe.browser)} ≠ ${hex(probe.server)} ✗`;
  hud.innerHTML =
    `Render: <b>${view.backend}</b> · ${fps} fps\n` +
    `Tú: avatar ${session.entity} · conectados a la vista: ${s.visible + 1}\n` +
    `Ping: ${s.rttMs < 0 ? "—" : s.rttMs + " ms"} · correcciones de tu predicción: ${s.corrections}\n` +
    `Huella navegador = servidor: ${det}`;
  if (view.vr.active) view.vr.setPanel([`${view.backend} · ${fps} fps`, `Conectados: ${s.visible + 1}`, `Ping: ${s.rttMs < 0 ? "—" : s.rttMs + " ms"}`, `Huella ${probe.browser === probe.server ? "✓" : "…"}`]);
}

// handle for automated checks (tools/e2e.mjs)
(globalThis as unknown as { __numinia: unknown }).__numinia = { session, view, probe };
