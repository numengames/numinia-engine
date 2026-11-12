// Picking two different world/uploaded avatars in a row: each must index a real entry of the catalogue (it used to skip past the end,
// so the second one drew as a capsule). montarAvatar needs a DOM; a tiny fake stands in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarAvatar } from "../apps/plaza/avatar.ts";

function el(): unknown {
  const base: Record<string, unknown> = { children: [], style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : typeof k === "string" ? () => el() : undefined), set: (t, k, v) => { t[k as string] = v; return true; } });
}

test("two world avatars in a row get consecutive indexes inside the catalogue", () => {
  const g = globalThis as Record<string, unknown>, antes = g.document;
  g.document = { createElement: () => el(), head: el(), body: el(), getElementById: () => null, addEventListener() {} };
  try {
    const modelos = [{ nombre: "A", url: "/a.vrm" }, { nombre: "B", url: "/b.vrm" }];
    const s1 = "1".repeat(64), s2 = "2".repeat(64), estado = new Map<string, Record<string, unknown>>();
    const av = montarAvatar({
      session: { entity: 7, features: { send: () => ({ ok: true }), stateOf: () => estado } },
      catalogo: { modelos } as never, origen: "http://x", billete: () => null,
      delMundo: [s1, s2].map((sha256, i) => ({ id: `w${i}`, nombre: `W${i}`, sha256, licencia: "CC0", credito: "" })) as never,
    });
    estado.set("7", { tipo: "subido", modelo: 0, sha: s1, ext: "vrm" });
    assert.equal(av.eleccion("yo"), 2);
    estado.set("7", { tipo: "subido", modelo: 0, sha: s2, ext: "vrm" });
    const i2 = av.eleccion("yo");
    assert.equal(i2, 3);
    assert.ok(modelos[i2 as number], "index points at a real catalogue entry");
    estado.set("7", { tipo: "subido", modelo: 0, sha: s1, ext: "vrm" });
    assert.equal(av.eleccion("yo"), 2, "a repeat pick reuses its entry");
    assert.equal(modelos.length, 4);
  } finally { g.document = antes; }
});
