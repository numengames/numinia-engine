// funciones/f2 · darts and fishing obey their on/off switch (R-1). f1 keeps the switch (funciones.json, state «dardos» / «pesca» { activa, fija });
// f2 makes the pieces follow it. Server (it decides, so nobody cheats): off refuses every action of the piece and closes what was running
// (a single turn, a match, a cast) with a clear line and nothing half-paid; on again plays as always. Pages: off draws no boards, ponds, floats or
// prompts, and they come back with no reload. Real server over a real WebSocket on a temp world folder, the real feature list, the real page parts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx } from "../packages/core/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { leerMundo, escribirMundo } from "../packages/server/src/mundo.ts";
import { conMundo } from "../features/mundo.ts";
import partes from "../features/servidor.ts";
import { encendida, verSi } from "../features/funciones/feature.ts";
import { crearCliente as clienteFunciones } from "../features/funciones/client.ts";
import { crearCliente as clienteDardos } from "../features/dardos/client.ts";
import { crearCliente as clientePesca } from "../features/pesca/client.ts";
import { FUERZA_IDEAL } from "../features/dardos/feature.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const espera = async (f: () => boolean, ms = 5000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(10); return f(); };

/** A world folder with funciones.json (and dardos.json with one duel board next to the house one, when asked). */
function carpeta(o: { funciones?: object; duelo?: boolean } = {}) {
  const raiz = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "f2-")), entorno = join(raiz, "entorno");
  mkdirSync(entorno, { recursive: true });
  if (o.funciones) writeFileSync(join(entorno, "funciones.json"), JSON.stringify(o.funciones));
  if (o.duelo) writeFileSync(join(entorno, "dardos.json"), JSON.stringify({ sitios: [{ id: "diana", nombre: "Diana", x: -22, z: 20, radio: 4.5 }, { id: "duelo", nombre: "Duelo", x: 10, z: 30, radio: 4.5, duelo: true, rondas: 2 }] }));
  return { raiz, entorno, fichero: join(entorno, "funciones.json"), leer: () => JSON.parse(readFileSync(join(entorno, "funciones.json"), "utf8")) };
}
async function abrir(c: ReturnType<typeof carpeta>) {
  const logs: string[] = [];
  const srv = await startServer({
    port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", construir: "todos",
    entorno: c.entorno, datos: null, subidas: null,
    features: conMundo(partes, leerMundo(c.entorno, (l) => logs.push(l)), (l) => logs.push(l), escribirMundo(c.entorno, (l) => logs.push(l))),
  });
  return { srv, logs };
}
type Mundo = Awaited<ReturnType<typeof abrir>>;

/** A page with the three parts of the real page and where it stands. */
async function llegar(m: Mundo, donde: { x: number; z: number }) {
  const t = webSocketClient(`ws://127.0.0.1:${m.srv.port}/ws`), f = clienteFunciones(), d = clienteDardos(), p = clientePesca();
  const s = new ClientSession(t, { identity: keeper(), features: [f.part, ...d.parts, ...p.parts] });
  await t.opened; assert.ok(await espera(() => s.who !== null), "identified");
  m.srv.inst.sim.tf.cols.x[s.entity] = fx(donde.x); m.srv.inst.sim.tf.cols.z[s.entity] = fx(donde.z);
  const ev = (feature: string, event: string) => s.features.log.filter((l) => l.feature === feature && l.event === event).map((l) => l.msg);
  return { t, s, f: f.interruptores, d: d.dardos, p: p.pesca, ev };
}
type Pagina = Awaited<ReturnType<typeof llegar>>;
const ESTANQUE = { x: 18, z: -14 }, DIANA = { x: -22, z: 20 }, DUELO = { x: 10, z: 30 };
const motivos = (c: Pagina) => c.ev("dardos", "rechazado").concat(c.ev("pesca", "rechazado")).map((m) => String(m.motivo));
/** The shared state entry as a page was told it (the raw one: the controllers' `sitios()` hide it while the piece is off). */
const estadoDe = (c: Pagina, feature: string, id: string) => { for (const [k, v] of c.s.features.allState()) if (k === `${feature}:${id}`) return v; return undefined; };

test("f2 pure: «encendida» is on unless the entry says activa false; «verSi» keeps every thing while on and none while off", () => {
  assert.equal(encendida(undefined), true, "no entry (a server without the switches, a world without the piece) = on, as before");
  assert.equal(encendida({ activa: true, fija: false }), true);
  assert.equal(encendida({ activa: false, fija: false }), false);
  const l = [{ id: "diana" }, { id: "otra" }];
  assert.deepEqual(verSi(l, undefined), l); assert.deepEqual(verSi(l, { activa: true }), l); assert.deepEqual(verSi(l, { activa: false }), []);
  assert.notEqual(verSi(l, undefined), l, "a copy, never the caller's array");
});

test("f2 pesca: off refuses a cast and drops who was fishing (no catch, spot free); on again fishes as always; pages draw nothing meanwhile", async () => {
  const c = carpeta({ funciones: { schema: "numinia-engine/funciones@1", pesca: true } });
  const m = await abrir(c);
  try {
    const a = await llegar(m, ESTANQUE), b = await llegar(m, ESTANQUE);
    assert.ok(await espera(() => a.f.actual().pesca === true && a.p.sitios().length === 1), "on: the pond is there");
    assert.equal(a.p.ofrece("pesca", "estanque"), true, "on: «E: pescar» is offered");
    assert.deepEqual(a.p.lanzar("estanque"), { ok: true });
    assert.ok(await espera(() => a.p.estado().fase === "espera" && b.p.flotadores().length === 1), "on: a cast, seen by the neighbour");
    assert.equal(estadoDe(a, "pesca", "estanque")?.ocupado, true);

    a.f.ponerFuncion("pesca", false);
    assert.ok(await espera(() => a.p.estado().fase === "nada" && b.p.flotadores().length === 0 && a.p.sitios().length === 0 && b.p.sitios().length === 0), "off: the angler is dropped, the float and the pond are gone on every page");
    assert.deepEqual(a.ev("pesca", "escape").map((x) => x.motivo), ["apagada"], "the angler is told why");
    assert.match(String(a.ev("pesca", "escape")[0].texto), /apagado/);
    assert.equal(a.ev("pesca", "captura").length, 0, "no catch, nothing half-paid");
    assert.equal(estadoDe(a, "pesca", "estanque")?.ocupado, false, "the spot is free");
    assert.deepEqual(c.leer(), { schema: "numinia-engine/funciones@1", pesca: false });
    assert.equal(a.p.ofrece("pesca", "estanque"), false, "off: no «E: pescar»");
    assert.equal(a.p.lanzar("estanque").ok, false, "the page does not even ask");
    // a page that does ask (a rogue client, an agent): the server refuses
    a.s.features.send("pesca", "lanzar", { sitio: "estanque" });
    b.s.features.send("pesca", "recoger", { activo: true });
    assert.ok(await espera(() => motivos(a).length === 1 && motivos(b).length === 1));
    assert.match(motivos(a)[0], /pesca está apagada/); assert.match(motivos(b)[0], /pesca está apagada/);
    await sleep(200);
    assert.equal(a.p.estado().fase, "nada", "refused: nobody fishes");
    assert.equal(estadoDe(a, "pesca", "estanque")?.ocupado, false);

    b.f.ponerFuncion("pesca", true);
    assert.ok(await espera(() => a.p.sitios().length === 1 && b.p.sitios().length === 1), "on again: the pond is back with no reload");
    assert.equal(a.p.ofrece("pesca", "estanque"), true);
    assert.deepEqual(a.p.lanzar("estanque"), { ok: true });
    assert.ok(await espera(() => a.p.estado().fase === "espera" && b.p.flotadores().length === 1), "on again: fishing works");
    a.p.soltar();
    assert.ok(await espera(() => a.p.estado().fase === "nada"));
    a.t.close(); b.t.close();
  } finally { await m.srv.close(); }
});

test("f2 dardos: off refuses a throw and closes a turn; a duel in progress ends for both with no winner; on again plays a new match", async () => {
  const c = carpeta({ funciones: { schema: "numinia-engine/funciones@1", dardos: true }, duelo: true });
  const m = await abrir(c);
  try {
    const a = await llegar(m, DIANA), b = await llegar(m, DUELO), r = await llegar(m, DUELO);
    assert.ok(await espera(() => a.f.actual().dardos === true && a.d.sitios().length === 2 && r.d.sitios().length === 2), "on: both boards are there");
    // a single turn in the house board, a duel between b and r
    assert.deepEqual(a.d.jugar("diana"), { ok: true });
    assert.ok(await espera(() => a.d.tirando()));
    assert.deepEqual(a.d.lanzar(0, 0, FUERZA_IDEAL, "diana"), { ok: true });
    assert.ok(await espera(() => a.d.estado().dardos === 1), "on: a dart lands");
    assert.deepEqual(b.d.jugar("duelo"), { ok: true });
    assert.deepEqual(r.d.jugar("duelo"), { ok: true });
    assert.ok(await espera(() => b.d.duelo()?.ronda === 1 && r.d.duelo()?.yo === true), "on: the match started");
    assert.equal(estadoDe(b, "dardos", "duelo")?.ocupado, true);
    const quien = b.d.duelo()!.miTurno ? b : r;
    assert.deepEqual(quien.d.lanzar(0, 0, FUERZA_IDEAL, "duelo"), { ok: true });
    assert.ok(await espera(() => quien.d.estado().dardos === 1));

    a.f.ponerFuncion("dardos", false);
    assert.ok(await espera(() => !a.d.tirando() && b.d.duelo()?.fin !== null && r.d.duelo()?.fin !== null && a.d.sitios().length === 0 && r.d.sitios().length === 0), "off: turn closed, match over for both, boards gone on every page");
    for (const p of [b, r]) {
      const fin = p.d.duelo()!.fin!;
      assert.equal(fin.empate, true, "nobody wins"); assert.equal(fin.gane, false); assert.match(fin.texto, /apagado.*cancelada/);
    }
    assert.equal(estadoDe(a, "dardos", "diana")?.ocupado, false, "the single board is free");
    assert.deepEqual({ ocupado: estadoDe(b, "dardos", "duelo")?.ocupado, espera: estadoDe(b, "dardos", "duelo")?.espera, jugadores: estadoDe(b, "dardos", "duelo")?.jugadores }, { ocupado: false, espera: false, jugadores: 0 }, "the duel board is clean, nothing hanging");
    assert.equal(a.ev("dardos", "fin").at(-1)?.quien, a.s.entity, "the thrower hears how the turn ended");
    assert.ok(await espera(() => a.d.estado().marcador.dardos === 1), "what was thrown stays in the scoreboard (the turn closed like a walk-away)");
    const marcador = a.d.estado().marcador.dardos;
    assert.equal(a.d.ofrece("dardos", "diana"), false, "off: no «E: tirar dardos»");
    assert.equal(a.d.jugar("diana").ok, false); assert.equal(a.d.lanzar(0, 0, FUERZA_IDEAL, "diana").ok, false);
    assert.deepEqual(a.d.clavados(), []);
    // a page that does ask: the server refuses jugar, lanzar, cambiar and empezar
    a.s.features.send("dardos", "jugar", { sitio: "diana" });
    a.s.features.send("dardos", "lanzar", { sitio: "diana", x: 0, y: 0, fuerza: FUERZA_IDEAL });
    b.s.features.send("dardos", "cambiar", { sitio: "duelo" });
    r.s.features.send("dardos", "empezar", { sitio: "duelo" });
    assert.ok(await espera(() => motivos(a).length === 2 && motivos(b).length === 1 && motivos(r).length === 1));
    for (const p of [a, b, r]) for (const x of motivos(p)) assert.match(x, /dardos están apagados/);
    await sleep(200);
    assert.equal(a.d.tirando(), false, "refused: nobody throws");
    assert.equal(estadoDe(a, "dardos", "diana")?.ocupado, false);
    assert.equal(a.d.estado().marcador.dardos, marcador);

    r.f.ponerFuncion("dardos", true);
    assert.ok(await espera(() => a.d.sitios().length === 2 && b.d.sitios().length === 2), "on again: the boards are back with no reload");
    assert.equal(a.d.ofrece("dardos", "diana"), true);
    assert.deepEqual(a.d.jugar("diana"), { ok: true });
    assert.ok(await espera(() => a.d.tirando()), "on again: a single turn starts");
    assert.deepEqual(a.d.lanzar(0, 0, FUERZA_IDEAL, "diana"), { ok: true });
    assert.ok(await espera(() => a.d.estado().dardos === 1), "on again: the dart lands");
    assert.deepEqual(a.d.salir(), { ok: true });
    assert.ok(await espera(() => !a.d.tirando() && a.d.estado().marcador.dardos === marcador + 1), "on again: the turn closes and the dart counts");
    assert.deepEqual(b.d.jugar("duelo"), { ok: true });
    assert.deepEqual(r.d.jugar("duelo"), { ok: true });
    assert.ok(await espera(() => b.d.duelo()?.fin === null && b.d.duelo()?.ronda === 1 && r.d.duelo()?.yo === true), "on again: a new match starts");
    a.t.close(); b.t.close(); r.t.close();
  } finally { await m.srv.close(); }
});

test("f2: a world with no funciones.json (and one that never named these two) plays exactly as before; off from the start shows nothing and refuses", async () => {
  const c = carpeta(); // no file: nothing written until someone flips
  const m = await abrir(c);
  try {
    const a = await llegar(m, ESTANQUE);
    assert.ok(await espera(() => a.f.actual().pesca === true && a.f.actual().dardos === true));
    assert.ok(await espera(() => a.p.sitios().length === 1 && a.d.sitios().length === 1), "the house pond and board are there");
    assert.deepEqual(a.p.lanzar("estanque"), { ok: true });
    assert.ok(await espera(() => a.p.estado().fase === "espera"));
    a.p.soltar(); assert.ok(await espera(() => a.p.estado().fase === "nada"));
    a.t.close();
  } finally { await m.srv.close(); }
  const c2 = carpeta({ funciones: { dardos: false, pesca: false } }); // started off
  const m2 = await abrir(c2);
  try {
    const a = await llegar(m2, ESTANQUE);
    assert.ok(await espera(() => a.f.actual().pesca === false && a.f.actual().dardos === false));
    assert.deepEqual([a.p.sitios().length, a.d.sitios().length], [0, 0], "off from the start: nothing drawn");
    assert.equal(a.p.lanzar("estanque").ok, false);
    a.s.features.send("pesca", "lanzar", { sitio: "estanque" });
    assert.ok(await espera(() => motivos(a).length === 1)); assert.match(motivos(a)[0], /apagada/);
    a.t.close();
  } finally { await m2.srv.close(); }
});
