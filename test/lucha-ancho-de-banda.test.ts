// lucha MIS-233 (t_d50bb88f): what do 10 creatures that WALK cost one page, per tick? The creature's position, box and mode
// are rewritten whole with `state.set` every MOVER_CADA_TICKS ticks (server.ts `caminar`); this counts the real bytes a page
// receives (wire frames, as the server sends them) while 10 Guardians chase one person who keeps moving, and compares with
// the same arena standing still and with the snapshot stream every page gets anyway. The figures go to limits.json
// (lucha_bytes_tick_10_criaturas_*); the test fails if they grow past the published budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { MSG } from "../packages/net/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearLucha } from "../features/lucha/server.ts";
import type { Criatura } from "../features/lucha/server.ts";
import { crearCliente } from "../features/lucha/client.ts";
import { MOVER_CADA_TICKS } from "../features/lucha/persecucion.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x: string) => { t = x; } }; };
const N = 10, TICKS = 400;                                   // 20 s of fight at 20 Hz
/** Presupuesto publicado (limits.json lucha_bytes_tick_10_criaturas_*): bytes por tick que recibe UNA página. */
export const PRESUPUESTO_ESTADO_B_TICK = 150, PRESUPUESTO_TOTAL_B_TICK = 250;

/** 10 Guardians in a ring 8–14 m from the origin (all inside the 64 m state radius of the page and inside their sight). */
const anillo = (): Criatura[] => Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2, r = 9 + (i % 3) * 2;
  return { id: `g${i}`, especie: "guardian-crisalida", x: Math.round(Math.cos(a) * r * 10) / 10, z: Math.round(Math.sin(a) * r * 10) / 10, y: 0 };
});

/** Bytes a page receives per tick, by kind, while `mover(tick, place)` drives the person. */
function medir(criaturas: Criatura[], mover: (t: number, place: (x: number, z: number) => void) => void, ticks = TICKS) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas, semilla: 7 })], log: () => {}, identitySign: sign });
  const t = inst.join(0), cli = crearCliente(() => {});
  const por = { snapshot: 0, funcion: 0, estado: 0, otros: 0 }, mensajes = { estado: 0, funcion: 0 };
  const orig = t.onMessage.bind(t);
  t.onMessage = (cb) => orig((b) => {
    if (b[0] === MSG.SNAPSHOT) por.snapshot += b.length;
    else if (b[0] === MSG.STATE) { por.estado += b.length; mensajes.estado++; }
    else if (b[0] === MSG.FEATURE) { por.funcion += b.length; mensajes.funcion++; }
    else por.otros += b.length;
    cb(b);
  });
  const s = new ClientSession(t, { features: [cli.part], identity: keeper(), view: { place: () => {}, tag: () => {}, label: () => {}, bounce: () => {} } });
  const place = (x: number, z: number) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); };
  const pump = () => { t.flush(); inst.tick(); t.flush(); };
  for (let i = 0; i < 12; i++) pump();                        // the join (catalog + the whole state) is not the fight
  place(200, 200);                                           // far from every creature while the join settles
  for (let i = 0; i < 12; i++) pump();
  for (const k of Object.keys(por) as (keyof typeof por)[]) por[k] = 0;
  mensajes.estado = 0; mensajes.funcion = 0;
  for (let i = 0; i < ticks; i++) { mover(i, place); pump(); }
  const bt = (n: number) => Math.round((n / ticks) * 10) / 10;
  return { estado: bt(por.estado), funcion: bt(por.funcion), snapshot: bt(por.snapshot), total: bt(por.estado + por.funcion + por.snapshot + por.otros), mensajesEstado: mensajes.estado, mensajesFuncion: mensajes.funcion, ticks };
}

test(`lucha: ${N} creatures walking after a person cost one page this many bytes per tick (limits.json lucha_bytes_tick_10_criaturas_*)`, () => {
  // the person runs a circle of 6 m: the ring never catches them and never stops chasing
  const corre = (i: number, place: (x: number, z: number) => void) => { const a = i * 0.05; place(Math.cos(a) * 6, Math.sin(a) * 6); };
  const andando = medir(anillo(), corre);
  const quieta = medir(anillo(), (_i, place) => place(200, 200));   // nobody near: nothing moves
  console.log(`[lucha] ${N} criaturas persiguiendo (${TICKS} ticks): estado ${andando.estado} B/tick en ${andando.mensajesEstado} mensajes, funcion ${andando.funcion} B/tick (${andando.mensajesFuncion} msg), snapshot ${andando.snapshot} B/tick, total ${andando.total} B/tick = ${(andando.total * 20 * 8 / 1000).toFixed(1)} kbit/s; quietas: total ${quieta.total} B/tick`);
  assert.ok(andando.mensajesEstado >= N * 20, `the creatures moved (${andando.mensajesEstado} state messages)`);
  assert.equal(quieta.mensajesEstado, 0, "standing creatures cost no state at all");
  assert.ok(andando.estado <= PRESUPUESTO_ESTADO_B_TICK, `state: ${andando.estado} B/tick over the published ${PRESUPUESTO_ESTADO_B_TICK}`);
  assert.ok(andando.total <= PRESUPUESTO_TOTAL_B_TICK, `total: ${andando.total} B/tick over the published ${PRESUPUESTO_TOTAL_B_TICK}`);
});

test("lucha: a creature only sends its state when it moved or changed mode (one message per step, not per tick)", () => {
  const corre = (i: number, place: (x: number, z: number) => void) => { const a = i * 0.05; place(Math.cos(a) * 6, Math.sin(a) * 6); };
  const r = medir(anillo(), corre, 200);
  const pasos = Math.floor(200 / MOVER_CADA_TICKS);
  assert.ok(r.mensajesEstado <= N * pasos, `at most one state message per creature per step: ${r.mensajesEstado} <= ${N * pasos}`);
});
