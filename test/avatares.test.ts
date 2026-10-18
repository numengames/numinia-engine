import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANIMAR_HASTA_M, BOCA_SILENCIO_RMS, CUPO_VRM, TRIANGULOS_MAX, clipPara, cupoVRM, decaerBoca, elegirAvatar, elegirCercanos, estadoPor, girarHacia, nivelBoca, nuevaMarcha, seguir,
} from "../packages/render/src/avatares-politica.ts";
import { TRIANGULOS_MAX_VRM } from "../packages/server/src/vrm.ts";

// J1: the plaza's avatar decisions (pure). The house library is checked by test/avatares-biblioteca.test.ts.

test("J1 policy: VRM cap per device class (12 phone, 25 headset, 60 desktop) and the 10,000-triangle limit agree", () => {
  assert.equal(cupoVRM({ mobile: true, xr: false }), 12);
  assert.equal(cupoVRM({ mobile: false, xr: true }), 25);
  assert.equal(cupoVRM({ mobile: true, xr: true }), 25);
  assert.equal(cupoVRM({ mobile: false, xr: false }), 60);
  assert.deepEqual(CUPO_VRM, { escritorio: 60, visor: 25, movil: 12 });
  assert.equal(TRIANGULOS_MAX, TRIANGULOS_MAX_VRM, "page and server refuse at the same number");
  assert.equal(ANIMAR_HASTA_M, 40);
});

test("J1 policy: each player's avatar is fixed by its entity id and every avatar gets used", () => {
  for (let id = 0; id < 50; id++) assert.equal(elegirAvatar(id, 3), elegirAvatar(id, 3));
  assert.deepEqual(new Set([0, 1, 2, 3, 4, 5].map((id) => elegirAvatar(id, 3))), new Set([0, 1, 2]));
  assert.equal(elegirAvatar(7, 0), -1);
  assert.equal(elegirAvatar(-4, 3) >= 0, true);
});

test("J1 policy: state by horizontal speed and height (idle < 0.3 m/s, run > 5 m/s, in the air > 0.15 m)", () => {
  assert.equal(estadoPor(0, 0), "quieto");
  assert.equal(estadoPor(0.29, 0), "quieto");
  assert.equal(estadoPor(0.3, 0), "andar");
  assert.equal(estadoPor(4, 0), "andar"); // the sim's walking speed today
  assert.equal(estadoPor(5.01, 0), "correr");
  assert.equal(estadoPor(0, 0.5), "saltar");
});

test("J1 policy: walking picks the stride that fits the avatar; missing clips fall back; rate stays in 0.5..2", () => {
  const natural = { andar: 0.797, trotar: 5.184, correr: 7.772 };
  const todo = () => true;
  // a tall avatar (hips 0.89 m) at 1 m/s walks; a short one (hips 0.41 m) at 4 m/s jogs
  assert.equal(clipPara("andar", 1, 0.89, natural, todo)?.clip, "andar");
  assert.equal(clipPara("andar", 4, 0.41, natural, todo)?.clip, "trotar");
  assert.equal(clipPara("andar", 4, 0.89, natural, todo)?.clip, "trotar");
  const r = clipPara("andar", 4, 0.89, natural, todo)!;
  assert.ok(Math.abs(r.ritmo - 4 / (5.184 * 0.89)) < 1e-9);
  assert.equal(clipPara("andar", 40, 0.41, natural, todo)!.ritmo, 2);
  assert.equal(clipPara("quieto", 0, 0.89, natural, todo)?.ritmo, 1);
  // only idle loaded so far: idle plays (the caller keeps the old clip until the wanted one loads)
  assert.equal(clipPara("andar", 4, 0.89, natural, (c) => c === "quieto")?.clip, "quieto");
  assert.equal(clipPara("correr", 6, 0.89, natural, (c) => c !== "correr")?.clip, "trotar");
  assert.equal(clipPara("andar", 1, 0.89, natural, () => false), null);
});

test("J1 policy: the nearest wear a VRM, within the cap, and whoever has one keeps it against a near tie", () => {
  const yo = { x: 0, z: 0 };
  const otros = Array.from({ length: 30 }, (_, i) => ({ id: i, x: i + 1, z: 0 })); // id i at i+1 m
  const s = elegirCercanos(yo, otros, 12, new Set());
  assert.equal(s.size, 11, "12 minus yourself");
  assert.ok([...s].every((id) => id < 11));
  // id 20 (21 m) already has one: someone at 19.5 m does not take it (margin 3 m); someone at 15 m does
  const pocos = [{ id: 20, x: 21, z: 0 }, { id: 21, x: 19.5, z: 0 }];
  assert.deepEqual([...elegirCercanos(yo, pocos, 2, new Set([20]))], [20]);
  assert.deepEqual([...elegirCercanos(yo, [{ id: 20, x: 21, z: 0 }, { id: 22, x: 15, z: 0 }], 2, new Set([20]))], [22]);
  assert.equal(elegirCercanos(null, otros, 5, new Set()).size, 5, "no self yet: all five places for others");
});

test("J1 policy: speed and facing come from position deltas, smoothed; a long pause gives no speed", () => {
  const m = nuevaMarcha();
  seguir(m, 0, 0, 0.05);
  for (let i = 1; i <= 40; i++) seguir(m, i * 0.2, 0, 0.05); // +X at 4 m/s for 2 s
  assert.ok(Math.abs(m.velocidad - 4) < 0.05, `speed ${m.velocidad}`);
  assert.ok(Math.abs(m.rumbo - Math.PI / 2) < 0.02, "faces +X (yaw = atan2(vx, vz))");
  for (let i = 1; i <= 40; i++) seguir(m, 8, -i * 0.2, 0.05); // then −Z
  assert.ok(Math.abs(Math.atan2(Math.sin(m.rumbo - Math.PI), Math.cos(m.rumbo - Math.PI))) < 0.02, "turned to face −Z");
  for (let i = 1; i <= 40; i++) seguir(m, 8, -8, 0.05); // stands still: speed decays, facing stays
  assert.ok(m.velocidad < 0.3);
  const rumbo = m.rumbo;
  seguir(m, 100, 100, 5); // tab hidden for 5 s, then teleport: no 30 m/s burst
  assert.equal(m.velocidad, 0);
  assert.equal(m.rumbo, rumbo);
  assert.ok(Math.abs(girarHacia(3, -3, 10, 0.1) - (-3 + 2 * Math.PI)) < 1e-6, "turns the short way across ±π");
});

test("U13 policy: voice RMS under the silence floor keeps the mouth shut; above it, it opens and saturates at 1", () => {
  assert.equal(nivelBoca(0), 0);
  assert.equal(nivelBoca(BOCA_SILENCIO_RMS), 0, "right at the floor: still shut");
  assert.ok(nivelBoca(BOCA_SILENCIO_RMS + 0.01) > 0);
  assert.equal(nivelBoca(1), 1, "a very loud frame saturates, never above 1");
  // monotonic: louder decoded audio never closes the mouth more than quieter audio
  assert.ok(nivelBoca(0.05) < nivelBoca(0.08));
});

test("U13 policy: the mouth fades on its own between voice frames instead of sticking open", () => {
  const abierta = nivelBoca(0.1); // a loud frame just arrived
  assert.ok(abierta > 0);
  let nivel = decaerBoca(0, 0.1);
  assert.equal(nivel, abierta, "the first frame opens it at once");
  let pasos = 0;
  while (nivel > 0.01 && pasos < 100) { nivel = decaerBoca(nivel, null); pasos++; } // no more frames arrive: it closes
  assert.ok(pasos > 0 && pasos < 30, `closed in ${pasos} ticks (100 ms each) without sticking open forever`);
  assert.equal(decaerBoca(0, null), 0, "silence from the start stays silence");
  // a frame too quiet to open the mouth on its own still lets the previous level decay by `factor`
  assert.ok(Math.abs(decaerBoca(0.9, 0.001) - 0.9 * 0.55) < 1e-9);
  assert.ok(decaerBoca(0.1, 0.1) >= nivelBoca(0.1), "a new frame at least as loud as the kept level wins");
});

test("N1b: a jog at walking speed meets a natural step rate half way (no slow-motion bounding); shorter legs step faster", () => {
  const natural = { andar: 0.797, trotar: 5.184, correr: 7.772 }, duracion = { andar: 1.667, trotar: 1.167, correr: 0.833 };
  const hay = () => true;
  const sinPaso = clipPara("andar", 4, 0.888, natural, hay)!;              // as before: feet still, 0.87
  const conPaso = clipPara("andar", 4, 0.888, natural, hay, duracion)!;
  assert.equal(conPaso.clip, "trotar");
  assert.ok(sinPaso.ritmo < 0.9 && conPaso.ritmo > 1.1 && conPaso.ritmo < 1.3, `${sinPaso.ritmo} → ${conPaso.ritmo}`);
  const bajo = clipPara("andar", 4, 0.6, natural, hay, duracion)!;
  assert.ok(bajo.ritmo > conPaso.ritmo && bajo.ritmo <= 2);
  assert.equal(clipPara("andar", 0.7, 0.888, natural, hay, duracion)!.clip, "andar"); // a slow walk is untouched
  assert.equal(clipPara("andar", 0.7, 0.888, natural, hay, duracion)!.ritmo, clipPara("andar", 0.7, 0.888, natural, hay)!.ritmo);
});
