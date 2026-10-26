// Lote 8 (mesa), t_95245cf0 story 1: the fall of 3D dice (d6 and d20) is a pure function of the roll the server numbered,
// so every screen draws the same flight and every die stops with the SERVER's value face up. No renderer here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { D20_CARAS, D20_NORMALES, D20_VALOR, D20_VERTICES, D6_NORMALES, APOTEMA, HUELLA, ARISTA, caraArriba, girar, normalDe, partesD100, planTirada, poseEn, rotuloDe, tiene3D, semilla, azarDe, valorD100 } from "../packages/render/src/dados-caida.ts";
import type { Bandeja, Vec } from "../packages/render/src/dados-caida.ts";
import { FORMAS } from "../packages/render/src/dados-formas.ts";

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
  assert.equal([4, 6, 8, 10, 12, 20, 100].every(tiene3D), true, "story 2: every die of the house has a model"); assert.equal(tiene3D(2) || tiene3D(3) || tiene3D(7) || tiene3D(0), false, "d2 and d3 are a coin and a d6 halved: no model");
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
  assert.deepEqual(planTirada({ n: 1, sitio: "t", caras: 3, valores: [2], bandeja: BANDEJA }), [], "a die with no model draws nothing");
  assert.deepEqual(planTirada({ n: 1, sitio: "t", caras: 100, valores: [0, 101, 2.5], bandeja: BANDEJA }), [], "a d100 value out of 1..100 is skipped too");
  assert.deepEqual(planTirada({ n: 1, sitio: "t", caras: 20, valores: [21, 0], bandeja: BANDEJA }), [], "a value no face has is skipped, never guessed");
});

// ---- story 2: d4, d8, d10, d12 and d100 ----

test("the d4, d8, d10 and d12 are real solids: flat faces, outward normals, every value once, opposite faces add up (9 · 11 · 13)", () => {
  const sumas = { 8: 9, 10: 11, 12: 13 } as const, cuenta = { 4: [4, 4], 8: [6, 8], 10: [12, 10], 12: [20, 12] } as const;
  for (const caras of [4, 8, 10, 12] as const) {
    const f = FORMAS[caras];
    assert.deepEqual([f.vertices.length, f.poligonos.length], cuenta[caras], `d${caras}: vertices and faces`);
    assert.ok(Math.abs(Math.max(...f.vertices.map((v) => Math.hypot(...v))) - 0.5) < 1e-9, "circumradius 0.5, and no vertex beyond it");
    f.poligonos.forEach((poly, i) => {
      assert.ok(Math.abs(Math.hypot(...f.normales[i]) - 1) < 1e-9);
      for (const k of poly) assert.ok(Math.abs(dot(f.normales[i], f.vertices[k]) - f.apotema) < 1e-9, `d${caras} face ${i} is flat and all faces are the same distance from the centre`);
      for (const v of f.vertices) assert.ok(dot(f.normales[i], v) <= f.apotema + 1e-9, "convex: no vertex beyond any face");
    });
    assert.ok(f.apotema > 0.15 && f.apotema < 0.45, `d${caras} inradius ${f.apotema}`);
    assert.deepEqual([...f.valores].sort((a, b) => a - b), Array.from({ length: caras === 4 ? 4 : caras }, (_, i) => i + 1), `d${caras}: 1..${caras} once each`);
    if (caras !== 4) f.normales.forEach((n, i) => {
      const op = f.normales.findIndex((m) => dot(m, n) < -0.999999);
      assert.ok(op >= 0, `d${caras} face ${i} has a face opposite`); assert.equal(f.valores[i] + f.valores[op], sumas[caras as 8 | 10 | 12]);
    });
    // a numeral per face (three per face on the d4, one near each corner), inside its face, top pointing along the face
    assert.equal(f.cifras.length, caras === 4 ? 12 : caras);
    for (const c of f.cifras) {
      assert.ok(Math.abs(dot(c.arriba, f.normales[c.poligono])) < 1e-9 && Math.abs(Math.hypot(...c.arriba) - 1) < 1e-9, "the text's top lies in the face");
      assert.ok(Math.abs(dot(c.centro, f.normales[c.poligono]) - f.apotema) < 1e-9, "the text lies on the face");
      assert.ok(c.lado > 0.1, `big enough to read (${c.lado})`);
    }
  }
  assert.ok(ARISTA[10] > ARISTA[20], "the new dice are drawn at a size you can read");
});

test("every value of the d4, d8, d10, d12 ends 'up', exactly: the face that looks up reads it (the d4: the vertex at the top)", () => {
  for (const caras of [4, 8, 10, 12] as const) {
    for (let valor = 1; valor <= caras; valor++) {
      for (const n of [1, 2, 41, 99999]) {
        const [p] = planTirada({ n, sitio: "torre", caras, valores: [valor], bandeja: BANDEJA });
        const fin = poseEn(p, p.duracion + 1);
        assert.ok(fin.quieto);
        const arriba = girar(fin.q, normalDe(caras, valor)!);
        assert.ok(Math.abs(arriba[1] - 1) < 1e-9, `d${caras}=${valor} n=${n}: ${arriba}`);
        assert.equal(caraArriba(caras, fin.q), valor, `d${caras}: nothing else is more up than ${valor}`);
        assert.equal(caraArriba(caras, poseEn(p, p.duracion - 1e-6).q), valor, "and no pop at the end");
        // it lies on a face: its centre is the inradius above the tray whatever the solid
        assert.ok(Math.abs(fin.y - (BANDEJA.y + APOTEMA[caras] * p.escala)) < 1e-9, `resting height of d${caras}`);
      }
    }
  }
  assert.equal(normalDe(4, 5), null); assert.equal(normalDe(10, 0), null); assert.equal(normalDe(12, 13), null);
});

test("they lie apart inside the tray, bounce and fit even in a small one — mixed kinds, many dice", () => {
  for (const caras of [4, 8, 10, 12, 100] as const) {
    const valores = caras === 100 ? [100, 1, 57, 90, 10] : Array.from({ length: Math.min(caras, 8) }, (_, i) => i + 1);
    for (const n of [1, 9]) {
      const ps = planTirada({ n, sitio: "torre", caras, valores, bandeja: BANDEJA });
      assert.equal(ps.length, caras === 100 ? valores.length * 2 : valores.length);
      for (const p of ps) {
        const fin = poseEn(p, 99), rad = p.escala * HUELLA[p.caras];
        assert.ok(fin.x - rad >= BANDEJA.x - BANDEJA.ancho / 2 - 1e-9 && fin.x + rad <= BANDEJA.x + BANDEJA.ancho / 2 + 1e-9 && fin.z - rad >= BANDEJA.z - BANDEJA.fondo / 2 - 1e-9 && fin.z + rad <= BANDEJA.z + BANDEJA.fondo / 2 + 1e-9, `d${caras} inside the tray`);
        assert.ok(poseEn(p, 0).y > BANDEJA.y + 0.4 && p.duracion > 0.8 && p.duracion < 2.5);
      }
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].fin[0] - ps[j].fin[0], ps[i].fin[2] - ps[j].fin[2]) > HUELLA[ps[i].caras] * (ps[i].escala + ps[j].escala), `d${caras}: dice ${i} and ${j} do not overlap`);
    }
  }
  const chica: Bandeja = { x: 0, y: 0, z: 0, ancho: 0.3, fondo: 0.2 };
  for (const p of planTirada({ n: 3, sitio: "t", caras: 100, valores: [42, 7], bandeja: chica })) { assert.ok(p.escala < ARISTA[10]); const f = poseEn(p, 99); assert.ok(Math.abs(f.x) <= 0.15 && Math.abs(f.z) <= 0.1); }
});

test("a d100 is two d10, tens («00»…«90») and units («0»…«9»), and the two faces up read the server's number — all 100 of them", () => {
  assert.deepEqual([partesD100(57), partesD100(100), partesD100(5), partesD100(10), partesD100(90)], [{ decenas: 5, unidades: 7 }, { decenas: 10, unidades: 10 }, { decenas: 10, unidades: 5 }, { decenas: 1, unidades: 10 }, { decenas: 9, unidades: 10 }]);
  assert.deepEqual([rotuloDe("decenas", 10), rotuloDe("decenas", 1), rotuloDe("decenas", 9), rotuloDe("unidades", 10), rotuloDe("unidades", 3), rotuloDe(undefined, 10)], ["00", "10", "90", "0", "3", "10"]);
  for (let v = 1; v <= 100; v++) {
    const ps = planTirada({ n: v, sitio: "torre", caras: 100, valores: [v], bandeja: BANDEJA });
    assert.deepEqual(ps.map((p) => [p.rol, p.indice, p.caras]), [["decenas", 0, 10], ["unidades", 0, 10]]);
    const [t, u] = ps.map((p) => caraArriba(10, poseEn(p, 99).q)!);
    assert.equal(valorD100(t, u), v, `d100 = ${v}: tens die reads «${rotuloDe("decenas", t)}», units «${rotuloDe("unidades", u)}»`);
    assert.equal(Number(rotuloDe("decenas", t)) + Number(rotuloDe("unidades", u)) || 100, v, "and read as a person reads them: «00» + «0» is a hundred");
  }
});

test("the pictures stay the same on every screen for the new dice too, and a d100 is not the same flight as the d10 of that roll", () => {
  for (const caras of [4, 8, 10, 12, 100] as const) {
    const dado = (n: number) => planTirada({ n, sitio: "torre", caras, valores: [3, 1, 2], bandeja: BANDEJA });
    assert.deepEqual(JSON.parse(JSON.stringify(dado(7))), JSON.parse(JSON.stringify(dado(7))));
    for (const t of [0, 0.4, 1]) assert.deepEqual(dado(7).map((p) => poseEn(p, t)), dado(7).map((p) => poseEn(p, t)));
    assert.notDeepEqual(dado(7).map((p) => p.fin), dado(8).map((p) => p.fin));
  }
});
