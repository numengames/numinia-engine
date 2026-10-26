// MIS-222 t_1b395abe · J18b story 2–3: a trazo@1 becomes a tube (trazo-tubo.ts, pure) and a thing of kind «trazo» is drawn from its file
// (trazo.ts, three.js headless): vertex/triangle counts, a round section, no twisting, the pressure, the cap that limits.json publishes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tuboDe, ladosDe, factorPresion, trianguloDe, TRIANGULOS_TRAZO_MAX, PALETA_TRAZO, GROSOR_GRUESO_M } from "../packages/render/src/trazo-tubo.ts";
import { leerTrazo, trazoDe, trianguloTrazosDibujados, TRAZOS_TRIANGULOS_MAX } from "../packages/render/src/trazo.ts";
import { TRAZO, TRAZO_SCHEMA, comprobarTrazo } from "../packages/net/src/ficheros.ts";

const recta = (n: number, grosor = 0.015, p = 1) => ({ color: 3, grosor, puntos: Array.from({ length: n }, (_, i) => [i * 0.02, 0, 0, p]) });
const espiral = (n: number) => ({ color: 1, grosor: 0.01, puntos: Array.from({ length: n }, (_, i) => [Math.round(Math.cos(i / 6) * 100) / 1000 * 3, Math.round(i * 4) / 1000, Math.round(Math.sin(i / 6) * 100) / 1000 * 3, 1]) });
const texto = (o: unknown) => JSON.stringify({ schema: TRAZO_SCHEMA, pincel: "tubo", ...(o as object) });

test("counts: P points · sides vertices plus the caps, (P−1)·sides·2 + 2·sides triangles", () => {
  for (const [n, g] of [[2, 0.015], [10, 0.015], [50, 0.03], [600, 0.06]] as const) {
    const t = tuboDe(recta(n, g)), L = ladosDe(g);
    assert.equal(t.lados, L); assert.equal(t.vertices, n * L + 2 * (L + 1));
    assert.equal(t.triangulos, (n - 1) * L * 2 + 2 * L); assert.equal(t.triangulos, trianguloDe(n, L));
    assert.equal(t.indices.length, t.triangulos * 3); assert.equal(t.posiciones.length, t.vertices * 3);
    for (const i of t.indices) assert.ok(i < t.vertices, "an index points at a vertex that exists");
  }
});
test("the worst stroke (600 points, thick brush) is 9 600 triangles: the number limits.json publishes", () => {
  const t = tuboDe(recta(TRAZO.puntosMax, TRAZO.grosorMax));
  assert.equal(t.triangulos, TRIANGULOS_TRAZO_MAX); assert.equal(TRIANGULOS_TRAZO_MAX, 9600);
  assert.ok(t.vertices < 65536, "fits a 16-bit index");
  const lim = JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")) as { limits?: { key: string; value: number }[] } | { key: string; value: number }[];
  const v = (k: string) => (Array.isArray(lim) ? lim : lim.limits ?? []).find((x) => x.key === k)?.value;
  assert.equal(v("stroke_triangles_max"), TRIANGULOS_TRAZO_MAX); assert.equal(v("stroke_world_triangles_max"), TRAZOS_TRIANGULOS_MAX);
});
test("the sides: 6 fine, 8 thick, 4 for a far copy", () => {
  assert.equal(ladosDe(0.005), 6); assert.equal(ladosDe(GROSOR_GRUESO_M), 8); assert.equal(ladosDe(0.05, true), 4);
  assert.ok(tuboDe(recta(20), { lejos: true }).triangulos < tuboDe(recta(20)).triangulos);
});
test("the section is round: every ring vertex is at the pressure's radius from the line, and the normals are unit and point outwards", () => {
  const g = 0.02, t = tuboDe(recta(5, g, 0.5)), L = t.lados, r = (g / 2) * factorPresion(0.5);
  for (let i = 0; i < 5; i++) for (let k = 0; k < L; k++) {
    const v = (i * L + k) * 3, y = t.posiciones[v + 1]!, z = t.posiciones[v + 2]!;
    assert.ok(Math.abs(Math.hypot(y, z) - r) < 1e-5, `ring ${i} vertex ${k}`);
    assert.ok(Math.abs(Math.hypot(t.normales[v]!, t.normales[v + 1]!, t.normales[v + 2]!) - 1) < 1e-5);
    assert.ok(t.normales[v + 1]! * y + t.normales[v + 2]! * z > 0, "outwards");
  }
});
test("pressure swells the width ±40 %", () => {
  assert.equal(factorPresion(0), 0.6); assert.equal(factorPresion(1), 1.4); assert.equal(factorPresion(0.5), 1); assert.equal(factorPresion(7), 1.4); assert.equal(factorPresion(-1), 0.6);
  const rad = (p: number) => { const t = tuboDe(recta(3, 0.02, p)); return Math.hypot(t.posiciones[1]!, t.posiciones[2]!); };
  assert.ok(rad(1) > rad(0.5) && rad(0.5) > rad(0));
});
test("no twisting in a spiral: consecutive rings keep their first vertex close (parallel transport), all numbers finite", () => {
  const t = tuboDe(espiral(120)), L = t.lados;
  for (const x of t.posiciones) assert.ok(Number.isFinite(x)); for (const x of t.normales) assert.ok(Number.isFinite(x));
  let mayor = 0;
  for (let i = 1; i < 120; i++) { const a = i * L * 3, b = (i - 1) * L * 3; mayor = Math.max(mayor, Math.hypot(t.posiciones[a]! - t.posiciones[b]!, t.posiciones[a + 1]! - t.posiciones[b + 1]!, t.posiciones[a + 2]! - t.posiciones[b + 2]!)); }
  assert.ok(mayor < 0.08, `the first vertex of a ring jumped ${mayor.toFixed(3)} m from the previous ring: the tube twisted`);
});
test("a stroke going straight up (the tangent along the helper axis) and one that doubles back still give finite tubes", () => {
  const arriba = tuboDe({ color: 0, grosor: 0.01, puntos: [[0, 0, 0, 1], [0, 0.05, 0, 1], [0, 0.1, 0, 1]] });
  const vuelta = tuboDe({ color: 0, grosor: 0.01, puntos: [[0, 0, 0, 1], [0.05, 0, 0, 1], [0, 0, 0.0001, 1]] });
  for (const t of [arriba, vuelta]) { assert.ok(t.triangulos > 0); for (const x of t.posiciones) assert.ok(Number.isFinite(x)); for (const x of t.normales) assert.ok(Number.isFinite(x)); }
});
test("repeated points are skipped; fewer than two distinct points draw nothing and never throw", () => {
  assert.equal(tuboDe({ color: 0, grosor: 0.01, puntos: [[0, 0, 0, 1], [0, 0, 0, 1]] }).triangulos, 0);
  assert.equal(tuboDe({ color: 0, grosor: 0.01, puntos: [] }).triangulos, 0);
  assert.equal(tuboDe({ color: 0, grosor: 0.01, puntos: [[0, 0, 0, 1], [0, 0, 0, 1], [0.1, 0, 0, 1]] }).triangulos, trianguloDe(2, 6));
});
test("the palette has the eight colours trazo@1 allows, all «#rrggbb»", () => {
  assert.equal(PALETA_TRAZO.length, TRAZO.colores); for (const c of PALETA_TRAZO) assert.match(c, /^#[0-9A-F]{6}$/);
});

// ---- the thing in the world: a file's text becomes a mesh, and the world's triangle cap holds ----
test("leerTrazo reads what the server accepted and refuses the rest in words", () => {
  assert.equal(leerTrazo(texto({ color: 2, grosor: 0.01, puntos: [[0, 0, 0, 1], [0.01, 0, 0, 1]] })).color, 2);
  for (const mal of ["no json", texto({ color: 9, grosor: 0.01, puntos: [[0, 0, 0, 1], [1, 0, 0, 1]] }), texto({ color: 1, grosor: 1, puntos: [[0, 0, 0, 1], [1, 0, 0, 1]] }), texto({ color: 1, grosor: 0.01, puntos: [[0, 0, 0, 1]] }), texto({ color: 1, grosor: 0.01, puntos: [[0, 0, 0, 1], [0, 0, "a", 1]] })])
    assert.throws(() => leerTrazo(mal));
});
test("trazoDe builds a mesh with the shared colour of the palette and gives its triangles back on soltar", () => {
  const antes = trianguloTrazosDibujados();
  const m = trazoDe(texto(recta(30)));
  const malla = m.obj as unknown as { isMesh: boolean; geometry: { index: { count: number } }; material: { color: { getHexString(): string } } };
  assert.ok(malla.isMesh); assert.equal(malla.geometry.index.count / 3, trianguloDe(30, 6));
  assert.equal(malla.material.color.getHexString().toUpperCase(), PALETA_TRAZO[3]!.slice(1));
  assert.equal(trianguloTrazosDibujados(), antes + trianguloDe(30, 6));
  const otro = trazoDe(texto(recta(10))); assert.equal((otro.obj as unknown as { material: unknown }).material, malla.material, "one material per colour");
  m.soltar(); m.soltar(); otro.soltar();
  assert.equal(trianguloTrazosDibujados(), antes, "soltar (twice) gives the triangles back exactly once");
});
test("the world's cap: a stroke that would pass 300 000 triangles is refused with the reason, the ones already drawn stay", () => {
  const llenos: { soltar(): void }[] = [];
  const completo = texto(recta(600, 0.06));
  while (trianguloTrazosDibujados() + TRIANGULOS_TRAZO_MAX <= TRAZOS_TRIANGULOS_MAX) llenos.push(trazoDe(completo));
  assert.equal(llenos.length, 31, "31 full strokes fit 300 000");
  assert.throws(() => trazoDe(completo), /todos los trazos que caben/);
  assert.equal(trianguloTrazosDibujados(), 31 * 9600, "a refused stroke costs nothing");
  llenos[0]!.soltar(); assert.doesNotThrow(() => trazoDe(texto(recta(100))), "room again after one is taken away");
  for (const m of llenos.slice(1)) m.soltar();
});
