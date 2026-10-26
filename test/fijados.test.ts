// MIS-200 t_e41c0a12 «Juntar modelos fijados por material»: pinned things are baked into the world and merged by material, per cell.
// No GPU: plan, geometry and the rebuild rule are checked on plain three objects.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { CELDA_M, claveMaterial, crearFijados, fusionable, geometriaDeGrupo, planFijados, type Fijado } from "../packages/render/src/fijados.ts";

const rojo = new THREE.MeshStandardMaterial({ color: 0xff0000 }), azul = new THREE.MeshStandardMaterial({ color: 0x0000ff });
const caja = (w = 1) => new THREE.BoxGeometry(w, 1, 1);
const fijado = (id: string, x: number, z: number, partes: Fijado["partes"], giro = 0, escala = 1): Fijado => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, giro, 0)), new THREE.Vector3(escala, escala, escala));
  return { id, partes, matriz: m, x, z };
};
// two different MODELS that share a material (what fundir-quietos does for the low-poly templates)
const mesa = [{ geo: caja(2), mat: rojo, sombra: true }, { geo: caja(), mat: azul, sombra: true }];
const silla = [{ geo: caja(0.5), mat: rojo, sombra: true }];

test("plan: parts of different models with the same material land in one group; a cell boundary splits them", () => {
  const g = planFijados([fijado("a", 1, 1, mesa), fijado("b", 3, 2, silla), fijado("c", CELDA_M + 5, 1, silla)]);
  const porMat = (mat: THREE.Material, celda: string) => g.find((x) => x.mat === mat && x.celda === celda);
  assert.equal(porMat(rojo, "0,0")!.trozos.length, 2, "table top + chair, two models, one group");
  assert.equal(porMat(azul, "0,0")!.trozos.length, 1);
  assert.equal(porMat(rojo, "1,0")!.trozos.length, 1, "the chair past the cell edge is its own cell");
  assert.equal(g.length, 3);
});

test("plan: shadow flag and vertex layout keep groups apart", () => {
  const sinSombra = [{ geo: caja(), mat: rojo, sombra: false }];
  const sinUV = caja(); sinUV.deleteAttribute("uv");
  const g = planFijados([fijado("a", 1, 1, silla), fijado("b", 2, 2, sinSombra), fijado("c", 3, 3, [{ geo: sinUV, mat: rojo, sombra: true }])]);
  assert.equal(g.length, 3);
});

test("geometry: vertices land where the copies stand (position, scale, turn), normals stay unit and the index is offset", () => {
  const a = fijado("a", 10, 0, silla, 0, 2), b = fijado("b", 15, 4, silla, Math.PI / 2);
  const [grupo] = planFijados([a, b]);
  const geo = geometriaDeGrupo(grupo);
  const unA = caja(0.5).applyMatrix4(a.matriz), unB = caja(0.5).applyMatrix4(b.matriz);
  assert.equal(geo.attributes.position.count, unA.attributes.position.count * 2);
  assert.equal(geo.index!.count, caja(0.5).index!.count * 2);
  assert.ok(Math.max(...(geo.index!.array as Uint32Array)) < geo.attributes.position.count);
  const bb = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
  const esperado = new THREE.Box3().setFromBufferAttribute(unA.attributes.position as THREE.BufferAttribute).union(new THREE.Box3().setFromBufferAttribute(unB.attributes.position as THREE.BufferAttribute));
  assert.ok(bb.min.distanceTo(esperado.min) < 1e-5 && bb.max.distanceTo(esperado.max) < 1e-5, "same box as the copies");
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4);
});

test("geometry: a mirrored copy keeps its faces outward (triangles turned); a plain one is untouched", () => {
  const espejo = fijado("e", 0, 0, silla); espejo.matriz.makeScale(-1, 1, 1);
  const normal = fijado("n", 0, 0, silla);
  const salen = (f: Fijado) => {
    const geo = geometriaDeGrupo(planFijados([f])[0]);
    const p = geo.attributes.position, idx = geo.index!, centro = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let fuera = 0, total = 0;
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); c.fromBufferAttribute(p, idx.getX(i + 2));
      const n = b.clone().sub(a).cross(c.clone().sub(a)); centro.copy(a).add(b).add(c).divideScalar(3);
      total++; if (n.dot(centro) > 0) fuera++; // the box is centred on the origin: a face's normal points away from it
    }
    return fuera / total;
  };
  assert.equal(salen(normal), 1);
  assert.equal(salen(espejo), 1, "mirrored: still outward");
});

test("a part with `rel` (a whole glTF copied as it is) is placed by copy × rel", () => {
  const rel = new THREE.Matrix4().makeTranslation(0, 5, 0);
  const g = planFijados([fijado("a", 3, 0, [{ geo: caja(), mat: rojo, sombra: false, rel }])])[0];
  const geo = geometriaDeGrupo(g); geo.computeBoundingBox();
  assert.ok(Math.abs(geo.boundingBox!.min.y - 4.5) < 1e-5 && Math.abs(geo.boundingBox!.max.x - 3.5) < 1e-5);
});

test("fusionable: a copy merges whole or not at all", () => {
  assert.equal(fusionable(mesa), true);
  assert.equal(fusionable([]), false);
  const morph = caja(); morph.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(24 * 3), 3)];
  assert.equal(fusionable([...mesa, { geo: morph, mat: rojo, sombra: false }]), false);
});

test("crearFijados: one mesh per material and cell, rebuilt only when the set or a matrix changes, hidden by fog per cell", () => {
  const padre = new THREE.Group(), f = crearFijados(padre);
  assert.equal(f.raiz.visible, false, "shown only while a frame draws");
  const lista = [fijado("a", 1, 1, mesa), fijado("b", 3, 2, silla), fijado("c", CELDA_M + 5, 1, silla)];
  assert.equal(f.actualizar(lista), true);
  assert.equal(f.stats().celdas, 3, "red+blue in cell 0, red in cell 1 → 3 meshes for 4 parts");
  assert.deepEqual(f.raiz.children.map((m) => (m as THREE.Mesh).material === rojo).sort(), [false, true, true]);
  assert.ok(f.cubre("a") && f.cubre("b") && f.cubre("c") && !f.cubre("z"));
  assert.equal(f.actualizar(lista.map((x) => ({ ...x, matriz: x.matriz.clone() }))), false, "nothing changed: no rebuild");
  assert.equal(f.stats().reconstrucciones, 1);
  assert.equal(f.actualizar(lista.slice(0, 2)), true, "a copy left (deleted or unpinned)");
  assert.ok(!f.cubre("c"));
  const moved = lista.slice(0, 2).map((x) => ({ ...x, matriz: x.matriz.clone() })); moved[0].matriz.setPosition(1, 0, 1.5);
  assert.equal(f.actualizar(moved), true, "a matrix changed");
  assert.equal(f.stats().reconstrucciones, 3);
  // fog: a cell whose sphere the fog hides is not drawn
  const dibujadas = f.antes((x) => x > 100);
  assert.equal(dibujadas, f.stats().celdas);
  assert.equal(f.antes(() => true), 0);
  assert.ok(f.raiz.children.every((m) => !m.visible));
  f.destruir();
  assert.equal(f.raiz.children.length, 0);
});

test("crearFijados: a copy with a part that cannot merge is left to its own meshes", () => {
  const f = crearFijados(new THREE.Group());
  const morph = caja(); morph.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(24 * 3), 3)];
  f.actualizar([fijado("a", 1, 1, silla), fijado("m", 2, 2, [{ geo: morph, mat: rojo, sombra: false }])]);
  assert.ok(f.cubre("a") && !f.cubre("m"));
});

test("claveMaterial: two files' own copies of the same plain look merge; a different colour, a different texture or a node material do not", () => {
  const a = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.5 }), b = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.5 });
  assert.notEqual(a, b);
  assert.equal(claveMaterial(a), claveMaterial(b));
  assert.notEqual(claveMaterial(a), claveMaterial(new THREE.MeshStandardMaterial({ color: 0x808081, roughness: 0.5 })));
  assert.notEqual(claveMaterial(a), claveMaterial(new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.5, transparent: true })));
  assert.notEqual(claveMaterial(a), claveMaterial(new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.5, side: THREE.DoubleSide })));
  const img1 = new THREE.Texture(), img2 = new THREE.Texture();
  const t1 = new THREE.MeshStandardMaterial({ map: img1 }), t2 = new THREE.MeshStandardMaterial({ map: img2 }), t1b = new THREE.MeshStandardMaterial({ map: img1.clone() });
  assert.notEqual(claveMaterial(t1), claveMaterial(t2), "different image = different look");
  assert.equal(claveMaterial(t1), claveMaterial(t1b), "a clone of a texture shares its image source");
  const nodo = new THREE.MeshStandardNodeMaterial(); (nodo as unknown as { colorNode: unknown }).colorNode = {};
  assert.equal(claveMaterial(nodo), nodo.uuid, "a node material is its own key");
  const g = planFijados([fijado("a", 1, 1, [{ geo: caja(), mat: a, sombra: false }]), fijado("b", 2, 2, [{ geo: caja(), mat: b, sombra: false }])]);
  assert.equal(g.length, 1, "two materials, one look, one group");
});

// Auditorio lane: a pinned model marked `sinSombra` (glTF extras → userData.sinSombra) must stay shadow-less once merged. entorno.ts
// marcarSombras() makes every mesh of the world cast unless its userData says sinSombra, and the merged cell is a new mesh: it has to say it.
test("sinSombra: a pinned part that never casts is not merged with one that does, and its cell says it (userData + castShadow)", () => {
  const cupula = [{ geo: caja(3), mat: rojo, sombra: false, sinSombra: true }];
  const g = planFijados([fijado("a", 1, 1, silla), fijado("b", 2, 2, cupula), fijado("c", 3, 3, silla)]);
  assert.equal(g.length, 2, "same material, same cell: the shadow-less part is its own group");
  const sin = g.find((x) => x.sinSombra)!, con = g.find((x) => !x.sinSombra)!;
  assert.equal(sin.trozos.length, 1);
  assert.equal(con.trozos.length, 2);
  assert.equal(sin.sombra, false);
  const raiz = new THREE.Group(), f = crearFijados(raiz);
  f.actualizar([fijado("a", 1, 1, silla), fijado("b", 2, 2, cupula)]);
  const mallas = f.raiz.children as THREE.Mesh[];
  assert.equal(mallas.length, 2);
  // what entorno.ts marcarSombras does to the world after the merge
  raiz.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.sinSombra) m.castShadow = true; });
  assert.deepEqual(mallas.map((m) => [!!m.userData.sinSombra, m.castShadow]).sort(), [[false, true], [true, false]]);
  f.destruir();
});

test("sinSombra: a part that says nothing keeps today's grouping (no new key for models without the flag)", () => {
  const g = planFijados([fijado("a", 1, 1, silla), fijado("b", 2, 2, [{ geo: caja(), mat: rojo, sombra: true, sinSombra: false }])]);
  assert.equal(g.length, 1);
  assert.equal(g[0].sinSombra, false);
});
