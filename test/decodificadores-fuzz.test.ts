// D3: deterministic fuzz of every network decoder. Random and mutated bytes must never throw, never take long,
// and never produce output larger than the input can justify. Fixed seed, bounded iterations (well under 5 s).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MSG, WIRE_FORMAT, WS_FRAME_MAX, PASE_MAX, SALTOS_MAX, LEYENDO_POR_MENSAJE, REPORT_MAX,
  decodeSnapshot, decodeInput, decodeWelcome, decodeTime, decodeLatido, decodeReport, decodeIdentityRequest, decodeIdentity,
  decodePase, decodeCondiciones, decodeAceptar, decodeLeyendo, readFields, BitReader,
  encodeWelcome, encodeInput, encodePing, encodeLatido, encodeReport, encodeIdentityRequest, encodeIdentity, encodePase,
  encodeCondiciones, encodeAceptar, encodeLeyendo, encodePedirCondiciones, writeFields, BitWriter,
  codificarVozSubida, codificarVozBajada, leerVozSubida, leerVozBajada, VOZ_OPUS, VOZ_MULAW,
} from "../packages/net/src/index.ts";
import { comprobarGlb, comprobarFichero, comprobarTrazo, medidasImagen, TIPOS, TRAZO_SCHEMA } from "../packages/net/src/ficheros.ts";
import type { Fields } from "../packages/net/src/index.ts";
import { decodeCatalog, decodeFeatureMessage, decodeState, encodeFeatureMessage, encodeState, featureIndex } from "../packages/feature/src/index.ts";

// ---- seeded PRNG (mulberry32): same bytes on every run and machine ----
function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SEED = 0xd3d3d3;
const ITER = 400; // per decoder and strategy
const SLOW_MS = 250; // one decode of <= 70 kB taking longer than this is a hang

const utf8 = new TextEncoder();
const json = (type: number, o: unknown) => { const j = utf8.encode(JSON.stringify(o)); const out = new Uint8Array(j.length + 1); out[0] = type; out.set(j, 1); return out; };

const FIELDS: Fields = {
  a: { kind: "bool" }, n: { kind: "int", min: -5, max: 1000 }, f: { kind: "fixed", min: -10, max: 10, step: 0.25 },
  e: { kind: "enum", values: ["uno", "dos", "tres"] }, t: { kind: "text", maxBytes: 40 },
};

type Case = { name: string; run: (b: Uint8Array) => unknown; seeds: Uint8Array[]; check?: (b: Uint8Array, out: unknown) => void };

const snapHeader = (nLow: number, nHigh: number) => { const h = new Uint8Array(30); const dv = new DataView(h.buffer); h[0] = MSG.SNAPSHOT; dv.setUint16(26, nLow); dv.setUint16(28, nHigh); return h; };
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const fw = (type: number, idx: number, v: Record<string, unknown>) => encodeFeatureMessage(idx, FIELDS, v);
const stateMsg = (pos: number, key: string, v?: Record<string, unknown>) => encodeState(pos, key, FIELDS, v);
const glb = (() => { // a small valid .glb
  const j = utf8.encode('{"asset":{"version":"2.0"}}  '); const b = new Uint8Array(12 + 8 + j.length); const dv = new DataView(b.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, b.length, true); dv.setUint32(12, j.length, true); dv.setUint32(16, 0x4e4f534a, true); b.set(j, 20); return b;
})();
const trazo = utf8.encode(JSON.stringify({ schema: TRAZO_SCHEMA, pincel: "tubo", color: 1, grosor: 0.01, puntos: [[0, 0, 0, 1], [0.1, 0.2, 0.3, 0.5]] }));
const png = (() => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 1, 0]); return b; })();
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 1, 0, 1, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webp = (() => { const b = new Uint8Array(30); b.set(utf8.encode("RIFF")); b.set(utf8.encode("WEBPVP8 "), 8); b[23] = 0x9d; b[24] = 1; b[25] = 0x2a; b[26] = 64; b[28] = 64; return b; })();

const CASES: Case[] = [
  { name: "decodeSnapshot", run: decodeSnapshot, seeds: [snapHeader(0, 0), snapHeader(3, 2), snapHeader(0xffff, 0xffff), cat(snapHeader(1, 0), new Uint8Array(40))],
    check: (b, o) => { const s = o as ReturnType<typeof decodeSnapshot>; if (s) { assert.ok(s.others.length <= b.length / 6, "others bounded by input"); assert.ok(s.saltos.length <= SALTOS_MAX); } else assert.ok(b.length < 30); } },
  { name: "decodeInput", run: decodeInput, seeds: [encodeInput(1, 2, -3, 4), new Uint8Array(0), new Uint8Array([1])] },
  { name: "decodeWelcome", run: decodeWelcome, seeds: [encodeWelcome({ entity: 3, tick: 9, x: -5, z: 7, ref: { seed: 1, ticks: 2, n: 3, hash: 4 }, format: WIRE_FORMAT }), new Uint8Array(0)] },
  { name: "decodeTime", run: decodeTime, seeds: [encodePing(123456), new Uint8Array(0)] },
  { name: "decodeLatido", run: decodeLatido, seeds: [encodeLatido(true), encodeLatido(false)] },
  { name: "decodeReport", run: decodeReport, seeds: [encodeReport({ fps: 60, a: [1, 2] })!, json(MSG.REPORT, [1]), json(MSG.REPORT, null)] },
  { name: "decodeIdentityRequest", run: decodeIdentityRequest, seeds: [encodeIdentityRequest("tok"), encodeIdentityRequest("")] },
  { name: "decodeIdentity", run: decodeIdentity, seeds: [encodeIdentity({ token: "t", id: "i", nombre: "n" }), json(MSG.IDENTITY, { token: 1 }), json(MSG.IDENTITY, null)] },
  { name: "decodePase", run: decodePase, seeds: [encodePase("aaa.bbb.ccc")!] },
  { name: "decodeCondiciones", run: decodeCondiciones, seeds: [encodeCondiciones({ formato: "condiciones-estado@1", puerta: true, abierta: false, faltan: ["x"], aceptado: null }), encodePedirCondiciones()] },
  { name: "decodeAceptar", run: decodeAceptar, seeds: [encodeAceptar({ versiones: { c: "1" }, datos: ["d"] })!, json(MSG.ACEPTAR, { versiones: { __proto__: 1 }, datos: "x" }), json(MSG.ACEPTAR, { versiones: {}, datos: [1] })],
    check: (b, o) => { if (o) assert.ok(b.length <= 900); } },
  { name: "decodeLeyendo", run: decodeLeyendo, seeds: [encodeLeyendo([{ entidad: 1, leyendo: true }, { entidad: 65535, leyendo: false }])!],
    check: (b, o) => { if (o) assert.ok((o as unknown[]).length <= LEYENDO_POR_MENSAJE); } },
  { name: "readFields", run: (b) => readFields(new BitReader(b), FIELDS), seeds: [(() => { const w = new BitWriter(); writeFields(w, FIELDS, { a: true, n: 7, f: 1.5, e: "dos", t: "hola" }); return w.finish(); })(), new Uint8Array(0)] },
  { name: "leerVozSubida", run: leerVozSubida, seeds: [codificarVozSubida(VOZ_OPUS, 5, new Uint8Array(20))!, codificarVozSubida(VOZ_MULAW, 6, new Uint8Array(3))!] },
  { name: "leerVozBajada", run: leerVozBajada, seeds: [codificarVozBajada(codificarVozSubida(VOZ_OPUS, 5, new Uint8Array(20))!, 9, true)] },
  { name: "decodeCatalog", run: decodeCatalog, seeds: [json(MSG.CATALOG, { schema: "numinia-engine/catalog@1", features: [] }), json(MSG.CATALOG, [])] },
  { name: "decodeFeatureMessage", run: (b) => decodeFeatureMessage(b, FIELDS), seeds: [fw(MSG.FEATURE, 2, { a: true, n: 3, f: 2, e: "tres", t: "x" }), new Uint8Array(3)] },
  { name: "featureIndex", run: featureIndex, seeds: [fw(MSG.FEATURE, 2, {}), new Uint8Array(0)] },
  { name: "decodeState", run: (b) => decodeState(b, (p) => (p < 4 ? FIELDS : null)), seeds: [stateMsg(1, "k", { a: false, n: 1, f: 0, e: "uno", t: "" }), stateMsg(2, "k")] },
  { name: "comprobarGlb", run: comprobarGlb, seeds: [glb] },
  { name: "comprobarTrazo", run: comprobarTrazo, seeds: [trazo] },
  ...Object.keys(TIPOS).map((tipo): Case => ({ name: `comprobarFichero(${tipo})`, run: (b) => comprobarFichero(tipo, b), seeds: [tipo === "trazo" ? trazo : tipo === "png" ? png : tipo === "jpg" ? jpg : tipo === "webp" ? webp : glb] })),
  ...["png", "jpg", "webp"].map((tipo): Case => ({ name: `medidasImagen(${tipo})`, run: (b) => medidasImagen(tipo, b), seeds: [tipo === "png" ? png : tipo === "jpg" ? jpg : webp] })),
];

/** One of: pure noise, a seed with some bytes/bits flipped, a truncation, an extension, a splice, or a header-shaped buffer with lying counts. */
function make(rnd: () => number, seeds: Uint8Array[]): Uint8Array {
  const int = (n: number) => Math.floor(rnd() * n);
  const noise = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = int(256); return b; };
  const s = seeds[int(seeds.length)];
  switch (int(7)) {
    case 0: return noise(int(2200));
    case 1: return noise(int(4));
    case 2: { const b = s.slice(); for (let k = int(4) + 1; k > 0 && b.length; k--) { const i = int(b.length); b[i] = rnd() < 0.5 ? b[i] ^ (1 << int(8)) : int(256); } return b; }
    case 3: return s.slice(0, int(s.length + 1));
    case 4: return cat(s, noise(int(1200)));
    case 5: { const b = cat(s, noise(int(64))); if (b.length) b[0] = rnd() < 0.5 ? s[0] ?? 0 : int(20); for (let k = int(3); k > 0 && b.length > 1; k--) b[int(Math.min(b.length, 32))] = rnd() < 0.5 ? 0xff : 0; return b; }
    default: { // as a view into a bigger buffer, so byteOffset != 0 is exercised too
      const pad = noise(8 + int(8)), body = rnd() < 0.5 ? s : noise(int(100)); return cat(pad, body, pad).subarray(pad.length, pad.length + body.length);
    }
  }
}

for (const c of CASES) {
  test(`fuzz: ${c.name} never throws, hangs or over-allocates`, () => {
    const rnd = prng(SEED ^ c.name.split("").reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
    let worst = 0;
    for (let i = 0; i < ITER; i++) {
      const b = make(rnd, c.seeds);
      const t0 = performance.now();
      let out: unknown;
      try { out = c.run(b); } catch (e) { assert.fail(`${c.name} threw on ${b.length} bytes [${Array.from(b.subarray(0, 40)).join(",")}…]: ${(e as Error).message}`); }
      worst = Math.max(worst, performance.now() - t0);
      c.check?.(b, out);
    }
    assert.ok(worst < SLOW_MS, `${c.name}: slowest decode took ${worst.toFixed(0)} ms`);
  });
}

test("fuzz: caps hold on oversized and hostile inputs", () => {
  const big = new Uint8Array(1 << 20).fill(0xff); // 1 MiB of 0xff
  for (const t of [MSG.REPORT, MSG.IDENTITY, MSG.PASE, MSG.ACEPTAR, MSG.LEYENDO, MSG.CONDICIONES, MSG.CATALOG]) big[0] = t, assert.doesNotThrow(() => { decodeReport(big); decodeIdentityRequest(big); decodeIdentity(big); decodePase(big); decodeAceptar(big); decodeLeyendo(big); decodeCondiciones(big); decodeCatalog(big); });
  assert.equal(decodeReport(new Uint8Array(REPORT_MAX + 1).fill(0x7b, 0).fill(MSG.REPORT, 0, 1)), null);
  assert.equal(decodePase(cat(new Uint8Array([MSG.PASE]), new Uint8Array(PASE_MAX).fill(0x61))), null);
  assert.equal(decodeAceptar(cat(new Uint8Array([MSG.ACEPTAR]), new Uint8Array(WS_FRAME_MAX).fill(0x20))), null);
  assert.equal(decodeLeyendo(cat(new Uint8Array([MSG.LEYENDO]), new Uint8Array(3 * (LEYENDO_POR_MENSAJE + 1)))), null);
  // a snapshot that claims 65,535 + 65,535 entities in 30 bytes yields none
  assert.equal(decodeSnapshot(snapHeader(0xffff, 0xffff))!.others.length, 0);
  // deeply nested JSON must be refused, not blow the stack out of the decoder
  const deep = utf8.encode("[".repeat(100_000));
  for (const t of [MSG.IDENTITY, MSG.CONDICIONES, MSG.ACEPTAR, MSG.CATALOG]) assert.doesNotThrow(() => { decodeIdentity(cat(new Uint8Array([t]), deep)); decodeCondiciones(cat(new Uint8Array([t]), deep)); decodeCatalog(cat(new Uint8Array([t]), deep)); });
  // prototype pollution through JSON keys must not touch Object.prototype
  decodeAceptar(utf8.encode("\x0e" + '{"versiones":{"__proto__":"x","constructor":"y"},"datos":[]}'));
  assert.equal(({} as Record<string, unknown>).x, undefined);
});

test("fuzz: the corpus is reproducible (fixed seed)", () => {
  const a = prng(SEED), b = prng(SEED);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});
