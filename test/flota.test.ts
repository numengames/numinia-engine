// The engine as a fleet world (P1, motor en la flota): the world folder (C2), keys (C3), /status (C4), the page served
// by the engine (C1), the image's own tools copia/comprobar/importar (C6), owners tied to the code, the installer's
// --desinstalar and the Dockerfile's contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";
import { carpetaMundo, claves, escribirManifiesto, sembrar } from "../packages/server/src/mundo-carpeta.ts";
import { Pagina } from "../packages/server/src/pagina.ts";
import { arrancar, etiqueta } from "../packages/server/src/mundo-extras.ts";
import { startServer } from "../packages/server/src/server.ts";
import { leerFicha, validarFicha } from "../packages/server/src/aventura.ts";
import { createHash } from "node:crypto";
import { serverUrl } from "../packages/client/src/index.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const ENTRADA = new URL("../packages/server/src/entrada.ts", import.meta.url).pathname;
const COMMIT = "c57dbb7cc4c51b0834184f1dd47b311e47fde234";
const MOTOR = { build: "c57dbb7 2026-10-16", commit: COMMIT, imagen: `ghcr.io/numengames/numinia-engine:sha-${COMMIT}` };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("C2: a new world folder gets a copy of the example adventure once; then it is the world's", () => {
  const c = carpetaMundo(join(tmp("carpeta-"), "mundo"));
  const log: string[] = [];
  assert.equal(sembrar(c, (l) => log.push(l)), true);
  for (const f of ["misiones/primeros-pasos.json", "pnj/alma.json", "pnj/bruno.json", "cosas/caja-de-bruno.json", "habitantes/lia.json"]) assert.ok(existsSync(join(c.aventura, f)), f);
  writeFileSync(join(c.aventura, "pnj", "alma.json"), "{\"cambiada\":true}");
  assert.equal(sembrar(c), false, "a world that has its adventure keeps it");
  assert.equal(readFileSync(join(c.aventura, "pnj", "alma.json"), "utf8"), "{\"cambiada\":true}");
  assert.match(log.join("\n"), /copia de la de ejemplo/);
  escribirManifiesto(c, MOTOR, new Date(Date.UTC(2026, 9, 16)));
  assert.deepEqual(JSON.parse(readFileSync(c.manifiesto, "utf8")), { esquema: "numinia-engine/mundo@2", motor: MOTOR, creado: "2026-10-16T00:00:00.000Z" });
  assert.deepEqual(readdirSync(c.raiz).filter((f) => f.startsWith(".")), [], "no half copy left behind");
});

test("C3: keys from the environment with the fleet's names as fallbacks; a local run makes them once (600) and never prints them", () => {
  const c = carpetaMundo(tmp("claves-"));
  const log: string[] = [];
  const flota = claves({ JWT_SECRET: "a".repeat(64), ADMIN_CODE: "0123456789abcdef" }, c, (l) => log.push(l));
  assert.equal(flota.secreto, "a".repeat(64)); assert.equal(flota.admin, "0123456789abcdef");
  assert.match(flota.dondeCodigo, /sala de Mundos/);
  assert.ok(!existsSync(c.claves), "a fleet run never writes claves.env");
  const propio = claves({ MOTOR_SECRET: "s".repeat(32), JWT_SECRET: "j".repeat(64), MOTOR_ADMIN: "m".repeat(20), ADMIN_CODE: "c".repeat(16) }, c);
  assert.equal(propio.secreto, "s".repeat(32)); assert.equal(propio.admin, "m".repeat(20), "MOTOR_* first");
  const local = claves({}, c, (l) => log.push(l));
  assert.ok(existsSync(c.claves)); assert.equal(statSync(c.claves).mode & 0o777, 0o600);
  assert.match(local.secreto!, /^[0-9a-f]{48}$/); assert.match(local.admin!, /^[0-9a-f]{48}$/);
  assert.equal(claves({}, c).admin, local.admin, "made once: the next start reads the same");
  for (const l of log) { assert.ok(!l.includes(local.admin!) && !l.includes(local.secreto!) && !l.includes("0123456789abcdef"), l); }
  assert.match(log.join("\n"), /claves\.env/);
  assert.equal(claves({}, null).admin, undefined, "no world folder and no keys: nothing made (dev)");
});

test("C1: the page — files under WWW_DIR only, right types, index.html revalidated, hashed assets immutable, 304", async () => {
  const www = tmp("www-");
  mkdirSync(join(www, "assets"));
  writeFileSync(join(www, "index.html"), "<!doctype html><title>plaza</title>");
  writeFileSync(join(www, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(www, ".oculto"), "no");
  const fuera = tmp("fuera-"); writeFileSync(join(fuera, "secreto.txt"), "no");
  symlinkSync(join(fuera, "secreto.txt"), join(www, "enlace.txt"));
  const p = new Pagina(www);
  for (const malo of ["/../fuera/secreto.txt", "/%2e%2e/%2e%2e/etc/passwd", "/.oculto", "/enlace.txt", "/assets/..%2f..%2findex.html", "//index.html", "/a\\b", "/%00", "/%E0%A4%A"]) assert.equal(p.fichero(malo), null, malo);
  assert.ok(p.fichero("/")?.endsWith("index.html"));
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, version: "prueba", www });
  const url = (q: string) => `http://127.0.0.1:${srv.port}${q}`;
  try {
    const raiz = await fetch(url("/"));
    assert.equal(raiz.status, 200); assert.match(raiz.headers.get("content-type")!, /^text\/html/);
    assert.equal(raiz.headers.get("cache-control"), "no-cache");
    const js = await fetch(url("/assets/index-abc123.js"));
    assert.match(js.headers.get("content-type")!, /^text\/javascript/); assert.equal(js.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal((await fetch(url("/"), { headers: { "if-none-match": raiz.headers.get("etag")! } })).status, 304);
    assert.equal((await fetch(url("/%2e%2e/%2e%2e/etc/passwd"))).status, 404);
    assert.equal((await fetch(url("/enlace.txt"))).status, 404);
    assert.equal((await fetch(url("/health"))).status, 200, "the engine's routes still answer");
    assert.equal((await fetch(url("/assets/index-abc123.js"), { method: "HEAD" })).headers.get("content-length"), "14");
  } finally { await srv.close(); }
});

test("C4: /status = {uptime, conectados, commitHash, version} — no names, no positions; open to the room", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, motor: MOTOR });
  try {
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}/ws`), s = new ClientSession(t);
    await t.opened;
    for (let i = 0; i < 200 && s.entity < 0; i++) { s.tick(0, 0); await sleep(25); } // up to 5 s: a loaded machine
    const r = await fetch(`http://127.0.0.1:${srv.port}/status`);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    const st = await r.json();
    assert.deepEqual(Object.keys(st).sort(), ["commitHash", "conectados", "uptime", "version"]);
    assert.equal(st.conectados, 1); assert.equal(st.commitHash, COMMIT); assert.equal(st.version, "c57dbb7 2026-10-16");
    assert.ok(Number.isInteger(st.uptime) && st.uptime >= 0);
    t.close();
  } finally { await srv.close(); }
});

test("ADR-074: aventura/ficha.json names the world — the served page's <title> and /status say it, with a cover the server has", async () => {
  const aventura = tmp("ficha-"), www = tmp("www-ficha-");
  writeFileSync(join(www, "index.html"), "<!doctype html><title>Numinia · motor</title><p>hola</p>");
  const textura = readFileSync(new URL("../activos/texturas/hierba-color.webp", import.meta.url));
  const sha = createHash("sha256").update(textura).digest("hex");
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: " La plaza «de» Ana & Bea ", descripcion: "Un mundo de prueba.", portada: `${sha}.webp`, deUnMotorNuevo: { x: 1 } }));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: MOTOR, aventura, www });
  const url = (q: string) => `http://127.0.0.1:${srv.port}${q}`;
  try {
    const st = await (await fetch(url("/status"))).json();
    assert.equal(st.nombre, "La plaza «de» Ana & Bea"); assert.equal(st.descripcion, "Un mundo de prueba."); assert.equal(st.portada, `/a/${sha}.webp`);
    assert.equal((await fetch(url(st.portada))).status, 200, "the cover is served where every picture of the world is");
    const raiz = await fetch(url("/")), html = await raiz.text();
    assert.equal(html, "<!doctype html><title>La plaza «de» Ana &amp; Bea</title><p>hola</p>");
    assert.equal(raiz.headers.get("content-length"), String(Buffer.byteLength(html)));
    assert.equal((await fetch(url("/"), { headers: { "if-none-match": raiz.headers.get("etag")! } })).status, 304);
    assert.ok(log.some((l) => l.includes("[ficha] el mundo se llama «La plaza «de» Ana & Bea»")));
  } finally { await srv.close(); }
  // a cover this server does not have: said once, left out; the name still goes
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Otra", portada: `${"0".repeat(64)}.png` }));
  const log2: string[] = [];
  const srv2 = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log2.push(l), statsMs: 60_000, motor: MOTOR, aventura });
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv2.port}/status`)).json();
    assert.equal(st.nombre, "Otra"); assert.equal(st.portada, undefined);
    assert.ok(log2.some((l) => /no está en este servidor/.test(l)));
  } finally { await srv2.close(); }
});

test("ficha@1: checked with paths, never throws; unknown fields kept; a broken or absent ficha = the world as before", () => {
  const ok = validarFicha({ formato: "ficha@1", nombre: "Plaza", notas: "para personas", nuevo: [1] });
  assert.ok(ok.ok && ok.value.nuevo !== undefined && ok.value.notas === "para personas");
  const ko = validarFicha({ formato: "ficha@2", nombre: "x".repeat(61), descripcion: "y".repeat(501), portada: "../../etc/passwd" });
  assert.ok(!ko.ok);
  assert.deepEqual(ko.issues.map((i) => i.path), ["ficha.json.formato", "ficha.json.nombre", "ficha.json.descripcion", "ficha.json.portada"]);
  assert.ok(validarFicha({ formato: "ficha@1", nombre: "ñ".repeat(60), descripcion: "é".repeat(500) }).ok, "limits count characters, not bytes");
  assert.ok(!validarFicha({ formato: "ficha@1", nombre: "<script>" }).ok);
  assert.ok(!validarFicha({ formato: "ficha@1", nombre: "a", portada: `${"a".repeat(64)}.glb` }).ok, "a cover is a png, jpg or webp");
  assert.ok(!validarFicha([]).ok);
  const d = tmp("ficha-mal-");
  assert.deepEqual(leerFicha(d), { ficha: null, problemas: [] }, "no ficha: nothing to say");
  assert.deepEqual(leerFicha(null), { ficha: null, problemas: [] });
  writeFileSync(join(d, "ficha.json"), "{ roto");
  assert.match(leerFicha(d).problemas[0], /^ficha\.json: JSON roto/);
  const ej = leerFicha(new URL("../aventuras/ejemplo", import.meta.url).pathname);
  assert.equal(ej.ficha?.nombre, "Plaza de ejemplo"); assert.deepEqual(ej.problemas, []);
});

test("arrancar.sh points at the release the installer is tagged with (its own short commit, any length)", () => {
  const largo = "c57dbb7cc4c51b0834184f1dd47b311e47fde234";
  assert.equal(etiqueta({ build: "c57dbb7 2026-10-16", commit: largo, imagen: null }), "c57dbb7");
  assert.equal(etiqueta({ build: "c57dbb7cc 2026-10-16", commit: largo, imagen: null }), "c57dbb7cc", "git gave a longer short");
  assert.equal(etiqueta({ build: "dev", commit: largo, imagen: null }), "c57dbb7");
  assert.match(arrancar({ build: "c57dbb7cc 2026-10-16", commit: largo, imagen: null }), /^CORTO=c57dbb7cc$/m);
});

test("the built page talks to its own origin, also on localhost (a world in a container or from arrancar.sh)", () => {
  const loc = (href: string) => { const u = new URL(href); return { protocol: u.protocol, hostname: u.hostname, host: u.host, search: u.search }; };
  assert.equal(serverUrl(loc("http://localhost:8790/"), true), "ws://localhost:8790/ws");
  assert.equal(serverUrl(loc("http://127.0.0.1:18790/"), true), "ws://127.0.0.1:18790/ws");
  assert.equal(serverUrl(loc("http://localhost:5173/"), false), "ws://localhost:8790", "the dev page (vite) keeps the dev server");
  assert.equal(serverUrl(loc("http://localhost:8790/?server=ws://otro:1"), true), "ws://otro:1");
});

/** Runs the image's entry point (no container): node entrada.ts <orden>, stdin from a buffer. */
function cli(orden: string, mundo: string | null, entrada?: Buffer): Promise<{ code: number; out: Buffer; err: string }> {
  return new Promise((ok) => {
    const env = { ...process.env, MOTOR_MUNDO: mundo ?? "/no-existe" };
    const p = spawn(process.execPath, [ENTRADA, orden], { env, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = []; let err = "";
    p.stdout.on("data", (d) => out.push(d)); p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => ok({ code: code ?? -1, out: Buffer.concat(out), err }));
    if (entrada) p.stdin.end(entrada); else p.stdin.end();
  });
}

test("C6: copia → comprobar → importar (an EMPTY folder only) gives the same world; a hostile or oversize zip is refused in one line", async () => {
  const origen = carpetaMundo(join(tmp("cli-"), "mundo"));
  sembrar(origen);
  mkdirSync(origen.datos, { recursive: true });
  writeFileSync(join(origen.datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 1, state: [["o1", { value: { x: 1 } }]], store: [] }));
  writeFileSync(join(origen.datos, "objetos.jsonl"), '{"op":"s","key":"o2","value":{"x":2}}\n{"op":"s","ke'); // being written
  writeFileSync(join(origen.raiz, "claves.env"), "MOTOR_ADMIN=nunca-en-el-zip-000000\n");
  const c = await cli("copia", origen.raiz);
  assert.equal(c.code, 0, c.err); assert.match(c.err, /copia: \d+ ficheros/);
  const zip = c.out;
  const ok = await cli("comprobar", null, zip);
  assert.equal(ok.code, 0, ok.err); assert.match(ok.out.toString(), /^vale: numinia-engine\/mundo@2/);
  const destino = join(tmp("cli-dest-"), "mundo"); mkdirSync(destino);
  const imp = await cli("importar", destino, zip);
  assert.equal(imp.code, 0, imp.err);
  assert.deepEqual(readdirSync(destino).sort(), ["aventura", "datos", "mundo.json"]);
  assert.equal(readFileSync(join(destino, "datos", "objetos.jsonl"), "utf8"), '{"op":"s","key":"o2","value":{"x":2}}\n', "only complete lines travel");
  assert.ok(readFileSync(join(destino, "aventura", "pnj", "bruno.json")).equals(readFileSync(join(origen.aventura, "pnj", "bruno.json"))));
  assert.ok(!existsSync(join(destino, "claves.env")));
  const otra = await cli("importar", destino, zip);
  assert.equal(otra.code, 1); assert.match(otra.err, /no está vacía/); assert.equal(otra.err.trim().split("\n").length, 1);
  // hostile: a path that climbs out, and an entry that claims 65 MB (over the per-file cap): one line, exit 1, nothing left
  const crudo = (nombre: string, datos: Buffer, tamano = datos.length, metodo = 0) => {
    const n = Buffer.from(nombre), cuerpo = metodo === 8 ? deflateRawSync(datos) : datos;
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(metodo, 8); l.writeUInt32LE(crc32(datos), 14); l.writeUInt32LE(cuerpo.length, 18); l.writeUInt32LE(tamano, 22); l.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE((3 << 8) | 20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(metodo, 10); cd.writeUInt32LE(crc32(datos), 16); cd.writeUInt32LE(cuerpo.length, 20); cd.writeUInt32LE(tamano, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10); fin.writeUInt32LE(46 + n.length, 12); fin.writeUInt32LE(30 + n.length + cuerpo.length, 16);
    return Buffer.concat([l, n, cuerpo, cd, n, fin]);
  };
  for (const [malo, regla] of [[crudo("../../etc/cron.d/x", Buffer.from("x")), /ruta/], [crudo("datos/objetos.json", Buffer.alloc(1024), 65 * 1048576, 8), /grande/]] as const) {
    const r = await cli("comprobar", null, malo);
    assert.equal(r.code, 1); assert.match(r.err, regla); assert.equal(r.err.trim().split("\n").length, 1, r.err);
    const vacia = join(tmp("cli-vacia-"), "m"); mkdirSync(vacia);
    const i = await cli("importar", vacia, malo);
    assert.equal(i.code, 1); assert.deepEqual(readdirSync(vacia), [], "a refused import leaves the folder empty");
  }
  assert.equal((await cli("otra-cosa", null)).code, 2);
});

test("installer: --desinstalar stops and removes the services and Caddy, keeps the world, never touches ssh or ufw", () => {
  const tpl = readFileSync("deploy/instalar-motor.plantilla.sh", "utf8");
  const bloque = tpl.slice(tpl.indexOf('if [ "$DESINSTALAR" = 1 ]'), tpl.indexOf("# ---------- checks ----------"));
  for (const u of ["$ACT_SERVICE.timer", "$HAB_SERVICE.service", "$SERVICE.service"]) assert.ok(bloque.includes(u), u);
  assert.match(bloque, /systemctl disable --now caddy/); assert.match(bloque, /systemctl mask caddy/);
  assert.match(bloque, /rm -rf "\$PREFIX"/); assert.doesNotMatch(bloque, /rm -rf "?\$STATE|\/var\/lib\/numinia-motor"? *$/m, "the world stays");
  const ordenes = bloque.split("\n").filter((l) => !/^\s*(#|say )/.test(l)).join("\n");
  assert.doesNotMatch(ordenes, /\bufw\b|sshd|ssh\.service|systemctl [a-z-]+ ssh/, "never touches ssh or the firewall");
  assert.match(tpl, /systemctl unmask caddy/, "a later install brings Caddy back");
  const help = spawnSync("bash", ["deploy/instalar-motor.plantilla.sh", "--help"], { encoding: "utf8" }).stdout;
  assert.match(help, /--desinstalar/); assert.ok(tpl.includes("    --desinstalar)"));
  const env = tpl.split("\n").find((l) => l.startsWith("Environment=PORT=")) ?? "";
  assert.match(env, /\bMOTOR_MUNDO=\$STATE\b/); assert.match(tpl, /^STATE=\/var\/lib\/numinia-motor\b/m);
  assert.match(tpl, /Environment=MOTOR_URL=[^\n]*AVENTURA_DIR=\$STATE\/aventura/, "the inhabitants read the world's own adventure");
  assert.match(tpl, /cp -r "\$PREFIX\/app\/aventuras\/ejemplo" "\$STATE\/\.aventura-nueva"/, "the installer seeds the adventure when absent");
});

test("Dockerfile (C1): built from the installer, Node checked by sha256, 10001:10001 on 0.0.0.0:8790, /mundo, healthcheck", () => {
  const d = readFileSync("Dockerfile", "utf8");
  assert.match(d, /COPY deploy\/instalar-motor\.sh/); assert.match(d, /--solo-extraer \/opt\/numinia-engine/);
  assert.match(d, /sha256sum -c -/); assert.match(d, /NODE_\(VERSION\|SHA256_X64\|SHA256_ARM64\)/, "Node's version and sums come from the installer itself");
  assert.match(d, /^USER 10001:10001$/m); assert.match(d, /^EXPOSE 8790$/m); assert.match(d, /PORT=8790 HOST=0\.0\.0\.0/);
  assert.match(d, /MOTOR_MUNDO=\/mundo/); assert.match(d, /WWW_DIR=\/opt\/numinia-engine\/www/); assert.match(d, /^HEALTHCHECK .*\n.*\/health/m);
  assert.match(d, /ENTRYPOINT \["\/opt\/numinia-engine\/node\/bin\/node", "packages\/server\/src\/entrada\.ts"\]/);
  assert.match(d, /debian:13-slim@sha256:[0-9a-f]{64}/, "the base is pinned");
  assert.doesNotMatch(d.split("\n").filter((l) => !l.startsWith("#")).join("\n"), /SECRET|ADMIN_CODE|MOTOR_ADMIN/, "no key in the image");
  assert.match(readFileSync(".dockerignore", "utf8"), /^\*\n!deploy\/instalar-motor\.sh\n?$/m);
});
