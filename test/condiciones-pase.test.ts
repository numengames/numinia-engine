// condiciones/w5: the signed pass says what a person already accepted on numinia.com (`acepto: { casa: "<version>" }`) and the world
// believes it — only when the signature is good, the pass is current, and the world's own layer declares `versionWeb` equal to that very
// string. It covers the NORMS of that layer; data permissions are never given by a pass (they are asked, empty). Headless, same Instance
// the server runs, with the pass verifier of H3b (a key pair made here, never numinia.com's).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { MSG } from "../packages/net/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave, verificarPase } from "../packages/server/src/pase.ts";
import { validarCondiciones } from "../packages/server/src/condiciones.ts";
import type { Condiciones } from "../packages/server/src/condiciones.ts";
import { crearPuertaCondiciones } from "../packages/server/src/condiciones-puerta.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza", T0 = Date.parse("2026-10-20T12:00:00Z"), WEB = "terms@1.0.1+privacy@2.1.0";
const sub = (c: string): string => `p_${c.repeat(32)}`;
const carga = (o: Record<string, unknown> = {}) => ({
  v: 1, iss: "numinia.com", aud: MUNDO, sub: sub("a"), org: "org-1", perm: ["enter-worlds"], height: 0, roles: [], iat: T0 / 1000 - 5, exp: T0 / 1000 + 595, ...o,
});
const pase = (payload: object = carga(), key: KeyObject = par.privateKey): string => {
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), key))}`;
};
const conWeb = (acepto: unknown = { casa: WEB }) => pase(carga({ acepto }));

const punto = (id: string, obligatorio: boolean, tipo: "norma" | "datos" = "norma") => ({ id, titulo: id, texto: `texto ${id}`, obligatorio, tipo });
/** The house layer declares it reproduces numinia.com's terms at WEB; the community has its own mandatory norm. */
const condiciones = (o: { versionWeb?: string; comunidad?: boolean; casa?: string } = {}): Condiciones => ({
  formato: "condiciones@1",
  capas: [
    { capa: "casa", version: o.casa ?? "1", ...(o.versionWeb === undefined ? { versionWeb: WEB } : o.versionWeb === "" ? {} : { versionWeb: o.versionWeb }), puntos: [punto("uso", true), punto("informe", false, "datos")] },
    ...(o.comunidad === false ? [] : [{ capa: "comunidad" as const, version: "A", puntos: [punto("normas", true), punto("avisos", false, "datos")] }]),
  ],
});

function mundo(c: Condiciones, o: { ahora?: () => number; pase?: boolean } = {}) {
  const identidades: string[] = [], log: string[] = [], firma = signer("una-clave-de-prueba-larga"), ahora = o.ahora ?? (() => T0);
  const roles = crearRoles({ construir: true, admin: "codigo-de-administracion-largo", firmar: firma, pase: o.pase === false ? null : { clave: CLAVE, mundo: MUNDO }, cerrar: () => {}, ahora, log: (l) => log.push(l) });
  const puerta = crearPuertaCondiciones({ condiciones: c, activa: true, log: (l) => log.push(l), ahora });
  const inst: Instance = new Instance({
    seed: 1, capacity: 32, k: 50, snapshotEvery: 2, log: (l) => log.push(l), identitySign: firma,
    features: [chatServer, roles.part, puerta.part], puede: (w, a) => roles.puede(w, a), credencial: roles.credencial, condiciones: puerta,
  });
  const gente: { s: ClientSession; t: ReturnType<Instance["join"]>; chat: ReturnType<typeof crearCliente>["chat"] }[] = [];
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { for (const g of gente) g.t.flush(); inst.tick(); for (const g of gente) g.t.flush(); } };
  const llegar = (token?: string) => {
    const t = inst.join(gente.length), cl = crearCliente(() => T0);
    const s = new ClientSession(t, { features: [cl.part], view: { label() {}, bounce() {} } });
    const p = { s, t, chat: cl.chat }; gente.push(p);
    const conn = inst.conns.find((c) => c.transport && c.who === undefined && !(c as { espiada?: true }).espiada)!, enviar = conn.transport.send.bind(conn.transport);
    (conn as { espiada?: true }).espiada = true;
    conn.transport.send = (b: Uint8Array, fiable?: boolean) => { if (b[0] === MSG.IDENTITY) identidades.push(new TextDecoder().decode(b.subarray(1))); return enviar(b, fiable); };
    pump(2); inst.identificar(s.entity, "", token); pump(3);
    return p;
  };
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }); pump(TICK_HZ + 2); };
  return { inst, puerta, roles, gente, llegar, pump, decir, log, identidades };
}
type G = ReturnType<ReturnType<typeof mundo>["llegar"]>;
const lineas = (p: G) => p.chat.lineas.map((l) => l.texto);

test("w5: a valid pass whose acepto.casa matches the layer's versionWeb counts the house norms as accepted — the bubble starts at the community", () => {
  const M = mundo(condiciones());
  const A = M.llegar(conWeb());
  assert.equal(M.inst.who(A.s.entity)?.id, sub("a"), "the pass was taken");
  const o = A.s.condiciones!;
  assert.equal(o.abierta, false, "the community norm is still pending");
  assert.deepEqual(o.faltan, ["comunidad"]);
  assert.deepEqual(o.porPase, ["casa"]);
  assert.equal(o.aceptado, null, "nothing was accepted in the world: the pass is not stored as an acceptance");
  // the house layer is offered with its DATA points only: the page asks no house norm again, but still asks the data permission, empty
  assert.deepEqual(o.capas!.map((c) => [c.capa, c.puntos.map((p) => `${p.id}:${p.tipo}`)]), [["casa", ["informe:datos"]], ["comunidad", ["normas:norma", "avisos:datos"]]]);
  assert.equal(M.inst.puertaCerrada(A.s.entity), true, "behind the gate until the community norm is accepted");
  M.decir(A, "hola"); assert.ok(!lineas(A).includes("hola"), "a closed person cannot speak");
  // accepting the community alone opens; the data permission stays unticked (no data given by the pass)
  assert.ok(A.s.aceptar({ comunidad: "A" }, [])); M.pump(2);
  assert.equal(A.s.condiciones!.abierta, true);
  assert.equal(M.inst.puertaCerrada(A.s.entity), false);
  assert.deepEqual(M.puerta.registro(sub("a"))!.d, [], "no data permission given");
  assert.equal(M.puerta.registro(sub("a"))!.v.casa, undefined, "the pass left no acceptance behind");
});

test("w5: with nothing else pending the bubble does not appear at all (abierta: true) and the person moves and speaks at once", () => {
  const M = mundo(condiciones({ comunidad: false }));
  const A = M.llegar(conWeb());
  const o = A.s.condiciones!;
  assert.equal(o.puerta, true); assert.equal(o.abierta, true); assert.deepEqual(o.faltan, []); assert.deepEqual(o.porPase, ["casa"]);
  assert.deepEqual(o.capas!.map((c) => c.capa), ["casa"], "the data permission is still there to be asked, never given");
  assert.equal(M.inst.puertaCerrada(A.s.entity), false);
  M.decir(A, "hola"); assert.ok(lineas(A).some((t) => t.includes("hola")), "an open person speaks");
  assert.deepEqual(M.puerta.registro(sub("a")) ?? null, null, "nothing is recorded: no data permission exists");
});

test("w5: a different web version (the terms moved on) asks as always — and a world that declares no versionWeb never believes the pass", () => {
  for (const [c, acepto, quien] of [
    [condiciones({ versionWeb: "terms@1.0.2+privacy@2.1.0" }), { casa: WEB }, "version moved"],
    [condiciones({ versionWeb: "" }), { casa: WEB }, "no versionWeb declared"],
    [condiciones(), { casa: "terms@1.0.0+privacy@2.1.0" }, "pass says an older one"],
    [condiciones(), { comunidad: WEB }, "pass speaks of another layer"],
    [condiciones(), {}, "empty acepto"],
    [condiciones(), { casa: 3 }, "a number is not a version"],
    [condiciones(), { casa: "" }, "an empty version"],
  ] as const) {
    const M = mundo(c as Condiciones);
    const A = M.llegar(conWeb(acepto));
    assert.equal(M.inst.who(A.s.entity)?.id, sub("a"), `${quien}: the pass is still a good pass`);
    assert.deepEqual(A.s.condiciones!.faltan, ["casa", "comunidad"], quien);
    assert.equal(A.s.condiciones!.porPase, undefined, quien);
    assert.equal(A.s.condiciones!.capas![0].puntos.length, 2, `${quien}: the house layer is offered whole`);
  }
});

test("w5: a pass without signature, forged, expired or from another world gives nothing: the person is a guest asked everything", () => {
  const M = mundo(condiciones());
  const otra = generateKeyPairSync("ed25519").privateKey;
  const casos: [string, string][] = [
    ["forged (another key)", pase(carga({ acepto: { casa: WEB } }), otra)],
    ["payload edited after signing", conWeb().replace(/^([^.]+)\.[^.]+\./, (_m, h: string) => `${h}.${b64(JSON.stringify(carga({ acepto: { casa: WEB }, name: "otro" })))}.`)],
    ["expired", pase(carga({ acepto: { casa: WEB }, iat: T0 / 1000 - 900, exp: T0 / 1000 - 300 }))],
    ["another world", pase(carga({ acepto: { casa: WEB }, aud: "otro-mundo" }))],
    ["garbage", "esto-no-es-un-pase"],
  ];
  for (const [que, token] of casos) {
    const A = M.llegar(token);
    assert.notEqual(M.inst.who(A.s.entity)?.id, sub("a"), que);
    assert.deepEqual(A.s.condiciones!.faltan, ["casa", "comunidad"], que);
    assert.equal(A.s.condiciones!.porPase, undefined, que);
    assert.equal(A.s.condiciones!.capas![0].puntos.length, 2, que);
    assert.equal(M.inst.puertaCerrada(A.s.entity), true, que);
  }
});

test("w5: a world with no pass key ignores the pass; a guest without a pass is asked as always", () => {
  const sinClave = mundo(condiciones(), { pase: false });
  const A = sinClave.llegar(conWeb());
  assert.deepEqual(A.s.condiciones!.faltan, ["casa", "comunidad"]);
  const M = mundo(condiciones());
  const G = M.llegar();
  assert.deepEqual(G.s.condiciones!.faltan, ["casa", "comunidad"]);
  assert.equal(G.s.condiciones!.porPase, undefined);
});

test("w5: the field cannot stretch the pass or change other permissions; an AI's pass takes none; `acepto` never reaches the page", () => {
  const ahora = { ms: T0 };
  const M = mundo(condiciones(), { ahora: () => ahora.ms });
  const v = verificarPase(conWeb(), CLAVE, { aud: MUNDO, now: T0 / 1000 });
  assert.ok(v.ok); assert.deepEqual(v.pase.acepto, { casa: WEB });
  assert.equal(v.pase.exp, T0 / 1000 + 595, "exp is the pass's own");
  assert.deepEqual(v.pase.permisos, ["enter-worlds"], "permissions are the pass's own");
  const tarde = verificarPase(conWeb(), CLAVE, { aud: MUNDO, now: T0 / 1000 + 601 });
  assert.ok(!tarde.ok && tarde.motivo === "caducado", "acepto does not keep an expired pass alive");
  // shapes: unknown keys inside acepto are ignored; a non-object refuses the (signed) pass; an AI cannot carry it
  const raro = verificarPase(conWeb({ casa: WEB, futuro: "x" }), CLAVE, { aud: MUNDO, now: T0 / 1000 });
  assert.ok(raro.ok); assert.deepEqual(raro.pase.acepto, { casa: WEB });
  for (const mal of ["terms", 3, null, [WEB]]) { const r = verificarPase(conWeb(mal), CLAVE, { aud: MUNDO, now: T0 / 1000 }); assert.ok(!r.ok && r.motivo === "contenido", JSON.stringify(mal)); }
  const ia = verificarPase(pase(carga({ sub: `a_${"c".repeat(32)}`, kind: "agent", state: "activa", name: "Bot", acepto: { casa: WEB } })), CLAVE, { aud: MUNDO, now: T0 / 1000 });
  assert.ok(!ia.ok && ia.motivo === "contenido");
  const largo = verificarPase(conWeb({ casa: "x".repeat(81) }), CLAVE, { aud: MUNDO, now: T0 / 1000 });
  assert.ok(largo.ok && largo.pase.acepto === undefined, "a version too long counts as not accepted");
  // what the page is told about itself carries no `acepto`
  const A = M.llegar(conWeb());
  assert.equal(M.identidades.length, 1);
  assert.ok(!M.identidades[0].includes("acepto") && !M.identidades[0].includes(WEB), "the IDENTITY frame on the wire carries no acepto");
  assert.equal((JSON.parse(M.identidades[0]) as { id: string }).id, sub("a"));
  // the pass is read at entry: the person already inside stays inside when the clock moves past the pass
  ahora.ms += 700_000;
  assert.equal(M.inst.puertaCerrada(A.s.entity), true, "still behind the community norm: the pass said nothing about it");
});

test("w5: the data permission ticked in the community step is kept; when the web terms move on the pass no longer covers the house layer", () => {
  const M = mundo(condiciones());
  const A = M.llegar(conWeb());
  assert.ok(A.s.aceptar({ comunidad: "A" }, ["avisos"])); M.pump(2);
  assert.deepEqual(M.puerta.registro(sub("a"))!.d, ["avisos"]);
  // the web terms move on: the pass now says another version → the house layer is asked again, whole (the world has nothing of it to compare)
  const M2 = mundo(condiciones({ versionWeb: "terms@1.1.0+privacy@2.1.0" }));
  const B = M2.llegar(conWeb());
  assert.deepEqual(B.s.condiciones!.faltan, ["casa", "comunidad"]);
});

test("validarCondiciones: versionWeb is optional text of 1–80 characters; it travels in the layer", () => {
  const base = (v: unknown) => ({ formato: "condiciones@1", capas: [{ capa: "casa", version: "1", ...(v === undefined ? {} : { versionWeb: v }), puntos: [{ id: "uso", titulo: "Uso", texto: "texto", obligatorio: true }] }] });
  const ok = validarCondiciones(base(WEB));
  assert.ok(ok.ok); assert.equal(ok.value.capas[0].versionWeb, WEB);
  const sin = validarCondiciones(base(undefined));
  assert.ok(sin.ok); assert.equal(sin.value.capas[0].versionWeb, undefined);
  for (const mal of ["", "   ", 3, "x".repeat(81)]) { const r = validarCondiciones(base(mal)); assert.ok(!r.ok && r.issues.some((i) => i.includes("versionWeb")), JSON.stringify(mal)); }
});
