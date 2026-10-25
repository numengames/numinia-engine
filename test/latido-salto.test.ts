// t_9cb3f636: (1) the page's heartbeat lets the server drop a dead connection in under two seconds; (2) the snapshot marks an avatar
// that was put somewhere on purpose, so another page draws it there at once instead of sliding it across the world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance, SALTO_TICKS } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { MSG, SILENCIO_MS, SILENCIO_OCULTA_MS, LATIDO_MS, decodeLatido, decodeSnapshot, encodeLatido, encodeSnapshot, loopbackPair } from "../packages/net/src/index.ts";
import { TICK_HZ, createSim, spawnAvatar } from "../packages/sim/src/index.ts";
import { WebSocket } from "ws";
import { CIERRE_SILENCIO, startServer } from "../packages/server/src/server.ts";

test("wire: LATIDO is two bytes, hidden or not; anything else is not a heartbeat", () => {
  assert.deepEqual([...encodeLatido()], [MSG.LATIDO, 0]);
  assert.deepEqual([...encodeLatido(true)], [MSG.LATIDO, 1]);
  assert.deepEqual(decodeLatido(encodeLatido(true)), { oculta: true });
  assert.deepEqual(decodeLatido(encodeLatido()), { oculta: false });
  assert.equal(decodeLatido(new Uint8Array([MSG.LATIDO])), null);
  assert.equal(decodeLatido(new Uint8Array([MSG.PING, 0])), null);
  assert.ok(LATIDO_MS * 3 < SILENCIO_MS && SILENCIO_MS < 2000, "three beats can be lost, and the drop is noticed in under 2 s");
});

/** A server with a clock we move by hand, and n pages already joined. `oir(x)` = what x sent reaches the server. */
function mundo(n: number) {
  const reloj = { ms: 1000 };
  const log: string[] = [];
  const inst = new Instance({ seed: 3, capacity: 8, k: 8, snapshotEvery: 2, reloj: () => reloj.ms, log: (l) => log.push(l) });
  const gente = Array.from({ length: n }, () => {
    const [s, c] = loopbackPair(); inst.connect(s); const p = new ClientSession(c); c.flush();
    return { p, e: p.entity, oir: () => s.flush() };
  });
  return { inst, reloj, gente, log };
}

/** Let `ms` pass the way the server lives it: a sweep every 250 ms. Returns who was dropped meanwhile. */
function pasa(w: { inst: Instance; reloj: { ms: number } }, ms: number): number[] {
  const idos: number[] = [];
  for (let t = 0; t < ms; t += 250) { w.reloj.ms += Math.min(250, ms - t); idos.push(...w.inst.expirarSilencio()); }
  return idos;
}

test("heartbeat: a page that beats and goes quiet is dropped after SILENCIO_MS (its avatar leaves); beating keeps it; one that never beat is never judged", () => {
  const { inst, reloj, gente, log } = mundo(3);
  const [a, b, c] = gente;
  a.p.latido(false); b.p.latido(false); a.oir(); b.oir(); // c is an AI / a bot / an older page: it never sends one
  assert.equal(inst.conns.length, 3);
  reloj.ms += SILENCIO_MS - 100; assert.deepEqual(inst.expirarSilencio(), [], "1.4 s of silence: not yet");
  b.p.latido(false); b.oir(); // b beats, a does not
  reloj.ms += 250; assert.deepEqual(inst.expirarSilencio(), [a.e], "only the silent one");
  assert.deepEqual(inst.conns.map((x) => x.entity).sort(), [b.e, c.e].sort());
  assert.ok(log.some((l) => /sin latido/.test(l)));
  for (let i = 0; i < 40; i++) { reloj.ms += LATIDO_MS; b.p.latido(false); b.oir(); assert.deepEqual(inst.expirarSilencio(), []); }
  assert.equal(inst.conns.length, 2, "b keeps beating, c never beat: both stay however long it takes");
  inst.tick();
  assert.equal(inst.sim.world.alive[a.e], 0, "the dropped avatar is gone from the world");
});

test("heartbeat: any message is a sign of life, and a page in a background tab gets the long limit until it says it is back", () => {
  const W = mundo(2), { inst } = W;
  const [a, b] = W.gente;
  a.p.latido(false); b.p.latido(true); a.oir(); b.oir();
  pasa(W, SILENCIO_MS - 300);
  a.p.tick(0, 0); a.p.ping(); a.oir(); // an input and a ping arrive: a is alive without a heartbeat
  assert.deepEqual(pasa(W, 500), [], "a spoke 500 ms ago; b is hidden and waits much longer");
  for (let t = 0; t < 100; t++) { a.p.latido(false); a.oir(); assert.deepEqual(pasa(W, 400), [], `b hidden, ${(t + 1) * 0.4} s in`); } // 40 s: a beats all along
  b.p.latido(false); b.oir(); // b is shown again: the short limit applies
  assert.deepEqual(pasa(W, SILENCIO_MS + 500).sort(), [a.e, b.e].sort());
  assert.equal(inst.conns.length, 0);
  const H = mundo(1); H.gente[0].p.latido(true); H.gente[0].oir(); // a hidden tab that really died is dropped at the long limit
  assert.deepEqual(pasa(H, SILENCIO_OCULTA_MS - 1000), []);
  assert.deepEqual(pasa(H, 1500), [H.gente[0].e]);
});

test("heartbeat: if the server itself stalled, nobody is judged for the silence that was ours", () => {
  const W = mundo(2);
  const [a, b] = W.gente;
  a.p.latido(false); b.p.latido(false); a.oir(); b.oir();
  pasa(W, 250); // sweeps run normally
  W.reloj.ms += 5000; // …then the event loop is blocked for 5 s: the beats are waiting to be read
  assert.deepEqual(W.inst.expirarSilencio(), [], "the late sweep forgives");
  assert.deepEqual(pasa(W, SILENCIO_MS - 300), [], "and gives them a window to be heard");
  assert.equal(pasa(W, 1000).length, 2, "silence after that is theirs");
});

test("heartbeat: a client that has not joined sends nothing; the server drops a malformed one without a fuss", () => {
  const { inst, reloj, gente } = mundo(1);
  const [s, c] = loopbackPair(); const ses = new ClientSession(c); ses.latido(true); assert.equal(s.inbox.length, 0, "no entity yet: nothing sent");
  gente[0].p.latido(false); gente[0].oir();
  const [s2, c2] = loopbackPair(); inst.connect(s2); c2.send(new Uint8Array([MSG.LATIDO, 1, 1]), true); assert.doesNotThrow(() => s2.flush());
  reloj.ms += 10 * SILENCIO_MS; inst.expirarSilencio();
  assert.equal(inst.conns.length, 1, "the junk sender never counted as beating; the real one was swept");
});

test("snapshot: no tail when nobody jumped (same size as before); marks round-trip; a lying count is clipped; an old snapshot has none", () => {
  const s = createSim(8, 1); const e0 = spawnAvatar(s, 0), e1 = spawnAvatar(s, 1), e2 = spawnAvatar(s, 2);
  const base = encodeSnapshot(s, e0, 0, [e1, e2]);
  assert.equal(base.length, 30 + 2 * 6, "30-byte header + 6 bytes per avatar on the ground");
  assert.deepEqual(decodeSnapshot(base)!.saltos, []);
  assert.equal(encodeSnapshot(s, e0, 0, [e1, e2], undefined, []).length, base.length, "an empty list adds nothing");
  const con = encodeSnapshot(s, e0, 0, [e1, e2], undefined, [{ id: e1, tick: 70_001 }, { id: e2, tick: 5 }]);
  assert.equal(con.length, base.length + 1 + 2 * 4);
  const d = decodeSnapshot(con)!;
  assert.deepEqual(d.saltos, [{ id: e1, tick: 70_001 & 0xffff }, { id: e2, tick: 5 }]);
  assert.equal(d.others.length, 2, "the avatars are read as always");
  const miente = con.slice(); miente[30 + 2 * 6] = 200; // says 200 marks, carries 2
  assert.equal(decodeSnapshot(miente)!.saltos.length, 2);
  assert.doesNotThrow(() => decodeSnapshot(con.slice(0, 30 + 2 * 6 + 3)));
});

/** Two pages next to each other; A walks and is then put 40 m away. Returns every x at which B drew A, one per server tick. */
function veDeLejos(conMarca: boolean) {
  const inst = new Instance({ seed: 6, capacity: 4, k: 4, snapshotEvery: 2 });
  if (!conMarca) (inst as unknown as { marcarSalto: () => void }).marcarSalto = () => {};
  const [sa, ca] = loopbackPair(), [sb, cb] = loopbackPair();
  inst.connect(sa); inst.connect(sb);
  const a = new ClientSession(ca), b = new ClientSession(cb);
  ca.flush(); cb.flush();
  inst.sim.tf.cols.x[b.entity] = inst.sim.tf.cols.x[a.entity] + fx(3);
  inst.sim.tf.cols.z[b.entity] = inst.sim.tf.cols.z[a.entity];
  const dibujada = () => b.remotePositions(((inst.sim.tick - b.serverTickNow(0)) * 1000) / TICK_HZ).find((p) => p.id === a.entity)!;
  const tickea = () => { a.tick(0, -127, 0); b.tick(0, 0); inst.tick(); ca.flush(); cb.flush(); };
  for (let t = 0; t < 14; t++) tickea();
  const x0 = dibujada().x, z0 = dibujada().z;
  const destino = { x: x0 + 40, y: 0, z: z0 };
  assert.ok(inst.teletransportar(a.entity, destino, { radios: [0] }), "A was put 40 m away");
  const vistas: number[] = [];
  for (let t = 0; t < 14; t++) { tickea(); vistas.push(dibujada().x); }
  return { vistas, x0, destino: destino.x };
}

test("teleport: the other page draws the avatar at its new place at once; it never slides across the 40 m in between", () => {
  const { vistas, destino } = veDeLejos(true);
  const enMedio = vistas.filter((x) => x > destino - 38 && x < destino - 0.5 && x > vistas[0] + 6);
  assert.equal(enMedio.length, 0, `no intermediate position (saw ${vistas.map((x) => x.toFixed(1)).join(", ")})`);
  assert.ok(Math.abs(vistas.at(-1)! - destino) < 3, "and it ends up there (it kept walking a little)");
});

test("teleport control: without the mark the same run DOES slide across (the test can tell)", () => {
  const { vistas, destino } = veDeLejos(false);
  const enMedio = vistas.filter((x) => x > destino - 38 && x < destino - 0.5 && x > vistas[0] + 6);
  assert.ok(enMedio.length > 0, `expected a slide, saw ${vistas.map((x) => x.toFixed(1)).join(", ")}`);
});

test("teleport: the mark rides in a few snapshots and then stops; the avatar itself is not told (its page reconciles); a second jump marks again", () => {
  const inst = new Instance({ seed: 7, capacity: 4, k: 4, snapshotEvery: 1 });
  const [sa, ca] = loopbackPair(), [sb, cb] = loopbackPair();
  inst.connect(sa); inst.connect(sb);
  const a = new ClientSession(ca), b = new ClientSession(cb);
  ca.flush(); cb.flush();
  /** The marks in each snapshot waiting for a page, per tick, then let the page read them. */
  const marcas = (c: typeof ca) => { const m = c.inbox.filter((x) => x[0] === MSG.SNAPSHOT).map((x) => decodeSnapshot(x)!.saltos); c.flush(); return m; };
  const tick = () => { inst.tick(); return [marcas(ca), marcas(cb)] as const; };
  tick();
  assert.ok(inst.teletransportar(a.entity, { x: 20, y: 0, z: 0 }, { radios: [0] }));
  const paraA: number[] = [], paraB: number[] = [], ticksB: number[] = [];
  for (let t = 0; t < SALTO_TICKS + 4; t++) { const [x, y] = tick(); paraA.push(...x.map((m) => m.length)); paraB.push(...y.map((m) => m.length)); ticksB.push(...y.flat().map((m) => m.tick)); }
  assert.ok(paraA.every((n) => n === 0), "A is not told about its own jump");
  assert.deepEqual(paraB.filter((n) => n > 0), new Array(SALTO_TICKS).fill(1), `B gets the mark in the next ${SALTO_TICKS} snapshots (they are unreliable)`);
  assert.deepEqual(paraB.slice(-3), [0, 0, 0], "and then it stops");
  assert.equal(new Set(ticksB).size, 1, "always the same (id, tick): the page tells a repeat from a new jump");
  const antes = ticksB[0];
  assert.ok(inst.teletransportar(a.entity, { x: -20, y: 0, z: 0 }, { radios: [0] }));
  const [, y] = tick();
  assert.notEqual(y[0][0].tick, antes, "a second jump is a new mark");
  void b;
});

// ---- over a real WebSocket ----
test("server (real WebSocket): a page that sent a heartbeat and then froze is closed with CIERRE_SILENCIO in under 2 s and the others stay; one that never beat is left alone", async () => {
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: { build: "dev", commit: "0".repeat(40), imagen: "" } });
  const abre = (url = `ws://127.0.0.1:${srv.port}/ws`) => new Promise<WebSocket>((ok, ko) => { const ws = new WebSocket(url); ws.on("open", () => ok(ws)); ws.on("error", ko); });
  const cierre = (ws: WebSocket) => new Promise<{ code: number; en: number }>((ok) => { const t0 = performance.now(); ws.on("close", (code) => ok({ code, en: performance.now() - t0 })); });
  const [congelado, vivo, mudo] = [await abre(), await abre(), await abre()];
  try {
    const cerrado = cierre(congelado); let cerroVivo = false; vivo.on("close", () => { cerroVivo = true; }); let cerroMudo = false; mudo.on("close", () => { cerroMudo = true; });
    congelado.send(encodeLatido()); vivo.send(encodeLatido());
    const latir = setInterval(() => vivo.send(encodeLatido()), LATIDO_MS);
    try {
      const c = await cerrado;
      assert.equal(c.code, CIERRE_SILENCIO);
      assert.ok(c.en < 2000, `noticed in ${Math.round(c.en)} ms`);
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(cerroVivo, false, "the page that keeps beating stays");
      assert.equal(cerroMudo, false, "the one that never beat is never judged");
      assert.equal(srv.metrics().conectados, 2);
    } finally { clearInterval(latir); }
  } finally { for (const ws of [congelado, vivo, mudo]) ws.close(); await srv.close(); }
});
