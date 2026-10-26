// t_9446dfbb (AR on Brave/Chromium Android): the XR gesture rule. `requestSession('immersive-ar')` must be CALLED inside the click's own call stack — nothing awaited
// before it — or Chromium treats the permission ask as unsolicited. A fake `navigator.xr` records WHEN it is called: synchronously, before the first microtask.
// Also: a rejection (the browser's «can't ask for permission») leaves no zombie session, a reason for people, and the next click can try again.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const falsoNavegador = (xr: unknown) => Object.defineProperty(globalThis, "navigator", { value: { xr }, configurable: true });
test.after(() => { if (original) Object.defineProperty(globalThis, "navigator", original); else delete (globalThis as { navigator?: unknown }).navigator; });

const { createAR, mensajeFalloAR } = await import("../packages/render/src/ar.ts");
const crear = () => createAR({ renderer: { xr: { enabled: false, setReferenceSpaceType() {}, async setSession() {} } } as never, scene: new THREE.Scene(), world: new THREE.Group() });

test("enter() calls requestSession synchronously (no await before it), with immersive-ar", () => {
  const llamadas: { modo: string; init: Record<string, unknown>; microtareasAntes: number }[] = [];
  let micro = 0; queueMicrotask(() => { micro++; });
  falsoNavegador({ isSessionSupported: async () => true, requestSession: (modo: string, init: Record<string, unknown>) => { llamadas.push({ modo, init, microtareasAntes: micro }); return Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })); } });
  const ar = crear();
  void ar.enter();
  assert.equal(llamadas.length, 1, "called before enter() returned the promise, i.e. inside the click");
  assert.equal(llamadas[0].modo, "immersive-ar"); assert.equal(llamadas[0].microtareasAntes, 0, "not one microtask ran first");
  assert.ok(Array.isArray(llamadas[0].init.optionalFeatures), "the extras are optional: a browser without hand-tracking or anchors still enters");
  assert.equal(llamadas[0].init.requiredFeatures, undefined, "nothing is REQUIRED beyond immersive-ar itself");
});

test("jugar() (the darts on your wall) enters the same way: synchronously", () => {
  let n = 0;
  falsoNavegador({ isSessionSupported: async () => true, requestSession: () => { n++; return Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })); } });
  const ar = crear();
  void ar.jugar({ root: new THREE.Group(), soltar() {}, pulsar() {}, frame() {} } as never);
  assert.equal(n, 1);
});

test("a refused permission leaves no zombie: the reason is kept for people, the state is off and the next click tries again", async () => {
  let n = 0;
  falsoNavegador({ isSessionSupported: async () => true, requestSession: () => { n++; return Promise.reject(Object.assign(new Error("This site can't ask for your permission"), { name: "NotAllowedError" })); } });
  const ar = crear();
  assert.equal(await ar.enter(), false);
  assert.equal(ar.state, "off"); assert.equal(ar.lastErrorName, "NotAllowedError"); assert.match(mensajeFalloAR(ar.lastErrorName), /encima/);
  assert.equal(await ar.enter(), false); assert.equal(n, 2, "not stuck after the first refusal");
});

test("no WebXR at all: enter() answers false without throwing", async () => {
  falsoNavegador(undefined);
  assert.equal(await crear().enter(), false);
});
