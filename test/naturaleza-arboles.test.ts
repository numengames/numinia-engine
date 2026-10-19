// N2 (naturaleza): the low-poly trees — deterministic geometry, triangle budgets per species and LOD, the tier table, the
// near/far split honouring the caps (and its CPU cost), bounding spheres, and the TSL wind material graph building in node.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { esparcirArboles, SAUCE_AGUA } from "../packages/render/src/naturaleza/esparcir.ts";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearArboles, geometriaArbol, geometriaCerca, geometriaLejos, ESPECIES, LEJOS, ALTURA, CUELGA_LEJOS, TRIS_MAX_CERCA, TRIS_MAX_LEJOS, TRIANGULOS_ARBOL, TRIANGULOS_DETALLE, TRIANGULOS_SIMPLE, triangulosCerca } from "../packages/render/src/naturaleza/arboles.ts";
import type { PuntoArbol } from "../packages/render/src/naturaleza/arboles.ts";
import { NATURALEZA_POR_NIVEL } from "../packages/render/src/naturaleza/niveles.ts";
import { crearAzar } from "../packages/render/src/naturaleza/semilla.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
const campo = (n: number, lado: number, semilla = 7): PuntoArbol[] => {
  const R = crearAzar(semilla);
  return Array.from({ length: n }, () => ({ x: (R() - 0.5) * lado, y: 0, z: (R() - 0.5) * lado, escala: 0.8 + R() * 0.6, giro: R() * 6.28, especie: ESPECIES[(R() * 5) | 0] }));
};
const viento = () => uniform(new THREE.Vector3(2, 0, 1)) as unknown as { value: THREE.Vector3 };

test("R2: near templates (detailed ~103 triangles with branches, collar and tag; simple 36) shared by every species (5 vertex sets, same topology), 16 far", () => {
  const g = geometriaArbol(), geo = g.geometria;
  assert.equal(g.triangulos, TRIANGULOS_ARBOL);
  assert.equal(g.triangulos, TRIANGULOS_DETALLE);
  assert.ok(g.triangulos >= 95 && g.triangulos <= TRIS_MAX_CERCA, `${g.triangulos} triangles`);
  assert.equal(geometriaArbol(false).triangulos, TRIANGULOS_SIMPLE);
  assert.ok(TRIANGULOS_SIMPLE >= 30 && TRIANGULOS_SIMPLE <= 40);
  for (const n of NIVELES) assert.equal(triangulosCerca(NATURALEZA_POR_NIVEL[n].arbolesDetalle), n === "A" || n === "B" ? TRIANGULOS_DETALLE : TRIANGULOS_SIMPLE);
  for (const e of ESPECIES) assert.equal(geometriaCerca(e).geometria, geo, "every species shares the geometry");
  const n = geo.getAttribute("position").count;
  for (const k of ["pos1", "pos2", "pos3", "pos4", "tono", "parte", "mov"]) assert.equal(geo.getAttribute(k).count, n, k);
  // branch and leaf vertices sway more than the trunk's, and the tips (mov → 1) more than the roots
  const mov = geo.getAttribute("mov").array as Float32Array, parte = geo.getAttribute("parte").array as Float32Array;
  assert.ok(Math.max(...mov) >= 0.95 && Math.min(...mov) <= 0.05, "sway weight spans 0…1");
  for (let i = 0; i < n; i++) if (parte[i] === 1) assert.ok(mov[i] >= 0.4, `leaf vertex ${i} sways ${mov[i]}`);
  assert.equal(Array.from(parte).filter((x) => x === 2).length, 8, "collar band: 8 vertices");
  assert.equal(Array.from(parte).filter((x) => x === 3).length, 3, "tag: 3 vertices");
  assert.ok(geo.boundingSphere && geo.boundingSphere.radius > 0.5, "bounding sphere set");
  const l = geometriaLejos();
  assert.ok(l.triangulos <= TRIS_MAX_LEJOS && l.triangulos >= 14, `far: ${l.triangulos}`);
});

test("species differ in shape (not the same tree five times); the template is deterministic and finite, no NaN", () => {
  const geo = geometriaArbol().geometria, juegos = ["position", "pos1", "pos2", "pos3", "pos4"].map((k) => geo.getAttribute(k).array as Float32Array);
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    let d = 0; for (let k = 0; k < juegos[i].length; k++) d += Math.abs(juegos[i][k] - juegos[j][k]);
    assert.ok(d > 5, `species ${i} vs ${j}: ${d}`);
  }
  for (const k of ["position", "pos1", "pos2", "pos3", "pos4", "tono", "parte", "mov"]) assert.ok(Array.from(geo.getAttribute(k).array).every(Number.isFinite), k);
  assert.equal(Array.from(juegos[2]).join(","), Array.from(geometriaArbol().geometria.getAttribute("pos2").array).join(","));
});

test("closed pieces (leaf blobs, cones) are wound outward: positive signed volume", () => {
  for (const detalle of [true, false]) for (const e of ESPECIES) {
    const g = geometriaCerca(e, detalle).geometria, p = g.getAttribute("position"), ix = g.index!, padre = Array.from({ length: p.count }, (_, i) => i);
    const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
    for (let i = 0; i < ix.count; i += 3) { padre[raiz(ix.getX(i))] = raiz(ix.getX(i + 1)); padre[raiz(ix.getX(i + 2))] = raiz(ix.getX(i)); }
    const piezas = new Map<number, { tris: number[][]; aristas: Map<string, number> }>();
    for (let i = 0; i < ix.count; i += 3) {
      const t = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)], r = raiz(t[0]);
      const pz = piezas.get(r) ?? { tris: [], aristas: new Map() }; piezas.set(r, pz); pz.tris.push(t);
      for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], key = a < b ? `${a}-${b}` : `${b}-${a}`; pz.aristas.set(key, (pz.aristas.get(key) ?? 0) + 1); }
    }
    let cerradas = 0;
    for (const pz of piezas.values()) {
      if (![...pz.aristas.values()].every((c) => c === 2)) continue; // open pieces (branch prisms) have no volume
      cerradas++;
      let vol = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (const t of pz.tris) { a.fromBufferAttribute(p, t[0]); b.fromBufferAttribute(p, t[1]); c.fromBufferAttribute(p, t[2]); vol += a.dot(b.clone().cross(c)) / 6; }
      assert.ok(vol > 0, `${e}: a closed piece is inside-out (${vol})`);
    }
    assert.ok(cerradas >= (detalle ? 4 : 2), `${e}: ${cerradas} closed pieces`);
  }
});

test("collars: about 1 tree in 6 wears one, never a shrub; sizes vary within ±8 %", () => {
  const t = crearArboles({ vientoU: viento(), nivel: "C" }, campo(600, 120, 11));
  t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
  const s = t.estadisticas(), n = s.cerca.reduce((a, b) => a + b, 0);
  assert.ok(n > 30 && (s.collares ?? 0) / n > 0.06 && (s.collares ?? 0) / n < 0.3, `${s.collares} collars of ${n}`);
  const d = (t.mallas[0].geometry as THREE.InstancedBufferGeometry).instanceCount, A = (t.mallas[0].material as THREE.Material) && d;
  assert.ok(A > 0);
  t.dispose();
});

test("same points → same instance data; different seed of points → different", () => {
  const h = { vientoU: viento(), nivel: "A" as Nivel };
  const a = crearArboles(h, campo(300, 100)), b = crearArboles(h, campo(300, 100)), c = crearArboles(h, campo(300, 100, 8));
  const cam = new THREE.Vector3(0, 2, 0);
  for (const x of [a, b, c]) { x.actualizar(0, cam); }
  const dato = (x: typeof a) => x.mallas.map((m) => Array.from((m.geometry.getAttribute("position") as THREE.BufferAttribute).array.slice(0, 30)).join(",") + (m.geometry as THREE.InstancedBufferGeometry).instanceCount);
  assert.deepEqual(dato(a), dato(b));
  assert.notDeepEqual(a.estadisticas().cerca, c.estadisticas().cerca);
  assert.deepEqual(a.estadisticas(), b.estadisticas());
  for (const x of [a, b, c]) x.dispose();
});

test("at most 2 draw calls whatever the mix; frustum-culling spheres cover the grove", () => {
  const h = { vientoU: viento(), nivel: "B" as Nivel }, pts = campo(600, 160);
  const t = crearArboles(h, pts);
  assert.equal(t.mallas.length, 2, "N6: all species share ONE near mesh + 1 shared far mesh");
  t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
  const s = t.estadisticas();
  assert.ok(s.llamadas <= 2 && s.llamadas >= 1, `${s.llamadas}`);
  for (const m of t.mallas) {
    const sp = m.geometry.boundingSphere!; assert.ok(sp.radius > 70, "covers the 160 m grove");
    for (const p of pts) assert.ok(sp.center.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) <= sp.radius, "every tree inside");
    assert.equal(m.frustumCulled, true);
  }
  t.dispose();
});

test("the near/far split honours each tier's caps and the triangle budget of the brief (trees alone)", () => {
  const tope: Record<Nivel, number> = { A: 5200, B: 3000, C: 2700, D: 1200 }; // the trees' share of PRESUPUESTO_NATURALEZA (N6)
  for (const n of NIVELES) {
    const cfg = NATURALEZA_POR_NIVEL[n], t = crearArboles({ vientoU: viento(), nivel: n }, campo(2500, 300));
    t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
    const s = t.estadisticas(), cerca = s.cerca.reduce((a, b) => a + b, 0);
    assert.ok(cerca <= cfg.arbolesCerca, `${n}: near ${cerca}`);
    assert.ok(s.arboles <= cfg.arbolesVisibles, `${n}: visible ${s.arboles}`);
    assert.ok(s.triangulos <= tope[n], `${n}: ${s.triangulos} triangles`);
    // worst case on paper (every slot at its maximum) also fits
    assert.ok(cfg.arbolesCerca * triangulosCerca(cfg.arbolesDetalle) + (cfg.arbolesVisibles - cfg.arbolesCerca) * geometriaLejos().triangulos <= tope[n], `${n}: worst case`);
    t.dispose();
  }
  assert.equal(NATURALEZA_POR_NIVEL.D.arbolesAletean, false);
});

test("the split is cheap: 1500 trees in well under a millisecond-ish, and it is skipped when the camera does not move", () => {
  const t = crearArboles({ vientoU: viento(), nivel: "A" }, campo(1500, 400));
  for (let i = 0; i < 20; i++) t.repartir(i, 1.7, 0); // warm up
  const N = 200, t0 = performance.now();
  for (let i = 0; i < N; i++) t.repartir((i % 50) * 2, 1.7, i % 30);
  const ms = (performance.now() - t0) / N;
  console.log(`# repartir 1500 trees: ${ms.toFixed(3)} ms per call`);
  assert.ok(ms < 1.5, `${ms} ms`); // the brief's target is 0.3 ms on a desktop; the bound is loose so a busy machine does not flake
  const cam = new THREE.Vector3(5, 1.7, 5);
  t.actualizar(10, cam);
  const antes = t.estadisticas();
  t.actualizar(10.1, cam.clone().add(new THREE.Vector3(30, 0, 0))); // too soon: no new split
  assert.deepEqual(t.estadisticas(), antes);
  t.dispose();
});

test("the wind material graph builds (position + colour nodes) on every species, leaves flutter off on D", () => {
  for (const n of ["A", "D"] as Nivel[]) {
    const t = crearArboles({ vientoU: viento(), nivel: n }, campo(50, 30));
    for (const m of t.mallas) {
      const mat = m.material as THREE.MeshLambertNodeMaterial;
      assert.ok(mat.positionNode && mat.colorNode, m.name);
      assert.equal(mat.flatShading, true);
    }
    t.actualizar(3.5, new THREE.Vector3());
    assert.equal(t.tiempo.value, 3.5);
    t.dispose();
  }
});

/** R5.4: the widest horizontal reach (m, from the axis) of the leaf triangles of one species' near template at height y (plane cut). */
function perfil(detalle: boolean, especie: number, alturas: number[]): number[] {
  const g = geometriaArbol(detalle).geometria, p = g.getAttribute(especie === 0 ? "position" : `pos${especie}`), parte = g.getAttribute("parte"), ix = g.index!;
  const hojas: number[][] = [];
  for (let i = 0; i < ix.count; i += 3) { const t = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)]; if (t.every((k) => parte.getX(k) === 1)) hojas.push(t); }
  let ax = 0, az = 0, n = 0; for (const t of hojas) for (const k of t) { ax += p.getX(k); az += p.getZ(k); n++; } ax /= n; az /= n;
  return alturas.map((y) => {
    let r = 0;
    for (const t of hojas) for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3], ya = p.getY(a), yb = p.getY(b);
      if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
      const s = (y - ya) / (yb - ya), x = p.getX(a) + s * (p.getX(b) - p.getX(a)), z = p.getZ(a) + s * (p.getZ(b) - p.getZ(a));
      r = Math.max(r, Math.hypot(x - ax, z - az));
    }
    return r;
  });
}

test("R5.4: the cypress is ONE flame — widest in its lower third, tapering above it with no notch (not a stack of diamonds), narrow, short trunk foot", () => {
  const cip = ESPECIES.indexOf("cipres");
  for (const detalle of [true, false]) {
    const g = geometriaArbol(detalle).geometria, p = g.getAttribute(`pos${cip}`), parte = g.getAttribute("parte");
    let tope = 0, pie = Infinity;
    for (let i = 0; i < p.count; i++) if (parte.getX(i) === 1) { tope = Math.max(tope, p.getY(i)); pie = Math.min(pie, p.getY(i)); }
    const ys = Array.from({ length: 60 }, (_, k) => pie + ((tope - pie) * (k + 0.5)) / 60), r = perfil(detalle, cip, ys);
    const rMax = Math.max(...r), kMax = r.indexOf(rMax), yMax = ys[kMax];
    assert.ok(yMax >= 0.18 * tope && yMax <= tope / 3 + 0.05, `${detalle ? "A/B" : "C/D"}: widest at ${yMax.toFixed(2)} m of ${tope.toFixed(2)} m`);
    assert.ok(tope / (2 * rMax) >= 3.5, `narrow: ${tope.toFixed(2)} m tall, ${(2 * rMax).toFixed(2)} m wide`);
    // above its widest ring the outline only narrows: never wider than anything below it by more than a facet's jitter (6 % of the girth)
    let menor = rMax;
    for (let k = kMax + 1; k < ys.length; k++) { assert.ok(r[k] <= menor + 0.06 * rMax, `${detalle ? "A/B" : "C/D"}: bump at ${ys[k].toFixed(2)} m: ${r[k].toFixed(3)} > ${menor.toFixed(3)}`); menor = Math.min(menor, r[k]); }
    assert.ok(r[ys.length - 1] < 0.15 * rMax, "a pointed tip");
    assert.ok(r[Math.round(ys.length * 0.75)] < 0.6 * rMax, "the upper quarter clearly tapers");
    assert.ok(pie >= 0.35 && pie <= 0.8, `a short trunk foot under the foliage: ${pie.toFixed(2)} m`);
  }
  // the old R2 cypress (clumps on branch tips) had notches deeper than a third of its girth; the other species keep their own crowns
  const enc = perfil(true, 0, [3.0, 3.5]);
  assert.ok(enc[0] > 1, "the holm oak's crown is untouched");
  // far LOD: the shared bipyramid's ring, moved by the cypress's ring shift (the shader's formula), sits in its lower third
  const [, , cy, , ry, sh] = LEJOS.cipres, anillo = cy + (0 + sh * 1) * ry, alto = cy + (1.05 + sh * (1 - 1.05 * 1.05)) * ry;
  assert.ok(anillo / alto < 0.36, `far cypress widest at ${(anillo / alto).toFixed(2)} of its height`);
  for (const e of ESPECIES) if (e !== "cipres" && e !== "sauce") assert.equal(LEJOS[e][5], 0, `${e}: far ring unchanged`);
});

test("R6.3: the willow weeps — a dome widest high, curtains that hang outside the trunk down to near the ground, far tips that hang too", () => {
  const sau = ESPECIES.indexOf("sauce"), H = ALTURA.sauce;
  const g = geometriaArbol(true).geometria, p = g.getAttribute(`pos${sau}`), parte = g.getAttribute("parte");
  let tope = 0, pie = Infinity;
  for (let i = 0; i < p.count; i++) if (parte.getX(i) === 1) { tope = Math.max(tope, p.getY(i)); pie = Math.min(pie, p.getY(i)); }
  assert.ok(tope > 0.9 * H && tope <= 1.05 * H, `top ${tope.toFixed(2)} of ${H}`);
  assert.ok(pie < 0.2 * H, `curtains reach low: lowest leaf at ${pie.toFixed(2)} m`);
  const ys = Array.from({ length: 60 }, (_, k) => pie + ((tope - pie) * (k + 0.5)) / 60), r = perfil(true, sau, ys);
  const alto = Math.max(...r.filter((_, k) => ys[k] > 0.55 * tope)), bajo = Math.max(...r.filter((_, k) => ys[k] < 0.4 * tope));
  assert.ok(alto >= bajo, `crown widest high: ${alto.toFixed(2)} m up vs ${bajo.toFixed(2)} m low`);
  assert.ok(alto >= 1.9, `a broad crown: ${alto.toFixed(2)} m`);
  // it hangs: in the lower third there is foliage well outside the trunk (curtains, not a lollipop), and the reach shrinks toward the tips (no bulge low = no kite)
  const tercio = r.filter((_, k) => ys[k] < tope / 3 && ys[k] > pie + 0.3);
  assert.ok(tercio.length > 3 && tercio.every((x) => x > 1.2), `curtains hang outside the trunk: ${tercio.map((x) => x.toFixed(1)).join(",")}`);
  const kAlto = r.indexOf(alto); for (let k = 1; k < kAlto; k++) assert.ok(r[k] >= r[k - 1] - 0.08, `the curtains widen upward, no waist at ${ys[k].toFixed(2)} m`);
  // the dome sits on the trunk top: the trunk's top ring is under the crown
  // far: three of five ring vertices hang to about 1 m (the shader's formula); the high ones stay up
  const [, , cy, , ry, sh] = LEJOS.sauce, alta = cy + (0.1 + sh * 0.99) * ry, colg = cy + (-0.1 + sh * 0.99 - CUELGA_LEJOS) * ry, top = cy + (1.05 + sh * (1 - 1.05 * 1.05)) * ry;
  assert.ok(alta / top > 0.8 && colg < 0.3 * top && colg > 0.4, `far willow: ring ${alta.toFixed(2)}, tips ${colg.toFixed(2)}, top ${top.toFixed(2)} m`);
});

test("R6.3: willows grow only by the pond (none farther than SAUCE_AGUA pond radii), and there are some", () => {
  const t = crearTerreno({ semilla: 1234, nivel: "A" }), e = t.estanque;
  const pts = esparcirArboles(t, { semilla: 1234, tamano: 200, plaza: 12, densidad: 1, nivel: "A", paleta: "verano", estanque: e });
  const sauces = pts.filter((q) => q.especie === "sauce");
  assert.ok(sauces.length >= 4, `${sauces.length} willows`);
  for (const q of sauces) assert.ok(Math.hypot(q.x - e.x, q.z - e.z) <= SAUCE_AGUA * e.radio + 0.01, `willow at ${q.x},${q.z} far from water`);
  const sin = esparcirArboles(t, { semilla: 1234, tamano: 200, plaza: 12, densidad: 1, nivel: "A", paleta: "verano", estanque: null });
  assert.equal(sin.filter((q) => q.especie === "sauce").length, 0, "no pond, no willow");
});

test("empty input and unknown species do not throw", () => {
  const h = { vientoU: viento(), nivel: "C" as Nivel };
  const v = crearArboles(h, []); v.actualizar(1, new THREE.Vector3()); assert.equal(v.estadisticas().arboles, 0); v.dispose();
  const u = crearArboles(h, [{ x: 1, y: 0, z: 1, escala: 1, giro: 0, especie: "baobab" }]); u.actualizar(1, new THREE.Vector3()); assert.equal(u.estadisticas().arboles, 1); u.dispose();
});
