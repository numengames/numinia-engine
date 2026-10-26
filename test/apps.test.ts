// M19 (the app format) + H11 (.hyp → app folder): an app is a folder the engine READS and VALIDATES and never runs.
// Real files throughout: the example app in plantillas/apps/, real .glb bytes from activos/, a .hyp built here in Hyperfy's
// own layout ([u32 LE size][header JSON][asset bytes]) and the engine's own server answering GET /apps and /a/<hash>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { APP_ACTIVOS_MAX, APPS_MAX, LICENCIAS_ADMITIDAS, leerApps, listaDeApps, textoDeApps } from "../packages/server/src/apps.ts";
import { claveDePropiedad, idDeNombre, importarHyp, leerHyp } from "../packages/server/src/importar-hyp.ts";
import { startServer } from "../packages/server/src/server.ts";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const tmp = () => mkdtempSync(join(tmpdir(), "apps-test-"));
const EJEMPLO = "plantillas/apps";
const GLB = readFileSync("activos/casa/bloque.glb");
const GLB_SHA = sha(GLB);
const leerJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
/** a copy of the example app in a fresh apps/ folder, ready to be broken on purpose */
function copiaDelEjemplo() {
  const dir = tmp();
  cpSync(join(EJEMPLO, "bloque-giratorio"), join(dir, "bloque-giratorio"), { recursive: true });
  return { dir, app: join(dir, "bloque-giratorio"), json: join(dir, "bloque-giratorio", "app.json") };
}
const rechazo = (dir: string) => leerApps(dir).rechazadas.flatMap((r) => r.issues.map((i) => `${i.path}: ${i.message}`)).join("\n");

/** a .hyp as Hyperfy writes it: [u32 LE header size][header JSON][asset bytes in the header's order] */
function hyp(blueprint: Record<string, unknown>, assets: { type: string; url: string; bytes: Uint8Array; mime?: string }[]) {
  const cab = Buffer.from(JSON.stringify({ blueprint, assets: assets.map((a) => ({ type: a.type, url: a.url, size: a.bytes.length, mime: a.mime ?? "application/octet-stream" })) }));
  const n = Buffer.alloc(4); n.writeUInt32LE(cab.length);
  return Buffer.concat([n, cab, ...assets.map((a) => Buffer.from(a.bytes))]);
}
const SCRIPT = Buffer.from("export default function (world, app, props) { app.configure([{ key: 'speed', type: 'number' }]) }\n");
const ficheroHyp = (dir: string, nombre: string, b: Buffer) => { const p = join(dir, nombre); writeFileSync(p, b); return p; };
const hypPrueba = (extra: Record<string, unknown> = {}) => hyp(
  { id: "bp-1", name: "Silla Giratoria", desc: "Una silla que gira.", author: "Ana Pérez", url: "https://example.org/silla", model: `asset://${GLB_SHA}.glb`, script: `asset://${sha(SCRIPT)}.js`, props: { speed: 2.5, "turn_left": true, label: "Hola", tint: "#aabbcc", big: "x".repeat(300), n: null }, ...extra },
  [{ type: "model", url: `asset://${GLB_SHA}.glb`, bytes: GLB }, { type: "script", url: `asset://${sha(SCRIPT)}.js`, bytes: SCRIPT }],
);

test("M19: the example app loads: schema, card, model by hash, main.ts stored and never run", () => {
  const l = leerApps(EJEMPLO);
  assert.equal(l.rechazadas.length, 0, rechazo(EJEMPLO));
  assert.equal(l.apps.length, 1);
  const { app, main, activos } = l.apps[0];
  assert.equal(app.id, "bloque-giratorio");
  assert.equal(app.modelo, `${GLB_SHA}.glb`);
  assert.equal(activos[0].sha256, GLB_SHA);
  assert.ok(main && main.ejecuta === false && main.bytes > 0);
  assert.equal(main.sha256, sha(readFileSync(join(EJEMPLO, "bloque-giratorio", "main.ts"))));
  assert.deepEqual(app.propiedades.map((p) => p.tipo), ["interruptor", "rango", "color", "texto", "lista"]);
  assert.equal(app.eventos.find((e) => e.id === "cambioDeSentido")?.anuncio, "silent");
  const lista = listaDeApps(l);
  assert.equal(lista.apps[0].script?.ejecuta, false);
  assert.ok(!JSON.stringify(lista).includes("/var/") && !JSON.stringify(lista).includes(tmpdir()), "the list shows no disk paths");
  assert.match(textoDeApps(l), /bloque-giratorio.*no se ejecuta/);
});

test("M19: the engine does not execute main.ts (a script that would leave a mark is only hashed)", () => {
  const { dir, app } = copiaDelEjemplo();
  const marca = join(dir, "EJECUTADO");
  writeFileSync(join(app, "main.ts"), `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marca)}, "x");\nthrow new Error("no se debe ejecutar");\n`);
  const l = leerApps(dir);
  assert.equal(l.apps.length, 1, rechazo(dir));
  assert.ok(!existsSync(marca), "reading the app ran nothing");
  assert.equal(l.apps[0].main?.ejecuta, false);
});

test("M19: a hard error says the file and the JSON path (typo'd key, wrong type, bad version, id ≠ folder)", () => {
  const { dir, json } = copiaDelEjemplo();
  const original = leerJson(json);
  const prueba = (cambio: (a: Record<string, any>) => void, esperado: RegExp) => {
    const a = structuredClone(original); cambio(a); writeFileSync(json, JSON.stringify(a));
    const t = rechazo(dir);
    assert.match(t, esperado, t);
    assert.match(t, /apps\/bloque-giratorio\/app\.json/, "names the file");
  };
  prueba((a) => { a.nombr = "x"; }, /#nombr: «nombr» no es un campo de app@1/);
  prueba((a) => { a.propiedades[1].tipo = "slider"; }, /#propiedades\[1\]\.tipo: «slider» no es un tipo/);
  prueba((a) => { a.version = "1.0"; }, /#version: tres números/);
  prueba((a) => { a.id = "otra"; }, /#id: dice «otra» pero la carpeta se llama «bloque-giratorio»/);
  prueba((a) => { a.propiedades[1].max = -5; }, /#propiedades\[1\]: un rango lleva min y max/);
  prueba((a) => { a.propiedades[4].porDefecto = "arriba"; }, /#propiedades\[4\]\.porDefecto: «arriba» no es una de las opciones/);
  prueba((a) => { a.propiedades.push({ ...a.propiedades[0] }); }, /#propiedades\[5\]\.id: «girar» ya está/);
  prueba((a) => { a.propiedades[0].id = "gira-ya"; }, /propiedades\[0\]\.id: camelCase/);
  prueba((a) => { a.eventos[0].anuncio = { texto: "{otro} pulsa", sonido: "suave" }; }, /anuncio\.texto: «\{otro\}» no es un campo/);
  prueba((a) => { a.eventos[0].anuncio = { texto: "x", sonido: "zumbido" }; }, /anuncio\.sonido: uno de los sonidos del motor/);
  prueba((a) => { delete a.eventos[0].anuncio; }, /#eventos\[0\]\.anuncio: di qué oye/);
  prueba((a) => { delete a.ficha; }, /#ficha: la ficha accesible/);
  prueba((a) => { a.main = "otro.ts"; }, /#main: solo «main.ts»/);
  writeFileSync(json, "{ no es json");
  assert.match(rechazo(dir), /app\.json: no es JSON válido/);
  rmSync(json);
  assert.match(rechazo(dir), /falta app\.json/);
});

test("M19: every file is named by its hash and checked like an upload", () => {
  const { dir, app, json } = copiaDelEjemplo();
  const f = join(app, "assets", `${GLB_SHA}.glb`);
  // wrong bytes under the right name
  writeFileSync(f, Buffer.concat([GLB, Buffer.from("x")]));
  assert.match(rechazo(dir), /sus bytes dan el SHA-256 [0-9a-f]{64}: renómbralo/);
  // the right name, not a glb at all
  const basura = Buffer.from("esto no es un glb de ninguna manera");
  const nombre = `${sha(basura)}.glb`;
  rmSync(f);
  writeFileSync(join(app, "assets", nombre), basura);
  const a = leerJson(json); a.activos[0].archivo = nombre; a.modelo = nombre; writeFileSync(json, JSON.stringify(a));
  assert.match(rechazo(dir), new RegExp(`assets/${nombre}: `));
  // listed and missing
  rmSync(join(app, "assets", nombre));
  assert.match(rechazo(dir), /no está en assets\//);
  // a name that is not a hash
  a.activos[0].archivo = "bloque.glb"; writeFileSync(json, JSON.stringify(a));
  assert.match(rechazo(dir), /activos\[0\]\.archivo: el nombre es el SHA-256/);
});

test("M19: licences — an included file needs an admitted one; CC BY needs the author; unknown is only ever «omitido»", () => {
  const { dir, json } = copiaDelEjemplo();
  const original = leerJson(json);
  const con = (cambio: (a: Record<string, any>) => void) => { const a = structuredClone(original); cambio(a); writeFileSync(json, JSON.stringify(a)); return rechazo(dir); };
  assert.match(con((a) => { a.activos[0].licencia = "GPL-3.0"; }), /activos\[0\]\.licencia: no se incluye: la licencia «GPL-3\.0» no está entre las admitidas/);
  assert.match(con((a) => { a.activos[0].licencia = "desconocida"; }), /no se incluye: su licencia es desconocida/);
  assert.match(con((a) => { a.activos[0].licencia = "CC-BY-4.0"; delete a.activos[0].autor; }), /CC-BY-4\.0 exige el crédito/);
  assert.match(con((a) => { a.licencia = "desconocida"; }), /#licencia: la app trae un script y su licencia es desconocida/);
  assert.match(con((a) => { a.licencia = "GPL-3.0"; }), /#licencia: .*no está entre las admitidas/);
  assert.match(con((a) => { a.activos[0].estado = "omitido"; }), /modelo: .* está omitido/);
  assert.match(con((a) => { a.activos[0].estado = "omitido"; delete a.modelo; }), /activos\[0\]\.motivo: un fichero omitido dice por qué/, "omitted needs its reason");
  // omitted with a reason and no model: loads, and says what is missing
  const ok = structuredClone(original); ok.activos[0].estado = "omitido"; ok.activos[0].licencia = "desconocida"; ok.activos[0].motivo = "sin licencia"; delete ok.modelo; ok.propiedades = []; ok.eventos = [];
  writeFileSync(json, JSON.stringify(ok));
  const l = leerApps(dir);
  assert.equal(l.rechazadas.length, 0, rechazo(dir));
  assert.equal(l.apps[0].activos.length, 0);
  assert.ok(l.apps[0].avisos.some((a) => /omitido: sin licencia/.test(a)));
  assert.ok(LICENCIAS_ADMITIDAS.includes("CC0-1.0") && !LICENCIAS_ADMITIDAS.some((l) => /GPL-[23]|BUSL|proprietary/i.test(l) && !/AGPL-3\.0-only/.test(l)));
});

test("M19: limits — too many files, an oversized main.ts, a stray file in assets/, a bad folder name, one broken app does not stop the rest", () => {
  const { dir, app, json } = copiaDelEjemplo();
  const a = leerJson(json);
  a.activos = Array.from({ length: APP_ACTIVOS_MAX + 1 }, (_, i) => ({ archivo: `${sha(Buffer.from(String(i)))}.png`, licencia: "CC0-1.0", estado: "omitido", motivo: "x" }));
  delete a.modelo; writeFileSync(json, JSON.stringify(a));
  assert.match(rechazo(dir), new RegExp(`${APP_ACTIVOS_MAX + 1} ficheros: el tope es ${APP_ACTIVOS_MAX}`));
  writeFileSync(json, JSON.stringify(leerJson(join(EJEMPLO, "bloque-giratorio", "app.json"))));
  writeFileSync(join(app, "main.ts"), "x".repeat(256 * 1024 + 1));
  assert.match(rechazo(dir), /main\.ts: pesa 262145 bytes: el tope es 262144/);
  writeFileSync(join(app, "main.ts"), "// ok\n");
  writeFileSync(join(app, "assets", "sobra.txt"), "x");
  mkdirSync(join(dir, "Mala Carpeta"));
  cpSync(app, join(dir, "otra-app"), { recursive: true });
  const j2 = leerJson(join(dir, "otra-app", "app.json")); j2.id = "otra-app"; writeFileSync(join(dir, "otra-app", "app.json"), JSON.stringify(j2));
  const l = leerApps(dir);
  assert.deepEqual(l.apps.map((x) => x.app.id), ["bloque-giratorio", "otra-app"], "both good apps load");
  assert.ok(l.apps[0].avisos.some((v) => /assets\/sobra\.txt no está en app\.json/.test(v)));
  assert.match(l.rechazadas.map((r) => r.issues[0].message).join(), /nombre de la carpeta de una app/);
  assert.deepEqual(leerApps(null), { apps: [], rechazadas: [] });
  assert.deepEqual(leerApps(join(dir, "no-existe")), { apps: [], rechazadas: [] });
  assert.ok(APPS_MAX >= 100);
});

test("M19: a symlinked app.json or main.ts is refused (no reading outside the folder)", { skip: process.platform === "win32" }, async () => {
  const { symlinkSync } = await import("node:fs");
  const { dir, json } = copiaDelEjemplo();
  const fuera = join(tmp(), "fuera.json"); writeFileSync(fuera, readFileSync(json));
  rmSync(json); symlinkSync(fuera, json);
  assert.match(rechazo(dir), /app\.json tiene que ser un fichero normal/);
  const { dir: d2, app: a2 } = copiaDelEjemplo();
  const fm = join(tmp(), "m.ts"); writeFileSync(fm, "// x");
  rmSync(join(a2, "main.ts")); symlinkSync(fm, join(a2, "main.ts"));
  assert.match(rechazo(d2), /main\.ts: tiene que ser un fichero normal/);
});

test("H11: a .hyp reads in Hyperfy's layout; a cut or wrong one says what is wrong", () => {
  const b = hypPrueba();
  const r = leerHyp(b);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.hyp.activos.length, 2);
  assert.equal(r.hyp.activos[0].sha256, GLB_SHA);
  assert.equal(r.hyp.activos[0].hashDeLaUrl, GLB_SHA);
  assert.equal(r.hyp.sha256, sha(b));
  for (const [malo, esperado] of [[b.subarray(0, 2), /tiene 2 bytes/], [b.subarray(0, b.length - 10), /cortado/], [Buffer.from("MZ\x00\x00 no soy un hyp de verdad"), /cabecera dice/], [Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from("{x}")]), /no es JSON válido/]] as const) {
    const x = leerHyp(malo);
    assert.ok(!x.ok && esperado.test(x.issues[0].message), JSON.stringify(x));
  }
  const falso = leerHyp(hyp({ name: "x" }, [{ type: "model", url: `asset://${"0".repeat(64)}.glb`, bytes: GLB }]));
  assert.ok(falso.ok && falso.hyp.avisos.some((a) => /no el de su nombre; uso el real/.test(a)));
});

test("H11: import with an admitted licence → an app folder: model by hash, script PORTAR apart, licences recorded, .hyp untouched", () => {
  const w = tmp(), apps = join(w, "apps");
  const origen = ficheroHyp(w, "Silla.hyp", hypPrueba());
  const antes = sha(readFileSync(origen));
  const inf = importarHyp({ hyp: origen, destino: apps, licencia: "CC0-1.0" });
  assert.equal(sha(readFileSync(origen)), antes, "the .hyp is read, never written");
  assert.equal(inf.app.id, "silla-giratoria");
  assert.deepEqual(inf.traidos.map((t) => [t.archivo, t.licencia]), [[`${GLB_SHA}.glb`, "CC0-1.0"]]);
  assert.equal(inf.porPortar.estado, "por-portar");
  const carpeta = join(apps, "silla-giratoria");
  assert.deepEqual(readdirSync(carpeta).sort(), ["IMPORTADO.md", "app.json", "assets", "por-portar"]);
  assert.deepEqual(readFileSync(join(carpeta, "por-portar", "script.js")), SCRIPT);
  assert.ok(!existsSync(join(carpeta, "main.ts")), "the Hyperfy script is NOT passed off as main.ts");
  const j = leerJson(join(carpeta, "app.json"));
  assert.equal(j.licencia, "CC0-1.0");
  assert.equal(j.autor, "Ana Pérez");
  assert.equal(j.modelo, `${GLB_SHA}.glb`);
  assert.deepEqual(j.portar, { estado: "por-portar", origen: "hyperfy", fichero: "por-portar/script.js", sha256: sha(SCRIPT), bytes: SCRIPT.length, motivo: j.portar.motivo });
  assert.deepEqual(j.origen, { formato: "hyp", archivo: "Silla.hyp", sha256: antes, id: "bp-1" });
  assert.deepEqual(j.activos, [{ archivo: `${GLB_SHA}.glb`, licencia: "CC0-1.0", fuente: "https://example.org/silla", estado: "incluido" }]);
  // props: type from the value; camelCase names; what cannot be made is reported, not dropped silently
  const p = Object.fromEntries(j.propiedades.map((x: any) => [x.id, [x.tipo, x.porDefecto]]));
  assert.deepEqual(p, { speed: ["numero", 2.5], turnLeft: ["interruptor", true], label: ["texto", "Hola"], tint: ["color", "#aabbcc"] });
  assert.deepEqual(inf.propiedades.omitidas.map((x) => x.id).sort(), ["big", "n"]);
  // the engine's own reader accepts what the importer wrote, and says the script is still to port
  const l = leerApps(apps);
  assert.equal(l.rechazadas.length, 0, rechazo(apps));
  assert.equal(l.apps[0].main, null);
  assert.ok(l.apps[0].avisos.some((a) => /por portar a main\.ts/.test(a)));
  assert.match(readFileSync(join(carpeta, "IMPORTADO.md"), "utf8"), /Script por portar.*por-portar\/script\.js/);
  // a script tampered with after import is caught by its recorded hash
  writeFileSync(join(carpeta, "por-portar", "script.js"), "// otro");
  assert.match(rechazo(apps), /por-portar\/script\.js: su SHA-256 no es el que app\.json guardó/);
});

test("H11: unknown or refused licence → nothing copied, everything listed «omitido» with the reason (the 351 hyperfy-apps have none)", () => {
  for (const lic of [undefined, "GPL-3.0"]) {
    const w = tmp(), apps = join(w, "apps");
    const inf = importarHyp({ hyp: ficheroHyp(w, "silla.hyp", hypPrueba()), destino: apps, licencia: lic });
    assert.equal(inf.traidos.length, 0);
    assert.equal(inf.omitidos[0].archivo, `${GLB_SHA}.glb`);
    assert.equal(inf.porPortar.estado, "omitido");
    const carpeta = join(apps, "silla-giratoria");
    assert.deepEqual(readdirSync(carpeta).sort(), ["IMPORTADO.md", "app.json", "assets"]);
    assert.deepEqual(readdirSync(join(carpeta, "assets")), []);
    const j = leerJson(join(carpeta, "app.json"));
    assert.equal(j.licencia, lic ?? "desconocida");
    assert.equal(j.activos[0].estado, "omitido");
    assert.match(j.activos[0].motivo, lic ? /GPL-3\.0/ : /desconocida/);
    assert.equal(j.portar.estado, "omitido");
    assert.equal(j.portar.sha256, sha(SCRIPT), "the script's hash is kept so it can be found again in the .hyp");
    assert.ok(!j.modelo);
    const l = leerApps(apps);
    assert.equal(l.rechazadas.length, 0, rechazo(apps));
    assert.equal(l.apps[0].activos.length, 0);
  }
});

test("H11: CC BY needs the credit (the .hyp's author or --autor); a file that is not a model of ours is left out; same bytes twice = one file", () => {
  const w = tmp();
  const sinAutor = hyp({ name: "Sin Autor", model: `asset://${GLB_SHA}.glb` }, [{ type: "model", url: `asset://${GLB_SHA}.glb`, bytes: GLB }]);
  const a = importarHyp({ hyp: ficheroHyp(w, "a.hyp", sinAutor), destino: join(w, "apps"), licencia: "CC-BY-4.0" });
  assert.equal(a.traidos.length, 0);
  assert.match(a.omitidos[0].motivo, /exige el crédito/);
  const b = importarHyp({ hyp: ficheroHyp(w, "a.hyp", sinAutor), destino: join(w, "apps"), licencia: "CC-BY-4.0", autor: "Luz", reemplazar: true });
  assert.equal(b.traidos.length, 1);
  assert.equal(leerJson(join(w, "apps", "sin-autor", "app.json")).activos[0].autor, "Luz");
  const raro = Buffer.from("MZ binario"), dup = hyp({ name: "Dup", model: `asset://${GLB_SHA}.glb` }, [
    { type: "model", url: `asset://${GLB_SHA}.glb`, bytes: GLB }, { type: "texture", url: `asset://${GLB_SHA}.glb`, bytes: GLB }, { type: "file", url: `asset://${sha(raro)}.exe`, bytes: raro }]);
  const d = importarHyp({ hyp: ficheroHyp(w, "d.hyp", dup), destino: join(w, "apps"), licencia: "MIT" });
  assert.equal(d.traidos.length, 1);
  assert.match(d.omitidos[0].motivo, /\.exe no es un tipo que el motor admita/);
});

test("H11: a model that is not a real glb is refused by the same check as an upload; no .hyp without a script says «sin-script»", () => {
  const w = tmp(), falso = Buffer.from("no soy un glb, soy texto de relleno para la prueba");
  const h = hyp({ name: "Falso", model: `asset://${sha(falso)}.glb` }, [{ type: "model", url: `asset://${sha(falso)}.glb`, bytes: falso }]);
  const inf = importarHyp({ hyp: ficheroHyp(w, "f.hyp", h), destino: join(w, "apps"), licencia: "CC0-1.0" });
  assert.equal(inf.traidos.length, 0);
  assert.equal(inf.omitidos.length, 1);
  assert.equal(inf.porPortar.estado, "sin-script");
  assert.equal(leerJson(join(w, "apps", "falso", "app.json")).portar, undefined);
  assert.equal(leerApps(join(w, "apps")).rechazadas.length, 0);
});

test("H11: bad input is refused up front and writes nothing; an existing app is not overwritten", () => {
  const w = tmp(), apps = join(w, "apps"), origen = ficheroHyp(w, "s.hyp", hypPrueba());
  assert.throws(() => importarHyp({ hyp: join(w, "no-hay.hyp"), destino: apps }), /no puedo leer/);
  assert.throws(() => importarHyp({ hyp: ficheroHyp(w, "x.hyp", Buffer.from("tonto")), destino: apps }), /tiene 5 bytes|cabecera/);
  assert.throws(() => importarHyp({ hyp: origen, destino: apps, licencia: "no es spdx!" }), /licencia «no es spdx!»/);
  assert.throws(() => importarHyp({ hyp: origen, destino: apps, id: "Mal Id" }), /id «Mal Id»/);
  assert.ok(!existsSync(join(apps, "silla-giratoria")));
  importarHyp({ hyp: origen, destino: apps, licencia: "MIT" });
  assert.throws(() => importarHyp({ hyp: origen, destino: apps, licencia: "MIT" }), /ya hay una app «silla-giratoria»/);
  importarHyp({ hyp: origen, destino: apps, licencia: "MIT", reemplazar: true, id: "silla-giratoria" });
  assert.deepEqual(readdirSync(apps).filter((n) => n.startsWith(".")), [], "no temporary folder left behind");
});

test("H11: names — folder id from the name, camelCase from the prop key", () => {
  assert.equal(idDeNombre("Agente IA", "x"), "agente-ia");
  assert.equal(idDeNombre("Árbol — Ñandú!!", "x"), "arbol-nandu");
  assert.equal(idDeNombre("———", "hyp-1234"), "hyp-1234");
  assert.equal(claveDePropiedad("wander_radius"), "wanderRadius");
  assert.equal(claveDePropiedad("Display Name"), "displayName");
  assert.equal(claveDePropiedad("ok"), "ok");
  assert.equal(claveDePropiedad("1x"), null);
  assert.equal(claveDePropiedad("ñ"), null);
});

test("M19: the server lists the apps at GET /apps and serves their files at /a/<hash>; a bad app is left out and logged", async () => {
  const { dir, app } = copiaDelEjemplo();
  mkdirSync(join(dir, "rota")); writeFileSync(join(dir, "rota", "app.json"), "{}");
  const log: string[] = [];
  const s = await startServer({ port: 0, host: "127.0.0.1", apps: dir, biblioteca: null, log: (m: string) => log.push(m), statsMs: 60_000 });
  try {
    const base = `http://127.0.0.1:${s.port}`;
    const r = await fetch(`${base}/apps`);
    assert.equal(r.status, 200);
    const j: any = await r.json();
    assert.equal(j.schema, "numinia-engine/apps@1");
    assert.deepEqual(j.apps.map((a: any) => a.id), ["bloque-giratorio"]);
    assert.equal(j.apps[0].script.ejecuta, true, "M20: the server runs the script in its sandbox now");
    assert.equal(j.apps[0].script.estado, "viva");
    assert.equal(j.rechazadas[0].id, "rota");
    assert.match(j.rechazadas[0].problemas.join(), /rota\/app\.json#/);
    const g = await fetch(`${base}${j.apps[0].activos[0].url}`);
    assert.equal(g.status, 200, "the app's model is served like any other asset");
    assert.equal(sha(new Uint8Array(await g.arrayBuffer())), GLB_SHA);
    assert.ok(log.some((l) => /\[apps\] no se carga «rota»/.test(l)));
    assert.ok(log.some((l) => /\[apps\] 1 cargada, 1 rechazada/.test(l)));
  } finally { await s.close(); }
});

test("M19: the limits published in limits.json are the ones the code enforces", async () => {
  const a = await import("../packages/server/src/apps.ts");
  const lim = Object.fromEntries((leerJson("limits.json").limits as { key: string; value: number }[]).map((e) => [e.key, e.value]));
  assert.equal(lim.app_json_max_kb * 1024, a.APP_JSON_MAX);
  assert.equal(lim.app_main_max_kb * 1024, a.APP_MAIN_MAX);
  assert.equal(lim.app_files_max, a.APP_ACTIVOS_MAX);
  assert.equal(lim.app_assets_max_mb, a.APP_ACTIVOS_MB);
  assert.equal(lim.app_properties_max, a.APP_PROPIEDADES_MAX);
  assert.equal(lim.app_events_max, a.APP_EVENTOS_MAX);
  assert.equal(lim.apps_per_world_max, a.APPS_MAX);
});
