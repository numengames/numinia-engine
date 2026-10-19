// Spike «materia de bloques» (D-058): the block-matter layer's numbers and formulas (materia-politica.ts) — tier caps and
// their triangle budget, the 80/20 opaque/translucent split, the shapes' surface sampling and the one-progress animation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOQUES_PIEZA, PIEZAS_MAX, LLAMADAS_PIEZA, TRANSLUCIDO, PALETA, DADOS, TRIS_DADO, MEZCLA, MEZCLA_INICIAL, D8_D20_MIN, COSTE_TRIS, mezcla, trisEnviados, trisUtiles, llamadas, repartirDados, d10, NACER, trisMax, reparto, cuantos, lado, tCubo, tamano, posicion, disperso, muestrear, muestrearMalla, areaForma, rng } from "../packages/render/src/materia-politica.ts";
import type { Forma, V3 } from "../packages/render/src/materia-politica.ts";
import { LUCES_MAX, TURQUESA } from "../packages/render/src/teletransporte-politica.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];

test("materia: caps per tier fall from A to D, D draws nothing (like the teleport's light)", () => {
  assert.deepEqual(BLOQUES_PIEZA, { A: 4000, B: 800, C: 500, D: 0 });
  for (let k = 1; k < NIVELES.length; k++) assert.ok(BLOQUES_PIEZA[NIVELES[k]] <= BLOQUES_PIEZA[NIVELES[k - 1]] || NIVELES[k] === "C");
  assert.equal(PIEZAS_MAX.D, 0);
  assert.equal(LUCES_MAX.D, 0);
  assert.equal(LLAMADAS_PIEZA, 2);
});

test("materia: dice set triangles; the mix's cost depends on the METHOD (the honest table)", () => {
  assert.deepEqual(TRIS_DADO, { d4: 4, d6: 12, d8: 8, d10: 20, d12: 36, d20: 20 });
  // all six back to back: every particle submits 100 whatever its own die — the mix does NOT change the cost
  assert.equal(trisEnviados(MEZCLA_INICIAL, "pegados"), 100);
  assert.equal(trisEnviados(MEZCLA.A, "pegados"), 100);
  assert.equal(trisEnviados({ d4: 0.9, d6: 0.02, d8: 0.02, d10: 0.02, d12: 0.02, d20: 0.02 }, "pegados"), 100);
  // padded slots: the max die present (36 with a d12, 20 without) — only WHICH dice are in changes it
  assert.equal(trisEnviados(MEZCLA_INICIAL, "relleno"), 36);
  assert.equal(trisEnviados(MEZCLA.B, "relleno"), 20);
  // separate draws: exactly the mix's average, at 2 calls per die present
  assert.ok(Math.abs(trisEnviados(MEZCLA_INICIAL, "separados") - 14.6) < 1e-9);
  assert.equal(llamadas(MEZCLA_INICIAL, "separados"), 12);
  assert.equal(llamadas(MEZCLA_INICIAL, "relleno"), 2);
  assert.equal(llamadas(MEZCLA_INICIAL, "pegados"), 2);
  assert.equal(trisMax("D"), 0);
});

test("materia: mix by performance — d8+d20 ≥ 50 % on every tier, sums to 1, cheap tiers lean on cheap dice", () => {
  const orden: Nivel[] = ["A", "C", "B", "D"]; // from richest to poorest
  for (const n of orden) {
    const m = mezcla(n);
    assert.ok(Math.abs(DADOS.reduce((s, d) => s + m[d], 0) - 1) < 1e-9, n);
    assert.ok(m.d8 + m.d20 >= D8_D20_MIN - 1e-9, `${n}: ${m.d8 + m.d20}`);
    for (const d of DADOS) assert.ok(m[d] >= 0);
  }
  // monotonic shift: the average triangles of the mix fall, the cheapest die's share rises, the dearest's never rises
  for (let k = 1; k < orden.length; k++) {
    const a = mezcla(orden[k - 1]), b = mezcla(orden[k]);
    assert.ok(trisUtiles(b) < trisUtiles(a), `${orden[k]} not cheaper than ${orden[k - 1]}`);
    assert.ok(b.d4 >= a.d4 && b.d8 >= a.d8, orden[k]);
    assert.ok(b.d12 <= a.d12, orden[k]);
  }
  // with weights ∝ 1/cost the cheaper die never gets less than a dearer one (A, before any rule kicks in)
  const A = mezcla("A");
  assert.ok(A.d6 > A.d12 && A.d20 > A.d12);
  // real GPU ms plug in the same way: a die made dear loses share
  const caro = mezcla("A", { ...COSTE_TRIS, d6: 1000 });
  assert.ok(caro.d6 < A.d6);
  // even if the costs punish d8 and d20, the art rule holds
  const contra = mezcla("B", { ...COSTE_TRIS, d8: 500, d20: 500 });
  assert.ok(contra.d8 + contra.d20 >= D8_D20_MIN - 1e-9);
});

test("materia: dice quotas are exact and the d10 is a closed, flat solid", () => {
  const q = repartirDados(1000, MEZCLA_INICIAL, 3), cuenta = DADOS.map((_, k) => q.filter((x) => x === k).length);
  assert.deepEqual(cuenta, [100, 150, 350, 100, 100, 200]);
  const { pos, nor } = d10();
  assert.equal(pos.length, 60 * 3);
  // every face points outwards (normal · centroid > 0)
  for (let t = 0; t < 20; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cx += pos[(t * 3 + k) * 3]; cy += pos[(t * 3 + k) * 3 + 1]; cz += pos[(t * 3 + k) * 3 + 2]; }
    assert.ok(nor[t * 9] * cx + nor[t * 9 + 1] * cy + nor[t * 9 + 2] * cz > 0, `face ${t}`);
  }
  // each kite's two triangles are coplanar (same normal)
  for (let j = 0; j < 10; j++) {
    const n1 = [0, 1, 2].map((k) => nor[(2 * j) * 9 + k]), n2 = [0, 1, 2].map((k) => nor[(2 * j + 1) * 9 + k]);
    assert.ok(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] > 0.995, `kite ${j}`);
  }
});

test("materia: ~80 % opaque / ~20 % translucent, Quest lower, nothing lost", () => {
  assert.equal(TRANSLUCIDO.A, 0.2);
  assert.ok(TRANSLUCIDO.B < TRANSLUCIDO.A);
  for (const n of NIVELES) for (const total of [0, 1, 7, 615, 800, 4000]) {
    const r = reparto(n, total);
    assert.equal(r.opacas + r.translucidas, total);
    assert.ok(r.translucidas <= Math.ceil(total * 0.2));
  }
  assert.deepEqual(reparto("A", 4000), { opacas: 3200, translucidas: 800 });
  assert.deepEqual(reparto("B", 800), { opacas: 720, translucidas: 80 });
});

test("materia: blocks stay big — fewer blocks on a low tier means bigger ones, never smaller", () => {
  const area = areaForma({ tipo: "esfera", radio: 0.7 });
  assert.equal(cuantos(area, "A"), Math.ceil(area / 0.01));        // a Residuo-sized sphere: ~616 blocks of 10 cm
  assert.equal(cuantos(area, "C"), 500);                           // C caps it
  assert.ok(lado(area, cuantos(area, "C")) > lado(area, cuantos(area, "A")));
  assert.ok(lado(area, 4000) >= 0.1);
  assert.equal(cuantos(area, "D"), 0);
});

test("materia: one progress number — scattered at 0 (and not there), exactly in place at 1", () => {
  const destino: V3 = [0.3, 1.1, -0.2];
  for (let i = 0; i < 200; i++) {
    assert.equal(tCubo(i, 0), 0);
    assert.equal(tCubo(i, 1), 1);
    assert.deepEqual(posicion(i, destino, 0.7, 1, "junta").map((x) => +x.toFixed(9)), destino);
    assert.deepEqual(posicion(i, destino, 0.7, 0, "junta"), disperso(i, 0.7, "junta"));
    // monotonic: a block never goes back while the progress rises
    let prev = 0;
    for (let p = 0; p <= 1.0001; p += 0.05) { const t = tCubo(i, p); assert.ok(t >= prev - 1e-12); prev = t; }
  }
  assert.equal(tamano(0, 0), 0);                                    // opaque matter shrinks instead of fading
  assert.ok(tamano(NACER, 0) > 0.5 && tamano(1, 1) === 1);
  // crumbling sends them up and away, above the shape
  for (let i = 0; i < 50; i++) assert.ok(disperso(i, 0.7, "deshace")[1] > 2 * 0.7);
});

test("materia: simple shapes sample their surface, deterministic, in the house palette", () => {
  const formas: Forma[] = [{ tipo: "esfera", radio: 0.7 }, { tipo: "columna", radio: 0.3, alto: 1.4 }, { tipo: "arco", ancho: 1.4, alto: 1.4, grueso: 0.25 }];
  const casa = new Set(PALETA.map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v) => +(v / 255).toFixed(4)).join()));
  for (const f of formas) {
    const a = muestrear(f, 500, 7), b = muestrear(f, 500, 7);
    assert.deepEqual(a.puntos, b.puntos);
    assert.ok(Math.abs(a.area - areaForma(f)) < 1e-9);
    for (let i = 0; i < a.n; i++) {
      const y = a.puntos[i * 3 + 1];
      assert.ok(y >= -1e-6 && y <= 1.4 + 1e-6, `${f.tipo} y=${y}`);
      assert.ok(casa.has([0, 1, 2].map((k) => +a.colores[i * 3 + k].toFixed(4)).join()));
    }
  }
  const e = muestrear({ tipo: "esfera", radio: 0.7 }, 300);
  for (let i = 0; i < e.n; i++) assert.ok(Math.abs(Math.hypot(e.puntos[i * 3], e.puntos[i * 3 + 1] - 0.7, e.puntos[i * 3 + 2]) - 0.7) < 1e-5);
  assert.ok(PALETA.includes(TURQUESA));
});

test("materia: a mesh's triangles are sampled by area (MeshSurfaceSampler's method)", () => {
  // two triangles: one of area 1 (z=0) and one of area 9 (z=5): ~90 % of the points on the big one
  const pos = [0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 5, 3, 0, 5, 0, 6, 5];
  const m = muestrearMalla(pos, null, 2000, 3);
  assert.equal(m.area, 10);
  let grandes = 0;
  for (let i = 0; i < m.n; i++) if (m.puntos[i * 3 + 2] === 5) grandes++;
  assert.ok(grandes > 1700 && grandes < 1900, `${grandes}`);
  assert.equal(muestrearMalla([], null, 10).n, 0);
  const r = rng(1); assert.ok(r() !== r());
});
