// H9: uploading your own files into the world — PUT /a/<sha256>.<ext> (packages/server/src/subidas.ts), the shared
// checks (packages/net/src/ficheros.ts) and features/objetos placing what was uploaded. Parity with Hyperfy2's
// /api/upload, but only for who may build: docs/HYPERFY2-PARIDAD.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comprobarFichero, comprobarGlb, sha256Hex, SUBIDAS_TOTAL_MB, TIPOS, TOPES_MB } from "../packages/net/src/ficheros.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import type { RunningServer, ServerOptions } from "../packages/server/src/server.ts";
import { signer } from "../packages/server/src/secret.ts";
import { emitir, today } from "../packages/instance/src/identidad.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { ClientPart } from "../packages/feature/src/index.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";

const SECRETO = "una-clave-de-prueba-larga";
const BILLETE = emitir(signer(SECRETO), "abcdefgh2345", today());
const BLOQUE = new Uint8Array(readFileSync(new URL("../activos/casa/bloque.glb", import.meta.url)));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));

/** bloque.glb with another node name: same model, new bytes, new sha256 (what someone's own file looks like). */
export function variante(glb: Uint8Array, nombre: string): Uint8Array {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength), n = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + n)));
  json.nodes[0].name = nombre;
  const enc = new TextEncoder().encode(JSON.stringify(json)), jb = new Uint8Array(Math.ceil(enc.length / 4) * 4).fill(0x20);
  jb.set(enc);
  const rest = glb.subarray(20 + n), out = new Uint8Array(20 + jb.length + rest.length), o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true); o.setUint32(4, 2, true); o.setUint32(8, out.length, true);
  o.setUint32(12, jb.length, true); o.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20); out.set(rest, 20 + jb.length);
  return out;
}

async function servidor(extra: Partial<ServerOptions> = {}) {
  const dir = extra.subidas ?? tmp("subidas-");
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, secret: SECRETO, construir: "todos", subidas: dir, features: [crearObjetos()], log: (l) => log.push(l), ...extra });
  const url = (h: string, ext = "glb") => `http://127.0.0.1:${srv.port}/a/${h}.${ext}`;
  const subir = (b: Uint8Array, opts: { ext?: string; h?: string; billete?: string | null; fichero?: string } = {}) =>
    fetch(url(opts.h ?? sha(b), opts.ext), {
      method: "PUT", body: b,
      headers: { ...(opts.billete === null ? {} : { authorization: `Bearer ${opts.billete ?? BILLETE}` }), "x-nombre-fichero": encodeURIComponent(opts.fichero ?? "Mi silla.glb") },
    });
  return { srv, dir, log, url, subir };
}

test("sha256 for pages without crypto.subtle: the same as node:crypto, at every padding edge", () => {
  for (const n of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000, 100_003]) {
    const b = randomBytes(n);
    assert.equal(sha256Hex(new Uint8Array(b)), sha(b), `${n} bytes`);
  }
  assert.equal(sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("GLB check: the house block passes; every broken variant is refused with its path, never thrown", () => {
  const ok = comprobarGlb(BLOQUE);
  assert.ok(ok.ok && ok.value.binBytes > 0);
  const roto = (f: (b: Uint8Array, dv: DataView) => void) => { const b = BLOQUE.slice(); f(b, new DataView(b.buffer)); return comprobarGlb(b); };
  const casos: [string, ReturnType<typeof comprobarGlb>][] = [
    ["glb.magic", roto((b) => { b[0] = 0x78; })],
    ["glb.version", roto((_b, dv) => dv.setUint32(4, 1, true))],
    ["glb.length", comprobarGlb(BLOQUE.subarray(0, 1000))],
    ["glb.chunks[0].length", roto((_b, dv) => dv.setUint32(12, 1_000_000, true))],
    ["glb.chunks[0].type", roto((_b, dv) => dv.setUint32(16, 0x004e4942, true))],
    ["glb.chunks[0].json", roto((b) => { b[20] = 0x5b; b[21] = 0x5b; })],
    ["glb", comprobarGlb(new Uint8Array(4))],
  ];
  for (const [path, r] of casos) { assert.equal(r.ok, false, path); if (!r.ok) assert.equal(r.issues[0].path, path); }
  const v1 = BLOQUE.slice(), at = new TextDecoder().decode(v1).indexOf('"version":"2.0"') + 11; // the "2": same length, only the digit changes
  v1[at] = 0x31;
  const otra = comprobarGlb(v1);
  assert.ok(!otra.ok && otra.issues[0].path === "glb.json.asset.version", JSON.stringify(otra));
  // the other kinds by their first bytes; a .vrm must be a VRM
  assert.ok(comprobarFichero("png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])).ok);
  assert.equal(comprobarFichero("png", BLOQUE).ok, false);
  assert.equal(comprobarFichero("vrm", BLOQUE).ok, false);
  assert.equal(comprobarFichero("exe", BLOQUE).ok, false);
});

test("limits.json publishes the upload caps the code enforces (upload_max_<kind>, upload_total_max)", () => {
  const lim = JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")).limits as { key: string; value: unknown; state: string; test?: string }[];
  for (const tipo of Object.keys(TIPOS)) {
    const e = lim.find((x) => x.key === `upload_max_${tipo}`);
    assert.ok(e, `limits.json: falta upload_max_${tipo}`);
    assert.equal(e.value, TOPES_MB[tipo], `upload_max_${tipo}`);
    assert.equal(e.test, "test/subidas.test.ts");
  }
  assert.equal(lim.find((x) => x.key === "upload_total_max")?.value, SUBIDAS_TOTAL_MB);
});

test("upload: stored once by its sha256, served like the library, the second time says it was there; who uploaded stays on the server", async () => {
  const { srv, dir, url, subir } = await servidor();
  try {
    const mio = variante(BLOQUE, "silla-de-prueba"), h = sha(mio);
    assert.equal((await fetch(url(h), { method: "HEAD" })).status, 404, "not there yet: the page asks first");
    const r1 = await subir(mio);
    assert.equal(r1.status, 201);
    const j1 = await r1.json();
    assert.deepEqual({ ...j1 }, { sha256: h, tipo: "glb", bytes: mio.length, url: `/a/${h}.glb`, nuevo: true });
    assert.equal(r1.headers.get("access-control-allow-origin"), "*");
    const r2 = await subir(mio, { fichero: "otra vez.glb" });
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).nuevo, false);
    assert.deepEqual(readdirSync(dir).filter((f) => !f.startsWith(".")).sort(), [`${h}.glb`, "subidas.jsonl"], "one file, one record");
    const g = await fetch(url(h));
    assert.equal(g.status, 200);
    assert.match(g.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(g.headers.get("content-type"), "model/gltf-binary");
    assert.equal(sha(new Uint8Array(await g.arrayBuffer())), h);
    const head = await fetch(url(h), { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-length"), String(mio.length));
    const lineas = readFileSync(join(dir, "subidas.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lineas.length, 1);
    assert.deepEqual({ ...lineas[0], cuando: "" }, { cuando: "", sha256: h, tipo: "glb", bytes: mio.length, quien: "abcdefgh2345", nombre: "Invitado 2345", fichero: "Mi silla.glb" });
    assert.equal(JSON.stringify(j1).includes("abcdefgh2345"), false, "pages never get who uploaded it");
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/a/subidas.jsonl`)).status, 404, "the record is never served");
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/a/`)).status, 404, "no listing");
    const pre = await fetch(url(h), { method: "OPTIONS" });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get("access-control-allow-methods") ?? "", /PUT/);
    assert.match(pre.headers.get("access-control-allow-headers") ?? "", /authorization/);
  } finally { await srv.close(); }
});

test("upload refused: no token 401, a visitor 403, a forbidden kind 415, too big 413, broken bytes 422, other bytes than the name 422, full 507", async () => {
  const cerrado = await servidor({ construir: "nadie" });
  try {
    const mio = variante(BLOQUE, "visitante");
    assert.equal((await cerrado.subir(mio)).status, 403, "a visitor (valid token, may not build)");
    assert.equal((await cerrado.subir(mio, { billete: null })).status, 401);
    assert.equal((await cerrado.subir(mio, { billete: emitir(signer("otra-clave-distinta-larga"), "abcdefgh2345", today()) })).status, 401, "a forged token");
    assert.match((await (await cerrado.subir(mio)).json()).error, /construir/);
    assert.deepEqual(readdirSync(cerrado.dir), []);
  } finally { await cerrado.srv.close(); }
  const s = await servidor({ subir: { topesMB: { glb: 0.001 }, totalMB: 0.002 } }); // glb ≤ 1,048 bytes, all ≤ 2,097
  try {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    for (const ext of ["exe", "html", "gltf", "js", "svg"]) assert.equal((await s.subir(html, { ext })).status, 415, ext);
    const r413 = await s.subir(BLOQUE, { h: sha(BLOQUE) + "", ext: "glb" });
    assert.equal(r413.status, 413, "1,592 bytes over a 1,048-byte cap");
    const roto = BLOQUE.slice(0, 900); new DataView(roto.buffer).setUint32(8, 900, true); // says its length right, chunks do not fit
    const r422 = await s.subir(roto);
    assert.equal(r422.status, 422);
    assert.match((await r422.json()).error, /trozo/);
    assert.equal((await s.subir(new Uint8Array([1, 2, 3]), { h: "a".repeat(64) })).status, 422, "the server computes the sha256 itself");
    assert.equal((await s.subir(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]), { ext: "png" })).status, 201, "a tiny png fits");
    assert.equal((await s.subir(new Uint8Array(64).fill(7), { ext: "mp3" })).status, 422, "these bytes are not an mp3");
    const png = (k: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...randomBytes(k)]);
    assert.equal((await s.subir(png(1000), { ext: "png" })).status, 201);
    assert.equal((await s.subir(png(1500), { ext: "png" })).status, 507, "all uploads together are capped");
    assert.equal(readdirSync(s.dir).filter((f) => f.endsWith(".glb")).length, 0, "nothing broken was stored");
    assert.equal(readdirSync(s.dir).some((f) => f.startsWith(".subiendo-")), false, "no half files left");
    // a path is never taken from the client: anything but /a/<64 hex>.<kind> is refused before reading
    const crudo = (path: string) => new Promise<number>((ok) => { const q = request({ host: "127.0.0.1", port: s.srv.port, path, method: "PUT", headers: { authorization: `Bearer ${BILLETE}` } }, (r) => { r.resume(); ok(r.statusCode ?? 0); }); q.end("x"); });
    for (const p of ["/a/..%2f..%2fpackage.json", "/a/../../package.json", `/a/${"A".repeat(64)}.glb`, `/a/${"a".repeat(64)}.glb/x`, "/a/x.glb"]) assert.equal(await crudo(p), 400, p);
    assert.equal(existsSync(join(s.dir, "..", "package.json")), false);
  } finally { await s.srv.close(); }
});

test("objetos: colocar takes an uploaded model (api.activo) and refuses an unknown one", () => {
  const SUBIDO = "b".repeat(64);
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearObjetos()], puede: () => true, activo: (h, ext) => h === SUBIDO && ext === "glb" });
  const t = inst.join(0), cli = crearCliente(), s = new ClientSession(t, { features: [cli.part as ClientPart] });
  const pump = () => { for (let i = 0; i < 2; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  s.features.send("objetos", "colocar", { modelo: SUBIDO, x: 2, z: -4, nombre: "Mi silla", decorado: false }); pump();
  const puestos = [...s.features.stateOf("objetos").values()];
  assert.deepEqual(puestos.map((o) => [o.modelo, o.nombre, o.x, o.z]), [[SUBIDO, "Mi silla", 2, -4]]);
  s.features.send("objetos", "colocar", { modelo: "c".repeat(64), x: 0, z: 0, nombre: "Nada", decorado: false }); pump();
  assert.equal(s.features.stateOf("objetos").size, 1);
  assert.match(cli.constructor.estado.ultimoRechazo, /biblioteca ni se ha subido/);
});

test("over a real server: upload, place it, restart — the file and the thing are still there", async () => {
  const dir = tmp("subidas-"), datos = tmp("datos-");
  const mio = variante(BLOQUE, "farola"), h = sha(mio);
  const colocar = async (srv: RunningServer, modelo: string) => {
    let token: string | null = BILLETE;
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}`), cli = crearCliente();
    const s = new ClientSession(t, { features: [cli.part as ClientPart], identity: { load: () => token, save: (x) => { token = x; } } });
    await t.opened;
    const espera = async (f: () => boolean) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); return f(); };
    assert.ok(await espera(() => !!s.who && cli.constructor.estado.puede));
    const antes = s.features.stateOf("objetos").size;
    s.features.send("objetos", "colocar", { modelo, x: 1, z: 1, nombre: "Farola", decorado: false });
    await espera(() => s.features.stateOf("objetos").size > antes || !!cli.constructor.estado.ultimoRechazo);
    const r = { n: s.features.stateOf("objetos").size, rechazo: cli.constructor.estado.ultimoRechazo, modelos: [...s.features.stateOf("objetos").values()].map((o) => o.modelo) };
    t.close();
    return r;
  };
  const a = await servidor({ subidas: dir, datos });
  try {
    assert.equal((await a.subir(mio)).status, 201);
    const r = await colocar(a.srv, h);
    assert.deepEqual(r, { n: 1, rechazo: "", modelos: [h] });
    assert.match((await colocar(a.srv, "d".repeat(64))).rechazo, /ni se ha subido/);
  } finally { await a.srv.close(); }
  const b = await servidor({ subidas: dir, datos });
  try {
    assert.equal((await fetch(b.url(h))).status, 200, "the file survives the restart");
    assert.equal((await b.subir(mio)).status, 200, "and is not stored again");
    const r = await colocar(b.srv, h);
    assert.equal(r.modelos.filter((m) => m === h).length, 2, "the thing placed before the restart is still there (and a new one)");
  } finally { await b.srv.close(); }
});
