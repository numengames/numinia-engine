// voz (U10, additive wire type 11): people's voices, near only. The page sends one short compressed frame of its
// microphone (≈ 20-60 ms); the server relays it ONLY to the players who have the speaker in their area of interest
// and within VOZ_RADIO_M (never to everyone: AGENTS rule 4). No recording, nothing stored: the server never decodes it.
//   page -> server: [11, codec, seq u16, frame…]
//   server -> page: [11, codec | flags, seq u16, speaker entity u16, frame…]
// codec 1 = Opus (WebCodecs AudioEncoder, 48 kHz mono), codec 2 = µ-law 16 kHz mono (every browser can encode it).
// M17 trozo 1 (additive): the codec byte going DOWN carries flags in its high bit. VOZ_ESCENARIO (0x80) = stage voice:
// moderation put that speaker on stage, so the page plays it for everyone, unpanned (a sound system, not a mouth).
// A listener hears at most VOZ_TOPE voices at once: the nearest speakers that spoke in the last second (elegirVoces);
// stage voices are apart and do not count. Pages from before this cut read `codec` with the flag set and ignore it
// (an unknown codec: nothing plays); pages from this cut mask it off.

export const VOZ_TIPO = 11;
export const VOZ_OPUS = 1, VOZ_MULAW = 2;
/** Flag OR-ed into the codec byte of a server -> page frame: stage voice, for everyone, unpanned (M17). */
export const VOZ_ESCENARIO = 0x80;
/** Largest frame accepted (bytes). 20 ms of µ-law at 16 kHz = 320; Opus at 32 kbit/s, 60 ms = 240. */
export const VOZ_TRAMA_MAX = 700;
/** How far a voice carries (metres). Published in limits.json (voz_radio_m). */
export const VOZ_RADIO_M = 30;
/** Frames per second a speaker may send (20 ms frames = 50/s); more are dropped. */
export const VOZ_TRAMAS_S = 60;
/** Most voices one listener hears at once (the nearest that spoke in the last second); stage voices are apart.
 * Published in limits.json (voz_tope). Pablo may change it (M17 decision, 18-10: 8). */
export const VOZ_TOPE = 8;

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
/** The server turns an upload into what listeners get: the speaker's entity goes in after the sequence; `escenario`
 * sets the stage flag in the codec byte (M17). */
export function codificarVozBajada(subida: Uint8Array, entidad: number, escenario = false): Uint8Array {
  const out = new Uint8Array(subida.length + 2);
  out.set(subida.subarray(0, 4)); out[4] = (entidad >> 8) & 0xff; out[5] = entidad & 0xff; out.set(subida.subarray(4), 6);
  if (escenario) out[1] |= VOZ_ESCENARIO;
  return out;
}
export function leerVozBajada(b: Uint8Array): { codec: number; escenario: boolean; seq: number; entidad: number; trama: Uint8Array } | null {
  if (b.length < 7 || b[0] !== VOZ_TIPO) return null;
  return { codec: b[1] & 0x7f, escenario: (b[1] & VOZ_ESCENARIO) !== 0, seq: (b[2] << 8) | b[3], entidad: (b[4] << 8) | b[5], trama: b.subarray(6) };
}

/** M17: which speakers one listener hears. Pure. Every `escenario` speaker (always: whatever its distance or area of
 * interest; they do not count against `tope`), then the `visible` speakers within `radio` metres, nearest first, up to
 * `tope`. Same distance = lower id first, so the answer is deterministic. The listener itself is never in `hablantes`. */
export function elegirVoces(
  oyente: { x: number; z: number },
  hablantes: { id: number; x: number; z: number; escenario: boolean; visible: boolean; sala?: boolean }[],
  tope = VOZ_TOPE, radio = VOZ_RADIO_M,
): number[] {
  const out: number[] = [];
  const cerca: { id: number; d2: number }[] = [];
  const r2 = radio * radio;
  for (const h of hablantes) {
    if (h.escenario) { out.push(h.id); continue; }
    if (!h.visible) continue;
    const dx = h.x - oyente.x, dz = h.z - oyente.z, d2 = dx * dx + dz * dz;
    if (d2 <= r2 || h.sala) cerca.push({ id: h.id, d2 }); // `sala`: same bubble, heard at any distance but still inside the cap
  }
  cerca.sort((a, b) => a.d2 - b.d2 || a.id - b.id);
  for (let i = 0; i < cerca.length && i < tope; i++) out.push(cerca[i].id);
  return out;
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
