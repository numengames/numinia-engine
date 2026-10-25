// MIS-200 (t_04ada0ed): entering VR loads the hands before the session reaches three, and shows nothing of VR until calm frames.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { crearEstable } from "../packages/render/src/entrada-estable.ts";
import { createVR } from "../packages/render/src/vr.ts";

const ctxFalso: unknown = new Proxy(function () {}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : ctxFalso), apply: () => ctxFalso, set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctxFalso }) };

test("crearEstable: waits for 3 calm frames in a row, a slow frame starts the count again", () => {
  const e = crearEstable({ periodoMs: 10 }); // limit 15 ms
  assert.equal(e.fotograma(0), false);   // first frame: nothing to judge
  assert.equal(e.fotograma(10), false);  // 1 calm
  assert.equal(e.fotograma(20), false);  // 2
  assert.equal(e.fotograma(60), false);  // 40 ms: reset
  assert.equal(e.fotograma(70), false);  // 1
  assert.equal(e.fotograma(80), false);  // 2
  assert.equal(e.fotograma(90), true);   // 3
  assert.equal(e.fotograma(500), true, "sticky once ready");
});

test("crearEstable: loading work holds it back, a ceiling lets it through, a throwing probe does not hold it", () => {
  let ocupado = true;
  const e = crearEstable({ periodoMs: 10, ocupado: () => ocupado, maxMs: 1000 });
  for (let t = 0; t <= 100; t += 10) assert.equal(e.fotograma(t), false, "calm but busy");
  ocupado = false;
  assert.equal(e.fotograma(110), true);
  const techo = crearEstable({ periodoMs: 10, ocupado: () => true, maxMs: 1000 });
  assert.equal(techo.fotograma(0), false); assert.equal(techo.fotograma(999), false); assert.equal(techo.fotograma(1000), true);
  const roto = crearEstable({ periodoMs: 10, ocupado: () => { throw new Error("x"); } });
  roto.fotograma(0); roto.fotograma(10); roto.fotograma(20); assert.equal(roto.fotograma(30), true);
});

function montar(cargarMs: number, ocupado?: () => boolean) {
  const registro: string[] = [];
  const sesion = Object.assign(new EventTarget(), { inputSources: [], visibilityState: "visible", frameRate: 100, end: async () => { registro.push("end"); } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { xr: { isSessionSupported: async () => true, requestSession: async () => { registro.push("requestSession"); return sesion; } } } });
  const raizManos = new THREE.Group(); raizManos.visible = false;
  const renderer = { xr: { enabled: false, setReferenceSpaceType() {}, setFoveation() {}, setFramebufferScaleFactor() {}, setSession: async () => { registro.push("setSession"); }, getCamera: () => new THREE.Camera(), updateCamera() {} }, info: {} } as never;
  const manos = { cargar: () => new Promise<void>((ok) => setTimeout(() => { registro.push("manosListas"); ok(); }, cargarMs)), montar(r: unknown) { registro.push(r ? "montar" : "desmontar"); }, update() {}, raiz: () => raizManos };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const vr = createVR({ renderer, scene, camera, manos: manos as never, ocupado });
  const rig = scene.children.find((c) => c.type === "Group" && c.children.length > 0)!;
  return { vr, rig, registro, sesion };
}

test("enter(): the hands are loaded before setSession; the session is not handed to three until they are", async () => {
  const { vr, registro } = montar(20);
  assert.equal(await vr.enter(), true);
  assert.ok(registro.indexOf("manosListas") < registro.indexOf("setSession"), registro.join());
  assert.ok(registro.indexOf("requestSession") < registro.indexOf("setSession"));
});

test("enter(): hands that take longer than the activation window do not block requestSession, but still come before setSession", async () => {
  const { vr, registro } = montar(1700);
  assert.equal(await vr.enter(), true);
  assert.deepEqual(registro.slice(0, 3), ["requestSession", "manosListas", "setSession"], registro.join());
});

test("enter(): nothing of VR is visible until calm frames; then the rig appears with the help card", async () => {
  let trabajo = true;
  const { vr, rig } = montar(0, () => trabajo);
  await vr.enter();
  assert.equal(vr.state, "on");
  assert.equal(rig.visible, false, "just entered: the world only");
  let t = 1000;
  const prev = performance.now; (performance as { now: () => number }).now = () => t;
  const cuadro = (dt: number) => { t += dt; vr.update({ x: 0, z: 0 }, dt / 1000); };
  try {
    for (let i = 0; i < 10; i++) cuadro(10); // calm (limit 15 ms at 100 Hz) but the world is still loading
    assert.equal(rig.visible, false, "busy world: still nothing");
    trabajo = false;
    cuadro(10);
    assert.equal(rig.visible, true, "calm frames already seen and nothing pending");
  } finally { (performance as { now: () => number }).now = prev; }
});

test("enter(): a hitch in the first frames postpones the VR extras", async () => {
  const { vr, rig } = montar(0);
  await vr.enter();
  let t = 1000;
  const prev = performance.now; (performance as { now: () => number }).now = () => t;
  const cuadro = (dt: number) => { t += dt; vr.update({ x: 0, z: 0 }, dt / 1000); };
  try {
    cuadro(10); cuadro(10); cuadro(10); // first has no period to judge: 2 calm so far
    assert.equal(rig.visible, false, "fewer than 3 calm frames");
    cuadro(40); assert.equal(rig.visible, false, "a hitch resets the count");
    cuadro(10); cuadro(10); assert.equal(rig.visible, false);
    cuadro(10); assert.equal(rig.visible, true);
  } finally { (performance as { now: () => number }).now = prev; }
});
