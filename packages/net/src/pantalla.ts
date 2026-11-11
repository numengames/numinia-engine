// pantalla (M18 trozo 3, additive wire type 17): the screen one person shares is seen by everyone near the video screen it is on.
// Same pattern as the proximity voice (voz.ts): short compressed frames over the game's own WebSocket, relayed by the server to
// who is within reach of that screen — never to everyone (AGENTS rule 4), never decoded, never stored. No paid service, no TURN.
// The sharer encodes with WebCodecs (VP8, or H.264 where that is what the browser has) and the viewers decode with it. A frame
// is cut into pieces of at most PANTALLA_FRAGMENTO bytes so every message stays under WS_FRAME_MAX (1024): the server relays
// piece by piece, in order (TCP), and the viewer joins them again.
//   page -> server (the sharer):
//     [17, 1 EMPEZAR, codec u8, ancho u16, alto u16, keyLen u8, key…]   «I want to show my screen on the video screen `key`»
//     [17, 2 PARAR, keyLen u8, key…]                                      stop mine (keyLen 0), or — with the right — the one on `key`
//     [17, 3 TRAMA, seq u16, idx u8, n u8, flags u8, ts u32, datos…]      piece idx of n of frame seq (flags bit 0 = key frame; ts = ms)
//   server -> page:
//     [17, 4 ESTADO, id u16, vivo u8, motivo u8, emisor u16, codec u8, ancho u16, alto u16, puedeParar u8, keyLen u8, key…]
//        «share `id` is live on screen `key`» (vivo 1) or «ended / refused» (vivo 0, with the reason); sent to the sharer, and to
//        whoever comes within reach of the screen (or leaves it, or sees it end)
//     [17, 5 TRAMA, id u16, seq u16, idx u8, n u8, flags u8, ts u32, datos…]   a piece of the sharer's frame, for the viewers
//     [17, 6 PIDE_CLAVE, id u16]                                          to the sharer: «send a key frame now» (someone arrived, or a frame was dropped)

export const PANTALLA_TIPO = 17;
export const PANTALLA_EMPEZAR = 1, PANTALLA_PARAR = 2, PANTALLA_TRAMA_SUBIDA = 3, PANTALLA_ESTADO = 4, PANTALLA_TRAMA_BAJADA = 5, PANTALLA_PIDE_CLAVE = 6;
/** Codecs: 1 = VP8 (WebCodecs, every Chromium and Firefox), 2 = H.264 Annex B (Safari). */
export const PANTALLA_VP8 = 1, PANTALLA_H264 = 2;
/** Why a share is not live (ESTADO with vivo 0). */
export const PANTALLA_MOTIVO = { fin: 0, ocupada: 1, lejos: 2, moderacion: 3, noExiste: 4, noPermitido: 5, seFue: 6, borrada: 7, fueraDeAlcance: 8 } as const;
/** Most bytes of one piece. 11 (up) or 13 (down) bytes of header on top stay under WS_FRAME_MAX. */
export const PANTALLA_FRAGMENTO = 1000;
/** Most pieces of one frame (128 kB): a key frame of 1280×720 at ~1.5 Mbit/s is well under it. */
export const PANTALLA_FRAGMENTOS_MAX = 128;
/** Largest side of the picture (pixels). Published in limits.json (pantalla_ancho_max). */
export const PANTALLA_LADO_MAX = 1280;
/** Frames per second the page sends (the server drops more than 1.5 × this). Published in limits.json (pantalla_fps). */
export const PANTALLA_FPS = 15;
/** Seconds between key frames (a late viewer starts within this). */
export const PANTALLA_CLAVE_S = 2;
/** The server's bandwidth guard: bytes per second one share may put in (the target bitrate is ~1.2 Mbit/s = 150 kB/s). Over it, frames are dropped. */
export const PANTALLA_BYTES_S = 250_000;
/** How far from the screen you may start showing yours (metres, horizontal) — the nearest screen within it, as the page picks it. */
export const PANTALLA_EMITIR_M = 30;
/** How far from the screen you receive it (metres): the distance at which a video of the world stops playing (medios.ts VIDEO_PAUSA_M). Published in limits.json (pantalla_alcance_m). */
export const PANTALLA_VER_M = 40;
export const PANTALLA_CLAVE_MAX = 32;

const utf8 = new TextEncoder(), lee = new TextDecoder("utf-8", { fatal: false });

export type PantallaEmpezar = { codec: number; ancho: number; alto: number; key: string };
export type PantallaTrama = { seq: number; idx: number; n: number; clave: boolean; ts: number; datos: Uint8Array };
export type PantallaEstado = { id: number; vivo: boolean; motivo: number; emisor: number; codec: number; ancho: number; alto: number; puedeParar: boolean; key: string };

const codecValido = (c: number) => c === PANTALLA_VP8 || c === PANTALLA_H264;
const ladoValido = (v: number) => v >= 16 && v <= PANTALLA_LADO_MAX;
const claveBytes = (key: string) => utf8.encode(key);

export function codificarPantallaEmpezar(e: PantallaEmpezar): Uint8Array | null {
  const k = claveBytes(e.key);
  if (!codecValido(e.codec) || !ladoValido(e.ancho) || !ladoValido(e.alto) || k.length === 0 || k.length > PANTALLA_CLAVE_MAX) return null;
  const out = new Uint8Array(8 + k.length);
  out[0] = PANTALLA_TIPO; out[1] = PANTALLA_EMPEZAR; out[2] = e.codec; out[3] = e.ancho >> 8; out[4] = e.ancho & 0xff; out[5] = e.alto >> 8; out[6] = e.alto & 0xff; out[7] = k.length; out.set(k, 8);
  return out;
}
export function leerPantallaEmpezar(b: Uint8Array): PantallaEmpezar | null {
  if (b.length < 9 || b[0] !== PANTALLA_TIPO || b[1] !== PANTALLA_EMPEZAR) return null;
  const codec = b[2], ancho = (b[3] << 8) | b[4], alto = (b[5] << 8) | b[6], n = b[7];
  if (!codecValido(codec) || !ladoValido(ancho) || !ladoValido(alto) || n === 0 || n > PANTALLA_CLAVE_MAX || b.length !== 8 + n) return null;
  return { codec, ancho, alto, key: lee.decode(b.subarray(8)) };
}

export function codificarPantallaParar(key = ""): Uint8Array | null {
  const k = claveBytes(key);
  if (k.length > PANTALLA_CLAVE_MAX) return null;
  const out = new Uint8Array(3 + k.length);
  out[0] = PANTALLA_TIPO; out[1] = PANTALLA_PARAR; out[2] = k.length; out.set(k, 3);
  return out;
}
/** The key to stop (\"\" = my own share), or null when malformed. */
export function leerPantallaParar(b: Uint8Array): string | null {
  if (b.length < 3 || b[0] !== PANTALLA_TIPO || b[1] !== PANTALLA_PARAR || b[2] > PANTALLA_CLAVE_MAX || b.length !== 3 + b[2]) return null;
  return lee.decode(b.subarray(3));
}

/** One piece of a frame, going up. `datos` is 1..PANTALLA_FRAGMENTO bytes. */
export function codificarPantallaTrama(t: PantallaTrama): Uint8Array | null {
  if (t.datos.length === 0 || t.datos.length > PANTALLA_FRAGMENTO || t.n < 1 || t.n > PANTALLA_FRAGMENTOS_MAX || t.idx < 0 || t.idx >= t.n) return null;
  const out = new Uint8Array(11 + t.datos.length);
  out[0] = PANTALLA_TIPO; out[1] = PANTALLA_TRAMA_SUBIDA; out[2] = (t.seq >> 8) & 0xff; out[3] = t.seq & 0xff; out[4] = t.idx; out[5] = t.n; out[6] = t.clave ? 1 : 0;
  new DataView(out.buffer).setUint32(7, t.ts >>> 0); out.set(t.datos, 11);
  return out;
}
export function leerPantallaTramaSubida(b: Uint8Array): PantallaTrama | null {
  if (b.length < 12 || b.length > 11 + PANTALLA_FRAGMENTO || b[0] !== PANTALLA_TIPO || b[1] !== PANTALLA_TRAMA_SUBIDA) return null;
  const idx = b[4], n = b[5];
  if (n < 1 || n > PANTALLA_FRAGMENTOS_MAX || idx >= n) return null;
  return { seq: (b[2] << 8) | b[3], idx, n, clave: (b[6] & 1) !== 0, ts: new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(7), datos: b.subarray(11) };
}
/** The server turns an upload into what viewers get: the share's id goes in after the operation byte. Pure copy; nothing is opened. */
export function bajarPantallaTrama(subida: Uint8Array, id: number): Uint8Array {
  const out = new Uint8Array(subida.length + 2);
  out[0] = PANTALLA_TIPO; out[1] = PANTALLA_TRAMA_BAJADA; out[2] = (id >> 8) & 0xff; out[3] = id & 0xff; out.set(subida.subarray(2), 4);
  return out;
}
export function leerPantallaTramaBajada(b: Uint8Array): (PantallaTrama & { id: number }) | null {
  if (b.length < 14 || b.length > 13 + PANTALLA_FRAGMENTO || b[0] !== PANTALLA_TIPO || b[1] !== PANTALLA_TRAMA_BAJADA) return null;
  const idx = b[6], n = b[7];
  if (n < 1 || n > PANTALLA_FRAGMENTOS_MAX || idx >= n) return null;
  return { id: (b[2] << 8) | b[3], seq: (b[4] << 8) | b[5], idx, n, clave: (b[8] & 1) !== 0, ts: new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(9), datos: b.subarray(13) };
}

export function codificarPantallaEstado(e: PantallaEstado): Uint8Array {
  const k = claveBytes(e.key).subarray(0, PANTALLA_CLAVE_MAX);
  const out = new Uint8Array(15 + k.length), dv = new DataView(out.buffer);
  out[0] = PANTALLA_TIPO; out[1] = PANTALLA_ESTADO; dv.setUint16(2, e.id); out[4] = e.vivo ? 1 : 0; out[5] = e.motivo & 0xff; dv.setUint16(6, e.emisor); out[8] = e.codec & 0xff;
  dv.setUint16(9, e.ancho); dv.setUint16(11, e.alto); out[13] = e.puedeParar ? 1 : 0; out[14] = k.length; out.set(k, 15);
  return out;
}
export function leerPantallaEstado(b: Uint8Array): PantallaEstado | null {
  if (b.length < 15 || b[0] !== PANTALLA_TIPO || b[1] !== PANTALLA_ESTADO || b[14] > PANTALLA_CLAVE_MAX || b.length !== 15 + b[14]) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { id: dv.getUint16(2), vivo: b[4] === 1, motivo: b[5], emisor: dv.getUint16(6), codec: b[8], ancho: dv.getUint16(9), alto: dv.getUint16(11), puedeParar: b[13] === 1, key: lee.decode(b.subarray(15)) };
}

export function codificarPantallaPideClave(id: number): Uint8Array { return new Uint8Array([PANTALLA_TIPO, PANTALLA_PIDE_CLAVE, (id >> 8) & 0xff, id & 0xff]); }
export function leerPantallaPideClave(b: Uint8Array): number | null {
  return b.length === 4 && b[0] === PANTALLA_TIPO && b[1] === PANTALLA_PIDE_CLAVE ? (b[2] << 8) | b[3] : null;
}

/** Cut one encoded frame into the pieces that go up (in order). Null when it is empty or too big for PANTALLA_FRAGMENTOS_MAX pieces. */
export function trocearPantalla(seq: number, clave: boolean, ts: number, frame: Uint8Array): Uint8Array[] | null {
  const n = Math.ceil(frame.length / PANTALLA_FRAGMENTO);
  if (n < 1 || n > PANTALLA_FRAGMENTOS_MAX) return null;
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const m = codificarPantallaTrama({ seq, idx: i, n, clave, ts, datos: frame.subarray(i * PANTALLA_FRAGMENTO, (i + 1) * PANTALLA_FRAGMENTO) });
    if (!m) return null;
    out.push(m);
  }
  return out;
}

/** The viewer's side: joins the pieces of a frame again. Pieces come in order (TCP) and the server only drops a whole frame, so a
 * frame whose piece 0 never came, or that jumps a piece, is thrown away. Pure; holds one frame at a time. */
export class Montador {
  private seq = -1; private n = 0; private sig = 0; private clave = false; private ts = 0; private trozos: Uint8Array[] = []; private bytes = 0;
  /** A finished frame, or null while pieces are missing. */
  poner(t: PantallaTrama): { clave: boolean; ts: number; datos: Uint8Array } | null {
    if (t.idx === 0) { this.seq = t.seq; this.n = t.n; this.sig = 0; this.clave = t.clave; this.ts = t.ts; this.trozos = []; this.bytes = 0; }
    else if (t.seq !== this.seq || t.n !== this.n || t.idx !== this.sig) { this.seq = -1; return null; }
    this.trozos.push(t.datos); this.bytes += t.datos.length; this.sig = t.idx + 1;
    if (this.sig < this.n) return null;
    const datos = new Uint8Array(this.bytes); let o = 0;
    for (const p of this.trozos) { datos.set(p, o); o += p.length; }
    this.seq = -1; this.trozos = [];
    return { clave: this.clave, ts: this.ts, datos };
  }
}
