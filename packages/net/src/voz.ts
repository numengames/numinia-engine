// voz (U10, additive wire type 11): people's voices, near only. The page sends one short compressed frame of its
// microphone (≈ 20-60 ms); the server relays it ONLY to the players who have the speaker in their area of interest
// and within VOZ_RADIO_M (never to everyone: AGENTS rule 4). No recording, nothing stored: the server never decodes it.
//   page -> server: [11, codec, seq u16, frame…]
//   server -> page: [11, codec, seq u16, speaker entity u16, frame…]
// codec 1 = Opus (WebCodecs AudioEncoder, 48 kHz mono), codec 2 = µ-law 16 kHz mono (every browser can encode it).

export const VOZ_TIPO = 11;
export const VOZ_OPUS = 1, VOZ_MULAW = 2;
/** Largest frame accepted (bytes). 20 ms of µ-law at 16 kHz = 320; Opus at 32 kbit/s, 60 ms = 240. */
export const VOZ_TRAMA_MAX = 700;
/** How far a voice carries (metres). Published in limits.json (voz_radio_m). */
export const VOZ_RADIO_M = 30;
/** Frames per second a speaker may send (20 ms frames = 50/s); more are dropped. */
export const VOZ_TRAMAS_S = 60;

export function codificarVozSubida(codec: number, seq: number, trama: Uint8Array): Uint8Array | null {
  if (trama.length === 0 || trama.length > VOZ_TRAMA_MAX) return null;
  const out = new Uint8Array(4 + trama.length);
  out[0] = VOZ_TIPO; out[1] = codec; out[2] = (seq >> 8) & 0xff; out[3] = seq & 0xff; out.set(trama, 4);
  return out;
}
export function leerVozSubida(b: Uint8Array): { codec: number; seq: number; trama: Uint8Array } | null {
  if (b.length < 5 || b.length > 4 + VOZ_TRAMA_MAX || b[0] !== VOZ_TIPO || (b[1] !== VOZ_OPUS && b[1] !== VOZ_MULAW)) return null;
  return { codec: b[1], seq: (b[2] << 8) | b[3], trama: b.subarray(4) };
}
/** The server turns an upload into what listeners get: the speaker's entity goes in after the sequence. */
export function codificarVozBajada(subida: Uint8Array, entidad: number): Uint8Array {
  const out = new Uint8Array(subida.length + 2);
  out.set(subida.subarray(0, 4)); out[4] = (entidad >> 8) & 0xff; out[5] = entidad & 0xff; out.set(subida.subarray(4), 6);
  return out;
}
export function leerVozBajada(b: Uint8Array): { codec: number; seq: number; entidad: number; trama: Uint8Array } | null {
  if (b.length < 7 || b[0] !== VOZ_TIPO) return null;
  return { codec: b[1], seq: (b[2] << 8) | b[3], entidad: (b[4] << 8) | b[5], trama: b.subarray(6) };
}

// ---- µ-law (ITU-T G.711): 16-bit PCM <-> 8 bits, the codec every browser can do in plain JS ----
export function aMulaw(s: number): number {
  const BIAS = 0x84, CLIP = 32635;
  let sign = (s >> 8) & 0x80;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exp = 7;
  for (let m = 0x4000; (s & m) === 0 && exp > 0; m >>= 1) exp--;
  const mant = (s >> (exp + 3)) & 0x0f;
  return ~(sign | (exp << 4) | mant) & 0xff;
}
export function deMulaw(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80, exp = (u >> 4) & 0x07, mant = u & 0x0f;
  const s = (((mant << 3) + 0x84) << exp) - 0x84;
  return sign ? -s : s;
}
