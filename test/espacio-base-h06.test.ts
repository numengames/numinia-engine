// H6/H7 · the moñonis (the RICH round agents of Alchemist Towers, off) are born with the espacio base: `agentes` 0…5 (default 1), each = a body (ojos incluidos)
// + its smile as a second piece with the same pose, planted ONCE in the same mark as the logo, colours/places from the seed only, inside the plateau, clear of the
// logo. H7: the default seed is 42, read from ONE constant by the schema, the page and the collision mesh. Headless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { leerEspacioBase } from "../features/espaciobase/esquema.ts";
import { LOGO } from "../features/espaciobase/logo.ts";
import { bolitas, BOCA, COLORES_BOLITA, MAX_RADIO } from "../features/espaciobase/bolitas.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };
import { Instance } from "../packages/instance/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { RADIO_MESETA, SEMILLA_BASE_DEFECTO } from "../packages/relieve/src/espacio-base.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const arranque = (mundo: Record<string, unknown>, storage?: FileStorage) => {
  const partes = conMundo(funciones, ((f: string) => mundo[f]) as never, () => {});
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes, storage });
  inst.tick(); inst.tick();
  return { cosas: () => [...inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).map(([, v]) => v as Record<string, unknown>) };
};
const sha = (id: string) => biblioteca.modelos.find((m) => m.id === id)!.modelo;
const moñonis = (cosas: Record<string, unknown>[]) => cosas.filter((c) => /^Moñoni \d+$/.test(String(c.nombre)));
const bocas = (cosas: Record<string, unknown>[]) => cosas.filter((c) => /^Moñoni \d+ boca$/.test(String(c.nombre)));
const cuerpos = (b: ReturnType<typeof bolitas>) => b.filter((x) => /^Moñoni \d+$/.test(x.nombre));

test("schema: `agentes` is 0…5, default 1; a wrong value says how to fix it", () => {
  const d = leerEspacioBase({}); assert.ok(d.ok && d.value.agentes === 1);
  for (const n of [0, 3, 5]) { const r = leerEspacioBase({ agentes: n }); assert.ok(r.ok && r.value.agentes === n); }
  for (const mal of [6, -1, 1.5, "2", null]) { const r = leerEspacioBase({ agentes: mal }); assert.equal(r.ok, false); if (!r.ok) assert.match(r.issues[0].message, /0 a 5/); }
});

test("the rich models are the town hall's bolita.mjs: file present, sha matches, CC0 (library + inside the .glb), 1.246 triangles, 3 materials (body) / 2 (smile), no textures; the 3 dark colours and the 5 light ligeras are gone", () => {
  for (const c of COLORES_BOLITA) {
    const m = biblioteca.modelos.find((x) => x.id === `bolita-rica-${c}`)!;
    assert.ok(m, c); assert.equal(m.licencia, "CC0-1.0"); assert.match(m.fuente, /bolita\.mjs/);
    const d = readFileSync(join(ROOT, m.fichero));
    assert.equal(createHash("sha256").update(d).digest("hex"), m.modelo);
    const j = JSON.parse(d.subarray(20, 20 + d.readUInt32LE(12)).toString());
    assert.match(j.asset.copyright, /CC0/); assert.equal(j.materials.length, 3); assert.equal(j.meshes.length, 1); assert.equal(j.images, undefined); assert.equal(j.textures, undefined);
    assert.equal(j.meshes[0].primitives.length, 3, "3 primitives = 3 draw calls"); const n = j.meshes[0].primitives.reduce((t: number, pr: { indices?: number; attributes: { POSITION: number } }) => t + j.accessors[pr.indices ?? pr.attributes.POSITION].count, 0); assert.equal(n / 3, 1246);
    assert.ok(d.length < 100000);
  }
  const boca = biblioteca.modelos.find((x) => x.id === BOCA)!, d = readFileSync(join(ROOT, boca.fichero)), j = JSON.parse(d.subarray(20, 20 + d.readUInt32LE(12)).toString());
  assert.equal(createHash("sha256").update(d).digest("hex"), boca.modelo); assert.equal(boca.licencia, "CC0-1.0"); assert.match(j.asset.copyright, /CC0/); assert.equal(j.materials.length, 2); assert.equal(j.images, undefined);
  assert.equal(biblioteca.modelos.filter((m) => m.id.startsWith("bolita-")).length, 6, "5 bodies + 1 smile, nothing else");
  assert.equal(biblioteca.modelos.some((m) => /^bolita-(ambar|turquesa|coral|verde|verdemar)$/.test(m.id)), false, "the light ones are gone");
});

test("H7: the default seed is 42, one constant: schema, page and collision mesh read the same; a world can change it", async () => {
  assert.equal(SEMILLA_BASE_DEFECTO, 42);
  const d = leerEspacioBase({}); assert.ok(d.ok && d.value.semilla === 42);
  const r = leerEspacioBase({ semilla: 7 }); assert.ok(r.ok && r.value.semilla === 7);
  const { DEFECTOS_ESPACIO_BASE, normalizar } = await import("../packages/render/src/espacio-base/espacio-base.ts");
  assert.equal(DEFECTOS_ESPACIO_BASE.semilla, 42); assert.equal(normalizar({}).semilla, 42);
  const { terrenoDelEstado } = await import("../packages/sim/src/terreno-malla.ts");
  assert.equal(terrenoDelEstado([["espacio-base:mundo", { activa: true }]])!.semilla, 42);
  assert.equal(arranque({ "espacio-base.json": {} }).cosas().length, 3, "an empty world plants logo + body + smile");
});

test("deterministic by seed: same seed = same colours, places, shapes; another seed differs; no repeated colour; n is respected", () => {
  assert.deepEqual(bolitas(42, 5), bolitas(42, 5));
  assert.notDeepEqual(bolitas(42, 5), bolitas(99, 5));
  assert.deepEqual(bolitas("hola", 3), bolitas("hola", 3));
  for (const n of [0, 1, 2, 5]) assert.equal(cuerpos(bolitas(7, n)).length, n);
  assert.equal(cuerpos(bolitas(7, 9)).length, 5, "capped at 5"); assert.equal(bolitas(7, -2).length, 0);
  assert.equal(bolitas(7, 1).length, 2, "one moñoni = body + smile");
  for (let s = 0; s < 40; s++) { const b = bolitas(s, 5); assert.equal(new Set(cuerpos(b).map((x) => x.modelo)).size, 5); for (const x of b) assert.ok(biblioteca.modelos.some((m) => m.id === x.modelo)); }
  assert.deepEqual(bolitas(5, 2).map((b) => b.modelo), bolitas(5, 5).slice(0, 4).map((b) => b.modelo), "more agents add, they do not reshuffle the first ones");
});

test("places: inside the plateau, in front, ≥1.8 m apart, ≥2.5 m from the spawn, ≥3 m from the logo, resting above the ground — for 300 seeds", () => {
  for (let s = 0; s < 300; s++) {
    const b = bolitas(s * 7919, 5), u = bolitas(s * 7919, 1);
    const p0 = u[0]; assert.ok(Math.hypot(p0.x, p0.z) >= 3 && Math.hypot(p0.x, p0.z) <= 4, `the first one is 3–4 m from the spawn, seed ${s}`);
    assert.ok(Math.abs(p0.x) >= Math.hypot(p0.x, p0.z) * Math.sin(0.28), "off to one side of the line to the logo");
    const cara = ((p0.ry! % 360) + 540) % 360 - 180, quiere = (Math.atan2(-p0.x, -p0.z) * 180) / Math.PI; assert.ok(Math.abs(((cara - quiere + 540) % 360) - 180) <= 9, `facing the spawn, seed ${s}`);
    const m0 = u[1]; assert.equal(m0.modelo, BOCA); for (const k of ["x", "y", "z", "ry", "escala"] as const) assert.equal(m0[k], p0[k], "the smile has the body's pose");
    cuerpos(b).forEach((x, i) => {
      assert.ok(Math.hypot(x.x, x.z) >= 2.5 && Math.hypot(x.x, x.z) <= MAX_RADIO && MAX_RADIO < RADIO_MESETA, `seed ${s}`);
      assert.ok(x.z < 0, "in front of the first camera");
      assert.ok(Math.hypot(x.x - LOGO.x, x.z - LOGO.z) >= 3, `clear of the logo, seed ${s}`);
      assert.ok(x.y > 0.235 * x.escala!, "above the ground");
      for (const o of cuerpos(b).slice(0, i)) assert.ok(Math.hypot(x.x - o.x, x.z - o.z) >= 1.8, `apart, seed ${s}`);
    });
  }
});

test("born once with the logo: default world = logo + 1 moñoni (body + smile), as ordinary static objects; a restart does not duplicate; 0 = none", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "h06-")), s1 = new FileStorage(dir);
  const w1 = arranque({ "espacio-base.json": { semilla: 1234, agentes: 3 } }, s1);
  const c = w1.cosas(); assert.equal(c.length, 7); assert.equal(moñonis(c).length, 3); assert.equal(bocas(c).length, 3);
  assert.equal(c.filter((x) => x.nombre === "Logo Khepri").length, 1);
  const esperado = bolitas(1234, 3);
  for (const m of moñonis(c)) { const e = esperado[(Number(String(m.nombre).slice(7)) - 1) * 2]; assert.equal(m.modelo, sha(e.modelo)); assert.equal(m.x, Number(e.x.toFixed(2))); assert.equal(m.solido, false); assert.equal(m.decorado, false); assert.equal(m.fijado, false); }
  for (const m of bocas(c)) { const e = esperado[(Number(String(m.nombre).slice(7, 8)) - 1) * 2 + 1]; assert.equal(m.modelo, sha(BOCA)); assert.equal(m.x, Number(e.x.toFixed(2))); assert.equal(m.solido, false); }
  await s1.flush();
  assert.equal(arranque({ "espacio-base.json": { semilla: 1234, agentes: 3 } }, new FileStorage(dir)).cosas().length, 7, "restart: not duplicated");
  assert.equal(arranque({ "espacio-base.json": { agentes: 0 } }).cosas().length, 1, "0 = only the logo");
  assert.equal(moñonis(arranque({ "espacio-base.json": {} }).cosas()).length, 1, "default 1");
  const sinLogo = arranque({ "espacio-base.json": { objeto: null } }).cosas(); assert.equal(sinLogo.length, 2); assert.equal(moñonis(sinLogo).length, 1);
});

test("a world with an already-planted store (the logo of H5 only) never gets the moñonis later; world without espacio-base or off: unchanged", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "h06-")), s1 = new FileStorage(dir);
  assert.equal(arranque({ "espacio-base.json": { agentes: 0 } }, s1).cosas().length, 1); await s1.flush();
  assert.equal(arranque({ "espacio-base.json": { agentes: 5 } }, new FileStorage(dir)).cosas().length, 1, "same mark: planted once, not again");
  assert.equal(arranque({}).cosas().length, 0); assert.equal(arranque({ "espacio-base.json": { activa: false } }).cosas().length, 0);
});
