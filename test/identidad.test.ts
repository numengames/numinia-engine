// I1: a guest identity without an account or personal data. Signed token kept by the page; the same browser
// is the same guest across visits; forged or expired tokens get a new guest; bots have none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitir, verificar, nuevoId, nombreDe, today, TOKEN_DAYS, RENEW_AFTER_DAYS } from "../packages/instance/src/identidad.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import { encodeIdentityRequest, MSG } from "../packages/net/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { startServer } from "../packages/server/src/server.ts";

const sign = signer("una-clave-de-prueba-larga");
const DAY = today(Date.parse("2026-10-15T12:00:00Z"));

test("tokens: valid ones give their id; forged, other-secret, expired or malformed ones give nothing", () => {
  const t = emitir(sign, "abcdefgh2345", DAY);
  assert.match(t, /^g1\.abcdefgh2345\.\d+\.[0-9a-f]{24}$/);
  assert.deepEqual(verificar(sign, t, DAY), { id: "abcdefgh2345", renovar: false });
  assert.equal(verificar(sign, t.replace("abcdefgh2345", "abcdefgh2346"), DAY), null);
  assert.equal(verificar(signer("otra-clave-distinta-larga"), t, DAY), null);
  assert.equal(verificar(sign, t, DAY + TOKEN_DAYS + 1), null);
  assert.deepEqual(verificar(sign, t, DAY + RENEW_AFTER_DAYS + 1), { id: "abcdefgh2345", renovar: true });
  for (const bad of ["", "g1", "g1.x.1.y", "g2.abcdefgh2345.1.aa", "x".repeat(500)]) assert.equal(verificar(sign, bad, DAY), null, bad);
  assert.equal(emitir(signer(undefined), "abcdefgh2345", DAY), "", "no secret, no token");
  assert.match(nuevoId(Math.random), /^[a-z2-7]{12}$/);
  assert.equal(nombreDe("abcdefgh2345"), "Invitado 2345");
});

function world(features = [] as ReturnType<typeof serverPart>[]) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features, log: (l) => log.push(l), identitySign: sign, now: () => Date.parse("2026-10-15T12:00:00Z") });
  const join = (keeper?: GuestKeeper) => { const t = inst.join(0); const s = new ClientSession(t, { identity: keeper }); return { t, s, pump: () => { t.flush(); inst.tick(); t.flush(); } }; };
  return { inst, join, log };
}
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

test("the same browser is the same guest on the next visit; another browser is another guest", () => {
  const W = world(), mine = keeper();
  const a = W.join(mine); a.pump();
  assert.ok(a.s.who && /^Invitado [A-Z2-7]{4}$/.test(a.s.who.nombre));
  assert.ok(mine.token?.startsWith("g1."));
  assert.deepEqual(W.inst.who(a.s.entity), a.s.who);
  const again = W.join(mine); again.pump();               // next visit (or a second tab)
  assert.equal(again.s.who?.id, a.s.who.id);
  const other = W.join(keeper()); other.pump();
  assert.notEqual(other.s.who?.id, a.s.who.id);
});

test("a forged token gets a new guest; bots (no keeper) have none and nothing breaks", () => {
  const W = world(), k = keeper();
  k.token = emitir(signer("clave-de-otro-servidor-xx"), "abcdefgh2345", DAY);
  const a = W.join(k); a.pump();
  assert.notEqual(a.s.who?.id, "abcdefgh2345");
  assert.notEqual(k.token, emitir(signer("clave-de-otro-servidor-xx"), "abcdefgh2345", DAY), "the forged token was replaced");
  const bot = W.join(); bot.pump();
  assert.equal(bot.s.who, null);
  assert.equal(W.inst.who(bot.s.entity), null);
  // a second IDENTITY on the same connection is ignored and counted
  a.t.send(encodeIdentityRequest(""), true); a.pump();
  assert.equal(W.inst.conns.find((c) => c.entity === a.s.entity)!.bad, 1);
});

test("features hear who it is (onIdentify) and key per-person data by the guest id, never by entity", () => {
  const seen: string[] = [];
  const quien = defineFeature({ id: "quien", version: 1, describe: "Prueba de identidad.", store: { describe: "Visitas por invitado." } });
  const part = serverPart(quien, (api) => {
    api.onIdentify((e, w) => {
      const n = Number(api.store.get(w.id) ?? 0) + 1;
      api.store.set(w.id, n);
      seen.push(`${e}:${w.nombre}:${n}:${api.who(e)?.id === w.id}`);
    });
  });
  const W = world([part]), k = keeper();
  const a = W.join(k); a.pump();
  const b = W.join(k); b.pump();
  assert.equal(seen.length, 2);
  assert.match(seen[0], /^\d+:Invitado [A-Z2-7]{4}:1:true$/);
  assert.match(seen[1], /:2:true$/, "same guest, second visit");
});

test("over a real server without MOTOR_SECRET: guests work, and the log says they will not survive a restart", async () => {
  const log: string[] = [];
  const saved = process.env.MOTOR_SECRET; delete process.env.MOTOR_SECRET;
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000 });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    ws.binaryType = "arraybuffer";
    const got = await new Promise<string>((ok, ko) => {
      ws.onmessage = (ev) => {
        const b = new Uint8Array(ev.data as ArrayBuffer);
        if (b[0] === MSG.WELCOME) ws.send(encodeIdentityRequest(""));
        if (b[0] === MSG.IDENTITY) ok(new TextDecoder().decode(b.subarray(1)));
      };
      ws.onerror = () => ko(new Error("ws"));
    });
    assert.match(JSON.parse(got).nombre, /^Invitado /);
    ws.close();
  } finally { await srv.close(); if (saved !== undefined) process.env.MOTOR_SECRET = saved; }
  assert.ok(log.some((l) => l.includes("[identidad] sin MOTOR_SECRET")));
});
