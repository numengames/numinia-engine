// ficheros (H9): the files that cross between a page and its server by HTTP — what kinds exist, how big each may
// be, and whether the bytes really are what their name says. Pure (no DOM, no node:): the server checks every
// upload with it and the page checks before uploading, so a broken file is refused in Spanish without a round trip.
// Every cap here is also in limits.json (keys upload_max_<kind>, upload_total_max), checked by test/subidas.test.ts.
import type { Issue, Result } from "../../core/src/index.ts";

/** The kinds of file a world is made of, by extension, and the content type they are served with. */
export const TIPOS: Record<string, string> = {
  glb: "model/gltf-binary", vrm: "model/gltf-binary",
  png: "image/png", jpg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2", hdr: "image/vnd.radiance",
  mp3: "audio/mpeg", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm",
};

const MB = 1024 * 1024;
/** Largest upload per kind, in MB (1 MB = 1,048,576 bytes). Models: Hyperfy2's default (PUBLIC_MAX_UPLOAD_SIZE=12);
 * images are textures (KTX2 for big ones); video is short loops. Phones must stay cool: small files first. */
export const TOPES_MB: Record<string, number> = { glb: 12, vrm: 12, png: 4, jpg: 4, webp: 4, ktx2: 8, hdr: 8, mp3: 8, ogg: 8, mp4: 32, webm: 32 };
/** Everything uploaded to one server, together (a builder cannot fill the disk). */
export const SUBIDAS_TOTAL_MB = 1024;
export const topeBytes = (tipo: string): number => (TOPES_MB[tipo] ?? 0) * MB;

const fail = <T>(path: string, message: string): Result<T> => ({ ok: false, issues: [{ path, message }] });
const MAGIA_GLB = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

/** A .glb (binary glTF 2.0): 'glTF' + version 2 + its own length, chunks that fit, a first JSON chunk that parses
 * and says asset.version 2.x, an optional BIN chunk. Never throws. */
export function comprobarGlb(b: Uint8Array): Result<{ json: Record<string, unknown>; binBytes: number }> {
  if (b.length < 20) return fail("glb", `tiene ${b.length} bytes: un .glb tiene al menos 20`);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0, true) !== MAGIA_GLB) return fail("glb.magic", "no empieza por «glTF»: no es un .glb (¿es un .gltf de texto, o lo renombraste?)");
  const version = dv.getUint32(4, true);
  if (version !== 2) return fail("glb.version", `es glTF ${version}; solo vale glTF 2 (vuelve a exportarlo)`);
  const length = dv.getUint32(8, true);
  if (length !== b.length) return fail("glb.length", `la cabecera dice ${length} bytes y el fichero tiene ${b.length}: está cortado o dañado`);
  let off = 12, i = 0, binBytes = 0;
  let json: Record<string, unknown> | null = null;
  while (off < length) {
    const p = `glb.chunks[${i}]`;
    if (off + 8 > length) return fail(p, "la cabecera del trozo está cortada");
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (off + 8 + len > length) return fail(`${p}.length`, `el trozo dice ${len} bytes y no caben en el fichero`);
    if (i === 0) {
      if (type !== JSON_CHUNK) return fail(`${p}.type`, "el primer trozo de un .glb tiene que ser el JSON");
      let text = "";
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(off + 8, off + 8 + len)); }
      catch { return fail(`${p}.json`, "el JSON no es UTF-8 válido"); }
      let v: unknown;
      try { v = JSON.parse(text.replace(/[\0 ]+$/, "")); } catch { return fail(`${p}.json`, "el JSON del modelo no se puede leer"); }
      if (typeof v !== "object" || v === null || Array.isArray(v)) return fail(`${p}.json`, "el JSON del modelo no es un objeto");
      json = v as Record<string, unknown>;
    } else if (type === BIN_CHUNK) {
      if (i !== 1) return fail(`${p}.type`, "el trozo BIN tiene que ir justo después del JSON");
      binBytes = len;
    }
    off += 8 + len; i++;
  }
  if (!json) return fail("glb.chunks[0]", "no hay trozo JSON");
  const asset = json.asset as { version?: unknown } | undefined;
  if (typeof asset !== "object" || asset === null || typeof asset.version !== "string") return fail("glb.json.asset.version", "falta asset.version (todo glTF lo lleva)");
  if (!/^2\.\d+$/.test(asset.version)) return fail("glb.json.asset.version", `asset.version es «${asset.version.slice(0, 20)}»; solo vale 2.x`);
  return { ok: true, value: { json, binBytes } };
}

const empieza = (b: Uint8Array, at: number, bytes: number[]) => b.length >= at + bytes.length && bytes.every((x, k) => b[at + k] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** The first bytes each kind starts with (its "magic"): a .png that is really something else is refused. */
const MAGIAS: Record<string, (b: Uint8Array) => boolean> = {
  png: (b) => empieza(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (b) => empieza(b, 0, [0xff, 0xd8, 0xff]),
  webp: (b) => empieza(b, 0, ascii("RIFF")) && empieza(b, 8, ascii("WEBP")),
  ktx2: (b) => empieza(b, 0, [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]),
  hdr: (b) => empieza(b, 0, ascii("#?")),
  mp3: (b) => empieza(b, 0, ascii("ID3")) || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  ogg: (b) => empieza(b, 0, ascii("OggS")),
  mp4: (b) => empieza(b, 4, ascii("ftyp")),
  webm: (b) => empieza(b, 0, [0x1a, 0x45, 0xdf, 0xa3]),
};

/** Do these bytes look like a file of this kind? Models are read whole (comprobarGlb; a .vrm must also carry its
 * VRM extension); the rest by their first bytes. Never throws. */
export function comprobarFichero(tipo: string, b: Uint8Array): Result<{ tipo: string; bytes: number }> {
  if (!TIPOS[tipo]) return fail("tipo", `.${tipo} no es un tipo admitido (${Object.keys(TIPOS).join(", ")})`);
  if (b.length === 0) return fail("bytes", "el fichero está vacío");
  if (b.length > topeBytes(tipo)) return fail("bytes", `pasa de ${TOPES_MB[tipo]} MB, el tope para .${tipo}`);
  if (tipo === "glb" || tipo === "vrm") {
    const g = comprobarGlb(b);
    if (!g.ok) return { ok: false, issues: g.issues };
    const ext = (g.value.json.extensions ?? {}) as Record<string, unknown>;
    if (tipo === "vrm" && !ext.VRM && !ext.VRMC_vrm) return fail("vrm.extensions", "es un .glb sin la extensión VRM: no es un avatar VRM");
  } else if (!MAGIAS[tipo](b)) {
    return fail("magic", `los primeros bytes no son los de un .${tipo}: ¿es otro tipo de fichero con la extensión cambiada?`);
  }
  return { ok: true, value: { tipo, bytes: b.length } };
}

/** The issues of a Result as one line a person reads. */
export const motivo = (issues: Issue[]): string => issues.map((i) => i.message).join("; ");

// SHA-256 for pages without crypto.subtle (it exists only in secure contexts: https or localhost; a server reached by
// plain http://IP has none). FIPS 180-4, checked against node:crypto in test/subidas.test.ts.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256Hex(data: Uint8Array): string {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const l = data.length, n = ((l + 8) >> 6) * 64 + 64; // message + 0x80 + 64-bit length, in whole 64-byte blocks
  const m = new Uint8Array(n);
  m.set(data); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 8, Math.floor(l / 0x20000000)); // bit length, high 32 bits
  dv.setUint32(n - 4, (l << 3) >>> 0);              // and low 32 bits
  const w = new Uint32Array(64);
  for (let off = 0; off < n; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  let hex = "";
  for (const x of H) hex += x.toString(16).padStart(8, "0");
  return hex;
}
