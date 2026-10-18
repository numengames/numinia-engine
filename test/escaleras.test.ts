// N1b (Pablo, 16-10, in the Torre: «no sabe subir bien las escaleras, se queda como saltando en el aire»): walking up
// and down a stair keeps you on the ground on every tick, and the avatar's «in the air» is measured from the ground
// under it, not from the plaza (on a roof you walk).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BTN_RUN, createSim, spawnAvatar, step, setSolids, solidsFrom, groundHeight, setBody, getBody, INPUT_STRIDE, REFERENCE, referenceRecording, replayFingerprint } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { sueloBajo, estadoPor } from "../packages/render/src/avatares-politica.ts";

// the Torre's stair: 32 steps of 0.37 m, 0.6 m deep, going north (−z) from z 11.3, 3.25 m wide at x 12.125
const PELDANOS = 32, SUBIDA = 0.37, FONDO = 0.6;
const valores: [string, Record<string, unknown>][] = [];
for (let i = 0; i < PELDANOS; i++) {
  const top = SUBIDA * (i + 1), z = 11 - FONDO * i;
  valores.push([`p${String(i).padStart(2, "0")}`, { solido: true, bx0: 10.5, by0: top - 0.4, bz0: z - FONDO / 2, bx1: 13.75, by1: top, bz1: z + FONDO / 2 }]);
}
const cajas = solidsFrom(valores);

function andar(z0: number, mz: number, ticks: number, run = false) {
  const s = createSim(2, 1);
  const e = spawnAvatar(s, 0);
  setSolids(s, cajas);
  const b = getBody(s, e);
  setBody(s, e, { ...b, x: fx(12.1), z: fx(z0), y: groundHeight(fx(12.1), fx(z0), s, fx(20)), vy: 0 });
  let enElAire = 0, maxY = 0;
  for (let t = 0; t < ticks; t++) {
    const inp = new Int32Array(INPUT_STRIDE); inp[0] = e; inp[2] = mz; inp[3] = run ? BTN_RUN : 0;
    step(s, inp);
    const yo = getBody(s, e);
    if (yo.y !== groundHeight(yo.x, yo.z, s, yo.y)) enElAire++;
    maxY = Math.max(maxY, yo.y / 65536);
  }
  return { enElAire, y: getBody(s, e).y / 65536, maxY };
}

test("N1b: up the stair, every tick on the ground, to the top", () => {
  const r = andar(12, -127, 259); // 12.95 s walking north (1.5 m/s, J3): onto the top step (z −7.4)
  assert.equal(r.enElAire, 0, "never in the air going up");
  assert.ok(Math.abs(r.maxY - PELDANOS * SUBIDA) < 0.01, `reaches the top step: ${r.maxY}`);
});

test("N1b: down the stair, every tick on the ground (snap-to-ground), to the bottom", () => {
  const r = andar(11 - FONDO * (PELDANOS - 1), 127, 325); // from the top step, walking south (1.5 m/s, J3)
  assert.equal(r.enElAire, 0, "never in the air going down");
  assert.ok(r.y < 0.01, `reaches the plaza: ${r.y}`);
});

test("N1b: snapping to the ground leaves the reference fingerprint as it was (flat plaza)", () => {
  const rec = referenceRecording(REFERENCE.seed, 2000, REFERENCE.n);
  assert.equal(replayFingerprint(rec), replayFingerprint(rec));
  const s = createSim(2, 1); spawnAvatar(s, 0);
  assert.equal(groundHeight(0, 0, s, 0), 0);
});

test("N1b: an avatar standing on a roof or a step is not «in the air»", () => {
  const roof = [-14, 11.5, -14, 14, 12, 14];
  assert.equal(sueloBajo(0, 0, 12, roof), 12);
  assert.equal(estadoPor(0, 12 - sueloBajo(0, 0, 12, roof)), "quieto");
  assert.equal(estadoPor(0, 13 - sueloBajo(0, 0, 13, roof)), "saltar"); // a jump over the roof still is
  assert.equal(sueloBajo(20, 0, 12, roof), 0);                          // off the roof: the plaza
});

test("N1b: running up the stair does not stop dead at the first step (the move is split into pieces)", () => {
  const r = andar(12, -127, 98, true); // 4.9 s running north (4 m/s since main halved the speeds): onto the top step (z −7.6)
  assert.equal(r.enElAire, 0);
  assert.ok(Math.abs(r.maxY - PELDANOS * SUBIDA) < 0.01, `reaches the top step running: ${r.maxY}`);
});

test("N1b: running down the stair stays on the ground", () => {
  const r = andar(11 - FONDO * (PELDANOS - 1), 127, 120, true);
  assert.equal(r.enElAire, 0);
  assert.ok(r.y < 0.01);
});
