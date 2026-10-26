// M20: world scripts in an SES compartment, CPU- and memory-capped, hot-reloadable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Guion } from "../packages/server/src/guion.ts";

const nuevo = (op = {}) => new Guion({ topeMs: 150, topeCargaMs: 3000, memoriaMb: 48, ...op });

test("a script answers an event through app.on", async () => {
  const g = nuevo();
  assert.equal((await g.cargar(`app.on("suma", (d) => d.a + d.b)`)).ok, true);
  const r = await g.lanzar("suma", { a: 2, b: 3 });
  assert.ok(r.ok && r.valor === 5 && r.atendido, "sum answered");
  const sin = await g.lanzar("nada");
  assert.ok(sin.ok && !sin.atendido, "unknown event is not an error");
  g.cerrar();
});

test("a script cannot reach process, files or the module system", async () => {
  const g = nuevo();
  await g.cargar(`app.on("mira", () => [typeof process, typeof require, typeof globalThis.fetch, typeof import_, typeof Buffer])`.replace("import_", "setTimeout"));
  const r = await g.lanzar("mira");
  assert.ok(r.ok && JSON.stringify(r.valor) === JSON.stringify(["undefined", "undefined", "undefined", "undefined", "undefined"]), "nothing leaked");
  g.cerrar();
});

test("frozen intrinsics: a script cannot poison Array.prototype", async () => {
  const g = nuevo();
  await g.cargar(`app.on("x", () => { try { Array.prototype.pwn = 1; return "wrote"; } catch { return "frozen"; } })`);
  const r = await g.lanzar("x");
  assert.ok(r.ok && r.valor === "frozen");
  g.cerrar();
});

test("a CPU overrun is cut and reported, and the next call works on a fresh worker", async () => {
  const informes: string[] = [];
  const g = nuevo({ alInforme: (m: string) => informes.push(m) });
  await g.cargar(`app.on("bucle", () => { for (;;) {} }); app.on("ok", () => 1)`);
  const t0 = Date.now();
  const r = await g.lanzar("bucle");
  assert.ok(!r.ok && r.motivo === "cpu", "cut for cpu");
  assert.ok(Date.now() - t0 < 2000, "cut quickly");
  assert.deepEqual(informes, ["cpu"]);
  assert.equal(g.cortes.cpu, 1);
  const otra = await g.lanzar("ok");
  assert.ok(otra.ok && otra.valor === 1, "recovers");
  g.cerrar();
});

test("a script that eats memory dies alone", async () => {
  const g = nuevo({ topeMs: 5000 });
  await g.cargar(`app.on("come", () => { const a = []; for (;;) a.push(new Array(1e5).fill(1)); }); app.on("ok", () => 2)`);
  const r = await g.lanzar("come");
  assert.ok(!r.ok && r.motivo === "memoria", "memory cap: " + JSON.stringify(r));
  const otra = await g.lanzar("ok");
  assert.ok(otra.ok && otra.valor === 2);
  g.cerrar();
});

test("a throwing handler and a throwing top level are reported, not thrown", async () => {
  const g = nuevo();
  await g.cargar(`app.on("mal", () => { throw new Error("boom"); })`);
  const r = await g.lanzar("mal");
  assert.ok(!r.ok && r.motivo === "error" && /boom/.test(r.detalle));
  const h = nuevo();
  const c = await h.cargar(`throw new Error("al cargar")`);
  assert.ok(!c.ok && c.motivo === "error" && /al cargar/.test(c.detalle));
  g.cerrar(); h.cerrar();
});

test("hot reload swaps the code without a new Guion", async () => {
  const g = nuevo();
  await g.cargar(`app.on("v", () => "uno")`);
  assert.equal((await g.lanzar("v") as { valor: unknown }).valor, "uno");
  const v1 = g.version;
  await g.recargar(`app.on("v", () => "dos")`);
  assert.equal((await g.lanzar("v") as { valor: unknown }).valor, "dos");
  assert.equal(g.version, v1 + 1);
  g.cerrar();
});

test("app.log and app.emit reach the host", async () => {
  const lineas: string[] = []; const emitidos: unknown[] = [];
  const g = nuevo({ alRegistrar: (t: string) => lineas.push(t), alEmitir: (n: string, d: unknown) => emitidos.push([n, d]) });
  await g.cargar(`app.on("x", () => { app.log("hola", 3); app.emit("luz", { on: true }); })`);
  await g.lanzar("x");
  assert.deepEqual(lineas, ["hola 3"]);
  assert.deepEqual(emitidos, [["luz", { on: true }]]);
  g.cerrar();
});
