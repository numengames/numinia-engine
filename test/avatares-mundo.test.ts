// E3: a world brings its own avatars in its zip (entorno/avatares.json + files in datos/activos/) and its people pick them there.
// Pure reader (packages/server/src/avatares-mundo.ts), the licence rule (vrm.ts), /status, the zip round trip and the picker's list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { avataresDelMundo, AVATARES_MUNDO_MAX, ESQUEMA_AVATARES_MUNDO, leerAvataresMundo } from "../packages/server/src/avatares-mundo.ts";
import type { Archivo } from "../packages/server/src/avatares-mundo.ts";
import { infoVrm, licenciaDeVrm, revisarAvatar, revisarAvatarDelMundo, TRIANGULOS_MAX_VRM } from "../packages/server/src/vrm.ts";
import type { InfoVrm } from "../packages/server/src/vrm.ts";
import { startServer } from "../packages/server/src/server.ts";
import { exportarMundo, importarMundo } from "../packages/server/src/mundo-zip.ts";
import type { Origen } from "../packages/server/src/mundo-zip.ts";
import { avataresDelMundo as paraLaPagina, escrituraDe, modelosDelMundo } from "../apps/plaza/catalogo-avatares.ts";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const MOTOR = { build: "dev", commit: "0".repeat(40), imagen: "" };
const CREDITO = "Avatar basado en VIPE Hero #2704, de Polygonal Mind (CC BY). Reducido y recoloreado para TRG26";

/** A tiny .vrm: a GLB with only its JSON chunk (the BIN is optional), `triangulos` triangles in one primitive, and the VRM meta given. */
function vrm(o: { triangulos?: number; v?: "0" | "1"; licencia?: string; url?: string; comercial?: boolean; redistribuir?: boolean; titulo?: string } = {}): Uint8Array {
  const v = o.v ?? "0", triangulos = o.triangulos ?? 12;
  const meta = v === "0"
    ? { title: o.titulo ?? "VIPE Hero #2704", author: "Polygonal Mind", licenseName: o.licencia ?? "CC_BY", commercialUssageName: o.comercial === false ? "Disallow" : "Allow", otherLicenseUrl: o.url ?? "" }
    : { name: o.titulo ?? "VIPE Hero #2704", authors: ["Polygonal Mind"], licenseUrl: "https://vrm.dev/licenses/1.0/", commercialUsage: o.comercial === false ? "personalNonProfit" : "corporation", allowRedistribution: o.redistribuir !== false, otherLicenseUrl: o.url ?? "https://creativecommons.org/licenses/by/4.0/" };
  const json = {
    asset: { version: "2.0" }, accessors: [{ count: triangulos * 3 }, { count: 3 }], meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0 }] }],
    extensions: v === "0" ? { VRM: { meta, humanoid: { humanBones: [{ bone: "hips", node: 0 }] } } } : { VRMC_vrm: { meta, humanoid: { humanBones: { hips: { node: 0 } } } } },
  };
  const texto = new TextEncoder().encode(JSON.stringify(json)), pad = (4 - (texto.length % 4)) % 4, cuerpo = new Uint8Array(texto.length + pad).fill(0x20);
  cuerpo.set(texto);
  const out = new Uint8Array(20 + cuerpo.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true); dv.setUint32(12, cuerpo.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(cuerpo, 20);
  return out;
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const info = (b: Uint8Array): InfoVrm => { const r = infoVrm(b); assert.ok(r.ok); return (r as { ok: true; value: InfoVrm }).value; };

/** What the server has: bytes under `<sha>.<ext>`. */
function almacen(...ficheros: { bytes: Uint8Array; ext: string }[]) {
  const m = new Map(ficheros.map((f) => [`${sha(f.bytes)}.${f.ext}`, f.bytes]));
  return (h: string, ext: string): Archivo | null => { const b = m.get(`${h}.${ext}`); return b ? { bytes: b.length, leer: () => b } : null; };
}
const linea = (b: Uint8Array, extra: Record<string, unknown> = {}) => ({ id: "cian", nombre: "TRG cian", sha256: sha(b), licencia: "CC-BY-4.0", credito: CREDITO, ...extra });
const lista = (...avatares: unknown[]) => ({ schema: ESQUEMA_AVATARES_MUNDO, avatares });

test("E3 licence: a file's own licence is read as CC0 or CC BY (VRM 0.x and 1.0), anything else is none", () => {
  assert.equal(licenciaDeVrm(info(vrm({ licencia: "CC_BY" }))), "CC-BY");
  assert.equal(licenciaDeVrm(info(vrm({ licencia: "CC0" }))), "CC0");
  for (const otra of ["CC_BY_NC", "CC_BY_SA", "CC_BY_ND", "Redistribution_Prohibited", "Other", ""]) assert.equal(licenciaDeVrm(info(vrm({ licencia: otra }))), null, otra);
  assert.equal(licenciaDeVrm(info(vrm({ v: "1", url: "https://creativecommons.org/licenses/by/4.0/" }))), "CC-BY");
  assert.equal(licenciaDeVrm(info(vrm({ v: "1", url: "https://creativecommons.org/publicdomain/zero/1.0/" }))), "CC0");
  assert.equal(licenciaDeVrm(info(vrm({ v: "1", url: "https://creativecommons.org/licenses/by-nc/4.0/" }))), null);
  assert.equal(licenciaDeVrm(info(vrm({ v: "1", url: "" }))), null);
});

test("E3 licence: the house library rule stays CC0-only; a world may also carry CC BY, never NC/SA/ND nor a licence the list does not say", () => {
  const cc = info(vrm({ licencia: "CC_BY" })), cero = info(vrm({ licencia: "CC0" }));
  assert.equal(revisarAvatar(cc).length, 1, "the house library still refuses CC BY");
  assert.deepEqual(revisarAvatar(cero), []);
  assert.deepEqual(revisarAvatarDelMundo(cc, "CC-BY"), []);
  assert.deepEqual(revisarAvatarDelMundo(cero, "CC0"), []);
  assert.match(revisarAvatarDelMundo(cc, "CC0")[0].message, /CC-BY/, "a CC BY file cannot be listed as CC0: that would relicense it");
  assert.equal(revisarAvatarDelMundo(info(vrm({ licencia: "CC_BY_NC" })), "CC-BY").length, 1);
  assert.match(revisarAvatarDelMundo(info(vrm({ licencia: "CC_BY", triangulos: TRIANGULOS_MAX_VRM + 1 })), "CC-BY")[0].message, /triángulos/);
  assert.equal(revisarAvatarDelMundo(info(vrm({ comercial: false })), "CC-BY").length, 1);
  assert.match(revisarAvatarDelMundo(info(vrm({ v: "1", redistribuir: false })), "CC-BY")[0].message, /redistribuir/);
  assert.deepEqual(revisarAvatarDelMundo(info(vrm({ v: "1" })), "CC-BY"), []);
});

test("E3 reader: a valid CC BY avatar with its credit is listed (with its thumbnail); the licence inside the file is not touched", () => {
  const b = vrm({ triangulos: 9_997 }), antes = sha(b);
  const r = leerAvataresMundo(lista(linea(b, { miniatura: `${sha(PNG)}.png` })), almacen({ bytes: b, ext: "vrm" }, { bytes: PNG, ext: "png" }));
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.lista, [{ id: "cian", nombre: "TRG cian", sha256: antes, licencia: "CC-BY-4.0", credito: CREDITO, triangulos: 9_997, miniatura: `${sha(PNG)}.png` }]);
  assert.equal(sha(b), antes, "read, never rewritten");
  const i = info(b);
  assert.ok(i.licencia.nombre === "CC_BY" && i.licencia.titulo === "VIPE Hero #2704" && i.licencia.autor === "Polygonal Mind");
});

test("E3 reader: CC0 needs no credit; «CC-BY» and «CC-BY-4.0» both mean CC BY", () => {
  const c0 = vrm({ licencia: "CC0", titulo: "uno" }), by = vrm({ titulo: "dos" });
  const r = leerAvataresMundo(lista({ id: "libre", nombre: "Libre", sha256: sha(c0), licencia: "CC0" }, linea(by, { id: "corto", licencia: "CC-BY" })), almacen({ bytes: c0, ext: "vrm" }, { bytes: by, ext: "vrm" }));
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.lista.map((a) => [a.id, a.licencia, a.credito]), [["libre", "CC0", ""], ["corto", "CC-BY", CREDITO]]);
});

test("E3 reader: CC BY without a credit is refused (blank too), with the reason; the rest of the list is kept", () => {
  const malo = vrm({ titulo: "malo" }), bueno = vrm({ titulo: "bueno" });
  const r = leerAvataresMundo(lista(linea(malo, { id: "sin", credito: undefined }), linea(malo, { id: "blanco", credito: "   " }), linea(bueno, { id: "bueno" })), almacen({ bytes: malo, ext: "vrm" }, { bytes: bueno, ext: "vrm" }));
  assert.deepEqual(r.lista.map((a) => a.id), ["bueno"]);
  assert.equal(r.problemas.length, 2);
  assert.match(r.problemas[0].message, /CC BY exige el crédito/);
  assert.match(r.problemas[0].path, /avatares\[0\]\.credito/);
});

test("E3 reader: more than 10,000 triangles is refused; exactly 10,000 passes", () => {
  const justo = vrm({ triangulos: TRIANGULOS_MAX_VRM, titulo: "justo" }), pasado = vrm({ triangulos: TRIANGULOS_MAX_VRM + 1, titulo: "pasado" });
  const r = leerAvataresMundo(lista(linea(justo, { id: "justo" }), linea(pasado, { id: "pasado" })), almacen({ bytes: justo, ext: "vrm" }, { bytes: pasado, ext: "vrm" }));
  assert.deepEqual(r.lista.map((a) => a.id), ["justo"]);
  assert.match(r.problemas[0].message, /10001 triángulos > 10000/);
});

test("E3 reader: a licence the file does not carry, a mismatch with the list, a file that is not there, not a VRM or not its name are all refused", () => {
  const nc = vrm({ licencia: "CC_BY_NC", titulo: "nc" }), cc0 = vrm({ licencia: "CC0", titulo: "cero" }), by = vrm({ titulo: "by" });
  const noVrm = (() => { const t = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" } }).padEnd(48)), o = new Uint8Array(20 + t.length), dv = new DataView(o.buffer); dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, o.length, true); dv.setUint32(12, t.length, true); dv.setUint32(16, 0x4e4f534a, true); o.set(t, 20); return o; })();
  const en = almacen({ bytes: nc, ext: "vrm" }, { bytes: cc0, ext: "vrm" }, { bytes: by, ext: "vrm" }, { bytes: noVrm, ext: "vrm" });
  const casos: [string, unknown, RegExp][] = [
    ["nc", linea(nc), /un mundo solo lleva avatares CC0 o CC BY/],
    ["cc0 listed as CC BY", linea(cc0), /dice CC-BY pero el fichero dice CC0/],
    ["CC BY listed as CC0", { id: "x", nombre: "X", sha256: sha(by), licencia: "CC0" }, /dice CC0 pero el fichero dice CC-BY/],
    ["not on the server", { ...linea(by), sha256: "e".repeat(64) }, /el servidor no tiene/],
    ["not a vrm", linea(noVrm), /el \.vrm no vale/],
    ["licence the engine does not allow", linea(by, { licencia: "CC-BY-NC" }), /«CC0» o «CC-BY-4.0»/],
  ];
  for (const [que, entrada, re] of casos) {
    const r = leerAvataresMundo(lista(entrada), en);
    assert.equal(r.lista.length, 0, que);
    assert.match(r.problemas.map((p) => p.message).join("|"), re, que);
  }
  // the bytes are not the ones the name says (a server that was handed the wrong file): refused
  const falso: Archivo = { bytes: by.length, leer: () => by };
  const r = leerAvataresMundo(lista({ ...linea(by), sha256: "a".repeat(64) }), () => falso);
  assert.match(r.problemas[0].message, /no es el de su nombre/);
});

test("E3 reader: a bad thumbnail costs the picture, never the avatar; a bad id, name, repeat or the 9th avatar costs that line only", () => {
  const b = vrm({ titulo: "foto" });
  const mal = leerAvataresMundo(lista(linea(b, { miniatura: "../etc/passwd" })), almacen({ bytes: b, ext: "vrm" }));
  assert.equal(mal.lista.length, 1); assert.equal(mal.lista[0].miniatura, undefined);
  assert.match(mal.problemas[0].message, /se ofrece sin miniatura/);
  const ausente = leerAvataresMundo(lista(linea(b, { miniatura: `${"b".repeat(64)}.png` })), almacen({ bytes: b, ext: "vrm" }));
  assert.equal(ausente.lista.length, 1); assert.match(ausente.problemas[0].message, /el servidor no tiene/);

  const muchos = Array.from({ length: AVATARES_MUNDO_MAX + 2 }, (_, i) => vrm({ titulo: `a${i}` }));
  const r = leerAvataresMundo(lista(...muchos.map((m, i) => linea(m, { id: `a${i}` }))), almacen(...muchos.map((bytes) => ({ bytes, ext: "vrm" }))));
  assert.equal(r.lista.length, AVATARES_MUNDO_MAX, "at most 8");
  assert.equal(r.problemas.length, 2); assert.match(r.problemas[0].message, /como mucho 8 avatares/);

  const dos = leerAvataresMundo(lista(linea(b, { id: "uno" }), linea(b, { id: "uno" }), linea(b, { id: "dos" }), linea(b, { id: "Mal Id" }), linea(b, { id: "tres", nombre: " " })), almacen({ bytes: b, ext: "vrm" }));
  assert.deepEqual(dos.lista.map((a) => a.id), ["uno"], "the same file under another id is the same avatar listed twice: refused");
  assert.equal(dos.problemas.length, 4);
});

test("E3 reader: no file, a wrong shape or the wrong schema never throws", () => {
  assert.deepEqual(leerAvataresMundo(undefined, () => null), { lista: [], problemas: [] });
  for (const crudo of [null, 3, "x", [], {}, { schema: ESQUEMA_AVATARES_MUNDO }, { schema: ESQUEMA_AVATARES_MUNDO, avatares: {} }]) {
    const r = leerAvataresMundo(crudo, () => null);
    assert.deepEqual(r.lista, []);
    assert.ok(r.problemas.length >= 1, JSON.stringify(crudo));
  }
  const b = vrm({ titulo: "esquema" });
  const r = leerAvataresMundo({ schema: "otra/cosa@9", avatares: [linea(b)] }, almacen({ bytes: b, ext: "vrm" }));
  assert.match(r.problemas[0].message, /debe ser «numinia-engine\/avatares-mundo@1»/);
  assert.equal(r.lista.length, 1, "a wrong schema id is said; the avatars that are right are still offered");
});

test("E3 server: /status lists the world's avatars and serves the files at /a/; a world without the file answers as before", async () => {
  const b = vrm({ triangulos: 9_997 }), mundo = tmp("avatares-mundo-");
  mkdirSync(join(mundo, "activos"), { recursive: true }); mkdirSync(join(mundo, "entorno"), { recursive: true });
  writeFileSync(join(mundo, "activos", `${sha(b)}.vrm`), b); writeFileSync(join(mundo, "activos", `${sha(PNG)}.png`), PNG);
  const log: string[] = [];
  const arrancar = (entorno: string | null) => startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: MOTOR, subidas: join(mundo, "activos"), entorno });
  // 1) no entorno/avatares.json → no `avatares` key at all
  writeFileSync(join(mundo, "entorno", "entorno.json"), "{}");
  const a = await arrancar(join(mundo, "entorno"));
  try { assert.equal("avatares" in (await (await fetch(`http://127.0.0.1:${a.port}/status`)).json()), false); } finally { await a.close(); }
  const sinEntorno = await arrancar(null);
  try { assert.equal("avatares" in (await (await fetch(`http://127.0.0.1:${sinEntorno.port}/status`)).json()), false); } finally { await sinEntorno.close(); }
  // 2) with it
  writeFileSync(join(mundo, "entorno", "avatares.json"), JSON.stringify(lista(linea(b, { miniatura: `${sha(PNG)}.png` }), linea(b, { id: "repetido" }))));
  const s = await arrancar(join(mundo, "entorno"));
  try {
    const st = await (await fetch(`http://127.0.0.1:${s.port}/status`)).json();
    assert.deepEqual(st.avatares, [{ id: "cian", nombre: "TRG cian", sha256: sha(b), licencia: "CC-BY-4.0", credito: CREDITO, triangulos: 9_997, miniatura: `${sha(PNG)}.png` }]);
    const f = await fetch(`http://127.0.0.1:${s.port}/a/${sha(b)}.vrm`);
    assert.equal(f.status, 200); assert.equal(sha(new Uint8Array(await f.arrayBuffer())), sha(b), "served byte for byte, its own licence inside");
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/a/${sha(PNG)}.png`)).status, 200);
    assert.ok(log.some((l) => l.startsWith("[avatares] el mundo ofrece 1 avatar propio: TRG cian (CC-BY-4.0)")));
    assert.ok(log.some((l) => /\[avatares\] avatares\.json: avatares\[1\]\.sha256: ese fichero ya está/.test(l)), "a refused line is said in the log with its reason");
  } finally { await s.close(); }
  // 3) another world (other folder) never sees them, nor can ask for their files
  const otro = tmp("otro-mundo-"); mkdirSync(join(otro, "activos"), { recursive: true });
  const o = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, motor: MOTOR, subidas: join(otro, "activos"), entorno: null });
  try {
    assert.equal("avatares" in (await (await fetch(`http://127.0.0.1:${o.port}/status`)).json()), false);
    assert.equal((await fetch(`http://127.0.0.1:${o.port}/a/${sha(b)}.vrm`)).status, 404);
  } finally { await o.close(); }
});

test("E3 zip: the avatars travel in the world's zip (entorno/avatares.json + datos/activos/<sha>.vrm|png) and read the same on the other side", async () => {
  const b = vrm({ triangulos: 9_997, titulo: "zip" }), raiz = tmp("zip-avatares-"), datos = join(raiz, "datos"), entorno = join(raiz, "entorno");
  mkdirSync(join(datos, "activos"), { recursive: true }); mkdirSync(entorno, { recursive: true });
  writeFileSync(join(datos, "activos", `${sha(b)}.vrm`), b); writeFileSync(join(datos, "activos", `${sha(PNG)}.png`), PNG);
  writeFileSync(join(entorno, "avatares.json"), JSON.stringify(lista(linea(b, { miniatura: `${sha(PNG)}.png` }))));
  const o: Origen = { datos, subidas: join(datos, "activos"), aventura: null, entorno };
  const z = join(tmp("zip-fuera-"), "mundo.zip"), w = createWriteStream(z);
  await exportarMundo(w, o, MOTOR);
  await new Promise<void>((ok) => w.end(ok));
  const nuevo = join(tmp("zip-dentro-"), "nuevo");
  await importarMundo(z, nuevo);
  assert.ok(existsSync(join(nuevo, "entorno", "avatares.json")));
  assert.ok(readFileSync(join(nuevo, "datos", "activos", `${sha(b)}.vrm`)).equals(b), "the .vrm arrives byte for byte: its licence metadata is the one it had");
  assert.ok(existsSync(join(nuevo, "datos", "activos", `${sha(PNG)}.png`)));
  const leer = (f: string) => JSON.parse(readFileSync(join(nuevo, "entorno", f), "utf8"));
  const r = avataresDelMundo(leer, (h, ext) => { const p = join(nuevo, "datos", "activos", `${h}.${ext}`); return existsSync(p) ? p : null; });
  assert.deepEqual(r.map((a) => a.id), ["cian"]);
});

test("E3 page: what /status tells becomes the picker's list — with the credit; a CC BY line without one is skipped; nothing = []", () => {
  const h = "c".repeat(64), m = `${"d".repeat(64)}.png`;
  const l = paraLaPagina("http://x:1", [{ id: "cian", nombre: "TRG cian", sha256: h, licencia: "CC-BY-4.0", credito: CREDITO, miniatura: m }, { id: "libre", nombre: "Libre", sha256: "e".repeat(64), licencia: "CC0" }]);
  assert.deepEqual(l.map((a) => [a.id, a.url, a.miniatura, a.creditoUrl, a.credito]), [
    ["cian", `http://x:1/a/${h}.vrm`, `http://x:1/a/${m}`, "https://creativecommons.org/licenses/by/4.0/", CREDITO],
    ["libre", `http://x:1/a/${"e".repeat(64)}.vrm`, null, "https://creativecommons.org/publicdomain/zero/1.0/", ""],
  ]);
  assert.deepEqual(paraLaPagina("http://x:1", [{ id: "a", nombre: "A", sha256: h, licencia: "CC-BY-4.0", credito: "" }, { id: "b", nombre: "B", sha256: "no-es-sha", licencia: "CC0" }, null, 4]), [], "the page trusts nothing it is told");
  for (const nada of [undefined, null, {}, "x", []]) assert.deepEqual(paraLaPagina("http://x:1", nada), []);
  assert.equal(paraLaPagina("http://x:1", Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, nombre: "A", sha256: h, licencia: "CC0" }))).length, 8);
  assert.equal(escrituraDe("CC-BY"), "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(escrituraDe("MIT"), null);
});

test("E3 house catalogue: unchanged — still the three CC0 avatars; the world's default avatar (ficha) still picks among the house ones", () => {
  const cat = JSON.parse(readFileSync("activos/avatares/catalogo.json", "utf8"));
  assert.deepEqual(cat.modelos.map((m: { id: string }) => m.id), ["astrodisco", "skelly", "polybot"]);
  for (const m of cat.modelos) assert.equal(info(new Uint8Array(readFileSync(m.fichero))).licencia.nombre, "CC0", m.id);
  assert.deepEqual(modelosDelMundo(cat.modelos, cat.modelos[1].id).map((m: { id: string }) => m.id), [cat.modelos[1].id]);
  assert.equal(modelosDelMundo(cat.modelos).length, 3, "no world avatar is ever mixed into the house list");
});
