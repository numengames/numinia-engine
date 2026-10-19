// H3b: the wire that carries numinia.com's world pass — PASE (type 12, own cap 2048), the client that reads #pass=… and
// sends it, the Instance that holds it until IDENTITY, and a real WebSocket server with maxPayload 2048.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession, tomarPaseDeLaDireccion } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import {
  MSG, WIRE_FORMAT, PASE_MAX, WS_FRAME_MAX, encodePase, decodePase, encodeIdentityRequest, decodeIdentityRequest, webSocketClient,
} from "../packages/net/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import { startServer } from "../packages/server/src/server.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const sub = (c: string): string => `p_${c.repeat(32)}`;
const ahora = (): number => Date.now();
function pase(extra: object = {}, roles = 1): string {
  const t = Math.floor(ahora() / 1000);
  const payload = {
    v: 1, iss: "numinia.com", aud: MUNDO, sub: sub("a"), org: "org-1", perm: ["enter-worlds", "build-in-worlds"], height: 1,
    roles: Array.from({ length: roles }, (_, i) => ({ name: "語".repeat(40), color: "#112233" })), name: "Lía", iat: t - 5, exp: t + 595, ...extra,
  };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}
const guardian = (): GuestKeeper & { token: string | null } => {
  const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } };
  return k;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- the message ----------
test("PASE: type 12, additive — the wire format number and IDENTITY's cap (200 characters since ADR-080's a2 ticket) are untouched", () => {
  assert.equal(MSG.PASE, 12);
  assert.equal(WIRE_FORMAT, 2, "an additive type does not bump the wire format");
  assert.equal(PASE_MAX, 2048);
  assert.equal(WS_FRAME_MAX, 1024);
  assert.equal(decodeIdentityRequest(new Uint8Array(202).fill(65).fill(MSG.IDENTITY, 0, 1)), null, "IDENTITY still stops at 201 bytes");
  assert.equal(encodeIdentityRequest("x".repeat(500)).length, 201);
});

test("PASE: a real pass (5 roles, ~1.3 KB) round-trips; the cap is 2048 bytes with the type byte; garbage is refused without throwing", () => {
  const real = pase({}, 5);
  assert.ok(real.length > WS_FRAME_MAX, `a 5-role pass is ${real.length} B: it does not fit the old 1024-byte frame`);
  assert.ok(real.length + 1 <= PASE_MAX);
  const b = encodePase(real)!;
  assert.equal(b[0], 12);
  assert.equal(b.length, real.length + 1);
  assert.equal(decodePase(b), real);
  const justFits = "a.b." + "c".repeat(PASE_MAX - 1 - 4);
  assert.equal(encodePase(justFits)?.length, PASE_MAX);
  assert.equal(encodePase(justFits + "c"), null, "one byte over the cap");
  assert.equal(decodePase(new Uint8Array(PASE_MAX + 1).fill(97).fill(12, 0, 1)), null, "oversize frame");
  assert.equal(encodePase("no es un pase"), null);
  assert.equal(encodePase("a.b"), null);
  assert.equal(encodePase(""), null);
  assert.equal(decodePase(new Uint8Array([12])), null);
  assert.equal(decodePase(new Uint8Array([10, 97, 46, 98, 46, 99])), null, "another type");
  assert.equal(decodePase(new Uint8Array([12, 0xff, 0xfe, 46, 98, 46, 99])), null, "not ASCII");
});

test("PASE: the biggest pass numinia.com can issue today fits PASE_MAX (measured here; the issuer does not bound the person's name)", () => {
  const ids = ["enter-worlds", "build-in-worlds", "mute-members", "remove-members", "ban-members", "manage-roles", "manage-organization", "download-world"];
  const peor = pase({ perm: ids, name: "語".repeat(40), org: "00000000-0000-0000-0000-000000000000", height: Number.MAX_VALUE }, 5);
  const sinNombre = pase({ perm: ids, name: undefined, org: "00000000-0000-0000-0000-000000000000" }, 5);
  const normal = pase({ perm: ["enter-worlds"], name: "Lía" }, 1);
  const largo = pase({ perm: ids, name: "語".repeat(200), org: "00000000-0000-0000-0000-000000000000" }, 5);
  console.log(`[H3b] pass bytes: one role ${normal.length} · 5 roles + 8 permissions + 40-char name, worst script (3-byte chars) ${peor.length} · same without name ${sinNombre.length} · with a 200-char name ${largo.length} · PASE_MAX ${PASE_MAX}`);
  assert.ok(peor.length + 1 <= PASE_MAX, `${peor.length} B`);
  assert.ok(peor.length > WS_FRAME_MAX, "the worst case does not fit the old frame");
});

// ---------- the address ----------
test("#pass=…: read from the address, removed with replaceState, the rest of the hash and the path kept", () => {
  const tok = pase();
  const casos: [string, string | null, string][] = [
    [`#pass=${tok}`, tok, "/plaza"],
    [`#a=1&pass=${tok}&b=2`, tok, "/plaza#a=1&b=2"],
    ["#otra=cosa", null, "/plaza"],
    ["", null, "/plaza"],
    ["#pass=esto-no-es-un-pase", null, "/plaza"],
    ["#pass=", null, "/plaza"],
  ];
  for (const [hash, esperado, url] of casos) {
    const llamadas: string[] = [];
    const got = tomarPaseDeLaDireccion({ hash, pathname: "/plaza", search: "" }, { state: null, replaceState: (_s, _t, u) => llamadas.push(u) });
    assert.equal(got, esperado, hash.slice(0, 30));
    if (hash.includes("pass=")) assert.deepEqual(llamadas, [url], "the token is gone from the bar even when it is not a pass");
    else assert.deepEqual(llamadas, [], "nothing to remove");
  }
  const con = tomarPaseDeLaDireccion({ hash: `#pass=${tok}`, pathname: "/p", search: "?mundo=1" }, { state: 7, replaceState: (s, _t, u) => { assert.equal(s, 7); assert.equal(u, "/p?mundo=1"); } });
  assert.equal(con, tok);
  assert.equal(tomarPaseDeLaDireccion({ hash: `#pass=${tok}`, pathname: "/", search: "" }, { state: null, replaceState() { throw new Error("sin historial"); } }), tok, "no history API: still sent");
});

// ---------- headless: client -> Instance ----------
function mundo(conPase = true) {
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: firma, pase: conPase ? { clave: CLAVE, mundo: MUNDO } : null, cerrar: () => {}, ahora, log: () => {} });
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [roles.part], identitySign: firma, puede: (w, a) => roles.puede(w, a), credencial: conPase ? roles.credencial : undefined });
  return { inst, roles };
}
function llegar(m: ReturnType<typeof mundo>, token: string | null) {
  const t = m.inst.join(0), keeper = guardian();
  const s = new ClientSession(t, { identity: keeper, pase: token });
  for (let k = 0; k < 4; k++) { t.flush(); m.inst.tick(); t.flush(); }
  const conn = m.inst.conns.find((c) => c.entity === s.entity)!;
  return { t, s, keeper, conn };
}

test("client + Instance: the page sends PASE then IDENTITY; the person is the one on the pass, the guest token is still kept", () => {
  const m = mundo();
  const A = llegar(m, pase({}, 5));
  assert.equal(A.s.who?.id, sub("a"));
  assert.equal(A.s.who?.nombre, "Lía");
  assert.match(A.keeper.token ?? "", /^g1\./, "the guest token is saved for the next visit");
  assert.equal(A.conn.bad, 0);
  assert.equal(A.conn.pase, undefined, "the pass is not kept after IDENTITY");
  assert.equal(m.roles.puede(m.inst.who(A.s.entity), "construir"), true);
});

test("client + Instance: no pass in the address = the wire and the result are exactly as before (a guest, nothing counted)", () => {
  const m = mundo();
  const g = llegar(m, null);
  assert.ok(g.s.who && !g.s.who.id.startsWith("p_"));
  assert.equal(g.conn.bad, 0);
  assert.equal(m.roles.puede(m.inst.who(g.s.entity), "construir"), false);
});

test("Instance: a bad pass is refused (guest + notice), a PASE after IDENTITY, a second PASE or a malformed one is counted and the connection stays", () => {
  const m = mundo();
  const mala = llegar(m, pase({ aud: "otro-mundo" }));
  assert.ok(mala.s.who && !mala.s.who.id.startsWith("p_"), "refused pass = guest");
  assert.equal(mala.conn.bad, 0, "a refused pass is not abuse: the notice says why");

  // late: IDENTITY already answered
  const tarde = llegar(m, null);
  tarde.t.send(encodePase(pase())!, true);
  for (let k = 0; k < 2; k++) { tarde.t.flush(); m.inst.tick(); tarde.t.flush(); }
  assert.equal(tarde.conn.bad, 1);
  assert.ok(!m.inst.who(tarde.s.entity)!.id.startsWith("p_"), "a late pass changes nothing");
  assert.equal(tarde.conn.pase, undefined);

  // duplicate and malformed, before IDENTITY (raw messages, no ClientSession keeper)
  const t = m.inst.join(0); const s = new ClientSession(t);
  for (let k = 0; k < 2; k++) { t.flush(); m.inst.tick(); t.flush(); }
  const conn = m.inst.conns.find((c) => c.entity === s.entity)!;
  t.send(encodePase(pase())!, true);
  t.send(encodePase(pase({ name: "Otra" }))!, true); // duplicate
  t.send(new Uint8Array([MSG.PASE, 0xc3, 0x28, 46, 46]), true); // malformed
  t.send(new Uint8Array(PASE_MAX + 1).fill(97).fill(MSG.PASE, 0, 1), true); // oversize (only reachable over loopback: a real socket cuts it first)
  for (let k = 0; k < 2; k++) { t.flush(); m.inst.tick(); t.flush(); }
  assert.equal(conn.bad, 3);
  t.send(encodeIdentityRequest(""), true);
  for (let k = 0; k < 2; k++) { t.flush(); m.inst.tick(); t.flush(); }
  assert.equal(m.inst.who(s.entity)?.id, sub("a"), "the first valid PASE is the one used");
  assert.equal(m.inst.who(s.entity)?.nombre, "Lía");
  assert.ok(m.inst.conns.includes(conn), "still connected");
});

test("Instance: a world with no pass key ignores PASE silently — the person enters as a guest, nothing counted", () => {
  const m = mundo(false);
  const A = llegar(m, pase());
  assert.ok(A.s.who && !A.s.who.id.startsWith("p_"));
  assert.equal(A.conn.bad, 0);
  assert.equal(A.conn.pase, undefined);
});

// ---------- real WebSocket ----------
test("WebSocket: maxPayload 2048 lets a 1.3 KB pass through; other messages keep the old 1024 cut; over 2048 closes the connection", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, log: () => {}, secret: "una-clave-de-prueba-larga", pase: { clave: CLAVE, mundo: MUNDO } });
  try {
    const url = `ws://127.0.0.1:${srv.port}/ws`;
    const espera = async (f: () => boolean) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < 5000) await sleep(10); return f(); };

    // 1) the real page path: ClientSession with the pass from the address
    const t1 = webSocketClient(url), k1 = guardian();
    const s1 = new ClientSession(t1, { identity: k1, pase: pase({}, 5) });
    await t1.opened;
    assert.ok(await espera(() => s1.who !== null), "identity answered");
    assert.equal(s1.who?.id, sub("a"));
    assert.equal(srv.inst.conns.find((c) => c.entity === s1.entity)?.bad, 0);

    // 2) a 1025-byte non-PASE frame: cut as before (REPORT is the biggest ordinary message)
    const t2 = webSocketClient(url), s2 = new ClientSession(t2);
    await t2.opened;
    assert.ok(await espera(() => s2.entity >= 0));
    t2.send(new Uint8Array(WS_FRAME_MAX + 1).fill(MSG.REPORT, 0, 1), true);
    await Promise.race([t2.closed, sleep(3000)]);
    assert.ok(await espera(() => !srv.inst.conns.some((c) => c.entity === s2.entity)), "closed, as it was with maxPayload 1024");

    // 3) a PASE of exactly 2048 passes, is judged by the verifier (refused: a guest), and the connection stays
    const t3 = webSocketClient(url), s3 = new ClientSession(t3, { identity: guardian(), pase: "a.b." + "c".repeat(PASE_MAX - 5) });
    await t3.opened;
    assert.ok(await espera(() => s3.who !== null));
    assert.ok(srv.inst.conns.some((c) => c.entity === s3.entity), "still connected");
    assert.ok(!s3.who!.id.startsWith("p_"));

    // 4) 2049 bytes: the WebSocket library itself closes (abusive)
    const t4 = webSocketClient(url), s4 = new ClientSession(t4);
    await t4.opened;
    assert.ok(await espera(() => s4.entity >= 0));
    t4.send(new Uint8Array(PASE_MAX + 1).fill(97).fill(MSG.PASE, 0, 1), true);
    await Promise.race([t4.closed, sleep(3000)]);
    assert.ok(await espera(() => !srv.inst.conns.some((c) => c.entity === s4.entity)), "over the cap: closed");

    // 5) a duplicate or late PASE over the socket is counted, the connection stays
    s1.t.send(encodePase(pase())!, true);
    assert.ok(await espera(() => (srv.inst.conns.find((c) => c.entity === s1.entity)?.bad ?? 0) === 1));
    assert.ok(srv.inst.conns.some((c) => c.entity === s1.entity));

    // 6) /status tells from outside what came of them: the good one, the 2048-byte garbage, and not the late duplicate
    const st = await (await fetch(`http://127.0.0.1:${srv.port}/status`)).json() as { mundoPase?: string; pases?: unknown };
    assert.equal(st.mundoPase, MUNDO);
    assert.deepEqual(st.pases, { recibidos: 2, aceptados: 1, rechazados: 1, ultimoMotivo: "forma" });
    t1.close(); t3.close();
  } finally { await srv.close(); }
});
