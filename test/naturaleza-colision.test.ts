// N5 · terrain collision: the seeded hills of naturaleza.json are the world's collision mesh, so people walk over them (before:
// flat y = 0 under a drawn relief). Headless, real sim + real instance + real client over loopback. Design: docs/NATURALEZA.md N5,
// reuses M6 (bvh.ts, setMesh, groundHeight, MAX_SLOPE_COS). A world WITHOUT naturaleza.json steps exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat, FX_ONE } from "../packages/core/src/index.ts";
import {
  createSim, spawnAvatar, step, setMesh, getBody, setBody, groundHeight, stateHash, replayFingerprint, referenceRecording, REFERENCE,
  buildBvh, bvhFingerprint, rayBvh, terrenoMalla, triangulosDeTerreno, terrenoDelEstado, combinarMallas, sueloMinimoTerreno,
  CLAVE_NATURALEZA, CELDAS_COLISION_MAX, PISO_SIN_SUELO, BTN_RUN, TRI_STRIDE,
} from "../packages/sim/src/index.ts";
import { alturaEn } from "../packages/relieve/src/relieve.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { naturaleza, MUNDO } from "../features/naturaleza/feature.ts";
import { crearNaturaleza } from "../features/naturaleza/server.ts";
import naturalezaClient from "../features/naturaleza/client.ts";
import type { NaturalezaMundo } from "../features/naturaleza/esquema.ts";

const U = FX_ONE;
const MUNDO_1234 = { semilla: 1234, tamano: 200, plaza: 12, estanque: true };
const NAT: NaturalezaMundo = { activa: true, semilla: 1234, tamano: 200, plaza: 12, arboles: 1, hierba: 1, estanque: true, paleta: "verano" };
const T1234 = terrenoMalla(MUNDO_1234);

/** Walk a fresh avatar from `r0` m out along heading k/16 of a turn on the mesh; returns what a person would feel. */
function caminar(T: ReturnType<typeof terrenoMalla>, semilla: number, k: number, ticks = 600, botones = 0) {
  const th = (k / 16) * Math.PI * 2, mx = Math.round(127 * Math.cos(th)), mz = Math.round(127 * Math.sin(th));
  const s = createSim(1, 0); setMesh(s, T.bvh, PISO_SIN_SUELO); const e = spawnAvatar(s, 0);
  setBody(s, e, { x: Math.round(8 * Math.cos(th) * U), y: 0, z: Math.round(8 * Math.sin(th) * U), vy: 0, air: 0, buf: 0 });
  let sobreMalla = 0, sobreFuncion = 0, aire = 0, ymin = Infinity;
  for (let t = 0; t < ticks; t++) {
    step(s, new Int32Array([e, mx, mz, botones]));
    const b = getBody(s, e);
    if (t < 20) continue;
    const h = rayBvh(T.bvh, b.x, 40 * U, b.z, 0, -U, 0, 120 * U);
    sobreMalla = Math.max(sobreMalla, Math.abs(b.y - (h ? h.y : -999 * U)) / U);
    sobreFuncion = Math.max(sobreFuncion, Math.abs(b.y / U - alturaEn(semilla, b.x / U, b.z / U, { tamano: 200, plaza: 12 })));
    if (b.vy !== 0) aire++;
    ymin = Math.min(ymin, b.y / U);
  }
  const b = getBody(s, e);
  return { sobreMalla, sobreFuncion, aire, ymin, recorrido: Math.hypot(b.x / U, b.z / U) - 8, s, e };
}

test("the shared-state key and the validation of what the world says", () => {
  assert.equal(CLAVE_NATURALEZA, `${naturaleza.id}:${MUNDO}`, "the sim cannot import features/: its copy of the key is pinned here");
  assert.equal(terrenoDelEstado([]), null);
  assert.equal(terrenoDelEstado([["otro:mundo", { activa: true }]]), null);
  assert.equal(terrenoDelEstado([[CLAVE_NATURALEZA, { ...NAT, activa: false }]]), null, "switched off = flat ground");
  assert.deepEqual(terrenoDelEstado([[CLAVE_NATURALEZA, NAT]]), MUNDO_1234);
  assert.deepEqual(terrenoDelEstado([[CLAVE_NATURALEZA, { activa: true, semilla: -3, tamano: 9999, plaza: "x" }]]), { semilla: 1234, tamano: 200, plaza: 12, estanque: true }, "wrong numbers fall back to the defaults, never throw");
});

test("the mesh: ≤ 22 000 triangles, built in tens of ms, the same bits twice, pinned", () => {
  assert.ok(T1234.triangulos <= 22000, `${T1234.triangulos} triangles`);
  assert.equal(T1234.celdas, 100);
  assert.equal(T1234.triangulos, 2 * 100 * 100 + 8 * 100, "the grid plus the border wall");
  const ms: number[] = [];
  let fp = 0;
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); const T = terrenoMalla(MUNDO_1234); ms.push(performance.now() - t0); const f = bvhFingerprint(T.bvh); if (i) assert.equal(f, fp); fp = f; }
  ms.sort((a, b) => a - b);
  console.log(`# N5 build: ${T1234.triangulos} triangles, median ${ms[2].toFixed(1)} ms (min ${ms[0].toFixed(1)}, max ${ms[4].toFixed(1)})`);
  assert.ok(ms[2] < 400, `build median ${ms[2]} ms`);
  assert.equal(fp, 2434858016, "PIN: the tree of seed 1234 / 200 m / plaza 12 / pond: a change here is a change of the terrain or of the quantisation (both sides must change together)");
});

test("a 400 m world keeps the triangle budget (bigger cells, not more triangles)", () => {
  const t = triangulosDeTerreno({ ...MUNDO_1234, tamano: 400 });
  assert.equal(t.celdas, CELDAS_COLISION_MAX);
  assert.ok(t.tris.length / TRI_STRIDE <= 22000);
});

test("walking 45 m from the plaza in 16 directions: always standing ON the mesh, never in the air, never through it", () => {
  for (const semilla of [1234, 1]) {
    const T = semilla === 1234 ? T1234 : terrenoMalla({ ...MUNDO_1234, semilla });
    for (let k = 0; k < 16; k++) {
      const r = caminar(T, semilla, k);
      assert.ok(r.recorrido > 40, `seed ${semilla} heading ${k} only walked ${r.recorrido.toFixed(1)} m`);
      assert.ok(r.sobreMalla <= 0.02, `seed ${semilla} heading ${k}: ${r.sobreMalla} m off the mesh`);
      assert.equal(r.aire, 0, `seed ${semilla} heading ${k}: floated or fell for ${r.aire} ticks`);
      assert.ok(r.sobreFuncion < 0.9, `seed ${semilla} heading ${k}: ${r.sobreFuncion} m from alturaEn`);
    }
  }
});

test("on a calm 40 m line the avatar stays within ±0.05 m of alturaEn (seed 1234, heading 2)", () => {
  const r = caminar(T1234, 1234, 2);
  assert.ok(r.recorrido > 40);
  assert.ok(r.sobreFuncion <= 0.05, `${r.sobreFuncion} m from alturaEn`);
});

test("running over the hills also keeps the feet on the mesh (the step is split, 4 m/s)", () => {
  for (const k of [0, 3, 6, 9, 12]) {
    const r = caminar(T1234, 1234, k, 300, BTN_RUN);
    assert.ok(r.sobreMalla <= 0.02 && r.aire === 0, `heading ${k}: off ${r.sobreMalla} m, ${r.aire} ticks in the air`);
  }
});

test("the plaza is flat at 0, so the old spawn height is right there; the pond bed is walkable below 0 (wading, no swim)", () => {
  for (let i = 0; i < 40; i++) assert.ok(alturaEn(1234, Math.cos(i) * 11, Math.sin(i) * 11, { tamano: 200, plaza: 12 }) === 0);
  const s = createSim(1, 0); setMesh(s, T1234.bvh, PISO_SIN_SUELO);
  assert.equal(groundHeight(0, 0, s, 0), 0);
  // the lowest point of the mesh is under the water (−0.2) and an avatar can stand on it: the pond is not a wall and not a floor at 0
  assert.ok(T1234.hmin < -1, `pond bed at ${T1234.hmin}`);
  const r = caminar(terrenoMalla({ ...MUNDO_1234, semilla: 1 }), 1, 1);
  assert.ok(r.ymin < -0.5, `walking into the pond of seed 1 went down to ${r.ymin}`);
});

test("steep ground blocks (MAX_SLOPE_COS) and gentle ground does not; a ridge is not climbed, a 30° hill is", () => {
  const rampa = (grados: number) => {
    const tan = Math.tan((grados * Math.PI) / 180);
    const m = { ...MUNDO_1234, tamano: 100 };
    const t = triangulosDeTerreno(m, (x) => (x < 5 ? 0 : (x - 5) * tan));
    return buildBvh(t.tris);
  };
  const subir = (grados: number) => {
    const s = createSim(1, 0); setMesh(s, rampa(grados), PISO_SIN_SUELO); const e = spawnAvatar(s, 0);
    setBody(s, e, { x: fx(-10), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
    for (let t = 0; t < 400; t++) step(s, new Int32Array([e, 127, 0, 0]));
    const b = getBody(s, e); return { x: fxToFloat(b.x), y: fxToFloat(b.y) };
  };
  const suave = subir(30), duro = subir(60);
  assert.ok(suave.x > 12 && suave.y > 5, `the 30° hill was not climbed: ${JSON.stringify(suave)}`);
  assert.ok(duro.x < 6.5 && duro.y < 2, `the 60° ridge was climbed: ${JSON.stringify(duro)}`);
});

test("the border wall: nobody walks off the map, whatever the direction (and nobody falls under it)", () => {
  for (const k of [0, 4, 8, 12]) {
    const s = createSim(1, 0); setMesh(s, T1234.bvh, PISO_SIN_SUELO); const e = spawnAvatar(s, 0);
    setBody(s, e, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
    const th = (k / 16) * Math.PI * 2, mx = Math.round(127 * Math.cos(th)), mz = Math.round(127 * Math.sin(th));
    let ymin = Infinity;
    for (let t = 0; t < 1500; t++) { step(s, new Int32Array([e, mx, mz, BTN_RUN])); ymin = Math.min(ymin, s.tf.cols.y[e] / U); }
    const b = getBody(s, e);
    assert.ok(Math.abs(b.x / U) <= 100 && Math.abs(b.z / U) <= 100, `heading ${k}: left the world at ${b.x / U}, ${b.z / U}`);
    assert.ok(ymin > T1234.hmin - 1, `heading ${k}: fell to ${ymin}`);
  }
});

test("the default void sits under the lowest ground (D-045 default when the world gives none)", () => {
  assert.equal(sueloMinimoTerreno(T1234.hmin), Math.floor(T1234.hmin) - 8);
  assert.ok(sueloMinimoTerreno(T1234.hmin) < T1234.hmin - 7);
});

test("combining a GLB mesh with the terrain keeps both", () => {
  const una = buildBvh(new Int32Array([0, 640, 0, 640, 640, 0, 0, 640, 640])); // one triangle 10 m up
  assert.equal(combinarMallas(null, null), null);
  assert.equal(combinarMallas(una, null), una);
  assert.equal(combinarMallas(null, T1234.bvh), T1234.bvh);
  const c = combinarMallas(una, T1234.bvh)!;
  assert.equal(c.count, T1234.bvh.count + 1);
});

test("the flat-plaza path is untouched: no naturaleza = no mesh, no piso, and the reference fingerprint is the pinned one", () => {
  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n)), 0x7e630965);
  const s = createSim(1, 0);
  assert.equal(s.mesh, null); assert.equal(s.piso, 0);
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2 });
  const t = inst.join(0); void t;
  inst.tick();
  assert.equal(inst.sim.mesh, null, "a world without naturaleza.json never gets a mesh");
  assert.equal(inst.sim.piso, 0);
});

test("the fingerprint with terrain: the same inputs give the same hash twice, and the mesh is not in it", () => {
  const correr = () => {
    const s = createSim(5, 3); setMesh(s, T1234.bvh, PISO_SIN_SUELO);
    const es = [spawnAvatar(s, 0), spawnAvatar(s, 1)];
    for (const e of es) setBody(s, e, { x: fx(e * 3), y: 0, z: fx(2), vy: 0, air: 0, buf: 0 });
    for (let t = 0; t < 300; t++) step(s, new Int32Array([es[0], 100, 40, t % 90 === 0 ? 1 : 0, es[1], -60, 90, BTN_RUN]));
    return stateHash(s);
  };
  assert.equal(correr(), correr());
  const s = createSim(5, 3), h0 = stateHash(s); setMesh(s, T1234.bvh, PISO_SIN_SUELO);
  assert.equal(stateHash(s), h0, "setMesh changes no state byte");
});

// ---- the real thing: instance + client over loopback, a naturaleza world ----
function mundo() {
  const log: string[] = [];
  const inst = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2, features: [crearNaturaleza(NAT)], log: (l) => log.push(l) });
  const t = inst.join(0);
  const s = new ClientSession(t, { features: [naturalezaClient], view: { label() {}, bounce() {}, fundido() {}, naturaleza() {} } as never });
  const pump = (n = 1, mx = 0, mz = 0, bt = 0) => { for (let k = 0; k < n; k++) { t.flush(); s.tick(mx, mz, bt); t.flush(); inst.tick(); t.flush(); } };
  return { inst, s, pump, log, t };
}

test("instance + client: the server builds the terrain from the state, people appear ON it inside the plaza, the page predicts the same", () => {
  const { inst, s, pump, log } = mundo();
  pump(3);
  assert.ok(inst.sim.mesh, "terrain mesh set from naturaleza:mundo");
  assert.equal(inst.sim.piso, PISO_SIN_SUELO);
  assert.ok(log.some((l) => /colisión del terreno lista/.test(l)), log.join("\n"));
  const e = s.entity, X = () => inst.sim.tf.cols.x[e] / U, Z = () => inst.sim.tf.cols.z[e] / U, Y = () => inst.sim.tf.cols.y[e] / U;
  assert.ok(Math.hypot(X(), Z()) <= 12 * 0.6 * Math.SQRT2 + 0.1, "appears inside the plaza when the world gives no aparicion");
  assert.equal(Y(), 0, "the plaza is at 0");
  // walk 60 m north-east over the hills at full stick, then keep going: server and page agree all the way, with no correction
  pump(500, 90, 90);
  const h = alturaEn(1234, X(), Z(), { tamano: 200, plaza: 12 });
  assert.ok(Math.hypot(X(), Z()) > 30, `only got to ${X()},${Z()}`);
  assert.ok(Math.abs(Y() - h) < 0.9, `y ${Y()} vs alturaEn ${h}`);
  assert.equal(s.stats.corrections, 0, "the page's prediction matched the server's mesh tick by tick");
  const p = s.selfPosition(1);
  assert.ok(Math.abs(p.y - Y()) < 0.05 && Math.abs(p.x - X()) < 0.1, `page ${p.x},${p.y} vs server ${X()},${Y()}`);
});

test("instance: falling off the map (a body outside the border) comes back through the default void", () => {
  const { inst, s, pump } = mundo();
  pump(40);
  const e = s.entity;
  inst.sim.tf.cols.x[e] = fx(150); inst.sim.tf.cols.z[e] = fx(0); inst.sim.tf.cols.y[e] = fx(3); // outside the 100 m half-side: no ground
  pump(60);
  assert.ok(Math.abs(inst.sim.tf.cols.x[e] / U) <= 100, `still outside: ${inst.sim.tf.cols.x[e] / U}`);
  assert.ok(inst.sim.tf.cols.y[e] / U > -5, `y=${inst.sim.tf.cols.y[e] / U}`);
});
