// ci-gates: bench + gates + size on every PR, compared against `main` by RATIO (not just a fixed
// budget). Mejora #8 de work/biblioteca-motores/ESTUDIO/benchmarks-industria.md (fila 39: "regresión en
// CI con línea base", como Bevy --save-baseline o Godot a_div_b); BACKLOG X6 pide exactamente este
// workflow. Usage:
//   node tools/ci-gates.mjs                 → HEAD vs origin/main (o main), tope 10 %
//   node tools/ci-gates.mjs --tope 1.15     → tope distinto
//   node tools/ci-gates.mjs --base <ref>    → comparar contra otra rama/commit
// Qué hace: corre `npm run gates` en el árbol actual; corre `bench.ts` (3 rondas) y `tools/tamano.mjs`
// en HEAD y, en un worktree TEMPORAL aparte (nunca el checkout que llama a este script), en la rama
// base; compara tickP50Ms y el tamaño de página gz; si HEAD empeora más del tope, o si las puertas
// fallan, sale 1. Un informe JSON queda en informes/ci-gates-<sha>.json.
// Ligero a propósito pero no gratis: dos builds + dos bench + un `npm ci` del worktree base (red solo
// para el `git fetch` del ref base). Pensado para CI (minutos), no para el gate rápido de cada commit.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TOPE = Number(arg("tope", "1.10")); // 10 % de margen, como pide la mejora #8
const BASE_REF_ARG = arg("base", null);

/** Ratio HEAD/base (> 1 = HEAD peor cuando la métrica es "menos es mejor"). Puro, sin I/O: lo prueba el test. */
export const ratio = (head, base) => (base > 0 ? head / base : head > 0 ? Infinity : 1);
/** Si ese ratio pasa el tope de la casa (10 % por defecto, mejora #8). */
export const empeora = (r, tope = TOPE) => r > tope;

function sh(cmd, args, { cwd = root, permitirFallo = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0 && !permitirFallo) {
    throw new Error(`${cmd} ${args.join(" ")} (en ${cwd}) → código ${r.status}\n${r.stderr || r.stdout}`);
  }
  return r;
}

function benchYTamano(dir) {
  const benchOut = sh("node", ["packages/server/src/bench.ts", "--bots", "300", "--ticks", "300", "--rounds", "3"], { cwd: dir }).stdout.trim();
  const bench = JSON.parse(benchOut.split("\n").pop());
  const tamanoOut = sh("node", ["tools/tamano.mjs", "--build"], { cwd: dir, permitirFallo: true }).stdout;
  const totalGz = Number(/\((\d+) B\)/.exec(tamanoOut)?.[1] ?? NaN);
  return { tickP50Ms: bench.tickP50Ms, tickP99Ms: bench.tickP99Ms, totalGz };
}

function prepararBase(ref) {
  sh("git", ["fetch", "origin", ref.replace(/^origin\//, "")], { permitirFallo: true });
  const dir = mkdtempSync(join(tmpdir(), "ci-gates-base-"));
  sh("git", ["worktree", "add", "--detach", dir, ref]);
  sh("npm", ["ci", "--no-audit", "--no-fund"], { cwd: dir });
  return dir;
}

function limpiar(dir) {
  try { sh("git", ["worktree", "remove", "--force", dir]); } catch { /* best effort */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const baseRef = BASE_REF_ARG ?? (sh("git", ["rev-parse", "--verify", "origin/main"], { permitirFallo: true }).status === 0 ? "origin/main" : "main");
  console.log(`Puertas de PR: HEAD vs ${baseRef} (tope ${Math.round((TOPE - 1) * 100)} %)\n`);

  const gatesHead = spawnSync("node", ["tools/gates.mjs"], { cwd: root, encoding: "utf8" });
  process.stdout.write(gatesHead.stdout);
  const gatesOk = gatesHead.status === 0;

  const headStats = benchYTamano(root);
  let baseDir, baseStats;
  try {
    baseDir = prepararBase(baseRef);
    baseStats = benchYTamano(baseDir);
  } finally {
    if (baseDir) limpiar(baseDir);
  }

  const rTick = ratio(headStats.tickP50Ms, baseStats.tickP50Ms);
  const rGz = ratio(headStats.totalGz, baseStats.totalGz);
  const filas = [
    ["tick p50 (bench 300)", headStats.tickP50Ms, baseStats.tickP50Ms, rTick],
    ["tamaño de página (gz)", headStats.totalGz, baseStats.totalGz, rGz],
  ];
  const w = (s, n) => String(s).padEnd(n);
  console.log(`\n${w("Medida", 26)}${w("HEAD", 12)}${w(baseRef, 18)}ratio`);
  for (const [n, h, b, r] of filas) console.log(`${w(n, 26)}${w(h, 12)}${w(b, 18)}${r.toFixed(3)}${empeora(r) ? "  ← empeora" : ""}`);

  const peor = filas.some(([, , , r]) => empeora(r));
  const sha = sh("git", ["rev-parse", "--short", "HEAD"]).stdout.trim();
  const informe = { schema: "numinia-engine/ci-gates@1", sha, baseRef, tope: TOPE, gatesOk, head: headStats, base: baseStats, ratios: { tick: rTick, tamano: rGz } };
  mkdirSync(join(root, "informes"), { recursive: true });
  writeFileSync(join(root, "informes", `ci-gates-${sha}.json`), JSON.stringify(informe, null, 2));

  const falla = !gatesOk || peor;
  console.log(falla ? "\nPuertas de PR en rojo." : "\nPuertas de PR en verde.");
  process.exit(falla ? 1 : 0);
}
