// pantalla-red (M18 trozo 3): the browser's part of «my shared screen is seen by everyone near the video screen».
// Sending: the stream you already have (getDisplayMedia) is drawn at most PANTALLA_FPS times a second on a canvas at most 1280 px a side, each
// canvas picture is encoded by WebCodecs (VP8, or H.264 where that is all the browser has) and goes up in pieces over the game's own socket.
// Watching: pieces of the share you are near arrive, are joined, decoded with WebCodecs and drawn on a canvas whose captureStream() goes to the
// same `pantallaEnVivo` the local share already uses — the video screen cannot tell a local share from a far one. No library, no service.
// Where WebCodecs does not exist (older Safari, Quest Browser before its update) the page does not send and does not decode: the screen keeps
// its file and the sharer is told once. Nothing is stored anywhere; stopping stops every track and closes every encoder and decoder.
import { PANTALLA_FPS, Montador } from "../../packages/net/src/index.ts";
import type { PantallaEstado, PantallaTrama } from "../../packages/net/src/index.ts";
import { CODEC_CADENA, CODECS_ORDEN, EsperaClave, bitrateEmision, debeSaltar, fraseFin, pideClave, tamanoEmision } from "./pantalla-red-logica.ts";

type Sesion = {
  entity: number;
  onPantallaEstado: ((e: PantallaEstado) => void) | null;
  onPantallaTrama: ((t: PantallaTrama & { id: number }) => void) | null;
  onPantallaClave: ((id: number) => void) | null;
  pantallaEmpezar(key: string, codec: number, ancho: number, alto: number): boolean;
  pantallaParar(key?: string): boolean;
  pantallaTrama(seq: number, clave: boolean, ts: number, frame: Uint8Array): boolean;
  enviadoPendiente(): number;
};
type Vista = { pantallaEnVivo(key: string, stream: MediaStream | null): boolean };
type Emision = { key: string; codec: number; enc: VideoEncoder; video: HTMLVideoElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; timer: ReturnType<typeof setInterval>; frames: number; ultimaClave: number; clavePedida: boolean; seq: number; id: number; t0: number };
type Ver = { key: string; decoder: VideoDecoder; canvas: HTMLCanvasElement; montador: Montador; espera: EsperaClave; codec: number; nombre: string };

const g = globalThis as unknown as { VideoEncoder?: typeof VideoEncoder; VideoDecoder?: typeof VideoDecoder; VideoFrame?: typeof VideoFrame; EncodedVideoChunk?: typeof EncodedVideoChunk };
export const hayWebCodecs = (): boolean => !!(g.VideoEncoder && g.VideoDecoder && g.VideoFrame && g.EncodedVideoChunk);

export function montarPantallaRed(o: { session: Sesion; view: Vista; decir(t: string): void; nombreDe(key: string): string; /** The server ended or refused MY share: the page puts it back in the floating window. */ alPararPropia?(key: string): void }) {
  const s = o.session;
  const estado = { enviando: null as string | null, viendo: 0, tramasEnviadas: 0, saltadas: 0, bytesEnviados: 0, tramasVistas: 0, error: "" };

  // ---------- sending ----------
  let emi: Emision | null = null;

  async function elegirCodec(ancho: number, alto: number): Promise<{ codec: number; config: VideoEncoderConfig } | null> {
    for (const c of CODECS_ORDEN) {
      const config: VideoEncoderConfig = { codec: CODEC_CADENA[c], width: ancho, height: alto, bitrate: bitrateEmision(ancho, alto), framerate: PANTALLA_FPS, latencyMode: "realtime", ...(c === 2 ? { avc: { format: "annexb" } } : {}) } as VideoEncoderConfig;
      try { const r = await g.VideoEncoder!.isConfigSupported(config); if (r.supported) return { codec: c, config: r.config ?? config }; } catch { /* next */ }
    }
    return null;
  }

  /** Start sending `stream` to the video screen `key`. Safe to call again for the same key (nothing happens) or another (the share moves). */
  async function empezar(key: string, stream: MediaStream): Promise<void> {
    if (emi?.key === key) return;
    parar(false);
    if (!hayWebCodecs()) { if (!estado.error) o.decir("Tu navegador no puede enviar la pantalla a los demás (falta WebCodecs): la ves solo tú."); estado.error = "sin-webcodecs"; return; }
    const pista = stream.getVideoTracks()[0];
    if (!pista) return;
    const ajustes = pista.getSettings();
    const { ancho, alto } = tamanoEmision(ajustes.width ?? 1280, ajustes.height ?? 720);
    const elegido = await elegirCodec(ancho, alto);
    if (!elegido) { estado.error = "sin-codec"; o.decir("Tu navegador no tiene un codec de vídeo para enviar la pantalla: la ves solo tú."); return; }
    if (emi || !stream.active) return; // something else started (or the share ended) while the codec was being asked for
    const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = new MediaStream([pista]);
    try { await video.play(); } catch { /* a muted video plays; if not, the first frames are just black */ }
    const canvas = document.createElement("canvas"); canvas.width = ancho; canvas.height = alto;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const e = { key, codec: elegido.codec, video, canvas, ctx, frames: 0, ultimaClave: 0, clavePedida: false, seq: 0, id: 0, t0: performance.now() } as Emision;
    e.enc = new g.VideoEncoder!({
      output: (chunk) => {
        const datos = new Uint8Array(chunk.byteLength); chunk.copyTo(datos);
        const ts = Math.round((performance.now() - e.t0)) >>> 0;
        if (s.pantallaTrama(e.seq++, chunk.type === "key", ts, datos)) { estado.tramasEnviadas++; estado.bytesEnviados += datos.length; } else estado.saltadas++;
      },
      error: (err) => { estado.error = String(err?.message ?? err); if (emi === e) { parar(true); o.decir("Se cortó el envío de tu pantalla: la ves solo tú."); } },
    });
    e.enc.configure(elegido.config);
    if (!s.pantallaEmpezar(key, elegido.codec, ancho, alto)) { e.enc.close(); return; }
    e.timer = setInterval(() => {
      if (emi !== e || video.readyState < 2) return;
      const ahora = performance.now();
      if (debeSaltar(s.enviadoPendiente(), e.enc.encodeQueueSize)) { estado.saltadas++; e.clavePedida = true; return; } // slow link: skip, and the next one is a key frame
      ctx.drawImage(video, 0, 0, ancho, alto);
      const clave = pideClave(e.frames, ahora - e.ultimaClave, e.clavePedida);
      let fotograma: VideoFrame;
      try { fotograma = new g.VideoFrame!(canvas, { timestamp: Math.round((ahora - e.t0) * 1000) }); } catch { return; }
      try { e.enc.encode(fotograma, { keyFrame: clave }); if (clave) { e.ultimaClave = ahora; e.clavePedida = false; } e.frames++; }
      catch { /* encoder closed meanwhile */ }
      finally { fotograma.close(); }
    }, Math.round(1000 / PANTALLA_FPS));
    emi = e; estado.enviando = key;
  }
  /** Stop sending (the share itself may go on locally: the page decides). `avisar` tells the server. */
  function parar(avisar = true): void {
    const e = emi; if (!e) return;
    emi = null; estado.enviando = null;
    clearInterval(e.timer);
    try { e.enc.close(); } catch { /* already closed */ }
    e.video.pause(); e.video.srcObject = null;
    if (avisar) s.pantallaParar();
  }

  s.onPantallaClave = (id) => { if (emi && (emi.id === 0 || emi.id === id)) emi.clavePedida = true; };

  // ---------- watching ----------
  const viendo = new Map<number, Ver>(); // by share id
  function cerrarVer(id: number): void {
    const v = viendo.get(id); if (!v) return;
    viendo.delete(id); estado.viendo = viendo.size;
    o.view.pantallaEnVivo(v.key, null);
    try { v.decoder.close(); } catch { /* already closed */ }
    v.canvas.width = 0; // frees its buffer
  }
  /** Shares announced whose screen is not loaded here yet (the world is still arriving): tried again every second until it is or the share ends. */
  const pendientes = new Map<number, PantallaEstado>();
  let reintento: ReturnType<typeof setInterval> | null = null;
  function reintentar(): void {
    for (const e of [...pendientes.values()]) abrirVer(e);
    if (pendientes.size === 0 && reintento) { clearInterval(reintento); reintento = null; }
  }
  function abrirVer(e: PantallaEstado): void {
    if (!hayWebCodecs() || viendo.has(e.id)) { pendientes.delete(e.id); return; }
    const cadena = CODEC_CADENA[e.codec]; if (!cadena) return;
    const canvas = document.createElement("canvas"); canvas.width = e.ancho; canvas.height = e.alto;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const espera = new EsperaClave();
    const v: Ver = { key: e.key, canvas, montador: new Montador(), espera, codec: e.codec, nombre: o.nombreDe(e.key),
      decoder: new g.VideoDecoder!({
        output: (f) => { if (canvas.width !== f.displayWidth) { canvas.width = f.displayWidth; canvas.height = f.displayHeight; } ctx.drawImage(f, 0, 0); f.close(); estado.tramasVistas++; },
        error: () => { espera.fallo(); try { v.decoder.reset(); v.decoder.configure(config); } catch { /* the next share state re-opens it */ } },
      }) };
    const config: VideoDecoderConfig = { codec: cadena, codedWidth: e.ancho, codedHeight: e.alto, optimizeForLatency: true } as VideoDecoderConfig;
    try { v.decoder.configure(config); } catch { return; }
    viendo.set(e.id, v); estado.viendo = viendo.size;
    // the stream of the canvas goes where the file would play; if the screen is not loaded yet the state comes again (the server re-sends on entering reach)
    const flujo = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(PANTALLA_FPS);
    if (!o.view.pantallaEnVivo(e.key, flujo)) {
      viendo.delete(e.id); estado.viendo = viendo.size; try { v.decoder.close(); } catch { /* closed */ }
      pendientes.set(e.id, e); reintento ??= setInterval(reintentar, 1000);
      return;
    }
    pendientes.delete(e.id);
    o.decir(`${v.nombre ? `«${v.nombre}»` : "Una pantalla"}: alguien está compartiendo su pantalla.`);
  }

  s.onPantallaEstado = (e) => {
    const propia = e.emisor === s.entity;
    if (e.vivo) {
      if (propia) { if (emi && emi.key === e.key) emi.id = e.id; return; } // the answer to my own request: remember its id
      abrirVer(e); return;
    }
    // ended or refused
    if (propia) {
      if (emi && emi.key === e.key) { parar(false); o.alPararPropia?.(e.key); }
      const frase = fraseFin(e.motivo, o.nombreDe(e.key), true);
      if (frase) o.decir(frase);
      return;
    }
    pendientes.delete(e.id);
    const v = viendo.get(e.id);
    if (v) { cerrarVer(e.id); const frase = fraseFin(e.motivo, v.nombre, false); if (frase) o.decir(frase); }
  };
  s.onPantallaTrama = (t) => {
    const v = viendo.get(t.id); if (!v) return;
    const f = v.montador.poner(t); if (!f) return;
    if (!v.espera.admitir(f.clave)) return;
    if (v.decoder.state !== "configured") return;
    if (v.decoder.decodeQueueSize > 6 && !f.clave) { v.espera.fallo(); return; } // too far behind: drop until the next key frame
    try { v.decoder.decode(new g.EncodedVideoChunk!({ type: f.clave ? "key" : "delta", timestamp: f.ts * 1000, data: f.datos })); }
    catch { v.espera.fallo(); }
  };

  function cerrarTodo(): void { parar(true); pendientes.clear(); for (const id of [...viendo.keys()]) cerrarVer(id); }
  return { estado, empezar, parar, cerrarTodo };
}
