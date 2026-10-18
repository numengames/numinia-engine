// C3: bench --escena piezas — the same bench@2 method on a deterministic world with the engine's pieces on (solids,
// world mesh, cable, timers, objects, movers, locks) and the cost per piece; the default plaza scene is untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { banco } from "../packages/server/src/bench.ts";
import { Cronos, ESCENA_PIEZAS, mundoPiezas, rondaPiezas, terrenoGlb } from "../packages/server/src/bench-piezas.ts";
import { triangulosDeGlb } from "../packages/server/src/colision-glb.ts";

const raiz = join(import.meta.dirname, "..");
const corre = (...args: string[]) => spawnSync(process.execPath, ["packages/server/src/bench.ts", ...args], { cwd: raiz, encoding: "utf8" });

test("C3 escena piezas: the terrain .glb is the same bytes every time and the server's own parser reads 2·celdas² triangles", async () => {
  const a = terrenoGlb(12, 40), b = terrenoGlb(12, 40);
  assert.deepEqual(a, b);
  const r = await triangulosDeGlb(a);
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) assert.equal(r.value.indices.length / 3, 2 * 12 * 12);
});

test("C3 escena piezas: the world has the pieces in the stated amounts, and --sin takes one out", () => {
  const m = mundoPiezas();
  assert.deepEqual(m.cuenta, { solidos: ESCENA_PIEZAS.solidos, malla: 2 * ESCENA_PIEZAS.mallaCeldas ** 2, cables: ESCENA_PIEZAS.cables, contadores: ESCENA_PIEZAS.contadores, objetos: ESCENA_PIEZAS.solidos + 1 + ESCENA_PIEZAS.objetosDecorado, movedores: ESCENA_PIEZAS.movedores, cerraduras: ESCENA_PIEZAS.cerraduras });
  assert.equal(m.cuenta.objetos, 300);
  const s = mundoPiezas(new Set(["solidos", "cable"]));
  assert.equal(s.cuenta.solidos, 0); assert.equal(s.cuenta.cables, 0); assert.equal(s.cuenta.objetos, 100);
  assert.equal(s.cuenta.movedores, ESCENA_PIEZAS.movedores);
});

test("C3 cronos: a hook running inside another's is charged once, to the inner one (exclusive time)", () => {
  const c = new Cronos(), espera = (ms: number) => { const t = performance.now(); while (performance.now() - t < ms) { /* busy */ } };
  const dentro = c.medir("cable", () => espera(4));
  const fuera = c.medir("contadores", () => { espera(2); dentro(); });
  const t0 = performance.now(); fuera(); const total = performance.now() - t0;
  const m = c.vaciar(), cable = m.get("cable")!, cont = m.get("contadores")!;
  assert.ok(cable >= 4 && cont >= 2, `cable ${cable}, contadores ${cont}`);
  // exclusive: the two add up to the outer call's own time (counted twice they would add up to it + 4 ms); load-proof
  assert.ok(Math.abs(cable + cont - total) < 0.5, `cable ${cable} + contadores ${cont} ≠ ${total}`);
  assert.equal(c.vaciar().size, 0);
});

test("C3 escena piezas: two rounds give the same fingerprint, the mesh is built and walked on, every piece's hooks are timed", async () => {
  const o = { bots: 30, ticks: 40, warmup: 10 };
  const a = await rondaPiezas(o), b = await rondaPiezas(o);
  assert.equal(a.hash, b.hash);
  assert.ok(a.mallaLista, "la malla del mundo no se construyó");
  for (const id of ["disparadores", "contadores", "movedores"]) assert.ok(a.piezasMs.has(id), `sin cronómetro: ${id}`);
  assert.ok(a.cambiosEstado > 0, "el mundo no cambió: ni contadores ni movedores corren");
  assert.equal(a.envio.length + a.sinEnvio.length, 30);
  const sin = await rondaPiezas({ ...o, sin: new Set(["malla"]) });
  assert.notEqual(sin.hash, a.hash, "quitar la malla no cambió la huella: nadie la pisa");
  assert.ok(!sin.mallaLista);
});

test("C3 bench CLI: --escena piezas prints bench@2 with its own fingerprint and cost per piece; the default scene is the same as before", () => {
  const p = corre("--escena", "piezas", "--bots", "30", "--ticks", "30", "--warmup", "10", "--rounds", "2");
  assert.equal(p.status, 0, p.stderr);
  const r = JSON.parse(p.stdout.trim().split("\n").at(-1)!);
  assert.equal(r.schema, "numinia-engine/bench@2"); assert.equal(r.escena, "piezas");
  for (const k of ["cable", "contadores", "objetos", "movedores", "cerradura", "otras de la casa", "motor (sim con sólidos y malla, fotos)", "entre ticks (malla, fuera del tick)"]) assert.ok(k in r.costePorTickMs, `falta ${k}`);
  assert.ok(r.metricas.entreTicksP50Ms && r.poblaciones.entreTicks);
  assert.ok(!r.avisos.some((x: string) => x.includes("no es determinista")), r.avisos.join("; "));
  // the plaza scene: no `escena` field and the same fingerprint the in-process bench gives (bench@2 untouched)
  const d = corre("--bots", "30", "--ticks", "30", "--warmup", "10", "--rounds", "1");
  assert.equal(d.status, 0, d.stderr);
  const q = JSON.parse(d.stdout.trim().split("\n").at(-1)!);
  assert.ok(!("escena" in q));
  assert.equal(q.huella, banco({ bots: 30, ticks: 30, warmup: 10, rounds: 1 }).huella);
  assert.notEqual(q.huella, r.huella);
  assert.equal(corre("--escena", "luna").status, 2);
  assert.equal(corre("--escena", "piezas", "--sin", "dragones").status, 2);
});
