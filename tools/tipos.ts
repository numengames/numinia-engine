// tipos: the strict TypeScript gate (BACKLOG D1), run as a RATCHET.
// `tsc -p tsconfig.json` (strict, noEmit) already finds errors today; fixing them all in one go would mean editing
// hundreds of files at once. So the gate does not ask for 0 errors yet. It asks for «no new ones»: every file that
// still has errors is listed in tools/tipos-permitidos.json with how many it may have, and
//   - a file that is not listed must have 0 errors (so every package at 0 stays at 0),
//   - a listed file may not have MORE than its allowance,
//   - a file that has fewer is good news: the gate says so and `--fijar` lowers the allowance (it never raises it).
// The allowance is per file, not per line, so editing a file does not move the baseline; swapping one error for
// another in the same file is not caught (the price of not pinning line numbers).
// Usage:
//   npm run tipos                  → check (exit 1 on a new error); prints errors and allowance per package
//   npm run tipos -- --fijar       → write/lower the allowance list (refuses to raise one)
//   npm run tipos -- --fijar --subir  → write the current counts even if some went up (first time, or on purpose)
//   npm run tipos -- --todo        → also print every error line
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const PERMITIDOS = join(root, "tools/tipos-permitidos.json");

/** tsc output → { file: number of errors } (lines like `a/b.ts(12,3): error TS2345: ...`; continuation lines ignored). */
export type Conteo = Record<string, number>;

export function contar(salida: unknown): Conteo {
  const porArchivo: Conteo = {};
  for (const l of String(salida).split("\n")) {
    const m = /^(\S.*?)\(\d+,\d+\): error TS\d+/.exec(l);
    if (m) porArchivo[m[1]] = (porArchivo[m[1]] ?? 0) + 1;
  }
  return porArchivo;
}

/** The package a file belongs to: `packages/x`, `apps/x`, `features/x`, else its first folder (`test`, `tools`). */
export function paquete(archivo: string): string {
  const p = archivo.split("/");
  return ["packages", "apps", "features"].includes(p[0]) && p.length > 2 ? `${p[0]}/${p[1]}` : p[0];
}

/** Current counts vs allowance → what is new, what improved. Pure: the test covers it. */
export type Diferencia = { archivo: string; tiene: number; permitidos: number };
export function comparar(actuales: Conteo, permitidos: Conteo): { nuevos: Diferencia[]; mejoran: Diferencia[] } {
  const nuevos: Diferencia[] = [], mejoran: Diferencia[] = [];
  for (const [f, n] of Object.entries(actuales)) {
    const tope = permitidos[f] ?? 0;
    if (n > tope) nuevos.push({ archivo: f, tiene: n, permitidos: tope });
  }
  for (const [f, tope] of Object.entries(permitidos)) {
    const n = actuales[f] ?? 0;
    if (n < tope) mejoran.push({ archivo: f, tiene: n, permitidos: tope });
  }
  return { nuevos, mejoran };
}

/** Per package: errors now and errors allowed. A package missing from the list of errors is at 0. */
export function resumenPorPaquete(actuales: Conteo, permitidos: Conteo, paquetes: string[] = []): Record<string, { errores: number; permitidos: number }> {
  const r: Record<string, { errores: number; permitidos: number }> = {};
  for (const p of paquetes) r[p] = { errores: 0, permitidos: 0 };
  for (const [f, n] of Object.entries(actuales)) (r[paquete(f)] ??= { errores: 0, permitidos: 0 }).errores += n;
  for (const [f, n] of Object.entries(permitidos)) (r[paquete(f)] ??= { errores: 0, permitidos: 0 }).permitidos += n;
  return r;
}

/** The new allowance list after `--fijar`: counts of today, files at 0 dropped. `subir` lets a count rise. */
export function fijar(actuales: Conteo, permitidos: Conteo, subir = false): { lista: Conteo; sube: string[] } {
  const sube: string[] = [], lista: Conteo = {};
  for (const f of Object.keys(actuales).sort()) {
    const tope = permitidos[f] ?? 0;
    if (actuales[f] > tope && !subir) { sube.push(f); lista[f] = tope; } else lista[f] = actuales[f];
    if (lista[f] === 0) delete lista[f];
  }
  return { lista, sube };
}

export function leerPermitidos(): Conteo {
  if (!existsSync(PERMITIDOS)) return {};
  return JSON.parse(readFileSync(PERMITIDOS, "utf8")).archivos ?? {};
}

/** Runs tsc once. Returns { actuales, salida, status }; a crash of tsc itself (no `error TS` lines) is reported as a failure. */
export function correrTsc(): { actuales: Conteo; salida: string; status: number | null } {
  const tsc = join(root, "node_modules/typescript/bin/tsc");
  const r = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--pretty", "false"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { actuales: contar(salida), salida, status: r.status };
}

/** The gate: [ok, one-line summary]. Used by tools/gates.mjs. */
export function puerta(): [boolean, string] {
  const { actuales, salida, status } = correrTsc();
  const total = Object.values(actuales).reduce((a, b) => a + b, 0);
  if (status !== 0 && total === 0) return [false, `tsc no pudo correr: ${salida.trim().split("\n")[0] ?? "sin salida"}`];
  const permitidos = leerPermitidos();
  const { nuevos } = comparar(actuales, permitidos);
  const tope = Object.values(permitidos).reduce((a, b) => a + b, 0);
  if (nuevos.length) return [false, `${nuevos.length} archivo(s) con errores nuevos, p. ej. ${nuevos[0].archivo} (${nuevos[0].tiene} > ${nuevos[0].permitidos}); npm run tipos`];
  return [true, `${total} errores, ${tope} permitidos en ${Object.keys(permitidos).length} archivos, 0 nuevos`];
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const { actuales, salida, status } = correrTsc();
  const total = Object.values(actuales).reduce((a, b) => a + b, 0);
  if (status !== 0 && total === 0) { console.error(`tsc no pudo correr:\n${salida}`); process.exit(1); }
  const permitidos = leerPermitidos();
  if (args.includes("--todo")) console.log(salida.trim());
  if (args.includes("--fijar")) {
    const { lista, sube } = fijar(actuales, permitidos, args.includes("--subir"));
    if (sube.length) { console.error(`No se fija: ${sube.length} archivo(s) tienen MÁS errores que su tope (${sube.slice(0, 5).join(", ")}). Arréglalos, o usa --subir si es a propósito.`); process.exit(1); }
    writeFileSync(PERMITIDOS, `${JSON.stringify({ nota: "Tope de errores de tsc estricto por archivo (ratchet). Un archivo que no sale aquí debe tener 0. Solo baja: npm run tipos -- --fijar", archivos: lista }, null, 2)}\n`);
    console.log(`tools/tipos-permitidos.json: ${Object.keys(lista).length} archivos, ${Object.values(lista).reduce((a, b) => a + b, 0)} errores permitidos.`);
    process.exit(0);
  }
  const paquetes = [...new Set(spawnSync("git", ["ls-files", "*.ts"], { cwd: root, encoding: "utf8" }).stdout.split("\n").filter(Boolean).map(paquete))].sort();
  const res = resumenPorPaquete(actuales, permitidos, paquetes);
  const w = (s: unknown, n: number) => String(s).padEnd(n);
  console.log(`${w("Paquete", 24)}${w("Errores", 10)}Permitidos`);
  for (const [p, v] of Object.entries(res).sort()) console.log(`${w(p, 24)}${w(v.errores, 10)}${v.permitidos}${v.errores === 0 && v.permitidos === 0 ? "   ← en 0, protegido" : ""}`);
  const { nuevos, mejoran } = comparar(actuales, permitidos);
  console.log(`\nTotal: ${total} errores en ${Object.keys(actuales).length} archivos; ${Object.values(permitidos).reduce((a, b) => a + b, 0)} permitidos en ${Object.keys(permitidos).length}.`);
  if (mejoran.length) console.log(`Bajaron ${mejoran.length} archivo(s) (npm run tipos -- --fijar baja el tope): ${mejoran.slice(0, 5).map((m) => `${m.archivo} ${m.permitidos}→${m.tiene}`).join(", ")}${mejoran.length > 5 ? "…" : ""}`);
  if (nuevos.length) {
    console.error(`\n${nuevos.length} archivo(s) con errores NUEVOS:`);
    for (const n of nuevos) console.error(`  ${n.archivo}: ${n.tiene} (permitidos ${n.permitidos})`);
    for (const l of salida.split("\n")) if (nuevos.some((n) => l.startsWith(`${n.archivo}(`))) console.error(`    ${l}`);
    process.exit(1);
  }
  console.log("Sin errores nuevos.");
}
