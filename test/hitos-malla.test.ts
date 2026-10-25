// MIS-200: the plaza's 24 landmark pillars are ONE instanced draw (hitos-malla.ts); the proxies keep serving the map, picking and the nature's hide.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { crearHitosMalla } from "../packages/render/src/hitos-malla.ts";
import { ocultarHitos } from "../packages/render/src/naturaleza/hitos.ts";

function plaza() {
  const scene = new THREE.Scene(), world = new THREE.Group(), raiz = new THREE.Group();
  scene.add(world); world.add(raiz);
  const geo = new THREE.BoxGeometry(1, 3, 1), palette = [0xd9a441, 0x5b8cc0, 0xc0605b, 0x6ea86a];
  const hitos: THREE.Mesh[] = [];
  for (let i = 0; i < 24; i++) {
    const p = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: palette[i % 4] }));
    p.position.set(i, 1.5, -i); p.userData.mapa = true; world.add(p); hitos.push(p);
  }
  const hm = crearHitosMalla(hitos, geo, raiz);
  raiz.visible = false; // as lotes.raiz: shown only while the frame is drawn
  const dibujadas = () => { let n = 0; scene.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
  return { hitos, hm, raiz, dibujadas, world };
}

test("24 pillars → 1 instanced draw with 24 instances and each pillar's colour and place", () => {
  const { hitos, hm, raiz, dibujadas } = plaza();
  assert.equal(dibujadas(), 24, "at rest the proxies are the world's meshes");
  raiz.visible = true; hm.antes();
  assert.equal(dibujadas(), 1, "while the frame is drawn: one call");
  assert.equal(hm.malla.count, 24);
  const c = new THREE.Color(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    hm.malla.getColorAt(i, c); assert.equal(c.getHex(), (hitos[i].material as THREE.MeshStandardMaterial).color.getHex(), `colour ${i}`);
    hm.malla.getMatrixAt(i, m); v.setFromMatrixPosition(m); assert.deepEqual([v.x, v.y, Math.abs(v.z)], [i, 1.5, i], `place ${i}`);
  }
  assert.equal((hm.malla.material as THREE.MeshStandardMaterial).color.getHex(), 0xffffff, "colour comes from the instances alone");
  assert.equal(new Set(hitos.map((p) => (p.material as THREE.MeshStandardMaterial).color.getHex())).size, 4);
  raiz.visible = false; hm.despues();
  assert.equal(dibujadas(), 24, "after the frame every pillar is back (map, picking and AR read them)");
  assert.ok(hitos.every((p) => p.visible && p.userData.mapa === true));
  assert.equal(hm.malla.userData.mapa, undefined, "the instanced mesh is not a map thing: the proxies are");
});

test("picking still hits a proxy between frames", () => {
  const { hitos, world } = plaza();
  world.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(5, 1.5, 10), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObjects(hitos)[0]?.object, hitos[5]);
});

test("hidden pillars (hitos:false / nature on) are not drawn, and come back exactly as asked", () => {
  const { hitos, hm, raiz, dibujadas } = plaza();
  for (const p of hitos.slice(0, 4)) p.visible = false; // environment: some off
  raiz.visible = true; hm.antes();
  assert.equal(hm.malla.count, 20); assert.equal(dibujadas(), 1);
  raiz.visible = false; hm.despues();
  assert.deepEqual(hitos.map((p) => p.visible).filter(Boolean).length, 20, "the four stay hidden");
  const mostrar = ocultarHitos(hitos); // the nature holds all of them
  raiz.visible = true; hm.antes();
  assert.equal(hm.malla.count, 0); assert.equal(hm.malla.visible, false); assert.equal(dibujadas(), 0, "nothing at all: 0 calls");
  raiz.visible = false; hm.despues();
  hitos[10].visible = true; // the environment's wish while held is remembered
  mostrar();
  assert.equal(hitos[10].visible, true); assert.equal(hitos[0].visible, false);
});

test("a moved or recoloured pillar is picked up on the next frame", () => {
  const { hitos, hm } = plaza();
  hm.antes(); hm.despues();
  hitos[3].position.x = 99; (hitos[3].material as THREE.MeshStandardMaterial).color.set(0x2b3038);
  hm.antes();
  const m = new THREE.Matrix4(), c = new THREE.Color();
  hm.malla.getMatrixAt(3, m); assert.equal(new THREE.Vector3().setFromMatrixPosition(m).x, 99);
  hm.malla.getColorAt(3, c); assert.equal(c.getHex(), (hitos[3].material as THREE.MeshStandardMaterial).color.getHex());
  hm.despues();
});
