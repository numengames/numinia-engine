// /habitantes: GET/POST/DELETE manage this world's own AI inhabitants (camino A of «Add an AI»; camino B is an
// outside agent, agentes-http.ts). Real server on a free port, real fetch; the service reload is a spy here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../packages/server/src/server.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import type { ConfigPase } from "../packages/server/src/pase.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const ahoraS = () => Math.floor(Date.now() / 1000);
const carga = (o: Record<string, unknown> = {}) => ({
  v: 1, iss: "numinia.com", aud: MUNDO, sub: `p_${"a".repeat(32)}`, org: "org-1", perm: ["enter-worlds"], height: 0, roles: [], iat: ahoraS() - 5, exp: ahoraS() + 595, ...o,
});
function pase(payload: object = carga(), key: KeyObject = par.privateKey): string {
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), key))}`;
}
const GESTOR = pase(carga({ perm: ["enter-worlds", "manage-organization"] }));

const HABITANTE = (id: string, extra: Record<string, unknown> = {}) => ({
  formato: "habitante@1", id, nombre: "Nueva", descripcion: "una IA de prueba", responsable: "Pablo", escalon: 0,
  ruta: [{ x: 0, z: 0 }], pausa: 5, saludo: { radio: 3, cada: 60, frases: ["hola"] }, respuestas: [], siNoEntiende: "no te entiendo",
  ...extra,
});

async function mundo(o: { pase?: ConfigPase | null } = {}) {
  const aventura = mkdtempSync(join(tmpdir(), "habitantes-http-"));
  const log: string[] = [];
  const recargas: number[] = [];
  const srv = await startServer({
    port: 0, host: "127.0.0.1", statsMs: 60_000, aventura, secret: "una-clave-de-prueba-larga",
    pase: o.pase === undefined ? { clave: CLAVE, mundo: MUNDO } : o.pase, log: (l) => log.push(l), version: "prueba",
    recargarHabitantes: () => recargas.push(1),
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
  return { srv, aventura, log, recargas, pedir };
}

test("auth: no pass is 401, without manage-organization is 403, an owner passes", async () => {
  const w = await mundo();
  try {
    assert.equal((await w.pedir("GET", "/habitantes")).status, 401);
    assert.equal((await w.pedir("GET", "/habitantes", { token: pase() })).status, 403);
    assert.deepEqual((await w.pedir("GET", "/habitantes", { token: GESTOR })).json, { habitantes: [] });
    const dueno = await w.pedir("GET", "/habitantes", { token: pase(carga({ perm: [], height: Number.MAX_VALUE })) });
    assert.equal(dueno.status, 200);
  } finally { await w.srv.close(); }
});

test("a world with no pass configuration: the door is shut (fail closed)", async () => {
  const w = await mundo({ pase: null });
  try {
    for (const [m, r] of [["GET", "/habitantes"], ["POST", "/habitantes"], ["DELETE", "/habitantes/x"]] as const) {
      const x = await w.pedir(m, r, { token: GESTOR, cuerpo: m === "POST" ? HABITANTE("x") : undefined });
      assert.equal(x.status, 404, `${m} ${r}`); assert.equal(x.json.error, "habitantes-desactivado");
    }
    assert.equal(existsSync(join(w.aventura, "habitantes")), false);
  } finally { await w.srv.close(); }
});

test("add → list → remove round trip: the file in aventura/habitantes/, the service is told to reload each time", async () => {
  const w = await mundo();
  try {
    const r = await w.pedir("POST", "/habitantes", { token: GESTOR, cuerpo: HABITANTE("nueva") });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.ok, true);
    assert.deepEqual(r.json.habitante, { id: "nueva", nombre: "Nueva", escalon: 0 });
    const fichero = JSON.parse(readFileSync(join(w.aventura, "habitantes", "nueva.json"), "utf8"));
    assert.deepEqual([fichero.formato, fichero.id, fichero.nombre], ["habitante@1", "nueva", "Nueva"]);
    assert.deepEqual((await w.pedir("GET", "/habitantes", { token: GESTOR })).json, { habitantes: [{ id: "nueva", nombre: "Nueva", escalon: 0 }] });
    const otra = await w.pedir("POST", "/habitantes", { token: GESTOR, cuerpo: HABITANTE("nueva") });
    assert.equal(otra.status, 409); assert.match(otra.json.texto, /Ya hay un habitante/);
    const q = await w.pedir("DELETE", "/habitantes/nueva", { token: GESTOR });
    assert.equal(q.status, 200, JSON.stringify(q.json));
    assert.equal(existsSync(join(w.aventura, "habitantes", "nueva.json")), false);
    assert.deepEqual((await w.pedir("GET", "/habitantes", { token: GESTOR })).json, { habitantes: [] });
    const dos = await w.pedir("DELETE", "/habitantes/nueva", { token: GESTOR });
    assert.equal(dos.status, 404); assert.match(dos.json.texto, /No hay ningún habitante/);
    assert.equal(w.recargas.length, 2, "told to reload once per write, not on refusals or GET");
  } finally { await w.srv.close(); }
});

test("validation: bad JSON, missing or wrong-typed fields, wrong verbs and paths", async () => {
  const w = await mundo();
  try {
    const t = { token: GESTOR };
    assert.equal((await w.pedir("POST", "/habitantes", { ...t, crudo: "{no json" })).json.error, "json");
    for (const c of [{}, { formato: "habitante@1" }, HABITANTE("Mal id!"), { ...HABITANTE("x"), escalon: 9 }]) {
      const x = await w.pedir("POST", "/habitantes", { ...t, cuerpo: c }); assert.equal(x.status, 400, JSON.stringify(c)); assert.equal(x.json.error, "invalido");
    }
    assert.equal(existsSync(join(w.aventura, "habitantes")), false, "no refused inhabitant left a file");
    assert.equal((await w.pedir("PUT", "/habitantes", t)).status, 405);
    assert.equal((await w.pedir("DELETE", "/habitantes", t)).status, 405);
    assert.equal((await w.pedir("POST", "/habitantes/x", { ...t, cuerpo: {} })).status, 405);
    assert.equal((await w.pedir("GET", "/habitantes/x", t)).status, 405);
    assert.equal(w.recargas.length, 0, "never told to reload on a refusal");
  } finally { await w.srv.close(); }
});

test("one id, one kind of AI: an outside agent's id cannot also be an inhabitant", async () => {
  const aventura = mkdtempSync(join(tmpdir(), "habitantes-http-"));
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { nuevaPareja } = await import("../packages/agent/src/llave.ts");
  mkdirSync(join(aventura, "agentes"));
  writeFileSync(join(aventura, "agentes", "lia.json"), JSON.stringify({ formato: "agente@1", id: "lia", nombre: "Lía fuera", responsable: "Pablo", clave: nuevaPareja().publica }));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, aventura, pase: { clave: CLAVE, mundo: MUNDO }, log: (l) => log.push(l), version: "prueba", recargarHabitantes: () => {} });
  try {
    const r = await fetch(`http://127.0.0.1:${srv.port}/habitantes`, { method: "POST", headers: { authorization: `Bearer ${GESTOR}`, "content-type": "application/json" }, body: JSON.stringify(HABITANTE("lia")) });
    assert.equal(r.status, 409); assert.match((await r.json()).texto, /es un agente de fuera/);
  } finally { await srv.close(); }
});

// t_6c1f98aa (H3, «Add an AI» story 3): an inhabitant of escalón 4 BUILDS, so only a pass that may build can create one.
test("escalón 4 needs a pass that may build: manage-organization alone is refused (403, nothing written), build-in-worlds or an owner passes", async () => {
  const cerebro = { cerebro: { persona: "Una constructora tranquila" } };
  const w = await mundo();
  try {
    const sinConstruir = await w.pedir("POST", "/habitantes", { token: GESTOR, cuerpo: HABITANTE("obrera", { escalon: 4, ...cerebro }) });
    assert.equal(sinConstruir.status, 403, JSON.stringify(sinConstruir.json));
    assert.equal(sinConstruir.json.error, "sin-permiso"); assert.match(sinConstruir.json.texto, /build-in-worlds/);
    assert.equal(existsSync(join(w.aventura, "habitantes", "obrera.json")), false, "refused before any write");
    assert.equal(w.recargas.length, 0, "and the service is not told to reload");
    assert.ok(w.log.some((l) => l.includes("obrera") && l.includes("no puede construir")), "the refusal is in the log");
    // a lower escalón is not affected by the building rule
    assert.equal((await w.pedir("POST", "/habitantes", { token: GESTOR, cuerpo: HABITANTE("charla", { escalon: 2, ...cerebro }) })).status, 201);
    assert.equal((await w.pedir("POST", "/habitantes", { token: GESTOR, cuerpo: HABITANTE("guion") })).status, 201);
    // a pass with the building permission (and the management one) may
    const constructor = pase(carga({ perm: ["enter-worlds", "manage-organization", "build-in-worlds"] }));
    const ok = await w.pedir("POST", "/habitantes", { token: constructor, cuerpo: HABITANTE("obrera", { escalon: 4, ...cerebro }) });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.deepEqual(ok.json.habitante, { id: "obrera", nombre: "Nueva", escalon: 4 });
    assert.equal(JSON.parse(readFileSync(join(w.aventura, "habitantes", "obrera.json"), "utf8")).escalon, 4);
    // building alone does not manage inhabitants: the door's own permission is still asked first
    const soloConstruir = pase(carga({ perm: ["enter-worlds", "build-in-worlds"] }));
    assert.equal((await w.pedir("POST", "/habitantes", { token: soloConstruir, cuerpo: HABITANTE("otra", { escalon: 4, ...cerebro }) })).status, 403);
    // an owner passes without listing permissions
    const dueno = await w.pedir("POST", "/habitantes", { token: pase(carga({ perm: [], height: Number.MAX_VALUE })), cuerpo: HABITANTE("jefa", { escalon: 4, ...cerebro }) });
    assert.equal(dueno.status, 201, JSON.stringify(dueno.json));
    assert.deepEqual((await w.pedir("GET", "/habitantes", { token: GESTOR })).json.habitantes.map((h: { id: string }) => h.id).sort(), ["charla", "guion", "jefa", "obrera"]);
  } finally { await w.srv.close(); }
});
