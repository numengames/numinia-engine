// agua/nadar (R-1) · swimming in the pond as a piece any world switches on with ONE datum (funciones.json `"nadar": true`). The SERVER's simulation
// decides (half the walking pace, no jump, floating); the page predicts with the same function and only draws (state `nadar`, clip `flotar`, a ring, a splash).
// Off — the default, no file, or no nature — the sim has no water zone and steps exactly as before (the reference fingerprint is also pinned by sim.test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import {
  createSim, spawnAvatar, step, setMesh, setAgua, getBody, setBody, stateHash, nivelDeAgua, nadando, STEP, RUN_STEP, VADEO, FLOTA, AGUA_STRIDE, BTN_JUMP, BTN_RUN, PISO_SIN_SUELO,
} from "../packages/sim/src/index.ts";
import { aguaDelEstado, CLAVE_NADAR, terrenoMalla } from "../packages/sim/src/terreno-malla.ts";
import { estanqueDe, NIVEL_AGUA } from "../packages/relieve/src/relieve.ts";
import { estadoPor, clipPara, nadaEn, ondaEn, ONDA, RADIO_NADO, VADEO_M } from "../packages/render/src/avatares-politica.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { leerMundo, escribirMundo } from "../packages/server/src/mundo.ts";
import { conMundo } from "../features/mundo.ts";
import partes from "../features/servidor.ts";
import { crearCliente } from "../features/funciones/client.ts";
import { ESQUEMA, leerFunciones } from "../features/funciones/esquema.ts";
import { FUNCIONES } from "../features/funciones/feature.ts";

const U = FX_ONE;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MUNDO = { semilla: 1234, tamano: 200, plaza: 12, estanque: true };
const NAT = { activa: true, ...MUNDO };
const CLAVE_NAT = "naturaleza:mundo";
const ON = [[CLAVE_NAT, NAT], [CLAVE_NADAR, { activa: true, fija: false }]] as [string, Record<string, unknown>][];
const T = terrenoMalla(MUNDO);
const E = estanqueDe(1234, 200);

/** A sim on the real terrain with the pond's water (or none) and one avatar at (x, z) metres, feet on the ground there. */
function mundo(agua: Int32Array | null, x: number, z: number) {
  const s = createSim(1, 0); setMesh(s, T.bvh, PISO_SIN_SUELO); if (agua) setAgua(s, agua);
  const e = spawnAvatar(s, 0);
  setBody(s, e, { x: fx(x), y: fx(NIVEL_AGUA - 5), z: fx(z), vy: 0, air: 0, buf: 0 });
  // let it settle onto the ground (a few ticks of gravity), quiet
  for (let i = 0; i < 80; i++) step(s, new Int32Array([e, 0, 0, 0]));
  return { s, e };
}
const metros = (v: number) => v / U;

test("the switch is a datum: aguaDelEstado is empty unless funciones:nadar is ON and the nature has its pond", () => {
  assert.equal(CLAVE_NADAR, "funciones:nadar", "the sim cannot import features/: its copy of the key is pinned here");
  assert.equal(aguaDelEstado([[CLAVE_NAT, NAT]]).length, 0, "no switch = no water");
  assert.equal(aguaDelEstado([[CLAVE_NAT, NAT], [CLAVE_NADAR, { activa: false, fija: false }]]).length, 0, "switch off");
  assert.equal(aguaDelEstado([[CLAVE_NADAR, { activa: true }]]).length, 0, "no nature, no pond");
  assert.equal(aguaDelEstado([[CLAVE_NAT, { ...NAT, estanque: false }], [CLAVE_NADAR, { activa: true }]]).length, 0, "estanque:false");
  assert.equal(aguaDelEstado([[CLAVE_NAT, { ...NAT, activa: false }], [CLAVE_NADAR, { activa: true }]]).length, 0, "nature switched off");
  const z = aguaDelEstado(ON);
  assert.equal(z.length, AGUA_STRIDE);
  assert.deepEqual([...z], [fx(E.x), fx(E.z), fx(E.radio * RADIO_NADO), fx(NIVEL_AGUA)], "the pond the nature draws, 1.2× its radius, at its surface");
  assert.equal(RADIO_NADO, 1.2); assert.ok(Math.abs(VADEO_M - VADEO / U) < 1e-4); // the page's copy of the numbers is the sim's
});

test("inside / outside: swimming needs the pond's disc AND feet deeper than VADEO under the surface", () => {
  const s = createSim(1, 0); setAgua(s, aguaDelEstado(ON));
  const x = fx(E.x), z = fx(E.z), y = fx(NIVEL_AGUA);
  assert.equal(nivelDeAgua(s, x, z), fx(NIVEL_AGUA));
  assert.equal(nivelDeAgua(s, x + fx(E.radio * 1.3), z), null, "outside the disc");
  assert.equal(nadando(s, x, y - VADEO - 1, z), true, "just deeper than the wading depth");
  assert.equal(nadando(s, x, y - VADEO, z), false, "at the wading depth you still walk");
  assert.equal(nadando(s, x, y + fx(1), z), false, "feet above the surface");
  assert.equal(nadando(s, x + fx(E.radio * 1.3), y - fx(1), z), false);
  const sin = createSim(1, 0); assert.equal(nadando(sin, x, y - fx(1), z), false, "no zones = never");
});

test("in the pond: half the pace, running adds nothing, the jump is ignored, you float; on land everything is as before", () => {
  const { s, e } = mundo(aguaDelEstado(ON), E.x, E.z); // the middle: the deepest bed (≈ −1.65 m)
  const b0 = getBody(s, e);
  assert.ok(nadando(s, b0.x, b0.y, b0.z), `the middle of the pond is swimming water (feet ${metros(b0.y)} m)`);
  assert.equal(b0.y, fx(NIVEL_AGUA) - FLOTA, "floating at FLOTA under the surface, not on the bed");
  assert.ok(metros(b0.y) > -1.65 + 0.05, "…above the bed");
  // walk: 20 ticks at full stick = 1 s; the walking pace is STEP per tick, swimming half
  const dx = (botones: number) => { const { s: t, e: f } = mundo(aguaDelEstado(ON), E.x - 3, E.z); const x0 = getBody(t, f).x; for (let i = 0; i < 20; i++) step(t, new Int32Array([f, 127, 0, botones])); return { dx: getBody(t, f).x - x0, y: getBody(t, f).y }; };
  const anda = dx(0), corre = dx(BTN_RUN);
  assert.equal(anda.dx, 20 * (STEP >> 1), "swimming = half the walking pace (0.75 m/s)");
  assert.equal(corre.dx, anda.dx, "running adds nothing in the water");
  // jump: pressed on every tick, the body never leaves the floating height
  const { s: j, e: g } = mundo(aguaDelEstado(ON), E.x, E.z); const y0 = getBody(j, g).y;
  for (let i = 0; i < 30; i++) step(j, new Int32Array([g, 0, 0, BTN_JUMP]));
  assert.equal(getBody(j, g).y, y0, "no jump in the water"); assert.equal(getBody(j, g).vy, 0);
  // the same walk on land (far from the pond) is the normal pace and a normal jump
  const tierra = mundo(aguaDelEstado(ON), -E.x, -E.z); const t0 = getBody(tierra.s, tierra.e);
  assert.equal(nadando(tierra.s, t0.x, t0.y, t0.z), false);
  for (let i = 0; i < 20; i++) step(tierra.s, new Int32Array([tierra.e, 127, 0, BTN_RUN]));
  assert.equal(getBody(tierra.s, tierra.e).x - t0.x, 20 * RUN_STEP, "on land: the running pace");
});

test("crossing the shore: you walk in, swim, and walk out again; the depth where it starts is VADEO", () => {
  // start on the land side of the pond, walk straight at its centre, then back out
  const dir = Math.atan2(E.z, E.x), radio = E.radio * 1.5;
  const sx = E.x - Math.cos(dir) * radio, sz = E.z - Math.sin(dir) * radio;
  const { s, e } = mundo(aguaDelEstado(ON), sx, sz);
  const mx = Math.round(127 * Math.cos(dir)), mz = Math.round(127 * Math.sin(dir));
  let nado = 0, primero = -1, ultimo = -1, enteraNadada = true, ymax = -Infinity;
  for (let t = 0; t < 1800; t++) {
    const b = getBody(s, e), n = nadando(s, b.x, b.y, b.z);
    if (n) { nado++; if (primero < 0) primero = t; ultimo = t; }
    step(s, new Int32Array([e, mx, mz, 0]));
    ymax = Math.max(ymax, getBody(s, e).y);
  }
  assert.ok(nado > 20, `it swims for a while crossing the pond (${nado} ticks)`);
  assert.ok(primero > 0, "it starts on land");
  const salto = (ultimo - primero + 1) === nado; enteraNadada = salto;
  assert.ok(enteraNadada, "one continuous swim (no flicker in and out)");
  // on the far side it is out of the water again and on the ground
  const f = getBody(s, e);
  assert.equal(nadando(s, f.x, f.y, f.z), false, "out at the other side");
});

test("the switch OFF is the world as today: same hash tick by tick with no zones as with the pond switched off", () => {
  const corrida = (agua: Int32Array | null) => {
    const { s, e } = mundo(agua, E.x - 6, E.z);
    const hs: number[] = [];
    for (let i = 0; i < 400; i++) { step(s, new Int32Array([e, 127, 0, i % 37 === 0 ? BTN_JUMP : i % 2 ? BTN_RUN : 0])); hs.push(stateHash(s)); }
    return hs;
  };
  const sin = corrida(null), apagado = corrida(aguaDelEstado([[CLAVE_NAT, NAT], [CLAVE_NADAR, { activa: false, fija: false }]])), vacio = corrida(new Int32Array(0));
  assert.deepEqual(apagado, sin); assert.deepEqual(vacio, sin);
  assert.notDeepEqual(corrida(aguaDelEstado(ON)), sin, "…and ON it differs (the walk crosses the pond)");
});

test("server and page predict alike: two sims with the same zones and inputs hash the same", () => {
  const a = mundo(aguaDelEstado(ON), E.x - 4, E.z), b = mundo(aguaDelEstado(ON), E.x - 4, E.z);
  for (let i = 0; i < 300; i++) { const inp = new Int32Array([0, 127, (i % 50) - 25, i % 29 === 0 ? BTN_JUMP : 0]); step(a.s, inp); step(b.s, inp); }
  assert.equal(stateHash(a.s), stateHash(b.s));
});

test("the page: state «nadar» with clip «flotar» (the catalogue's Swim_Idle_Loop), played at its own pace; the ring is cheap and ends", () => {
  assert.equal(estadoPor(0.75, 0, true), "nadar"); assert.equal(estadoPor(0, 0.9, true), "nadar", "off the bed is not «in the air» in the water");
  assert.equal(estadoPor(0.75, 0, false), "andar", "without the switch nothing changes");
  const hay = (c: string) => ["quieto", "andar", "trotar", "flotar"].includes(c);
  const q = clipPara("nadar", 0.75, 0.9, { andar: 0.8, flotar: 0.451 }, hay as never, {});
  assert.deepEqual(q, { clip: "flotar", ritmo: 1 });
  const sin = clipPara("nadar", 0.75, 0.9, { andar: 0.8 }, ((c: string) => c === "andar") as never, {});
  assert.equal(sin?.clip, "andar", "no swim clip in the catalogue: a slow walk");
  const z = { x: E.x, z: E.z, radio: E.radio, nivel: NIVEL_AGUA };
  assert.equal(nadaEn(z, E.x, NIVEL_AGUA - 1, E.z), true); assert.equal(nadaEn(z, E.x, NIVEL_AGUA - 0.1, E.z), false);
  assert.equal(nadaEn(null, E.x, -3, E.z), false, "switch off = null zone = never");
  assert.equal(nadaEn(z, E.x + E.radio * 1.3, NIVEL_AGUA - 1, E.z), false);
  assert.equal(ondaEn(-1), null); assert.equal(ondaEn(ONDA.dura), null);
  const a = ondaEn(0)!, m = ondaEn(ONDA.dura / 2)!, f = ondaEn(ONDA.dura * 0.99)!;
  assert.ok(a.radio < m.radio && m.radio < f.radio && a.opacidad > m.opacidad && m.opacidad > f.opacidad, "grows and fades");
});

test("funciones.json accepts «nadar» and the switch is part of the list", () => {
  assert.ok((FUNCIONES as readonly string[]).includes("nadar"));
  const r = leerFunciones({ schema: ESQUEMA, nadar: true }); assert.ok(r.ok && r.value.nadar === true);
  const mal = leerFunciones({ nadar: "si" }); assert.equal(mal.ok, false);
});

// ---- the real server over a WebSocket: the datum switches the pond into water; flipping it live changes the server's sim and the page's ----
const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const espera = async (f: () => boolean) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < 6000) await sleep(10); return f(); };

test("a world whose only addition is funciones.json {nadar:true} swims; without it nothing; the builder flips it live", async () => {
  const raiz = tmp("nadar-"), aventura = join(raiz, "aventura"), entorno = join(raiz, "entorno");
  mkdirSync(aventura, { recursive: true }); mkdirSync(entorno, { recursive: true });
  writeFileSync(join(entorno, "naturaleza.json"), JSON.stringify({ schema: "numinia-engine/naturaleza@1", activa: true, semilla: 1234, tamano: 200, plaza: 12, estanque: true }));
  const logs: string[] = [];
  const abrir = async () => startServer({
    port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", construir: "todos",
    aventura, entorno, datos: null, subidas: null,
    features: conMundo(partes, leerMundo(entorno, (l) => logs.push(l)), (l) => logs.push(l), escribirMundo(entorno, (l) => logs.push(l))),
  });
  const llegar = async (srv: Awaited<ReturnType<typeof abrir>>) => {
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}/ws`), f = crearCliente(), s = new ClientSession(t, { identity: keeper(), features: [f.part] });
    await t.opened; assert.ok(await espera(() => s.who !== null));
    return { t, s, f: f.interruptores };
  };
  // (1) no funciones.json: the switch is published OFF and the sim has no water
  let srv = await abrir();
  try {
    const a = await llegar(srv);
    assert.ok(await espera(() => a.f.actual().nadar !== undefined), "the nature is there: the switch is listed");
    assert.equal(a.f.actual().nadar, false, "off by default");
    await sleep(150);
    assert.equal(srv.inst.sim.agua.length, 0);
    // (2) the builder flips it on, live
    a.f.ponerFuncion("nadar", true);
    assert.ok(await espera(() => a.f.actual().nadar === true));
    assert.ok(await espera(() => srv.inst.sim.agua.length === AGUA_STRIDE), "the server's sim has the pond as water");
    assert.deepEqual([...srv.inst.sim.agua], [fx(E.x), fx(E.z), fx(E.radio * RADIO_NADO), fx(NIVEL_AGUA)]);
    assert.ok(await espera(() => { a.s.tick(0, 0); return (a.s as unknown as { local: { agua: Int32Array } }).local.agua.length === AGUA_STRIDE; }), "…and so has the page's prediction");
    assert.equal(JSON.parse(readFileSync(join(entorno, "funciones.json"), "utf8")).nadar, true, "kept in funciones.json");
    a.t.close?.();
  } finally { await srv.close(); }
  // (3) restart: the datum alone brings it back
  srv = await abrir();
  try {
    assert.ok(await espera(() => srv.inst.sim.agua.length === AGUA_STRIDE), "after a restart funciones.json still says nadar");
    const b = await llegar(srv);
    assert.ok(await espera(() => b.f.actual().nadar === true));
    assert.ok(await espera(() => { b.s.tick(0, 0); return (b.s as unknown as { local: { agua: Int32Array } }).local.agua.length === AGUA_STRIDE; }), "a page arriving later gets the water too");
    b.f.ponerFuncion("nadar", false);
    assert.ok(await espera(() => srv.inst.sim.agua.length === 0), "switched off live: the sim is dry again");
    assert.ok(await espera(() => { b.s.tick(0, 0); return (b.s as unknown as { local: { agua: Int32Array } }).local.agua.length === 0; }), "…and the page's prediction too");
    b.t.close?.();
  } finally { await srv.close(); }
});
