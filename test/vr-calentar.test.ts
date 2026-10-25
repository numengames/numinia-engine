// MIS-200 (t_fb2f9e37): what only VR draws is warmed (compileAsync) while hidden, and left exactly as it was.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { calentarOcultos, type NodoOculto } from "../packages/render/src/precompilar.ts";
import { createVR } from "../packages/render/src/vr.ts";

const ctxFalso: unknown = new Proxy(function () {}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : ctxFalso), apply: () => ctxFalso, set: () => true });
const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => ctxFalso });
(globalThis as { document?: unknown }).document ??= { createElement: lienzoFalso };

test("calentarOcultos: every node is visible and uncullable during the call, and restored after", async () => {
  const hijo = { visible: false, frustumCulled: true, traverse(f: (o: NodoOculto) => void) { f(hijo); } };
  const raiz = { visible: false, frustumCulled: false, traverse(f: (o: NodoOculto) => void) { f(raiz); hijo.traverse(f); } };
  const vistos: boolean[][] = [];
  const n = await calentarOcultos([raiz, null, undefined], async () => { vistos.push([raiz.visible, hijo.visible, hijo.frustumCulled]); });
  assert.deepEqual(vistos, [[true, true, false]], "the synchronous projection sees them visible");
  assert.deepEqual([raiz.visible, hijo.visible, hijo.frustumCulled], [false, false, true], "restored");
  assert.equal(n, 1, "null objects are skipped");
});

test("calentarOcultos: a compile that throws or rejects does not break the rest", async () => {
  const a = { visible: false, traverse(f: (o: NodoOculto) => void) { f(a); } }, b = { visible: false, traverse(f: (o: NodoOculto) => void) { f(b); } };
  let k = 0;
  const n = await calentarOcultos([a, b], (o) => { k++; if (o === a) throw new Error("device lost"); return Promise.reject(new Error("x")); });
  assert.equal(k, 2); assert.equal(n, 1);
  assert.equal(a.visible, false);
});

test("vr.calentar hands the rig, the vignette, the note, the watch, the menu, the entry notice and the hands to the compiler, still hidden after", async () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const raizManos = new THREE.Group(); raizManos.visible = false; raizManos.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  const vr = createVR({ renderer: { xr: {} } as never, scene, camera, manos: { cargar: async () => {}, montar() {}, update() {}, raiz: () => raizManos } });
  const recibidos: THREE.Object3D[] = [], visiblesAlCompilar: boolean[] = [];
  const n = await vr.calentar(async (o) => { recibidos.push(o); const m: boolean[] = []; o.traverse((x) => m.push(x.visible)); visiblesAlCompilar.push(m.every(Boolean)); });
  const nombres = recibidos.map((o) => o.name || o.type);
  assert.equal(n, 7, nombres.join());
  const rig = scene.children.find((c) => c.type === "Group" && c.children.length > 0 && !c.visible)!;
  assert.ok(recibidos.includes(rig), "the rig (panel, «Salir de VR», settings, dialogue)");
  assert.ok(recibidos.includes(raizManos), "the hands' root");
  for (const nombre of ["reloj-muneca", "menu-vr", "aviso-muneca"]) assert.ok(recibidos.some((o) => o.name === nombre), nombre);
  assert.ok(visiblesAlCompilar.every(Boolean), "all visible while the compiler projects");
  assert.equal(rig.visible, false); assert.equal(raizManos.visible, false);
  for (const o of recibidos) if (o.name === "reloj-muneca" || o.name === "menu-vr") assert.equal(o.visible, false);
});
