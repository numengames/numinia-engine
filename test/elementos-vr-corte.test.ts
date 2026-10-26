// MIS-200 t_7ed19d06: in a headset the small things of the world (fire, smoke, dust) are not drawn past ELEMENTOS_VR_M, measured from the
// EYE IN THE WORLD (the camera hangs from the rig in VR: its local position is only the head offset). On the screen nothing changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearElementos } from "../packages/render/src/elementos.ts";
import { ELEMENTOS_VR_M, elementoSeDibuja } from "../packages/render/src/dibujo-politica.ts";
import { DIBUJAR_M } from "../packages/render/src/calidad.ts";

test("elementoSeDibuja: the screen keeps its limit, a headset cuts at ELEMENTOS_VR_M (from the edge of the element's reach)", () => {
  assert.equal(elementoSeDibuja(100, 5, false, DIBUJAR_M), true);
  assert.equal(elementoSeDibuja(160, 5, false, DIBUJAR_M), false);
  assert.equal(elementoSeDibuja(20, 5, true, DIBUJAR_M), true);
  assert.equal(elementoSeDibuja(31, 5, true, DIBUJAR_M), false, "26 m from the edge: cut in VR");
  assert.equal(elementoSeDibuja(29, 5, true, DIBUJAR_M), true, "24 m from the edge: drawn");
  assert.equal(elementoSeDibuja(26, 0, true, 10), false, "never farther than the screen's own limit");
  assert.ok(ELEMENTOS_VR_M < DIBUJAR_M);
});

test("elementos: in a headset the far ones are hidden by distance from the WORLD position of the eye (the rig is far from the origin)", () => {
  const scene = new THREE.Scene(), world = new THREE.Group(), rig = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  scene.add(world, rig); rig.add(camera); rig.position.set(300, 0, 300);
  const xr = { isPresenting: true };
  const entorno = { nivel: "B", calidadActual: { particulas: "media", agua: "media", sombras: "no" }, vientoU: uniform(new THREE.Vector3()) } as never;
  const e = crearElementos({ renderer: { xr } as never, scene, world, camera, entorno });
  e.poner("cerca", { tipo: "humo", x: 310, y: 0, z: 300 });
  e.poner("lejos", { tipo: "humo", x: 480, y: 0, z: 300 });
  scene.updateMatrixWorld(true);
  e.actualizar(0.016);
  const visible = (k: string) => world.getObjectByName(`elemento:${k}`)!.visible;
  assert.equal(visible("cerca"), true, "10 m from the head in the world: drawn (it would be 310 m from the origin)");
  assert.equal(visible("lejos"), false, "180 m: cut");
  rig.position.set(450, 0, 300); scene.updateMatrixWorld(true);
  e.actualizar(0.016);
  assert.equal(visible("lejos"), true, "walk towards it and it comes back");
  assert.equal(visible("cerca"), false, "now 140 m behind: cut");
  // off the headset the same far one is drawn up to DIBUJAR_M
  xr.isPresenting = false; rig.position.set(300, 0, 300); scene.updateMatrixWorld(true);
  e.actualizar(0.016);
  assert.equal(visible("lejos"), false, "180 m is past DIBUJAR_M on the screen too");
  rig.position.set(400, 0, 300); scene.updateMatrixWorld(true);
  e.actualizar(0.016);
  assert.equal(visible("lejos"), true, "80 m: drawn on the screen, would be cut in VR");
});
