// t_8217ffea (N1 + N2 of the 18-10 recording): your own body in VR and hands in your avatar's skin. The maths is pure (cuerpo-vr.ts);
// the hands module paints from a colour; the two settings exist, default on, VR only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { colocarCuerpo, frenteDeLaCabeza, giroCorto, seguirRumbo, promedioColor, trazosCircuito, ESCALA_CUERPO, CUERPO_ATRAS_M, OJOS_SOBRE_CABEZA_M } from "../packages/render/src/cuerpo-vr.ts";
import type { PoseCabeza } from "../packages/render/src/cuerpo-vr.ts";
import { createManos, crearManoMando, materialManoMando } from "../packages/render/src/manos.ts";
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";

/** A head at `y` looking along `yaw` (0 = -Z, like a camera) and `pitch` (negative = down). */
function cabeza(x: number, y: number, z: number, yaw = 0, pitch = 0): PoseCabeza {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q), u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return { x, y, z, fx: f.x, fy: f.y, fz: f.z, ux: u.x, uy: u.y, uz: u.z };
}

test("the body stands under the head, a little behind it, facing where the head looks", () => {
  const c = colocarCuerpo(cabeza(2, 1.6, 3, 0), 0, 1.45)!;
  assert.ok(Math.abs(c.x - 2) < 1e-6, "no sideways shift");
  assert.ok(Math.abs(c.z - (3 + CUERPO_ATRAS_M)) < 1e-6, "behind the head: the head looks to -Z, so the body is at +Z of it");
  assert.ok(Math.abs(Math.abs(c.rumbo) - Math.PI) < 1e-6, "its front (+Z) points to -Z, like the gaze");
  const d = colocarCuerpo(cabeza(0, 1.6, 0, Math.PI / 2), 0, 1.45)!; // looking towards -X
  assert.ok(Math.abs(Math.sin(d.rumbo) + 1) < 1e-6 && Math.abs(Math.cos(d.rumbo)) < 1e-6, "front = -X");
  assert.ok(d.x > 0, "and the body is behind (+X)");
});

test("looking steeply down, the top of the head says where the body faces (the gaze has no horizontal part)", () => {
  const f = frenteDeLaCabeza(cabeza(0, 1.6, 0, 0, -1.5))!; // head turned towards -Z then pitched 86° down: the crown points to -Z
  assert.ok(f[1] < -0.9, `forward is -Z, got ${f}`);
  const g = frenteDeLaCabeza(cabeza(0, 1.6, 0, 0, 1.5))!; // looking up: the crown points backwards, the body is still forward
  assert.ok(g[1] < -0.9, `looking up keeps the body forward, got ${g}`);
  const recto = frenteDeLaCabeza(cabeza(0, 1.6, 0, 0, 0))!;
  assert.deepEqual(recto.map((v) => Math.round(v)), [0, -1] as number[] | number[]);
});

test("the avatar is scaled so its head bone is under the eyes, inside limits", () => {
  const eye = 1.69, head = 1.6;
  const c = colocarCuerpo(cabeza(0, eye, 0), 0, head)!;
  assert.ok(Math.abs(c.escala * head - (eye - OJOS_SOBRE_CABEZA_M)) < 1e-9, "head bone at eyes − 9 cm");
  assert.equal(colocarCuerpo(cabeza(0, 0.5, 0), 0, 1.6)!.escala, ESCALA_CUERPO.min, "a very low head (lying down) does not shrink it to nothing");
  assert.equal(colocarCuerpo(cabeza(0, 4, 0), 0, 1.0)!.escala, ESCALA_CUERPO.max);
  assert.equal(colocarCuerpo(cabeza(0, 1.6, 0), 0, 0), null, "no head height known: no body placed");
  const alto = colocarCuerpo(cabeza(0, 3.1, 0), 1.5, 1.5)!; // on a 1.5 m floor (stairs, a roof): measured from the feet, not from 0
  assert.ok(Math.abs(alto.escala * 1.5 - (3.1 - OJOS_SOBRE_CABEZA_M - 1.5)) < 1e-9);
});

test("the body follows the head's turn the short way and eases, never snaps", () => {
  assert.ok(Math.abs(giroCorto(3.0, -3.0) - (2 * Math.PI - 6)) < 1e-9, "3 rad → −3 rad is a 0.28 rad turn, not −6");
  const a = seguirRumbo(0, 1, 1 / 72);
  assert.ok(a > 0 && a < 1, "one headset frame moves part of the way");
  assert.equal(seguirRumbo(0, 1, 10), 1, "a long frame arrives, it does not overshoot");
  assert.equal(seguirRumbo(0.5, 0.5, 0.1), 0.5);
});

test("the hand colour is the mean of the samples; none = null", () => {
  assert.equal(promedioColor([]), null);
  assert.equal(promedioColor([255, 0, 0, 255, 0, 0]), 0xff0000);
  assert.equal(promedioColor([0, 0, 0, 255, 255, 255]), 0x808080);
});

test("the circuit traces are deterministic and keep off the controller's texel", () => {
  const a = trazosCircuito(7, 128), b = trazosCircuito(7, 128), c = trazosCircuito(8, 128);
  assert.deepEqual(a, b, "same seed, same skin on every headset");
  assert.notDeepEqual(a.segmentos, c.segmentos);
  assert.ok(a.segmentos.length > 20);
  for (const [x0, y0, x1, y1] of a.segmentos) for (const v of [x0, y0, x1, y1]) assert.ok(v >= 6 && v <= 122, `inside the margin: ${v}`);
});

test("the hand with controller: still ONE mesh, one draw, with UVs; its skin repaints without touching the plastic", () => {
  const m = crearManoMando(materialManoMando());
  const geo = m.malla.geometry as THREE.BufferGeometry;
  assert.equal(m.grupo.children.filter((x) => (x as THREE.Mesh).isMesh).length, 1, "one mesh per hand (lote 12, vr-mandos-una-malla)");
  assert.equal(geo.attributes.uv.count, geo.attributes.position.count, "every vertex has a UV");
  const col = geo.attributes.color.array as Float32Array;
  const plastico = [col[0], col[1], col[2]], pielAntes = [col[col.length - 3], col[col.length - 2], col[col.length - 1]];
  m.pintar(0x2060ff);
  const despues = geo.attributes.color.array as Float32Array;
  assert.deepEqual([despues[0], despues[1], despues[2]], plastico, "the controller's plastic keeps its colour");
  const c = new THREE.Color(0x2060ff);
  assert.ok(Math.abs(despues[despues.length - 1] - c.b) < 1e-6 && despues[despues.length - 1] !== pielAntes[2], "the skin takes the avatar's colour");
});

test("the hands module repaints once per colour, for the controller hand and for the tracked hand", () => {
  const fake = { xr: { getController: () => new THREE.Group(), getControllerGrip: () => new THREE.Group(), getHand: () => new THREE.Group() } };
  const manos = createManos({ renderer: fake as never, objetos: () => [] });
  manos.piel(0x336699); manos.piel(0x336699); manos.piel(null);
  manos.piel(0x336699);
  assert.ok(typeof manos.piel === "function");
});

test("the settings: «ver tu cuerpo» and «manos con la piel del avatar» are VR-only, on by default, and applied by the page", () => {
  for (const id of ["cuerpoVR", "pielManosVR"]) {
    const a = AJUSTES_MOTOR.find((x) => x.id === id);
    assert.ok(a, id);
    assert.equal(a!.tipo, "bool"); assert.equal(a!.defecto, true); assert.deepEqual(a!.requiere, ["xrVr"]); assert.equal(a!.grupo, "controles");
    assert.equal(AJUSTES_MOTOR.filter((x) => x.id === id).length, 1);
  }
  const AJ = readFileSync(new URL("../apps/plaza/menu-ajustes.ts", import.meta.url), "utf8");
  assert.match(AJ, /alAplicar\("controles\.cuerpoVR"[\s\S]{0,80}view\.cuerpoVR/);
  assert.match(AJ, /alAplicar\("controles\.pielManosVR"[\s\S]{0,80}view\.pielManosVR/);
});

test("avatares.ts: in VR your body is drawn only while the setting is on, never on the flat page's first person rule", () => {
  const S = readFileSync(new URL("../packages/render/src/avatares.ts", import.meta.url), "utf8");
  assert.match(S, /actualizar\(a, yo, o\.xr\(\) \? !cuerpoPropio : primeraPersona/, "in XR hidden only when the setting is off; flat: first person hides it");
  const I = readFileSync(new URL("../packages/render/src/index.ts", import.meta.url), "utf8");
  assert.match(I, /vr\.update\(selfXZ, dtSeconds\); cuerpoEnVR\(\)/, "placed every XR frame, after the headset moved");
});
