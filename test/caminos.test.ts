// Glowing paths on the floor (entorno.json `caminos`): the file's checker, the flat text, the server keeping them the file's,
// the geometry and what each device tier draws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarEntorno, leerCaminos, aFichero, porDefecto } from "../features/entorno/esquema.ts";
import { baseDelMundo } from "../features/entorno/server.ts";
import * as THREE from "three/webgpu";
import { crearCaminos } from "../packages/render/src/caminos.ts";
import { decodificarCaminos, detalleCaminos, geometriaCaminos, cercaDeCamino, CAMINOS_MAX, PULSO_CADA_M, PULSO_VEL, PULSO_PERIODO_S } from "../packages/render/src/caminos-politica.ts";
import { CAMINOS_MAX as MAX_FEATURE } from "../features/entorno/feature.ts";

const FILE = { schema: "numinia-engine/entorno@1", caminos: [{ desde: [0, 0], hasta: [30, 0] }, { desde: [0, 0], hasta: [0, -40.126] }], caminosColor: "#ffd27f" };

test("a world declares its paths and colour; they ride the flat state as one text", () => {
  const r = validarEntorno(FILE);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  if (!r.ok) return;
  assert.equal(r.value.caminos, "0,0,30,0;0,0,0,-40.13");
  assert.equal(r.value.caminosColor, 0xffd27f);
  assert.deepEqual(aFichero(r.value).caminos, [{ desde: [0, 0], hasta: [30, 0] }, { desde: [0, 0], hasta: [0, -40.13] }]);
  assert.equal(aFichero(r.value).caminosColor, "#ffd27f");
});

test("a world without paths is untouched: nothing in the state, nothing in the file", () => {
  const r = validarEntorno({ schema: "numinia-engine/entorno@1" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.caminos, "");
  assert.equal("caminos" in aFichero(r.value), false);
  assert.equal(porDefecto().caminos, "");
});

test("mistakes name the path in the file and how to fix it", () => {
  const malo = leerCaminos({ caminos: [{ desde: [0, 0], hasta: [0, 0] }, { desde: [1] , hasta: [2, 3] }, "x"], caminosColor: "rojo" });
  assert.ok(!malo.ok);
  if (malo.ok) return;
  const rutas = malo.issues.map((i) => i.path);
  assert.deepEqual(rutas.sort(), ["entorno.caminos[0]", "entorno.caminos[1].desde", "entorno.caminos[2]", "entorno.caminosColor"].sort());
  assert.ok(!leerCaminos({ caminos: "no" }).ok);
  assert.ok(!leerCaminos({ caminos: Array.from({ length: CAMINOS_MAX + 1 }, (_, i) => ({ desde: [0, 0], hasta: [i + 1, 0] })) }).ok);
  assert.ok(!leerCaminos({ caminos: [{ desde: [0, 0], hasta: [99999, 0] }] }).ok);
  assert.equal(CAMINOS_MAX, MAX_FEATURE, "render and feature agree on the maximum");
});

test("the server puts the world's file's paths back: a saved state with others is corrected at start", () => {
  const base = baseDelMundo(FILE);
  assert.equal(base.caminos, "0,0,30,0;0,0,0,-40.13");
  assert.equal(baseDelMundo(undefined).caminos, "");
  // the text fits the field (every path at its widest)
  const ancho = Array.from({ length: CAMINOS_MAX }, () => "-1960.25,-1960.25,-1960.25,-1960.25").join(";");
  assert.ok(new TextEncoder().encode(ancho).length <= 512);
});

test("the page decodes the text, skipping bad pieces; one strip (4 vertices) per path", () => {
  const c = decodificarCaminos("0,0,30,0;oops;1,1,1,1;0,0,0,-40");
  assert.equal(c.length, 2, "bad and zero-length pieces are skipped");
  const g = geometriaCaminos(c, 0.5);
  assert.equal(g.posicion.length, 2 * 4 * 3);
  assert.equal(g.indices.length, 12);
  assert.deepEqual([...g.a.slice(0, 8)], [0, 1, 0, -1, 30, 1, 30, -1], "metres along, −1…1 across");
  assert.ok(g.indices.every((i) => i < 8));
  assert.equal(Math.abs(g.posicion[2] - g.posicion[5]), 0.5, "the strip is as wide as asked");
  assert.deepEqual(decodificarCaminos(""), []);
});

test("phones stay cool: only the desktop tier animates; the others draw the strip still", () => {
  assert.equal(detalleCaminos("A").animado, true);
  for (const n of ["B", "C", "D"] as const) assert.equal(detalleCaminos(n).animado, false, n);
  assert.equal(detalleCaminos("D").pulsos, false);
  assert.ok(detalleCaminos("C").ancho <= detalleCaminos("A").ancho);
});

test("frames are asked for only while the player is near a path", () => {
  const c = decodificarCaminos("0,0,30,0");
  assert.equal(cercaDeCamino(c, 15, 50), true);
  assert.equal(cercaDeCamino(c, 15, 500), false);
  assert.equal(cercaDeCamino(c, 120, 0), true, "beyond the end: distance to the end point");
  assert.equal(cercaDeCamino(c, 400, 0), false);
});

test("reduce motion freezes the pulse on tier A too: the strip is drawn, nothing runs, no frames are asked for", () => {
  assert.equal(detalleCaminos("A").animado, true);
  assert.equal(detalleCaminos("A", true).animado, false);
  assert.equal(detalleCaminos("A", true).ancho, detalleCaminos("A").ancho, "only the running stops: same strip");
  for (const n of ["B", "C", "D"] as const) assert.deepEqual(detalleCaminos(n, true), detalleCaminos(n));
  let reducido = false;
  const padre = new THREE.Group();
  const c = crearCaminos({ padre, nivel: () => "A", yo: () => ({ x: 0, z: 0 }), reducido: () => reducido });
  c.aplicar({ caminos: "0,0,30,0", caminosColor: 0x7fe8ff });
  assert.equal(padre.children.length, 1);
  assert.equal(c.estado().animado, true);
  assert.equal(c.ocupado(), true, "tier A near a path asks for frames");
  reducido = true; // the person turns «reduce motion» on while playing
  c.actualizar(0.016);
  assert.equal(c.estado().animado, false, "frozen");
  assert.equal(c.estado().dibujados, 1, "still drawn");
  assert.equal(c.ocupado(), false, "no frames asked for: a still page stays still");
  reducido = false;
  c.actualizar(0.016);
  assert.equal(c.estado().animado, true, "and back");
});

test("the pulse clock wraps by the pattern's own period, so the wrap cannot jump the phase", () => {
  assert.equal(PULSO_PERIODO_S, PULSO_CADA_M / PULSO_VEL);
  const fase = (along: number, t: number) => { const f = along / PULSO_CADA_M - (t * PULSO_VEL) / PULSO_CADA_M; return f - Math.floor(f); };
  for (const along of [0, 1.3, 17.9, 250]) for (const t of [0, 0.7, 1.9]) assert.ok(Math.abs(fase(along, t) - fase(along, t + PULSO_PERIODO_S)) < 1e-9 || Math.abs(Math.abs(fase(along, t) - fase(along, t + PULSO_PERIODO_S)) - 1) < 1e-9);
  // the old `t % 1000` did jump: 1000 s is 416.67 periods
  assert.ok(Math.abs(1000 / PULSO_PERIODO_S - Math.round(1000 / PULSO_PERIODO_S)) > 0.1);
});
