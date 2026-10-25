// xr-compat: a session from Chrome 105 (PICO Browser 3.3.x on the Pico 4) has no `enabledFeatures`; three's
// XRManager.setSession() does `session.enabledFeatures.includes('layers')` and throws a TypeError without it, which left
// the headset on a black screen with zero frames (measured on the headset, 2026-10-25). `completarSesionXR` gives the
// session the list before three reads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { completarSesionXR, textoDeFallo } from "../packages/render/src/xr-compat.ts";

test("a session without enabledFeatures (Chrome < 107) gets an empty list, and it is the same object", () => {
  const s: { enabledFeatures?: string[] } = {};
  assert.throws(() => (s as { enabledFeatures: string[] }).enabledFeatures.includes("layers"), TypeError, "the bug: what three does on Chrome 105");
  const r = completarSesionXR(s);
  assert.equal(r, s);
  assert.deepEqual(s.enabledFeatures, []);
  assert.equal(s.enabledFeatures!.includes("layers"), false, "three then keeps the plain projection-layer path");
});

test("a session that already reports its features is left alone", () => {
  const lista = ["local-floor", "layers"];
  const s = { enabledFeatures: lista };
  completarSesionXR(s);
  assert.equal(s.enabledFeatures, lista);
});

test("a session whose prototype getter returns undefined (a broken emulator) is completed on the instance", () => {
  class Sesion { get enabledFeatures() { return undefined; } }
  const s = new Sesion();
  completarSesionXR(s);
  assert.deepEqual((s as { enabledFeatures?: unknown }).enabledFeatures, []);
});

test("a frozen session or a non-array value never throws", () => {
  const congelada = Object.freeze({ id: 1 });
  assert.doesNotThrow(() => completarSesionXR(congelada));
  const rara = { enabledFeatures: "layers" };
  completarSesionXR(rara);
  assert.deepEqual(rara.enabledFeatures, [], "a string is not a list: replaced");
});

test("it is idempotent", () => {
  const s = {};
  completarSesionXR(s); completarSesionXR(s);
  assert.deepEqual((s as { enabledFeatures: unknown }).enabledFeatures, []);
});

test("textoDeFallo: the message, cut to 160 characters; anything else as text", () => {
  assert.equal(textoDeFallo(new TypeError("boom")), "boom");
  assert.equal(textoDeFallo("x".repeat(500)).length, 160);
  assert.equal(textoDeFallo(null), "null");
  assert.equal(textoDeFallo(undefined), "undefined");
});
