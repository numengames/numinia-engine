// H3b: numinia.com's world pass (contract: numinia-web apps/store/src/lib/world-pass.ts). Pure verifier + config,
// with a key pair generated here (never numinia.com's real key).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { configPase, leerClave, verificarPase } from "../packages/server/src/pase.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const rawDe = (k: KeyObject): Buffer => Buffer.from(k.export({ format: "jwk" }).x as string, "base64url");
const RAW = b64(rawDe(par.publicKey));
const KID = createHash("sha256").update(rawDe(par.publicKey)).digest("hex").slice(0, 8);
const AHORA = 1_790_000_000;
const SUB = `p_${"ab".repeat(16)}`;
const carga = (o: Record<string, unknown> = {}) => ({
  v: 1, iss: "numinia.com", aud: "agora-plaza", sub: SUB, org: "org-1", perm: ["enter-worlds", "build-in-worlds"], height: 3,
  roles: [{ name: "Guardia", color: "#aabbcc" }], name: "Lía", iat: AHORA - 5, exp: AHORA + 595, ...o,
});
/** A compact JWS the way numinia.com makes it. */
function pase(payload: object = carga(), header: object = { alg: "EdDSA", typ: "numinia-world-pass", kid: KID }, key: KeyObject = par.privateKey): string {
  const firmado = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), key))}`;
}
const clave = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const en = { aud: "agora-plaza", now: AHORA };

test("pase: a good pass gives the person, permissions, height, roles and name", () => {
  const v = verificarPase(pase(), clave, en);
  assert.ok(v.ok);
  assert.equal(v.pase.sub, SUB);
  assert.deepEqual(v.pase.permisos, ["enter-worlds", "build-in-worlds"]);
  assert.equal(v.pase.altura, 3);
  assert.equal(v.pase.dueno, false);
  assert.deepEqual(v.pase.roles, [{ nombre: "Guardia", color: "#aabbcc" }]);
  assert.equal(v.pase.nombre, "Lía");
});

test("pase: unknown permission ids are dropped, not fatal; no name = none; the house and owners keep their height", () => {
  const v = verificarPase(pase(carga({ perm: ["enter-worlds", "download-world", "fly-to-the-moon"], name: undefined })), clave, en);
  assert.ok(v.ok);
  assert.deepEqual(v.pase.permisos, ["enter-worlds"]);
  assert.equal(v.pase.nombre, undefined);
  const casa = verificarPase(pase(carga({ height: Number.MAX_SAFE_INTEGER })), clave, en);
  assert.ok(casa.ok && !casa.pase.dueno && casa.pase.altura === Number.MAX_SAFE_INTEGER);
  const dueno = verificarPase(pase(carga({ height: Number.MAX_VALUE })), clave, en);
  assert.ok(dueno.ok && dueno.pase.dueno && dueno.pase.altura === Infinity, "numinia.com says an owner as Number.MAX_VALUE (JSON has no Infinity)");
});

test("pase: a name is cleaned and can never pose as an AI inhabitant", () => {
  const v = verificarPase(pase(carga({ name: "  Bruno\u0007  · IA " })), clave, en);
  assert.ok(v.ok);
  assert.equal(v.pase.nombre, "Bruno");
  const largo = verificarPase(pase(carga({ name: "x".repeat(100) })), clave, en);
  assert.ok(largo.ok && largo.pase.nombre?.length === 40);
});

test("pase: tampered payload, wrong signing key and a cut signature fail on the signature", () => {
  const [h, , s] = pase().split(".");
  const otro = `${h}.${b64(JSON.stringify(carga({ perm: ["manage-organization"] })))}.${s}`;
  assert.deepEqual(motivo(otro), "firma");
  assert.deepEqual(motivo(pase(carga(), undefined, generateKeyPairSync("ed25519").privateKey)), "firma");
  assert.deepEqual(motivo(pase().slice(0, -4)), "firma");
});

test("pase: expired, issued in the future (60 s skew allowed), wrong world, wrong organization", () => {
  assert.equal(motivo(pase(carga({ iat: AHORA - 700, exp: AHORA - 100 }))), "caducado");
  assert.ok(verificarPase(pase(carga({ iat: AHORA + 50, exp: AHORA + 650 })), clave, en).ok, "within the 60 s skew");
  assert.equal(motivo(pase(carga({ iat: AHORA + 61, exp: AHORA + 661 }))), "adelantado");
  assert.equal(motivo(pase(carga({ aud: "otro-mundo" }))), "mundo", "a pass is for one world: a replay elsewhere fails");
  assert.equal(verificarPase(pase(), clave, { ...en, org: "org-1" }).ok, true);
  assert.equal(motivo(pase(), { ...en, org: "org-2" }), "organizacion");
});

test("pase: wrong kid, wrong alg (none, HS256), wrong typ", () => {
  assert.equal(motivo(pase(carga(), { alg: "EdDSA", typ: "numinia-world-pass", kid: "00000000" })), "clave");
  assert.equal(motivo(pase(carga(), { alg: "none", typ: "numinia-world-pass", kid: KID })), "cabecera");
  assert.equal(motivo(pase(carga(), { alg: "HS256", typ: "numinia-world-pass", kid: KID })), "cabecera");
  assert.equal(motivo(pase(carga(), { alg: "EdDSA", typ: "JWT", kid: KID })), "cabecera");
  const sinFirma = `${b64(JSON.stringify({ alg: "none", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(carga()))}.`;
  assert.equal(motivo(sinFirma), "cabecera", "the unsigned «alg: none» trick");
});

test("pase: a signed payload of the wrong shape is refused (extra field, wrong types, bad sub, too many roles)", () => {
  for (const mala of [carga({ extra: 1 }), carga({ v: 2 }), carga({ iss: "evil.com" }), carga({ sub: "wallet-0xabc" }), carga({ perm: "enter-worlds" }),
    carga({ height: "3" }), carga({ roles: Array.from({ length: 6 }, () => ({ name: "r", color: null })) }), carga({ roles: [{ name: 1, color: null }] }), carga({ exp: "x" })]) {
    assert.equal(motivo(pase(mala)), "contenido", JSON.stringify(mala).slice(0, 60));
  }
  const { sub: _, ...sinSub } = carga();
  assert.equal(motivo(pase(sinSub)), "contenido");
});

test("pase: garbage never throws and always says how to fix it", () => {
  for (const basura of ["", "a", "a.b", "a.b.c.d", "…", "???.???.???", "x".repeat(5000), "e30.e30.e30", `${b64("{")}.${b64("{")}.${b64("x")}`]) {
    const v = verificarPase(basura, clave, en);
    assert.ok(!v.ok, basura.slice(0, 20));
    if (!v.ok) assert.match(v.texto, /numinia\.com/, "tells the person where to get a fresh one");
  }
});

test("pase: the public key is read raw or as numinia.com's JSON document; a bad one says what to fix", () => {
  assert.ok(leerClave(RAW).ok);
  const doc = leerClave(JSON.stringify({ alg: "Ed25519", kid: KID, publicKey: RAW }));
  assert.ok(doc.ok && doc.value.kid === KID);
  for (const mala of ["", "corto", "!!!", b64(Buffer.alloc(31)), b64(Buffer.alloc(33)), JSON.stringify({ alg: "RS256", kid: KID, publicKey: RAW }), JSON.stringify({ alg: "Ed25519", kid: "deadbeef", publicKey: RAW }), "{no json"]) {
    const r = leerClave(mala);
    assert.ok(!r.ok, mala);
    if (!r.ok) assert.ok(r.issues[0].message.length > 20, "says what to fix");
  }
});

test("pase: config — without the key the engine ignores passes; with it, the world id is needed; invalid = refuse to start", () => {
  assert.deepEqual(configPase({}), { ok: true, pase: null });
  assert.deepEqual(configPase({ MOTOR_PASE_CLAVE: "  " }), { ok: true, pase: null }, "an empty variable (the fleet's template) = not set");
  const sinMundo = configPase({ MOTOR_PASE_CLAVE: RAW });
  assert.ok(!sinMundo.ok && /MOTOR_PASE_MUNDO/.test(sinMundo.error));
  const mala = configPase({ MOTOR_PASE_CLAVE: "corto", MOTOR_PASE_MUNDO: "agora-plaza" });
  assert.ok(!mala.ok && /MOTOR_PASE_CLAVE/.test(mala.error));
  const rara = configPase({ MOTOR_PASE_CLAVE: RAW, MOTOR_PASE_MUNDO: "Mundo Con Espacios" });
  assert.ok(!rara.ok && /MOTOR_PASE_MUNDO/.test(rara.error));
  const buena = configPase({ MOTOR_PASE_CLAVE: RAW, MOTOR_PASE_MUNDO: "agora-plaza", MOTOR_PASE_ORG: "org-1" });
  assert.ok(buena.ok && buena.pase?.mundo === "agora-plaza" && buena.pase.org === "org-1" && buena.pase.clave.kid === KID);
});

function motivo(token: string, extra: { org?: string } = {}): string {
  const v = verificarPase(token, clave, { ...en, ...extra });
  return v.ok ? "ok" : v.motivo;
}
