// lotes.ts with two copies (MIS-200: headsets instance from 2): one mesh per material, no matrix upload while the copies stand still.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { crearLotes, type Parte } from "../packages/render/src/lotes.ts";

const partes = (n: number): Parte[] => Array.from({ length: n }, () => ({ geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshStandardMaterial(), sombra: false }));
const en = (x: number) => new THREE.Matrix4().makeTranslation(x, 0, 0);

test("two copies of a 3-material prop cost 3 instanced meshes, and nothing is uploaded while they stand still", () => {
  const lotes = crearLotes(new THREE.Group());
  const p = partes(3), m = [en(0), en(5)];
  lotes.empezar(); lotes.dibujar("banco|", p, "", m); lotes.terminar();
  assert.deepEqual(lotes.estado(), { lotes: 1, copias: 2, mallas: 3, escrituras: 1 });
  assert.deepEqual(lotes.raiz.children.map((c) => (c as THREE.InstancedMesh).count), [2, 2, 2]);
  for (let i = 0; i < 5; i++) { lotes.empezar(); lotes.dibujar("banco|", p, "", m); lotes.terminar(); }
  assert.equal(lotes.estado().escrituras, 1, "still copies: no new upload in later frames");
});

test("a copy that moves is picked up in the next frame, and a lone copy draws nothing from the lote", () => {
  const lotes = crearLotes(new THREE.Group());
  const p = partes(1), m = [en(0), en(5)];
  lotes.empezar(); lotes.dibujar("mesa|", p, "", m); lotes.terminar();
  m[1] = en(7);
  lotes.empezar(); lotes.dibujar("mesa|", p, "", m); lotes.terminar();
  const malla = lotes.raiz.children[0] as THREE.InstancedMesh, o = new THREE.Matrix4();
  malla.getMatrixAt(1, o);
  assert.equal(o.elements[12], 7);
  assert.equal(lotes.estado().escrituras, 2);
  lotes.empezar(); lotes.terminar(); // nobody uses it this frame (e.g. back on the flat page, threshold 4)
  assert.equal(malla.visible, false);
  assert.deepEqual(lotes.estado(), { lotes: 0, copias: 0, mallas: 0, escrituras: 2 });
});
