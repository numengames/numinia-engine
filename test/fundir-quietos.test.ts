// E2: a model without clips fused at load time (packages/render/src/fundir-quietos.ts) must look exactly as it did:
// the same triangles in the same places, facing the same way, with the same colours and normals; fewer meshes.
// Built here like the glTF loader leaves one: nested nodes with transforms, colour-only materials, a textured material
// shared by two pieces, a mirrored piece, an indexed and a non-indexed piece, a transparent one.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { fundirQuieto, crearQuietos } from "../packages/render/src/fundir-quietos.ts";

const caja = (w: number, h: number, d: number) => { const g = new THREE.BoxGeometry(w, h, d); g.clearGroups(); return g; };
const color = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

function puesto() {
  const raiz = new THREE.Group(); raiz.name = "Scene"; raiz.position.set(0.5, 0, -1); raiz.rotation.y = 0.4; raiz.scale.setScalar(1.3);
  const madera = color(0x8a5a2b), tela = new THREE.MeshStandardMaterial({ color: 0xc03030, roughness: 0.95, emissive: 0x401010, emissiveIntensity: 2 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.3, metalness: 0.6 }); // differ in more than colour: still one look
  const tex = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), roughness: 0.5 });
  const vidrio = new THREE.MeshStandardMaterial({ color: 0x88aaff, transparent: true, opacity: 0.4 });
  const nodo = new THREE.Group(); nodo.position.set(0, 1, 0); nodo.rotation.set(0.1, 0.2, 0.3); raiz.add(nodo);
  const piezas: [THREE.BufferGeometry, THREE.Material, (m: THREE.Mesh) => void][] = [
    [caja(2, 0.1, 1), madera, (m) => { m.position.y = 0.9; }],
    [caja(0.1, 1, 0.1), madera, (m) => { m.position.set(-0.9, 0.4, 0); }],
    [caja(2.2, 0.05, 1.2), tela, (m) => { m.position.y = 1.6; m.scale.set(1, 1, -1); }], // mirrored
    [caja(0.3, 0.3, 0.3).toNonIndexed(), negro, (m) => { m.position.set(0.5, 1, 0.2); }], // non-indexed
    [caja(1, 0.5, 0.02), tex, (m) => { m.position.set(0, 1.2, 0.5); }],
    [caja(0.6, 0.4, 0.02), tex, (m) => { m.position.set(0.2, 0.6, 0.5); }],
    [caja(0.5, 0.5, 0.5), vidrio, (m) => { m.position.set(-0.5, 1.2, 0); }],
  ];
  for (const [i, [g, mat, f]] of piezas.entries()) { const m = new THREE.Mesh(g, mat); m.name = `p${i}`; m.castShadow = true; f(m); (i < 3 ? nodo : raiz).add(m); }
  return raiz;
}

/** Every triangle drawn (world space), with its facing (from the winding), its normals and its colour, sorted. */
function triangulos(raiz: THREE.Object3D): string[] {
  const out: string[] = [];
  raiz.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  const r = (x: number) => (Math.round(x * 1e4) / 1e4 + 0).toFixed(4);
  const v3 = (v: THREE.Vector3) => `${r(v.x)},${r(v.y)},${r(v.z)}`;
  raiz.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, mat = m.material as THREE.MeshStandardMaterial;
    nm.getNormalMatrix(m.matrixWorld);
    const espejo = m.matrixWorld.determinant() < 0;
    const cnt = g.index ? g.index.count : pos.count;
    for (let t = 0; t < cnt; t += 3) {
      const ids = [0, 1, 2].map((k) => (g.index ? g.index.getX(t + k) : t + k));
      const vs = ids.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
      a.copy(vs[0]); b.copy(vs[1]); c.copy(vs[2]);
      const cara = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      const normales = ids.map((i) => n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize().clone());
      const de = (normales[0].dot(cara) > 0) !== espejo ? "fuera" : "dentro"; // three turns a mirrored mesh's front face when it draws it
      const colorV = col && mat.vertexColors ? new THREE.Color(col.getX(ids[0]), col.getY(ids[0]), col.getZ(ids[0])).multiply(mat.color) : mat.color;
      const at = (k: string, c: number, otro: number) => (g.attributes[k] ? g.attributes[k].getComponent(ids[0], c) : otro);
      const brillo = new THREE.Color(at("emisivo", 0, mat.emissive.r * mat.emissiveIntensity), at("emisivo", 1, mat.emissive.g * mat.emissiveIntensity), at("emisivo", 2, mat.emissive.b * mat.emissiveIntensity));
      const pbr = `r${r(at("rugosidad", 0, mat.roughness))} m${r(at("metalico", 0, mat.metalness))} e${r(brillo.r)},${r(brillo.g)},${r(brillo.b)}`;
      // a triangle's identity: its corners as a set (rotation of the corners does not matter), facing, normals, colour, map
      const esquinas = vs.map((v, k) => `${v3(v)}|${v3(normales[k])}`).sort().join(";");
      out.push(`${esquinas} ${de} #${colorV.getHexString()} ${pbr} ${mat.map ? "map" : "-"} ${mat.transparent ? "t" : "o"} ${mat.side}`);
    }
  });
  return out.sort();
}

test("fundirQuieto: same triangles, facing, normals and colours; 7 meshes -> 3", () => {
  const m = puesto();
  const antes = triangulos(m);
  const q = fundirQuieto(m);
  assert.ok(q);
  assert.equal(q.antes, 7);
  assert.equal(q.despues, 3); // colour, roughness, metalness and glow in the vertices · the textured material · the glass apart
  const copia = new THREE.Group(); copia.add(q.escena.clone()); // as index.ts places it: the copy under the thing's group
  assert.deepEqual(triangulos(copia), antes);
  assert.equal(q.partes.length, 3);
  assert.ok(q.partes.some((p) => p.rel), "the glass keeps its own place");
  const mallas: THREE.Mesh[] = []; q.escena.traverse((o) => { if ((o as THREE.Mesh).isMesh) mallas.push(o as THREE.Mesh); });
  assert.ok(mallas.every((x) => x.castShadow));
  const vc = mallas.find((x) => (x.material as THREE.Material).vertexColors)!;
  assert.equal(vc.userData.fundido.colores, true);
  assert.ok((vc.material as THREE.MeshStandardNodeMaterial).isNodeMaterial && (vc.material as THREE.MeshStandardNodeMaterial).roughnessNode);
  assert.equal(vc.userData.colorMapa, "#8a5a2b"); // the colour most of it wears (the wood: two pieces)
});

test("fundirQuieto: the original model is not touched", () => {
  const m = puesto();
  const antes = triangulos(m);
  fundirQuieto(m);
  assert.deepEqual(triangulos(m), antes);
});

test("fundirQuieto: two models share their vertex-colour material", () => {
  const a = fundirQuieto(puesto())!, b = fundirQuieto(puesto())!;
  const vc = (q: typeof a) => q.partes.find((p) => p.mat.vertexColors)!.mat;
  assert.equal(vc(a), vc(b));
});

test("fundirQuieto: nothing to win or unsafe -> null (drawn as before)", () => {
  const uno = new THREE.Group(); uno.add(new THREE.Mesh(caja(1, 1, 1), color(0xffffff)));
  assert.equal(fundirQuieto(uno), null);
  const conLinea = puesto(); conLinea.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)])));
  assert.equal(fundirQuieto(conLinea), null);
  const conVarios = puesto(); conVarios.add(new THREE.Mesh(new THREE.BoxGeometry(), [color(1), color(2)]));
  assert.equal(fundirQuieto(conVarios), null);
  const distintos = new THREE.Group(); // two materials that differ in more than the four values: still two meshes
  distintos.add(new THREE.Mesh(caja(1, 1, 1), new THREE.MeshStandardMaterial({ color: 1, side: THREE.DoubleSide })), new THREE.Mesh(caja(1, 1, 1), new THREE.MeshStandardMaterial({ color: 2 })));
  assert.equal(fundirQuieto(distintos), null);
});

test("crearQuietos: once per file, never for a model with clips", () => {
  const de = crearQuietos(), m = puesto();
  const q = de("a.glb", m, []);
  assert.ok(q);
  assert.equal(de("a.glb", puesto(), []), q);
  assert.equal(de("b.glb", puesto(), [new THREE.AnimationClip("x", 1, [])]), null);
});

test("fundirQuieto: pieces the alpha test cuts whole are kept (size, picking) but never drawn", () => {
  const m = puesto();
  const nada = new THREE.MeshStandardMaterial({ color: 0xcccccc, opacity: 0, alphaTest: 0.5 }); // glTF MASK with alpha 0
  for (const x of [-3, 3]) { const c = new THREE.Mesh(caja(1, 4, 1), nada); c.position.x = x; c.castShadow = true; m.add(c); }
  const caja0 = new THREE.Box3().setFromObject(m);
  const donde = m.children.at(-1)!.getWorldPosition(new THREE.Vector3());
  const q = fundirQuieto(m)!;
  assert.equal(q.antes, 9);
  assert.equal(q.despues, 3);
  const copia = new THREE.Group(); copia.add(q.escena.clone());
  assert.ok(new THREE.Box3().setFromObject(copia).equals(caja0) || new THREE.Box3().setFromObject(copia).min.distanceTo(caja0.min) < 1e-6);
  let dibujadas = 0; copia.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) dibujadas++; });
  assert.equal(dibujadas, 3);
  copia.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(donde.x, 10, donde.z), new THREE.Vector3(0, -1, 0)); // still picked where it stands
  assert.ok(ray.intersectObject(copia, true).length > 0);
  assert.ok(q.partes.every((p) => p.mat !== nada));
});
