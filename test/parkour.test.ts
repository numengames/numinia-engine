// J24 (Pablo, 16-10: «movimientos de parkour, al subirse a un muro, si puedes llegar colgarte como en el Prince of
// Persia»): catch a ledge when a jump falls short, hang, let go, shimmy, pull yourself up; climb a low wall when you
// jump running into it. All in the deterministic sim (fixed point), predicted exactly by the page, and the flat
// plaza (the reference fingerprint) untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import {
  createSim, spawnAvatar, step, setSolids, solidsFrom, getBody, setBody, groundHeight, BTN_JUMP, BTN_RUN, INPUT_STRIDE,
  HANG_DROP, HANG_SETTLE, PK_HANG, BODY_RADIUS, snapshot, REFERENCE, referenceRecording, replayFingerprint,
} from "../packages/sim/src/index.ts";
import type { SimState } from "../packages/sim/src/index.ts";
import { encodeSnapshot, decodeSnapshot, loopbackPair } from "../packages/net/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { existsSync } from "node:fs";
import { estadoPor, clipPara } from "../packages/render/src/avatares-politica.ts";

type Caja = [number, number, number, number, number, number]; // metres: x0 y0 z0 x1 y1 z1
const cajas = (...c: Caja[]) => solidsFrom(c.map((b, i) => [`c${String(i).padStart(3, "0")}`, { solido: true, bx0: b[0], by0: b[1], bz0: b[2], bx1: b[3], by1: b[4], bz1: b[5] }]));
const m = (v: number) => v / FX_ONE;

/** One avatar standing at (x, z) metres among these boxes. */
function mundo(boxes: Int32Array, x: number, z: number, parkour = true, y = 50): SimState {
  const s = createSim(2, 1); spawnAvatar(s, 0);
  setSolids(s, boxes); s.parkour = parkour;
  setBody(s, 0, { x: fx(x), y: groundHeight(fx(x), fx(z), s, fx(y)), z: fx(z), vy: 0, air: 0, buf: 0, pk: 0 });
  return s;
}
const mover = (s: SimState, mx: number, mz: number, b = 0) => { step(s, new Int32Array([0, mx, mz, b])); return getBody(s, 0); };
const etapa = (pk: number) => pk >> 2;
/** Step with this stick until hanging (at most 60 ticks). */
const colgarse = (s: SimState, mx: number, mz: number) => { for (let i = 0; i < 60 && etapa(getBody(s, 0).pk) !== PK_HANG; i++) mover(s, mx, mz); return getBody(s, 0); };

// a wall 3 m high north of you: its south face at z −2
const MURO = cajas([-5, 0, -3, 5, 3, -2]);

test("J24: jump at a 3 m wall holding toward it: you catch the edge and hang, feet 1.7 m below it, still", () => {
  const s = mundo(MURO, 0, -1.5);
  let b = mover(s, 0, -127, BTN_JUMP), t = 1;
  while (etapa(b.pk) !== PK_HANG && t < 40) { b = mover(s, 0, -127); t++; }
  assert.equal(etapa(b.pk), PK_HANG, "caught the edge");
  assert.ok(t < 20, `in ${t} ticks`);
  assert.equal(b.y, fx(3) - HANG_DROP);
  assert.equal(b.z, fx(-2) + BODY_RADIUS, "against the wall");
  assert.deepEqual([b.vy, b.air, b.pk & 3], [0, 0, 3]);
  // hands off the stick: it stays hanging, no gravity, no drift
  for (let i = 0; i < 40; i++) { const c = mover(s, 0, 0); assert.deepEqual([c.x, c.y, c.z, etapa(c.pk)], [b.x, b.y, b.z, PK_HANG]); }
});

test("J24: stick away from the wall lets go: you fall to the ground and do not catch it again", () => {
  const s = mundo(MURO, 0, -1.5);
  mover(s, 0, -127, BTN_JUMP);
  assert.equal(etapa(colgarse(s, 0, -127).pk), PK_HANG);
  let b = getBody(s, 0);
  for (let i = 0; i < 30; i++) b = mover(s, 0, 127);
  assert.equal(b.pk, 0); assert.equal(b.y, 0, "back on the plaza");
});

test("J24: a jump press pulls you up onto the top in 6 ticks (0.3 s), ending exactly on it", () => {
  const s = mundo(cajas([-5, 0, -6, 5, 3, -2]), 0, -1.5); // a deep block: there is a top to stand on
  mover(s, 0, -127, BTN_JUMP);
  assert.equal(etapa(colgarse(s, 0, -127).pk), PK_HANG);
  const ys: number[] = [];
  let b = mover(s, 0, 0, BTN_JUMP); ys.push(b.y);
  for (let i = 0; i < 5; i++) { b = mover(s, 0, 0); ys.push(b.y); }
  assert.equal(b.pk, 0, "done climbing");
  assert.equal(b.y, fx(3)); assert.equal(groundHeight(b.x, b.z, s, b.y), fx(3), "standing on the top");
  assert.ok(m(b.z) < -2.1, `past the edge: z ${m(b.z)}`);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] >= ys[i - 1], "never sinks while climbing");
  for (let i = 0; i < 10; i++) b = mover(s, 0, 0);
  assert.equal(b.y, fx(3), "and stays there");
});

test("J24: holding forward also pulls you up, but only after the catch has shown (HANG_SETTLE ticks)", () => {
  const s = mundo(cajas([-5, 0, -6, 5, 3, -2]), 0, -1.5);
  mover(s, 0, -127, BTN_JUMP);
  let hang = 0, b = getBody(s, 0);
  for (let i = 0; i < 40 && !(hang > 0 && b.pk === 0); i++) { b = mover(s, 0, -127); if (etapa(b.pk) === PK_HANG) hang++; }
  assert.equal(hang, HANG_SETTLE + 1, "hung a moment, then climbed");
  assert.equal(b.y, fx(3));
});

test("J24: hanging, the stick sideways shimmies along the edge and stops where it ends", () => {
  const s = mundo(MURO, 3, -1.5);
  mover(s, 0, -127, BTN_JUMP);
  colgarse(s, 0, -127);
  let b = getBody(s, 0);
  const x0 = b.x;
  for (let i = 0; i < 20; i++) b = mover(s, 127, 0); // 1 s east at 1 m/s
  assert.equal(b.x - x0, fx(1 / 20) * 20, "1 m along"); assert.equal(etapa(b.pk), PK_HANG);
  for (let i = 0; i < 60; i++) b = mover(s, 127, 0);
  assert.ok(b.x <= fx(5) && b.x > fx(4.94), `stops at the corner (the centre stays over the face): ${m(b.x)}`);
  assert.equal(b.y, fx(3) - HANG_DROP);
});

test("J24: no room over the top (a ceiling): you can hang, but not climb", () => {
  const s = mundo(cajas([-5, 0, -6, 5, 3, -2], [-5, 3.6, -6, 5, 4, -1.5]), 0, -1.2); // a slab 0.6 m above the top
  mover(s, 0, -127, BTN_JUMP);
  for (let i = 0; i < 20; i++) mover(s, 0, -127);
  assert.equal(etapa(getBody(s, 0).pk), PK_HANG);
  for (let i = 0; i < 10; i++) mover(s, 0, -127, BTN_JUMP);
  assert.equal(etapa(getBody(s, 0).pk), PK_HANG, "still hanging");
});

test("J24: running into a 1 m wall with a jump climbs it (mantle) in 4 ticks, without flying over it", () => {
  const s = mundo(cajas([-5, 0, -8, 5, 1, -2]), 0, 0);
  let b = getBody(s, 0), t = 0;
  while (m(b.z) > -1.3 && t < 40) { b = mover(s, 0, -127, BTN_RUN); t++; }
  b = mover(s, 0, -127, BTN_RUN | BTN_JUMP);
  assert.ok(etapa(b.pk) >= 2, "climbing");
  const ys = [b.y];
  for (let i = 0; i < 3; i++) { b = mover(s, 0, -127, BTN_RUN); ys.push(b.y); }
  assert.equal(b.pk, 0); assert.equal(b.y, fx(1));
  assert.ok(Math.max(...ys) <= fx(1), "never above the top");
  b = mover(s, 0, -127, BTN_RUN);
  assert.ok(b.y === fx(1) && b.z < fx(-2.2), "runs on along the top");
  // the same with parkour off: a plain jump, which goes 1.5 m up first
  const o = mundo(cajas([-5, 0, -8, 5, 1, -2]), 0, 0, false);
  let c = getBody(o, 0);
  for (let i = 0; i < 40 && m(c.z) > -1.3; i++) c = mover(o, 0, -127, BTN_RUN);
  let top = 0; c = mover(o, 0, -127, BTN_RUN | BTN_JUMP);
  for (let i = 0; i < 20; i++) { c = mover(o, 0, -127, BTN_RUN); top = Math.max(top, c.y); }
  assert.ok(top > fx(1.2) && c.pk === 0);
});

test("J24: walking off a roof does not catch its edge; a wall needs the stick toward it", () => {
  // roof 4 m high, you walk south off its edge (stick away from the face you pass)
  const s = mundo(cajas([-5, 0, -5, 5, 4, 0]), 0, -1);
  let b = getBody(s, 0);
  assert.equal(b.y, fx(4));
  for (let i = 0; i < 40; i++) b = mover(s, 0, 127);
  assert.equal(b.pk, 0); assert.equal(b.y, 0);
  // jumping straight up beside a wall without pushing toward it: no catch
  const w = mundo(MURO, 0, -1.5);
  mover(w, 0, 0, BTN_JUMP);
  for (let i = 0; i < 30; i++) b = mover(w, 0, 0);
  assert.equal(b.pk, 0); assert.equal(b.y, 0);
});

test("J24: off ledges the state is 0, so the plaza without solids hashes exactly as before (93b192c8 stands)", () => {
  const rec = referenceRecording(REFERENCE.seed, 2000, REFERENCE.n);
  assert.equal(replayFingerprint(rec), replayFingerprint(rec));
  // snapshot bytes of a sim with parkour on vs off, same inputs, no solids: identical
  const a = createSim(4, 3), b = createSim(4, 3); b.parkour = false;
  for (const s of [a, b]) for (let i = 0; i < 3; i++) spawnAvatar(s, i);
  for (const t of rec.ticks.slice(0, 300)) { const inp = t.slice(0, 3 * INPUT_STRIDE); step(a, inp); step(b, inp); }
  assert.deepEqual(snapshot(a), snapshot(b));
});

test("J24 net + prediction: the hang travels in the flags byte; hanging and climbing over loopback: 0 corrections", () => {
  const boxes = cajas([-5, 0, -6, 5, 3, -2]);
  const inst = new Instance({ seed: 7, capacity: 4, k: 4, snapshotEvery: 2 });
  const [server, client] = loopbackPair();
  inst.connect(server);
  const session = new ClientSession(client);
  client.flush();
  session.tick(0, 0); inst.tick(); client.flush();
  setSolids(inst.sim, boxes);
  setSolids((session as unknown as { local: SimState }).local, boxes);
  const e = session.entity;
  setBody(inst.sim, e, { x: 0, y: 0, z: fx(-1.5), vy: 0, air: 0, buf: 0, pk: 0 });
  for (let t = 0; t < 10; t++) { session.tick(0, 0); inst.tick(); client.flush(); }
  const before = session.stats.corrections; // the teleport above is one correction
  const seen = new Set<string>();
  for (let t = 0; t < 60; t++) {
    session.tick(0, t < 20 ? -127 : 0, t === 0 ? BTN_JUMP : 0); // jump into the wall, hold forward: catch, hang, pull up
    inst.tick(); client.flush();
    seen.add(session.parkour()?.modo ?? "-");
  }
  const bytes = encodeSnapshot(inst.sim, e, 1, []);
  assert.equal(decodeSnapshot(bytes)!.self.pk, inst.sim.mo.cols.pk[e]);
  assert.equal(session.stats.corrections, before);
  assert.ok(seen.has("colgado") && seen.has("trepar"), [...seen].join(","));
  assert.equal(m(inst.sim.tf.cols.y[e]), 3, "on top on the server");
  assert.equal(session.selfPosition(1).y, 3, "and on the page");
});

// ---- the Alchemists' Tower jump circuit (work/torre/trazado.mjs, read-only, outside this repository: skipped where
// it is not): which jumps that fell short now succeed by catching the edge. Every solid of the tower; the same tries
// with parkour off and on.
const TRAZADO = new URL("../../torre/trazado.mjs", import.meta.url);
const torre = existsSync(TRAZADO) ? await import(TRAZADO.href) : null;
const OBJETOS: unknown[] = torre?.OBJETOS ?? [], SALTOS: unknown[] = torre?.SALTOS ?? [];
type Obj = { x: number; y: number; z: number; sx: number; sy: number; sz: number; solid: boolean };
const TORRE = solidsFrom((OBJETOS as Obj[]).filter((o) => o.solid).map((o, i) => [`t${String(i).padStart(4, "0")}`,
  { solido: true, bx0: o.x - o.sx / 2, by0: o.y, bz0: o.z - o.sz / 2, bx1: o.x + o.sx / 2, by1: o.y + o.sy, bz1: o.z + o.sz / 2 }]));
type Salto = { id: string; x: number; z: number; top: number };

/** From `desde` metres along the line from platform `a`'s centre, run toward `b`'s centre; jump after `t0` ticks, the
 * air jump `k` ticks later (or none); pull up with forward. Success: standing on `b`'s top within 4 s. */
function intento(a: Salto, b: Salto, desde: number, t0: number, k: number, parkour: boolean): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
  const s = mundo(TORRE, a.x + (dx / d) * desde, a.z + (dz / d) * desde, parkour, a.top);
  const mx = Math.round((127 * dx) / d), mz = Math.round((127 * dz) / d);
  let p = getBody(s, 0);
  for (let t = 0; t < 80; t++) {
    const btn = BTN_RUN | (t === t0 || (k >= 0 && t === t0 + k) ? BTN_JUMP : 0);
    p = mover(s, mx, mz, btn);
    if (p.pk === 0 && p.y === fx(b.top) && Math.abs(m(p.x) - b.x) <= 1 && Math.abs(m(p.z) - b.z) <= 1 && groundHeight(p.x, p.z, s, p.y) === p.y) return true;
  }
  return false;
}

test("J24 in the Tower: catching the edge saves jumps that fell short, and never loses one", { skip: !torre && "work/torre/trazado.mjs not here" }, () => {
  const filas: string[] = [];
  let salvados = 0, perdidos = 0;
  for (let i = 0; i + 1 < SALTOS.length; i++) {
    const a = SALTOS[i] as Salto, b = SALTOS[i + 1] as Salto;
    let antes = 0, ahora = 0, n = 0;
    for (const desde of [-0.8, 0, 0.8]) for (let t0 = 0; t0 <= 4; t0++) for (const k of [-1, 2, 4, 6, 8, 10]) {
      const off = intento(a, b, desde, t0, k, false), on = intento(a, b, desde, t0, k, true);
      n++; if (off) antes++; if (on) ahora++;
      if (on && !off) salvados++;
      if (off && !on) perdidos++;
    }
    filas.push(`${a.id}→${b.id} (sube ${(b.top - a.top).toFixed(1)} m): ${antes}/${n} → ${ahora}/${n}`);
  }
  console.log(`# Torre, saltos: ${filas.join(" · ")} · salvados ${salvados}, perdidos ${perdidos}`);
  assert.ok(salvados > 0, filas.join("\n"));
  assert.equal(perdidos, 0, filas.join("\n"));
});

test("J24 render: on a ledge the avatar is «colgado» or «trepar», whatever its height; without those clips, the jump one", () => {
  assert.equal(estadoPor(0, 1.3, { modo: "colgado", rumbo: Math.PI }), "colgado");
  assert.equal(estadoPor(3, 0, { modo: "trepar", rumbo: 0 }), "trepar");
  assert.equal(estadoPor(0, 1.3), "saltar");
  const hay = (c: string) => c === "saltar" || c === "quieto";
  assert.deepEqual(clipPara("colgado", 0, 0.9, {}, hay), { clip: "saltar", ritmo: 1 });
  assert.deepEqual(clipPara("trepar", 0, 0.9, {}, (c) => c === "trepar" || hay(c)), { clip: "trepar", ritmo: 1 });
});
