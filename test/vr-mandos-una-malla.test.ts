// MIS-200 t_fd715508 «Mandos a dos llamadas en VR»: the hand holding a controller is ONE mesh (controller + palm + ten finger
// segments, colour in the vertices), so the two controllers are two draw calls (they were six). No GPU: the census reads the scene.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { createManos, crearManoMando, materialManoMando } from "../packages/render/src/manos.ts";
import { censoDeEscena } from "../packages/render/src/medidor-vivo.ts";

function montar() {
  const scene = new THREE.Scene();
  const ctrl = [0, 1].map(() => new THREE.Group()), grip = [0, 1].map(() => new THREE.Group()), mano = [0, 1].map(() => new THREE.Group());
  const renderer = { xr: { getController: (i: number) => ctrl[i], getControllerGrip: (i: number) => grip[i], getHand: (i: number) => mano[i] } };
  const m = createManos({ renderer: renderer as never, objetos: () => [], paneles: () => [], nota: () => {} } as never);
  m.montar(scene);
  const botones = [0, 1].map(() => [{ value: 0, pressed: false, touched: false }, { value: 0, pressed: false, touched: false }]);
  (["left", "right"] as const).forEach((n, i) => {
    ctrl[i].dispatchEvent({ type: "connected", data: { handedness: n, gamepad: { buttons: botones[i], hapticActuators: [] }, targetRayMode: "tracked-pointer" } } as never);
    ctrl[i].visible = true; grip[i].position.set(i ? 0.2 : -0.2, 0, -0.4);
  });
  return { scene, m, botones };
}
const camara = () => { const c = new THREE.PerspectiveCamera(90, 1, 0.01, 100); c.updateMatrixWorld(); c.matrixWorldInverse.copy(c.matrixWorld).invert(); return c; };

test("manos: one hand with a controller is one mesh and one draw call", () => {
  const mano = crearManoMando(materialManoMando());
  const mallas: THREE.Object3D[] = [];
  mano.grupo.traverse((o) => { if ((o as THREE.Mesh).isMesh) mallas.push(o); });
  assert.equal(mallas.length, 1, "controller + palm + fingers in a single mesh");
  assert.equal((mallas[0] as THREE.Mesh).isInstancedMesh, undefined);
});

test("manos: two controllers in a headset = two draw calls for the models (the pointing rays are separate, see-through, and only while a hand points)", () => {
  const { scene, m } = montar();
  m.update(null);
  scene.updateMatrixWorld(true);
  const modelos: THREE.Object3D[] = [];
  scene.traverse((o) => { if (o.name === "mano-mando") modelos.push(o); });
  assert.equal(modelos.length, 2);
  // the census with the rays hidden = exactly the controller models
  const rayos: THREE.Object3D[] = [];
  scene.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh && x.name !== "mano-mando" && (x.material as THREE.Material).transparent) rayos.push(x); });
  const visibles = rayos.map((r) => r.visible);
  rayos.forEach((r) => (r.visible = false));
  const solo = censoDeEscena(scene, [camara()]);
  assert.equal(solo.porCategoria.manos.llamadas, 2, JSON.stringify(solo.porCategoria.manos));
  assert.equal(solo.porCategoria.manos.materiales, 1, "one material for both hands");
  rayos.forEach((r, i) => (r.visible = visibles[i]));
  const con = censoDeEscena(scene, [camara()]);
  assert.ok(con.porCategoria.manos.llamadas <= 4, `two models + at most the two rays: ${con.porCategoria.manos.llamadas}`);
});

test("manos: the fingers bend in the same buffer, stay finite and keep unit normals; nothing moved = no upload", () => {
  const mano = crearManoMando(materialManoMando());
  const geo = mano.malla.geometry;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const antes = Float32Array.from(pos.array as Float32Array);
  const v0 = pos.version;
  mano.dedos(0, 0, 0); // same signature as the first call: no work
  assert.equal(pos.version, v0, "no upload when nothing moved");
  mano.dedos(1, 1, 1);
  assert.ok(pos.version > v0, "the bend is uploaded");
  const despues = pos.array as Float32Array;
  assert.equal(despues.length, antes.length, "the buffer does not grow or shrink");
  let cambiados = 0, fijosIguales = true;
  for (let i = 0; i < despues.length; i++) { assert.ok(Number.isFinite(despues[i])); if (despues[i] !== antes[i]) cambiados++; }
  assert.ok(cambiados > 0, "finger vertices moved");
  for (let v = 0; v < nor.count; v++) {
    const l = Math.hypot(nor.getX(v), nor.getY(v), nor.getZ(v));
    assert.ok(Math.abs(l - 1) < 1e-3, `unit normal at ${v}: ${l}`);
  }
  // the controller + palm part (the first vertices) never moves: find where the first changed vertex is and check nothing before it differs
  let primero = -1; for (let i = 0; i < despues.length; i++) if (despues[i] !== antes[i]) { primero = i; break; }
  for (let i = 0; i < primero; i++) if (despues[i] !== antes[i]) fijosIguales = false;
  assert.ok(fijosIguales && primero >= 3 * 100, `the static part (controller, palm) comes first and is untouched; first moved float ${primero}`);
  // bending back restores the rest pose
  mano.dedos(0, 0, 0);
  const vuelta = pos.array as Float32Array;
  for (let i = 0; i < antes.length; i++) assert.ok(Math.abs(vuelta[i] - antes[i]) < 1e-5, `rest pose restored at ${i}`);
});

test("manos: colour lives in the vertices — controller plastic first, skin after; one material with vertex colours", () => {
  const mat = materialManoMando();
  assert.equal(mat.vertexColors, true);
  const mano = crearManoMando(mat);
  const col = mano.malla.geometry.attributes.color, n = col.count;
  const mando = new THREE.Color(0x2b2f36), piel = new THREE.Color(0xe3b896);
  assert.ok(Math.abs(col.getX(0) - mando.r) < 1e-6, "the first vertex is the controller's");
  assert.ok(Math.abs(col.getX(n - 1) - piel.r) < 1e-6, "the last vertex is a finger's skin");
  assert.equal(mano.malla.frustumCulled, false);
});
