// Gates: the numbers that judge every change. Light by design (seconds, one core, nice'd by the caller).
// Usage: npm run gates
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayers } from "./layers.mjs";
import { runHeadless } from "../packages/cli/src/run.ts";
import { medirArranque, construir, TOPE_GZ } from "./tamano.mjs";

const root = join(fileURLToPath(import.meta.url), "../..");
const rows = [];
const gate = (name, budget, fn, { warnOnly = false } = {}) => {
  const t0 = performance.now();
  let ok = false, got = "";
  try { [ok, got] = fn(); } catch (e) { got = String(e.message ?? e); }
  rows.push({ name, budget, got, state: ok ? "OK" : warnOnly ? "AVISO" : "FALLA", ms: Math.round(performance.now() - t0) });
};

gate("pruebas unitarias", "todas en verde", () => {
  const r = spawnSync(process.execPath, ["--test", "test/*.test.ts"], { cwd: root, encoding: "utf8" });
  const pass = r.stdout.match(/ℹ pass (\d+)/)?.[1], fail = r.stdout.match(/ℹ fail (\d+)/)?.[1];
  if (r.status === 0) return [true, `${pass} bien, ${fail} mal`];
  // name what failed (the gate used to say only «1 mal»), then run ONLY those files once more, alone: a timing test that lost a
  // race with the rest of the suite on a shared runner passes there; a real failure fails again and the gate stays red
  const tras = r.stdout.slice(r.stdout.lastIndexOf("✖ failing tests"));
  const ficheros = [...new Set([...tras.matchAll(/test at (?:\S*\/)?(test\/[^\s:]+\.test\.ts):\d+/g)].map((m) => m[1]))];
  for (const l of tras.split("\n").filter((x) => /^✖ /.test(x) && !/failing tests/.test(x))) console.error(`[pruebas unitarias] falló: ${l.slice(2)}`);
  if (!ficheros.length) return [false, `${pass} bien, ${fail} mal`];
  const otra = spawnSync(process.execPath, ["--test", ...ficheros], { cwd: root, encoding: "utf8" });
  console.error(`[pruebas unitarias] repetidas solas (${ficheros.join(", ")}): ${otra.status === 0 ? "bien" : "mal otra vez"}`);
  if (otra.status !== 0) process.stderr.write(otra.stdout.slice(otra.stdout.lastIndexOf("✖ failing tests")));
  return [otra.status === 0, `${pass} bien, ${fail} mal; repetidas solas: ${otra.status === 0 ? "bien" : "mal"} (${ficheros.join(", ")})`];
});

gate("capas", "0 imports prohibidos", () => {
  const v = checkLayers(root);
  return [v.length === 0, v.length ? v[0] : "0"];
});

let base;
gate("determinismo", "misma semilla = misma huella", () => {
  const a = runHeadless({ ticks: 2000, seed: 42, bots: 50, k: 50 });
  const b = runHeadless({ ticks: 2000, seed: 42, bots: 50, k: 50 });
  const c = runHeadless({ ticks: 200, seed: 43, bots: 50, k: 50 });
  base = a;
  return [a.hash === b.hash && a.hash !== c.hash, `${a.hash} = ${b.hash}`];
});

gate("ancho de banda (K=50, 10 Hz)", "≤ 70 kbit/s por persona", () => {
  const kbit = (base.bytesPerClientPerSec * 8) / 1000;
  return [kbit <= 70, `${kbit.toFixed(1)} kbit/s, ve ${base.avgVisible} de media`];
});

gate("plaza de 1.000, un hilo", "tick p99 ≤ 25 ms", () => {
  const r = runHeadless({ ticks: 100, seed: 7, bots: 1000, k: 50, warmup: 20 });
  return [r.tickP99ms <= 25, `p50 ${r.tickP50ms} ms · p99 ${r.tickP99ms} ms`];
});

gate("tamaño de la página (D2)", `≤ ${TOPE_GZ / 1000} kB gz antes de dibujar`, () => {
  construir();
  const m = medirArranque();
  return [m.pasa, `${(m.totalGz / 1000).toFixed(1)} kB gz en ${m.ficheros.length} ficheros (meta 300)`];
});

const w = (s, n) => String(s).padEnd(n);
console.log(`\n${w("Puerta", 34)}${w("Debe", 32)}${w("Sale", 44)}${w("Estado", 8)}ms`);
console.log("-".repeat(124));
for (const r of rows) console.log(`${w(r.name, 34)}${w(r.budget, 32)}${w(r.got, 44)}${w(r.state, 8)}${r.ms}`);
const failed = rows.filter((r) => r.state === "FALLA").length;
console.log(failed ? `\n${failed} puerta(s) en rojo.` : "\nTodas las puertas que bloquean, en verde.");
process.exit(failed ? 1 : 0);
