// M6: the saved layout of the frames — what is read back, what is dropped, the clamp and the stylesheet. Pure and fast.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARCOS_PLAZA } from "../packages/client/src/densidad.ts";
import { leerDisposicion, marcosMovibles, ajustarPaso, acotar, cssDisposicion, disposicionVacia } from "../packages/client/src/disposicion.ts";

const ids = marcosMovibles(MARCOS_PLAZA).map((m) => m.id);

test("only frames with a box of their own can move; those inside another frame cannot", () => {
  assert.ok(ids.includes("hud.chat") && ids.includes("hud.minimapa") && ids.includes("hud.acciones"));
  assert.ok(!ids.includes("hud.chat.lineas") && !ids.includes("hud.chat.pastilla"));
});

test("reading a stored layout drops unknown frames, garbage offsets and zero moves, and never throws", () => {
  assert.deepEqual(leerDisposicion(null, ids), { mov: {}, oculto: [] });
  assert.deepEqual(leerDisposicion("{no json", ids), { mov: {}, oculto: [] });
  assert.deepEqual(leerDisposicion("[1,2]", ids), { mov: {}, oculto: [] });
  const d = leerDisposicion(JSON.stringify({ mov: { "hud.chat": [30.4, -20], "hud.nada": [5, 5], "hud.reloj": [0, 0], "hud.barra": [1e9, 0], "hud.ayuda": ["a", 1] }, oculto: ["hud.reloj", "hud.reloj", "x", 7] }), ids);
  assert.deepEqual(d, { mov: { "hud.chat": [30, -20] }, oculto: ["hud.reloj"] });
});

test("a drag snaps to the grid and stays on screen", () => {
  assert.equal(ajustarPaso(14), 10); assert.equal(ajustarPaso(16), 20); assert.equal(ajustarPaso(-14), -10);
  assert.equal(acotar(-500, 100, 200, 1600), -100);        // would leave through the left edge
  assert.equal(acotar(5000, 100, 200, 1600), 1300);        // would leave through the right edge
  assert.equal(acotar(40, 100, 200, 1600), 40);            // inside: untouched
  assert.equal(acotar(40, 0, 2000, 1600), -0);             // wider than the screen: pinned to the left, no jump
});

test("the stylesheet moves and hides only what the layout says", () => {
  assert.equal(cssDisposicion({ mov: {}, oculto: [] }, MARCOS_PLAZA), "");
  const css = cssDisposicion({ mov: { "hud.chat": [30, -20] }, oculto: ["hud.reloj"] }, MARCOS_PLAZA);
  assert.match(css, /html body #chat\{translate:30px -20px !important\}/);
  assert.match(css, /html:not\(\.editando-ui\) body #reloj\{display:none !important\}/);
  assert.match(css, /html\.editando-ui body #reloj\{opacity:\.35 !important\}/);
  assert.ok(!css.includes("#minimapa"));
  assert.ok(disposicionVacia({ mov: {}, oculto: [] }) && !disposicionVacia({ mov: {}, oculto: ["hud.reloj"] }));
});
