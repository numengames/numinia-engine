// ADR-080 + H3b: numinia.com's owner panel manages a world's outside AI agents over HTTP (GET/POST /agentes, DELETE
// /agentes/<id>), authenticated by the world pass. Real server on a free port, real fetch, real WebSocket for presence.
// The chat order and the endpoint share one code path (roles.agentes): checked at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer, CIERRE_ROLES } from "../packages/server/src/server.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import type { ConfigPase } from "../packages/server/src/pase.ts";
import { ORIGEN_PANEL } from "../packages/server/src/agentes-http.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { Cuerpo } from "../packages/agent/src/index.ts";
import { firmarBillete, nuevaPareja, clavePrivada } from "../packages/agent/src/llave.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import { crearObjetos } from "../features/objetos/server.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza", DOMINIO = "mundo.prueba", ADMIN = "codigo-de-administracion-largo";
const ahoraS = () => Math.floor(Date.now() / 1000);
const carga = (o: Record<string, unknown> = {}) => ({
  v: 1, iss: "numinia.com", aud: MUNDO, sub: `p_${"a".repeat(32)}`, org: "org-1", perm: ["enter-worlds"], height: 0, roles: [], iat: ahoraS() - 5, exp: ahoraS() + 595, ...o,
});
function pase(payload: object = carga(), key: KeyObject = par.privateKey): string {
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), key))}`;
}
const GESTOR = pase(carga({ perm: ["enter-worlds", "manage-organization"] }));
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

async function mundo(o: { pase?: ConfigPase | null } = {}) {
  const aventura = mkdtempSync(join(tmpdir(), "agentes-http-"));
  const log: string[] = [];
  const srv = await startServer({
    port: 0, host: "127.0.0.1", statsMs: 60_000, features: [chatServer, crearObjetos()], aventura, admin: ADMIN, secret: "una-clave-de-prueba-larga",
    dominios: [DOMINIO], pase: o.pase === undefined ? { clave: CLAVE, mundo: MUNDO } : o.pase, log: (l) => log.push(l), version: "prueba",
  });
  const base = `http://127.0.0.1:${srv.port}`;
  const pedir = async (method: string, ruta: string, o2: { token?: string; cuerpo?: unknown; origen?: string; cab?: Record<string, string>; crudo?: string } = {}) => {
    const cab: Record<string, string> = { ...o2.cab };
    if (o2.token) cab.authorization = `Bearer ${o2.token}`;
    if (o2.origen) cab.origin = o2.origen;
    if (o2.cuerpo !== undefined || o2.crudo !== undefined) cab["content-type"] = "application/json";
    const r = await fetch(base + ruta, { method, headers: cab, body: o2.crudo ?? (o2.cuerpo === undefined ? undefined : JSON.stringify(o2.cuerpo)) });
    const txt = await r.text();
    let json: any = null; try { json = JSON.parse(txt); } catch { /* 204 */ }
    return { status: r.status, json, cab: r.headers };
  };
  return { srv, aventura, log, base, pedir, url: `ws://127.0.0.1:${srv.port}/ws` };
}
const nuevo = (id: string, extra: Record<string, unknown> = {}) => { const p = nuevaPareja(); return { ...p, cuerpo: { id, nombre: "Hermes", clave: p.publica, ...extra } }; };

test("auth matrix: no header, garbage, expired, wrong aud, wrong key, valid without permission, manage-organization, owner", async () => {
  const w = await mundo();
  try {
    const sin = await w.pedir("GET", "/agentes");
    assert.equal(sin.status, 401); assert.equal(sin.json.error, "sin-pase"); assert.match(sin.json.texto, /Authorization: Bearer/);
    assert.equal((await w.pedir("GET", "/agentes", { cab: { authorization: "Basic abc" } })).status, 401);
    const basura = await w.pedir("GET", "/agentes", { token: "esto.no.es-un-pase" });
    assert.equal(basura.status, 401); assert.ok(basura.json.error && basura.json.texto, "the verifier's reason and Spanish text");
    const caducado = await w.pedir("GET", "/agentes", { token: pase(carga({ perm: ["manage-organization"], iat: ahoraS() - 700, exp: ahoraS() - 100 })) });
    assert.equal(caducado.status, 401); assert.equal(caducado.json.error, "caducado"); assert.match(caducado.json.texto, /caduc/i);
    const otroMundo = await w.pedir("GET", "/agentes", { token: pase(carga({ perm: ["manage-organization"], aud: "otro-mundo" })) });
    assert.equal(otroMundo.status, 401); assert.equal(otroMundo.json.error, "mundo");
    const otraClave = await w.pedir("GET", "/agentes", { token: pase(carga({ perm: ["manage-organization"] }), generateKeyPairSync("ed25519").privateKey) });
    assert.equal(otraClave.status, 401);
    const sinPermiso = await w.pedir("GET", "/agentes", { token: pase(carga({ perm: ["enter-worlds", "build-in-worlds", "manage-roles"] })) });
    assert.equal(sinPermiso.status, 403); assert.equal(sinPermiso.json.error, "sin-permiso");
    assert.equal((await w.pedir("POST", "/agentes", { token: pase(), cuerpo: nuevo("hermes").cuerpo })).status, 403);
    assert.equal((await w.pedir("DELETE", "/agentes/hermes", { token: pase() })).status, 403);
    assert.deepEqual((await w.pedir("GET", "/agentes", { token: GESTOR })).json, { agentes: [] });
    const dueno = await w.pedir("GET", "/agentes", { token: pase(carga({ perm: [], height: Number.MAX_VALUE })) });
    assert.equal(dueno.status, 200, JSON.stringify(dueno.json));
    assert.ok(!w.log.some((l) => /eyJ/.test(l)), "no pass in the log");
  } finally { await w.srv.close(); }
});

test("a world with no pass configuration: the door is shut with a clear error, even with a pass", async () => {
  const w = await mundo({ pase: null });
  try {
    for (const [m, r] of [["GET", "/agentes"], ["POST", "/agentes"], ["DELETE", "/agentes/x"]] as const) {
      const x = await w.pedir(m, r, { token: GESTOR, cuerpo: m === "POST" ? nuevo("hermes").cuerpo : undefined });
      assert.equal(x.status, 404, `${m} ${r}`); assert.equal(x.json.error, "agentes-desactivado"); assert.match(x.json.texto, /MOTOR_PASE_CLAVE/);
    }
    assert.equal(existsSync(join(w.aventura, "agentes")), false, "nothing written");
  } finally { await w.srv.close(); }
});

test("add → list → remove round trip: the file in aventura/agentes/, the role, the permissions an AI gets", async () => {
  const w = await mundo();
  try {
    const { cuerpo: c2 } = nuevo("hermes");
    const r = await w.pedir("POST", "/agentes", { token: GESTOR, cuerpo: c2 });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.ok, true); assert.match(r.json.texto, /Hermes · IA/);
    assert.deepEqual(r.json.agente, { id: "hermes", nombre: "Hermes", rol: null, permisos: ["enter-worlds"], presente: false });
    const fichero = JSON.parse(readFileSync(join(w.aventura, "agentes", "hermes.json"), "utf8"));
    assert.deepEqual([fichero.formato, fichero.id, fichero.nombre, fichero.clave, fichero.responsable], ["agente@1", "hermes", "Hermes", c2.clave, `p_${"a".repeat(32)}`]);
    const lista = (await w.pedir("GET", "/agentes", { token: GESTOR })).json.agentes;
    assert.equal(lista.length, 1); assert.deepEqual([lista[0].id, lista[0].nombre, lista[0].presente], ["hermes", "Hermes", false]);
    assert.ok(Array.isArray(lista[0].permisos) && lista[0].permisos.every((p: string) => ["enter-worlds", "build-in-worlds"].includes(p)), "an AI never gets more than enter + build");
    const conRol = await w.pedir("POST", "/agentes", { token: GESTOR, cuerpo: nuevo("rolero", { rol: "Administración" }).cuerpo });
    assert.equal(conRol.status, 201, JSON.stringify(conRol.json));
    assert.deepEqual([conRol.json.agente.rol, conRol.json.agente.permisos], ["administracion", ["build-in-worlds", "enter-worlds"]], "a role is found by name; an AI keeps only enter + build of it");
    assert.equal((await w.pedir("DELETE", "/agentes/rolero", { token: GESTOR })).status, 200);
    const otra = await w.pedir("POST", "/agentes", { token: GESTOR, cuerpo: c2 });
    assert.equal(otra.status, 409); assert.match(otra.json.texto, /Ya hay un agente/);
    const q = await w.pedir("DELETE", "/agentes/hermes", { token: GESTOR });
    assert.equal(q.status, 200, JSON.stringify(q.json)); assert.match(q.json.texto, /ya no puede entrar/);
    assert.equal(existsSync(join(w.aventura, "agentes", "hermes.json")), false);
    assert.deepEqual((await w.pedir("GET", "/agentes", { token: GESTOR })).json, { agentes: [] });
    const dos = await w.pedir("DELETE", "/agentes/hermes", { token: GESTOR });
    assert.equal(dos.status, 404); assert.match(dos.json.texto, /No hay ningún agente/);
  } finally { await w.srv.close(); }
});

test("validation: bad JSON, missing or wrong-typed fields, bad id, bad key, a private key, unknown role, oversized body, wrong verbs and paths", async () => {
  const w = await mundo();
  try {
    const t = { token: GESTOR };
    const clave = nuevo("x").cuerpo.clave;
    assert.equal((await w.pedir("POST", "/agentes", { ...t, crudo: "{no json" })).json.error, "json");
    assert.equal((await w.pedir("POST", "/agentes", { ...t, crudo: "[]" })).json.error, "campos");
    for (const c of [{}, { id: "hermes" }, { id: "hermes", nombre: "H" }, { id: 7, nombre: "H", clave }, { id: "hermes", nombre: "H", clave, rol: 3 }]) {
      const x = await w.pedir("POST", "/agentes", { ...t, cuerpo: c }); assert.equal(x.status, 400, JSON.stringify(c)); assert.equal(x.json.error, "campos");
    }
    const mal = async (c: Record<string, unknown>, re: RegExp) => { const x = await w.pedir("POST", "/agentes", { ...t, cuerpo: c }); assert.equal(x.status, 400, JSON.stringify(x.json)); assert.match(x.json.texto, re); };
    await mal({ id: "Hermes Pablo!", nombre: "H", clave }, /No lo añado/);
    await mal({ id: "hermes", nombre: "Hermes · IA", clave }, /No lo añado/);
    await mal({ id: "hermes", nombre: "H", clave: "ed25519:corta" }, /No lo añado/);
    await mal({ id: "hermes", nombre: "H", clave: nuevaPareja().privadaPem }, /No lo añado/);
    await mal({ id: "hermes", nombre: "H", clave, rol: "reina del mundo" }, /¿Qué rol\?/);
    assert.equal((await w.pedir("POST", "/agentes", { ...t, cuerpo: { id: "hermes", nombre: "H", clave, relleno: "x".repeat(5000) } })).status, 413);
    assert.equal(existsSync(join(w.aventura, "agentes")), false, "no refused agent left a file");
    assert.equal((await w.pedir("PUT", "/agentes", t)).status, 405);
    assert.equal((await w.pedir("DELETE", "/agentes", t)).status, 405);
    assert.equal((await w.pedir("POST", "/agentes/hermes", { ...t, cuerpo: {} })).status, 405);
    assert.equal((await w.pedir("GET", "/agentes/hermes", t)).status, 405);
    assert.equal((await w.pedir("DELETE", "/agentes/%E0%A4%A", t)).status, 400, "a broken escape in the id");
    assert.equal((await w.pedir("GET", "/agentes/", t)).status, 200, "trailing slash");
  } finally { await w.srv.close(); }
});

test("CORS: numinia.com is answered (also on errors), any other origin gets no CORS header, preflight answers without a pass, never *", async () => {
  const w = await mundo();
  try {
    const bien = await w.pedir("GET", "/agentes", { token: GESTOR, origen: ORIGEN_PANEL });
    assert.equal(ORIGEN_PANEL, "https://numinia.com");
    assert.equal(bien.cab.get("access-control-allow-origin"), "https://numinia.com");
    assert.match(bien.cab.get("vary") ?? "", /Origin/);
    assert.equal((await w.pedir("GET", "/agentes", { origen: ORIGEN_PANEL })).cab.get("access-control-allow-origin"), "https://numinia.com", "a 401 is readable by the panel");
    for (const o of ["https://evil.example", "http://numinia.com", "https://numinia.com.evil.example", "https://www.numinia.com", "null"]) {
      for (const [m, tok] of [["GET", GESTOR], ["GET", undefined]] as const) {
        const x = await w.pedir(m, "/agentes", { token: tok, origen: o });
        assert.equal(x.cab.get("access-control-allow-origin"), null, `${o} ${x.status}`);
        assert.equal(x.cab.get("access-control-allow-credentials"), null);
      }
      const pf = await w.pedir("OPTIONS", "/agentes", { origen: o, cab: { "access-control-request-method": "POST" } });
      assert.equal(pf.status, 204); assert.equal(pf.cab.get("access-control-allow-origin"), null); assert.equal(pf.cab.get("access-control-allow-methods"), null);
    }
    assert.equal((await w.pedir("GET", "/agentes", { token: GESTOR })).cab.get("access-control-allow-origin"), null, "no Origin header (curl, other servers): none");
    for (const ruta of ["/agentes", "/agentes/hermes"]) {
      const pf = await w.pedir("OPTIONS", ruta, { origen: ORIGEN_PANEL, cab: { "access-control-request-method": "DELETE", "access-control-request-headers": "authorization" } });
      assert.equal(pf.status, 204);
      assert.equal(pf.cab.get("access-control-allow-origin"), "https://numinia.com");
      assert.equal(pf.cab.get("access-control-allow-methods"), "GET,POST,DELETE,OPTIONS");
      assert.match(pf.cab.get("access-control-allow-headers") ?? "", /Authorization/i); assert.match(pf.cab.get("access-control-allow-headers") ?? "", /Content-Type/i);
    }
    // the same on a CORS-closed world: the panel can read why
    const cerrado = await mundo({ pase: null });
    try { assert.equal((await cerrado.pedir("GET", "/agentes", { origen: ORIGEN_PANEL })).cab.get("access-control-allow-origin"), "https://numinia.com"); } finally { await cerrado.srv.close(); }
    assert.equal((await w.pedir("GET", "/status", {})).cab.get("access-control-allow-origin"), "*", "/status keeps its own public rule");
  } finally { await w.srv.close(); }
});

test("presence: an agent connected now is «presente»; DELETE closes it with 4003; the chat order does the same through the same function", async () => {
  const w = await mundo();
  try {
    const a = nuevo("hermes"), b = nuevo("atenea", { nombre: "Atenea" });
    assert.equal((await w.pedir("POST", "/agentes", { token: GESTOR, cuerpo: a.cuerpo })).status, 201);
    // hermes enters with a signed a2 ticket on a real WebSocket
    const entrar = async (id: string, pem: string) => {
      const t = webSocketClient(w.url), c = new Cuerpo(t, firmarBillete({ id, privada: clavePrivada(pem), mundo: DOMINIO }));
      const reloj = setInterval(() => c.paso(), 50);
      await t.opened;
      for (let i = 0; i < 60 && !c.s.who; i++) await espera(50);
      assert.ok(c.s.who, `${id} got its identity`);
      return { t, c, parar: () => clearInterval(reloj) };
    };
    const h = await entrar("hermes", a.privadaPem);
    try {
      const lista = (await w.pedir("GET", "/agentes", { token: GESTOR })).json.agentes;
      assert.equal(lista[0].presente, true);
      const cierre = h.t.closed;
      const q = await w.pedir("DELETE", "/agentes/hermes", { token: GESTOR });
      assert.equal(q.status, 200);
      const c = await Promise.race([cierre, espera(5000).then(() => null)]);
      assert.ok(c, "the connection was closed"); assert.equal(c!.code, CIERRE_ROLES); assert.equal(CIERRE_ROLES, 4003);
      assert.equal((await w.pedir("GET", "/agentes", { token: GESTOR })).json.agentes.length, 0);
    } finally { h.parar(); h.t.close(); }

    // the chat order, from an owner by /dueño: same function, same file, same list
    assert.equal((await w.pedir("POST", "/agentes", { token: GESTOR, cuerpo: a.cuerpo })).status, 201);
    const t = webSocketClient(w.url), chat = crearCliente();
    const s = new ClientSession(t, { features: [chat.part], identity: keeper(), view: { label() {}, bounce() {} } });
    await t.opened;
    for (let i = 0; i < 40 && !s.who; i++) await espera(50);
    assert.deepEqual(chat.chat.decir(`/dueño ${ADMIN}`), { ok: true }); await espera(1200);
    assert.deepEqual(chat.chat.decir(`/agente añadir atenea Atenea ${b.cuerpo.clave}`), { ok: true });
    await espera(1300);
    const ids = (await w.pedir("GET", "/agentes", { token: GESTOR })).json.agentes.map((x: { id: string }) => x.id).sort();
    assert.deepEqual(ids, ["atenea", "hermes"], "added by the order, seen by the endpoint");
    assert.equal((await w.pedir("POST", "/agentes", { token: GESTOR, cuerpo: b.cuerpo })).status, 409, "the endpoint sees what the order wrote");
    assert.deepEqual(chat.chat.decir("/agente quitar atenea"), { ok: true }); await espera(1300);
    assert.deepEqual((await w.pedir("GET", "/agentes", { token: GESTOR })).json.agentes.map((x: { id: string }) => x.id), ["hermes"], "removed by the order");
    assert.ok(w.log.some((l) => /añade el agente de fuera «atenea»/.test(l)) && w.log.some((l) => /quita el agente de fuera «atenea»/.test(l)), "one log line each, from the shared function");
    // refusals read the same in both doors
    const dup = await w.pedir("POST", "/agentes", { token: GESTOR, cuerpo: { ...b.cuerpo, id: "hermes" } });
    assert.match(dup.json.texto, /No lo añado: Ya hay un agente «hermes»/);
    t.close();
  } finally { await w.srv.close(); }
});
