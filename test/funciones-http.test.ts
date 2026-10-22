// /funciones (e1): GET/POST switch a world's functions (normas de entrada, dardos, pesca) over HTTP for numinia.com's admin panel.
// Real server on a free port with the real world-folder reader/writer and the real feature list, real fetch, a real WebSocket client that must
// SEE the change (one code path with the intent `poner`, features/funciones/server.ts `cambiar`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import type { ConfigPase } from "../packages/server/src/pase.ts";
import { leerMundo, escribirMundo } from "../packages/server/src/mundo.ts";
import { conMundo } from "../features/mundo.ts";
import partes from "../features/servidor.ts";
import { crearCliente } from "../features/funciones/client.ts";
import { ESQUEMA } from "../features/funciones/esquema.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const espera = async (f: () => boolean) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < 5000) await sleep(10); return f(); };

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const ahoraS = () => Math.floor(Date.now() / 1000);
const SUB = `p_${"a".repeat(32)}`;
const carga = (o: Record<string, unknown> = {}) => ({
  v: 1, iss: "numinia.com", aud: MUNDO, sub: SUB, org: "org-1", perm: ["enter-worlds"], height: 0, roles: [], iat: ahoraS() - 5, exp: ahoraS() + 595, ...o,
});
function pase(payload: object = carga(), key: KeyObject = par.privateKey): string {
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), key))}`;
}
const GESTOR = pase(carga({ perm: ["enter-worlds", "manage-organization"] }));

const CONDICIONES = (puerta?: boolean) => JSON.stringify({ formato: "condiciones@1", ...(puerta === undefined ? {} : { puerta }), capas: [{ capa: "casa", version: "1", puntos: [{ id: "uso", titulo: "uso", texto: "texto uso", obligatorio: true, tipo: "norma" }] }] });

/** A world folder (aventura/ with condiciones.json when asked, entorno/ with funciones.json when asked) served with the real feature list and a pass key. */
async function mundo(o: { condiciones?: string; funciones?: string; pase?: ConfigPase | null; condicionesPuerta?: boolean } = {}) {
  const raiz = tmp("e1-"), aventura = join(raiz, "aventura"), entorno = join(raiz, "entorno");
  mkdirSync(aventura, { recursive: true }); mkdirSync(entorno, { recursive: true });
  if (o.condiciones !== undefined) writeFileSync(join(aventura, "condiciones.json"), o.condiciones);
  if (o.funciones !== undefined) writeFileSync(join(entorno, "funciones.json"), o.funciones);
  const fichero = join(entorno, "funciones.json"), log: string[] = [];
  const srv = await startServer({
    port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => log.push(l), secret: "una-clave-de-prueba-larga", construir: "todos", version: "prueba",
    aventura, entorno, datos: null, subidas: null, condicionesPuerta: o.condicionesPuerta,
    pase: o.pase === undefined ? { clave: CLAVE, mundo: MUNDO } : o.pase,
    features: conMundo(partes, leerMundo(entorno, (l) => log.push(l)), (l) => log.push(l), escribirMundo(entorno, (l) => log.push(l))),
  });
  const base = `http://127.0.0.1:${srv.port}`;
  const pedir = async (method: string, ruta: string, o2: { token?: string; cuerpo?: unknown; origen?: string; crudo?: string } = {}) => {
    const cab: Record<string, string> = {};
    if (o2.token) cab.authorization = `Bearer ${o2.token}`;
    if (o2.origen) cab.origin = o2.origen;
    if (o2.cuerpo !== undefined || o2.crudo !== undefined) cab["content-type"] = "application/json";
    const r = await fetch(base + ruta, { method, headers: cab, body: o2.crudo ?? (o2.cuerpo === undefined ? undefined : JSON.stringify(o2.cuerpo)) });
    const txt = await r.text();
    let json: any = null; try { json = JSON.parse(txt); } catch { /* 204 */ }
    return { status: r.status, json, cab: r.headers };
  };
  const llegar = async () => {
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}/ws`), f = crearCliente(), s = new ClientSession(t, { identity: keeper(), features: [f.part] });
    await t.opened; assert.ok(await espera(() => s.who !== null), "identified");
    return { t, s, f: f.interruptores };
  };
  return { srv, log, pedir, llegar, fichero, entorno, leer: () => JSON.parse(readFileSync(fichero, "utf8")) };
}

test("auth: no pass is 401, a bad pass 401, a pass without manage-organization 403, an owner and a manager pass", async () => {
  const w = await mundo({ condiciones: CONDICIONES() });
  try {
    assert.equal((await w.pedir("GET", "/funciones")).status, 401);
    assert.equal((await w.pedir("POST", "/funciones", { cuerpo: { funcion: "pesca", activa: false } })).status, 401);
    const otra = generateKeyPairSync("ed25519").privateKey;
    const mala = await w.pedir("GET", "/funciones", { token: pase(carga(), otra) });
    assert.equal(mala.status, 401);
    assert.equal((await w.pedir("GET", "/funciones", { token: pase(carga({ aud: "otro-mundo", perm: ["manage-organization"] })) })).status, 401, "a pass for another world");
    const sinPermiso = await w.pedir("POST", "/funciones", { token: pase(), cuerpo: { funcion: "pesca", activa: false } });
    assert.equal(sinPermiso.status, 403); assert.equal(sinPermiso.json.error, "sin-permiso");
    assert.equal(existsSync(w.fichero), false, "a refused request wrote nothing");
    assert.equal((await w.pedir("GET", "/funciones", { token: GESTOR })).status, 200);
    assert.equal((await w.pedir("GET", "/funciones", { token: pase(carga({ perm: [], height: Number.MAX_VALUE })) })).status, 200, "an owner");
  } finally { await w.srv.close(); }
});

test("a world with no pass configuration: the door is shut (404, fail closed) and writes nothing", async () => {
  const w = await mundo({ condiciones: CONDICIONES(), pase: null });
  try {
    for (const m of ["GET", "POST"]) {
      const x = await w.pedir(m, "/funciones", { token: GESTOR, cuerpo: m === "POST" ? { funcion: "pesca", activa: false } : undefined });
      assert.equal(x.status, 404, m); assert.equal(x.json.error, "funciones-desactivado");
    }
    assert.equal(existsSync(w.fichero), false);
  } finally { await w.srv.close(); }
});

test("CORS: only https://numinia.com is answered, never *; OPTIONS preflight needs no pass", async () => {
  const w = await mundo({ condiciones: CONDICIONES() });
  try {
    const pre = await w.pedir("OPTIONS", "/funciones", { origen: "https://numinia.com" });
    assert.equal(pre.status, 204);
    assert.equal(pre.cab.get("access-control-allow-origin"), "https://numinia.com");
    assert.equal(pre.cab.get("access-control-allow-methods"), "GET,POST,OPTIONS");
    assert.match(pre.cab.get("access-control-allow-headers") ?? "", /Authorization/);
    const ajeno = await w.pedir("OPTIONS", "/funciones", { origen: "https://malo.example" });
    assert.equal(ajeno.status, 204); assert.equal(ajeno.cab.get("access-control-allow-origin"), null);
    const ok = await w.pedir("GET", "/funciones", { token: GESTOR, origen: "https://numinia.com" });
    assert.equal(ok.cab.get("access-control-allow-origin"), "https://numinia.com");
    const fuera = await w.pedir("GET", "/funciones", { token: GESTOR, origen: "https://malo.example" });
    assert.equal(fuera.status, 200); assert.equal(fuera.cab.get("access-control-allow-origin"), null);
    const sin = await w.pedir("GET", "/funciones", { origen: "https://numinia.com" }); // errors carry the header too, so the panel can read them
    assert.equal(sin.status, 401); assert.equal(sin.cab.get("access-control-allow-origin"), "https://numinia.com");
    assert.notEqual(ok.cab.get("access-control-allow-origin"), "*");
  } finally { await w.srv.close(); }
});

test("GET lists the switches this world has: with conditions normas+dardos+pesca (defaults off/on/on); without conditions only dardos+pesca", async () => {
  const con = await mundo({ condiciones: CONDICIONES() });
  try {
    assert.deepEqual((await con.pedir("GET", "/funciones", { token: GESTOR })).json, { funciones: [
      { id: "normas", activa: false, fija: false }, { id: "dardos", activa: true, fija: false }, { id: "pesca", activa: true, fija: false },
    ] });
    assert.equal((await con.pedir("GET", "/funciones/", { token: GESTOR })).status, 200, "a trailing slash is the same door");
  } finally { await con.srv.close(); }
  const sin = await mundo();
  try {
    assert.deepEqual((await sin.pedir("GET", "/funciones", { token: GESTOR })).json.funciones.map((f: any) => f.id), ["dardos", "pesca"]);
    const x = await sin.pedir("POST", "/funciones", { token: GESTOR, cuerpo: { funcion: "normas", activa: true } });
    assert.equal(x.status, 404); assert.equal(x.json.error, "ausente"); assert.match(x.json.texto, /no tiene condiciones de entrada/);
    assert.equal(existsSync(sin.fichero), false);
  } finally { await sin.srv.close(); }
});

test("POST changes the state a connected client sees, writes funciones.json atomically, tells every page, logs the pass", async () => {
  const w = await mundo({ condiciones: CONDICIONES() });
  try {
    const a = await w.llegar(), b = await w.llegar();
    assert.ok(await espera(() => a.f.actual().normas === false));
    const r = await w.pedir("POST", "/funciones", { token: GESTOR, cuerpo: { funcion: "normas", activa: true } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.funcion, { id: "normas", activa: true, fija: false });
    assert.deepEqual(r.json.funciones.map((f: any) => [f.id, f.activa]), [["normas", true], ["dardos", true], ["pesca", true]]);
    assert.ok(await espera(() => a.f.actual().normas === true && b.f.actual().normas === true), "both connected pages see it");
    assert.deepEqual(w.leer(), { schema: ESQUEMA, normas: true });
    assert.deepEqual(readdirSync(w.entorno), ["funciones.json"], "no temporary file left");
    assert.equal(b.s.features.log.filter((l) => l.feature === "funciones" && l.event === "cambiada").at(-1)?.msg.estado, "encendida");
    assert.ok(w.log.some((l) => l.includes(`el pase ${SUB} enciende normas desde el panel`)), "the log says whose pass changed it");
    assert.ok(w.log.some((l) => l.includes("puerta ENCENDIDA desde el mundo")), "the gate itself was flipped by the same code");
    assert.deepEqual((await w.pedir("GET", "/funciones", { token: GESTOR })).json.funciones[0], { id: "normas", activa: true, fija: false });

    // dardos off and the other keys are kept; the intent from inside the world and the door agree
    assert.equal((await w.pedir("POST", "/funciones", { token: GESTOR, cuerpo: { funcion: "dardos", activa: false } })).status, 200);
    assert.ok(await espera(() => a.f.actual().dardos === false));
    assert.deepEqual(w.leer(), { schema: ESQUEMA, normas: true, dardos: false });
    a.f.ponerFuncion("pesca", false); // the verb, from inside
    assert.ok(await espera(() => b.f.actual().pesca === false));
    assert.deepEqual((await w.pedir("GET", "/funciones", { token: GESTOR })).json.funciones.map((f: any) => f.activa), [true, false, false]);
    assert.deepEqual(w.leer(), { schema: ESQUEMA, normas: true, dardos: false, pesca: false });
    a.t.close(); b.t.close();
  } finally { await w.srv.close(); }
});

test("POST «puerta» is the other name of normas; turning normas ON asks only who arrives afterwards (nobody inside is put out)", async () => {
  const w = await mundo({ condiciones: CONDICIONES() });
  try {
    const dentro = await w.llegar();
    assert.ok(await espera(() => dentro.f.actual().normas === false));
    const r = await w.pedir("POST", "/funciones", { token: GESTOR, cuerpo: { funcion: "puerta", activa: true } });
    assert.equal(r.status, 200); assert.equal(r.json.funcion.id, "normas");
    assert.ok(await espera(() => dentro.f.actual().normas === true));
    const nuevo = await w.llegar();
    assert.ok(await espera(() => nuevo.s.condiciones !== null) && nuevo.s.condiciones!.abierta === false, "the newcomer is asked");
    assert.equal(dentro.s.condiciones === null || dentro.s.condiciones.abierta, true, "who was inside is not asked");
    dentro.t.close(); nuevo.t.close();
  } finally { await w.srv.close(); }
});

test("`fija`: a gate the server pins answers 409 «lo fija el servidor» and changes nothing", async () => {
  const w = await mundo({ condiciones: CONDICIONES(), condicionesPuerta: true });
  try {
    assert.deepEqual((await w.pedir("GET", "/funciones", { token: GESTOR })).json.funciones[0], { id: "normas", activa: true, fija: true });
    const r = await w.pedir("POST", "/funciones", { token: GESTOR, cuerpo: { funcion: "normas", activa: false } });
    assert.equal(r.status, 409); assert.equal(r.json.error, "fija"); assert.match(r.json.texto, /Lo fija el servidor/);
    assert.equal(existsSync(w.fichero), false);
    assert.equal((await w.pedir("POST", "/funciones", { token: GESTOR, cuerpo: { funcion: "pesca", activa: false } })).status, 200, "the other functions are not pinned");
  } finally { await w.srv.close(); }
});

test("validation: unknown function 400, wrong types 400, bad JSON 400, too big 413, wrong verbs 405; a wrong funciones.json is 409 and left alone", async () => {
  const w = await mundo({ condiciones: CONDICIONES() });
  try {
    const t = { token: GESTOR };
    const x = await w.pedir("POST", "/funciones", { ...t, cuerpo: { funcion: "volar", activa: true } });
    assert.equal(x.status, 400); assert.equal(x.json.error, "desconocida");
    for (const c of [{}, { funcion: "pesca" }, { funcion: "pesca", activa: "si" }, { funcion: 3, activa: true }, [1], null]) {
      const y = await w.pedir("POST", "/funciones", { ...t, cuerpo: c }); assert.equal(y.status, 400, JSON.stringify(c)); assert.equal(y.json.error, "invalido");
    }
    assert.equal((await w.pedir("POST", "/funciones", { ...t, crudo: "{no json" })).json.error, "json");
    assert.equal((await w.pedir("POST", "/funciones", { ...t, cuerpo: { funcion: "pesca", activa: true, relleno: "x".repeat(2000) } })).status, 413);
    for (const m of ["PUT", "DELETE", "PATCH"]) assert.equal((await w.pedir(m, "/funciones", t)).status, 405, m);
    assert.equal(existsSync(w.fichero), false, "no refusal left a file");
  } finally { await w.srv.close(); }
  const roto = '{ "normas": "quizá" }';
  const m2 = await mundo({ condiciones: CONDICIONES(), funciones: roto });
  try {
    const r = await m2.pedir("POST", "/funciones", { token: GESTOR, cuerpo: { funcion: "pesca", activa: false } });
    assert.equal(r.status, 409); assert.equal(r.json.error, "fichero");
    assert.equal(readFileSync(m2.fichero, "utf8"), roto, "a wrong file is never overwritten");
  } finally { await m2.srv.close(); }
});

test("an old route list: the 404 of the server names /funciones; and other paths still reach the features", async () => {
  const w = await mundo({ condiciones: CONDICIONES() });
  try {
    const r = await w.pedir("GET", "/no-existe-esta");
    assert.equal(r.status, 404); assert.ok(r.json.hay.includes("/funciones"));
    assert.equal((await w.pedir("GET", "/funcionesx", { token: GESTOR })).status, 404, "only /funciones is the door");
  } finally { await w.srv.close(); }
});
