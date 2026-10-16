// The world as a zip: packages/server/src/zip.ts (the format) and mundo-zip.ts (download / upload, /mundo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { ErrorZip, escribirZip, extraer, leerZip, nombreSeguro } from "../packages/server/src/zip.ts";
import { cambiarDatos, cambiarPartes, COPIAS_ANTES, exportarMundo, FALLOS_MAX, importarMundo, inventario, leerFuncion, TOPES } from "../packages/server/src/mundo-zip.ts";
import type { Origen } from "../packages/server/src/mundo-zip.ts";
import { startServer } from "../packages/server/src/server.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const BLOQUE = readFileSync(new URL("../activos/casa/bloque.glb", import.meta.url));
const ADMIN = "codigo-de-administracion-de-prueba";
const TOPES_PEQUENOS = { entradas: 50, porFichero: 4 * 1048576, total: 8 * 1048576, ratio: 100 };
const COMMIT = "c57dbb7cc4c51b0834184f1dd47b311e47fde234";
const MOTOR = { build: "abc1234 2026-10-15", commit: COMMIT, imagen: `ghcr.io/numengames/numinia-engine:sha-${COMMIT}` };
const soloDatos = (datos: string): Origen => ({ datos, subidas: join(datos, "activos"), aventura: null, entorno: null });

async function aFichero(ruta: string, f: (w: import("node:stream").Writable) => Promise<unknown>) {
  const w = createWriteStream(ruta);
  await f(w);
  await new Promise<void>((ok) => w.end(ok));
}

/** A world on disk like an installed server's: features' files, uploads, and what must NOT travel. */
function mundoDePrueba(): { datos: string; glb: string } {
  const datos = join(tmp("mundo-"), "datos");
  mkdirSync(join(datos, "activos"), { recursive: true });
  writeFileSync(join(datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 3, state: [["o1", { value: { x: 1 } }]], store: [] }));
  writeFileSync(join(datos, "objetos.jsonl"), '{"op":"s","key":"o2","value":{"x":2}}\n');
  writeFileSync(join(datos, "misiones.jsonl"), "");
  writeFileSync(join(datos, "objetos.json.tmp"), "half");                  // a snapshot being written: not copied
  const glb = `${sha(BLOQUE)}.glb`;
  writeFileSync(join(datos, "activos", glb), BLOQUE);
  writeFileSync(join(datos, "activos", "subidas.jsonl"), '{"quien":"abc","nombre":"Ana"}\n'); // who uploaded: never travels
  writeFileSync(join(datos, "activos", ".subiendo-abc"), "x");
  return { datos, glb };
}

/** A zip with stored entries and whatever headers a test wants (to build hostile ones). */
function zipCrudo(entradas: { nombre: string; datos?: Uint8Array; flags?: number; attr?: number; metodo?: number; crc?: number; tamano?: number }[]): Buffer {
  const partes: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const e of entradas) {
    const n = Buffer.from(e.nombre), d = Buffer.from(e.datos ?? new Uint8Array()), metodo = e.metodo ?? 0;
    const cuerpo = metodo === 8 ? deflateRawSync(d) : d;
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(e.flags ?? 0, 6); l.writeUInt16LE(metodo, 8);
    l.writeUInt32LE(e.crc ?? crc32(d), 14); l.writeUInt32LE(cuerpo.length, 18); l.writeUInt32LE(e.tamano ?? d.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE((3 << 8) | 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(e.flags ?? 0, 8); c.writeUInt16LE(metodo, 10);
    c.writeUInt32LE(e.crc ?? crc32(d), 16); c.writeUInt32LE(cuerpo.length, 20); c.writeUInt32LE(e.tamano ?? d.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(((e.attr ?? 0o100644) << 16) >>> 0, 38); c.writeUInt32LE(off, 42);
    partes.push(l, n, cuerpo); central.push(c, n); off += 30 + n.length + cuerpo.length;
  }
  const dir = Buffer.concat(central), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, dir, fin]);
}

test("zip: what escribirZip writes, unzip and leerZip/extraer read back byte for byte", async () => {
  const d = tmp("zip-"), z = join(d, "a.zip");
  writeFileSync(join(d, "grande.bin"), BLOQUE);
  const texto = Buffer.from("hola mundo ñ\n".repeat(500));
  await aFichero(z, (w) => escribirZip(w, [{ nombre: "uno/texto.txt", datos: texto }, { nombre: "uno/bloque.glb", ruta: join(d, "grande.bin") }, { nombre: "vacio.txt", datos: new Uint8Array() }]));
  const t = spawnSync("unzip", ["-t", z], { encoding: "utf8" });
  assert.equal(t.status, 0, t.stdout + t.stderr);
  assert.match(t.stdout, /No errors detected/);
  const e = await leerZip(z, TOPES);
  assert.deepEqual(e.map((x) => [x.nombre, x.metodo, x.tamano]), [["uno/texto.txt", 8, texto.length], ["uno/bloque.glb", 0, BLOQUE.length], ["vacio.txt", 8, 0]]);
  for (const [i, esperado] of [texto, BLOQUE, Buffer.alloc(0)].entries()) {
    const out = join(d, `x${i}`);
    await extraer(z, e[i], out);
    assert.ok(readFileSync(out).equals(esperado));
  }
});

test("zip: safe names only", () => {
  for (const ok of ["mundo.json", "datos/objetos.json", "a/b/", "x/.DS_Store"]) assert.ok(nombreSeguro(ok), ok);
  for (const no of ["", "/etc/passwd", "../x", "a/../../x", "C:\\x", "C:x", "a\\b", "a//b", "./a", "a\u0000b"]) assert.ok(!nombreSeguro(no), JSON.stringify(no));
});

test("zip: a hostile zip is refused by rule before anything is written", async () => {
  const d = tmp("zip-malo-");
  const prueba = async (buf: Buffer, regla: string, topes = TOPES_PEQUENOS) => {
    const z = join(d, `${regla}-${Math.random().toString(36).slice(2)}.zip`);
    writeFileSync(z, buf);
    await assert.rejects(leerZip(z, topes), (e: unknown) => e instanceof ErrorZip && e.regla === regla, regla);
  };
  await prueba(Buffer.from("esto no es un zip, solo texto de más de 22 bytes"), "no-es-zip");
  await prueba(zipCrudo([{ nombre: "../fuera.txt", datos: Buffer.from("x") }]), "ruta");
  await prueba(zipCrudo([{ nombre: "/etc/cron.d/x", datos: Buffer.from("x") }]), "ruta");
  await prueba(zipCrudo([{ nombre: "C:\\x", datos: Buffer.from("x") }]), "ruta");
  await prueba(zipCrudo([{ nombre: "enlace", datos: Buffer.from("/etc/passwd"), attr: 0o120777 }]), "enlace");
  await prueba(zipCrudo([{ nombre: "secreto", datos: Buffer.from("x"), flags: 1 }]), "cifrado");
  await prueba(zipCrudo([{ nombre: "a", datos: Buffer.from("x"), metodo: 12 }]), "metodo");
  await prueba(zipCrudo([{ nombre: "a" }, { nombre: "a" }]), "repetido");
  await prueba(zipCrudo(Array.from({ length: 51 }, (_, i) => ({ nombre: `f${i}` }))), "demasiadas");
  await prueba(zipCrudo([{ nombre: "g", datos: Buffer.alloc(5 * 1048576) }]), "grande");
  await prueba(zipCrudo([{ nombre: "bomba", datos: Buffer.alloc(3 * 1048576), metodo: 8 }]), "ratio");
  await prueba(zipCrudo([{ nombre: "a", datos: Buffer.alloc(3 * 1048576, 1) }, { nombre: "b", datos: Buffer.alloc(3 * 1048576, 2) }, { nombre: "c", datos: Buffer.alloc(3 * 1048576, 3) }]), "total");
  // headers that lie are caught while unpacking: a wrong CRC, a size that is not the real one
  for (const [buf, regla] of [[zipCrudo([{ nombre: "a", datos: Buffer.from("hola"), crc: 1 }]), "crc"], [zipCrudo([{ nombre: "a", datos: Buffer.from("hola mundo"), metodo: 8, tamano: 4 }]), "grande"]] as const) {
    const z = join(d, `${regla}.zip`); writeFileSync(z, buf);
    const [e] = await leerZip(z, TOPES_PEQUENOS);
    await assert.rejects(extraer(z, e, join(d, `${regla}.out`)), (x: unknown) => x instanceof ErrorZip && x.regla === regla, regla);
  }
});

test("mundo: download → upload elsewhere gives the same world; sessions and who-uploaded never travel", async () => {
  const { datos, glb } = mundoDePrueba();
  assert.deepEqual(inventario(soloDatos(datos)).map((f) => f.ruta), ["datos/misiones.jsonl", "datos/objetos.json", "datos/objetos.jsonl", `datos/activos/${glb}`]);
  const z = join(tmp("mundo-zip-"), "m.zip");
  let r!: { ficheros: number };
  await aFichero(z, async (w) => { r = await exportarMundo(w, soloDatos(datos), MOTOR); });
  assert.equal(r.ficheros, 4);
  const lista = spawnSync("unzip", ["-Z1", z], { encoding: "utf8" }).stdout.trim().split("\n");
  assert.deepEqual(lista, ["mundo.json", "datos/misiones.jsonl", "datos/objetos.json", "datos/objetos.jsonl", `datos/activos/${glb}`, "compose.yml", "arrancar.sh", "LEEME.txt"]);
  const m = JSON.parse(spawnSync("unzip", ["-p", z, "mundo.json"], { encoding: "utf8" }).stdout);
  assert.equal(m.esquema, "numinia-engine/mundo@2"); assert.deepEqual(m.motor, MOTOR);
  assert.deepEqual(m.ficheros.map((f: { ruta: string }) => f.ruta), lista.slice(1, 5), "the extras are not part of the world");
  const nuevo = join(tmp("mundo-otro-"), "nuevo");
  const i = await importarMundo(z, nuevo);
  assert.equal(i.ficheros, 4); assert.equal(i.motor, "abc1234 2026-10-15"); assert.deepEqual(i.partes, ["datos"]);
  assert.deepEqual(readdirSync(nuevo).sort(), ["datos"]);
  assert.deepEqual(readdirSync(join(nuevo, "datos")).sort(), ["activos", "misiones.jsonl", "objetos.json", "objetos.jsonl"]);
  assert.deepEqual(readdirSync(join(nuevo, "datos", "activos")), [glb]);
  for (const f of ["objetos.json", "objetos.jsonl", `activos/${glb}`]) assert.ok(readFileSync(join(nuevo, "datos", f)).equals(readFileSync(join(datos, f))), f);
});

test("mundo@2: the adventure and the environment travel; the extras run it (compose pins the image, arrancar.sh the release)", async () => {
  const { datos } = mundoDePrueba();
  const raiz = join(datos, "..");
  cpSync(new URL("../aventuras/ejemplo", import.meta.url), join(raiz, "aventura"), { recursive: true });
  writeFileSync(join(raiz, "aventura", "pnj", "roto.json"), "{ no es json");                // the engine skips it; it still travels
  writeFileSync(join(raiz, "aventura", "pnj", "grande.json"), "x".repeat(70 * 1024));       // too big for the engine: not copied
  mkdirSync(join(raiz, "aventura", "Mal Nombre")); writeFileSync(join(raiz, "aventura", "Mal Nombre", "a.json"), "{}");
  mkdirSync(join(raiz, "entorno")); writeFileSync(join(raiz, "entorno", "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", preset: "atardecer" }));
  writeFileSync(join(raiz, "claves.env"), "MOTOR_ADMIN=no-viaja-nunca-000000\n"); mkdirSync(join(raiz, "sesiones")); writeFileSync(join(raiz, "sesiones", "s.jsonl"), "{}\n");
  const o: Origen = { datos, subidas: join(datos, "activos"), aventura: join(raiz, "aventura"), entorno: join(raiz, "entorno") };
  const z = join(tmp("mundo2-"), "m.zip");
  await aFichero(z, (w) => exportarMundo(w, o, MOTOR));
  const lista = spawnSync("unzip", ["-Z1", z], { encoding: "utf8" }).stdout.trim().split("\n");
  for (const f of ["aventura/LEEME.md", "aventura/ficha.json", "aventura/misiones/primeros-pasos.json", "aventura/pnj/alma.json", "aventura/pnj/bruno.json", "aventura/cosas/caja-de-bruno.json", "aventura/habitantes/lia.json", "aventura/pnj/roto.json", "entorno/entorno.json", "compose.yml", "arrancar.sh", "LEEME.txt"]) assert.ok(lista.includes(f), f);
  for (const f of lista) assert.doesNotMatch(f, /claves|sesiones|subidas|grande|Mal Nombre|\.subiendo/, f);
  const z1 = spawnSync("unzip", ["-Z", z, "arrancar.sh"], { encoding: "utf8" }).stdout;
  assert.match(z1, /^-rwxr-xr-x/m, "arrancar.sh is executable once unzipped");
  const compose = spawnSync("unzip", ["-p", z, "compose.yml"], { encoding: "utf8" }).stdout;
  assert.match(compose, new RegExp(`image: ghcr\\.io/numengames/numinia-engine:sha-${COMMIT}\\n`));
  assert.match(compose, /- "127\.0\.0\.1:8790:8790"/); assert.match(compose, /- \.:\/mundo:z/); assert.match(compose, /user: "0:0"/);
  const arrancar = spawnSync("unzip", ["-p", z, "arrancar.sh"], { encoding: "utf8" }).stdout;
  assert.equal(spawnSync("bash", ["-n", "-c", arrancar]).status, 0, "arrancar.sh is valid bash");
  assert.match(arrancar, /releases\/download\/motor-\$CORTO/); assert.match(arrancar, new RegExp(`COMMIT=${COMMIT}`)); assert.match(arrancar, /sha256sum/);
  const leeme = spawnSync("unzip", ["-p", z, "LEEME.txt"], { encoding: "utf8" }).stdout;
  assert.equal(leeme.trimEnd().split("\n").length, 10, "LEEME.txt: ten lines");
  // unpacked elsewhere: the same adventure and environment, files the inhabitants' service may read (644)
  const nuevo = join(tmp("mundo2-otro-"), "nuevo");
  const i = await importarMundo(z, nuevo);
  assert.deepEqual(i.partes, ["aventura", "datos", "entorno"]); assert.equal(i.esquema, "numinia-engine/mundo@2");
  assert.ok(readFileSync(join(nuevo, "aventura", "pnj", "alma.json")).equals(readFileSync(join(raiz, "aventura", "pnj", "alma.json"))));
  assert.equal(statSync(join(nuevo, "aventura", "pnj", "alma.json")).mode & 0o777, 0o644);
  assert.ok(existsSync(join(nuevo, "entorno", "entorno.json")));
  assert.ok(!existsSync(join(nuevo, "compose.yml")) && !existsSync(join(nuevo, "claves.env")));
});

test("mundo@2: a copy of a RUNNING world is consistent — a journal ends at its last complete line", async () => {
  const d = tmp("consistente-");
  writeFileSync(join(d, "objetos.json"), '{"version":1}');
  writeFileSync(join(d, "objetos.jsonl"), '{"op":"s","key":"o1"}\n{"op":"s","key":"o2"}\n{"op":"s","ke');
  const par = leerFuncion(join(d, "objetos.json"), join(d, "objetos.jsonl"));
  assert.equal(par.jsonl!.toString(), '{"op":"s","key":"o1"}\n{"op":"s","key":"o2"}\n');
  assert.equal(par.json!.toString(), '{"version":1}');
  assert.equal(leerFuncion(join(d, "otra.json"), join(d, "otra.jsonl")).json, undefined, "a feature that has not saved yet");
});

test("mundo@1 zips (datos/ only, yesterday's) are still read", async () => {
  const { datos, glb } = mundoDePrueba();
  const ficheros = ["objetos.json", "objetos.jsonl", `activos/${glb}`].map((f) => ({ ruta: `datos/${f}`, b: readFileSync(join(datos, f)) }));
  const m1 = { schema: "numinia-engine/mundo@1", motor: "b7bc3dd 2026-10-15", hecho: "2026-10-15T20:00:00.000Z", ficheros: ficheros.map((f) => ({ ruta: f.ruta, bytes: f.b.length, sha256: sha(f.b) })) };
  const d = tmp("mundo1-"), z = join(d, "uno.zip");
  writeFileSync(z, zipCrudo([{ nombre: "mundo.json", datos: Buffer.from(JSON.stringify(m1)) }, ...ficheros.map((f) => ({ nombre: f.ruta, datos: f.b }))]));
  const i = await importarMundo(z, join(d, "nuevo"));
  assert.equal(i.esquema, "numinia-engine/mundo@1"); assert.equal(i.motor, "b7bc3dd 2026-10-15"); assert.deepEqual(i.partes, ["datos"]);
  assert.ok(!existsSync(join(d, "nuevo", "aventura")), "no adventure: the next start seeds the example");
  // an @1 zip cannot bring an adventure (that is @2)
  const raro = { ...m1, ficheros: [...m1.ficheros, { ruta: "aventura/pnj/x.json", bytes: 2, sha256: sha(Buffer.from("{}")) }] };
  writeFileSync(z, zipCrudo([{ nombre: "mundo.json", datos: Buffer.from(JSON.stringify(raro)) }, ...ficheros.map((f) => ({ nombre: f.ruta, datos: f.b })), { nombre: "aventura/pnj/x.json", datos: Buffer.from("{}") }]));
  await assert.rejects(importarMundo(z, join(d, "otro")), (e: unknown) => e instanceof ErrorZip && e.regla === "ruta");
});

test("mundo: a zip that is not a world, or not the one its manifest says, is refused and leaves nothing", async () => {
  const { datos, glb } = mundoDePrueba();
  const d = tmp("mundo-mal-"), z = join(d, "bueno.zip");
  await aFichero(z, (w) => exportarMundo(w, soloDatos(datos), MOTOR));
  const m = JSON.parse(spawnSync("unzip", ["-p", z, "mundo.json"], { encoding: "utf8" }).stdout);
  const ficheros = Object.fromEntries(m.ficheros.map((f: { ruta: string }) => [f.ruta, readFileSync(join(datos, f.ruta.slice("datos/".length)))]));
  const con = (cambios: Record<string, Buffer | null>, manifiesto = m) => {
    const todo: Record<string, Buffer | null> = { "mundo.json": Buffer.from(JSON.stringify(manifiesto)), ...ficheros, ...cambios };
    return zipCrudo(Object.entries(todo).filter(([, v]) => v !== null).map(([nombre, datos]) => ({ nombre, datos: datos! })));
  };
  const prueba = async (buf: Buffer, regla: string, texto: RegExp) => {
    const zz = join(d, `${regla}-${Math.random().toString(36).slice(2)}.zip`), destino = join(d, `dest-${Math.random().toString(36).slice(2)}`);
    writeFileSync(zz, buf);
    await assert.rejects(importarMundo(zz, destino), (e: unknown) => e instanceof ErrorZip && e.regla === regla && texto.test(e.message), `${regla} ${texto}`);
    assert.ok(!existsSync(destino), "nothing left behind");
  };
  await prueba(zipCrudo([{ nombre: "otra-cosa.txt", datos: Buffer.from("x") }]), "ruta", /falta mundo\.json/);
  await prueba(con({ "datos/objetos.jsonl": Buffer.from("cambiado\n") }), "crc", /no es el que dice mundo\.json/);
  await prueba(con({ "datos/extra.json": Buffer.from("{}") }), "ruta", /no está en mundo\.json/);
  await prueba(con({ "datos/objetos.jsonl": null }), "cortado", /faltan 1/);
  await prueba(con({ ".env": Buffer.from("MOTOR_SECRET=x") }), "ruta", /no está en mundo\.json/);
  await prueba(con({ "claves.env": Buffer.from("MOTOR_ADMIN=x") }), "ruta", /no está en mundo\.json/);
  const fuera = { ...m, ficheros: [...m.ficheros, { ruta: "sesiones/s.jsonl", bytes: 3, sha256: sha(Buffer.from("{}\n")) }] };
  await prueba(con({ "sesiones/s.jsonl": Buffer.from("{}\n") }, fuera), "ruta", /no es un fichero del mundo/);
  const hondo = { ...m, ficheros: [...m.ficheros, { ruta: "aventura/a/b/c.json", bytes: 2, sha256: sha(Buffer.from("{}")) }] };
  await prueba(con({ "aventura/a/b/c.json": Buffer.from("{}") }, hondo), "ruta", /no es un fichero de aventura/);
  const raro = { ...m, ficheros: [...m.ficheros, { ruta: "datos/activos/hola.glb", bytes: 1, sha256: "0" }] };
  await prueba(con({ "datos/activos/hola.glb": Buffer.from("x") }, raro), "ruta", /no es un fichero subido/);
  const falso = Buffer.from(BLOQUE); falso[0] = 0; // a .glb named by its sha256 but not a glb
  const malGlb = { ...m, ficheros: [...m.ficheros.filter((f: { ruta: string }) => !f.ruta.includes("activos")), { ruta: `datos/activos/${sha(falso)}.glb`, bytes: falso.length, sha256: sha(falso) }] };
  await prueba(con({ [`datos/activos/${glb}`]: null, [`datos/activos/${sha(falso)}.glb`]: falso }, malGlb), "ruta", /no vale/);
  // a world folder zipped again by hand, with one top folder and macOS litter, is still a world
  const envuelto = zipCrudo([{ nombre: "mi-mundo/mundo.json", datos: Buffer.from(JSON.stringify(m)) }, ...Object.entries(ficheros).map(([n, b]) => ({ nombre: `mi-mundo/${n}`, datos: b })), { nombre: "__MACOSX/mi-mundo/._mundo.json", datos: Buffer.from("x") }]);
  writeFileSync(join(d, "envuelto.zip"), envuelto);
  assert.equal((await importarMundo(join(d, "envuelto.zip"), join(d, "ok"))).ficheros, 4);
});

test("mundo: the swap keeps the earlier world, only the last few", async () => {
  const padre = tmp("cambio-"), datos = join(padre, "datos");
  mkdirSync(datos); writeFileSync(join(datos, "a.json"), "1");
  for (let i = 0; i < COPIAS_ANTES + 2; i++) {
    const nuevo = join(padre, `.nuevo-${i}`); mkdirSync(nuevo); writeFileSync(join(nuevo, "a.json"), String(i + 2));
    const antes = await cambiarDatos(datos, nuevo, new Date(Date.UTC(2026, 9, 15, 20, 0, i)));
    assert.ok(antes && existsSync(antes));
  }
  assert.equal(readFileSync(join(datos, "a.json"), "utf8"), String(COPIAS_ANTES + 3));
  assert.equal(readdirSync(padre).filter((f) => f.startsWith("datos.antes-")).length, COPIAS_ANTES);
});

test("mundo: a world folder swaps datos/, aventura/ and entorno/ together; a part the zip lacks is left out", async () => {
  const raiz = tmp("cambio-mundo-");
  for (const p of ["datos", "aventura", "entorno"]) { mkdirSync(join(raiz, p)); writeFileSync(join(raiz, p, "viejo.json"), "1"); }
  const nuevo = join(raiz, ".nuevo"); mkdirSync(join(nuevo, "datos"), { recursive: true }); writeFileSync(join(nuevo, "datos", "nuevo.json"), "2");
  const guardadas = await cambiarPartes(raiz, ["datos", "aventura", "entorno"].map((p) => ({ parte: p, nuevo: join(nuevo, p) })), new Date(Date.UTC(2026, 9, 16, 5, 0, 0)));
  assert.equal(guardadas.length, 3);
  assert.deepEqual(readdirSync(join(raiz, "datos")), ["nuevo.json"]);
  assert.ok(!existsSync(join(raiz, "aventura")) && !existsSync(join(raiz, "entorno")), "an @1 zip: no adventure (seeded at the next start), house environment");
  assert.ok(existsSync(join(raiz, "aventura.antes-20261016T050000Z", "viejo.json")));
});

test("/mundo: code required; download by GET and by the page's form; upload swaps the world and restarts", async () => {
  const { datos, glb } = mundoDePrueba();
  let reinicios = 0;
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, datos, subidas: join(datos, "activos"), admin: ADMIN, version: "prueba", reiniciar: () => { reinicios++; } });
  const url = (p: string) => `http://127.0.0.1:${srv.port}${p}`;
  try {
    const pagina = await fetch(url("/mundo"));
    assert.equal(pagina.status, 200);
    assert.match(await pagina.text(), /Descargar el mundo/);
    assert.equal((await fetch(url("/mundo/zip"))).status, 401);
    assert.equal((await fetch(url("/mundo/zip"), { headers: { authorization: "Bearer otro-codigo-cualquiera" } })).status, 401);
    const bien = { authorization: `Bearer ${ADMIN}` };
    const est = await (await fetch(url("/mundo/estado"), { headers: bien })).json();
    assert.equal(est.ficheros, 4); assert.equal(est.subidos, 1); assert.equal(est.subir, "sí");
    const r = await fetch(url("/mundo/zip"), { headers: bien });
    assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "application/zip");
    const zip = Buffer.from(await r.arrayBuffer());
    const form = await fetch(url("/mundo/zip"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `codigo=${encodeURIComponent(ADMIN)}` });
    assert.equal(form.status, 200); assert.match(form.headers.get("content-disposition") ?? "", /^attachment; filename="mundo-\d{8}T\d{6}Z\.zip"$/);
    await form.arrayBuffer();
    // a bad zip: refused, the world untouched, no restart
    const malo = await fetch(url("/mundo/zip"), { method: "PUT", headers: bien, body: zipCrudo([{ nombre: "x.txt", datos: Buffer.from("x") }]) });
    assert.equal(malo.status, 422); assert.match((await malo.json()).error, /falta mundo\.json/);
    assert.equal(reinicios, 0);
    assert.deepEqual(readdirSync(join(datos, "..")).filter((f) => f.startsWith(".mundo-")), [], "the upload and staging are cleaned");
    // the same world with one object more: accepted, swapped, restarted
    writeFileSync(join(datos, "objetos.jsonl"), '{"op":"s","key":"o2","value":{"x":2}}\n{"op":"s","key":"o3","value":{"x":3}}\n');
    const r2 = await fetch(url("/mundo/zip"), { headers: bien });
    const zip2 = Buffer.from(await r2.arrayBuffer());
    writeFileSync(join(datos, "objetos.jsonl"), "");                     // the world changes on the server…
    const ok = await fetch(url("/mundo/zip"), { method: "PUT", headers: bien, body: zip2 });  // …and the copy comes back
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal((await ok.json()).ficheros, 4);
    for (let i = 0; i < 50 && reinicios === 0; i++) await new Promise((s) => setTimeout(s, 20));
    assert.equal(reinicios, 1);
    assert.match(readFileSync(join(datos, "objetos.jsonl"), "utf8"), /o3/);
    assert.ok(readFileSync(join(datos, "activos", glb)).equals(BLOQUE));
    const antes = readdirSync(join(datos, "..")).filter((f) => f.startsWith("datos.antes-"));
    assert.equal(antes.length, 1);
    assert.equal(readFileSync(join(datos, "..", antes[0], "objetos.jsonl"), "utf8"), "", "the world before is kept");
    assert.ok(zip.length > BLOQUE.length);
  } finally { await srv.close(); }
});

test("/mundo: without an administration code it is closed; wrong codes are capped", async () => {
  const { datos } = mundoDePrueba();
  const sin = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, datos, admin: "corto" });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${sin.port}/mundo/zip`, { headers: { authorization: "Bearer corto" } })).status, 403);
    assert.match(await (await fetch(`http://127.0.0.1:${sin.port}/mundo`)).text(), /no tiene código de administración/);
  } finally { await sin.close(); }
  const con = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, datos, admin: ADMIN });
  try {
    for (let i = 0; i < FALLOS_MAX; i++) assert.equal((await fetch(`http://127.0.0.1:${con.port}/mundo/estado`, { headers: { authorization: `Bearer mal-${i}` } })).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${con.port}/mundo/estado`, { headers: { authorization: `Bearer ${ADMIN}` } })).status, 429, "even the right code waits");
  } finally { await con.close(); }
});
