// Blank World · a TYPE of world (plantillas/blank-world), chosen by name with MOTOR_PLANTILLA (default `taller`).
// A new folder is born from it once; a world that exists is never re-born; the default Taller does not move.
// Its words are English (the default language of every world); it carries a CC0 licence file and no mark of any kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carpetaMundo, esMundoNuevo, PLANTILLAS, plantillaPorNombre, sembrar, TALLER } from "../packages/server/src/mundo-carpeta.ts";
import { leerFicha } from "../packages/server/src/aventura.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const todos = (d: string) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(d.length + 1)).sort();
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));

/** Exactly what a new Blank World folder holds (besides mundo.json / datos / claves, which the server makes after). */
export const ESPERADOS_BLANK = [
  "aventura/ficha.json", "aventura/LEEME-IA.md", "aventura/LICENSE.md",
  "entorno/ancestros.json", "entorno/dardos.json", "entorno/entorno.json", "entorno/espacio-base.json", "entorno/lucha.json", "entorno/naturaleza.json", "entorno/pesca.json",
].sort();

const BLANK = plantillaPorNombre("blank-world");
const ruta = (): string => { assert.ok(BLANK.ok, "plantillas/blank-world exists"); return BLANK.ok ? BLANK.ruta : ""; };

test("MOTOR_PLANTILLA=blank-world resolves; the default is still the Taller", () => {
  assert.ok(BLANK.ok); if (BLANK.ok) assert.equal(BLANK.ruta, join(PLANTILLAS, "blank-world"));
  const d = plantillaPorNombre(undefined); assert.ok(d.ok); if (d.ok) { assert.equal(d.nombre, "taller"); assert.equal(d.ruta, TALLER); }
  const noExiste = plantillaPorNombre("nada"); assert.equal(noExiste.ok, false);
  if (!noExiste.ok) assert.match(noExiste.error, /blank-world/, "the error names the template");
});

test("a new folder is born with exactly the Blank World files: no mission, no guide, no cable, no pond, dartboard, creature or hall", () => {
  const c = carpetaMundo(join(tmp("pv-blank-"), "mundo")), log: string[] = [];
  assert.equal(esMundoNuevo(c), true);
  assert.equal(sembrar(c, (l) => log.push(l), undefined, ruta(), "blank-world"), true);
  assert.deepEqual(todos(c.raiz), ESPERADOS_BLANK);
  assert.match(log.join("\n"), /nace de la plantilla «blank-world»/);
  assert.deepEqual(readdirSync(c.raiz).filter((f) => f.startsWith(".")), [], "no half copy left behind");
  assert.equal(existsSync(join(c.entorno, "disparadores.json")), false, "no cables: the first one a visitor writes creates the file");
  assert.equal(json(join(c.entorno, "espacio-base.json")).activa, false, "the base space (which plants the Khepri logo) is off");
  assert.deepEqual(json(join(c.entorno, "naturaleza.json")), { schema: "numinia-engine/naturaleza@1", activa: false });
  assert.deepEqual(json(join(c.entorno, "pesca.json")).sitios, []);
  assert.deepEqual(json(join(c.entorno, "dardos.json")).sitios, []);
  assert.deepEqual(json(join(c.entorno, "lucha.json")).criaturas, []);
  const anc = json(join(c.entorno, "ancestros.json")); assert.deepEqual([anc.hologramas, anc.muros], [[], []]);
});

test("the sheet: English name and words, semantic version, creator Numen Games, owner pending", () => {
  const f = leerFicha(join(ruta(), "aventura")); assert.deepEqual(f.problemas, []);
  assert.equal(f.ficha?.nombre, "Blank World");
  assert.match(String(f.ficha?.version), /^\d+\.\d+\.\d+$/);
  assert.equal(f.ficha?.creador, "Numen Games"); assert.equal(f.ficha?.dueno, "pending");
  for (const x of todos(ruta())) assert.doesNotMatch(readFileSync(join(ruta(), x), "utf8"), /[áéíóúñ¿¡]/, `${x} is English (no Spanish letters)`);
});

test("the licence file is CC0, points to TRADEMARKS.md, and no file of the world ships a mark", () => {
  const lic = readFileSync(join(ruta(), "aventura", "LICENSE.md"), "utf8");
  assert.match(lic, /CC0 1\.0 Universal/); assert.match(lic, /TRADEMARKS\.md/);
  for (const x of todos(ruta())) assert.ok(!/\.(png|jpe?g|svg|webp|glb)$/i.test(x), `${x}: a world with no image or model carries no logo`);
  assert.match(readFileSync("REUSE.toml", "utf8"), /path = "plantillas\/blank-world\/\*\*"/);
});

test("a world that already exists is NOT re-born as Blank World", () => {
  const c = carpetaMundo(join(tmp("pv-blank-viejo-"), "mundo"));
  sembrar(c); // born as Taller
  writeFileSync(join(c.aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Mío" }));
  const antes = todos(c.raiz).map((f) => [f, readFileSync(join(c.raiz, f), "utf8")]);
  assert.equal(sembrar(c, () => {}, undefined, ruta(), "blank-world"), false);
  assert.deepEqual(todos(c.raiz).map((f) => [f, readFileSync(join(c.raiz, f), "utf8")]), antes);
});

test("the CLI an author uses accepts the shipped template", () => {
  const cli = spawnSync(process.execPath, ["tools/aventura.ts", join(ruta(), "aventura")], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr); assert.match(cli.stdout, /Todo en orden/); assert.match(cli.stdout, /ficha: «Blank World»/);
});

const puertaLibre = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
const limpio = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_|AVENTURA_DIR|DATOS_DIR|MUNDO_DIR|ACTIVOS_DIR|SESIONES_DIR|JWT_SECRET|ADMIN_CODE)/.test(k)));

test("the real server with MOTOR_PLANTILLA=blank-world on a fresh folder starts an empty English world", async () => {
  const raiz = join(tmp("pv-blank-srv-"), "mundo"), PORT = await puertaLibre();
  const srv = spawn(process.execPath, ["packages/server/src/main.ts"], { env: { ...limpio(), PORT: String(PORT), HOST: "127.0.0.1", MOTOR_MUNDO: raiz, MOTOR_PLANTILLA: "blank-world", MOTOR_HABITANTES: "no" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; srv.stdout.on("data", (d) => { log += d; }); srv.stderr.on("data", (d) => { log += d; });
  try {
    for (let i = 0; i < 150 && !log.includes("[instancia]"); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(log.includes("[instancia]"), log);
    for (const re of [/nace de la plantilla «blank-world»/, /pesca: 0 sitio\(s\)/, /lucha: 0 criatura\(s\)/, /dardos: 0 diana\(s\)/, /naturaleza: apagada/, /\[ficha\] el mundo se llama «Blank World»/]) assert.match(log, re);
    assert.doesNotMatch(log, /sin ficha|no se usa|problema|desconocida|clave desconocida/i, "no file of the template is refused by the engine");
    const st = await (await fetch(`http://127.0.0.1:${PORT}/status`)).json() as Record<string, unknown>;
    assert.equal(st.nombre, "Blank World"); assert.notEqual(st.espacioBase, true);
    assert.ok(ESPERADOS_BLANK.every((f) => existsSync(join(raiz, f)))); assert.ok(existsSync(join(raiz, "mundo.json")));
  } finally { srv.kill("SIGTERM"); await new Promise((r) => setTimeout(r, 300)); }
});
