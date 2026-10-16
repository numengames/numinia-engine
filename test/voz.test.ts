// U10: voice frames go only to who is near (area of interest + 30 m), are rate-capped, and µ-law round-trips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { setBody } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { VOZ_MULAW, VOZ_TRAMAS_S, aMulaw, deMulaw, codificarVozSubida, leerVozSubida } from "../packages/net/src/index.ts";

function mundo(n: number, opts: { sinVoz?: boolean | (() => boolean) } = {}) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, log: () => {}, sinVoz: opts.sinVoz });
  const pages = Array.from({ length: n }, (_, i) => { const t = inst.join(i); const s = new ClientSession(t); const oido: number[] = []; s.onVoice = (v) => oido.push(v.entidad); return { t, s, oido }; });
  const pump = (k = 2) => { for (let i = 0; i < k; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  return { inst, pages, pump };
}

test("U10 voz: µ-law keeps a voice sample within 2 %", () => {
  for (const s of [0, 100, -100, 1000, -5000, 20000, -32000]) assert.ok(Math.abs(deMulaw(aMulaw(s)) - s) <= Math.max(16, Math.abs(s) * 0.03), String(s));
  assert.equal(codificarVozSubida(VOZ_MULAW, 1, new Uint8Array(0)), null);
  assert.equal(leerVozSubida(new Uint8Array([11, 9, 0, 1, 5])), null); // unknown codec
});

test("U10 voz: who is within 30 m hears you, who is 50 m away does not, you never hear yourself", () => {
  const { inst, pages, pump } = mundo(3);
  const [a, b, c] = pages;
  setBody(inst.sim, a.s.entity, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setBody(inst.sim, b.s.entity, { x: fx(10), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setBody(inst.sim, c.s.entity, { x: fx(50), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  pump(4); // snapshots: everyone's area of interest is up to date
  assert.ok(a.s.sendVoice(VOZ_MULAW, new Uint8Array(320).fill(0x55)));
  pump();
  assert.deepEqual(b.oido, [a.s.entity]);
  assert.deepEqual(c.oido, []);
  assert.deepEqual(a.oido, []);
});

test("U10 voz: more than the cap per second is dropped; a server without voice relays nothing", () => {
  const { inst, pages, pump } = mundo(2);
  const [a, b] = pages;
  setBody(inst.sim, a.s.entity, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setBody(inst.sim, b.s.entity, { x: fx(3), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  pump(4);
  for (let i = 0; i < VOZ_TRAMAS_S + 20; i++) a.s.sendVoice(VOZ_MULAW, new Uint8Array(10));
  pump(1);
  assert.equal(b.oido.length, VOZ_TRAMAS_S);
  assert.equal(inst.vozStats.descartadas, 20);
  const m = mundo(2, { sinVoz: true });
  setBody(m.inst.sim, m.pages[1].s.entity, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setBody(m.inst.sim, m.pages[0].s.entity, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  m.pump(4); m.pages[0].s.sendVoice(VOZ_MULAW, new Uint8Array(10)); m.pump();
  assert.equal(m.pages[1].oido.length, 0);
});

test("U10 voz: the world's setting is asked at every frame (/voz acts at once, no restart)", () => {
  let sin = true;
  const m = mundo(2, { sinVoz: () => sin });
  for (const p of m.pages) setBody(m.inst.sim, p.s.entity, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  m.pump(4); m.pages[0].s.sendVoice(VOZ_MULAW, new Uint8Array(10)); m.pump();
  assert.equal(m.pages[1].oido.length, 0);
  sin = false;
  m.pages[0].s.sendVoice(VOZ_MULAW, new Uint8Array(10)); m.pump();
  assert.deepEqual(m.pages[1].oido, [m.pages[0].s.entity]);
});
