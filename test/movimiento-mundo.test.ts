// The world's pace: entorno.json `movimiento` { andar, correr, fov } — format, the sim's step, the page's camera, and that the
// page's prediction and the server's sim agree. Without `movimiento` nothing changes (the reference fingerprint is pinned in engine.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSim, spawnAvatar, step, setMovimiento, getBody, BTN_RUN, TICK_HZ, replayFingerprint, referenceRecording, REFERENCE } from "../packages/sim/src/index.ts";
import { fxToFloat } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { createCamara } from "../packages/render/src/camara.ts";
import { CAMARA } from "../packages/render/src/camara-orbita.ts";
import type { ClientPart, Msg } from "../packages/feature/src/index.ts";
import { ZONA } from "../features/entorno/feature.ts";
import { validarEntorno, aFichero, leerMovimiento, ESQUEMA } from "../features/entorno/esquema.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { crearCliente } from "../features/entorno/client.ts";
import { movimientoDelMundo } from "../features/mundo.ts";

// createCamara listens on the window for the click after a drag: a bare Node has none
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.addEventListener !== "function") g.addEventListener = () => {};
const TARUGO = { andar: 3, correr: 6, fov: 70 }; // derived from Hyperfy's source (PlayerLocal), not measured in the deployed world

// ---- the format -------------------------------------------------------------------------------------------------------------------

test("movimiento format: good values pass and ride the flat state; bad ones say the path and how to fix it", () => {
  const ok = validarEntorno({ schema: ESQUEMA, movimiento: TARUGO });
  assert.ok(ok.ok, JSON.stringify(!ok.ok && ok.issues));
  if (ok.ok) assert.deepEqual([ok.value.movAndar, ok.value.movCorrer, ok.value.movFov], [3, 6, 70]);
  assert.deepEqual(leerMovimiento({ movimiento: { andar: 2 } }), { ok: true, value: { andar: 2 } }, "each key is optional");
  assert.deepEqual(leerMovimiento({}), { ok: true, value: null });
  for (const [json, path] of [
    [{ movimiento: { andar: 0 } }, "entorno.movimiento.andar"],
    [{ movimiento: { andar: 11 } }, "entorno.movimiento.andar"],
    [{ movimiento: { andar: "3" } }, "entorno.movimiento.andar"],
    [{ movimiento: { correr: 21 } }, "entorno.movimiento.correr"],
    [{ movimiento: { correr: NaN } }, "entorno.movimiento.correr"],
    [{ movimiento: { fov: 10 } }, "entorno.movimiento.fov"],
    [{ movimiento: { fov: 200 } }, "entorno.movimiento.fov"],
    [{ movimiento: [] }, "entorno.movimiento"],
    [{ movimiento: "rápido" }, "entorno.movimiento"],
  ] as [Record<string, unknown>, string][]) {
    const r = validarEntorno({ schema: ESQUEMA, ...json });
    assert.equal(r.ok, false, JSON.stringify(json));
    const issue = !r.ok && r.issues.find((i) => i.path === path);
    assert.ok(issue, `${JSON.stringify(json)} must report ${path}: ${JSON.stringify(!r.ok && r.issues)}`);
    assert.match(issue ? issue.message : "", /[a-zñ]{4}/, "a message that says how to fix it");
  }
});

test("movimiento format: the file round-trips, and a world without it stays without", () => {
  const r = validarEntorno({ schema: ESQUEMA, movimiento: TARUGO });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(aFichero(r.value).movimiento, TARUGO);
  const sin = validarEntorno({ schema: ESQUEMA });
  assert.ok(sin.ok);
  if (sin.ok) { assert.equal("movimiento" in aFichero(sin.value), false); assert.deepEqual([sin.value.movAndar, sin.value.movCorrer, sin.value.movFov], [0, 0, 0]); }
});

test("movimiento: the composition root reads it from entorno.json; a wrong one is said and the house pace stays", () => {
  const log: string[] = [];
  assert.deepEqual(movimientoDelMundo(() => ({ schema: ESQUEMA, movimiento: TARUGO }), (l) => log.push(l)), TARUGO);
  assert.equal(movimientoDelMundo(() => ({ schema: ESQUEMA }), (l) => log.push(l)), null);
  assert.equal(log.length, 0);
  assert.equal(movimientoDelMundo(() => ({ schema: ESQUEMA, movimiento: { andar: 99 } }), (l) => log.push(l)), null);
  assert.match(log[0], /entorno\.movimiento\.andar/);
});

// ---- the sim -----------------------------------------------------------------------------------------------------------------------

/** Metres walked along -z in `ticks` ticks at full stick, from the spawn point of a one-avatar sim on the flat plaza. */
function recorrido(ticks: number, botones: number, mov?: [number | null, number | null]): number {
  const s = createSim(2, 1); const e = spawnAvatar(s, 0);
  if (mov) setMovimiento(s, mov[0], mov[1]);
  const z0 = getBody(s, e).z;
  for (let t = 0; t < ticks; t++) step(s, new Int32Array([e, 0, -127, botones]));
  return fxToFloat(z0 - getBody(s, e).z);
}

test("sim: the house walks 1.5 m/s and runs 4 m/s; the world's numbers change the step, nothing else", () => {
  const casa = [recorrido(TICK_HZ, 0), recorrido(TICK_HZ, BTN_RUN)];
  assert.ok(Math.abs(casa[0] - 1.5) < 0.01 && Math.abs(casa[1] - 4) < 0.01, `casa ${casa}`);
  assert.deepEqual([recorrido(TICK_HZ, 0, [null, null]), recorrido(TICK_HZ, BTN_RUN, [null, null])], casa, "null = the house's");
  const w = [recorrido(TICK_HZ, 0, [3, 6]), recorrido(TICK_HZ, BTN_RUN, [3, 6])];
  assert.ok(Math.abs(w[0] - 3) < 0.01 && Math.abs(w[1] - 6) < 0.01, `mundo ${w}`);
  assert.ok(Math.abs(recorrido(TICK_HZ, 0, [3, null]) - 3) < 0.01 && Math.abs(recorrido(TICK_HZ, BTN_RUN, [3, null]) - 4) < 0.01, "each number on its own");
});

test("sim: the pace is not part of the fingerprint — an untouched state replays the pinned reference", () => {
  const rec = referenceRecording(REFERENCE.seed, 500, REFERENCE.n);
  const a = replayFingerprint(rec);
  assert.equal(replayFingerprint(rec), a);
  assert.equal(createSim(2, 1).paso, createSim(2, 1).paso);
});

// ---- the page and the server agree -------------------------------------------------------------------------------------------------

test("prediction: the page, given the world's pace by the environment state, ends where the server's sim does (no correction)", () => {
  const json = { schema: ESQUEMA, movimiento: TARUGO };
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearEntorno(json)], log: () => {}, puede: () => true, movimiento: TARUGO });
  const t = inst.join(0), cli = crearCliente(), vistos: Msg[] = [];
  let s!: ClientSession;
  s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, entorno: (v) => { vistos.push(v); } } });
  const pump = () => { t.flush(); inst.tick(); t.flush(); };
  for (let k = 0; k < 4; k++) pump();
  const v = s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([v.movAndar, v.movCorrer, v.movFov], [3, 6, 70], "the page gets the pace with the environment");
  const z0 = s.selfPosition(1).z;
  for (let k = 0; k < 2 * TICK_HZ; k++) { s.tick(0, -127, BTN_RUN); pump(); }
  for (let k = 0; k < 4; k++) pump();
  const corridos = z0 - s.selfPosition(1).z;
  assert.ok(Math.abs(corridos - 12) < 0.2, `2 s running at 6 m/s = 12 m, got ${corridos}`);
  assert.equal(s.stats.corrections, 0, "the server never had to correct the prediction");
});

// ---- the camera ----------------------------------------------------------------------------------------------------------------------

test("camera: the world's field of view is set from the environment, and a world without it gets the house's 60°", () => {
  const cam = new THREE.PerspectiveCamera(CAMARA.fovCasa, 1, CAMARA.planoCerca.tercera, 600);
  const dom = { addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), clientWidth: 800, clientHeight: 600, style: {}, ownerDocument: { addEventListener() {}, removeEventListener() {} } } as unknown as HTMLElement;
  const c = createCamara(cam, dom);
  assert.equal(cam.fov, 60);
  c.mundo({ movFov: 70 });
  assert.equal(cam.fov, 70);
  c.mundo({ movFov: 0 });
  assert.equal(cam.fov, 60, "0 = the house's");
  c.mundo({});
  assert.equal(cam.fov, 60);
});
