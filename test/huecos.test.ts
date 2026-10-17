// U12: holes (huecos) — «pinchas el hueco, eliges tu imagen y se encaja sola» (Pablo, 16-10). A picture becomes a hole
// with its frame's size; an uploaded image goes in and the server measures it (its header, never the page's word) and
// fits it whole, centred, never distorted; emptying brings the card back. Headless: the page's picker is
// tools/e2e-piernas/huecos.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ClientPart, PlacedObject } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { medidasImagen, comprobarFichero } from "../packages/net/src/ficheros.ts";
import { Activos, sha256 } from "../packages/server/src/activos.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";
import { encajar, HUECO_PX_MAX } from "../features/objetos/feature.ts";

// ---- tiny picture headers, as cameras and editors write them ----
const u32be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const le16 = (v: number) => [v & 255, (v >>> 8) & 255], le24 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const png = (w: number, h: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...u32be(w), ...u32be(h), 8, 6, 0, 0, 0, 1, 2, 3, 4]);
const sof = (w: number, h: number) => [0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
const jfif = [0xff, 0xe0, 0, 16, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
const exif = (orientacion: number) => [0xff, 0xe1, 0, 34, ...ascii("Exif"), 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientacion, 0, 0, 0, 0, 0, 0, 0];
const jpg = (w: number, h: number, orientacion = 0) => new Uint8Array([0xff, 0xd8, ...jfif, ...(orientacion ? exif(orientacion) : []), ...sof(w, h), 0xff, 0xd9]);
const riff = (chunk: string, data: number[]) => new Uint8Array([...ascii("RIFF"), ...le24(4 + 8 + data.length), 0, ...ascii("WEBP"), ...ascii(chunk), ...le24(data.length), 0, ...data]);
const webpX = (w: number, h: number) => riff("VP8X", [0x10, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
const webpL = (w: number, h: number) => { const v = ((w - 1) | ((h - 1) << 14)) >>> 0; return riff("VP8L", [0x2f, v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255, 0]); };
const webp = (w: number, h: number) => riff("VP8 ", [0x30, 0x01, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h), 0, 0]);

test("U12: a picture's pixels from its first bytes (png, jpg, webp) — and a turned phone photo stands up", () => {
  assert.deepEqual(medidasImagen("png", png(768, 512)), { ancho: 768, alto: 512 });
  assert.deepEqual(medidasImagen("jpg", jpg(4000, 3000)), { ancho: 4000, alto: 3000 });
  assert.deepEqual(medidasImagen("jpg", jpg(4000, 3000, 6)), { ancho: 3000, alto: 4000 }, "EXIF orientation 6: a quarter turn");
  assert.deepEqual(medidasImagen("jpg", jpg(4000, 3000, 3)), { ancho: 4000, alto: 3000 }, "orientation 3: upside down, same size");
  assert.deepEqual(medidasImagen("webp", webpX(1920, 1080)), { ancho: 1920, alto: 1080 });
  assert.deepEqual(medidasImagen("webp", webpL(640, 480)), { ancho: 640, alto: 480 });
  assert.deepEqual(medidasImagen("webp", webp(300, 200)), { ancho: 300, alto: 200 });
  for (const b of [png(10, 10), jpg(10, 10), webpX(10, 10)]) assert.ok(comprobarFichero(b[0] === 0x89 ? "png" : b[0] === 0xff ? "jpg" : "webp", b).ok, "the headers are real files of their kind");
  // cut short, the wrong kind, or no frame header: it cannot be told
  assert.equal(medidasImagen("png", png(768, 512).subarray(0, 20)), null);
  assert.equal(medidasImagen("jpg", png(768, 512)), null);
  assert.equal(medidasImagen("jpg", new Uint8Array([0xff, 0xd8, ...jfif, 0xff, 0xda, 0, 2])), null);
  assert.equal(medidasImagen("glb", png(1, 1)), null);
  assert.equal(medidasImagen("png", png(0, 5)), null, "a side of 0 px is no picture");
});

test("U12: encajar puts the whole picture inside the frame, centred, never distorted, never past it", () => {
  assert.equal(encajar(2.4, 1.6, 768, 512), 1.6);    // the frame's own proportion: it fills it
  assert.equal(encajar(2.4, 1.6, 3000, 1000), 0.8);  // a panorama: as wide as the frame (2.4 × 0.8 m)
  assert.equal(encajar(2.4, 1.6, 1000, 2000), 1.6);  // a portrait: as tall as the frame (0.8 × 1.6 m)
  for (const [w, h] of [[1234, 567], [567, 1234], [1, 4096], [4096, 100], [1001, 1000]]) {
    const s = encajar(2.4, 1.6, w, h);
    assert.ok(s <= 1.6 + 1e-9 && (s * w) / h <= 2.4 + 1e-9, `${w}×${h} fits (${s})`);
  }
  assert.ok(encajar(2.4, 1.6, 4096, 1) < 0.05, "a 4096:1 strip would be under the smallest scale: the server refuses it");
});

const SHA = { cartel: "c".repeat(64), ancha: "a".repeat(64), alta: "b".repeat(64), enorme: "e".repeat(64), rara: "f".repeat(64), modelo: "d".repeat(64), tira: "1".repeat(64) };
const PX: Record<string, { ancho: number; alto: number }> = {
  [`${SHA.cartel}.png`]: { ancho: 768, alto: 512 }, [`${SHA.ancha}.jpg`]: { ancho: 3000, alto: 1000 },
  [`${SHA.alta}.webp`]: { ancho: 1000, alto: 2000 }, [`${SHA.enorme}.png`]: { ancho: 8000, alto: 6000 }, [`${SHA.tira}.png`]: { ancho: 4096, alto: 1 },
};
const SUBIDOS = new Set([...Object.keys(PX), `${SHA.rara}.png`, `${SHA.modelo}.glb`]);

function world(puede = true) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos()], log: () => {},
    puede: (_w, a) => puede && a === "construir", activo: (h, e) => SUBIDOS.has(`${h}.${e}`), medidas: (h, e) => PX[`${h}.${e}`] ?? null });
  const t = inst.join(0), cli = crearCliente(), drawn = new Map<string, PlacedObject>();
  const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place: (k, o) => { if (o) drawn.set(k, o); else drawn.delete(k); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  const b = cli.constructor;
  const ultimo = () => b.estado.ultimoRechazo;
  /** A thing as every page has it, its numbers rounded to the wire's step (fixed point: 1.9 arrives as 1.900000000000006). */
  const obj = (id: string) => Object.fromEntries(Object.entries(b.objeto(id)!).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 100) / 100 : v]));
  return { s, b, drawn, pump, ultimo, obj };
}
/** A card (768 × 512) hung at (3, 1.9, -2): what a template puts in a frame before any work. */
function conCartel(w: ReturnType<typeof world>) {
  assert.ok(w.b.colocarFichero(SHA.cartel, "png", "Hueco 01: libre", { x: 3, y: 1.9, z: -2 }).ok); w.pump();
  const id = w.b.lista()[0].id;
  assert.ok(w.b.transformar(id, { ry: 90, sx: 1.6, sy: 1.6, sz: 1.6 }).ok); w.pump();
  return id;
}

test("U12: a picture becomes a hole; a wide and a tall work are fitted whole in the frame; the hole never moves", () => {
  const w = world(), id = conCartel(w);
  assert.ok(w.b.hueco(id, 2.4, 1.6).ok); w.pump();
  assert.deepEqual(w.b.huecos().map((h) => [h.id, h.ancho, h.alto, h.lleno]), [[id, 2.4, 1.6, false]]);
  w.b.rellenar(id, SHA.ancha, "jpg", "Atardecer en Ibiza"); w.pump();
  let o = w.obj(id);
  assert.deepEqual([o.modelo, o.ext, o.sx, o.sy, o.sz, o.huecoLleno, o.nombre], [SHA.ancha, "jpg", 0.8, 0.8, 0.8, true, "Atardecer en Ibiza"]);
  assert.deepEqual([o.x, o.y, o.z, o.ry, o.tipo], [3, 1.9, -2, 90, "imagen"], "same place, same turn: only the picture changed");
  assert.equal(w.drawn.get(id)!.model, SHA.ancha, "every page draws the new picture");
  w.b.rellenar(id, SHA.alta, "webp", ""); w.pump();
  o = w.obj(id);
  assert.deepEqual([o.modelo, o.sx, o.nombre], [SHA.alta, 1.6, "Atardecer en Ibiza"], "a portrait as tall as the frame; no title given keeps the name");
});

test("U12: what is not a hole, not uploaded, not a picture or too big is refused with a reason", () => {
  const w = world(), id = conCartel(w);
  w.b.rellenar(id, SHA.ancha, "jpg"); w.pump();
  assert.match(w.ultimo(), /no es un hueco/);
  w.b.hueco(id, 2.4, 1.6); w.pump();
  w.b.rellenar(id, "9".repeat(64), "png"); w.pump();
  assert.match(w.ultimo(), /no se ha subido/);
  w.b.rellenar(id, SHA.modelo, "glb"); w.pump();
  assert.match(w.ultimo(), /En un hueco va una imagen \.png, \.jpg, \.webp; \.glb no vale/);
  w.b.rellenar(id, SHA.enorme, "png"); w.pump();
  assert.match(w.ultimo(), new RegExp(`8000 × 6000 px; en un hueco caben hasta ${HUECO_PX_MAX} px`));
  w.b.rellenar(id, SHA.rara, "png"); w.pump();
  assert.match(w.ultimo(), /No sé leer cuántos píxeles/);
  w.b.rellenar(id, SHA.tira, "png"); w.pump();
  assert.match(w.ultimo(), /demasiado alargada para este marco/);
  assert.equal(w.obj(id).modelo, SHA.cartel, "after every refusal the card is still there");
  w.b.hueco(id, 0.05, 1); w.pump();
  assert.match(w.ultimo(), /al menos 0,1 m/);
  // only a picture can be a hole
  assert.ok(w.b.colocarFichero(SHA.modelo, "glb", "Un modelo", { x: 0, y: 0, z: 0 }).ok); w.pump();
  const modelo = w.b.lista().find((x) => x.tipo === "modelo")!.id;
  w.b.hueco(modelo, 1, 1); w.pump();
  assert.match(w.ultimo(), /Un hueco es una imagen/);
});

test("U12: whoever may not build cannot fill a hole", () => {
  const w = world(false);
  w.s.features.send("objetos", "rellenar", { id: "o1", modelo: SHA.ancha, ext: "jpg", nombre: "" }); w.pump();
  assert.match(w.ultimo(), /No puedes construir aquí/);
});

test("U12: a pinned hole takes a work and gives it back (undo, empty); copying a hole copies its card", () => {
  const w = world(), id = conCartel(w);
  w.b.hueco(id, 2.4, 1.6); w.pump();
  w.b.seleccionar(id); w.b.fijar(); w.pump();
  assert.equal(w.obj(id).fijado, true);
  w.b.rellenar(id, SHA.ancha, "jpg", "Atardecer"); w.pump();
  assert.equal(w.obj(id).modelo, SHA.ancha, "pinned, and still filled: the hole stays where it is");
  w.b.deshacer(); w.pump();
  assert.deepEqual([w.obj(id).modelo, w.obj(id).sx, w.obj(id).huecoLleno], [SHA.cartel, 1.6, false], "undo brings the card back, pinned or not");
  w.b.rehacer(); w.pump();
  assert.equal(w.obj(id).modelo, SHA.ancha);
  w.b.vaciar(id); w.pump();
  let o = w.obj(id);
  assert.deepEqual([o.modelo, o.ext, o.sx, o.nombre, o.huecoLleno, o.fijado], [SHA.cartel, "png", 1.6, "Hueco 01: libre", false, true], "emptied: card, its scale and its name");
  w.b.vaciar(id); w.pump();
  assert.match(w.ultimo(), /ya está vacío/);
  // a copy is a hole of its own, with the same card to go back to
  w.b.seleccionar(id); w.b.fijar(); w.pump(); // let go, so the copy is not pinned either
  w.b.duplicar(); w.pump();
  const copia = w.b.huecos().find((h) => h.id !== id)!.id;
  w.b.rellenar(copia, SHA.alta, "webp", "Retrato"); w.pump();
  w.b.vaciar(copia); w.pump();
  o = w.obj(copia);
  assert.deepEqual([o.modelo, o.nombre, o.huecoLleno], [SHA.cartel, "Hueco 01: libre", false]);
  // 0 × 0: no longer a hole; it keeps the picture it shows
  w.b.hueco(copia, 0, 0); w.pump();
  assert.equal(w.b.huecos().length, 1);
  assert.equal(w.obj(copia).modelo, SHA.cartel);
});

test("U12: a pinned picture cannot be turned into a hole (fijado protects the content too, not just the spot)", () => {
  const w = world(), id = conCartel(w);
  w.b.seleccionar(id); w.b.fijar(); w.pump();
  assert.equal(w.obj(id).fijado, true);
  w.b.hueco(id, 2.4, 1.6); w.pump();
  assert.match(w.ultimo(), /Está fijado/);
  assert.equal(w.b.huecos().length, 0, "an official sign stays a plain picture, not an editable hole");
  // unpin it first, same as mover/girar/borrar: then the owner may make it a hole
  w.b.fijar(); w.pump();
  assert.ok(w.b.hueco(id, 2.4, 1.6).ok); w.pump();
  assert.equal(w.b.huecos().length, 1);
});

test("U12: the server measures a picture it has once (library or uploads); nothing else", () => {
  const dir = mkdtempSync(join(tmpdir(), "huecos-")), b = jpg(1600, 1200, 6), h = sha256(b);
  writeFileSync(join(dir, `${h}.jpg`), b);
  const a = new Activos(null, dir);
  assert.deepEqual(a.medidas(h, "jpg"), { ancho: 1200, alto: 1600 });
  assert.equal(a.medidas(h, "png"), null, "same hash, another kind: not here");
  assert.equal(a.medidas("0".repeat(64), "jpg"), null);
  writeFileSync(join(dir, `${h}.jpg`), png(5, 5)); // a file never changes under its name: the first answer stays
  assert.deepEqual(a.medidas(h, "jpg"), { ancho: 1200, alto: 1600 });
});

test("U12: limits.json publishes the hole's pixel cap the server enforces", () => {
  const lim = JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")).limits as { key: string; value: unknown; state: string; test?: string }[];
  const e = lim.find((x) => x.key === "hole_image_px_max");
  assert.ok(e, "limits.json: falta hole_image_px_max");
  assert.equal(e.value, HUECO_PX_MAX);
  assert.equal(e.state, "measured");
  assert.equal(e.test, "test/huecos.test.ts");
});
