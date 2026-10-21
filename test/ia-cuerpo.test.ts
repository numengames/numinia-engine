// ia-visible S2: the body of an AI. The server dresses every AI in the house robot (Polybot) unless its pass picks another house
// avatar (`ia.cuerpo`); an AI cannot choose or keep its own; people are untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { emitirAgente, today } from "../packages/instance/src/identidad.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { encodePase } from "../packages/net/src/index.ts";
import { Cuerpo } from "../packages/agent/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import avatarServer from "../features/avatar/server.ts";
import avatarClient from "../features/avatar/client.ts";
import iaServer from "../features/ia/server.ts";
import chatServer from "../features/chat/server.ts";
import objetosServer from "../features/objetos/server.ts";
import { ROBOT_CASA } from "../features/avatar/feature.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const T0 = Date.parse("2026-10-16T10:00:00Z");
const SUB_A = `a_${"ab".repeat(16)}`;
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const RESPONDE = { comunidad: "La Torre", nombre: "Ana" };
const ROBOT = { tipo: "casa", modelo: ROBOT_CASA, sha: "", ext: "" };

function paseIA(t: number, o: Record<string, unknown> = {}): string {
  const s = Math.floor(t / 1000);
  const payload = { v: 1, iss: "numinia.com", aud: MUNDO, sub: SUB_A, org: "org-1", perm: ["enter-worlds", "build-in-worlds"], height: 0, roles: [{ name: "Constructora", color: "#112233" }], name: "Ada", kind: "agent", state: "activa", iat: s, exp: s + 600, ...o };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}

function mundo() {
  let ahora = T0;
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: firma, pase: { clave: CLAVE, mundo: MUNDO, org: "org-1" }, cerrar: (e) => inst.disconnect(e), ahora: () => ahora, log: () => {} });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, objetosServer, avatarServer, iaServer, roles.part], identitySign: firma, puede: (w, a) => roles.puede(w, a), credencial: roles.credencial, renovarPase: roles.renovar });
  const sesiones: { t: ReturnType<Instance["join"]>; s: ClientSession }[] = [];
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { for (const x of sesiones) x.t.flush(); inst.tick(); for (const x of sesiones) { x.t.flush(); x.s.tick(0, 0); } } };
  const unir = (pase?: string) => {
    const t = inst.join(sesiones.length), s = new ClientSession(t, { features: [avatarClient], identity: keeper(), ...(pase ? { pase } : {}) });
    sesiones.push({ t, s }); pump(3);
    return { t, s, e: s.entity };
  };
  const mirador = unir();
  return { inst, unir, pump, mirador, cuerpoDe: (e: number) => mirador.s.features.stateOf("avatar").get(String(e)), reloj: (ms: number) => { ahora = ms; }, renovar: (a: { t: ReturnType<Instance["join"]> }, token: string) => { a.t.send(encodePase(token)!, true); pump(3); } };
}

test("the robot of the house is Polybot: ROBOT_CASA is its index in the catalogue", () => {
  const cat = JSON.parse(readFileSync("activos/avatares/catalogo.json", "utf8")) as { modelos: { id: string; nombre: string }[] };
  assert.equal(cat.modelos[ROBOT_CASA]?.id, "polybot");
});

test("an organization AI wears the house robot, with or without an «ia» block", () => {
  const W = mundo();
  const A = W.unir(paseIA(T0));
  assert.deepEqual(W.cuerpoDe(A.e), ROBOT);
  const B = W.unir(paseIA(T0, { sub: `a_${"cd".repeat(16)}`, name: "Bea", ia: { responde: RESPONDE, burbuja: { forma: "esfera", radio: 4, visible: "siempre" } } }));
  assert.deepEqual(W.cuerpoDe(B.e), ROBOT);
});

test("an organization AI whose pass picks another house avatar wears that one; a fresh pass changes it live, and dropping the block returns to the robot", () => {
  const W = mundo();
  const A = W.unir(paseIA(T0, { ia: { responde: RESPONDE, cuerpo: { tipo: "casa", modelo: 1 } } }));
  assert.deepEqual(W.cuerpoDe(A.e), { tipo: "casa", modelo: 1, sha: "", ext: "" });
  W.reloj(T0 + 60_000);
  W.renovar(A, paseIA(T0 + 60_000, { ia: { responde: RESPONDE, cuerpo: { tipo: "casa", modelo: 0 } } }));
  assert.deepEqual(W.cuerpoDe(A.e), { tipo: "casa", modelo: 0, sha: "", ext: "" }, "index 0 is a real choice, not «none»");
  W.reloj(T0 + 120_000);
  W.renovar(A, paseIA(T0 + 120_000, { ia: { responde: RESPONDE } }));
  assert.deepEqual(W.cuerpoDe(A.e), ROBOT);
});

test("an AI cannot dress itself: its «elegir» is refused (announced) and the robot stays", () => {
  const W = mundo();
  const A = W.unir(paseIA(T0, { ia: { responde: RESPONDE } }));
  assert.equal(A.s.features.send("avatar", "elegir", { tipo: "casa", modelo: 0, sha: "", ext: "" }).ok, true);
  W.pump(3);
  assert.match(A.s.features.announcements.at(-1)?.text ?? "", /lo fija el mundo/);
  assert.deepEqual(W.cuerpoDe(A.e), ROBOT);
});

test("an inhabitant (agent ticket, no pass) also wears the robot", () => {
  const guests = signer("una-clave-de-prueba-larga"), agents = signer("otra-clave-de-agentes-larga");
  const NOW = Date.parse("2026-10-15T12:00:00Z");
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [avatarServer], identitySign: guests, now: () => NOW, agentes: { sign: agents, nombre: (id) => (id === "lia" ? "Lía" : null) } });
  const t = inst.join(0), s = new ClientSession(t, { features: [avatarClient], identity: keeper() });
  const hab = new Cuerpo(inst.join(0), emitirAgente(agents, "lia", today(NOW)));
  for (let i = 0; i < 4; i++) { t.flush(); hab.paso(); inst.tick(); t.flush(); s.tick(0, 0); }
  assert.deepEqual(s.features.stateOf("avatar").get(String(hab.entidad)), ROBOT);
  assert.equal(s.features.stateOf("avatar").get(String(s.entity)), undefined, "the person next to it keeps the world's default");
});

test("people are untouched: no entry until they choose, their choice works and an AI joining or renewing does not move it", () => {
  const W = mundo();
  const P = W.unir();
  assert.equal(W.cuerpoDe(P.e), undefined);
  assert.equal(P.s.features.send("avatar", "elegir", { tipo: "casa", modelo: 1, sha: "", ext: "" }).ok, true);
  W.pump(3);
  const A = W.unir(paseIA(T0, { ia: { responde: RESPONDE } }));
  W.reloj(T0 + 60_000);
  W.renovar(A, paseIA(T0 + 60_000, { ia: { responde: RESPONDE } }));
  assert.deepEqual(W.cuerpoDe(P.e), { tipo: "casa", modelo: 1, sha: "", ext: "" });
  assert.deepEqual(W.cuerpoDe(A.e), ROBOT);
});
