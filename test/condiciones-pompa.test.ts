// condiciones/c5: the others see who is still reading the norms. The server says it ONLY when it changes (LEYENDO, 4 bytes: someone arrives and
// has to read, accepts, or leaves; the whole list once to whoever connects), never per tick and never in the snapshot; a world whose gate is off
// sends not one byte more. Nothing pushes, freezes, seats or hits someone inside the bubble. The drawing (a shared sphere + the name plate) is
// checked in the browser leg (tools/e2e-piernas/condiciones-pompa.mjs); here, the wire, the state and the promises, headless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { fx } from "../packages/core/src/index.ts";
import { LEYENDO_POR_MENSAJE, MSG, WIRE_FORMAT, decodeLeyendo, encodeLeyendo } from "../packages/net/src/index.ts";
import type { Condiciones } from "../packages/server/src/condiciones.ts";
import { crearPuertaCondiciones } from "../packages/server/src/condiciones-puerta.ts";
import { crearLucha } from "../features/lucha/server.ts";
import { crearCliente } from "../features/lucha/client.ts";
import { createPompas, POMPAS_DIBUJADAS, POMPA_OPACIDAD } from "../packages/render/src/pompas.ts";
import * as THREE from "three/webgpu";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const punto = (id: string, obligatorio: boolean, tipo: "norma" | "datos" = "norma") => ({ id, titulo: id, texto: `texto ${id}`, obligatorio, tipo });
const SOLO_CASA: Condiciones = { formato: "condiciones@1", capas: [{ capa: "casa", version: "1", puntos: [punto("uso", true), punto("informe", false, "datos")] }] };
const TODO = { casa: "1" };

/** A headless world with the lucha server (PVP on), the gate on or off (or no gate object at all), n people with identities. */
function mundo(n: number, o: { activa?: boolean; sinPuerta?: boolean; guardados?: GuestKeeper[]; aforo?: number } = {}) {
  const activa = o.activa ?? true;
  const puerta = crearPuertaCondiciones({ condiciones: SOLO_CASA, activa, ahora: () => Date.parse("2026-10-20T12:00:00Z") });
  let semilla = 7; const random = () => { semilla = (Math.imul(semilla, 1103515245) + 12345) >>> 0; return (semilla >>> 8) % 32 / 32; }; // the same ids every run: bytes can be compared
  const inst = new Instance({
    seed: 1, capacity: Math.max(32, n + 24, o.aforo ?? 0), k: 50, snapshotEvery: 2, identitySign: sign, random,
    features: [crearLucha({ criaturas: [], semilla: 7, pvp: true }), ...(activa && !o.sinPuerta ? [puerta.part] : [])],
    ...(o.sinPuerta ? {} : { condiciones: puerta }),
  });
  const gente: ReturnType<typeof persona>[] = [];
  const persona = (i: number) => {
    const lucha_ev: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), c = crearCliente((event, msg) => lucha_ev.push({ event, msg }), () => 0);
    const s = new ClientSession(t, { features: [c.part], identity: o.guardados?.[i] ?? keeper(), view: { label() {}, bounce() {} } });
    const eventos: [number, boolean][] = [];
    s.onLeyendo = (e, si) => eventos.push([e, si]);
    return { t, s, lucha: c.lucha, lucha_ev, eventos };
  };
  for (let i = 0; i < n; i++) gente.push(persona(i));
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); } };
  const llega = (i = gente.length) => { const p = persona(i); gente.push(p); return p; };
  const aceptar = (p: { s: ClientSession }) => { assert.ok(p.s.aceptar(TODO, [])); pump(2); };
  return { inst, puerta, gente, pump, llega, aceptar };
}

test("wire: LEYENDO (15) is an additive type — a change is 4 bytes, the wire format number stays, garbage is refused without throwing", () => {
  assert.equal(MSG.LEYENDO, 15); assert.equal(WIRE_FORMAT, 2);
  const uno = encodeLeyendo([{ entidad: 258, leyendo: true }])!;
  assert.deepEqual([...uno], [15, 1, 2, 1]); assert.equal(uno.length, 4);
  assert.deepEqual(decodeLeyendo(uno), [{ entidad: 258, leyendo: true }]);
  assert.deepEqual(decodeLeyendo(encodeLeyendo([{ entidad: 5, leyendo: false }, { entidad: 65535, leyendo: true }])!), [{ entidad: 5, leyendo: false }, { entidad: 65535, leyendo: true }]);
  assert.equal(encodeLeyendo([]), null, "no change = nothing to send");
  assert.equal(decodeLeyendo(new Uint8Array([15])), null); assert.equal(decodeLeyendo(new Uint8Array([15, 0, 1])), null, "not a whole triple");
  assert.equal(decodeLeyendo(new Uint8Array([15, 0, 1, 2])), null, "a state other than 0/1"); assert.equal(decodeLeyendo(new Uint8Array([14, 0, 1, 1])), null);
  assert.equal(decodeLeyendo(new Uint8Array(1 + 3 * (LEYENDO_POR_MENSAJE + 1))), null, "over the cap");
  assert.ok(1 + 3 * LEYENDO_POR_MENSAJE < 1024, "a full frame fits WS_FRAME_MAX");
});

test("gate on: A is inside; B arrives and has to read → A sees B reading (4 bytes); B accepts → A sees it stop; B itself is told nothing", () => {
  const M = mundo(2); const [A, B] = M.gente;
  M.pump(3); M.aceptar(A);
  assert.equal(M.inst.puertaCerrada(A.s.entity), false);
  assert.deepEqual([...A.s.leyendo], [B.s.entity], "B is reading");
  assert.deepEqual(B.s.leyendo.size, 0, "B is not told about itself: its bubble is the panel of c3, not a sphere");
  assert.ok(B.eventos.every(([e]) => e === A.s.entity), "B only ever hears about A (A was reading too until it accepted)");
  const bytes = M.inst.puertaStats.leyendoBytes;
  M.aceptar(B);
  assert.deepEqual([...A.s.leyendo], []); assert.deepEqual(A.eventos.at(-1), [B.s.entity, false], "A is told it stopped");
  assert.equal(M.inst.leyendoNormas(B.s.entity), false);
  // the whole conversation was a handful of 4-byte messages, one to each other connection per change
  assert.equal(M.inst.puertaStats.leyendoBytes % 4, 0); assert.ok(M.inst.puertaStats.leyendoBytes >= bytes + 4);
});

test("gate on: B starts reading AFTER A is inside → exactly one 4-byte message to A; accepting → exactly one more; none per tick in between", () => {
  const M = mundo(1); const [A] = M.gente;
  M.pump(3); M.aceptar(A);
  assert.equal(M.inst.puertaStats.leyendoBytes, 0, "nobody else yet");
  const B = M.llega(); M.pump(3);
  assert.deepEqual([...A.s.leyendo], [B.s.entity]); assert.equal(M.inst.puertaStats.leyendoBytes, 4, "one change, one 4-byte message to the one other person");
  M.pump(400); // 20 s standing in the bubble
  assert.equal(M.inst.puertaStats.leyendoBytes, 4, "nothing per tick while they read");
  M.aceptar(B);
  assert.equal(M.inst.puertaStats.leyendoBytes, 8); assert.deepEqual([...A.s.leyendo], []);
  M.pump(100); assert.equal(M.inst.puertaStats.leyendoBytes, 8, "and nothing after");
});

test("gate on: someone who connects while others are reading gets the list once; one who leaves while reading is cleared for everybody", () => {
  const M = mundo(1); const [A] = M.gente;
  M.pump(3); M.aceptar(A);
  const B = M.llega(), C = M.llega(); M.pump(3);
  assert.deepEqual([...A.s.leyendo].sort(), [B.s.entity, C.s.entity].sort());
  const D = M.llega(); M.pump(3);
  assert.deepEqual([...D.s.leyendo].sort(), [B.s.entity, C.s.entity].sort(), "D, who has just come, is told who is inside a bubble now");
  const e = B.s.entity;
  M.inst.disconnect(e); M.gente.splice(M.gente.indexOf(B), 1); M.pump(3);
  assert.ok(!A.s.leyendo.has(e), "B left while reading: A's sphere over that entity goes (the number may be someone else's next)");
  assert.ok(!D.s.leyendo.has(e)); assert.ok(A.s.leyendo.has(C.s.entity));
});

test("gate on: a person who already accepted this version comes back — nobody sees a bubble, nothing is sent", () => {
  const guardado = keeper();
  const M = mundo(2, { guardados: [keeper(), guardado] }); const [A, B] = M.gente;
  M.pump(3); M.aceptar(A); M.aceptar(B);
  const primero = M.inst.puertaStats.leyendoBytes;
  M.inst.disconnect(B.s.entity); M.gente.splice(1, 1); M.pump(2);
  // B's second visit: same guest token (kept by the browser), same store: already accepted
  const B2 = (() => { const t = M.inst.join(1); const c = crearCliente(() => {}, () => 0); const s = new ClientSession(t, { features: [c.part], identity: guardado, view: { label() {}, bounce() {} } }); M.gente.push({ t, s, lucha: c.lucha, lucha_ev: [], eventos: [] }); return { s }; })();
  M.pump(4);
  assert.equal(M.inst.puertaCerrada(B2.s.entity), false, "accepted before: no gate");
  assert.equal(A.s.leyendo.size, 0); assert.equal(M.inst.puertaStats.leyendoBytes, primero, "not one byte for a returning person");
});

test("gate OFF: not one byte more than a build without the gate at all — same bytes, no LEYENDO, nothing to draw", () => {
  const recorrido = (o: { activa?: boolean; sinPuerta?: boolean }) => {
    const M = mundo(3, o); M.pump(3); const D = M.llega(); M.pump(10);
    M.gente[0].s.tick(127, 0); M.pump(20);
    M.inst.disconnect(D.s.entity); M.gente.pop(); M.pump(5);
    return { bytes: M.inst.sentBytes(), leyendo: M.inst.puertaStats.leyendoBytes, vistos: M.gente.map((g) => g.s.leyendo.size + g.eventos.length) };
  };
  const sin = recorrido({ sinPuerta: true }), apagada = recorrido({ activa: false });
  assert.equal(apagada.bytes, sin.bytes, "the gate object with the gate OFF changes no byte");
  assert.equal(apagada.leyendo, 0); assert.deepEqual(apagada.vistos, [0, 0, 0]);
  const encendida = recorrido({ activa: true });
  assert.ok(encendida.leyendo > 0, "…while with it on the readers are told");
});

test("cost: at 300 people arriving one by one, a change is 4 bytes per other person (+ the list once to the newcomer) and nothing per tick", () => {
  const N = 300, M = mundo(1, { aforo: 400 }); M.pump(2);
  for (let i = 1; i < N; i++) { M.llega(); M.pump(2); }
  // person i arrives when i others are connected and all of them are still reading: 4 bytes to each of the i others, and the list of i triples to the newcomer
  const cambios = 4 * (N * (N - 1)) / 2, listas = Array.from({ length: N - 1 }, (_, k) => 1 + 3 * (k + 1)).reduce((x, y) => x + y, 0);
  assert.equal(M.inst.puertaStats.leyendoBytes, cambios + listas);
  const antes = M.inst.puertaStats.leyendoBytes; M.pump(200);
  assert.equal(M.inst.puertaStats.leyendoBytes, antes, "300 people standing in bubbles for 10 s cost no LEYENDO byte");
  assert.equal(M.gente[N - 1].s.leyendo.size, N - 1, "the last to arrive got the whole list");
  assert.equal(M.gente[0].s.leyendo.size, N - 1, "and the first one saw each of the others arrive");
  for (const p of M.gente.slice(0, 10)) M.aceptar(p);
  assert.equal(M.inst.puertaStats.leyendoBytes, antes + 10 * 4 * (N - 1), "ten accept: 4 bytes to every other person each");
});

test("nobody pushes, freezes or seats someone inside the bubble; a blow on them is refused; after accepting all of it works again", () => {
  const M = mundo(2); const [A, B] = M.gente;
  M.pump(3); M.aceptar(A);
  for (const [i, p] of [A, B].entries()) { M.inst.sim.tf.cols.x[p.s.entity] = fx(1 + i); M.inst.sim.tf.cols.z[p.s.entity] = fx(1); }
  M.pump(15);
  assert.equal(M.inst.leyendoNormas(B.s.entity), true);
  assert.equal(M.inst.ordenar(B.s.entity, { empujar: { vx: 3, vy: 0, vz: 0 } }), false, "no push");
  assert.equal(M.inst.ordenar(B.s.entity, { quieto: 2 }), false, "no freeze");
  assert.equal(M.inst.ordenar(B.s.entity, { sentar: { x: 0, y: 0, z: 0 } }), false, "no seat");
  assert.equal(M.inst.puertaStats.empujes, 3);
  // the server's own moves (a spawn spot, a return to a safe place) are not «pushes»
  assert.equal(M.inst.ordenar(B.s.entity, { poner: { x: 2, y: 0, z: 1 } }), true);
  // PVP is on in this world, and still: «Esa persona está leyendo las normas»
  assert.deepEqual(A.lucha.golpear(`p:${B.s.entity}`), { ok: true }); M.pump(3);
  assert.deepEqual(B.lucha_ev.filter((e) => e.event === "estado"), [], "B reads no rung: the blow never landed");
  assert.ok(A.lucha_ev.some((e) => e.event === "rechazado" && String(e.msg.motivo).includes("leyendo las normas")), "A is told why");
  M.aceptar(B);
  assert.equal(M.inst.ordenar(B.s.entity, { empujar: { vx: 3, vy: 0, vz: 0 } }), true, "once inside, pushable like everybody");
  assert.equal(M.inst.ordenar(B.s.entity, { quieto: 1 }), true);
});

test("a person inside the bubble is not heard (c2 holds)", () => {
  const M = mundo(2); const [A, B] = M.gente;
  M.pump(3); M.aceptar(A);
  assert.equal(M.inst.puertaCerrada(B.s.entity), true);
  const oyentes: number[] = []; A.s.onVoice = (v) => oyentes.push(v.entidad);
  for (const [i, p] of [A, B].entries()) { M.inst.sim.tf.cols.x[p.s.entity] = fx(1 + i); M.inst.sim.tf.cols.z[p.s.entity] = fx(1); }
  M.pump(5); assert.ok(B.s.sendVoice(1, new Uint8Array(40).fill(7))); M.pump(3);
  assert.deepEqual(oyentes, [], "its microphone is not relayed to anyone");
});

test("render: one shared geometry and one shared material for any number of bubbles; a bubble that was never drawn just goes; accepting plays a short burst; a still bubble asks for no frames", () => {
  const world = new THREE.Group(), avatares = new Map<number, THREE.Object3D>();
  for (let i = 0; i < 40; i++) { const a = new THREE.Object3D(); a.position.set(i, 0.85, 0); avatares.set(i, a); }
  const P = createPompas({ world, avatarOf: (t) => avatares.get(t) });
  assert.deepEqual(P.compartidos(), { geometrias: 0, materiales: 0, mallas: 0 }, "a world with nobody reading makes nothing");
  assert.equal(P.busy(), false);
  for (let i = 0; i < 40; i++) P.poner(i, true, 0);
  assert.equal(P.busy(), true, "a new bubble asks for one frame");
  P.update(0);
  assert.equal(P.busy(), false, "…and a bubble that stands still asks for no more");
  const c = P.compartidos(); assert.deepEqual([c.geometrias, c.materiales, c.mallas], [1, 1, 40]);
  assert.equal(P.lista().filter((x) => x.drawn).length, POMPAS_DIBUJADAS, "at most POMPAS_DIBUJADAS drawn (draw calls on a phone)");
  const m0 = world.children[0] as THREE.Mesh, compartido = m0.material, geometria = m0.geometry;
  assert.ok(world.children.every((m) => (m as THREE.Mesh).geometry === geometria && (m as THREE.Mesh).material === compartido), "every bubble is the same geometry and the same material");
  assert.deepEqual([m0.position.x, m0.position.y, m0.position.z], [0, 0.9, 0], "centred on the capsule");
  P.poner(0, false, 1000);                                  // accepted: bursts
  assert.equal(P.estado(0), "estallando"); assert.equal(P.busy(), true);
  P.update(1170); const quedan = world.children.length;
  const mitad = (world.children.find((m) => (m as THREE.Mesh).material !== compartido) as THREE.Mesh | undefined);
  assert.ok(mitad && (mitad.material as THREE.MeshBasicMaterial).opacity < POMPA_OPACIDAD && mitad.scale.x > 1, "growing and fading on its own copy of the material");
  P.update(1400); assert.equal(P.estado(0), "no"); assert.equal(world.children.length, quedan - 1, "the burst is gone from the scene");
  assert.equal(P.busy(), false);
  // a bubble nobody ever saw (its avatar was out of sight) leaves without a burst
  avatares.delete(5); P.update(1500); P.poner(5, false, 1600); assert.equal(P.estado(5), "no");
});
