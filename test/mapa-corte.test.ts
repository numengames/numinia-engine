// U14: a world's map cut at a height (entorno `mapa.corte`) — the pure parts: where a level plane cuts a mesh's
// triangles (packages/render/src/corte.ts), which footprints a cut map still draws, and how the picture and the cut's
// segments are laid under a turned minimap (packages/client/src/mapa.ts). The GPU picture itself is checked with photos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cortarMalla, bajoElCorte } from "../packages/render/src/corte.ts";
import { proyectar, matrizImagen, segmentosEnVista } from "../packages/client/src/mapa.ts";
import type { Vista } from "../packages/client/src/mapa.ts";

const cerca = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const IDENTIDAD = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// a box 2 × 4 (x × y) × 1 (z) from y 0 to 4, 12 triangles, indexed
function caja(): { pos: number[]; idx: number[] } {
  const pos = [0, 0, 0, 2, 0, 0, 2, 0, 1, 0, 0, 1, 0, 4, 0, 2, 4, 0, 2, 4, 1, 0, 4, 1];
  const idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
  return { pos, idx };
}
const largo = (s: number[]) => { let l = 0; for (let i = 0; i < s.length; i += 4) l += Math.hypot(s[i + 2] - s[i], s[i + 3] - s[i + 1]); return l; };

test("a box cut half way up gives its outline: 8 segments, the perimeter long, on the box's sides", () => {
  const { pos, idx } = caja(), out: number[] = [];
  assert.equal(cortarMalla(pos, idx, IDENTIDAD, 2, out), 8, "two triangles per side, four sides; top and bottom are not crossed");
  assert.equal(out.length, 32);
  cerca(largo(out), 6, 1e-9);
  for (let i = 0; i < out.length; i += 2) assert.ok([0, 2].includes(out[i]) || [0, 1].includes(out[i + 1]), `(${out[i]}, ${out[i + 1]}) is on a side`);
  assert.equal(cortarMalla(pos, idx, IDENTIDAD, 5, []), 0, "a cut above the box: nothing");
  assert.equal(cortarMalla(pos, idx, IDENTIDAD, -1, []), 0, "below it: nothing");
});

test("the mesh's world matrix moves, scales and turns the cut; the plane is in world metres", () => {
  const { pos, idx } = caja();
  // scale 3 in y (the box is 12 m tall), moved to x 10, z -5; cut at 6 m = half way up
  const m = [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 10, 0, -5, 1], out: number[] = [];
  assert.equal(cortarMalla(pos, idx, m, 6, out), 8);
  for (let i = 0; i < out.length; i += 2) { assert.ok(out[i] >= 10 - 1e-9 && out[i] <= 12 + 1e-9); assert.ok(out[i + 1] >= -5 - 1e-9 && out[i + 1] <= -4 + 1e-9); }
  // turned 90° about y: x becomes -z
  const r = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], o2: number[] = [];
  cortarMalla(pos, idx, r, 1, o2);
  for (let i = 0; i < o2.length; i += 2) { assert.ok(o2[i] >= -1e-9 && o2[i] <= 1 + 1e-9, `x ${o2[i]}`); assert.ok(o2[i + 1] <= 1e-9 && o2[i + 1] >= -2 - 1e-9, `z ${o2[i + 1]}`); }
});

test("without an index every three vertices are one triangle; a triangle in the plane or touching it at a corner gives nothing", () => {
  const { pos, idx } = caja(), plano: number[] = [];
  for (const i of idx) plano.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const out: number[] = [];
  assert.equal(cortarMalla(plano, null, IDENTIDAD, 2, out), 8);
  cerca(largo(out), 6, 1e-9);
  assert.equal(cortarMalla([0, 1, 0, 1, 1, 0, 0, 1, 1], null, IDENTIDAD, 1, []), 0, "lying in the plane");
  assert.equal(cortarMalla([0, 1, 0, 1, 2, 0, 0, 2, 1], null, IDENTIDAD, 1, []), 0, "touching it at one corner");
  const borde: number[] = [];
  assert.equal(cortarMalla([0, 0, 0, 1, 2, 0, 0, 1, 0], null, IDENTIDAD, 1, borde), 1, "one corner on it, the others on both sides: one segment");
  cerca(borde[0], 0.5); cerca(borde[2], 0);
});

test("a cut map draws no footprint of what is taller than the cut (the building), and all of them without a cut", () => {
  const hs = [{ y1: 23, n: "nave" }, { y1: 2.5, n: "puesto" }, { y1: 6, n: "justo" }, { n: "cargando" }];
  assert.deepEqual(bajoElCorte(hs, 6).map((h) => h.n), ["puesto", "justo", "cargando"]);
  assert.deepEqual(bajoElCorte(hs, 0).map((h) => h.n), ["nave", "puesto", "justo", "cargando"]);
  assert.notEqual(bajoElCorte(hs, 0), hs, "a copy: the page may keep both");
});

test("the zone's picture lies under the minimap like everything else on it, turned or not", () => {
  const img = { x0: -40, z0: -60, x1: 60, z1: 40, px: 512 };
  for (const giro of [0, 0.7, -2.1, Math.PI]) {
    const v: Vista = { cx: 3, cz: -7, escala: 1.6, giro, ancho: 170, alto: 170 };
    const [a, b, c, d, e, f] = matrizImagen(v, img);
    // picture pixel (u, v) → canvas: (a u + c v + e, b u + d v + f); its corners must land where their metres project
    for (const [u, w, x, z] of [[0, 0, -40, -60], [512, 0, 60, -60], [0, 512, -40, 40], [512, 512, 60, 40], [256, 128, 10, -35]]) {
      const p = proyectar(v, x, z);
      cerca(a * u + c * w + e, p.px, 1e-9); cerca(b * u + d * w + f, p.py, 1e-9);
    }
  }
});

test("the cut's segments in view come out as map pixels; those beyond the edge are left out; the buffer is reused", () => {
  const v: Vista = { cx: 0, cz: 0, escala: 2, giro: 0.4, ancho: 100, alto: 100 };
  const seg = new Float32Array([0, 0, 10, 0, 500, 500, 510, 500, -10, -10, -10, 10]);
  const out = new Float32Array(12);
  assert.equal(segmentosEnVista(v, seg, out), 2, "the far one is out");
  const a = proyectar(v, 0, 0), b = proyectar(v, 10, 0), c = proyectar(v, -10, 10);
  cerca(out[0], a.px, 1e-4); cerca(out[1], a.py, 1e-4); cerca(out[2], b.px, 1e-4); cerca(out[3], b.py, 1e-4);
  cerca(out[6], c.px, 1e-4); cerca(out[7], c.py, 1e-4);
  // one crossing the view with both ends outside on different sides stays
  assert.equal(segmentosEnVista(v, new Float32Array([-200, 0, 200, 0]), out), 1);
  assert.equal(segmentosEnVista(v, new Float32Array(0), out), 0);
});
