// Standalone measure of J14's two LODs for the house robot, with NO other scene content: parses
// activos/robot/RobotExpressive.glb the same way index.ts's hornear()/hornearPieza() do (merge by material,
// then merge-all-into-one with vertex colours), and reports exactly how many draw calls each LOD needs.
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Minimal DOM-free glTF parse: GLTFLoader.parse() takes an ArrayBuffer directly, no fetch/Image needed for geometry.
const buf = await readFile(new URL("../activos/robot/RobotExpressive.glb", import.meta.url));
const loader = new GLTFLoader();
const gltf = await new Promise((resolve, reject) => loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", resolve, reject));

let meshCount = 0, triCount = 0;
const porMat = new Map();
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  meshCount++;
  const g = o.geometry;
  triCount += (g.index ? g.index.count : g.attributes.position.count) / 3;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  porMat.set(mat, (porMat.get(mat) ?? 0) + 1);
});
console.log(`sin hornear (modelo tal cual, como antes de J5): ${meshCount} mallas -> ${meshCount} draw calls, ${Math.round(triCount)} triángulos`);
console.log(`horneado «cerca» (una malla por material, J5): ${porMat.size} draw calls`);
console.log(`horneado «lejos» (J14, una sola pieza, un color por parte): 1 draw call`);
console.log();
console.log("20 personas a la vista (BACKLOG J14 'hecho cuando', tope dispositivo D: 80 draw calls):");
console.log(`  sin hornear:        20 x ${meshCount} = ${20 * meshCount} draw calls`);
console.log(`  horneado «cerca»:   20 x ${porMat.size} = ${20 * porMat.size} draw calls`);
console.log(`  horneado «lejos»:   20 x 1  = 20 draw calls`);
console.log(`  mitad cerca, mitad lejos: 10 x ${porMat.size} + 10 x 1 = ${10 * porMat.size + 10} draw calls`);
