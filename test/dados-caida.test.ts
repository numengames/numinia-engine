// Lote 8 (mesa), t_95245cf0 story 1: the fall of 3D dice (d6 and d20) is a pure function of the roll the server numbered,
// so every screen draws the same flight and every die stops with the SERVER's value face up. No renderer here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { D20_CARAS, D20_NORMALES, D20_VALOR, D20_VERTICES, D6_NORMALES, APOTEMA, HUELLA, caraArriba, girar, normalDe, planTirada, poseEn, tiene3D, semilla, azarDe } from "../packages/render/src/dados-caida.ts";
import type { Bandeja, Vec } from "../packages/render/src/dados-caida.ts";

const BANDEJA: Bandeja = { x: 3.08, y: 0.89, z: 0.62, ancho: 0.8, fondo: 0.6 };
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("the d20 is a real icosahedron: 20 faces, opposite faces add 21, every value 1..20 once; the d6 adds 7", () => {
  assert.equal(D20_VERTICES.length, 12); assert.equal(D20_CARAS.length, 20);
  assert.deepEqual([...D20_VALOR].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  D20_NORMALES.forEach((n, i) => {
    const op = D20_NORMALES.findIndex((m) => dot(m, n) < -0.999999);
    assert.ok(op >= 0, `face ${i} has an opposite`); assert.equal(D20_VALOR[i] + D20_VALOR[op], 21);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9);
  });
  // the inscribed-sphere constant used to rest the die on a face: edge 2 → 1.5115
  const c = D20_CARAS[0], V = D20_VERTICES;
  const centro: Vec = [(V[c[0]][0] + V[c[1]][0] + V[c[2]][0]) / 3, (V[c[0]][1] + V[c[1]][1] + V[c[2]][1]) / 3, (V[c[0]][2] + V[c[1]][2] + V[c[2]][2]) / 3];
  assert.ok(Math.abs(Math.hypot(...centro) / 2 - APOTEMA[20]) < 1e-6, "inradius / edge = 0.7558");
  assert.deepEqual(D6_NORMALES.map((_, i) => dot(D6_NORMALES[i], D6_NORMALES[5 - i])), [-1, -1, -1, -1, -1, -1], "the d6: 1↔6, 2↔5, 3↔4 face to face");
  assert.equal(tiene3D(6) && tiene3D(20), true); assert.equal(tiene3D(100) || tiene3D(4) || tiene3D(8) || tiene3D(12), false, "the others are not drawn yet");
  assert.equal(normalDe(6, 7), null); assert.equal(normalDe(20, 0), null);
});

test("every value of the d6 and the d20 ends face up, exactly, whatever the roll number", () => {
  for (const caras of [6, 20] as const) {
    for (let valor = 1; valor <= caras; valor++) {
      for (const n of [1, 2, 41, 99999]) {
        const [p] = planTirada({ n, sitio: "torre", caras, valores: [valor], bandeja: BANDEJA });
        const fin = poseEn(p, p.duracion + 1);
        assert.ok(fin.quieto);
        const arriba = girar(fin.q, normalDe(caras, valor)!);
        assert.ok(Math.abs(arriba[1] - 1) < 1e-9 && Math.abs(arriba[0]) < 1e-9 && Math.abs(arriba[2]) < 1e-9, `d${caras}=${valor} n=${n}: face up (${arriba})`);
        assert.equal(caraArriba(caras, fin.q), valor, "and no other face is more up than it");
        // the pose just before it stops is already almost there (no pop at the end)
        const casi = poseEn(p, p.duracion - 1e-6);
        assert.ok(Math.hypot(casi.x - fin.x, casi.y - fin.y, casi.z - fin.z) < 1e-3);
        assert.equal(caraArriba(caras, casi.q), valor);
      }
    }
  }
});

test("two screens, same roll, same picture; another roll number or another tower, another one", () => {
  const dado = (n: number, sitio = "torre") => planTirada({ n, sitio, caras: 6, valores: [4, 2, 6], bandeja: BANDEJA });
  assert.deepEqual(JSON.parse(JSON.stringify(dado(7))), JSON.parse(JSON.stringify(dado(7))), "the plan is plain data, the same");
  for (const t of [0, 0.2, 0.55, 0.9, 1.4]) assert.deepEqual(dado(7).map((p) => poseEn(p, t)), dado(7).map((p) => poseEn(p, t)), `pose at ${t}s`);
  assert.notDeepEqual(dado(7).map((p) => p.fin), dado(8).map((p) => p.fin), "the next roll lands elsewhere");
  assert.notDeepEqual(dado(7).map((p) => p.fin), dado(7, "otra").map((p) => p.fin));
  assert.equal(semilla("a"), semilla("a")); const r = azarDe(5); const x = [r(), r(), r()]; const s = azarDe(5); assert.deepEqual(x, [s(), s(), s()]);
  assert.ok(x.every((v) => v >= 0 && v < 1));
});

test("the dice fall from above, bounce and come to rest ON the tray, apart from each other", () => {
  for (const [caras, valores] of [[6, [1, 2, 3, 4, 5, 6, 1, 2, 3, 4]], [20, [20, 1, 7, 13, 2]], [6, [3]]] as const) {
    for (const n of [1, 5, 33]) {
      const ps = planTirada({ n, sitio: "torre", caras, valores, bandeja: BANDEJA });
      assert.equal(ps.length, valores.length);
      for (const p of ps) {
        const ini = poseEn(p, 0);
        assert.ok(ini.y > BANDEJA.y + 0.4, "it starts well above the tray");
        let ant = ini.y, subio = 0, bajo = 0;
        for (let t = 0; t <= p.duracion; t += 0.01) {
          const q = poseEn(p, t);
          assert.ok(q.y >= p.fin[1] - 1e-9, "never under the tray");
          if (q.y > ant + 1e-9) subio++; else if (q.y < ant - 1e-9) bajo++; ant = q.y;
        }
        assert.ok(subio > 5 && bajo > 5, "it bounces (goes down, up, down…)");
        assert.ok(p.duracion > 0.8 && p.duracion < 2.5, `a roll takes about a second and a half (${p.duracion.toFixed(2)})`);
        const fin = poseEn(p, 99);
        assert.ok(Math.abs(fin.y - (BANDEJA.y + APOTEMA[caras] * p.escala)) < 1e-9, "resting on a face: its centre is the inradius above the floor");
        // inside the tray, the whole die (its circumscribed radius)
        const rad = p.escala * HUELLA[caras];
        assert.ok(fin.x - rad >= BANDEJA.x - BANDEJA.ancho / 2 - 1e-9 && fin.x + rad <= BANDEJA.x + BANDEJA.ancho / 2 + 1e-9, `x inside (${fin.x})`);
        assert.ok(fin.z - rad >= BANDEJA.z - BANDEJA.fondo / 2 - 1e-9 && fin.z + rad <= BANDEJA.z + BANDEJA.fondo / 2 + 1e-9, `z inside (${fin.z})`);
      }
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const d = Math.hypot(ps[i].fin[0] - ps[j].fin[0], ps[i].fin[2] - ps[j].fin[2]);
        assert.ok(d > (HUELLA[caras] * (ps[i].escala + ps[j].escala)), `dice ${i} and ${j} do not overlap (${d.toFixed(3)} apart)`);
      }
    }
  }
});

test("a small tray shrinks the dice instead of overflowing; a roll of dice with no model, or a value out of range, draws nothing", () => {
  const chica: Bandeja = { x: 0, y: 0, z: 0, ancho: 0.3, fondo: 0.2 };
  const ps = planTirada({ n: 3, sitio: "t", caras: 6, valores: [1, 2, 3], bandeja: chica });
  assert.ok(ps.every((p) => p.escala < 0.12), "smaller than full size");
  for (const p of ps) { const f = poseEn(p, 99); assert.ok(Math.abs(f.x) <= 0.15 && Math.abs(f.z) <= 0.1); }
  assert.deepEqual(planTirada({ n: 1, sitio: "t", caras: 100, valores: [57], bandeja: BANDEJA }), []);
  assert.deepEqual(planTirada({ n: 1, sitio: "t", caras: 20, valores: [21, 0], bandeja: BANDEJA }), [], "a value no face has is skipped, never guessed");
});
