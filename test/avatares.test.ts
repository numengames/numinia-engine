import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANIMAR_HASTA_M, CUPO_VRM, TRIANGULOS_MAX, clipPara, cupoVRM, elegirAvatar, elegirCercanos, estadoPor, girarHacia, nuevaMarcha, seguir,
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
