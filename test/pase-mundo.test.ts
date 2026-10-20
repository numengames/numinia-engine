// H3b: a person who arrives with numinia.com's world pass, inside a headless world (the roles feature, chat, objetos).
// The pass reaches the Instance through `identificar(entity, token, pase)` (here called directly; the wire that carries it, PASE, is in test/pase-cable.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import type { FeatureStorage, Saved, StorageOp } from "../packages/feature/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import objetosServer from "../features/objetos/server.ts";
import objetosCliente from "../features/objetos/client.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import type { ConfigPase } from "../packages/server/src/pase.ts";
import { startServer } from "../packages/server/src/server.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const T0 = Date.parse("2026-10-16T10:00:00Z");
const sub = (c: string): string => `p_${c.repeat(32)}`;
const carga = (o: Record<string, unknown> = {}) => ({
  v: 1, iss: "numinia.com", aud: MUNDO, sub: sub("a"), org: "org-1", perm: ["enter-worlds"], height: 0, roles: [], iat: T0 / 1000 - 5, exp: T0 / 1000 + 595, ...o,
});
function pase(payload: object = carga(), key: KeyObject = par.privateKey): string {
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), key))}`;
}

class MemoryStorage implements FeatureStorage {
  private readonly d = new Map<string, Saved>();
  load(f: string): Saved | null { return this.d.get(f) ?? null; }
  record(f: string, version: number, op: StorageOp): void {
    const s = this.d.get(f) ?? { version, state: [], store: [] };
    if (op.op === "k") s.store = [...s.store.filter(([k]) => k !== op.key), [op.key, op.value]];
    if (op.op === "kd") s.store = s.store.filter(([k]) => k !== op.key);
    this.d.set(f, s);
  }
}

const ADMIN = "codigo-de-administracion-largo";
function mundo(o: { pase?: ConfigPase | null; storage?: MemoryStorage } = {}) {
  const log: string[] = [], cerradas: number[] = [];
  const cfg: ConfigPase | null = o.pase === undefined ? { clave: CLAVE, mundo: MUNDO } : o.pase;
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: firma, pase: cfg, cerrar: (e) => { cerradas.push(e); inst.disconnect(e); }, ahora: () => T0, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, objetosServer, roles.part], log: (l) => log.push(l), identitySign: firma, storage: o.storage, puede: (w, a) => roles.puede(w, a), credencial: roles.credencial });
  const gente: { t: ReturnType<Instance["join"]>; s: ClientSession; chat: ReturnType<typeof crearCliente>["chat"] }[] = [];
  const llegar = (token?: string) => {
    const t = inst.join(gente.length), c = crearCliente(() => T0);
    const s = new ClientSession(t, { features: [c.part, objetosCliente], view: { label() {}, bounce() {} } });
    const p = { t, s, chat: c.chat }; gente.push(p);
    pump(2);
    inst.identificar(s.entity, "", token);
    pump(3);
    return p;
  };
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); } };
  const avisos = (p: { chat: { lineas: readonly { tipo: string; texto: string }[] } }) => p.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto);
  const quien = (p: (typeof gente)[number]) => inst.who(p.s.entity)!;
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  return { inst, roles, gente, llegar, pump, avisos, quien, decir, log, cerradas };
}
/** The world's roles file with `id` already holding a role (what /dar left there in an earlier session). */
function conRolGuardado(id: string, rol: string): MemoryStorage {
  const s = new MemoryStorage();
  s.record("roles", 1, { op: "k", key: `m:${id}`, value: [rol] });
  return s;
}

test("pase: a good pass makes the person: id = sub, their name, the permissions and height of the pass", () => {
  const W = mundo();
  const A = W.llegar(pase(carga({ name: "Lía", perm: ["enter-worlds", "build-in-worlds", "mute-members"], height: 1, roles: [{ name: "Guardia", color: "#112233" }] })));
  assert.deepEqual({ id: W.quien(A).id, nombre: W.quien(A).nombre }, { id: sub("a"), nombre: "Lía" });
  assert.deepEqual({ id: A.s.who?.id, nombre: A.s.who?.nombre }, { id: sub("a"), nombre: "Lía" }, "the page is told who it is");
  assert.equal(W.roles.puede(W.quien(A), "construir"), true);
  assert.equal(W.roles.puede(W.quien(A), "silenciar"), true);
  assert.equal(W.roles.puede(W.quien(A), "vetar"), false);
  assert.equal(W.roles.acceso(sub("a")).altura, 1);
  W.decir(A, "/roles");
  assert.match(W.avisos(A).at(-2) ?? "", /Eres: Guardia, @todos \(de numinia\.com\)\. Puedes: entrar si es solo para miembros, construir, silenciar\./);
  assert.ok(W.log.some((l) => l.includes(`[pase] ${sub("a")} entra`)));
  assert.ok(!W.log.some((l) => l.includes(pase().slice(0, 40))), "the token never reaches the log");
});

test("pase: without a name the person gets a guest-style name; the pass REPLACES what this world held for that person", () => {
  const W = mundo({ storage: conRolGuardado(sub("a"), "administracion") });
  assert.equal(W.roles.puede({ id: sub("a"), nombre: "x" }, "vetar"), true, "before the pass: the role the world kept");
  const A = W.llegar(pase(carga({ perm: ["enter-worlds"] })));
  assert.match(W.quien(A).nombre, /^Invitado [0-9A-F]{4}$/);
  assert.equal(W.roles.puede(W.quien(A), "vetar"), false, "the pass says no moderation: the stored Administración does not add to it");
  assert.equal(W.roles.puede(W.quien(A), "roles"), false);
  const B = W.llegar();
  assert.notEqual(W.quien(B).id, sub("a"));
  assert.equal(W.roles.puede(W.quien(B), "vetar"), false, "a plain guest stays @todos");
});

test("pase: the same person on two devices is one person; the pass is forgotten when the last device leaves", () => {
  const W = mundo();
  const A = W.llegar(pase(carga({ perm: ["enter-worlds", "build-in-worlds"] })));
  const B = W.llegar(pase(carga({ perm: ["enter-worlds", "build-in-worlds"] })));
  assert.equal(W.quien(A).id, W.quien(B).id);
  assert.equal(W.inst.conns.filter((c) => c.who?.id === sub("a")).length, 2);
  W.inst.disconnect(A.s.entity);
  assert.equal(W.roles.puede({ id: sub("a"), nombre: "x" }, "construir"), true, "still there on the other device");
  W.inst.disconnect(B.s.entity);
  assert.equal(W.roles.puede({ id: sub("a"), nombre: "x" }, "construir"), false, "no pass kept for someone who left");
});

test("pase: a refused pass leaves a visitor and one line saying why (expired, other world, tampered, other key, garbage)", () => {
  const W = mundo();
  const casos: [string, RegExp][] = [
    [pase(carga({ iat: T0 / 1000 - 900, exp: T0 / 1000 - 300 })), /ha caducado/],
    [pase(carga({ aud: "otro-mundo" })), /de otro mundo/],
    [pase(carga(), generateKeyPairSync("ed25519").privateKey), /no es auténtico/],
    [pase().replace(/\.[^.]+$/, ".AAAA"), /no es auténtico/],
    ["esto-no-es-un-pase", /no se entiende/],
  ];
  for (const [token, re] of casos) {
    const P = W.llegar(token);
    assert.ok(!W.quien(P).id.startsWith("p_"), "a visitor, never the person on the pass");
    assert.equal(W.avisos(P).length, 1);
    assert.match(W.avisos(P)[0], re);
    assert.match(W.avisos(P)[0], /numinia\.com/);
    assert.equal(W.roles.puede(W.quien(P), "construir"), false);
  }
  assert.ok(W.log.some((l) => l.includes("[pase] rechazado") && l.includes("caducado")));
});

test("pase: the world counts the passes it received, accepted and refused, with the last refusal's short reason (for /status)", () => {
  const W = mundo();
  assert.deepEqual(W.roles.pases(), { recibidos: 0, aceptados: 0, rechazados: 0, ultimoMotivo: null });
  W.llegar();
  assert.equal(W.roles.pases().recibidos, 0, "a guest without a pass is not a pass");
  W.llegar(pase());
  assert.deepEqual(W.roles.pases(), { recibidos: 1, aceptados: 1, rechazados: 0, ultimoMotivo: null });
  W.llegar(pase(carga({ sub: sub("b"), iat: T0 / 1000 - 900, exp: T0 / 1000 - 300 })));
  assert.deepEqual(W.roles.pases(), { recibidos: 2, aceptados: 1, rechazados: 1, ultimoMotivo: "caducado" });
  W.llegar(pase(carga({ sub: sub("c"), aud: "otro-mundo" })));
  assert.deepEqual(W.roles.pases(), { recibidos: 3, aceptados: 1, rechazados: 2, ultimoMotivo: "mundo" });
  const copia = W.roles.pases(); copia.recibidos = 99;
  assert.equal(W.roles.pases().recibidos, 3, "a copy: /status cannot change the counts");
  const Wsin = mundo({ pase: null });
  Wsin.llegar(pase());
  assert.equal(Wsin.roles.pases().recibidos, 0, "without a key passes are ignored, not counted");
});

test("pase: a pass for another organization is refused when MOTOR_PASE_ORG is set", () => {
  const W = mundo({ pase: { clave: CLAVE, mundo: MUNDO, org: "org-2" } });
  const A = W.llegar(pase());
  assert.ok(!W.quien(A).id.startsWith("p_"));
  assert.match(W.avisos(A)[0], /otra organización/);
  const W2 = mundo({ pase: { clave: CLAVE, mundo: MUNDO, org: "org-1" } });
  assert.equal(W2.quien(W2.llegar(pase())).id, sub("a"));
});

test("pase: without a configured key passes are ignored, silently, exactly as before", () => {
  const W = mundo({ pase: null });
  const A = W.llegar(pase(carga({ perm: ["enter-worlds", "build-in-worlds"] })));
  assert.ok(!W.quien(A).id.startsWith("p_"));
  assert.equal(W.avisos(A).length, 0);
  assert.equal(W.roles.puede(W.quien(A), "construir"), false);
});

test("pase: members only — a visitor stays out as today; a pass with enter-worlds gets in, one without it does not", () => {
  const W = mundo();
  const dueno = W.llegar(pase(carga({ sub: sub("d"), height: Number.MAX_VALUE, perm: [] })));
  W.decir(dueno, "/solo-miembros sí");
  const dentro = W.llegar(pase(carga({ sub: sub("b"), perm: ["enter-worlds"] }))), sinPermiso = W.llegar(pase(carga({ sub: sub("c"), perm: [] }))), visitante = W.llegar();
  const fuera = (p: (typeof W.gente)[number]) => !W.inst.conns.some((c) => c.entity === p.s.entity);
  assert.equal(fuera(dentro), false);
  assert.equal(fuera(sinPermiso), true);
  assert.equal(fuera(visitante), true, "a visitor stays out");
  assert.equal(W.cerradas.length, 2);
  const caducado = W.llegar(pase(carga({ sub: sub("e"), exp: T0 / 1000 - 1, iat: T0 / 1000 - 601 })));
  assert.equal(fuera(caducado), true, "a refused pass is a visitor: out too");
  assert.match(W.avisos(caducado)[0] ?? "", /ha caducado/);
});

test("pase: an owner on the pass stands above everyone; an owner by /dueño stays an owner whatever the pass says", () => {
  const W = mundo();
  const admin = W.llegar(pase(carga({ sub: sub("b"), height: 50, perm: ["enter-worlds", "mute-members", "remove-members", "ban-members", "manage-roles"] })));
  const dueno = W.llegar(pase(carga({ sub: sub("d"), height: Number.MAX_VALUE, perm: [] })));
  assert.equal(W.roles.acceso(sub("d")).dueno, true);
  assert.equal(W.roles.puede(W.quien(dueno), "ajustar"), true, "an owner holds everything");
  const nombre = W.quien(dueno).nombre === W.quien(admin).nombre ? "?" : W.quien(dueno).nombre;
  W.decir(admin, `/silenciar ${nombre} 5`);
  assert.match(W.avisos(admin).at(-1) ?? "", /a tu altura o por encima \(o es dueña/, "never on an owner");
  const humilde = W.llegar(pase(carga({ sub: sub("f"), perm: ["enter-worlds"], height: 0 })));
  assert.equal(W.roles.puede(W.quien(humilde), "ajustar"), false);
  W.decir(humilde, `/dueño ${ADMIN}`);
  assert.equal(W.roles.acceso(sub("f")).dueno, true, "/dueño works for a person on a pass too");
});

test("pase: /dar and /quitar do not touch a person whose roles come from numinia.com", () => {
  const W = mundo();
  const dueno = W.llegar(pase(carga({ sub: sub("d"), height: Number.MAX_VALUE, perm: [] })));
  const otra = W.llegar(pase(carga({ sub: sub("b"), name: "Marta" })));
  W.decir(dueno, `/dar ${W.quien(otra).nombre} Moderación`);
  assert.match(W.avisos(dueno).at(-1) ?? "", /vienen de su pase de numinia\.com/);
  assert.equal(W.roles.puede(W.quien(otra), "echar"), false);
});

test("pase: a banned person is banned by their numinia.com id, on any device", () => {
  const W = mundo();
  const dueno = W.llegar(pase(carga({ sub: sub("d"), height: Number.MAX_VALUE, perm: [] })));
  const mala = W.llegar(pase(carga({ sub: sub("b"), name: "Marta" })));
  W.decir(dueno, "/vetar Marta por spam");
  assert.equal(W.inst.conns.some((c) => c.entity === mala.s.entity), false);
  const otraVez = W.llegar(pase(carga({ sub: sub("b"), name: "Marta" })));
  assert.equal(W.inst.conns.some((c) => c.entity === otraVez.s.entity), false, "back on a new device with a fresh pass: still out");
  assert.match(W.avisos(otraVez)[0] ?? "", /vetado/);
});

test("pase: the guest token of the page still finds a numinia.com person (uploads ask by it)", () => {
  const W = mundo();
  const A = W.llegar(pase());
  const c = W.inst.conns.find((k) => k.entity === A.s.entity)!;
  assert.equal(c.who?.id, sub("a"));
  assert.match(c.invitado ?? "", /^[a-z2-7]{12}$/);
  const B = W.llegar();
  assert.equal(W.inst.conns.find((k) => k.entity === B.s.entity)!.invitado, undefined);
});

test("pase: the server refuses to start with a key that is set but invalid, and says what to fix; without a key it says so", async () => {
  const antes = { c: process.env.MOTOR_PASE_CLAVE, m: process.env.MOTOR_PASE_MUNDO };
  try {
    process.env.MOTOR_PASE_CLAVE = "clave-rota"; process.env.MOTOR_PASE_MUNDO = MUNDO;
    await assert.rejects(startServer({ port: 0, host: "127.0.0.1", log: () => {} }), /MOTOR_PASE_CLAVE/);
    process.env.MOTOR_PASE_CLAVE = RAW; delete process.env.MOTOR_PASE_MUNDO;
    await assert.rejects(startServer({ port: 0, host: "127.0.0.1", log: () => {} }), /MOTOR_PASE_MUNDO/);
    delete process.env.MOTOR_PASE_CLAVE;
    const lineas: string[] = [];
    const s = await startServer({ port: 0, host: "127.0.0.1", log: (l) => lineas.push(l), secret: "una-clave-de-prueba-larga" });
    const st = await (await fetch(`http://127.0.0.1:${s.port}/status`)).json() as Record<string, unknown>;
    await s.close();
    assert.ok(lineas.some((l) => /\[pase\] sin MOTOR_PASE_CLAVE/.test(l)), "one line says passes are ignored");
    assert.ok(!("pases" in st) && !("mundoPase" in st), "without a key /status says nothing about passes");
    process.env.MOTOR_PASE_CLAVE = RAW; process.env.MOTOR_PASE_MUNDO = MUNDO;
    const lineas2: string[] = [];
    const s2 = await startServer({ port: 0, host: "127.0.0.1", log: (l) => lineas2.push(l), secret: "una-clave-de-prueba-larga" });
    const st2 = await (await fetch(`http://127.0.0.1:${s2.port}/status`)).json() as Record<string, unknown>;
    await s2.close();
    assert.ok(lineas2.some((l) => l.includes(`acepta pases de numinia.com (clave ${KID}`)));
    assert.equal(st2.mundoPase, MUNDO);
    assert.deepEqual(st2.pases, { recibidos: 0, aceptados: 0, rechazados: 0, ultimoMotivo: null }, "with a key /status counts the passes");
    assert.ok(!lineas2.some((l) => l.includes(RAW)), "the key is public, but the log says only its kid");
  } finally {
    for (const [k, v] of [["MOTOR_PASE_CLAVE", antes.c], ["MOTOR_PASE_MUNDO", antes.m]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
