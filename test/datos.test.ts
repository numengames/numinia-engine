// S4: what the game features keep across restarts. Plain files (snapshot + journal), restored before anyone
// joins, checked against today's schema; the simulation is never saved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineFeature, serverPart, clientPart, STORE_VALUE_MAX, STORE_KEYS_MAX } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { FileStorage, COMPACT_AT } from "../packages/server/src/datos.ts";
import { startServer } from "../packages/server/src/server.ts";
import { crearDespertar } from "../features/despertar/server.ts";
import { firmar } from "../features/despertar/tokens.ts";
import { signer } from "../packages/server/src/secret.ts";

const tmp = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "datos-"));

const semillas = (version = 1, max = 9) => defineFeature({
  id: "semillas", version, describe: "Semillas plantadas (prueba de S4).",
  intents: { plantar: { describe: "Planta una semilla.", spoken: "plantar", fields: { n: { kind: "int", min: 0, max: 99 } } } },
  state: {
    describe: "Cada semilla y lo que ha crecido.", persist: true,
    fields: { altura: { kind: "int", min: 0, max }, x: { kind: "fixed", min: -100, max: 100, step: 0.25 }, z: { kind: "fixed", min: -100, max: 100, step: 0.25 } },
    card: { role: "objeto", name: "Semilla {key}", importance: 1, at: ["x", "z"] },
  },
  store: { describe: "Quién plantó qué y cuándo." },
});

/** An instance whose feature hands its api out, so a test can act as the feature. */
function boot(dir: string, version = 1, max = 9) {
  const log: string[] = [];
  let api!: ServerApi;
  const storage = new FileStorage(dir, (l) => log.push(l));
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [serverPart(semillas(version, max), (a) => { api = a; })], storage, log: (l) => log.push(l) });
  return { inst, api, storage, log };
}

test("restart without loss: persisted state comes back and reaches whoever joins; the store too", async () => {
  const dir = tmp();
  const a = boot(dir);
  a.api.state.set("roble", { altura: 3, x: 2, z: -4 }, { at: { x: 2, z: -4 } });
  a.api.state.set("pino", { altura: 1, x: 0, z: 0 }, { at: { x: 0, z: 0 } });
  a.api.state.delete("pino");
  assert.equal(a.api.store.set("roble", { quien: "invitado-7", cuando: "2026-10-15T10:00:00Z" }), true);
  await a.storage.flush();
  // the server stops and starts again
  const b = boot(dir);
  assert.deepEqual(b.api.state.keys(), ["roble"]);
  assert.deepEqual(b.api.state.get("roble"), { altura: 3, x: 2, z: -4 });
  assert.deepEqual(b.api.store.get("roble"), { quien: "invitado-7", cuando: "2026-10-15T10:00:00Z" });
  assert.ok(b.log.some((l) => l.includes("recupero lo guardado: 1 claves de estado, 1 del almacén")));
  const t = b.inst.join(0);
  const page = new ClientSession(t, { features: [clientPart(semillas(), () => {})] });
  t.flush();
  assert.deepEqual(page.features.cards().map((c) => [c.name, c.at]), [["Semilla roble", { x: 2, z: -4 }]]);
});

test("a crash mid-line loses only that line; a value that no longer fits the schema is dropped and said", async () => {
  const dir = tmp();
  const a = boot(dir);
  a.api.state.set("alta", { altura: 8, x: 0, z: 0 });
  a.api.state.set("baja", { altura: 2, x: 0, z: 0 });
  await a.storage.flush();
  appendFileSync(join(dir, "semillas.jsonl"), '{"t":"2026-10-15","v":1,"op":"s","key":"rota","val'); // torn write
  const b = boot(dir, 2, 5); // version 2: heights only up to 5
  assert.deepEqual(b.api.state.keys(), ["baja"]);
  assert.equal(b.storage.stats.lineasRotas, 1);
  assert.ok(b.log.some((l) => l.includes("1 claves guardadas ya no cumplen el esquema (versión 1 → 2)")));
});

test(`a journal over ${COMPACT_AT} lines folds into a snapshot that loads the same`, async () => {
  const dir = tmp();
  const a = boot(dir);
  for (let i = 0; i < COMPACT_AT + 50; i++) a.api.store.set(`k${i % 120}`, { i });
  await a.storage.flush();
  assert.equal(a.storage.stats.compactadas, 1);
  assert.ok(existsSync(join(dir, "semillas.json")));
  assert.equal(readFileSync(join(dir, "semillas.jsonl"), "utf8"), "");
  const b = boot(dir);
  assert.equal(b.api.store.keys().length, 120);
  assert.deepEqual(b.api.store.get("k49"), { i: [...Array(COMPACT_AT + 50).keys()].filter((i) => i % 120 === 49).pop() }); // the last write wins
});

test("the store refuses what it cannot keep, and needs to be declared", () => {
  const a = boot(tmp());
  assert.equal(a.api.store.set("grande", "x".repeat(STORE_VALUE_MAX)), false);
  assert.equal(a.api.store.set("", 1), false);
  assert.equal(a.api.store.set("ciclo", (() => { const o: Record<string, unknown> = {}; o.o = o; return o; })()), false);
  assert.ok(a.log.some((l) => l.includes(`como mucho ${STORE_VALUE_MAX} bytes`)));
  const lleno = boot(tmp());
  for (let i = 0; i < STORE_KEYS_MAX; i++) lleno.api.store.set(`k${i}`, i);
  assert.equal(lleno.api.store.set("una-mas", 1), false);
  assert.equal(lleno.api.store.set("k7", 70), true, "changing an existing key is fine when full");
  const sinAlmacen = defineFeature({ id: "olvido", version: 1, describe: "Sin almacén." });
  let ok = true; const log: string[] = [];
  new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [serverPart(sinAlmacen, (api) => { ok = api.store.set("a", 1); })], log: (l) => log.push(l) });
  assert.equal(ok, false);
  assert.ok(log.some((l) => l.includes("declara store")));
});

test("state that is not marked persist is not written; with no folder everything stays in memory and it says so", async () => {
  const dir = tmp(), log: string[] = [];
  const efimera = defineFeature({ id: "efimera", version: 1, describe: "Estado que no se guarda.", state: { describe: "x", fields: { n: { kind: "int", min: 0, max: 9 } } } });
  let api!: ServerApi;
  const storage = new FileStorage(dir);
  new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [serverPart(efimera, (a) => { api = a; })], storage });
  api.state.set("a", { n: 1 });
  await storage.flush();
  assert.equal(existsSync(join(dir, "efimera.jsonl")), false);
  new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [serverPart(semillas(), () => {})], log: (l) => log.push(l) });
  assert.ok(log.some((l) => l.includes("sin carpeta de datos") && l.includes("DATOS_DIR")));
});

test("over a real server: a QR scan is remembered after a restart (despertar keeps when and how many times)", async () => {
  const dir = tmp(), secret = "s".repeat(24);
  const start = () => startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, sampleMs: 100, secret, datos: dir, features: [crearDespertar([{ id: "fuente", nombre: "la fuente", x: 0, z: 12, texto: "¡La fuente despierta!", ms: 500 }])] });
  const token = firmar(signer(secret), "fuente");
  let srv = await start();
  try { assert.equal((await fetch(`http://127.0.0.1:${srv.port}/e/${token}`)).status, 200); } finally { await srv.close(); }
  const saved = readFileSync(join(dir, "despertar.jsonl"), "utf8");
  assert.match(saved, /"op":"k","key":"fuente","value":\{"ultima":"\d{4}-\d\d-\d\dT[^"]+Z","veces":1\}/);
  srv = await start();
  try {
    await new Promise((ok) => setTimeout(ok, 600)); // the first effect would have ended anyway
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/e/${token}`)).status, 200);
  } finally { await srv.close(); }
  const last = readFileSync(join(dir, "despertar.jsonl"), "utf8").trim().split("\n").pop()!;
  assert.equal(JSON.parse(last).value.veces, 2);
});
