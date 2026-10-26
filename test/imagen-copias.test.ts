// t_dee4d0eb · the server keeps a smaller copy of every picture per device tier (2048 / 1024 / 512 px on the longest side), and
// `/a/<sha256>.<ext>?px=N` sends it: a Quest downloads the 1024 px picture instead of the original. Here: the tier list agrees with the
// page's and limits.json; the shrinking (size, average, alpha); the copies of a JPEG / PNG (and the pictures that get none); the queue
// that makes them and what the route answers (the copy, the original, the cache time of each).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import encodeJpeg, { init as initJpegEnc } from "@jsquash/jpeg/encode.js";
import encodePng, { init as initPngEnc } from "@jsquash/png/encode.js";
import decodeWebp, { init as initWebpDec } from "@jsquash/webp/decode.js";
import { IMAGEN_PX_COPIAS, medidasImagen } from "../packages/net/src/ficheros.ts";
import { IMAGEN_PX } from "../packages/render/src/calidad.ts";
import { copiasPorNivel, jpgQueSeQueda, optimizarImagen, reducirRgba, webpQueSeQueda } from "../packages/server/src/optimizar.ts";
import { ColaOptimizar, yaProbados } from "../packages/server/src/optimizar-cola.ts";
import { startServer } from "../packages/server/src/server.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const wasm = (m: string) => readFileSync(new URL(import.meta.resolve(m)));

/** A painting-like frame: a gradient, a few discs and a little grain (what a photo of a canvas compresses like). */
function cuadro(w: number, h: number, alfa = 255): { data: Uint8ClampedArray; width: number; height: number } {
  const d = new Uint8ClampedArray(w * h * 4);
  let s = 7;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, dx = x - w * 0.6, dy = y - h * 0.4, disco = dx * dx + dy * dy < (h / 4) ** 2;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const r = ((s >> 16) & 7) - 3;
    d[i] = (disco ? 220 : (x / w) * 200) + r; d[i + 1] = (disco ? 90 : (y / h) * 180) + r; d[i + 2] = (disco ? 40 : 120) + r; d[i + 3] = alfa;
  }
  return { data: d, width: w, height: h };
}
async function jpg(w: number, h: number): Promise<Uint8Array> {
  await initJpegEnc(new WebAssembly.Module(wasm("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm")));
  return new Uint8Array(await encodeJpeg(cuadro(w, h) as never, { quality: 92 }));
}
async function png(w: number, h: number): Promise<Uint8Array> {
  await initPngEnc(wasm("@jsquash/png/codec/pkg/squoosh_png_bg.wasm") as never);
  return new Uint8Array(await encodePng(cuadro(w, h) as never));
}
async function leerWebp(b: Uint8Array) {
  await initWebpDec(new WebAssembly.Module(wasm("@jsquash/webp/codec/dec/webp_dec.wasm")));
  return decodeWebp(b.slice().buffer);
}

test("the tiers the server keeps are the page's IMAGEN_PX and limits.json image_px_max", () => {
  const lim = JSON.parse(readFileSync("limits.json", "utf8")).limits as { axis: string; key: string; value: number }[];
  const tope = new Set(lim.filter((x) => x.axis === "device" && x.key === "image_px_max").map((x) => x.value));
  for (const px of Object.values(IMAGEN_PX)) assert.ok(IMAGEN_PX_COPIAS.includes(px), `${px} px has no copy on the server`);
  assert.deepEqual([...tope].sort((a, b) => b - a), [...IMAGEN_PX_COPIAS], "limits.json and the server's tiers differ");
});

test("reducirRgba: longest side at the tier, same proportion, the average of what it covers, never enlarges", () => {
  const w = 8, h = 4, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(x < 4 ? [200, 0, 0, 255] : [0, 100, 0, 255], (y * w + x) * 4);
  const r = reducirRgba({ data: d, width: w, height: h }, 4)!;
  assert.deepEqual([r.width, r.height], [4, 2]);
  assert.deepEqual([...r.data.slice(0, 4)], [200, 0, 0, 255]);
  assert.deepEqual([...r.data.slice(3 * 4, 3 * 4 + 4)], [0, 100, 0, 255]);
  // 3 → 2: a fractional cut (each new pixel covers 1.5 old ones) averages 1.5 of them
  const e = new Uint8ClampedArray([0, 0, 0, 255, 90, 90, 90, 255, 180, 180, 180, 255]);
  const q = reducirRgba({ data: e, width: 3, height: 1 }, 2)!;
  assert.deepEqual([q.width, q.height], [2, 1]);
  assert.deepEqual([...q.data], [30, 30, 30, 255, 150, 150, 150, 255]); // (0·1 + 90·.5)/1.5 and (90·.5 + 180·1)/1.5
  assert.equal(reducirRgba({ data: d, width: w, height: h }, 8), null, "it fits: no copy");
  assert.equal(reducirRgba({ data: d, width: w, height: h }, 100), null, "never enlarges");
  // a transparent pixel next to an opaque one does not tint it (alpha-weighted)
  const t = new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255]);
  assert.deepEqual([...reducirRgba({ data: t, width: 2, height: 1 }, 1)!.data], [0, 0, 255, 128]);
});

test("a JPEG of 2600×1800 gets a copy for 2048, 1024 and 512; each is a WebP at the tier's size, far lighter", async () => {
  const original = await jpg(2600, 1800);
  const { copias, motivo } = await copiasPorNivel(original, "jpg");
  assert.deepEqual(copias.map((c) => c.px), [2048, 1024, 512], motivo);
  for (const c of copias) {
    assert.ok(Math.max(c.ancho, c.alto) <= c.px && Math.max(c.ancho, c.alto) >= c.px - 1, `${c.px}: ${c.ancho}×${c.alto}`);
    assert.ok(Math.abs(c.ancho / c.alto - 2600 / 1800) < 0.01, "same proportion");
    const w = await leerWebp(c.bytes);
    assert.deepEqual([w.width, w.height], [c.ancho, c.alto]);
  }
  const b1024 = copias.find((c) => c.px === 1024)!;
  assert.ok(b1024.bytes.length < original.length / 3, `1024 px copy ${b1024.bytes.length} B vs original ${original.length} B`);
  // the colours are the picture's (the average of a disc area is still the disc's colour)
  const w = await leerWebp(b1024.bytes), i = (Math.round(b1024.alto * 0.4) * w.width + Math.round(b1024.ancho * 0.6)) * 4;
  assert.ok(Math.abs(w.data[i] - 220) < 12 && Math.abs(w.data[i + 1] - 90) < 12, `disc colour ${[...w.data.slice(i, i + 3)]}`);
});

test("a PNG of 1500×1000 gets the 1024 and 512 copies only; a picture that fits every tier, or keeps a colour profile, gets none", async () => {
  const p = await png(1500, 1000);
  assert.deepEqual((await copiasPorNivel(p, "png")).copias.map((c) => c.px), [1024, 512]);
  const pequena = await jpg(400, 300);
  const c = await copiasPorNivel(pequena, "jpg");
  assert.deepEqual(c.copias, []); assert.match(c.motivo!, /cabe en todos/);
  // an APP2 ICC_PROFILE segment right after SOI: the copy would not show it the way the browser does
  const grande = await jpg(2200, 100), icc = new TextEncoder().encode("ICC_PROFILE\0\x01\x01xxxxxxxx");
  const conIcc = new Uint8Array(2 + 4 + icc.length + grande.length - 2);
  conIcc.set(grande.subarray(0, 2)); conIcc.set([0xff, 0xe2, 0, icc.length + 2], 2); conIcc.set(icc, 6); conIcc.set(grande.subarray(2), 6 + icc.length);
  assert.match(jpgQueSeQueda(conIcc)!, /ICC/); assert.equal(jpgQueSeQueda(grande), null);
  assert.match((await copiasPorNivel(conIcc, "jpg")).motivo!, /ICC/);
  // a PNG with a gamma chunk (pngQueSeQueda), an animated / profiled WebP
  const g = new Uint8Array(p.length + 16); g.set(p.subarray(0, 33)); g.set([0, 0, 0, 4, 0x67, 0x41, 0x4d, 0x41, 0, 0, 0xb1, 0x8f, 0, 0, 0, 0], 33); g.set(p.subarray(33), 49);
  assert.match((await copiasPorNivel(g, "png")).motivo!, /gAMA/);
  const riff = (trozo: string) => { const b = new Uint8Array(12 + 8 + 4); b.set(new TextEncoder().encode("RIFF"), 0); b.set(new TextEncoder().encode("WEBP"), 8); b.set(new TextEncoder().encode(trozo), 12); b[16] = 4; return b; };
  assert.match(webpQueSeQueda(riff("ANIM"))!, /animado/); assert.match(webpQueSeQueda(riff("ICCP"))!, /ICCP/);
  assert.match((await copiasPorNivel(new Uint8Array(50), "jpg")).motivo!, /sé cuánto/);
});

test("optimizarImagen: a PNG keeps its lossless WebP and also gets its tier copies; an unknown kind gets neither", async () => {
  const r = await optimizarImagen(await png(1200, 900), "png");
  assert.ok(r.bytes && r.ext === "webp", r.motivo);
  assert.deepEqual(r.copias!.map((c) => c.px), [1024, 512]);
  const j = await optimizarImagen(await jpg(1200, 900), "jpg");
  assert.equal(j.bytes, null); assert.deepEqual(j.copias!.map((c) => c.px), [1024, 512]);
  assert.equal((await optimizarImagen(new Uint8Array(40), "ktx2")).copias, undefined);
});

test("the queue makes the copies; the report remembers them; a report line from before the copies is revisited", async () => {
  const dir = tmp("px-cola-"), j = await jpg(2300, 1500), h = sha(j);
  writeFileSync(join(dir, `${h}.jpg`), j);
  const optimizados = join(dir, "optimizados"); mkdirSync(optimizados);
  // N22 left this PNG tried, before there were tier copies: no `pxs` in its line
  const viejo = sha(new Uint8Array([1, 2, 3]));
  writeFileSync(join(optimizados, "informe.jsonl"), JSON.stringify({ cuando: "2026-10-20T00:00:00Z", sha256: viejo, tipo: "png", antes: 10, despues: 10, ms: 1, motivo: "solo ahorra 0 %" }) + "\n");
  assert.equal(yaProbados(optimizados).has(`${viejo}.png`), false, "a line without pxs does not count");
  const { Activos } = await import("../packages/server/src/activos.ts");
  const a = new Activos(null, dir), c = new ColaOptimizar(a, () => {}, true);
  assert.equal(c.repasar(), 1);
  await c.esperar();
  for (const px of [2048, 1024, 512]) assert.ok(existsSync(join(optimizados, `${h}.jpg.p${px}.webp`)), `p${px}`);
  const linea = JSON.parse(readFileSync(join(optimizados, "informe.jsonl"), "utf8").trim().split("\n").pop()!);
  assert.deepEqual(linea.pxs.map((x: { px: number }) => x.px), [2048, 1024, 512]);
  assert.ok(yaProbados(optimizados).has(`${h}.jpg`));
  assert.equal(new ColaOptimizar(a, () => {}, true).repasar(), 0, "tried: not again");
  await c.parar();
});

test("/a/<sha>.jpg?px=N: the copy to a browser that takes WebP, the original to anyone else or when there is none; the cache time says which", async () => {
  const dir = tmp("px-ruta-"), grande = await jpg(2300, 1500), chica = await jpg(600, 400), hg = sha(grande), hc = sha(chica);
  writeFileSync(join(dir, `${hg}.jpg`), grande); writeFileSync(join(dir, `${hc}.jpg`), chica);
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, subidas: dir, features: [], log: () => {}, optimizar: true });
  const get = (h: string, qs: string, accept = "image/avif,image/webp,*/*") => fetch(`http://127.0.0.1:${srv.port}/a/${h}.jpg${qs}`, { headers: { accept } });
  try {
    await srv.optimizar.esperar();
    const c = await get(hg, "?px=1024"), cuerpo = new Uint8Array(await c.arrayBuffer());
    assert.equal(c.status, 200); assert.equal(c.headers.get("content-type"), "image/webp"); assert.equal(c.headers.get("x-optimizado"), "px1024");
    assert.match(c.headers.get("cache-control")!, /immutable/); assert.equal(c.headers.get("vary"), "accept");
    assert.ok(cuerpo.length < grande.length / 3, `${cuerpo.length} B vs ${grande.length} B`);
    assert.equal(medidasImagen("webp", cuerpo)?.ancho, 1024);
    assert.equal(medidasImagen("webp", new Uint8Array(await (await get(hg, "?px=512")).arrayBuffer()))?.ancho, 512);
    // a browser that does not take WebP, no ?px, or a size nobody asks for: the original
    for (const [qs, accept] of [["?px=1024", "image/jpeg,*/*"], ["", "image/webp"], ["?px=777", "image/webp"], ["?px=abc", "image/webp"]] as const) {
      const o = await get(hg, qs, accept);
      assert.equal(o.headers.get("content-type"), "image/jpeg", qs + accept); assert.deepEqual(new Uint8Array(await o.arrayBuffer()), grande);
    }
    // 2048 px copy exists for a 2300 px picture; the 600 px one needs none: the original, kept for a year (no copy will ever come)
    assert.equal((await get(hg, "?px=2048")).headers.get("content-type"), "image/webp");
    const p = await get(hc, "?px=1024");
    assert.equal(p.headers.get("content-type"), "image/jpeg"); assert.match(p.headers.get("cache-control")!, /immutable/);
    // a big picture whose copy is not there (yet): the original, but a page may keep it only minutes
    rmCopia(dir, hg, 1024);
    const f = await get(hg, "?px=1024");
    assert.equal(f.headers.get("content-type"), "image/jpeg"); assert.match(f.headers.get("cache-control")!, /max-age=300/); assert.doesNotMatch(f.headers.get("cache-control")!, /immutable/);
  } finally { await srv.close(); }
});

function rmCopia(dir: string, h: string, px: number): void {
  const f = join(dir, "optimizados", `${h}.jpg.p${px}.webp`);
  assert.ok(existsSync(f)); unlinkSync(f);
}
