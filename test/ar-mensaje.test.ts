// J8: AR failure on Brave/Chromium mobile ("tras «Permitir» sale «no puede solicitarte permiso»") must leave a
// clear sentence on screen instead of the browser's raw text. mensajeFalloAR (packages/render/src/ar.ts) is the
// pure mapping from the DOMException name to that sentence; this test covers it without touching WebXR or THREE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeFalloAR } from "../packages/render/src/ar.ts";

test("mensajeFalloAR: every known DOMException name gets its own clear sentence, in Spanish, never empty", () => {
  const nombres = ["NotAllowedError", "NotSupportedError", "SecurityError", "InvalidStateError"];
  const mensajes = nombres.map((n) => mensajeFalloAR(n));
  for (const m of mensajes) assert.ok(m.length > 10, m);
  assert.equal(new Set(mensajes).size, mensajes.length, "no two known errors share the same sentence");
  // NotAllowedError (Brave's "can't ask for permission" case) must point at permissions, not a generic fallback.
  assert.match(mensajeFalloAR("NotAllowedError"), /permiso/i);
});

test("mensajeFalloAR: an unknown or missing name still gets a usable sentence (never throws, never blank)", () => {
  for (const raro of ["", "AlgoRaroDelNavegador", "AbortError"]) {
    const m = mensajeFalloAR(raro);
    assert.ok(typeof m === "string" && m.length > 10, `"${raro}" -> "${m}"`);
  }
});
