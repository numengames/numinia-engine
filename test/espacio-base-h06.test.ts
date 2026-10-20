// H6 · the moñonis (the round agents of Alchemist Towers, off) are born with the espacio base: `agentes` 0…5 (default 1), planted ONCE in the same
// mark as the logo, colours/places/shapes from the seed only, inside the plateau, clear of the logo. Headless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { leerEspacioBase } from "../features/espaciobase/esquema.ts";
import { LOGO } from "../features/espaciobase/logo.ts";
import { bolitas, COLORES_BOLITA, MAX_RADIO } from "../features/espaciobase/bolitas.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };
import { Instance } from "../packages/instance/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { RADIO_MESETA } from "../packages/relieve/src/espacio-base.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const arranque = (mundo: Record<string, unknown>, storage?: FileStorage) => {
  const partes = conMundo(funciones, ((f: string) => mundo[f]) as never, () => {});
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes, storage });
  inst.tick(); inst.tick();
  return { cosas: () => [...inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).map(([, v]) => v as Record<string, unknown>) };
};
const sha = (id: string) => biblioteca.modelos.find((m) => m.id === id)!.modelo;
const moñonis = (cosas: Record<string, unknown>[]) => cosas.filter((c) => /^Moñoni /.test(String(c.nombre)));

test("schema: `agentes` is 0…5, default 1; a wrong value says how to fix it", () => {
  const d = leerEspacioBase({}); assert.ok(d.ok && d.value.agentes === 1);
  for (const n of [0, 3, 5]) { const r = leerEspacioBase({ agentes: n }); assert.ok(r.ok && r.value.agentes === n); }
  for (const mal of [6, -1, 1.5, "2", null]) { const r = leerEspacioBase({ agentes: mal }); assert.equal(r.ok, false); if (!r.ok) assert.match(r.issues[0].message, /0 a 5/); }
});

test("the 5 models are the town hall's bolita-gemelo: file present, sha matches, CC0, 160 triangles, one material, no textures, 12 kB", () => {
  for (const c of COLORES_BOLITA) {
    const m = biblioteca.modelos.find((x) => x.id === `bolita-${c}`)!;
    assert.ok(m, c); assert.equal(m.licencia, "CC0-1.0"); assert.match(m.fuente, /bolita-gemelo\.mjs/);
    const d = readFileSync(join(ROOT, m.fichero));
    assert.equal(createHash("sha256").update(d).digest("hex"), m.modelo);
    const j = JSON.parse(d.subarray(20, 20 + d.readUInt32LE(12)).toString());
    assert.equal(j.materials.length, 1); assert.equal(j.meshes.length, 1); assert.equal(j.images, undefined); assert.equal(j.textures, undefined);
    const pr = j.meshes[0].primitives[0], n = j.accessors[pr.indices ?? pr.attributes.POSITION].count; assert.equal(n / 3, 160);
    assert.ok(statSync(join(ROOT, m.fichero)).size < 13000);
  }
});

test("deterministic by seed: same seed = same colours, places, shapes; another seed differs; no repeated colour; n is respected", () => {
  assert.deepEqual(bolitas(1234, 5), bolitas(1234, 5));
  assert.notDeepEqual(bolitas(1234, 5), bolitas(99, 5));
  assert.deepEqual(bolitas("hola", 3), bolitas("hola", 3));
  for (const n of [0, 1, 2, 5]) assert.equal(bolitas(7, n).length, n);
  assert.equal(bolitas(7, 9).length, 5, "capped at 5"); assert.equal(bolitas(7, -2).length, 0);
  for (let s = 0; s < 40; s++) { const b = bolitas(s, 5); assert.equal(new Set(b.map((x) => x.modelo)).size, 5); for (const x of b) assert.ok(biblioteca.modelos.some((m) => m.id === x.modelo)); }
  assert.deepEqual(bolitas(5, 2).map((b) => b.modelo), bolitas(5, 5).slice(0, 2).map((b) => b.modelo), "more agents add, they do not reshuffle the first ones");
});

test("places: inside the plateau, in front, ≥1.8 m apart, ≥2.5 m from the spawn, ≥3 m from the logo, resting above the ground — for 300 seeds", () => {
  for (let s = 0; s < 300; s++) {
    const b = bolitas(s * 7919, 5);
    b.forEach((x, i) => {
      assert.ok(Math.hypot(x.x, x.z) >= 2.5 && Math.hypot(x.x, x.z) <= MAX_RADIO && MAX_RADIO < RADIO_MESETA, `seed ${s}`);
      assert.ok(x.z < 0, "in front of the first camera");
      assert.ok(Math.hypot(x.x - LOGO.x, x.z - LOGO.z) >= 3, `clear of the logo, seed ${s}`);
      assert.ok(x.y > 0.1455 * x.escala!, "above the ground");
      for (const o of b.slice(0, i)) assert.ok(Math.hypot(x.x - o.x, x.z - o.z) >= 1.8, `apart, seed ${s}`);
      for (const f of x.forma!) assert.ok(f >= 0.95 && f <= 1.07);
    });
  }
});

test("born once with the logo: default world = logo + 1 moñoni, as ordinary static objects; a restart does not duplicate; 0 = none", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "h06-")), s1 = new FileStorage(dir);
  const w1 = arranque({ "espacio-base.json": { semilla: 1234, agentes: 3 } }, s1);
  const c = w1.cosas(); assert.equal(c.length, 4); assert.equal(moñonis(c).length, 3);
  assert.equal(c.filter((x) => x.nombre === "Logo Khepri").length, 1);
  const esperado = bolitas(1234, 3);
  for (const m of moñonis(c)) { const e = esperado[Number(String(m.nombre).slice(7)) - 1]; assert.equal(m.modelo, sha(e.modelo)); assert.equal(m.x, Number(e.x.toFixed(2))); assert.equal(m.solido, false); assert.equal(m.decorado, false); assert.equal(m.fijado, false); }
  await s1.flush();
  assert.equal(arranque({ "espacio-base.json": { semilla: 1234, agentes: 3 } }, new FileStorage(dir)).cosas().length, 4, "restart: not duplicated");
  assert.equal(arranque({ "espacio-base.json": { agentes: 0 } }).cosas().length, 1, "0 = only the logo");
  assert.equal(moñonis(arranque({ "espacio-base.json": {} }).cosas()).length, 1, "default 1");
  const sinLogo = arranque({ "espacio-base.json": { objeto: null } }).cosas(); assert.equal(sinLogo.length, 1); assert.equal(moñonis(sinLogo).length, 1);
});

test("a world with an already-planted store (the logo of H5 only) never gets the moñonis later; world without espacio-base or off: unchanged", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "h06-")), s1 = new FileStorage(dir);
  assert.equal(arranque({ "espacio-base.json": { agentes: 0 } }, s1).cosas().length, 1); await s1.flush();
  assert.equal(arranque({ "espacio-base.json": { agentes: 5 } }, new FileStorage(dir)).cosas().length, 1, "same mark: planted once, not again");
  assert.equal(arranque({}).cosas().length, 0); assert.equal(arranque({ "espacio-base.json": { activa: false } }).cosas().length, 0);
});
