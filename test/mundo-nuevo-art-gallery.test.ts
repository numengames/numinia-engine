// Art Gallery · a TYPE of world (plantillas/art-gallery), chosen by name with MOTOR_PLANTILLA. Unlike the others it ships its built
// things (datos/) too: the stoa, 21 holes, two pedestals and the 30 files they need. Its words are English (the default language of
// every world) with the Spanish translation as files; it carries a CC0 licence file and no mark of any kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carpetaMundo, esMundoNuevo, PLANTILLAS, plantillaPorNombre, sembrar } from "../packages/server/src/mundo-carpeta.ts";
import { leerFicha } from "../packages/server/src/aventura.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const todos = (d: string) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(d.length + 1)).sort();
const GALERIA = plantillaPorNombre("art-gallery");
const ruta = (): string => { assert.ok(GALERIA.ok, "plantillas/art-gallery exists"); return GALERIA.ok ? GALERIA.ruta : ""; };
const SPANISH = /[áéíóúñ¿¡]/;
const sinNombres = (t: string) => t.replaceAll("Lía", "Lia").replaceAll("día", "dia"); // the one visitor whose name carries an accent is still called that in English

test("MOTOR_PLANTILLA=art-gallery resolves; the default is still the Taller", () => {
  assert.ok(GALERIA.ok); if (GALERIA.ok) assert.equal(GALERIA.ruta, join(PLANTILLAS, "art-gallery"));
  const d = plantillaPorNombre(undefined); assert.ok(d.ok); if (d.ok) assert.equal(d.nombre, "taller");
});

test("a new folder is born with the whole gallery: adventure, environment and the built world with its 30 files", () => {
  const c = carpetaMundo(join(tmp("pv-galeria-"), "mundo")), log: string[] = [];
  assert.equal(esMundoNuevo(c), true);
  assert.equal(sembrar(c, (l) => log.push(l), undefined, ruta(), "art-gallery"), true);
  assert.deepEqual(todos(c.raiz), todos(ruta()).filter((x) => x !== "REUSE.toml" && x !== ".gitignore"), "the folder is the template, file for file (the template's own licence map and ignore file stay behind)");
  assert.match(log.join("\n"), /nace de la plantilla «art-gallery»/);
  assert.deepEqual(readdirSync(c.raiz).filter((f) => f.startsWith(".")), [], "no half copy left behind");
  assert.equal(readdirSync(c.activos).length, 30, "8 models + 22 signs");
});

test("every uploaded file is named by its own sha256 and every object points at a file that is there", () => {
  const activos = join(ruta(), "datos", "activos"), hay = new Set<string>();
  for (const f of readdirSync(activos)) { assert.equal(createHash("sha256").update(readFileSync(join(activos, f))).digest("hex"), f.replace(/\.\w+$/, ""), f); hay.add(f.replace(/\.\w+$/, "")); }
  const vivos = new Map<string, Record<string, unknown>>();
  for (const l of readFileSync(join(ruta(), "datos", "objetos.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const e = JSON.parse(l) as { op: string; key: string; value?: Record<string, unknown> };
    if (e.op === "s" && e.value && typeof e.value.modelo === "string") vivos.set(e.key, e.value); else if (e.op === "d") vivos.delete(e.key);
  }
  assert.equal(vivos.size, 64, "64 objects: the building, 22 signs, 2 sculptures, 39 invisible colliders");
  assert.equal([...vivos.values()].filter((o) => Number(o.huecoAncho) > 0 && Number(o.huecoAlto) > 0).length, 22, "21 slots + the facade sign are holes");
  for (const o of vivos.values()) assert.ok(hay.has(String(o.modelo)), `${String(o.nombre) || o.modelo}: file is in datos/activos`);
  for (const o of vivos.values()) assert.doesNotMatch(String(o.nombre), SPANISH, `object name «${String(o.nombre)}» is English`);
});

test("the sheet: English name and words, semantic version, creator Numen Games, owner pending; every Spanish file is only words", () => {
  const f = leerFicha(join(ruta(), "aventura")); assert.deepEqual(f.problemas, []);
  assert.equal(f.ficha?.nombre, "Art Gallery");
  assert.match(String(f.ficha?.version), /^\d+\.\d+\.\d+$/);
  assert.equal(f.ficha?.creador, "Numen Games"); assert.equal(f.ficha?.dueno, "pending");
  const aventura = join(ruta(), "aventura");
  for (const x of todos(aventura).filter((x) => !x.startsWith("idiomas/"))) assert.doesNotMatch(sinNombres(readFileSync(join(aventura, x), "utf8")), SPANISH, `${x} is English (no Spanish letters)`);
  for (const x of todos(join(ruta(), "entorno"))) assert.doesNotMatch(readFileSync(join(ruta(), "entorno", x), "utf8"), SPANISH, `entorno/${x} is English`);
  const ids = (o: unknown, p = ""): string[] => Array.isArray(o) ? o.flatMap((v, i) => ids(v, `${p}/${i}`)) : o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => ids(v, `${p}/${k}`)) : [`${p}`];
  const traducidos = todos(join(aventura, "idiomas")).filter((x) => x.endsWith(".json"));
  assert.equal(traducidos.length, 21, "20 files of the adventure + the sheet");
  for (const t of traducidos) {
    const m = /^es\.(?:([a-z]+)\.)?(.+)$/.exec(t === "es.ficha.json" ? "es.ficha.json" : t)!;
    const base = t === "es.ficha.json" ? join(aventura, "ficha.json") : join(aventura, m[1], m[2]);
    assert.ok(existsSync(base), `${t} translates ${base}`);
    assert.deepEqual(ids(JSON.parse(readFileSync(base, "utf8"))), ids(JSON.parse(readFileSync(join(aventura, "idiomas", t), "utf8"))), `${t} has the same shape as its English file`);
  }
  assert.ok(existsSync(join(aventura, "idiomas", "es.LEEME-IA.md")));
});

test("the licence file is CC0, points to TRADEMARKS.md; the only images are the 22 signs and no file is a logo", () => {
  const lic = readFileSync(join(ruta(), "aventura", "LICENSE.md"), "utf8");
  assert.match(lic, /CC0 1\.0 Universal/); assert.match(lic, /TRADEMARKS\.md/);
  assert.deepEqual(todos(ruta()).filter((x) => /\.(jpe?g|svg|webp)$/i.test(x)), [], "no image but the signs (png) and the models (glb)");
  assert.equal(todos(join(ruta(), "datos", "activos")).filter((x) => x.endsWith(".png")).length, 22);
  assert.match(readFileSync(join(ruta(), "REUSE.toml"), "utf8"), /SPDX-License-Identifier = "CC0-1\.0"/); // the template's own licence map, not the root file
});

test("the CLI an author uses accepts the shipped template", () => {
  const cli = spawnSync(process.execPath, ["tools/aventura.ts", join(ruta(), "aventura")], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr); assert.match(cli.stdout, /Todo en orden/); assert.match(cli.stdout, /ficha: «Art Gallery»/);
});

test("a world that already exists is NOT re-born as the gallery", () => {
  const c = carpetaMundo(join(tmp("pv-galeria-viejo-"), "mundo"));
  sembrar(c); // born as Taller
  writeFileSync(join(c.aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Mío" }));
  const antes = todos(c.raiz).map((f) => [f, readFileSync(join(c.raiz, f), "utf8")]);
  assert.equal(sembrar(c, () => {}, undefined, ruta(), "art-gallery"), false);
  assert.deepEqual(todos(c.raiz).map((f) => [f, readFileSync(join(c.raiz, f), "utf8")]), antes);
});

const puertaLibre = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
const limpio = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_|AVENTURA_DIR|DATOS_DIR|MUNDO_DIR|ACTIVOS_DIR|SESIONES_DIR|JWT_SECRET|ADMIN_CODE)/.test(k)));

test("the real server with MOTOR_PLANTILLA=art-gallery on a fresh folder starts the gallery, English, with its holes", async () => {
  const raiz = join(tmp("pv-galeria-srv-"), "mundo"), PORT = await puertaLibre();
  const srv = spawn(process.execPath, ["packages/server/src/main.ts"], { env: { ...limpio(), PORT: String(PORT), HOST: "127.0.0.1", MOTOR_MUNDO: raiz, MOTOR_PLANTILLA: "art-gallery", MOTOR_HABITANTES: "no" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; srv.stdout.on("data", (d) => { log += d; }); srv.stderr.on("data", (d) => { log += d; });
  try {
    for (let i = 0; i < 200 && !log.includes("[instancia]"); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(log.includes("[instancia]"), log);
    for (const re of [/nace de la plantilla «art-gallery»/, /\[ficha\] el mundo se llama «Art Gallery»/]) assert.match(log, re);
    assert.doesNotMatch(log, /sin ficha|no se usa|problema|desconocida|clave desconocida|falta el modelo|no existe/i, "no file of the template is refused by the engine");
    const st = await (await fetch(`http://127.0.0.1:${PORT}/status`)).json() as Record<string, unknown>;
    assert.equal(st.nombre, "Art Gallery");
    assert.equal(readdirSync(join(raiz, "datos", "activos")).filter((f) => /\.(glb|png)$/.test(f)).length, 30);
  } finally { srv.kill("SIGTERM"); await new Promise((r) => setTimeout(r, 300)); }
});
