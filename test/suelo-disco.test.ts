// A world whose flat floor is a DISC (entorno `suelo: { forma: "disco", radio }`, metres). The file says it, the flat state carries it
// (`sueloForma`, `sueloRadio`), and BOTH the server's sim and the page's prediction stop holding up whoever goes past the radius: they
// fall, and under the world's void (−50 m unless it says another) they come back at the spawn point (`aparicion`). A world that never says
// it is untouched: an endless flat floor, `disco` 0, and the reference fingerprint (pinned in test/engine.test.ts) is the same.
// The world of the proof is the shape of Pablo's `mundo-local` (suelo «liso», `aparicion` { x: 0, z: 3, radio: 3 }) with a 70 m disc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { createSim, spawnAvatar, step, setDisco, setSolids, solidsFrom, onFloor, groundHeight, discoDelEstado, replayFingerprint, referenceRecording, REFERENCE, PISO_SIN_SUELO, SUELO_MINIMO_DISCO, CLAVE_ENTORNO } from "../packages/sim/src/index.ts";
import { Instance, SEGURO_CADA } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { encodeInput } from "../packages/net/src/index.ts";
import type { ClientPart } from "../packages/feature/src/index.ts";
import { crearSuelo } from "../features/suelo/server.ts";
import sueloClient from "../features/suelo/client.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import entornoClient from "../features/entorno/client.ts";
import { ESQUEMA, aFichero, leerDisco, porDefecto, validarEntorno } from "../features/entorno/esquema.ts";
import { DISCO_RADIO_MAX, DISCO_RADIO_MIN, SUELO_FORMAS, ZONA } from "../features/entorno/feature.ts";

/** The value of a validation that must pass (narrows the `Result` for the type checker). */
function valor(r: ReturnType<typeof validarEntorno>, que = ""): Record<string, unknown> {
  if (!r.ok) assert.fail(`${que} ${JSON.stringify(r.issues)}`);
  return r.value;
}

/** What `mundo-local/entorno/entorno.json` says about its ground and its arrival, plus the disc (the rest of that file is look, not floor). */
const MUNDO_LOCAL = { schema: ESQUEMA, suelo: { tipo: "liso", color: "#0a0d24", forma: "disco", radio: 70 }, aparicion: { x: 0, z: 3, radio: 3 } };

test("entorno.json: suelo.forma «disco» + suelo.radio are accepted and round-trip; a bad value names its path; the plain default is untouched", () => {
  assert.deepEqual([...SUELO_FORMAS], ["plano", "disco"]);
  const r = valor(validarEntorno(MUNDO_LOCAL));
  assert.deepEqual([r.sueloForma, r.sueloRadio, r.suelo], ["disco", 70, "liso"], "the tipo is still its own field");
  const f = aFichero(r).suelo as Record<string, unknown>;
  assert.deepEqual([f.tipo, f.forma, f.radio], ["liso", "disco", 70]);
  assert.deepEqual(valor(validarEntorno(aFichero(r))), r, "file → flat → file is lossless");
  assert.deepEqual(leerDisco(MUNDO_LOCAL), { ok: true, value: { forma: "disco", radio: 70 } });

  // worse values: the path is the file's own and the message says how to fix it
  for (const [suelo, path] of [
    [{ forma: "cuadrado", radio: 70 }, "entorno.suelo.forma"],
    [{ forma: "disco" }, "entorno.suelo.radio"],
    [{ forma: "disco", radio: "70" }, "entorno.suelo.radio"],
    [{ forma: "disco", radio: DISCO_RADIO_MIN - 1 }, "entorno.suelo.radio"],
    [{ forma: "disco", radio: DISCO_RADIO_MAX + 1 }, "entorno.suelo.radio"],
    [{ forma: "disco", radio: Infinity }, "entorno.suelo.radio"],
  ] as const) {
    const mal = validarEntorno({ schema: ESQUEMA, suelo });
    assert.ok(!mal.ok && mal.issues.some((i) => i.path === path && i.message.length > 20), `${JSON.stringify(suelo)} → ${path}: ${JSON.stringify(!mal.ok && mal.issues)}`);
  }
});

test("entorno.json: a world without the disc (no keys, or «plano», or a radio with no forma) behaves as today and its file does not grow", () => {
  assert.deepEqual([porDefecto().sueloForma, porDefecto().sueloRadio], ["plano", 0]);
  for (const suelo of [undefined, { tipo: "arena" }, { tipo: "arena", forma: "plano" }, { tipo: "arena", radio: 70 }]) {
    const r = valor(validarEntorno({ schema: ESQUEMA, ...(suelo ? { suelo } : {}) }), JSON.stringify(suelo));
    assert.deepEqual([r.sueloForma, r.sueloRadio], ["plano", 0], JSON.stringify(suelo));
    const f = (aFichero(r).suelo ?? {}) as Record<string, unknown>;
    assert.ok(!("forma" in f) && !("radio" in f), "the file written back has no disc keys");
  }
  assert.deepEqual(leerDisco({}), { ok: true, value: null });
  assert.deepEqual(leerDisco({ suelo: { tipo: "liso" } }), { ok: true, value: null });
  // a preset or a scene read over a disc world does not turn the disc off (the file over `base` only changes what it says)
  const sobre = valor(validarEntorno({ cielo: { tipo: "color" } }, valor(validarEntorno(MUNDO_LOCAL))));
  assert.deepEqual([sobre.sueloForma, sobre.sueloRadio], ["disco", 70]);
});

test("sim: discoDelEstado reads only the entorno zone; past the radius there is no flat floor (a body falls), inside it holds; solids still count; the fingerprint stands", () => {
  const zona = (v: Record<string, unknown>): [string, Record<string, unknown>][] => [["otra:cosa", { sueloForma: "disco", sueloRadio: 9 }], [CLAVE_ENTORNO, v]];
  assert.equal(discoDelEstado(zona({ sueloForma: "disco", sueloRadio: 70 })), 70);
  for (const v of [{ sueloForma: "plano", sueloRadio: 70 }, { sueloForma: "disco", sueloRadio: 0 }, { sueloRadio: 70 }, {}]) assert.equal(discoDelEstado(zona(v)), 0, JSON.stringify(v));
  assert.equal(discoDelEstado([]), 0, "a world without the entorno feature has its endless floor");

  const s = createSim(4, 1); setDisco(s, 70);
  assert.equal(s.disco, fx(70));
  assert.equal(groundHeight(fx(69.9), 0, s, 0), 0); assert.equal(groundHeight(0, fx(-69.9), s, 0), 0);
  assert.equal(groundHeight(fx(70.1), 0, s, 0), PISO_SIN_SUELO); assert.equal(groundHeight(fx(-50), fx(50), s, 0), PISO_SIN_SUELO, "the diagonal: 70.7 m from the origin");
  assert.equal(groundHeight(fx(49), fx(49), s, 0), 0, "69.3 m on the diagonal is inside");
  assert.equal(groundHeight(fx(1900), fx(1900), s, 0), PISO_SIN_SUELO, "the far corner of the world: the squares stay exact");
  assert.equal(groundHeight(fx(70.1), 0), 0, "the pure flat answer (no state) is as it always was");

  // a body walking out falls; one standing inside stays
  const quieto = new Int32Array(4), a = spawnAvatar(s, 0);
  s.tf.cols.x[a] = fx(69.5); s.tf.cols.z[a] = 0; s.tf.cols.y[a] = 0;
  for (let t = 0; t < 10; t++) { quieto[0] = a; step(s, quieto); }
  assert.equal(s.tf.cols.y[a], 0); assert.ok(onFloor(s, a));
  s.tf.cols.x[a] = fx(71); for (let t = 0; t < 30; t++) { quieto[0] = a; step(s, quieto); }
  assert.ok(s.tf.cols.y[a] < fx(-1), `outside the disc: it falls, got ${fxToFloat(s.tf.cols.y[a])}`); assert.ok(!onFloor(s, a));

  // a platform past the edge is still a floor
  const isla = createSim(4, 1); setDisco(isla, 70); setSolids(isla, solidsFrom([["p", { solido: true, bx0: 80, by0: 0, bz0: -6, bx1: 90, by1: 3, bz1: 6 }]]));
  const c = spawnAvatar(isla, 0); isla.tf.cols.x[c] = fx(85); isla.tf.cols.z[c] = 0; isla.tf.cols.y[c] = fx(3);
  for (let t = 0; t < 30; t++) { quieto[0] = c; step(isla, quieto); }
  assert.equal(isla.tf.cols.y[c], fx(3)); assert.ok(onFloor(isla, c));

  // no disc (0): identical to the sim of today, however far you go
  const sin = createSim(4, 1); setDisco(sin, 0); assert.equal(sin.disco, 0);
  const b = spawnAvatar(sin, 0); sin.tf.cols.x[b] = fx(1500); sin.tf.cols.z[b] = fx(-1500);
  for (let t = 0; t < 30; t++) { quieto[0] = b; step(sin, quieto); }
  assert.equal(sin.tf.cols.y[b], 0, "endless flat floor");

  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n)), 0x7e630965, "reference fingerprint (sim 3) unchanged: `disco` is 0 unless a world says otherwise");
});

function mundo(entorno: Record<string, unknown>, suelo: ConstructorParameters<typeof Instance>[0]["suelo"] = null) {
  const log: string[] = [];
  const inst = new Instance({ seed: 7, capacity: 8, k: 50, snapshotEvery: 2,
    features: [crearSuelo(suelo), crearEntorno(entorno)],
    log: (l) => log.push(l), puede: () => true, suelo, aparicion: { x: 0, z: 3, radio: 3 } });
  const t = inst.join(0);
  const parts: ClientPart[] = [sueloClient, entornoClient];
  const s = new ClientSession(t, { features: parts, view: { label() {}, bounce() {}, fundido() {} } });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { t.flush(); inst.tick(); t.flush(); } };
  return { inst, t, s, pump, log };
}
const pos = (inst: Instance, e: number) => ({ x: fxToFloat(inst.sim.tf.cols.x[e]), y: fxToFloat(inst.sim.tf.cols.y[e]), z: fxToFloat(inst.sim.tf.cols.z[e]) });

/** Put the person 1.5 m inside the edge (x = 68.5), push to +x for `empuje` ticks at a run, let go and wait `espera` ticks; returns the lowest height seen by the SERVER body and the page's prediction. */
function irAlBorde(w: ReturnType<typeof mundo>, empuje: number, espera: number) {
  w.pump(2);
  const e = w.s.entity; assert.ok(e >= 0);
  w.inst.sim.tf.cols.x[e] = fx(68.5); w.inst.sim.tf.cols.z[e] = fx(0); w.inst.sim.tf.cols.y[e] = 0;
  w.pump(SEGURO_CADA + 1);
  let seq = 0, bajoServidor = Infinity, bajoPagina = Infinity, cayo = false;
  const avanzar = (n: number, mx: number) => { for (let i = 0; i < n; i++) {
    w.t.send(encodeInput(++seq & 0xffff, mx, 0, 2), false); w.s.tick(mx / 127, 0, 2); w.pump(1);
    bajoServidor = Math.min(bajoServidor, pos(w.inst, e).y); bajoPagina = Math.min(bajoPagina, w.s.selfPosition(1).y);
    if (pos(w.inst, e).y < -1) cayo = true;
  } };
  avanzar(empuje, 127); avanzar(espera, 0);
  return { e, bajoServidor, bajoPagina, cayo };
}

test("instance + page (mundo-local shape, disc of 70 m): running past the edge is a real fall, server and prediction agree, and under −50 m the person is back at the spawn point", () => {
  const w = mundo(MUNDO_LOCAL); w.pump(2); w.s.tick(0, 0, 0); // the page follows the shared state on its next tick
  const zona = w.s.features.stateOf("entorno").get(ZONA);
  assert.deepEqual([zona?.sueloForma, zona?.sueloRadio], ["disco", 70], "the page has the world's state");
  assert.equal(w.inst.sim.disco, fx(70), "the server's sim has the disc"); assert.equal((w.s as unknown as { local: { disco: number } }).local.disco, fx(70), "so has the page's prediction");
  const { e, bajoServidor, bajoPagina, cayo } = irAlBorde(w, 14, 200); // 14 ticks at a run ≈ 2.8 m: over the edge (1.5 m), then 10 s
  assert.ok(cayo && bajoServidor < SUELO_MINIMO_DISCO + 5, `the server body fell to the void, lowest ${bajoServidor}`);
  assert.ok(bajoServidor > SUELO_MINIMO_DISCO - 30, `and was caught near it (checked twice a second), lowest ${bajoServidor}`);
  assert.ok(bajoPagina < -1, `the page predicts the fall too, lowest ${bajoPagina}`);
  assert.deepEqual(pos(w.inst, e), { x: 0, y: 0, z: 3 }, "back at the centre of `aparicion`, standing");
  assert.ok(onFloor(w.inst.sim, e));
  assert.ok(w.log.some((l) => l.includes("[suelo] tick") && l.includes("orden(es)")), "the return went through the step (recorded)");
  assert.ok(w.s.features.log.some((l) => l.feature === "suelo" && l.event === "vuelta" && l.msg.motivo === "caida"));
});

test("instance: inside the disc nobody is moved; the world's own `sueloMinimo` and `vuelta` win over the −50 m and the spawn point", () => {
  const dentro = mundo(MUNDO_LOCAL); dentro.pump(2);
  const e = dentro.s.entity; dentro.inst.sim.tf.cols.x[e] = fx(60); dentro.inst.sim.tf.cols.z[e] = fx(20); // 63.2 m from the origin
  dentro.pump(60); assert.deepEqual(pos(dentro.inst, e), { x: 60, y: 0, z: 20 }); assert.ok(!dentro.log.some((l) => l.includes("[suelo] tick")));

  const w = mundo(MUNDO_LOCAL, { minimo: -20, vuelta: { x: 5, y: 0, z: -5, siempre: true } });
  const { e: e2, bajoServidor } = irAlBorde(w, 14, 200);
  assert.ok(bajoServidor < -19 && bajoServidor > -40, `fell to its own minimum (−20), lowest ${bajoServidor}`);
  assert.deepEqual(pos(w.inst, e2), { x: 5, y: 0, z: -5 });
});

test("instance + page: the same world WITHOUT the disc has the endless floor — running past 70 m (and 1 km away) keeps you at y = 0 and nobody is moved", () => {
  const { suelo: _s, ...sinSuelo } = MUNDO_LOCAL; void _s;
  const w = mundo({ ...sinSuelo, suelo: { tipo: "liso", color: "#0a0d24" } });
  assert.equal(w.inst.sim.disco, 0);
  const { e, bajoServidor, bajoPagina } = irAlBorde(w, 14, 60);
  assert.ok(bajoServidor >= 0 && bajoPagina >= 0, `never under the flat floor: server ${bajoServidor}, page ${bajoPagina}`);
  assert.ok(pos(w.inst, e).x > 70, "it walked past 70 m");
  assert.ok(!w.log.some((l) => l.includes("[suelo] tick")));
  w.inst.sim.tf.cols.x[e] = fx(1000); w.pump(40); assert.equal(pos(w.inst, e).y, 0);
});
