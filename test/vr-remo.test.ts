// MIS-229 (t_ee0ca4a3): rowing with the hands. The maths (remo.ts) is pure: a stroke back speeds you up, a push forward brakes,
// letting go glides to a stop, it never goes backwards. The hands module says which hands pinch in the air (remar()), and the
// setting `controles.gestoAndarVR` is a choice in Controles, VR only, «apuntar» by default (nothing changes for anyone who does not ask).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { crearRemo, REMO_LARGO_M, REMO_FRENO_M, REMO_DESLIZA_S, REMO_MAX_MS, REMO_QUIETA_MS, REMO_RITMO } from "../packages/render/src/remo.ts";
import { createManos } from "../packages/render/src/manos.ts";
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";

const DT = 1 / 72; // a headset's frame
/** Moves a hand `metros` along the facing (+ forward) over `segundos`, one frame at a time; returns where it ended and the speed. */
function mover(r: ReturnType<typeof crearRemo>, desde: number, metros: number, segundos: number, lado = "der"): { delante: number; v: number } {
  const n = Math.round(segundos / DT);
  let d = desde, v = r.velocidad;
  for (let i = 1; i <= n; i++) { d = desde + (metros * i) / n; v = r.paso(DT, [{ lado, delante: d }]); }
  return { delante: d, v };
}
const empezar = (r: ReturnType<typeof crearRemo>, d = 0.5) => r.paso(DT, [{ lado: "der", delante: d }]);

test("remar: hand back speeds you up (the longer the stroke the faster), capped at a walking pace", () => {
  const r = crearRemo();
  empezar(r);
  assert.equal(r.velocidad, 0, "the pinch alone does nothing");
  const a = mover(r, 0.5, -0.3, 0.5);
  assert.ok(Math.abs(a.v - 0.3 / REMO_LARGO_M) < 0.02, `a 0,3 m stroke gives ${a.v}`);
  const b = mover(r, a.delante, -0.6, 0.6);
  assert.equal(b.v, 1, "never above 1");
  assert.ok(REMO_RITMO <= 0.8, "a full stroke is a walking pace, not a run (0.9 and up runs)");
});

test("remar: hand forward brakes, to zero and no further — you never go backwards", () => {
  const r = crearRemo();
  empezar(r);
  const a = mover(r, 0.5, -0.5, 0.5);
  assert.ok(a.v > 0.7);
  const b = mover(r, a.delante, 0.1, 0.3);
  assert.ok(b.v < a.v && Math.abs((a.v - b.v) - 0.1 / REMO_FRENO_M) < 0.03, `0,1 m forward takes ${(a.v - b.v).toFixed(2)} off`);
  const c = mover(r, b.delante, 0.6, 0.6);
  assert.equal(c.v, 0, "stopped");
  const d = mover(r, c.delante, 0.3, 0.4);
  assert.equal(d.v, 0, "pushing on does not reverse");
});

test("remar: braking is quicker than speeding up (the same distance takes more off than it put on)", () => {
  assert.ok(REMO_FRENO_M < REMO_LARGO_M);
});

test("remar: letting go glides to a stop; the recovery with the hand open does not brake; a new pinch starts fresh", () => {
  const r = crearRemo();
  empezar(r);
  const a = mover(r, 0.5, -0.4, 0.4);
  let v = r.velocidad;
  assert.ok(v > 0.5);
  for (let i = 0; i < Math.round(REMO_DESLIZA_S / DT); i++) v = r.paso(DT, []);   // open hand: one time constant
  assert.ok(Math.abs(v - a.v / Math.E) < 0.05, `after ${REMO_DESLIZA_S} s it keeps ~37 %: ${v.toFixed(2)} of ${a.v.toFixed(2)}`);
  for (let i = 0; i < 400; i++) v = r.paso(DT, []);
  assert.equal(v, 0, "it ends at a stop");
  // the next pinch starts in a different place (the hand came forward open): that jump is not a stroke
  empezar(r, 0.1); assert.equal(r.velocidad, 0);
  const b = mover(r, 0.1, -0.3, 0.4);
  assert.ok(b.v > 0.4, "and the next stroke works");
});

test("remar: a still hand, a tracking glitch, a stalled frame and a NaN do nothing; two hands add up but never pass 1", () => {
  const r = crearRemo();
  empezar(r);
  for (let i = 0; i < 100; i++) r.paso(DT, [{ lado: "der", delante: 0.5 - (REMO_QUIETA_MS * 0.5 * DT) * i }]); // under the dead band
  assert.equal(r.velocidad, 0, "a resting hand");
  r.paso(DT, [{ lado: "der", delante: 0.5 - (REMO_MAX_MS * 3) * DT }]); // a jump of 9 m/s
  assert.equal(r.velocidad, 0, "a glitch");
  r.paso(1, [{ lado: "der", delante: -3 }]);
  assert.equal(r.velocidad, 0, "a one-second stall");
  r.paso(DT, [{ lado: "der", delante: NaN }]); assert.equal(r.velocidad, 0);
  const dos = crearRemo();
  dos.paso(DT, [{ lado: "izq", delante: 0.5 }, { lado: "der", delante: 0.5 }]);
  let v = 0;
  for (let i = 1; i <= 36; i++) v = dos.paso(DT, [{ lado: "izq", delante: 0.5 - 0.4 * i / 36 }, { lado: "der", delante: 0.5 - 0.4 * i / 36 }]);
  assert.equal(v, 1, "two hands rowing together reach full pace sooner, capped");
  const una = crearRemo(); una.paso(DT, [{ lado: "der", delante: 0.5 }]);
  let u = 0; for (let i = 1; i <= 36; i++) u = una.paso(DT, [{ lado: "der", delante: 0.5 - 0.4 * i / 36 }]);
  assert.ok(u < 1 && u > 0.5);
});

test("remar: reset() forgets the speed (switching the setting off stops you)", () => {
  const r = crearRemo(); empezar(r); mover(r, 0.5, -0.5, 0.5);
  assert.ok(r.velocidad > 0.5);
  r.reset(); assert.equal(r.velocidad, 0);
});

// ── the hands module: which hands row ─────────────────────────────────────────────────────────────────────────
function montar() {
  const scene = new THREE.Scene();
  const grupos = [0, 1].map(() => new THREE.Group());
  const manos = [0, 1].map(() => new THREE.Group());
  const renderer = { xr: { getController: (i: number) => grupos[i], getControllerGrip: () => new THREE.Group(), getHand: (i: number) => manos[i] } };
  const m = createManos({ renderer: renderer as never, objetos: () => [], paneles: () => [] } as never);
  m.montar(scene);
  const conectar = (i: number, handedness: "left" | "right") => {
    grupos[i].dispatchEvent({ type: "connected", data: { handedness, gamepad: { buttons: [], axes: [] }, hand: {}, targetRayMode: "tracked-pointer" } } as never);
    grupos[i].rotation.set(0, Math.PI, 0);
  };
  return { m, grupos, conectar };
}

test("manos.remar(): the hands pinching in empty air, at once, never the watch's hand nor one that is busy", () => {
  const f = montar();
  f.conectar(0, "left"); f.conectar(1, "right");
  f.m.update(null);
  assert.deepEqual(f.m.remar(), [], "nobody pinches");
  f.grupos[1].position.set(0.2, 1.2, -0.3);
  f.grupos[1].dispatchEvent({ type: "selectstart" } as never);
  f.m.update(null);
  const r = f.m.remar();
  assert.equal(r.length, 1); assert.equal(r[0].lado, "der");
  assert.ok(Math.abs(r[0].x - 0.2) < 1e-6 && Math.abs(r[0].y - 1.2) < 1e-6 && Math.abs(r[0].z + 0.3) < 1e-6, "its world position");
  assert.deepEqual(f.m.remar("der"), [], "the hand that carries the open menu does not row");
  f.m.ocupar("reloj", (l) => l === "der");
  assert.deepEqual(f.m.remar(), [], "a busy hand does not row");
  f.grupos[1].dispatchEvent({ type: "selectend" } as never);
  f.m.update(null);
  assert.deepEqual(f.m.remar(), [], "let go");
});

test("el ajuste gestoAndarVR: en Controles, solo en VR, «apuntar» por defecto, «remar» a petición", () => {
  const a = AJUSTES_MOTOR.find((x) => x.id === "gestoAndarVR");
  assert.ok(a, "exists");
  assert.equal(a!.grupo, "controles"); assert.equal(a!.tipo, "eleccion"); assert.equal(a!.defecto, "apuntar");
  assert.deepEqual(a!.requiere, ["xrVr"]);
  assert.deepEqual((a as { opciones: { valor: string }[] }).opciones.map((o) => o.valor), ["apuntar", "remar"]);
  assert.equal(AJUSTES_MOTOR.filter((x) => x.id === "gestoAndarVR").length, 1);
});

test("vr.ts wiring (read from source, like the walk-menu card; the behaviour is the headset leg): rowing replaces the pinch-and-point walk only when asked", () => {
  const VR = readFileSync(new URL("../packages/render/src/vr.ts", import.meta.url), "utf8");
  assert.match(VR, /gestoAndar === "apuntar" \? h\.manos\?\.andar/, "the pinch-and-point walk only when the gesture is «apuntar»");
  assert.match(VR, /gestoAndar === "remar"[\s\S]{0,400}h\.manos\?\.remar\?\.\(menu\.abierto \? LADO_RELOJ : null\)/, "rowing never with the watch's hand");
  assert.match(VR, /moveX = fx \* s \* REMO_RITMO/, "it walks along where you face");
  assert.match(VR, /set gestoAndar\(v: GestoAndarVR\) \{ gestoAndar = v === "remar" \? "remar" : "apuntar"; remo\.reset\(\)/, "anything else is the old gesture, and switching resets the speed");
  const AJ = readFileSync(new URL("../apps/plaza/menu-ajustes.ts", import.meta.url), "utf8");
  assert.match(AJ, /alAplicar\("controles\.gestoAndarVR"[\s\S]{0,120}view\.vr\.gestoAndar/, "the page applies the setting to the view");
});
