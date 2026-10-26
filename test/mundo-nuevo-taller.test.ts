// Primera vez · a NEW world is born with the Taller onboarding (Lumen + the 11 build-a-world missions + the sample cable «Botón rojo»)
// and nothing else — no example quests, no Ancestors hall, no fishing / darts / combat pieces, no other people. A world that already
// exists is never touched. The folder is plain files (file over app). The browser run is tools/e2e-piernas/mundo-nuevo-taller.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carpetaMundo, ESPACIO_BASE_NUEVO, esMundoNuevo, sembrar, TALLER } from "../packages/server/src/mundo-carpeta.ts";
import { leerFicha, lectorAventura } from "../packages/server/src/aventura.ts";
import { cargarAventura } from "../features/misiones/formato.ts";
import { ficheroNuevo } from "../features/espaciobase/server.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const todos = (d: string) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(d.length + 1)).sort();
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));

const MISIONES = ["01-abre-el-taller", "02-pon-un-farolillo", "03-muevelo", "04-apagalo", "05-mira-el-cable", "06-tu-primer-cable", "07-cuando-zona", "08-cuanto-espera", "09-varios-que", "10-encadena", "11-tu-mini-mision"];
const ENTORNO = ["ancestros", "dardos", "disparadores", "espacio-base", "lucha", "naturaleza", "pesca"];
/** Exactly what a new world's folder holds besides mundo.json / datos / claves (which the server makes after). */
const ESPERADOS = [
  "aventura/ficha.json", "aventura/LEEME-IA.md", ...MISIONES.map((m) => `aventura/misiones/${m}.json`), "aventura/pnj/lumen.json",
  ...ENTORNO.map((e) => `entorno/${e}.json`),
].sort();

test("a new world (the folder does not exist) is born with exactly the Taller files: Lumen, 11 missions, the sample cable, the espacio base", () => {
  const c = carpetaMundo(join(tmp("pv-nuevo-"), "mundo")), log: string[] = [];
  assert.equal(esMundoNuevo(c), true);
  assert.equal(sembrar(c, (l) => log.push(l)), true);
  assert.deepEqual(todos(c.raiz), ESPERADOS);
  assert.match(log.join("\n"), /mundo nuevo: nace con el onboarding del Taller/);
  assert.deepEqual(readdirSync(c.raiz).filter((f) => f.startsWith(".")), [], "no half copy left behind");
  // the espacio base look: on, default seed — the same words as the switch's file and as the legacy birth
  const base = json(join(c.entorno, "espacio-base.json"));
  assert.deepEqual(base, ESPACIO_BASE_NUEVO); assert.deepEqual(base, ficheroNuevo());
  // and each house piece written EMPTY or OFF so the new world has none of it
  assert.deepEqual(json(join(c.entorno, "naturaleza.json")), { schema: "numinia-engine/naturaleza@1", activa: false });
  assert.deepEqual(json(join(c.entorno, "pesca.json")).sitios, []);
  assert.deepEqual(json(join(c.entorno, "dardos.json")).sitios, []);
  assert.equal(json(join(c.entorno, "dardos.json")).enlace, false, "no AR darts link to the Tower either");
  assert.deepEqual(json(join(c.entorno, "lucha.json")).criaturas, []);
  const anc = json(join(c.entorno, "ancestros.json")); assert.deepEqual([anc.hologramas, anc.muros], [[], []], "no Salón de los Ancestros");
  assert.equal(existsSync(join(c.entorno, "entorno.json")), false, "the base space's own look: no entorno.json of the Taller's night");
  // the sample cable
  const cables = json(join(c.entorno, "disparadores.json")).disparadores;
  assert.deepEqual(cables.map((d: { id: string }) => d.id), ["boton-rojo"]);
  // no example content
  for (const f of ["pnj/alma.json", "pnj/bruno.json", "pnj/teo.json", "habitantes/lia.json", "misiones/primeros-pasos.json", "cosas/caja-de-bruno.json"]) assert.equal(existsSync(join(c.aventura, f)), false, f);
});

test("the born adventure loads clean: 11 chained missions, one person (Lumen), no things, no inhabitants, a name", () => {
  const c = carpetaMundo(join(tmp("pv-carga-"), "mundo"));
  sembrar(c);
  const leer = lectorAventura(c.aventura, () => {});
  const r = cargarAventura({ misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas"), secuencias: leer("secuencias") }, { modelo: () => true });
  assert.deepEqual(r.issues, []);
  const ids = [...r.aventura.misiones.keys()];
  assert.equal(ids.length, 11); assert.deepEqual(ids, MISIONES.map((m) => m.slice(3)));
  assert.deepEqual([...r.aventura.pnjs.keys()], ["lumen"]);
  assert.equal(r.aventura.cosas.size, 0);
  // the chain: only the first has no requirement; each next one asks for the one before
  const mis = MISIONES.map((m) => json(join(c.aventura, "misiones", `${m}.json`)));
  assert.equal(mis[0].requisitos, undefined);
  for (let i = 1; i < mis.length; i++) assert.deepEqual(mis[i].requisitos, { misiones: [ids[i - 1]] }, mis[i].id);
  const f = leerFicha(c.aventura); assert.deepEqual(f.problemas, []); assert.equal(f.ficha?.nombre, "Mundo nuevo");
  // the shipped template is checked by the same CLI an author uses
  const cli = spawnSync(process.execPath, ["tools/aventura.ts", join(TALLER, "aventura")], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /11 misiones .*1 personas \(lumen\), 0 cosas/); assert.match(cli.stdout, /Todo en orden/);
});

test("a world that already exists is NOT changed: with its aventura, with parts of its own, or with only its data", () => {
  // 1 · it has an aventura/ (edited): nothing is added anywhere, not even an entorno/
  const a = carpetaMundo(join(tmp("pv-viejo-a-"), "mundo"));
  mkdirSync(join(a.aventura, "pnj"), { recursive: true }); writeFileSync(join(a.aventura, "pnj", "mio.json"), "{\"mio\":true}");
  assert.equal(esMundoNuevo(a), false); assert.equal(sembrar(a), false);
  assert.deepEqual(todos(a.raiz), ["aventura/pnj/mio.json"]);
  // 2 · a world born by this engine, played with, edited: running `sembrar` again changes not one byte
  const n = carpetaMundo(join(tmp("pv-viejo-n-"), "mundo"));
  sembrar(n);
  writeFileSync(join(n.aventura, "misiones", "01-abre-el-taller.json"), "{\"cambiada\":true}");
  writeFileSync(join(n.entorno, "pesca.json"), JSON.stringify({ schema: "numinia-engine/pesca@1", sitios: [{ id: "x", nombre: "X", x: 1, y: 0, z: 1, radio: 2 }] }));
  rmSync(join(n.aventura, "pnj", "lumen.json"));
  const antes = todos(n.raiz).map((f) => [f, readFileSync(join(n.raiz, f), "utf8")]);
  assert.equal(sembrar(n), false);
  assert.deepEqual(todos(n.raiz).map((f) => [f, readFileSync(join(n.raiz, f), "utf8")]), antes);
  // 3 · an old install: data (and maybe its own entorno/) but no aventura/ — it gets what it always got (the example), never the Taller
  const d = carpetaMundo(join(tmp("pv-viejo-d-"), "mundo"));
  mkdirSync(d.datos, { recursive: true }); writeFileSync(join(d.datos, "objetos.json"), "{}");
  assert.equal(esMundoNuevo(d), false);
  assert.equal(sembrar(d), true);
  assert.ok(existsSync(join(d.aventura, "pnj", "alma.json")), "the example adventure, as before");
  assert.equal(existsSync(join(d.aventura, "pnj", "lumen.json")), false);
  assert.equal(readFileSync(join(d.datos, "objetos.json"), "utf8"), "{}");
  const e = carpetaMundo(join(tmp("pv-viejo-e-"), "mundo"));
  mkdirSync(e.entorno, { recursive: true }); writeFileSync(join(e.entorno, "naturaleza.json"), "{}");
  sembrar(e);
  assert.deepEqual(readdirSync(e.entorno), ["naturaleza.json"]); assert.ok(existsSync(join(e.aventura, "pnj", "alma.json")));
  const m = carpetaMundo(join(tmp("pv-viejo-m-"), "mundo"));
  mkdirSync(m.raiz, { recursive: true }); writeFileSync(m.manifiesto, "{}");
  assert.equal(esMundoNuevo(m), false);
});

test("an EMPTY folder that already exists (numinia.com's «crear mundo» hands one over) is born the same as a missing one", () => {
  const raiz = tmp("pv-vacia-");
  const c = carpetaMundo(raiz);
  assert.equal(esMundoNuevo(c), true);
  assert.equal(sembrar(c), true);
  assert.deepEqual(todos(raiz), ESPERADOS);
});

test("the shipped template folder has exactly the files the birth is tested for, and nothing in it is example content", () => {
  assert.deepEqual(todos(TALLER), ESPERADOS);
  assert.deepEqual(json(join(TALLER, "entorno", "espacio-base.json")), ESPACIO_BASE_NUEVO);
  for (const f of todos(TALLER).filter((x) => x.endsWith(".json"))) assert.doesNotThrow(() => JSON.parse(readFileSync(join(TALLER, f), "utf8")), f);
});

const puertaLibre = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });

test("the real server on a fresh folder starts the Taller and only it: 11 missions, 1 person, no pond, no dartboard, no creature, no nature, one cable", async () => {
  const raiz = join(tmp("pv-servidor-"), "mundo"), PORT = await puertaLibre();
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_|AVENTURA_DIR|DATOS_DIR|MUNDO_DIR|ACTIVOS_DIR|SESIONES_DIR|JWT_SECRET|ADMIN_CODE)/.test(k)));
  const srv = spawn(process.execPath, ["packages/server/src/main.ts"], { env: { ...env, PORT: String(PORT), HOST: "127.0.0.1", MOTOR_MUNDO: raiz, MOTOR_CONSTRUIR: "todos", MOTOR_HABITANTES: "no" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; srv.stdout.on("data", (d) => { log += d; }); srv.stderr.on("data", (d) => { log += d; });
  try {
    for (let i = 0; i < 150 && !log.includes("[instancia]"); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(log.includes("[instancia]"), log);
    for (const re of [/aventura: 11 misiones, 1 personas, 0 cosas/, /pesca: 0 sitio\(s\)/, /lucha: 0 criatura\(s\)/, /dardos: 0 diana\(s\)/, /naturaleza: apagada/, /espacio base: encendido \(semilla 42\)/, /disparadores: 1 disparador/, /\[ficha\] el mundo se llama «Mundo nuevo»/, /dardos enlazados apagados/]) assert.match(log, re);
    assert.doesNotMatch(log, /sin ficha|no se usa|problema|desconocida/i, "no file of the template is refused by the engine");
    const st = await (await fetch(`http://127.0.0.1:${PORT}/status`)).json() as Record<string, unknown>;
    assert.equal(st.nombre, "Mundo nuevo"); assert.equal(st.espacioBase, true); assert.equal(st.dardosEnlace ?? null, null, "no AR darts link in /status");
    // what the server added next to the template (data, keys, manifest) — and the template's own files still all there
    assert.ok(existsSync(join(raiz, "mundo.json"))); assert.ok(ESPERADOS.every((f) => existsSync(join(raiz, f))));
  } finally { srv.kill("SIGTERM"); await new Promise((r) => setTimeout(r, 300)); }
});
