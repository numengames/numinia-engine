// ia-organizacion: an AI of a numinia.com organization enters a world with a pass (kind "agent") and lives only while that pass is
// valid: closed (4003 path: roles' `cerrar`) at `exp` unless a fresh PASE arrived; a mid-session PASE renews it and applies the
// new permissions (asleep = no building). Pure world, no network: the passes are signed here with a generated key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { encodePase, PASE_MAX, WS_FRAME_MAX } from "../packages/net/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import objetosServer from "../features/objetos/server.ts";
import chatServer from "../features/chat/server.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const T0 = Date.parse("2026-10-16T10:00:00Z");
const SUB_A = `a_${"ab".repeat(16)}`, SUB_B = `a_${"cd".repeat(16)}`;

/** An AI's pass issued at `t` ms, valid 10 minutes, the way numinia.com signs it. */
function paseIA(t: number, o: Record<string, unknown> = {}): string {
  const s = Math.floor(t / 1000);
  const payload = {
    v: 1, iss: "numinia.com", aud: MUNDO, sub: SUB_A, org: "org-1", perm: ["enter-worlds", "build-in-worlds"], height: 0, roles: [{ name: "Constructora", color: "#112233" }],
    name: "Ada", kind: "agent", state: "activa", iat: s, exp: s + 600, ...o,
  };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}

function mundo() {
  let ahora = T0;
  const log: string[] = [], cerradas: number[] = [];
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: firma, pase: { clave: CLAVE, mundo: MUNDO, org: "org-1" }, cerrar: (e) => { cerradas.push(e); inst.disconnect(e); }, ahora: () => ahora, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, objetosServer, roles.part], log: (l) => log.push(l), identitySign: firma, puede: (w, a) => roles.puede(w, a), credencial: roles.credencial, renovarPase: roles.renovar });
  const gente: ReturnType<Instance["join"]>[] = [];
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { for (const t of gente) t.flush(); inst.tick(); for (const t of gente) t.flush(); } };
  const entrar = (token: string): { t: ReturnType<Instance["join"]>; e: number } => {
    const t = inst.join(gente.length); gente.push(t); pump(2);
    const e = inst.conns.at(-1)!.entity;
    inst.identificar(e, "", token); pump(2);
    return { t, e };
  };
  const enviarPase = (t: ReturnType<Instance["join"]>, token: string) => { t.send(encodePase(token)!, true); pump(2); };
  const quien = (e: number) => inst.who(e)!;
  return { inst, roles, entrar, enviarPase, pump, quien, log, cerradas, reloj: (ms: number) => { ahora = ms; } };
}

test("pase IA: enters as «ia-a_…», name + « · IA», enter + build only, never an owner, listed as an organization AI", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0, { perm: ["enter-worlds", "build-in-worlds", "manage-organization"], height: Number.MAX_VALUE }));
  assert.deepEqual({ id: W.quien(A.e).id, nombre: W.quien(A.e).nombre, ia: W.quien(A.e).ia }, { id: `ia-${SUB_A}`, nombre: "Ada · IA", ia: true });
  assert.equal(W.roles.puede(W.quien(A.e), "construir"), true);
  assert.equal(W.roles.puede(W.quien(A.e), "ajustar"), false, "an AI never manages the world, whatever its pass lists");
  assert.equal(W.roles.acceso(`ia-${SUB_A}`).dueno, false);
  assert.equal(W.roles.acceso(`ia-${SUB_A}`).altura, 0, "an owner-sized height is just the base for an AI");
  assert.deepEqual(W.roles.agentes!.listar().map(({ id, nombre, rol, presente, organizacion, estado }) => ({ id, nombre, rol, presente, organizacion, estado })),
    [{ id: SUB_A, nombre: "Ada", rol: "Constructora", presente: true, organizacion: true, estado: "activa" }]);
  W.inst.disconnect(A.e);
  assert.deepEqual(W.roles.agentes!.listar(), [], "gone when it leaves");
  assert.equal(W.roles.puede({ id: `ia-${SUB_A}`, nombre: "x" }, "construir"), false, "no pass kept for an AI that left");
});

test("pase IA: asleep never builds, even if the pass lists build-in-worlds", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0, { state: "dormida", perm: ["enter-worlds", "build-in-worlds"] }));
  assert.equal(W.roles.puede(W.quien(A.e), "construir"), false);
  assert.equal(W.roles.agentes!.listar()[0].estado, "dormida");
});

test("pase IA: closed when its pass ends without a fresh PASE; the minute before it is still in", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0));
  W.reloj(T0 + 599_000); W.pump(2);
  assert.deepEqual(W.cerradas, []);
  W.reloj(T0 + 600_000); W.pump(2);
  assert.deepEqual(W.cerradas, [A.e]);
  assert.ok(W.log.some((l) => l.includes("caducó sin renovar")));
});

test("pase IA: a fresh PASE in mid-session renews exp and applies the new permissions; asleep drops building", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0));
  assert.equal(W.roles.puede(W.quien(A.e), "construir"), true);
  W.reloj(T0 + 480_000);
  W.enviarPase(A.t, paseIA(T0 + 480_000, { state: "dormida", perm: ["enter-worlds"] }));
  assert.equal(W.roles.puede(W.quien(A.e), "construir"), false, "dormida: the new pass applies at once");
  W.reloj(T0 + 700_000); W.pump(2);
  assert.deepEqual(W.cerradas, [], "the first pass would have ended at +600 s; the renewal lives to +1080 s");
  W.reloj(T0 + 1_080_000); W.pump(2);
  assert.deepEqual(W.cerradas, [A.e]);
  // and back: awake again builds
  const B = W.entrar(paseIA(T0 + 1_080_000, { sub: SUB_B, name: "Bea" }));
  W.reloj(T0 + 1_090_000);
  W.enviarPase(B.t, paseIA(T0 + 1_090_000, { sub: SUB_B, name: "Bea", state: "dormida", perm: ["enter-worlds"] }));
  W.reloj(T0 + 1_100_000);
  W.enviarPase(B.t, paseIA(T0 + 1_100_000, { sub: SUB_B, name: "Bea", state: "activa" }));
  assert.equal(W.roles.puede(W.quien(B.e), "construir"), true);
});

test("pase IA: a renewal that is for another agent, older, expired, tampered or a person's is refused and the old pass stands", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0));
  W.reloj(T0 + 5_000);
  const malas = [paseIA(T0 + 5_000, { sub: SUB_B }), paseIA(T0 - 30_000), paseIA(T0 - 700_000), paseIA(T0 + 5_000, { org: "org-2" }), paseIA(T0 + 5_000, { aud: "otro" }),
    paseIA(T0 + 5_000).replace(/\.[^.]+$/, ".AAAA"),
    paseIA(T0 + 5_000, { sub: `p_${"ab".repeat(16)}`, kind: undefined, state: undefined })];
  for (const m of malas) W.enviarPase(A.t, m);
  assert.equal(W.log.filter((l) => l.includes("renovación rechazada")).length, malas.length);
  W.reloj(T0 + 600_000); W.pump(2);
  assert.deepEqual(W.cerradas, [A.e], "nothing extended its life");
});

test("pase IA: renewals come at most once a second; a connection that is not an org AI cannot renew", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0));
  W.enviarPase(A.t, paseIA(T0));
  assert.ok(W.log.some((l) => l.includes("demasiado seguidas")));
  const persona = W.inst.join(9); W.pump(2);
  const e = W.inst.conns.at(-1)!.entity;
  W.inst.identificar(e, "", "");
  persona.send(encodePase(paseIA(T0))!, true); W.pump(2);
  assert.ok(W.inst.conns.find((c) => c.entity === e)!.bad > 0, "a late PASE on a guest is counted as before");
});

test("pase IA: one connection per agent: entering again from elsewhere closes the older one", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0));
  const B = W.entrar(paseIA(T0 + 1000));
  assert.deepEqual(W.cerradas, [A.e]);
  assert.equal(W.roles.puede(W.quien(B.e), "construir"), true, "the new one keeps the pass");
  assert.equal(W.roles.agentes!.listar().length, 1);
});

test("pase IA: size — an AI's pass is short; even the worst one numinia.com can issue fits PASE_MAX", () => {
  const corto = paseIA(T0);
  const ids = ["enter-worlds", "build-in-worlds"];
  const peor = paseIA(T0, { perm: ids, name: "語".repeat(40), org: "00000000-0000-0000-0000-000000000000", roles: Array.from({ length: 5 }, () => ({ name: "語".repeat(40), color: "#112233" })) });
  console.log(`[ia-org] pass bytes: typical (1 role, short name) ${corto.length} · worst (5 roles of 40 three-byte chars, 40-char name) ${peor.length} · old frame ${WS_FRAME_MAX} · PASE_MAX ${PASE_MAX}`);
  assert.ok(corto.length + 1 <= WS_FRAME_MAX, "a typical AI pass fits even the old frame");
  assert.ok(peor.length + 1 <= PASE_MAX);
  assert.ok(encodePase(peor) !== null);
});
