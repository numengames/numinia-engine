// H10: your avatar — choose one of the house avatars or one you uploaded; saved with your identity (I1), shared
// with everyone (state), and back after a reconnect (store, S4). The upload itself (bytes, triangles, licence) is
// H9 + J1's vrm.ts; this feature only trusts `api.activo` that the sha256 is really on the server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import type { ClientPart } from "../packages/feature/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { motivoElegir } from "../features/avatar/feature.ts";
import avatarServer from "../features/avatar/server.ts";
import avatarClient from "../features/avatar/client.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

function world(o: { storage?: FileStorage; subidos?: Set<string> } = {}) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [avatarServer], log: (l) => log.push(l), identitySign: sign, storage: o.storage,
    activo: (sha, ext) => !!o.subidos?.has(`${sha}.${ext}`) });
  const join = (keep?: GuestKeeper) => {
    const t = inst.join(0);
    const s = new ClientSession(t, { features: [avatarClient as ClientPart], identity: keep });
    return { t, s, pump: (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } } };
  };
  return { inst, join, log };
}

test("motivoElegir: a bad tipo or (subido) a non-sha256 is refused; everything else is fine shape-wise", () => {
  assert.match(motivoElegir("otracosa", ""), /tipo/);
  assert.match(motivoElegir("subido", "no-es-un-sha"), /sha256/);
  assert.equal(motivoElegir("casa", ""), "");
  assert.equal(motivoElegir("subido", "a".repeat(64)), "");
});

test("H10: A picks a house avatar, B sees it, and A keeps it after reconnecting (persisted with I1)", () => {
  const W = world(), mine = keeper();
  const a = W.join(mine); a.pump();
  const b = W.join(); b.pump();
  assert.equal(a.s.features.send("avatar", "elegir", { tipo: "casa", modelo: 2, sha: "", ext: "" }).ok, true);
  a.pump(); b.pump();
  assert.deepEqual(b.s.features.stateOf("avatar").get(String(a.s.entity)), { tipo: "casa", modelo: 2, sha: "", ext: "" });
  // A reloads the tab (same guest token): a new entity, which gets the same pick back from the store (I1)
  const again = W.join(mine); again.pump();
  assert.notEqual(again.s.entity, a.s.entity);
  assert.deepEqual(again.s.features.stateOf("avatar").get(String(again.s.entity)), { tipo: "casa", modelo: 2, sha: "", ext: "" });
});

test("H10: picking an upload that is not on the server is refused (announced); one that is, is accepted", () => {
  const sha = "b".repeat(64);
  const W = world({ subidos: new Set([`${sha}.vrm`]) });
  const a = W.join(keeper()); a.pump();
  const r1 = a.s.features.send("avatar", "elegir", { tipo: "subido", modelo: 0, sha: "c".repeat(64), ext: "vrm" });
  assert.equal(r1.ok, true); // the server validates, not the schema: the event carries why
  a.pump();
  assert.match(a.s.features.announcements.at(-1)?.text ?? "", /no está subido/);
  assert.equal(a.s.features.stateOf("avatar").get(String(a.s.entity)), undefined);
  const r2 = a.s.features.send("avatar", "elegir", { tipo: "subido", modelo: 0, sha, ext: "vrm" });
  assert.equal(r2.ok, true);
  a.pump();
  assert.deepEqual(a.s.features.stateOf("avatar").get(String(a.s.entity)), { tipo: "subido", modelo: 0, sha, ext: "vrm" });
});

test("H10: survives a restart (S4 store, by identity, not by entity)", async () => {
  const dir = new URL("../.tmp-avatar-test/", import.meta.url).pathname;
  const storage1 = new FileStorage(dir);
  const W1 = world({ storage: storage1 }), mine = keeper();
  const a = W1.join(mine); a.pump();
  a.s.features.send("avatar", "elegir", { tipo: "casa", modelo: 5, sha: "", ext: "" });
  a.pump();
  await storage1.flush();
  const storage2 = new FileStorage(dir);
  const W2 = world({ storage: storage2 });
  const again = W2.join(mine); again.pump();
  assert.deepEqual(again.s.features.stateOf("avatar").get(String(again.s.entity)), { tipo: "casa", modelo: 5, sha: "", ext: "" });
});
