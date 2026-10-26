// ia-visible S3: the public card of every AI in the world — state, who answers (D-084), what it may do — decided by the server and
// published in the «ia» feature's shared state; the page's accessor (features/ia/client.ts) reads it. People never have one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { encodePase } from "../packages/net/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import objetosServer from "../features/objetos/server.ts";
import chatServer from "../features/chat/server.ts";
import iaServer from "../features/ia/server.ts";
import { crearIAPagina } from "../features/ia/client.ts";
import { Cuerpo } from "../packages/agent/src/index.ts";
import { emitirAgente, today } from "../packages/instance/src/identidad.ts";
import { publica } from "../features/ia/feature.ts";
import iaFeatures from "../features/servidor.ts";
import iaClientes from "../features/cliente.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const T0 = Date.parse("2026-10-16T10:00:00Z");
const SUB_A = `a_${"ab".repeat(16)}`;
const CARTERA = `0x12${"cd".repeat(18)}ab`;
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

function paseIA(t: number, o: Record<string, unknown> = {}): string {
  const s = Math.floor(t / 1000);
  const payload = { v: 1, iss: "numinia.com", aud: MUNDO, sub: SUB_A, org: "org-1", perm: ["enter-worlds", "build-in-worlds"], height: 0, roles: [{ name: "Constructora", color: "#112233" }], name: "Ada", kind: "agent", state: "activa", iat: s, exp: s + 600, ...o };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}

function mundo() {
  let ahora = T0;
  const log: string[] = [];
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: firma, pase: { clave: CLAVE, mundo: MUNDO, org: "org-1" }, cerrar: (e) => inst.disconnect(e), ahora: () => ahora, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, objetosServer, iaServer, roles.part], log: (l) => log.push(l), identitySign: firma, puede: (w, a) => roles.puede(w, a), credencial: roles.credencial, renovarPase: roles.renovar });
  const gente: ReturnType<Instance["join"]>[] = [];
  const pagina = crearIAPagina();
  const t = inst.join(0), mirador = new ClientSession(t, { features: [pagina.part], identity: keeper() });
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { for (const g of gente) g.flush(); t.flush(); inst.tick(); t.flush(); mirador.tick(0, 0); for (const g of gente) g.flush(); } };
  pump(2);
  const entrar = (token: string) => {
    const c = inst.join(gente.length); gente.push(c); pump(2);
    const e = inst.conns.at(-1)!.entity;
    inst.identificar(e, "", token); pump(2);
    return { t: c, e };
  };
  const enviarPase = (c: ReturnType<Instance["join"]>, token: string) => { c.send(encodePase(token)!, true); pump(2); };
  return { inst, roles, pagina, mirador, entrar, enviarPase, pump, log, reloj: (ms: number) => { ahora = ms; }, estado: () => mirador.features.stateOf("ia") };
}

const RESPONDE = { comunidad: "La Torre", nombre: "Ana", cartera: CARTERA };

test("ia pública: an AI whose pass says who answers shows state, community + name + short wallet, and that it builds", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0, { ia: { responde: RESPONDE } }));
  assert.deepEqual(W.pagina.de(A.e), { estado: "activa", responde: { comunidad: "La Torre", nombre: "Ana", cartera: "0x12…ab" }, puede: { construir: true }, atenta: false, tamano: "desconocido" });
  assert.equal(W.pagina.es(A.e), true);
  assert.ok(!JSON.stringify([...W.estado()]).includes(CARTERA.slice(6)), "the full address never reaches a page");
  assert.deepEqual(W.pagina.lista(), [{ quien: A.e, ia: W.pagina.de(A.e) }]);
  assert.equal(W.pagina.de(W.mirador.entity), null, "a person has no card");
  assert.equal(W.pagina.es(W.mirador.entity), false);
  assert.equal(W.pagina.de(9999), null);
});

test("ia pública: a wallet without a name is shown short; a name without a wallet shows only the name", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0, { ia: { responde: { comunidad: "La Torre", cartera: CARTERA } } }));
  assert.deepEqual(W.pagina.de(A.e)?.responde, { comunidad: "La Torre", cartera: "0x12…ab" });
  W.inst.disconnect(A.e); W.pump(2);
  const B = W.entrar(paseIA(T0 + 2000, { ia: { responde: { comunidad: "La Torre", nombre: "Ana" } } }));
  assert.deepEqual(W.pagina.de(B.e)?.responde, { comunidad: "La Torre", nombre: "Ana" });
});

test("ia pública: an AI without an «ia» block still has a minimal card (it is an AI): state and abilities, nobody listed as answering", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0));
  assert.deepEqual(W.pagina.de(A.e), { estado: "activa", puede: { construir: true }, atenta: false, tamano: "desconocido" });
  const B = W.entrar(paseIA(T0, { sub: `a_${"cd".repeat(16)}`, perm: ["enter-worlds"], name: "Bea" }));
  assert.deepEqual(W.pagina.de(B.e), { estado: "activa", puede: { construir: false }, atenta: false, tamano: "desconocido" }, "no build permission in its pass = does not build");
  assert.deepEqual(W.pagina.lista().map((x) => x.quien), [A.e, B.e].sort((x, y) => x - y));
});

test("ia pública: asleep says «dormida» and never builds, whatever the pass lists; a fresh pass in mid-session updates it for everyone", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0, { state: "dormida", ia: { responde: RESPONDE } }));
  assert.deepEqual(W.pagina.de(A.e)?.estado, "dormida");
  assert.equal(W.pagina.de(A.e)?.puede.construir, false);
  const visto: (string | null)[] = [];
  W.pagina.alCambiar((q, f) => { if (q === A.e) visto.push(f?.estado ?? null); });
  W.reloj(T0 + 60_000);
  W.enviarPase(A.t, paseIA(T0 + 60_000, { state: "activa", ia: { responde: { comunidad: "La Torre", nombre: "Otra" } } }));
  assert.deepEqual(W.pagina.de(A.e), { estado: "activa", responde: { comunidad: "La Torre", nombre: "Otra" }, puede: { construir: true }, atenta: false, tamano: "desconocido" });
  assert.deepEqual(visto, ["activa"]);
  W.reloj(T0 + 120_000);
  W.enviarPase(A.t, paseIA(T0 + 120_000, { state: "dormida", ia: { responde: RESPONDE } }));
  assert.equal(W.pagina.de(A.e)?.estado, "dormida");
  assert.equal(W.pagina.de(A.e)?.puede.construir, false);
});

test("ia pública: the card goes when the AI leaves; people's entities never appear in the feature's state", () => {
  const W = mundo();
  const A = W.entrar(paseIA(T0, { ia: { responde: RESPONDE } }));
  const otra = W.entrar(""); // a guest
  assert.deepEqual([...W.estado().keys()], [String(A.e)]);
  assert.equal(W.pagina.de(otra.e), null);
  const quitadas: number[] = [];
  W.pagina.alCambiar((q, f) => { if (f === null) quitadas.push(q); });
  W.inst.disconnect(A.e); W.pump(2);
  assert.deepEqual([...W.estado().keys()], []);
  assert.deepEqual(quitadas, [A.e]);
  assert.equal(W.pagina.de(A.e), null);
});

test("ia pública: an inhabitant (agent ticket, no pass, no roles feature) still gets the minimal card at identify; a guest next to it gets none", () => {
  const guests = signer("una-clave-de-prueba-larga"), agents = signer("otra-clave-de-agentes-larga");
  const NOW = Date.parse("2026-10-15T12:00:00Z");
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [iaServer], identitySign: guests, now: () => NOW, agentes: { sign: agents, nombre: (id) => (id === "lia" ? "Lía" : null) } });
  const t = inst.join(0), pagina = crearIAPagina(), s = new ClientSession(t, { features: [pagina.part], identity: keeper() });
  const hab = new Cuerpo(inst.join(0), emitirAgente(agents, "lia", today(NOW)));
  for (let i = 0; i < 4; i++) { t.flush(); hab.paso(); inst.tick(); t.flush(); s.tick(0, 0); }
  assert.equal(hab.nombre, "Lía · IA");
  assert.deepEqual(pagina.de(hab.entidad), { estado: "activa", puede: { construir: false }, atenta: false, tamano: "desconocido" });
  assert.equal(pagina.es(s.entity), false);
  assert.deepEqual(pagina.lista().map((x) => x.quien), [hab.entidad]);
});

test("ia pública: publica() reads an entry safely; an unknown or odd value falls back to the safest reading", () => {
  assert.deepEqual(publica({}), { estado: "activa", puede: { construir: false }, atenta: false, tamano: "desconocido" });
  assert.deepEqual(publica({ estado: "dormida", construye: true, comunidad: "La Torre", atenta: true, tamano: "desconocido" }), { estado: "dormida", responde: { comunidad: "La Torre" }, puede: { construir: false }, atenta: true, tamano: "desconocido" });
  assert.deepEqual(publica({ estado: 7, comunidad: 3, nombre: "Ana", construye: "si" }), { estado: "activa", puede: { construir: false }, atenta: false, tamano: "desconocido" });
});

test("ia pública: the full server and page lists carry the feature (nothing to switch on, R-1)", () => {
  assert.ok(iaFeatures.some((p) => p.feature.id === "ia"));
  assert.ok(iaClientes.some((p) => p.feature.id === "ia"));
});

test("ia pública: «atenta» (S12) — the AI's report turns its card true for 90 s, a fresh pass keeps it, then it is false again; a person's report changes nothing", () => {
  const W = mundo();
  const ai = new Cuerpo(W.inst.join(1), "", paseIA(T0, { ia: { responde: RESPONDE } }));
  const ciclo = (n: number) => { for (let i = 0; i < n; i++) { ai.paso(); W.pump(1); } };
  ciclo(6);
  assert.ok(ai.nombre, "the AI is in");
  assert.equal(W.pagina.de(ai.entidad)?.atenta, false, "false until its brain reports");
  assert.deepEqual(W.mirador.features.send("ia", "atenta", {}), { ok: true }, "a person may send it (the server ignores it)");
  ciclo(3);
  assert.equal(W.pagina.de(ai.entidad)?.atenta, false, "a person's report changes nothing");
  assert.deepEqual(W.pagina.lista().map((x) => x.quien), [ai.entidad], "and gives the person no card");
  const visto: boolean[] = [];
  W.pagina.alCambiar((q, f) => { if (q === ai.entidad && f) visto.push(f.atenta); });
  assert.equal(ai.hacer("ia", "atenta", {}).ok, true);
  ciclo(3);
  assert.equal(W.pagina.de(ai.entidad)?.atenta, true);
  for (let i = 0; i < 60 * 20; i++) W.inst.tick(); // 60 s of the server's clock
  W.reloj(T0 + 60_000);
  assert.equal(ai.renovarPase(paseIA(T0 + 60_000, { ia: { responde: { comunidad: "La Torre", nombre: "Otra" } } })), true);
  ciclo(3);
  assert.equal(W.pagina.de(ai.entidad)?.atenta, true, "a fresh pass rewrites the card but keeps «attentive»");
  assert.equal(W.pagina.de(ai.entidad)?.responde?.nombre, "Otra");
  for (let i = 0; i < 28 * 20; i++) W.inst.tick(); // 88 s since the report
  ciclo(2);
  assert.equal(W.pagina.de(ai.entidad)?.atenta, true, "still at ~88 s");
  for (let i = 0; i < 4 * 20; i++) W.inst.tick();
  ciclo(3);
  assert.equal(W.pagina.de(ai.entidad)?.atenta, false, "after 90 s");
  assert.deepEqual(visto.filter((v, i) => i === 0 || v !== visto[i - 1]), [true, false], "the card changed only when the flag flipped");
});
