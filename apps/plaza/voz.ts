// voz (U10): the microphone. A real button «Micrófono» (and the Q key) turns yours on and off; while it is on, what
// you say goes in short compressed frames to the server, which passes them only to people near you (30 m, inside
// their area of interest: packages/net/src/voz.ts). The voices of people near you come out of where they stand
// (panned left/right, quieter with distance). Nothing is recorded or stored anywhere. M17: the server sends you at most
// 8 voices at once (the nearest); a voice from the stage (/escenario) reaches everyone and plays unpanned, like a PA.
// Codec: Opus through WebCodecs where the browser has it (≈ 24 kbit/s); otherwise µ-law at 16 kHz (128 kbit/s), which
// every browser can encode. A page that cannot decode Opus (no AudioDecoder) does not hear Opus speakers: it says so.
import { VOZ_OPUS, VOZ_MULAW, aMulaw, deMulaw } from "../../packages/net/src/index.ts";
import { decaerBoca } from "../../packages/render/src/avatares-politica.ts";
import { icono } from "./iconos.ts";

type Sesion = {
  entity: number;
  sendVoice(codec: number, trama: Uint8Array): boolean;
  onVoice: ((v: { codec: number; escenario: boolean; seq: number; entidad: number; trama: Uint8Array }) => void) | null;
  selfPosition(alpha: number): { x: number; y?: number; z: number };
  remotePositions(): { id: number; x: number; y: number; z: number }[];
};
type Vista = { label(t: number | "self", text: string, ms: number): void; cam: { yaw(): number }; voz(id: number, nivel: number): void };

const TRAMA_MS = 20;
const MULAW_HZ = 16000;
const SILENCIO = 0.006;      // a frame quieter than this (RMS) is not sent: no bandwidth while you are quiet
const COLA_S = 0.08;         // jitter buffer: a voice starts this late, so late frames still fit
const LEJOS_M = 30;

const CSS = `
#microfono { position: fixed; right: 10px; top: 10px; padding: 8px 12px; border: 0; border-radius: 8px; background: rgba(20, 24, 30, .78); color: #eef2f6; font: inherit; font-weight: 600; }
#microfono[aria-pressed="true"] { background: #e05a4f; color: #fff; }
#microfono:focus-visible { outline: 3px solid #ffd27a; }
#microfono { position: relative; }
#microfono .nivel { position: absolute; left: 6px; bottom: 4px; display: block; width: 0; max-width: 32px; height: 3px; border-radius: 2px; background: #A6DAD5; }
`;

// the worklet that hands the page 128-sample blocks of the microphone (an inline module: no extra file to serve)
const WORKLET = `registerProcessor("captura-voz", class extends AudioWorkletProcessor {
  process(ins) { const c = ins[0] && ins[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
});`;

export function montarVoz(o: { session: Sesion; view: Vista; escribiendo(e: KeyboardEvent): boolean; decir(t: string): void }) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const boton = document.createElement("button");
  boton.type = "button"; boton.id = "microfono"; boton.className = "solo-icono"; boton.setAttribute("aria-pressed", "false");
  boton.title = "Micrófono (Q): lo que dices lo oye la gente a menos de 30 m. No se graba.";
  const texto = document.createElement("span");
  const nivel = document.createElement("span"); nivel.className = "nivel"; nivel.setAttribute("aria-hidden", "true");
  boton.append(texto, nivel);
  document.body.appendChild(boton);
  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  const estado = { encendido: false, codec: 0, enviadas: 0, recibidas: 0, sinOpus: false, error: "" };

  // ---- hearing: one chain per speaker, panned to where they stand ----
  let ctx: AudioContext | null = null;
  const contexto = () => (ctx ??= new AudioContext({ latencyHint: "interactive" }));
  addEventListener("pointerdown", () => { void ctx?.resume(); }, { capture: true, passive: true });
  addEventListener("keydown", () => { void ctx?.resume(); }, { capture: true, passive: true });
  // M17: a stage voice (`escenario`, moderation's /escenario) is a sound system, not a mouth: it goes straight to the output, unpanned, gain 1
  type Voz = { salida: AudioNode; panner: PannerNode | null; escenario: boolean; siguiente: number; dec?: AudioDecoder; marca: number; ts: number; rmsPendiente: number | null; nivelBoca: number };
  const voces = new Map<number, Voz>();
  const reproducir = (v: Voz, pcm: Float32Array, hz: number) => {
    const c = contexto();
    const buf = c.createBuffer(1, pcm.length, hz); buf.copyToChannel(pcm, 0);
    const src = c.createBufferSource(); src.buffer = buf; src.connect(v.salida);
    const t = Math.max(v.siguiente, c.currentTime + COLA_S);
    src.start(t); v.siguiente = t + buf.duration;
    // U13: this listener's own decoded volume (not the sender's), for the speaker's mouth shape — a decaerBoca
    // tick (below) turns it into how open the shape should be, and closes it again once frames stop arriving
    let rms = 0; for (const s of pcm) rms += s * s; rms = Math.sqrt(rms / pcm.length);
    v.rmsPendiente = Math.max(v.rmsPendiente ?? 0, rms);
  };
  const soltar = (e: number, v: Voz) => { v.salida.disconnect(); v.dec?.close(); voces.delete(e); o.view.voz(e, 0); };
  const vozDe = (entidad: number, escenario: boolean): Voz => {
    let v = voces.get(entidad);
    if (v && v.escenario !== escenario) { soltar(entidad, v); v = undefined; } // went on or off stage: a new chain
    if (v) return v;
    const c = contexto();
    const panner = escenario ? null : new PannerNode(c, { panningModel: "equalpower", distanceModel: "linear", refDistance: 1, maxDistance: LEJOS_M, rolloffFactor: 1 });
    const salida: AudioNode = panner ?? new GainNode(c, { gain: 1 });
    salida.connect(c.destination);
    v = { salida, panner, escenario, siguiente: 0, marca: 0, ts: 0, rmsPendiente: null, nivelBoca: 0 };
    if (typeof AudioDecoder === "function") {
      const vv = v;
      vv.dec = new AudioDecoder({
        output: (d) => { const pcm = new Float32Array(d.numberOfFrames); d.copyTo(pcm, { planeIndex: 0, format: "f32-planar" }); reproducir(vv, pcm, d.sampleRate); d.close(); },
        error: () => { vv.dec = undefined; },
      });
      vv.dec.configure({ codec: "opus", sampleRate: 48000, numberOfChannels: 1 });
    }
    voces.set(entidad, v);
    return v;
  };
  o.session.onVoice = (m) => {
    estado.recibidas++;
    const v = vozDe(m.entidad, m.escenario), ahora = performance.now();
    if (ahora - v.marca > 700) { v.marca = ahora; o.view.label(m.entidad, m.escenario ? "habla en el escenario" : "habla", 800); }
    if (m.codec === VOZ_MULAW) {
      const pcm = new Float32Array(m.trama.length);
      for (let i = 0; i < pcm.length; i++) pcm[i] = deMulaw(m.trama[i]) / 32768;
      reproducir(v, pcm, MULAW_HZ);
    } else if (m.codec === VOZ_OPUS) {
      if (!v.dec || v.dec.state !== "configured") { if (!estado.sinOpus) { estado.sinOpus = true; o.decir("Alguien habla cerca, pero este navegador no puede oír su voz (le falta Opus)."); } return; }
      v.dec.decode(new EncodedAudioChunk({ type: "key", timestamp: (v.ts += TRAMA_MS * 1000), data: m.trama }));
    }
  };
  // the listener is you, looking where the camera looks; every voice sits where its speaker stands
  setInterval(() => {
    if (!ctx || voces.size === 0 || o.session.entity < 0) return;
    const yo = o.session.selfPosition(1), yaw = o.view.cam.yaw(), L = ctx.listener, t = ctx.currentTime;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // the camera looks along -z at yaw 0 (render/camara.ts)
    if (L.positionX) { L.positionX.setValueAtTime(yo.x, t); L.positionY.setValueAtTime((yo.y ?? 0) + 1.6, t); L.positionZ.setValueAtTime(yo.z, t); L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(0, t); L.forwardZ.setValueAtTime(fz, t); }
    else { L.setPosition(yo.x, (yo.y ?? 0) + 1.6, yo.z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
    const donde = new Map(o.session.remotePositions().map((r) => [r.id, r]));
    for (const [e, v] of voces) {
      v.nivelBoca = decaerBoca(v.nivelBoca, v.rmsPendiente); v.rmsPendiente = null; // U13: fades on its own between frames
      o.view.voz(e, v.nivelBoca);
      const r = donde.get(e);
      if (!r) { if (t > v.siguiente + (v.escenario ? 30 : 5)) soltar(e, v); continue; } // a stage voice may come from beyond your snapshot: kept while it speaks
      if (v.panner) { v.panner.positionX.setValueAtTime(r.x, t); v.panner.positionY.setValueAtTime(r.y + 1.6, t); v.panner.positionZ.setValueAtTime(r.z, t); }
    }
  }, 100);

  // ---- speaking ----
  let flujo: MediaStream | null = null, nodo: AudioWorkletNode | null = null, fuente: MediaStreamAudioSourceNode | null = null, enc: AudioEncoder | null = null;
  let acumulado = new Float32Array(0), ts = 0;
  const pintar = () => {
    boton.setAttribute("aria-pressed", String(estado.encendido));
    const t = estado.encendido ? "Micrófono encendido: te oyen a menos de 30 m (Q apaga)" : "Micrófono apagado (Q enciende)";
    texto.innerHTML = `${icono(estado.encendido ? "microphone" : "microphone-slash")}<span class="solo-lector">${t}</span>`; boton.title = t;
  };
  async function encender(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) { o.decir("Este navegador no da el micrófono aquí (hace falta https)."); return; }
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) { estado.error = String((e as Error)?.name ?? e); o.decir(estado.error === "NotAllowedError" ? "Sin permiso para el micrófono: dalo en el candado de la barra de direcciones." : `No se pudo abrir el micrófono (${estado.error}).`); return; }
    const c = contexto(); await c.resume();
    const hz = c.sampleRate, porTrama = Math.round((hz * TRAMA_MS) / 1000);
    // Opus where the browser can encode it at this rate; µ-law otherwise
    estado.codec = VOZ_MULAW;
    if (typeof AudioEncoder === "function") {
      const conf = { codec: "opus", sampleRate: hz, numberOfChannels: 1, bitrate: 24000, opus: { frameDuration: TRAMA_MS * 1000 } } as AudioEncoderConfig;
      const ok = await AudioEncoder.isConfigSupported(conf).then((r) => !!r.supported, () => false);
      if (ok) {
        enc = new AudioEncoder({ output: (ch) => { const b = new Uint8Array(ch.byteLength); ch.copyTo(b); if (o.session.sendVoice(VOZ_OPUS, b)) estado.enviadas++; }, error: () => { enc = null; estado.codec = VOZ_MULAW; } });
        enc.configure(conf); estado.codec = VOZ_OPUS;
      }
    }
    await c.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
    fuente = c.createMediaStreamSource(flujo);
    nodo = new AudioWorkletNode(c, "captura-voz");
    fuente.connect(nodo); // not to the speakers: you never hear yourself
    nodo.port.onmessage = (ev) => {
      const b = ev.data as Float32Array, a = new Float32Array(acumulado.length + b.length);
      a.set(acumulado); a.set(b, acumulado.length); acumulado = a;
      while (acumulado.length >= porTrama) {
        const trama = acumulado.slice(0, porTrama); acumulado = acumulado.slice(porTrama);
        let rms = 0; for (const s of trama) rms += s * s; rms = Math.sqrt(rms / trama.length);
        nivel.style.width = `${Math.min(40, Math.round(rms * 400))}px`;
        ts += TRAMA_MS * 1000;
        if (rms < SILENCIO) continue;
        if (enc && estado.codec === VOZ_OPUS) {
          enc.encode(new AudioData({ format: "f32", sampleRate: hz, numberOfFrames: trama.length, numberOfChannels: 1, timestamp: ts, data: trama }));
        } else {
          const n = Math.floor((trama.length * MULAW_HZ) / hz), u = new Uint8Array(n);
          for (let i = 0; i < n; i++) u[i] = aMulaw(Math.round(Math.max(-1, Math.min(1, trama[Math.floor((i * hz) / MULAW_HZ)])) * 32767));
          if (o.session.sendVoice(VOZ_MULAW, u)) estado.enviadas++;
        }
      }
    };
    estado.encendido = true; pintar();
    o.decir(`Micrófono encendido: te oye la gente a menos de ${LEJOS_M} m.`);
  }
  function apagar(): void {
    nodo?.disconnect(); fuente?.disconnect(); for (const t of flujo?.getTracks() ?? []) t.stop();
    try { enc?.close(); } catch { /* already closed */ }
    nodo = null; fuente = null; flujo = null; enc = null; acumulado = new Float32Array(0);
    estado.encendido = false; nivel.style.width = "0"; pintar();
    o.decir("Micrófono apagado.");
  }
  const alternar = () => { if (estado.encendido) apagar(); else void encender(); };
  boton.addEventListener("click", (e) => { alternar(); if (e.detail > 0) boton.blur(); });
  addEventListener("keydown", (e) => { if (e.code === "KeyQ" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !o.escribiendo(e)) alternar(); });
  pintar();
  return { estado, alternar };
}
