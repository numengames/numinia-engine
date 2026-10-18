// N15: an animated model fused at load time (packages/render/src/fundir.ts) must look exactly as it did: every vertex
// of every piece lands where it landed before, at any moment of any clip, with its colour. Checked on the CPU with
// three's own skinning/morph code (SkinnedMesh.getVertexPosition), on a small robot built here: bones, pieces hanging
// from bones (one of them nested in another), a two-skin hand, a face with morph targets in two primitives, three
// colour-only materials and a textured one.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { fundirAnimado } from "../packages/render/src/fundir.ts";

const caja = (w: number, h: number, d: number, y = 0) => { const g = new THREE.BoxGeometry(w, h, d).translate(0, y, 0); g.clearGroups(); return g; }; // as glTF leaves it: no groups
const color = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.1 });

/** A little robot shaped like the glTF loader leaves one: bones with meshes under them, a skinned hand, a face. */
function robot(conTextura = false) {
  const gris = color(0x5f5e55), naranja = color(0x964a0a), negro = color(0x0c0c0c);
  const raiz = new THREE.Group(); raiz.name = "Root_Scene"; raiz.position.set(0.3, 0, -0.2); raiz.scale.setScalar(1.2);
  const cuerpo = new THREE.Bone(); cuerpo.name = "Body"; cuerpo.position.y = 1; raiz.add(cuerpo);
  const cabeza = new THREE.Bone(); cabeza.name = "Head"; cabeza.position.y = 0.6; cuerpo.add(cabeza);
  const brazo = new THREE.Bone(); brazo.name = "UpperArmL"; brazo.position.set(0.4, 0.3, 0); brazo.rotation.z = 0.3; cuerpo.add(brazo);
  const ante = new THREE.Bone(); ante.name = "LowerArmL"; ante.position.set(0.3, 0, 0); brazo.add(ante);
  const torso = new THREE.Group(); torso.name = "Torso"; cuerpo.add(torso);
  const t1 = new THREE.Mesh(caja(0.6, 0.6, 0.4), naranja); t1.name = "Torso_1"; torso.add(t1);
  const t2 = new THREE.Mesh(caja(0.62, 0.1, 0.42, -0.25), gris); t2.name = "Torso_2"; torso.add(t2);
  const b = new THREE.Mesh(caja(0.3, 0.1, 0.1), naranja); b.name = "ArmL"; b.position.x = 0.15; brazo.add(b);
  const anillo = new THREE.Mesh(caja(0.05, 0.12, 0.12), negro); anillo.name = "Ring"; anillo.position.x = 0.1; anillo.scale.set(1, 1.5, 0.7); b.add(anillo); // nested
  // the face: one glTF mesh in two primitives, with two morph targets
  const cara = new THREE.Group(); cara.name = "Head_1"; cabeza.add(cara);
  for (const [i, mat] of [gris, negro].entries()) {
    const g = caja(0.4, 0.35, 0.35, i * 0.05);
    const p = g.attributes.position as THREE.BufferAttribute;
    g.morphAttributes.position = [0, 1].map((t) => { const a = new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3); for (let v = 0; v < p.count; v++) a.setXYZ(v, 0, p.getY(v) > 0 ? 0.05 * (t + 1) : 0, t * 0.02); return a; });
    g.morphTargetsRelative = true;
    const m = new THREE.Mesh(g, mat); m.name = `Head_${i + 2}`; m.morphTargetDictionary = { Angry: 0, Sad: 1 }; m.updateMorphTargets(); m.morphTargetInfluences![0] = 0.25; cara.add(m);
  }
  // a hand skinned to the arm, two primitives with their own skins over the same bones
  const huesos = [cuerpo, brazo, ante];
  raiz.updateMatrixWorld(true);
  const mano = new THREE.Group(); mano.name = "HandL"; raiz.add(mano);
  for (const [i, mat] of [naranja, gris].entries()) {
    const g = caja(0.12, 0.12, 0.12).translate(0.75 + i * 0.05, 1.3, 0);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) { si.set([1, 2, 0, 0], v * 4); const w = g.attributes.position.getX(v) > 0.78 ? 0.8 : 0.3; sw.set([1 - w, w, 0, 0], v * 4); }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    const m = new THREE.SkinnedMesh(g, mat); m.name = `HandL_${i + 1}`; mano.add(m);
    m.updateMatrixWorld(true);
    m.bind(new THREE.Skeleton(huesos), m.matrixWorld);
  }
  if (conTextura) { const tx = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); const p = new THREE.Mesh(caja(0.2, 0.2, 0.05, 0.1), tx); p.name = "Badge"; torso.add(p); }
  const v3 = (o: THREE.Object3D, ...xs: number[]) => xs;
  const clips = [
    new THREE.AnimationClip("Dance", 2, [
      new THREE.VectorKeyframeTrack("Body.position", [0, 1, 2], [...v3(cuerpo, 0, 1, 0), 0, 1.2, 0.1, 0, 1, 0]),
      new THREE.QuaternionKeyframeTrack("UpperArmL.quaternion", [0, 1, 2], [...new THREE.Quaternion().toArray(), ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.2, 1.1)).toArray(), ...new THREE.Quaternion().toArray()]),
      new THREE.QuaternionKeyframeTrack("LowerArmL.quaternion", [0, 2], [...new THREE.Quaternion().toArray(), ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.9, 0.5)).toArray()]),
      new THREE.VectorKeyframeTrack("ArmL.scale", [0, 2], [1, 1, 1, 1.3, 0.8, 1]),
      ...["Head_2", "Head_3"].map((n) => new THREE.NumberKeyframeTrack(`${n}.morphTargetInfluences`, [0, 1, 2], [0, 0, 1, 0.5, 0.25, 0])),
    ]),
    new THREE.AnimationClip("Wave", 1, [new THREE.NumberKeyframeTrack("Head_2.morphTargetInfluences[Sad]", [0, 1], [0, 1]), new THREE.NumberKeyframeTrack("Head_3.morphTargetInfluences[Sad]", [0, 1], [0, 1]), new THREE.QuaternionKeyframeTrack("Head.quaternion", [0, 1], [...new THREE.Quaternion().toArray(), ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.6, 0)).toArray()])]),
  ];
  return { raiz, clips };
}

/** Where every vertex of every drawn mesh is (world), and its colour, piece by piece (by the fused mesh's record). */
function vertices(m: THREE.Mesh): { p: THREE.Vector3[]; c: THREE.Color[] } {
  const n = m.geometry.attributes.position.count, out = { p: [] as THREE.Vector3[], c: [] as THREE.Color[] };
  const mat = m.material as THREE.MeshStandardMaterial, C = m.geometry.attributes.color;
  for (let i = 0; i < n; i++) {
    out.p.push(m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld));
    const c = mat.color.clone(); if (mat.vertexColors && C) c.multiply(new THREE.Color(C.getX(i), C.getY(i), C.getZ(i))); out.c.push(c);
  }
  return out;
}
function comparar(fuente: ReturnType<typeof robot>, momentos: [number, number][], conTextura = false) {
  const original = clone(fuente.raiz), f = fundirAnimado(clone(fuente.raiz), fuente.clips);
  assert.ok(f, "fuses");
  const copia = clone(f.escena); // what the engine draws: a copy of the fused model, like any copy of a file
  const padre = new THREE.Group(); padre.position.set(5, 0, -3); padre.rotation.y = 0.7; padre.scale.set(2, 2, 0.6); // a world copy, scaled unevenly
  const padreO = padre.clone(); padre.add(copia); padreO.add(original);
  let peor = 0, peorColor = 0;
  for (const [clip, t] of momentos) {
    const ma = new THREE.AnimationMixer(original), mb = new THREE.AnimationMixer(copia);
    ma.clipAction(fuente.clips[clip]).play(); mb.clipAction(f.clips[clip]).play();
    ma.setTime(t); mb.setTime(t); padreO.updateMatrixWorld(true); padre.updateMatrixWorld(true);
    const porNombre = new Map<string, THREE.Mesh>(); original.traverse((o) => { if ((o as THREE.Mesh).isMesh) porNombre.set(o.name, o as THREE.Mesh); });
    let fundidas = 0;
    copia.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh || !m.userData.fundido) return;
      fundidas++;
      const b = vertices(m);
      let k = 0;
      for (const nombre of m.userData.fundido.piezas as string[]) {
        const a = vertices(porNombre.get(nombre)!);
        for (let i = 0; i < a.p.length; i++, k++) { peor = Math.max(peor, a.p[i].distanceTo(b.p[k])); peorColor = Math.max(peorColor, Math.abs(a.c[i].r - b.c[k].r) + Math.abs(a.c[i].g - b.c[k].g) + Math.abs(a.c[i].b - b.c[k].b)); }
      }
      assert.equal(k, b.p.length, "every vertex of the fused mesh comes from one piece");
    });
    assert.ok(fundidas >= 1);
  }
  return { f, copia, peor, peorColor, conTextura };
}

test("a robot fused: 8 pieces become 1 mesh (colour-only materials) and every vertex stays where it was, clips and morphs included", () => {
  const r = robot();
  const { f, copia, peor, peorColor } = comparar(r, [[0, 0], [0, 0.37], [0, 1.0], [0, 1.66], [1, 0.5], [1, 1]]);
  assert.equal(f.antes, 8);
  assert.equal(f.despues, 1);
  let mallas = 0; copia.traverse((o) => { if ((o as THREE.Mesh).isMesh) mallas++; });
  assert.equal(mallas, 1, "the copy draws one mesh");
  assert.ok(peor < 1e-5, `max vertex error ${peor}`);
  assert.ok(peorColor < 1e-6, `max colour error ${peorColor}`);
  assert.ok(copia.getObjectByName("ArmL") && copia.getObjectByName("Ring") && copia.getObjectByName("Torso_1"), "the nodes keep their names (the clips find them)");
});

test("a textured material is not folded into the colours: it keeps its own mesh, and still moves the same", () => {
  const r = robot(true);
  const { f, peor } = comparar(r, [[0, 0.8], [1, 0.3]], true);
  assert.equal(f.antes, 9);
  assert.equal(f.despues, 2);
  assert.ok(peor < 1e-5, `max vertex error ${peor}`);
});

test("nothing to win, nothing done: a single mesh, or a model already one mesh per look", () => {
  const g = new THREE.Group(); g.add(new THREE.Mesh(caja(1, 1, 1), color(0xff0000)));
  assert.equal(fundirAnimado(g, []), null);
});

test("the morph tracks follow the face into the fused mesh (by index and by name)", () => {
  const r = robot();
  const f = fundirAnimado(clone(r.raiz), r.clips)!;
  const nombres = f.clips.flatMap((c) => c.tracks.map((t) => t.name));
  assert.ok(nombres.includes("fundido_0.morphTargetInfluences"));
  assert.ok(nombres.includes("fundido_0.morphTargetInfluences[Sad]"));
  assert.ok(!nombres.some((n) => n.startsWith("Head_2.") || n.startsWith("Head_3.")));
  assert.equal(f.clips[0].tracks.filter((t) => t.name.endsWith("morphTargetInfluences")).length, 1, "two primitives' identical tracks become one");
});
