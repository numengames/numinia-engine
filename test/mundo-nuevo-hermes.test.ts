// El mundo de Hermes · un TIPO de mundo (plantillas/hermes), elegido por nombre con MOTOR_PLANTILLA (por defecto `taller`).
// A new folder is born from the chosen template once; a world that exists is never re-born; without the variable the Taller comes out exactly as before.
// The Taller's own test (test/mundo-nuevo-taller.test.ts) is NOT changed: it is the proof that the default did not move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carpetaMundo, esMundoNuevo, PLANTILLAS, plantillaPorNombre, sembrar, TALLER } from "../packages/server/src/mundo-carpeta.ts";
import { leerFicha } from "../packages/server/src/aventura.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const todos = (d: string) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(d.length + 1)).sort();
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));

/** Exactly what a new Hermes world's folder holds (besides mundo.json / datos / claves, which the server makes after). */
export const ESPERADOS_HERMES = [
  "aventura/ficha.json", "aventura/LEEME-IA.md",
  "entorno/ancestros.json", "entorno/dardos.json", "entorno/espacio-base.json", "entorno/lucha.json", "entorno/naturaleza.json", "entorno/pesca.json",
].sort();

const HERMES = plantillaPorNombre("hermes");
const ruta = (): string => { assert.ok(HERMES.ok, "plantillas/hermes existe"); return HERMES.ok ? HERMES.ruta : ""; };

test("MOTOR_PLANTILLA: unset or empty = taller; `hermes` resolves; wrong names say what exists and never throw", () => {
  for (const sin of [undefined, "", "  "]) { const r = plantillaPorNombre(sin); assert.ok(r.ok); if (r.ok) { assert.equal(r.nombre, "taller"); assert.equal(r.ruta, TALLER); } }
  const h = plantillaPorNombre("hermes"); assert.ok(h.ok); if (h.ok) assert.equal(h.ruta, join(PLANTILLAS, "hermes"));
  for (const mala of ["../taller", "taller/../hermes", "/etc", "Hermes", "a b", "x".repeat(40), "apps"]) {
    const r = plantillaPorNombre(mala); assert.equal(r.ok, false, mala);
    if (!r.ok) assert.match(r.error, /MOTOR_PLANTILLA/);
  }
  const noExiste = plantillaPorNombre("nada"); assert.equal(noExiste.ok, false);
  if (!noExiste.ok) { assert.match(noExiste.error, /no existe/); assert.match(noExiste.error, /hermes/); assert.match(noExiste.error, /taller/); assert.doesNotMatch(noExiste.error, /apps/, "plantillas/apps is not a world template"); }
});

test("a new folder with MOTOR_PLANTILLA=hermes is born with exactly the Hermes files — no Taller missions, no Lumen, no pond, no dartboard, no creature, no hall", () => {
  const c = carpetaMundo(join(tmp("pv-hermes-"), "mundo")), log: string[] = [];
  assert.equal(esMundoNuevo(c), true);
  const p = plantillaPorNombre("hermes"); assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(sembrar(c, (l) => log.push(l), undefined, p.ruta, p.nombre), true);
  assert.deepEqual(todos(c.raiz), ESPERADOS_HERMES);
  assert.match(log.join("\n"), /nace de la plantilla «hermes»/);
  assert.doesNotMatch(log.join("\n"), /Taller/);
  assert.deepEqual(readdirSync(c.raiz).filter((f) => f.startsWith(".")), [], "no half copy left behind");
  const f = leerFicha(c.aventura); assert.deepEqual(f.problemas, []); assert.equal(f.ficha?.nombre, "Hermes");
  assert.deepEqual(json(join(c.entorno, "naturaleza.json")), { schema: "numinia-engine/naturaleza@1", activa: false });
  assert.equal(json(join(c.entorno, "espacio-base.json")).activa, false, "not the Taller's base space");
  assert.deepEqual(json(join(c.entorno, "pesca.json")).sitios, []);
  assert.deepEqual(json(join(c.entorno, "dardos.json")).sitios, []); assert.equal(json(join(c.entorno, "dardos.json")).enlace, false);
  assert.deepEqual(json(join(c.entorno, "lucha.json")).criaturas, []);
  const anc = json(join(c.entorno, "ancestros.json")); assert.deepEqual([anc.hologramas, anc.muros], [[], []]);
  for (const f2 of ["pnj/lumen.json", "misiones/01-abre-el-taller.json"]) assert.equal(existsSync(join(c.aventura, f2)), false, f2);
});

test("without MOTOR_PLANTILLA the Taller comes out exactly as before: same files, byte for byte, as the explicit `taller`", () => {
  const a = carpetaMundo(join(tmp("pv-def-a-"), "mundo")), b = carpetaMundo(join(tmp("pv-def-b-"), "mundo"));
  sembrar(a); // the call every existing caller makes
  const t = plantillaPorNombre(undefined); assert.ok(t.ok);
  if (!t.ok) return;
  sembrar(b, () => {}, undefined, t.ruta, t.nombre);
  assert.deepEqual(todos(a.raiz), todos(b.raiz)); assert.deepEqual(todos(a.raiz), todos(TALLER));
  for (const f of todos(a.raiz)) assert.equal(readFileSync(join(a.raiz, f), "utf8"), readFileSync(join(TALLER, f), "utf8"), f);
});

test("a world that already exists is NOT re-born as Hermes: the variable only matters for a NEW folder", () => {
  const c = carpetaMundo(join(tmp("pv-hermes-viejo-"), "mundo"));
  sembrar(c); // born as Taller
  writeFileSync(join(c.aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Mío" }));
  const antes = todos(c.raiz).map((f) => [f, readFileSync(join(c.raiz, f), "utf8")]);
  assert.equal(sembrar(c, () => {}, undefined, ruta(), "hermes"), false);
  assert.deepEqual(todos(c.raiz).map((f) => [f, readFileSync(join(c.raiz, f), "utf8")]), antes);
  // and an old install (data but no aventura/) still gets the example adventure, never the Hermes template
  const d = carpetaMundo(join(tmp("pv-hermes-datos-"), "mundo"));
  mkdirSync(d.datos, { recursive: true }); writeFileSync(join(d.datos, "objetos.json"), "{}");
  assert.equal(sembrar(d, () => {}, undefined, ruta(), "hermes"), true);
  assert.ok(existsSync(join(d.aventura, "pnj", "alma.json")), "the example adventure, as before");
  assert.equal(existsSync(join(d.aventura, "LEEME-IA.md")) && readFileSync(join(d.aventura, "LEEME-IA.md"), "utf8").includes("mundo de Hermes"), false, "not the Hermes note");
  assert.equal(existsSync(join(d.entorno, "pesca.json")), false, "no Hermes entorno/ either");
});

test("the shipped plantillas/hermes holds exactly the files the birth is tested for, and the CLI an author uses accepts it", () => {
  assert.deepEqual(todos(ruta()), ESPERADOS_HERMES);
  for (const f of todos(ruta()).filter((x) => x.endsWith(".json"))) assert.doesNotThrow(() => JSON.parse(readFileSync(join(ruta(), f), "utf8")), f);
  const cli = spawnSync(process.execPath, ["tools/aventura.ts", join(ruta(), "aventura")], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr); assert.match(cli.stdout, /Todo en orden/); assert.match(cli.stdout, /ficha: «Hermes»/);
});

const puertaLibre = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
const limpio = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_|AVENTURA_DIR|DATOS_DIR|MUNDO_DIR|ACTIVOS_DIR|SESIONES_DIR|JWT_SECRET|ADMIN_CODE)/.test(k)));

test("the real server with MOTOR_PLANTILLA=hermes on a fresh folder starts the Hermes world and only it; a wrong name stops the start with what to fix", async () => {
  const raiz = join(tmp("pv-hermes-srv-"), "mundo"), PORT = await puertaLibre();
  const srv = spawn(process.execPath, ["packages/server/src/main.ts"], { env: { ...limpio(), PORT: String(PORT), HOST: "127.0.0.1", MOTOR_MUNDO: raiz, MOTOR_PLANTILLA: "hermes", MOTOR_HABITANTES: "no" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; srv.stdout.on("data", (d) => { log += d; }); srv.stderr.on("data", (d) => { log += d; });
  try {
    for (let i = 0; i < 150 && !log.includes("[instancia]"); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(log.includes("[instancia]"), log);
    for (const re of [/nace de la plantilla «hermes»/, /\[aventura\] /, /pesca: 0 sitio\(s\)/, /lucha: 0 criatura\(s\)/, /dardos: 0 diana\(s\)/, /naturaleza: apagada/, /\[ficha\] el mundo se llama «Hermes»/]) assert.match(log, re);
    assert.doesNotMatch(log, /sin ficha|no se usa|problema|desconocida|clave desconocida/i, "no file of the template is refused by the engine");
    const st = await (await fetch(`http://127.0.0.1:${PORT}/status`)).json() as Record<string, unknown>;
    assert.equal(st.nombre, "Hermes"); assert.notEqual(st.espacioBase, true);
    assert.ok(ESPERADOS_HERMES.every((f) => existsSync(join(raiz, f)))); assert.ok(existsSync(join(raiz, "mundo.json")));
  } finally { srv.kill("SIGTERM"); await new Promise((r) => setTimeout(r, 300)); }
  const mala = spawnSync(process.execPath, ["packages/server/src/main.ts"], { env: { ...limpio(), PORT: String(await puertaLibre()), HOST: "127.0.0.1", MOTOR_MUNDO: join(tmp("pv-hermes-mala-"), "mundo"), MOTOR_PLANTILLA: "nada" }, encoding: "utf8", timeout: 20000 });
  assert.equal(mala.status, 1); assert.match(mala.stderr, /no arranco: MOTOR_PLANTILLA «nada» no existe/);
});
