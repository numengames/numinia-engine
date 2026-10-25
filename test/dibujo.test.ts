// N12: draw calls for Quest — the pure rules behind not drawing what the fog covers completely and drawing copies of
// the same model together (packages/render/src/dibujo-politica.ts). The drawing itself is measured in a browser
// (draw calls before/after: the N12 note in the PR).
import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTANCIAR_DESDE, INSTANCIAR_DESDE_VR, instanciarDesde, MARGEN_NIEBLA_M, NIEBLA_TOTAL, lejosDeNiebla, llamadasDe, lotesQueSeInstancian, tapadoPorNiebla } from "../packages/render/src/dibujo-politica.ts";

test("the fog's far end: a linear fog covers everything from `far` on; no fog cuts nothing", () => {
  assert.equal(lejosDeNiebla({ isFog: true, near: 35, far: 110 }), 110); // the Ayuntamiento's desert fog
  assert.equal(lejosDeNiebla(null), Infinity);
  assert.equal(lejosDeNiebla(undefined), Infinity);
  assert.equal(lejosDeNiebla({ isFog: true, near: 1e5, far: 2e5 }), 2e5); // the map pushes the fog away: nothing near is cut
  assert.equal(lejosDeNiebla({ isFog: true, near: 0, far: 0 }), Infinity); // a broken fog never hides the world
});

test("an exponential fog: cut where 1 − e^−(d·z)² reaches NIEBLA_TOTAL, never before", () => {
  const d = 0.02, z = lejosDeNiebla({ isFogExp2: true, density: d });
  assert.ok(Math.abs(1 - Math.exp(-((d * z) ** 2)) - NIEBLA_TOTAL) < 1e-9);
  assert.ok(1 - Math.exp(-((d * (z - 1)) ** 2)) < NIEBLA_TOTAL); // one metre nearer something still shows
  assert.equal(lejosDeNiebla({ isFogExp2: true, density: 0 }), Infinity);
  assert.ok(NIEBLA_TOTAL >= 1 - 1 / 255, "a pixel at this fog is the fog's colour in 8 bits");
});

test("a sphere is cut only when ALL of it is past the fog (radius and margin count)", () => {
  const lejos = 110;
  assert.equal(tapadoPorNiebla(0, 0, 120, 2, lejos), true);   // the relay's hidden avatars at z 120: cut
  assert.equal(tapadoPorNiebla(0, 0, 105, 2, lejos), false);  // inside the fog's last metres: still drawn
  assert.equal(tapadoPorNiebla(0, 0, lejos + 2 + MARGEN_NIEBLA_M - 0.01, 2, lejos), false); // its near side still shows
  assert.equal(tapadoPorNiebla(0, 0, lejos + 2 + MARGEN_NIEBLA_M + 0.01, 2, lejos), true);
  assert.equal(tapadoPorNiebla(80, 30, 80, 1, lejos), true);  // 117 m on a diagonal (and high up) counts as 117
  assert.equal(tapadoPorNiebla(0, 0, 1000, 1, Infinity), false); // no fog: never
  assert.equal(tapadoPorNiebla(0, 0, 150, 60, lejos), false); // a big building whose front is in the fog: drawn
});

test("copies drawn together: from INSTANCIAR_DESDE on, a model's copies cost its parts once", () => {
  assert.equal(INSTANCIAR_DESDE, 4);
  const elegidos = lotesQueSeInstancian(new Map([["banco|", 200], ["mesa|", 3], ["mesa|#ff0000", 4], ["arbol|", 1]]));
  assert.deepEqual([...elegidos].sort(), ["banco|", "mesa|#ff0000"]);
  assert.equal(llamadasDe(3, 200), 3);   // 200 baked benches of 3 materials: 3 calls (before: 600)
  assert.equal(llamadasDe(3, 3), 9);     // three stay as they were
  assert.equal(llamadasDe(1, 0), 0);
  // N1's «bloque» world: 2.000 copies of one model drew 1.179 calls on PC; now 1 per material
  assert.equal(llamadasDe(1, 2000), 1);
});

test("MIS-200: in a headset two identical copies already go together; off it the threshold stays 4", () => {
  assert.equal(INSTANCIAR_DESDE_VR, 2);
  assert.equal(instanciarDesde(true), 2);
  assert.equal(instanciarDesde(false), INSTANCIAR_DESDE);
  const cuentas = new Map([["ot|", 3], ["ob1|", 3], ["o49|", 2], ["pnj:alma|", 2], ["solo|", 1], ["o4a|", 10]]);
  assert.deepEqual([...lotesQueSeInstancian(cuentas, instanciarDesde(false))], ["o4a|"]);                       // flat page: as before
  assert.deepEqual([...lotesQueSeInstancian(cuentas, instanciarDesde(true))].sort(), ["ob1|", "o49|", "o4a|", "ot|", "pnj:alma|"].sort()); // headset: a single copy still draws itself
  assert.equal(llamadasDe(3, 2, instanciarDesde(true)), 3);   // a 3-material prop twice: 3 calls per eye instead of 6
  assert.equal(llamadasDe(3, 2, instanciarDesde(false)), 6);
  assert.equal(llamadasDe(3, 1, instanciarDesde(true)), 3);   // one copy costs the same either way
});
