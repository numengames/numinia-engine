// Hand rays (builder in VR) must not test every triangle of a heavy or skinned model: Quest session 26-oct, fps 10–19.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { intersectarBarato, esCaro, TRIS_RAYO_MAX } from "../packages/render/src/rayo-barato.ts";
import { crearEditor } from "../packages/render/src/gizmo.ts";

/** A sphere with about `tris` triangles, at (x, y, z), scaled `k`; its `raycast` is counted. */
function pesada(tris: number, x = 0, y = 0, z = -5, k = 1) {
  const w = Math.ceil(Math.sqrt(tris / 2));
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, w, w), new THREE.MeshBasicMaterial());
  m.position.set(x, y, z); m.scale.setScalar(k); m.updateMatrixWorld(true);
  const real = m.raycast.bind(m); const cuenta = { n: 0 };
  m.raycast = (r, out) => { cuenta.n++; real(r, out); };
  return { m, cuenta };
}
const rayo = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => new THREE.Raycaster(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize());

test("a mesh above the triangle limit is hit by its box and its triangles are never tested", () => {
  const { m, cuenta } = pesada(TRIS_RAYO_MAX * 3);
  assert.ok(esCaro(m));
  const hit = intersectarBarato(rayo(0, 0, 0, 0, 0, -1), [m]);
  assert.equal(cuenta.n, 0);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].object, m);
  assert.ok(Math.abs(hit[0].distance - 4) < 1e-3, `box face at 4 m, got ${hit[0].distance}`); // the sphere's own surface would be 4 m too; the box corner case is below
});

test("the box follows the mesh's own axes, scale and position (a ×10 model)", () => {
  const { m } = pesada(TRIS_RAYO_MAX * 3, 20, 5, 0, 10);
  const hit = intersectarBarato(rayo(0, 5, 0, 1, 0, 0), [m]);
  assert.equal(hit.length, 1);
  assert.ok(Math.abs(hit[0].distance - 10) < 1e-3, `got ${hit[0].distance}`); // box from x = 10 to 30
  assert.equal(intersectarBarato(rayo(0, 40, 0, 1, 0, 0), [m]).length, 0, "a ray above the box misses");
  assert.equal(intersectarBarato(rayo(0, 5, 0, -1, 0, 0), [m]).length, 0, "a ray pointing away misses");
});

test("a light mesh keeps the exact triangle test", () => {
  const { m, cuenta } = pesada(200);
  assert.ok(!esCaro(m));
  const hit = intersectarBarato(rayo(0.9, 0.9, 0, 0, 0, -1), [m]); // through the box corner, outside the sphere
  assert.ok(cuenta.n >= 1);
  assert.equal(hit.length, 0);
});

test("a skinned mesh is always answered by its box, however few triangles it has", () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(g.getAttribute("position").count * 4).fill(0), 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Array(g.getAttribute("position").count * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const bone = new THREE.Bone();
  const s = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
  s.add(bone); s.bind(new THREE.Skeleton([bone])); s.position.set(0, 0, -5); s.updateMatrixWorld(true);
  let n = 0; const real = s.raycast.bind(s); s.raycast = (r, out) => { n++; real(r, out); };
  assert.ok(esCaro(s));
  assert.equal(intersectarBarato(rayo(0, 0, 0, 0, 0, -1), [s]).length, 1);
  assert.equal(n, 0);
});

test("results come nearest first and a group's children are visited", () => {
  const a = pesada(TRIS_RAYO_MAX * 2, 0, 0, -20).m, b = pesada(100, 0, 0, -5).m;
  const grupo = new THREE.Group(); grupo.add(a, b);
  const hit = intersectarBarato(rayo(0, 0, 0, 0, 0, -1), [grupo]);
  assert.deepEqual(hit.map((h) => h.object), [b, a]);
});

test("the editor's VR rays (pickRayo / puntoBajoRayo) do not touch a heavy model's triangles", () => {
  const { m, cuenta } = pesada(TRIS_RAYO_MAX * 4, 0, 2, -6, 3.4);
  const grupo = new THREE.Group(); grupo.name = "objeto:oq"; grupo.add(m);
  const scene = new THREE.Scene(); scene.add(grupo);
  const ed = crearEditor({ scene, camera: new THREE.PerspectiveCamera(), canvas: { addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement, *grupos() { yield ["oq", grupo as THREE.Object3D]; }, grupo: (k) => (k === "oq" ? grupo : undefined), reponer() {} });
  for (let i = 0; i < 30; i++) {
    assert.equal(ed.pickRayo({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: -1 }), "oq");
    const p = ed.puntoBajoRayo({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: -1 });
    assert.ok(p && p.z < -2 && p.z > -3, `lands on the box face, got ${JSON.stringify(p)}`);
    assert.equal(ed.puntoBajoRayo({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: -1 }, "oq")!.y, 0, "ignoring the held thing, the ray goes on to the ground");
  }
  assert.equal(cuenta.n, 0, "no triangle test on 30 ticks × 3 rays");
});
