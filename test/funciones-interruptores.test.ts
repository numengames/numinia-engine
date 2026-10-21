// funciones/f1 · the world's feature switches on the server (R-1: every piece switches on without touching code). Whoever may build flips `normas`
// (the gate of the conditions of entry), `dardos` and `pesca` live; the state is kept in the world's funciones.json and published to every page.
// Real server over a real WebSocket, the real world-folder reader/writer (packages/server/src/mundo.ts) on a temp dir, the real feature list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { fxToFloat } from "../packages/core/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { leerMundo, escribirMundo } from "../packages/server/src/mundo.ts";
import { conMundo } from "../features/mundo.ts";
import partes from "../features/servidor.ts";
import { funciones as declaracion } from "../features/funciones/feature.ts";
import { crearCliente } from "../features/funciones/client.ts";
import { conFuncion, ESQUEMA, leerFunciones } from "../features/funciones/esquema.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const espera = async (f: () => boolean) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < 5000) await sleep(10); return f(); };

const CONDICIONES = (puerta?: boolean) => JSON.stringify({ formato: "condiciones@1", ...(puerta === undefined ? {} : { puerta }), capas: [{ capa: "casa", version: "1", puntos: [{ id: "uso", titulo: "uso", texto: "texto uso", obligatorio: true, tipo: "norma" }] }] });

/** A world folder: aventura/ (with condiciones.json when asked) and entorno/ (with funciones.json when asked). */
function carpeta(o: { condiciones?: string; funciones?: string } = {}) {
  const raiz = tmp("f1-"), aventura = join(raiz, "aventura"), entorno = join(raiz, "entorno");
  mkdirSync(aventura, { recursive: true }); mkdirSync(entorno, { recursive: true });
  if (o.condiciones !== undefined) writeFileSync(join(aventura, "condiciones.json"), o.condiciones);
  if (o.funciones !== undefined) writeFileSync(join(entorno, "funciones.json"), o.funciones);
  return { raiz, aventura, entorno, fichero: join(entorno, "funciones.json"), leer: () => readFileSync(join(entorno, "funciones.json"), "utf8") };
}

/** The server as main.ts builds it from a folder. `construir: "todos"` = every visitor may build (the one who directs); "nadie" = nobody. */
async function abrir(c: ReturnType<typeof carpeta>, o: { construir?: "todos" | "nadie"; condicionesPuerta?: boolean } = {}) {
  const logs: string[] = [];
  const srv = await startServer({
    port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", construir: o.construir ?? "todos",
    aventura: c.aventura, entorno: c.entorno, datos: null, subidas: null, condicionesPuerta: o.condicionesPuerta,
    features: conMundo(partes, leerMundo(c.entorno, (l) => logs.push(l)), (l) => logs.push(l), escribirMundo(c.entorno, (l) => logs.push(l))),
  });
  return { srv, logs };
}
type Mundo = Awaited<ReturnType<typeof abrir>>;

async function llegar(m: Mundo) {
  const t = webSocketClient(`ws://127.0.0.1:${m.srv.port}/ws`), f = crearCliente(), s = new ClientSession(t, { identity: keeper(), features: [f.part] });
  await t.opened; assert.ok(await espera(() => s.who !== null), "identified");
  return { t, s, f: f.interruptores, rechazos: () => s.features.log.filter((l) => l.feature === "funciones" && l.event === "rechazado").map((l) => String(l.msg.motivo)) };
}
type Pagina = Awaited<ReturnType<typeof llegar>>;
/** How far it walks in a second (held where it arrived = ~0). */
async function andar(c: Pagina, m: Mundo) {
  const x0 = fxToFloat(m.srv.inst.sim.tf.cols.x[c.s.entity]);
  for (let k = 0; k < 20; k++) { c.s.tick(127, 0); await sleep(55); }
  return fxToFloat(m.srv.inst.sim.tf.cols.x[c.s.entity]) - x0;
}
const aceptar = async (c: Pagina) => { assert.ok(await espera(() => c.s.condiciones !== null)); assert.ok(c.s.aceptar({ casa: "1" }, [])); assert.ok(await espera(() => c.s.condiciones!.abierta === true)); };
const cierra = (...cs: Pagina[]) => cs.forEach((c) => c.t.close());

test("f1 file: the declaration meets the plug's rules; leerFunciones and conFuncion keep every key and say how to fix a wrong one", () => {
  assert.deepEqual(declaracion.issues, []);
  assert.deepEqual(conFuncion(undefined, "normas", false), { schema: ESQUEMA, normas: false });
  const crudo = { schema: ESQUEMA, pesca: true, normas: true };
  const nuevo = conFuncion(crudo, "normas", false)!;
  assert.deepEqual(Object.keys(nuevo), Object.keys(crudo)); assert.deepEqual(nuevo, { ...crudo, normas: false }); assert.equal(crudo.normas, true, "the input is not touched");
  assert.equal(conFuncion([1], "pesca", true), null);
  assert.deepEqual(leerFunciones({}), { ok: true, value: {} });
  const r = leerFunciones({ normas: "no", otra: 1, schema: "x" });
  assert.ok(!r.ok && r.issues.map((i) => i.path).join() === "funciones.otra,funciones.schema,funciones.normas");
});

test("f1: a world WITHOUT funciones.json behaves as today — gate off, no file written, state says dardos and pesca on; the fingerprint is the pinned one", async () => {
  const c = carpeta({ condiciones: CONDICIONES() });
  const m = await abrir(c);
  try {
    assert.equal(m.srv.fingerprint, "7e630965");
    assert.ok(m.logs.some((l) => l.includes("[condiciones] puerta apagada")));
    const a = await llegar(m);
    assert.ok(await espera(() => a.f.actual().dardos !== undefined));
    assert.deepEqual(a.f.actual(), { normas: false, dardos: true, pesca: true, nadar: false });
    assert.equal(a.f.fija("normas"), false);
    assert.ok(await andar(a, m) > 1, "walks at once"); assert.equal(a.s.condiciones, null, "and was sent nothing");
    assert.equal(existsSync(c.fichero), false, "reading the state writes nothing");
    cierra(a);
  } finally { await m.srv.close(); }
});

test("f1: whoever directs flips normas live; the file is written, every page hears it, and it survives a restart", async () => {
  const c = carpeta({ condiciones: CONDICIONES() });
  let m = await abrir(c);
  try {
    const a = await llegar(m), b = await llegar(m);
    assert.ok(await espera(() => a.f.actual().normas === false));
    a.f.ponerFuncion("normas", true);
    assert.ok(await espera(() => a.f.actual().normas === true && b.f.actual().normas === true), "both pages see it");
    assert.deepEqual(JSON.parse(c.leer()), { schema: ESQUEMA, normas: true });
    assert.deepEqual(readdirSync(c.entorno), ["funciones.json"], "no temporary file left");
    assert.equal(b.s.features.log.filter((l) => l.feature === "funciones" && l.event === "cambiada").at(-1)?.msg.estado, "encendida");
    assert.ok(m.logs.some((l) => l.includes("puerta ENCENDIDA desde el mundo")));
    cierra(a, b);
  } finally { await m.srv.close(); }
  // the restart: the file turns the gate on; a newcomer is asked
  m = await abrir(c);
  try {
    assert.ok(m.logs.some((l) => l.includes("[condiciones] puerta ENCENDIDA") && l.includes("según funciones.json")), "the log says where it came from");
    const n = await llegar(m);
    assert.ok(await espera(() => n.s.condiciones !== null) && n.s.condiciones!.abierta === false, "asked after the restart");
    assert.ok(await espera(() => n.f.actual().normas === true));
    assert.ok(await andar(n, m) < 0.01, "held");
    cierra(n);
  } finally { await m.srv.close(); }
});

test("f1: switching normas OFF lets in whoever was reading; switching it ON asks only who arrives afterwards (nobody inside is put out)", async () => {
  const c = carpeta({ condiciones: CONDICIONES(true) }); // the gate starts on (condiciones.json `puerta`)
  const m = await abrir(c);
  try {
    const director = await llegar(m), lector = await llegar(m);
    await aceptar(director); // the director accepts (a held person's intents are ignored) …
    assert.ok(await espera(() => lector.s.condiciones !== null) && lector.s.condiciones!.abierta === false);
    assert.ok(await andar(lector, m) < 0.01, "the reader is held");
    assert.ok(await espera(() => m.srv.inst.leyendoNormas(lector.s.entity)), "and the others know they are reading");
    director.f.ponerFuncion("normas", false); // … and turns the gate off
    assert.ok(await espera(() => lector.s.condiciones!.abierta === true), "the reader is told the gate is open");
    assert.equal(lector.s.condiciones!.puerta, false);
    assert.ok(await andar(lector, m) > 1, "and walks");
    assert.equal(m.srv.inst.leyendoNormas(lector.s.entity), false, "their bubble is gone for everybody");
    assert.deepEqual(JSON.parse(c.leer()), { schema: ESQUEMA, normas: false });
    // off: a newcomer walks straight in
    const libre = await llegar(m);
    assert.ok(await andar(libre, m) > 1, "a newcomer is not asked while it is off");
    // on again: those inside stay inside, the one who arrives now is asked
    director.f.ponerFuncion("normas", true);
    assert.ok(await espera(() => lector.f.actual().normas === true));
    const nuevo = await llegar(m);
    assert.ok(await espera(() => nuevo.s.condiciones !== null) && nuevo.s.condiciones!.abierta === false, "the newcomer is asked");
    assert.ok(await andar(nuevo, m) < 0.01, "held");
    assert.ok(await andar(lector, m) > 1, "the reader who got in is not put out");
    assert.ok(await andar(libre, m) > 1, "the one who arrived while it was off is not put out either");
    // and asking again does not close them (the gate answers «open» for whoever was inside)
    libre.s.pedirCondiciones(); await sleep(150);
    assert.equal(libre.s.condiciones === null || libre.s.condiciones.abierta, true);
    cierra(director, lector, libre, nuevo);
  } finally { await m.srv.close(); }
});

test("f1: a visitor who may not build cannot flip anything; file and state stay as they were", async () => {
  const original = `{ "schema": "${ESQUEMA}", "normas": false, "pesca": true }\n`;
  const c = carpeta({ condiciones: CONDICIONES(), funciones: original });
  const m = await abrir(c, { construir: "nadie" });
  try {
    const v = await llegar(m), w = await llegar(m);
    assert.ok(await espera(() => v.f.actual().normas === false));
    for (const [f, si] of [["normas", true], ["dardos", false], ["pesca", false]] as const) { v.f.ponerFuncion(f, si); await sleep(1100); } // one per second at most
    assert.ok(await espera(() => v.rechazos().length >= 1));
    assert.match(v.rechazos()[0], /permiso de construir/);
    assert.equal(c.leer(), original); assert.deepEqual(v.f.actual(), { normas: false, dardos: true, pesca: true, nadar: false }); assert.deepEqual(w.f.actual(), v.f.actual());
    assert.ok(await andar(v, m) > 1, "the gate stayed off");
    cierra(v, w);
  } finally { await m.srv.close(); }
});

test("f1: dardos and pesca are kept and published (nothing is hidden yet); the file's other keys stay; a world with no conditions has no «normas»", async () => {
  const c = carpeta({ funciones: JSON.stringify({ schema: ESQUEMA, pesca: true, dardos: true }) }); // no aventura/condiciones.json: the house example only
  const m = await abrir(c);
  try {
    const a = await llegar(m);
    assert.ok(await espera(() => a.f.actual().dardos !== undefined));
    assert.deepEqual(a.f.actual(), { dardos: true, pesca: true, nadar: false }, "no conditions of its own: no «normas» switch");
    a.f.ponerFuncion("normas", true);
    assert.ok(await espera(() => a.rechazos().length === 1)); assert.match(a.rechazos()[0], /no tiene condiciones de entrada/);
    a.f.ponerFuncion("dardos", false);
    assert.ok(await espera(() => a.f.actual().dardos === false));
    assert.deepEqual(JSON.parse(c.leer()), { schema: ESQUEMA, pesca: true, dardos: false });
    assert.deepEqual(a.f.actual(), { dardos: false, pesca: true, nadar: false });
    cierra(a);
  } finally { await m.srv.close(); }
  const m2 = await abrir(c); // restart: dardos stays off
  try {
    const a = await llegar(m2);
    assert.ok(await espera(() => a.f.actual().dardos !== undefined));
    assert.deepEqual(a.f.actual(), { dardos: false, pesca: true, nadar: false });
    cierra(a);
  } finally { await m2.srv.close(); }
});

test("f1: priority — MOTOR_CONDICIONES_PUERTA / the option beats funciones.json, which beats condiciones.json; a forced gate says `fija` and the switch refuses", async () => {
  // the file beats condiciones.json: puerta true there, normas false here = off
  const c = carpeta({ condiciones: CONDICIONES(true), funciones: JSON.stringify({ normas: false }) });
  let m = await abrir(c);
  try {
    const a = await llegar(m);
    assert.ok(await andar(a, m) > 1, "funciones.json «normas: false» beats «puerta: true»");
    assert.ok(await espera(() => a.f.actual().normas === false)); assert.equal(a.f.fija("normas"), false);
    cierra(a);
  } finally { await m.srv.close(); }
  // the option beats the file
  m = await abrir(c, { condicionesPuerta: true });
  try {
    assert.ok(m.logs.some((l) => l.includes("puerta ENCENDIDA") && l.includes("fijada por el entorno")));
    const a = await llegar(m), antes = c.leer();
    assert.ok(await espera(() => a.f.actual().normas === true)); assert.equal(a.f.fija("normas"), true);
    await aceptar(a);
    a.f.ponerFuncion("normas", false);
    assert.ok(await espera(() => a.rechazos().length === 1)); assert.match(a.rechazos()[0], /las fija el servidor/);
    assert.equal(c.leer(), antes, "the file is not touched"); assert.equal(a.f.actual().normas, true);
    cierra(a);
  } finally { await m.srv.close(); }
});

test("f1: a wrong funciones.json is not used (the log says how to fix it) and the switch never overwrites it", async () => {
  const roto = `{ "normas": "si" }\n`;
  const c = carpeta({ condiciones: CONDICIONES(), funciones: roto });
  const m = await abrir(c);
  try {
    assert.ok(m.logs.some((l) => l.includes("funciones.json no se usa") && l.includes("funciones.normas")), m.logs.join("\n"));
    const a = await llegar(m);
    assert.ok(await espera(() => a.f.actual().normas === false));
    a.f.ponerFuncion("pesca", false);
    assert.ok(await espera(() => a.rechazos().length === 1)); assert.match(a.rechazos()[0], /arréglalo a mano/);
    assert.equal(c.leer(), roto); assert.equal(a.f.actual().pesca, true);
    cierra(a);
  } finally { await m.srv.close(); }
});
