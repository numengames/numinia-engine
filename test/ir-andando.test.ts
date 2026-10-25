// MIS-257 (t_fb535386): the map's «Ir» walks the avatar to a point. The decision (packages/client/src/ir-andando.ts) is
// checked alone, then driven through the REAL simulation exactly as the page drives it (the axes become the stick):
// it arrives on open ground, it is stopped by a wall (no teleport, a clear «no direct way»), and a hand on the controls cancels it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FX_ONE } from "../packages/core/src/index.ts";
import { buildBvh } from "../packages/sim/src/bvh.ts";
import { createSim, spawnAvatar, step, setMesh, getBody, setBody, PISO_SIN_SUELO, BTN_RUN, STICK_MAX } from "../packages/sim/src/index.ts";
import { crearIrAndando, puedeIr, rumbo, frase, LLEGADA_M, ATASCO_MS, MAX_M, CORRER_DESDE_M } from "../packages/client/src/ir-andando.ts";
import type { Fin } from "../packages/client/src/ir-andando.ts";

const U = 64, TICK_MS = 50; // U: the mesh's 1/64 m units; the body is in FX_ONE units
const suelo = (s = 200): number[] => [-s * U, 0, -s * U, s * U, 0, s * U, s * U, 0, -s * U, -s * U, 0, -s * U, -s * U, 0, s * U, s * U, 0, s * U];
const muro = (x: number): number[] => [x * U, 0, -50 * U, x * U, 4 * U, 50 * U, x * U, 0, 50 * U, x * U, 0, -50 * U, x * U, 4 * U, -50 * U, x * U, 4 * U, 50 * U];

/** The page's loop: every tick ask for the axes, hand them to the sim as the stick; `manoEn` = the tick a hand touches the controls. */
function viaje(destino: { x: number; z: number }, o: { muro?: number; manoEn?: number; desde?: { x: number; z: number }; max?: number } = {}) {
  const tris = o.muro === undefined ? suelo() : [...suelo(), ...muro(o.muro)];
  const s = createSim(1, 0); setMesh(s, buildBvh(new Int32Array(tris)), PISO_SIN_SUELO);
  const e = spawnAvatar(s, 0);
  let t = 0; const fines: Fin[] = [];
  const ir = crearIrAndando({ ahora: () => t * TICK_MS, alTerminar: (f) => fines.push(f) });
  const desde = o.desde ?? { x: 0, z: 0 };
  setBody(s, e, { x: Math.round(desde.x * FX_ONE), y: 0, z: Math.round(desde.z * FX_ONE), vy: 0, air: 0, buf: 0 });
  const r = ir.empezar({ ...destino, nombre: "la fuente" }, desde);
  let corrio = false;
  for (; t < (o.max ?? 4000); t++) {
    const b = getBody(s, e), pos = { x: b.x / FX_ONE, z: b.z / FX_ONE };
    const ej = ir.ejes(pos, o.manoEn !== undefined && t >= o.manoEn);
    if (!ej) break;
    if (ej.correr) corrio = true;
    step(s, new Int32Array([e, Math.round(ej.x * STICK_MAX), Math.round(ej.z * STICK_MAX), ej.correr ? BTN_RUN : 0]));
  }
  const b = getBody(s, e);
  return { r, fines, pos: { x: b.x / FX_ONE, z: b.z / FX_ONE }, ticks: t, corrio, ir };
}

test("rumbo and puedeIr: unit direction, already there, too far, not a number", () => {
  const r = rumbo({ x: 0, z: 0 }, { x: 3, z: 4 });
  assert.deepEqual([r.x, r.z, r.d], [0.6, 0.8, 5]);
  assert.deepEqual(rumbo({ x: 1, z: 1 }, { x: 1, z: 1 }), { x: 0, z: 0, d: 0 });
  assert.deepEqual(puedeIr({ x: 0, z: 0 }, { x: 10, z: 0 }), { ok: true });
  assert.deepEqual(puedeIr({ x: 0, z: 0 }, { x: LLEGADA_M - 0.1, z: 0 }), { ok: false, motivo: "ya-estas" });
  assert.deepEqual(puedeIr({ x: 0, z: 0 }, { x: MAX_M + 1, z: 0 }), { ok: false, motivo: "lejos" });
  assert.deepEqual(puedeIr({ x: 0, z: 0 }, { x: NaN, z: 0 }), { ok: false, motivo: "invalido" });
});

test("on open ground the avatar WALKS to the point (it does not appear there) and arrives once", () => {
  const v = viaje({ x: 9, z: -6 });
  assert.equal(v.r.ok, true);
  assert.equal(v.fines.length, 1); assert.equal(v.fines[0].motivo, "llegada");
  assert.ok(Math.hypot(v.pos.x - 9, v.pos.z + 6) <= LLEGADA_M + 0.2, `ended at ${JSON.stringify(v.pos)}`);
  assert.ok(v.ticks > 20, "it took real ticks: walking, not a jump");
  assert.equal(v.corrio, false, "a short trip is walked");
  assert.equal(v.ir.activo(), false);
});

test("a long trip runs and then walks the last stretch; it still arrives", () => {
  const v = viaje({ x: 90, z: 0 });
  assert.equal(v.fines[0]?.motivo, "llegada");
  assert.equal(v.corrio, true, `farther than ${CORRER_DESDE_M} m it runs`);
  assert.ok(v.pos.x > 88);
});

test("a wall in the straight line stops it: no teleport, and the reason is «atasco»", () => {
  const v = viaje({ x: 30, z: 0 }, { muro: 10 });
  assert.equal(v.fines.length, 1); assert.equal(v.fines[0].motivo, "atasco");
  assert.ok(v.pos.x < 10.5, `it stood at the wall, not past it: x=${v.pos.x}`);
  assert.ok(v.ticks * TICK_MS >= ATASCO_MS, "it tried for a while before giving up");
  assert.match(frase("atasco", "la fuente"), /No hay camino directo a la fuente/);
});

test("a hand on the controls cancels it at once (key, stick, pad, jump all count as «mano»)", () => {
  const v = viaje({ x: 40, z: 0 }, { manoEn: 30 });
  assert.equal(v.fines.length, 1); assert.equal(v.fines[0].motivo, "mando");
  assert.equal(v.ticks, 30);
  assert.ok(v.pos.x > 0 && v.pos.x < 20, "it had started walking and stopped where it was");
});

test("state machine: nothing running gives null; starting again replaces; cancelling says «cancelado» once; too far/there refuse", () => {
  let t = 0; const fines: Fin[] = [];
  const ir = crearIrAndando({ ahora: () => t, alTerminar: (f) => fines.push(f) });
  assert.equal(ir.ejes({ x: 0, z: 0 }, false), null);
  assert.equal(ir.empezar({ x: 0.5, z: 0, nombre: "aquí" }, { x: 0, z: 0 }).ok, false);
  assert.equal(ir.empezar({ x: 0, z: 9999, nombre: "lejos" }, { x: 0, z: 0 }).ok, false);
  assert.equal(ir.activo(), false);
  ir.empezar({ x: 20, z: 0, nombre: "a" }, { x: 0, z: 0 }); ir.empezar({ x: 0, z: 20, nombre: "b" }, { x: 0, z: 0 });
  assert.equal(ir.destino()?.nombre, "b");
  assert.deepEqual(ir.ejes({ x: 0, z: 0 }, false), { x: 0, z: 1, correr: false });
  ir.cancelar(); ir.cancelar();
  assert.equal(fines.length, 1); assert.equal(fines[0].motivo, "cancelado");
  assert.equal(frase("lejos", "X"), `X queda demasiado lejos para ir andando (más de ${MAX_M} m).`);
});

test("the page wiring: the map's «Ir» exists, the stick is fed by it, the stick/keys stop it, «Ir de golpe» is the teleport", () => {
  const mapa = readFileSync(new URL("../apps/plaza/mapa.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("../apps/plaza/main.ts", import.meta.url), "utf8");
  assert.match(mapa, /boton\("Ir", `Ir andando a \$\{e\.nombre\}`\)/);
  assert.match(mapa, /"Ir de golpe"/);
  assert.match(main, /e = yo \? andar\.ejes\(yo, manoEnMandos\(\)\) : null/);
  assert.match(main, /if \(andarCorrer\) b \|= BTN_RUN/);
  assert.match(main, /keys\.has\("Space"\) \|\| saltoPendiente \|\| touch !== null/);
});
