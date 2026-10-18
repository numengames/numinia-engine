import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cuantil, separar, poblacion, rondas } from "../packages/server/src/bench.ts";
import { comparar, noComparables, leerInforme, SCHEMA } from "../tools/banco-comparar.mjs";

const raiz = join(import.meta.dirname, "..");

test("B1 bench: the two kinds of tick are split, so the p50 never lands on their border whatever the parity", () => {
  // the engine's pattern: a cheap tick (no send, ~0,2 ms) then an expensive one (send, ~7 ms), with a little jitter
  const tira = (n: number, primeroEnvia: boolean) => {
    const ms: number[] = [], env: boolean[] = [];
    for (let i = 0; i < n; i++) { const e = (i % 2 === 0) === primeroEnvia; env.push(e); ms.push((e ? 7 : 0.2) + ((i * 37) % 11) / 100); }
    return { ms, env };
  };
  for (const [n, primero] of [[400, false], [401, false], [400, true], [401, true]] as const) {
    const { ms, env } = tira(n, primero);
    const mezcla = [...ms].sort((a, b) => a - b);
    const s = separar(ms, env);
    const p = poblacion(s.envio), q = poblacion(s.sinEnvio);
    assert.ok(p.p50 >= 7 && p.p50 < 7.11, `${n}/${primero}: con envío p50 ${p.p50}`);
    assert.ok(q.p50 >= 0.2 && q.p50 < 0.31, `${n}/${primero}: sin envío p50 ${q.p50}`);
    // the old single p50 of the mixture is ~7 or ~0,3 depending on n: exactly the bimodal trap
    assert.ok(cuantil(mezcla, 0.5) < 0.31 || cuantil(mezcla, 0.5) >= 7);
    for (const c of s.ciclos) assert.ok(c > 7.2 && c < 7.42, `ciclo ${c}`);
  }
});

test("B1 bench: cycles are only complete ones; the last untimed tick decides where the first starts", () => {
  const ms = [1, 10, 2, 20, 3, 30, 4], env = [false, true, false, true, false, true, false];
  assert.deepEqual(separar(ms, env).ciclos, [22, 33]);            // the leading half cycle (1, 10) is out: its start was not timed
  assert.deepEqual(separar(ms, env, 2, true).ciclos, [11, 22, 33]); // the tick before sent: (1, 10) is a whole cycle
  assert.deepEqual(separar(ms, env).envio, [10, 20, 30]);
  assert.deepEqual(separar(ms, env).sinEnvio, [1, 2, 3, 4]);       // the trailing 4 is a tick, not a cycle
});

test("B1 bench: nearest-rank p99 leaves 10 of 1.000 above it, and rounds give median, min, max and spread", () => {
  const xs = Array.from({ length: 1000 }, (_, i) => i + 1);
  assert.equal(cuantil(xs, 0.99), 990); assert.equal(cuantil(xs, 0.5), 500); assert.equal(cuantil([1, 2, 3, 4], 0.5), 2);
  assert.equal(poblacion(xs).p99Fiable, true); assert.equal(poblacion(xs.slice(0, 80)).p99Fiable, false);
  assert.equal(cuantil(xs.slice(0, 80), 0.99), 80); // with 80 samples the "p99" is the worst one: that is why it is flagged
  const r = rondas([7.0, 7.2, 7.1, 7.4, 6.9]);
  assert.equal(r.mediana, 7.1); assert.equal(r.min, 6.9); assert.equal(r.max, 7.4);
  assert.ok(r.dispersion > 0.02 && r.dispersion < 0.04, `dispersión ${r.dispersion}`);
});

test("B1 bench: the command prints bench@2 with the bench@1 fields kept, and the counts follow the instance's own sends", () => {
  const corre = (ticks: number) => {
    const r = spawnSync(process.execPath, ["packages/server/src/bench.ts", "--bots", "40", "--ticks", String(ticks), "--warmup", "10", "--rounds", "3"], { cwd: raiz, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim().split("\n").at(-1)!);
  };
  const a = corre(41), b = corre(40);
  assert.equal(a.schema, SCHEMA);
  for (const k of ["personas", "ticks", "rondas", "entorno", "tickP50Ms", "tickP99Ms", "peorMs", "rondasP50", "huella", "margenSobreElTick"]) assert.ok(k in a, `falta ${k} (lectores de bench@1)`);
  assert.equal(a.rondasP50.length, 3);
  // ticks 11..41 timed: 15 with send (12..40) per round; the tick before (10) sent, so 15 whole cycles; 41 is a half cycle
  assert.equal(a.poblaciones.conEnvio.n, 45); assert.equal(a.poblaciones.sinEnvio.n, 48); assert.equal(a.poblaciones.ciclo.n, 45);
  assert.equal(b.poblaciones.conEnvio.n, 45); assert.equal(b.poblaciones.ciclo.n, 45);
  for (const k of ["cicloP50Ms", "tickConEnvioP50Ms", "tickSinEnvioP50Ms", "cicloP99Ms"]) assert.equal(a.metricas[k].rondas.length, 3);
  assert.equal(a.tickP50Ms, Math.round(a.metricas.tickConEnvioP50Ms.mediana * 100) / 100);
  assert.ok(a.avisos.some((x: string) => x.includes("p99 con pocas muestras")));
  assert.equal(typeof a.entorno.carga1m, "number");
});

const informe = (escala: number, ruido: number, extra: Record<string, unknown> = {}) => {
  const m = (v: number) => { const rs = [1, 1 + ruido, 1 - ruido, 1 + ruido / 2, 1 - ruido / 2].map((f) => v * escala * f); return { mediana: v * escala, min: Math.min(...rs), max: Math.max(...rs), dispersion: 0, rondas: rs }; };
  return {
    schema: SCHEMA, personas: 1000, ticks: 460, calentamiento: 60, rondas: 5, huella: "e1fe4763", fiable: true, avisos: [],
    entorno: { cpuModelo: "x", node: "v24", motor: "0.10.0", commit: "abc", carga1m: 1 },
    metricas: { cicloP50Ms: m(7.5), tickConEnvioP50Ms: m(7.3), tickSinEnvioP50Ms: m(0.22), cicloP99Ms: m(9.5), tickConEnvioP99Ms: m(9.2), tickSinEnvioP99Ms: m(0.4) },
    ...extra,
  };
};

test("B1 banco-comparar: worse by more than 10 % with tight rounds fails; the same with scattered rounds is only «ruido»", () => {
  const base = informe(1, 0.02);
  assert.equal(comparar(base, informe(1, 0.02)).empeora, false);
  assert.ok(comparar(base, informe(1, 0.02)).filas.every((f: { estado: string }) => f.estado === "igual"));
  const peor = comparar(base, informe(1.2, 0.02));
  assert.equal(peor.empeora, true); assert.ok(peor.filas.every((f: { estado: string }) => f.estado === "EMPEORA"));
  assert.equal(comparar(base, informe(1.08, 0.02)).empeora, false);          // under the 10 % line: not a failure
  const turbio = comparar(informe(1, 0.4), informe(1.2, 0.4));
  assert.equal(turbio.empeora, false); assert.ok(turbio.filas.every((f: { estado: string }) => f.estado === "ruido"));
  assert.ok(comparar(base, informe(0.8, 0.02)).filas.every((f: { estado: string }) => f.estado === "mejora"));
  assert.equal(comparar(base, informe(1.2, 0.02), { umbral: 0.25 }).empeora, false);
});

test("B1 banco-comparar: another scene, another machine or a bench@1 file is not comparable; the CLI exits 0 / 1 / 2", () => {
  const base = informe(1, 0.02);
  assert.deepEqual(noComparables(base, informe(1, 0.02)), []);
  assert.ok(noComparables(base, informe(1, 0.02, { huella: "0dcb4245" }))[0].includes("escena distinta"));
  assert.ok(noComparables(base, informe(1, 0.02, { entorno: { cpuModelo: "otro", node: "v24" } }))[0].includes("aparato distinto"));
  assert.ok(noComparables({ schema: "numinia-engine/bench@1", tickP50Ms: 7 }, base)[0].includes("bench@1"));
  assert.equal(leerInforme(`ruido\n${JSON.stringify(base)}\n`)?.schema, SCHEMA);
  const dir = mkdtempSync(join(tmpdir(), "banco-"));
  try {
    const f = (n: string, o: unknown) => { const p = join(dir, n); writeFileSync(p, JSON.stringify(o)); return p; };
    const b = f("base.json", base), igual = f("igual.json", informe(1, 0.02)), peor = f("peor.json", informe(1.2, 0.02)), otra = f("otra.json", informe(1, 0.02, { huella: "x" }));
    const cli = (...a: string[]) => spawnSync(process.execPath, ["tools/banco-comparar.mjs", ...a], { cwd: raiz, encoding: "utf8" });
    const r0 = cli(b, igual), r1 = cli(b, peor), r2 = cli(b, otra), r3 = cli(b, otra, "--forzar");
    assert.equal(r0.status, 0, r0.stderr); assert.match(r0.stdout, /no empeora/);
    assert.equal(r1.status, 1); assert.match(r1.stdout, /tick con envío p50 .* EMPEORA/);
    assert.equal(r2.status, 2); assert.match(r2.stderr, /escena distinta/);
    assert.equal(r3.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
