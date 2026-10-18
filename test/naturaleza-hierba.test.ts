// N3: instanced grass — placement is deterministic and zone-aware, density fits each tier's budget, nothing beyond the radius,
// the ring refills only at cell borders, and the whole piece is 2 draw calls. No GPU needed (the material graph is built, not run).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearHierba, tuftsDeCelda, floresDeCelda, anillo, TRIANGULOS_TUFT, TRIANGULOS_FLOR } from "../packages/render/src/naturaleza/hierba.ts";
import type { Fuente } from "../packages/render/src/naturaleza/hierba.ts";
import { HIERBA_POR_NIVEL } from "../packages/render/src/naturaleza/niveles.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";
import type { Zona } from "../packages/render/src/naturaleza/terreno.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"];
/** Stub terrain: gentle sine hills, zone by height (a pond hollow at x = −40, rock on the steep bump at z = 40, forest on the high side). */
const alturaEn = (x: number, z: number) => Math.sin(x * 0.05) * 2 + Math.cos(z * 0.04) * 1.5 + Math.sin((x + z) * 0.11) * 0.3 + (Math.hypot(x - 20, z - 40) < 10 ? 6 * Math.max(0, 1 - Math.hypot(x - 20, z - 40) / 10) : 0);
const zonaEn = (x: number, z: number): Zona => { const y = alturaEn(x, z); return y < -2.1 ? "orilla" : y < -1.7 ? "arena" : y > 3.6 ? "roca" : y > 1.6 ? "bosque" : "prado"; };
const fuente: Fuente = { alturaEn, zonaEn };
const SEMILLA = 20261018;
const camara = (x: number, z: number) => { const c = new THREE.Object3D(); c.position.set(x, alturaEn(x, z) + 1.7, z); return c; };
const clave = (ps: { x: number; z: number; giro: number; escala: number; r: number }[]) => ps.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)},${p.giro.toFixed(4)},${p.escala.toFixed(4)},${p.r.toFixed(4)}`).sort().join("|");
const viento = () => ({ vientoU: uniform(new THREE.Vector3(2, 0, 1)) });

test("placement is a pure function of (seed, cell): same tufts, same flowers, any order", () => {
  const n = HIERBA_POR_NIVEL.A;
  const a = tuftsDeCelda(SEMILLA, 3, -2, fuente, n), b = tuftsDeCelda(SEMILLA, 3, -2, fuente, n);
  assert.ok(a.length > 20, `${a.length} tufts in a plain cell`);
  assert.equal(clave(a), clave(b));
  tuftsDeCelda(SEMILLA, 9, 9, fuente, n); // another cell in between changes nothing
  assert.equal(clave(tuftsDeCelda(SEMILLA, 3, -2, fuente, n)), clave(a));
  assert.notEqual(clave(tuftsDeCelda(SEMILLA + 1, 3, -2, fuente, n)), clave(a), "another seed, another meadow");
  assert.equal(clave(floresDeCelda(SEMILLA, 0, 0, fuente, n)), clave(floresDeCelda(SEMILLA, 0, 0, fuente, n)));
});

test("grass only on meadow and forest: never on sand, rock or the water's edge; thinner under trees and on slopes", () => {
  const n = HIERBA_POR_NIVEL.A, cuenta: Record<string, number> = { prado: 0, bosque: 0 }, celdas: Record<string, number> = {};
  for (let cx = -14; cx < 14; cx++) for (let cz = -14; cz < 14; cz++) {
    for (const p of tuftsDeCelda(SEMILLA, cx, cz, fuente, n)) {
      const z = zonaEn(p.x, p.z);
      assert.ok(z === "prado" || z === "bosque", `tuft on ${z} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      assert.equal(p.y, alturaEn(p.x, p.z), "stands on the ground");
      cuenta[z]++;
    }
    for (const p of floresDeCelda(SEMILLA, cx, cz, fuente, n)) assert.equal(zonaEn(p.x, p.z), "prado", "flowers only in the meadow");
    const z = zonaEn((cx + 0.5) * n.celda, (cz + 0.5) * n.celda); celdas[z] = (celdas[z] ?? 0) + 1;
  }
  assert.ok(cuenta.prado > 0 && cuenta.bosque > 0 && (celdas.arena ?? 0) + (celdas.orilla ?? 0) + (celdas.roca ?? 0) > 0, JSON.stringify([cuenta, celdas]));
  assert.ok(cuenta.bosque / celdas.bosque < 0.7 * (cuenta.prado / celdas.prado), `forest ${cuenta.bosque / celdas.bosque} vs meadow ${cuenta.prado / celdas.prado} tufts per cell`);
});

test("steeper ground gets fewer tufts than flat ground", () => {
  const plano: Fuente = { alturaEn: () => 0, zonaEn: () => "prado" }, cuesta: Fuente = { alturaEn: (x) => x * 0.8, zonaEn: () => "prado" };
  const n = HIERBA_POR_NIVEL.B;
  assert.ok(tuftsDeCelda(SEMILLA, 1, 1, cuesta, n).length < 0.5 * tuftsDeCelda(SEMILLA, 1, 1, plano, n).length);
});

test("density per tier: tufts and triangles fit the budget; flowers are 3-5 % of the meadow's tufts", () => {
  const techo: Record<Nivel, number> = { A: 60000, B: 35000, C: 35000, D: 15000 }; // the whole nature budget
  for (const nv of NIVELES) {
    const t = HIERBA_POR_NIVEL[nv], a = anillo(t);
    const enviados = a.capTuft * a.celdas.length * TRIANGULOS_TUFT + a.capFlor * a.celdas.length * TRIANGULOS_FLOR;
    assert.ok(a.capTuft * a.celdas.length <= t.tuftsMax, nv);
    assert.ok(enviados <= techo[nv] * 0.8, `${nv}: grass submits ${enviados} triangles, over 80 % of the nature budget ${techo[nv]}`);
  }
  assert.ok(HIERBA_POR_NIVEL.A.radio === 38 && HIERBA_POR_NIVEL.B.radio === 22 && HIERBA_POR_NIVEL.C.radio === 22 && HIERBA_POR_NIVEL.D.radio === 14);
  const llano: Fuente = { alturaEn: () => 0, zonaEn: () => "prado" }, n = HIERBA_POR_NIVEL.A;
  let tufts = 0, flores = 0;
  for (let cx = -12; cx < 12; cx++) for (let cz = -12; cz < 12; cz++) { tufts += tuftsDeCelda(SEMILLA, cx, cz, llano, n).length; flores += floresDeCelda(SEMILLA, cx, cz, llano, n).length; }
  assert.ok(flores / tufts > 0.03 && flores / tufts < 0.05, `flowers ${(100 * flores / tufts).toFixed(2)} % of tufts`);
});

for (const nv of NIVELES) {
  test(`tier ${nv}: 2 draw calls, no tuft beyond the radius, nothing live outside the ring`, () => {
    const h = crearHierba(viento(), fuente, { semilla: SEMILLA, nivel: nv });
    const cam = camara(5, -7), R = HIERBA_POR_NIVEL[nv].radio, cel = HIERBA_POR_NIVEL[nv].celda;
    h.llenarTodo(cam);
    const e = h.estadisticas();
    assert.equal(e.pendientes, 0);
    assert.ok(e.dibujos <= 2 && h.mallas.length === e.dibujos, `${e.dibujos} draw calls`);
    assert.ok(e.tuftsVivos > 0 && e.tuftsVivos <= HIERBA_POR_NIVEL[nv].tuftsMax);
    for (const m of h.mallas) {
      assert.equal(m.frustumCulled, true); assert.ok(m.geometry.boundingSphere!.radius > R);
      const pos = m.geometry.getAttribute("iPos").array as Float32Array, col = m.geometry.getAttribute("iCol").array as Float32Array;
      for (let i = 0; i < pos.length / 4; i++) if (col[i * 4 + 3] > 0) assert.ok(Math.hypot(pos[i * 4] - cam.position.x, pos[i * 4 + 2] - cam.position.z) <= R + 2.4 * cel, `live tuft ${i} too far`);
    }
    const v = h.visibles(cam.position.x, cam.position.z);
    assert.ok(v.tufts > 0 && v.tufts < e.tuftsVivos, "the fade hides the outer ring");
    h.dispose();
  });
}

test("a still camera does no work; crossing a cell border refills only the new cells, and the result equals a fresh fill", () => {
  const nv: Nivel = "C", cel = HIERBA_POR_NIVEL[nv].celda;
  const h = crearHierba(viento(), fuente, { semilla: SEMILLA, nivel: nv });
  const cam = camara(cel * 0.5, cel * 0.5);
  h.llenarTodo(cam);
  const m = h.mallas[0], pos = m.geometry.getAttribute("iPos").array as Float32Array;
  const antes = pos.slice(), llenadas = h.estadisticas().celdasLlenadas;
  for (let i = 0; i < 30; i++) { cam.position.x += 0.01; h.actualizar(cam, i * 0.016); }
  assert.deepEqual(pos, antes, "no instance rewritten while the camera stays in its cell");
  assert.equal(h.estadisticas().celdasLlenadas, llenadas);
  cam.position.x += cel; // one cell east
  const t0 = performance.now(); let frames = 0;
  while (h.estadisticas().pendientes || frames === 0) { h.actualizar(cam, 1 + frames * 0.016); frames++; assert.ok(frames < 2000); }
  const nuevas = h.estadisticas().celdasLlenadas - llenadas, a = anillo(HIERBA_POR_NIVEL[nv]);
  assert.ok(nuevas > 0 && nuevas <= 2 * Math.ceil(2 * HIERBA_POR_NIVEL[nv].radio / cel) + 6, `${nuevas} cells entered (ring has ${a.celdas.length})`);
  const fresco = crearHierba(viento(), fuente, { semilla: SEMILLA, nivel: nv });
  fresco.llenarTodo(cam);
  const vivos = (hh: typeof h) => { const p = hh.mallas[0].geometry.getAttribute("iPos").array as Float32Array, c = hh.mallas[0].geometry.getAttribute("iCol").array as Float32Array, r: string[] = []; for (let i = 0; i < p.length / 4; i++) if (c[i * 4 + 3] > 0) r.push(`${p[i * 4].toFixed(3)},${p[i * 4 + 2].toFixed(3)}`); return r.sort().join("|"); };
  assert.equal(vivos(h), vivos(fresco), "same tufts in the same places as a fresh fill (determinism through the slot map)");
  void t0; h.dispose(); fresco.dispose();
});

test("CPU: refilling is spread over frames within the budget (each call ≈ presupuestoMs plus one small batch)", () => {
  const nv: Nivel = "A", h = crearHierba(viento(), fuente, { semilla: SEMILLA, nivel: nv });
  const cam = camara(0, 0);
  const tiempos: number[] = [];
  let frames = 0;
  do { const t0 = performance.now(); h.actualizar(cam, frames * 0.016); tiempos.push(performance.now() - t0); frames++; } while (h.estadisticas().pendientes && frames < 5000);
  assert.ok(frames > 5, `the first fill spreads over ${frames} frames`);
  // walking: a border crossing every 8 m; the spikes stay small
  const paseo: number[] = [];
  for (let i = 0; i < 200; i++) { cam.position.x += 0.5; const t0 = performance.now(); h.actualizar(cam, frames++ * 0.016); paseo.push(performance.now() - t0); }
  const max = Math.max(...paseo), media = paseo.reduce((s, v) => s + v, 0) / paseo.length;
  console.log(`# hierba A: first fill ${frames - 200} frames, max ${Math.max(...tiempos).toFixed(2)} ms/frame; walking mean ${media.toFixed(3)} ms, max ${max.toFixed(2)} ms, ${h.estadisticas().celdasLlenadas} cells`);
  assert.ok(max < 4, `worst frame ${max.toFixed(2)} ms (budget 0.4 ms + one batch; a loaded machine may add a spike: re-run alone)`);
  h.dispose();
});
