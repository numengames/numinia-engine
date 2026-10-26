// t_f3f9e61a: freezing the matrices of a model that never animates keeps every world matrix exactly right and stops the per-frame compose.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { congelarMatrices, descongelarMatrices } from "../packages/render/src/congelar.ts";

function modelo(): THREE.Group {
  const raiz = new THREE.Group(); raiz.position.set(1, 0, 0); raiz.rotation.y = 0.5; raiz.scale.setScalar(2);
  for (let i = 0; i < 4; i++) {
    const rama = new THREE.Group(); rama.position.set(0, i, 0); rama.rotation.z = 0.1 * i; raiz.add(rama);
    for (let j = 0; j < 3; j++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); m.position.set(j, 0, 0.5); m.scale.set(1, 2, 1); rama.add(m); }
  }
  return raiz;
}
const mundoDe = (raiz: THREE.Object3D) => { const out: number[][] = []; raiz.traverse((o) => out.push(o.matrixWorld.toArray())); return out; };

test("congelar: counts the nodes it froze, skips frozen ones, and the world matrices equal the unfrozen ones", () => {
  const a = modelo(), b = modelo(), escenaA = new THREE.Scene(), escenaB = new THREE.Scene();
  escenaA.add(a); escenaB.add(b);
  assert.equal(congelarMatrices(b), 1 + 4 + 12);
  assert.equal(congelarMatrices(b), 0, "second call: nothing left to freeze");
  escenaA.updateMatrixWorld(); escenaB.updateMatrixWorld();
  assert.deepEqual(mundoDe(b), mundoDe(a));
  let todos = true; b.traverse((o) => { if (o.matrixAutoUpdate) todos = false; });
  assert.ok(todos, "no node composes its matrix any more");
});

test("congelar: a frozen subtree follows its parent when the parent moves (the group a thing is placed by is not frozen)", () => {
  const grupo = new THREE.Group(), escena = new THREE.Scene(), ref = new THREE.Group(), escenaRef = new THREE.Scene();
  const copia = modelo(), copiaRef = modelo(); grupo.add(copia); ref.add(copiaRef); escena.add(grupo); escenaRef.add(ref);
  congelarMatrices(copia);
  escena.updateMatrixWorld(); escenaRef.updateMatrixWorld();
  for (const [x, y, z, ry] of [[5, 0, -3, 1.2], [-2, 4, 9, 3], [0, 0, 0, 0]]) { // placeGroup(): position and rotation of the group
    for (const g of [grupo, ref]) { g.position.set(x, y, z); g.rotation.set(0, ry, 0); }
    escena.updateMatrixWorld(); escenaRef.updateMatrixWorld();
    assert.deepEqual(mundoDe(copia), mundoDe(copiaRef), `after moving the group to ${x},${y},${z}`);
  }
});

test("congelar: a node frozen and then moved by hand needs updateMatrix() (or the way back), and descongelar restores the default", () => {
  const m = modelo(), escena = new THREE.Scene(); escena.add(m); congelarMatrices(m);
  const hoja = m.children[0].children[0];
  hoja.position.set(9, 9, 9); escena.updateMatrixWorld();
  assert.notEqual(hoja.matrixWorld.elements[12], 9 + 1, "frozen: the edit is not seen (this is the contract)");
  assert.equal(descongelarMatrices(m), 1 + 4 + 12);
  escena.updateMatrixWorld();
  assert.ok(hoja.matrixWorldNeedsUpdate === false && Math.abs(hoja.getWorldPosition(new THREE.Vector3()).y) > 1, "back to composing: the edit shows");
});

test("congelar: the per-frame walk stops composing local matrices (updateMatrix is not called on a frozen node)", () => {
  const m = modelo(), escena = new THREE.Scene(); escena.add(m); escena.updateMatrixWorld();
  let llamadas = 0; const original = THREE.Object3D.prototype.updateMatrix;
  THREE.Object3D.prototype.updateMatrix = function () { llamadas++; return original.call(this); };
  try {
    escena.updateMatrixWorld(); const antes = llamadas;
    congelarMatrices(m); llamadas = 0;
    for (let i = 0; i < 10; i++) escena.updateMatrixWorld();
    assert.equal(antes, 1 + 1 + 4 + 12, `unfrozen: the scene + the model, ${antes} composes in one walk`);
    assert.equal(llamadas, 10, "frozen: only the scene node itself, once a walk");
  } finally { THREE.Object3D.prototype.updateMatrix = original; }
});
