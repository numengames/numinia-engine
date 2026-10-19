// N2 (naturaleza): the low-poly trees — deterministic geometry, triangle budgets per species and LOD, the tier table, the
// near/far split honouring the caps (and its CPU cost), bounding spheres, and the TSL wind material graph building in node.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { esparcirArboles, SAUCE_AGUA, SAUCE_ORILLA } from "../packages/render/src/naturaleza/esparcir.ts";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearArboles, geometriaArbol, geometriaCerca, geometriaLejos, ESPECIES, LEJOS, ALTURA, CUELGA_LEJOS, TOPE_LEJOS, TRIS_MAX_CERCA, TRIS_MAX_LEJOS, TRIANGULOS_ARBOL, TRIANGULOS_DETALLE, TRIANGULOS_SIMPLE, triangulosCerca, CARTAS_DETALLE, CARTAS_SIMPLE, CON_CARTAS, PARTE, tonoRegional, entrelazarCerca, PIEZA, piezaDeArbol, ROL_OBRA, OBRA, nocheDeHemi, nocheArbolesU } from "../packages/render/src/naturaleza/arboles.ts";
import { copaDeCartas, PESO_ESFERA } from "../packages/render/src/naturaleza/follaje.ts";
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
  assert.ok(TRIANGULOS_SIMPLE - 2 * CARTAS_SIMPLE >= 30 && TRIANGULOS_SIMPLE - 2 * CARTAS_SIMPLE <= 40, "R7.4: the simple template without its cards stays 36");
  assert.equal(TRIANGULOS_DETALLE - 2 * CARTAS_DETALLE, 103, "R7.4: the detailed template without its cards stays 103");
  for (const n of NIVELES) assert.equal(triangulosCerca(NATURALEZA_POR_NIVEL[n].arbolesDetalle), n === "A" || n === "B" ? TRIANGULOS_DETALLE : TRIANGULOS_SIMPLE);
  for (const e of ESPECIES) assert.equal(geometriaCerca(e).geometria, geo, "every species shares the geometry");
  const n = geo.getAttribute("position").count;
  for (const k of ["pos1", "pos2", "pos3", "pos4", "tono", "parte", "mov"]) assert.equal(geo.getAttribute(k).count, n, k);
  // branch and leaf vertices sway more than the trunk's, and the tips (mov → 1) more than the roots
  const mov = geo.getAttribute("mov").array as Float32Array, parte = geo.getAttribute("parte").array as Float32Array;
  assert.ok(Math.max(...mov) >= 0.95 && Math.min(...mov) <= 0.05, "sway weight spans 0…1");
  for (let i = 0; i < n; i++) if (parte[i] === 1) assert.ok(mov[i] >= 0.4, `leaf vertex ${i} sways ${mov[i]}`);
  assert.equal(Array.from(parte).filter((x) => x === 2).length, 10, "collar band: 2 rings of 4 + their seam vertex (E50 uv)");
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
    const g = geometriaCerca(e, detalle).geometria, ie = ESPECIES.indexOf(e), p = g.getAttribute(ie === 0 ? "position" : `pos${ie}`), ix = g.index!, padre = Array.from({ length: p.count }, (_, i) => i);
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
      if (![...pz.aristas.values()].every((c) => c === 2)) continue; // open pieces (branch prisms, leaf cards) have no volume
      let vol = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (const t of pz.tris) { a.fromBufferAttribute(p, t[0]); b.fromBufferAttribute(p, t[1]); c.fromBufferAttribute(p, t[2]); vol += a.dot(b.clone().cross(c)) / 6; }
      if (CON_CARTAS[e] && Math.abs(vol) < 1e-6) continue; // R7.4: a species with cards collapses its faceted crown to a point (zero volume)
      cerradas++;
      assert.ok(vol > 0, `${e}: a closed piece is inside-out (${vol})`);
    }
    assert.ok(cerradas >= (CON_CARTAS[e] ? 0 : detalle ? 4 : 2), `${e}: ${cerradas} closed pieces`);
  }
});

test("E50: every tree wears a machine piece (bronze, tin or neon), never a shrub; about 1 in 30 is a tree-artwork", () => {
  const t = crearArboles({ vientoU: viento(), nivel: "C" }, campo(600, 120, 11));
  t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
  const s = t.estadisticas(), n = s.cerca.reduce((a, b) => a + b, 0), arbustos = s.cerca[ESPECIES.indexOf("arbusto")];
  assert.ok(n > 30 && s.collares === n - arbustos, `${s.collares} pieces on ${n - arbustos} trees`);
  // over many positions: the three pieces all occur, the artwork is rare, shrubs never wear one
  const cuenta = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) cuenta[piezaDeArbol((i % 200) * 1.37 - 137, Math.floor(i / 200) * 1.41 - 70, "encina")]++;
  const obra = (cuenta[PIEZA.obraPortal] + cuenta[PIEZA.obraLente]) / 20000, neon = (cuenta[PIEZA.neonTurquesa] + cuenta[PIEZA.neonCoral]) / 20000;
  assert.equal(cuenta[PIEZA.ninguna], 0);
  assert.ok(obra > 0.02 && obra < 0.05, `artworks: ${(obra * 100).toFixed(1)} %`);
  for (const k of [PIEZA.bronce, PIEZA.hojalata]) assert.ok(cuenta[k] / 20000 > 0.15, `piece ${k}: ${cuenta[k]}`);
  assert.ok(neon > 0.1 && neon < 0.4 && cuenta[PIEZA.neonCoral] > 0 && cuenta[PIEZA.obraLente] > 0, `neon ${(neon * 100).toFixed(1)} %`);
  assert.equal(piezaDeArbol(3, 4, "arbusto"), PIEZA.ninguna);
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
  // R7.4: the trees' share PROPOSED for PRESUPUESTO_NATURALEZA under D-057 (A 100 k · B 60 k · C 35 k · D 12 k for all nature); niveles.ts is set at the R7 merge
  const tope: Record<Nivel, number> = { A: 8000, B: 5000, C: 7700, D: 3500 };
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
  // (R7.4: the holm oak now wears leaf cards; the olive keeps the faceted crown it shared with it)
  // E50 (Pablo's landscapes): the olive became a cluster of caps; its main cap stays broad at its rim
  const oli = perfil(true, ESPECIES.indexOf("olivo"), [3.3, 3.4]);
  assert.ok(oli[0] > 1, "the olive's main cap is broad");
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
  const kAlto = r.indexOf(alto); for (let k = 1; k < kAlto && ys[k] < 0.65 * tope; k++) assert.ok(r[k] >= r[k - 1] - 0.08, `the curtains widen upward, no waist at ${ys[k].toFixed(2)} m`);
  // the dome sits on the trunk top: the trunk's top ring is under the crown
  // far: three of five ring vertices hang to about 1 m (the shader's formula); the high ones stay up
  const [, , cy, , ry, sh] = LEJOS.sauce, alta = cy + (0.1 + sh * 0.99) * ry, colg = cy + (-0.1 + sh * 0.99 - CUELGA_LEJOS) * ry, top = cy + (1.05 + sh * (1 - 1.05 * 1.05) - TOPE_LEJOS) * ry;
  assert.ok(alta / top > 0.8 && colg < 0.3 * top && colg > 0.4, `far willow: ring ${alta.toFixed(2)}, tips ${colg.toFixed(2)}, top ${top.toFixed(2)} m`);
});

test("R6.3: willows grow only by the water (the pond's ring or the dry stream bed's banks), and there are some", () => {
  const t = crearTerreno({ semilla: 1234, nivel: "A" }), e = t.estanque;
  const pts = esparcirArboles(t, { semilla: 1234, tamano: 200, plaza: 12, densidad: 1, nivel: "A", paleta: "verano", estanque: e });
  const sauces = pts.filter((q) => q.especie === "sauce");
  assert.ok(sauces.length >= 4, `${sauces.length} willows`);
  for (const q of sauces) assert.ok(Math.hypot(q.x - e.x, q.z - e.z) <= SAUCE_AGUA * e.radio + 0.01 || t.franjaEn(q.x, q.z).agua >= SAUCE_ORILLA, `willow at ${q.x},${q.z} far from water`);
  assert.ok(sauces.some((q) => Math.hypot(q.x - e.x, q.z - e.z) > SAUCE_AGUA * e.radio), "some stand on the dry stream bed's banks");
  assert.ok(sauces.length < pts.length * 0.06, `willows stay a waterside species: ${sauces.length} of ${pts.length}`);
  const seco = crearTerreno({ semilla: 1234, nivel: "A", sinEstanque: true });
  const sin = esparcirArboles(seco, { semilla: 1234, tamano: 200, plaza: 12, densidad: 1, nivel: "A", paleta: "verano", estanque: null });
  assert.equal(sin.filter((q) => q.especie === "sauce").length, 0, "no pond (and so no stream bed), no willow");
});

test("empty input and unknown species do not throw", () => {
  const h = { vientoU: viento(), nivel: "C" as Nivel };
  const v = crearArboles(h, []); v.actualizar(1, new THREE.Vector3()); assert.equal(v.estadisticas().arboles, 0); v.dispose();
  const u = crearArboles(h, [{ x: 1, y: 0, z: 1, escala: 1, giro: 0, especie: "baobab" }]); u.actualizar(1, new THREE.Vector3()); assert.equal(u.estadisticas().arboles, 1); u.dispose();
});

// ---- R7.4: the foliage crown (follaje.ts: Bruno Simon's Foliage.js, MIT; ForestGenerator r186, MIT) on ONE species, the holm oak ----
test("R7.4: the crown builder is Bruno's: exact card count, deterministic, cards inside their lobes, spherical normals, occlusion dark inside/below", () => {
  const lob = [{ c: [0, 3.5, 0] as [number, number, number], r: [1.5, 1.05, 1.4] as [number, number, number], peso: 0.4 }, { c: [1.2, 3.2, 0.4] as [number, number, number], r: [1, 0.7, 0.9] as [number, number, number], peso: 0.6 }];
  const a = copaDeCartas(lob, 64, 9), b = copaDeCartas(lob, 64, 9);
  assert.equal(a.cartas.length, 64); assert.equal(copaDeCartas(lob, 41, 9).cartas.length, 41);
  assert.deepEqual(a, b, "same seed, same crown");
  assert.notDeepEqual(a.cartas[0].c, copaDeCartas(lob, 64, 10).cartas[0].c);
  let alineadas = 0, aoDentro = 0, nDentro = 0, aoFuera = 0, nFuera = 0;
  for (const k of a.cartas) {
    const enAlguno = lob.some((l) => ((k.c[0] - l.c[0]) / l.r[0]) ** 2 + ((k.c[1] - l.c[1]) / l.r[1]) ** 2 + ((k.c[2] - l.c[2]) / l.r[2]) ** 2 <= 1.0001);
    assert.ok(enAlguno, "every card centre sits inside one of the lobes");
    const rel = [0, 1, 2].map((i) => (k.c[i] - a.centro[i]) / a.radios[i]), l = Math.hypot(...rel) || 1;
    for (const n of k.normales) { assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5, "unit normals"); if ((n[0] * rel[0] + n[1] * rel[1] + n[2] * rel[2]) / l > 0.85) alineadas++; }
    const m = k.ao.reduce((s, x) => s + x, 0) / 4;
    if (l < 0.5 && rel[1] < 0) { aoDentro += m; nDentro++; } else if (l > 0.8 && rel[1] > 0) { aoFuera += m; nFuera++; }
    for (const x of k.ao) assert.ok(x >= 0 && x <= 1);
  }
  assert.ok(alineadas / (a.cartas.length * 4) > 0.9, `normals follow the crown's sphere (lerp ${PESO_ESFERA}): ${alineadas}`);
  assert.ok(nFuera > 0 && (nDentro === 0 || aoDentro / nDentro < aoFuera / nFuera - 0.2), "occlusion: deep/low cards darker than the lit top rim");
});

test("R7.4: the holm oak wears cards in the shared template (one draw call); other species keep their crowns and park their cards at a point", () => {
  for (const detalle of [true, false]) {
    const g = geometriaArbol(detalle).geometria, parte = g.getAttribute("parte"), n = parte.count, nc = detalle ? CARTAS_DETALLE : CARTAS_SIMPLE;
    const cartas = Array.from({ length: n }, (_, i) => i).filter((i) => parte.getX(i) === PARTE.carta);
    assert.equal(cartas.length, nc * 4, "four corners per card");
    for (const k of ["esquina", "uv", "nesf"]) { assert.equal(g.getAttribute(k).count, n, k); assert.ok(Array.from(g.getAttribute(k).array).every(Number.isFinite), k); }
    const esq = g.getAttribute("esquina"), uv = g.getAttribute("uv");
    for (const i of cartas) { assert.ok(Math.hypot(esq.getX(i), esq.getY(i)) > 0.2, "a card has a real size (m)"); assert.ok([0, 1].includes(uv.getX(i)) && [0, 1].includes(uv.getY(i))); }
    ESPECIES.forEach((e, ie) => {
      const p = g.getAttribute(ie === 0 ? "position" : `pos${ie}`), punto = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].join(",");
      const hoja = Array.from({ length: n }, (_, i) => i).filter((i) => parte.getX(i) === 1);
      if (CON_CARTAS[e]) {
        assert.equal(new Set(hoja.map(punto)).size, 1, `${e}: the faceted crown is collapsed`);
        assert.ok(new Set(cartas.map(punto)).size >= nc * 0.9, `${e}: cards spread through the crown`);
        const ys = cartas.map((i) => p.getY(i)); assert.ok(Math.min(...ys) > 1.2 && Math.max(...ys) < 6, `${e}: cards up in the crown`);
      } else {
        assert.equal(new Set(cartas.map(punto)).size, 1, `${e}: its cards are parked at one point`);
        assert.ok(new Set(hoja.map(punto)).size > 6, `${e}: keeps its own crown`);
      }
    });
  }
  assert.equal(CON_CARTAS.encina, true, "R7.4 converts the holm oak first");
  assert.equal(Object.values(CON_CARTAS).filter(Boolean).length, 1, "ONE test species in R7.4 (R7.5 does the rest)");
  const t = crearArboles({ vientoU: viento(), nivel: "A" }, campo(200, 60));
  t.actualizar(0, new THREE.Vector3(0, 1.7, 0));
  assert.ok(t.estadisticas().llamadas <= 2, "no new draw call");
  const mat = t.mallas[0].material as THREE.MeshLambertNodeMaterial;
  assert.equal(mat.alphaToCoverage, true, "alpha to coverage where MSAA exists (three disables it without samples)");
  assert.equal(mat.transparent, false, "no blending: the crowns stay in the opaque pass");
  assert.ok(mat.opacityNode && mat.normalNode && mat.emissiveNode, "leaf alpha, spherical normals and the shade fill wired");
  t.dispose();
});

test("R7.4: the regional colour drifts slowly over the land (neighbours alike, far trees differ), within −1…1", () => {
  let cerca = 0, lejos = 0, n = 0;
  for (let i = 0; i < 200; i++) {
    const x = (i * 37) % 180 - 90, z = (i * 53) % 180 - 90, u = tonoRegional(x, z, 0.5);
    assert.ok(u >= -1 && u <= 1);
    cerca += Math.abs(u - tonoRegional(x + 1.5, z, 0.5)); lejos += Math.abs(u - tonoRegional(x + 40, z - 25, 0.5)); n++;
  }
  assert.ok(cerca / n < 0.5 * (lejos / n), `near ${(cerca / n).toFixed(3)} vs far ${(lejos / n).toFixed(3)}`);
});

test("WebGPU: the near tree mesh stays within the default 8 vertex buffers per draw (interleaved template, 4 instance buffers)", () => {
  for (const detalle of [true, false]) {
    const base = geometriaArbol(detalle).geometria, g = new THREE.InstancedBufferGeometry();
    entrelazarCerca(base, g);
    const buffers = new Set(Object.values(g.attributes).map((a) => ((a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as THREE.InterleavedBufferAttribute).data : a)));
    assert.ok(buffers.size + 4 <= 8, `near template: ${buffers.size} geometry buffers + 4 instance buffers`);
    for (const k of Object.keys(base.attributes)) { const a = base.getAttribute(k), b = g.getAttribute(k);
      assert.equal(b.count, a.count, k); for (let i = 0; i < a.count; i += 97) for (let c = 0; c < a.itemSize; c++) assert.equal(b.getComponent(i, c), a.getComponent(i, c), `${k}[${i}]`); }
  }
});

test("E50: the tree-artwork is a second shape of the SAME template (no new mesh): one obra vertex per vertex, ring + lens + spiral trunk", () => {
  for (const detalle of [true, false]) {
    const g = geometriaArbol(detalle).geometria, ob = g.getAttribute("obra"), p = g.getAttribute("position"), uv = g.getAttribute("uv"), parte = g.getAttribute("parte");
    assert.equal(ob.count, p.count);
    const rol = (i: number) => Math.floor(ob.getW(i));
    // the ring: its segments' vertices sit on a circle of radius R around (0, cy) in the x–y plane (± the segment's thickness)
    let anillo = 0;
    for (let i = 0; i < ob.count; i++) if (rol(i) === ROL_OBRA.mata) { anillo++; const r = Math.hypot(ob.getX(i), ob.getY(i) - OBRA.cy); assert.ok(Math.abs(r - OBRA.R) < 0.3, `ring vertex at r = ${r}`); }
    assert.ok(anillo >= 6);
    // the lens: unit directions with a glow, poles full
    let lente = 0;
    for (let i = 0; i < ob.count; i++) if (rol(i) === ROL_OBRA.copa) { lente++; assert.ok(Math.abs(Math.hypot(ob.getX(i), ob.getY(i), ob.getZ(i)) - 1) < 1e-3); assert.ok(ob.getW(i) % 1 > 0); }
    assert.equal(lente, 12);
    // the trunk turns as it rises (the spiral) and its uv runs 0…1 around, seam included
    let top = -1, bot = -1;
    for (let i = 0; i < ob.count; i++) if (parte.getX(i) === 0 && rol(i) === ROL_OBRA.tronco) { if (uv.getX(i) === 0 && uv.getY(i) === 0) bot = i; if (uv.getX(i) === 0 && uv.getY(i) === 1) top = i; }
    assert.ok(top >= 0 && bot >= 0);
    const giro = Math.atan2(ob.getZ(top), ob.getX(top)) - Math.atan2(ob.getZ(bot), ob.getX(bot));
    assert.ok(Math.abs(giro) > 0.5, `spiral: ${giro.toFixed(2)} rad`);
  }
});

test("E50: the night factor follows the scene's hemisphere (day sky 0xbcd6ee → 0, night 0x33456e → 1)", () => {
  assert.ok(nocheDeHemi(new THREE.Color(0xbcd6ee)) < 0.02);
  assert.ok(nocheDeHemi(new THREE.Color(0x33456e)) > 0.98);
  const t = crearArboles({ vientoU: viento(), nivel: "A" }, campo(50, 30)), escena = new THREE.Scene();
  const h = new THREE.HemisphereLight(0x33456e, 0x2a2e3a, 1); escena.add(h, t.grupo);
  t.actualizar(1, new THREE.Vector3()); assert.ok(nocheArbolesU.value > 0.98);
  h.color.set(0xbcd6ee); t.actualizar(2, new THREE.Vector3()); assert.ok(nocheArbolesU.value < 0.02);
  t.dispose();
});

test("E50: the stone pine and the olive wear mushroom / umbrella caps on thin trunks (Pablo's landscapes, paisaje-1..4)", () => {
  const g = geometriaArbol(true).geometria, parte = g.getAttribute("parte");
  for (const esp of ["pino", "olivo"] as const) {
    const e = ESPECIES.indexOf(esp), p = g.getAttribute(`pos${e}`);
    let tope = 0, pie = Infinity;
    for (let i = 0; i < p.count; i++) if (parte.getX(i) === 1) { tope = Math.max(tope, p.getY(i)); pie = Math.min(pie, p.getY(i)); }
    // the cap: the widest leaf girth sits in the top third, and the leaf above the rim is flatter than wide (a dome, not a ball)
    const ys = Array.from({ length: 40 }, (_, k) => pie + ((tope - pie) * (k + 0.5)) / 40), r = perfil(true, e, ys);
    const rMax = Math.max(...r), yMax = ys[r.indexOf(rMax)];
    assert.ok(yMax > tope - 0.35 * (tope - 0) && tope - yMax < rMax, `${esp}: widest at ${yMax.toFixed(2)} of ${tope.toFixed(2)} m, girth ${rMax.toFixed(2)}`);
    // a thin trunk under it: the bark's lowest ring is narrow
    let cx = 0, cz = 0; for (let i = 0; i < 4; i++) { cx += p.getX(i) / 4; cz += p.getZ(i) / 4; }
    let rT = 0; for (let i = 0; i < 4; i++) rT = Math.max(rT, Math.hypot(p.getX(i) - cx, p.getZ(i) - cz));
    assert.ok(rT < 0.26, `${esp}: thin trunk foot ${rT.toFixed(2)} m`);
  }
});

