// PROGRESO-M22c.md «Qué queda para otra pasada»: an empty builder library with no MOTOR_CONSTRUIR role used to look
// like an editor bug. apps/plaza/constructor.ts shows avisoBiblioteca()'s text in the panel instead of a blank list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIN_ROL_CONSTRUIR, avisoBiblioteca } from "../apps/plaza/constructor.ts";

test("avisoBiblioteca: empty library with no build role says why; any other case says nothing", () => {
  assert.equal(avisoBiblioteca([], false), SIN_ROL_CONSTRUIR, "empty + no role: the warning");
  assert.equal(avisoBiblioteca([], true), "", "empty but a fresh world with no models yet (role held): not this warning");
  assert.equal(avisoBiblioteca([{ id: "bloque" }], false), "", "models there but no role: the buttons just do not show (boton oculto), not an empty-library message");
  assert.equal(avisoBiblioteca([{ id: "bloque" }], true), "", "the normal case: nothing to say");
});
