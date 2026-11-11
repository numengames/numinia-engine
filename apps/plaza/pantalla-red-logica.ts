// pantalla-red-logica (M18 trozo 3): the decisions behind sending and watching a shared screen, with no DOM, no WebCodecs and no socket so node:test
// can run them (test/pantalla-red.test.ts). pantalla-red.ts does the browser's part and asks these.
import { tx } from "../../packages/feature/src/idioma.ts";
import { PANTALLA_VP8, PANTALLA_H264, PANTALLA_LADO_MAX, PANTALLA_FPS, PANTALLA_CLAVE_S, PANTALLA_MOTIVO } from "../../packages/net/src/index.ts";

/** The WebCodecs codec strings per wire codec: VP8 first (every Chromium and Firefox), H.264 baseline level 3.1 where that is what the browser encodes (Safari). */
export const CODEC_CADENA: Record<number, string> = { [PANTALLA_VP8]: "vp8", [PANTALLA_H264]: "avc1.42E01F" };
/** Wire codecs in the order the sender tries them. */
export const CODECS_ORDEN = [PANTALLA_VP8, PANTALLA_H264] as const;

/** The size to encode at: the share's own size scaled down so neither side passes PANTALLA_LADO_MAX, both even (the encoders want it), never below 16. */
export function tamanoEmision(ancho: number, alto: number, max = PANTALLA_LADO_MAX): { ancho: number; alto: number } {
  const a = Math.max(1, Math.round(ancho)), h = Math.max(1, Math.round(alto));
  const k = Math.min(1, max / Math.max(a, h));
  const par = (v: number) => Math.max(16, Math.min(max, Math.round((v * k) / 2) * 2));
  return { ancho: par(a), alto: par(h) };
}

/** Target bitrate (bits/s) for a size at PANTALLA_FPS: a text screen compresses well, so ~0.1 bits a pixel, kept inside the server's 250 kB/s guard (2 Mbit/s). */
export function bitrateEmision(ancho: number, alto: number): number {
  return Math.max(200_000, Math.min(1_200_000, Math.round(ancho * alto * PANTALLA_FPS * 0.1)));
}

/** Backpressure on the sender: with this many bytes still waiting in the socket, a frame is not even encoded (a slow link must not grow a queue). */
export const PENDIENTE_MAX = 256 * 1024;
export function debeSaltar(pendiente: number, codificando: number): boolean { return pendiente > PENDIENTE_MAX || codificando > 2; }

/** Is it time for a key frame? The first, every PANTALLA_CLAVE_S, or when the server asked. */
export function pideClave(frames: number, msDesdeUltima: number, pedida: boolean): boolean {
  return frames === 0 || pedida || msDesdeUltima >= PANTALLA_CLAVE_S * 1000;
}

/** What the viewer's page says when a share it watched ends or is refused (null = nothing to say). */
export function fraseFin(motivo: number, nombre: string, esPropia: boolean): string | null {
  const donde = nombre ? `«${nombre}»` : tx("the screen", "la pantalla");
  const M = PANTALLA_MOTIVO;
  if (esPropia) {
    switch (motivo) {
      case M.ocupada: return tx(`${donde} is already used by someone else: your screen shows in a window.`, `${donde} ya la está usando otra persona: tu pantalla se ve en una ventana.`);
      case M.lejos: return tx(`You are too far from ${donde}: your screen shows in a window.`, `Estás demasiado lejos de ${donde}: tu pantalla se ve en una ventana.`);
      case M.moderacion: return tx("Someone with permission stopped your shared screen.", "Alguien con permiso ha detenido tu pantalla compartida.");
      case M.noPermitido: return tx("You cannot show your screen to others here: only you see it, in a window.", "Aquí no puedes mostrar tu pantalla a los demás: la ves solo tú, en una ventana.");
      case M.noExiste: case M.borrada: return tx(`${donde} no longer exists: your screen shows in a window.`, `${donde} ya no existe: tu pantalla se ve en una ventana.`);
      default: return null; // fin: you asked for it, the page already said it
    }
  }
  switch (motivo) {
    case M.fueraDeAlcance: return null; // walking away is not news
    case M.seFue: case M.fin: case M.lejos: return tx(`They stopped sharing their screen on ${donde}.`, `Han dejado de compartir su pantalla en ${donde}.`);
    case M.moderacion: return tx(`The shared screen of ${donde} was stopped.`, `Han detenido la pantalla compartida de ${donde}.`);
    case M.borrada: return tx(`${donde} has disappeared.`, `${donde} ha desaparecido.`);
    default: return null;
  }
}

/** The viewer's state machine for one incoming share: it can only start from a key frame, and a key frame that does not decode sends it back to waiting. Pure. */
export class EsperaClave {
  private espera = true;
  get esperando(): boolean { return this.espera; }
  /** Feed a joined frame: true when it may be decoded. */
  admitir(clave: boolean): boolean { if (this.espera && !clave) return false; if (clave) this.espera = false; return true; }
  /** The decoder failed or fell behind: wait for the next key frame. */
  fallo(): void { this.espera = true; }
}
