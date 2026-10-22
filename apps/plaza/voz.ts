// voz (U10): the microphone. A real button «Micrófono» (and the Q key) turns yours on and off; while it is on, what
// you say goes in short compressed frames to the server, which passes them only to people near you (30 m, inside
// their area of interest: packages/net/src/voz.ts). The voices of people near you come out of where they stand
// (panned left/right, quieter with distance). Nothing is recorded or stored anywhere.
// Codec: Opus through WebCodecs where the browser has it (≈ 24 kbit/s); otherwise µ-law at 16 kHz (128 kbit/s), which
// every browser can encode. A page that cannot decode Opus (no AudioDecoder) does not hear Opus speakers: it says so.
import { VOZ_OPUS, VOZ_MULAW, aMulaw, deMulaw } from "../../packages/net/src/index.ts";
import { decaerBoca } from "../../packages/render/src/avatares-politica.ts";
import { audio } from "../../packages/render/src/audio/nucleo.ts"; // S1: the engine's one audio graph and its buses
import { icono } from "./iconos.ts";

type Sesion = {
  entity: number;
  sendVoice(codec: number, trama: Uint8Array): boolean;
  onVoice: ((v: { codec: number; seq: number; entidad: number; trama: Uint8Array }) => void) | null;
  selfPosition(alpha: number): { x: number; y?: number; z: number };
  remotePositions(): { id: number; x: number; y: number; z: number }[];
};
type Vista = { label(t: number | "self", text: string, ms: number): void; cam: { yaw(): number }; voz(id: number, nivel: number): void };

const TRAMA_MS = 20;
const MULAW_HZ = 16000;
const SILENCIO = 0.006;      // a frame quieter than this (RMS) is not sent: no bandwidth while you are quiet
const COLA_S = 0.08;         // jitter buffer: a voice starts this late, so late frames still fit
const LEJOS_M = 30;
const OIDA_MS = 10_000;      // v10: after this long without hearing anybody, the audio graph may sleep again when the headset is taken off
/** Mouth level (U13's decaerBoca, 0–1) above which someone counts as talking: it is what triggers the ducking. */
const HABLANDO = 0.02;

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

export function montarVoz(o: { session: Sesion; view: Vista; escribiendo(e: KeyboardEvent): boolean; decir(t: string): void; ajuste?: (id: string) => unknown;
  /** v10: the headset. `activo` = inside an immersive session; `cerrada` = still behind the entry bubble (the server drops a closed person's voice); `nota` = a line in front of the eyes. */
  vr?: { activo(): boolean; cerrada(): boolean; nota(t: string): void } }) {
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
  // S1: the context and the bus are the audio core's (packages/render/src/audio/nucleo.ts) — one graph for everything.
  // The panner now ends in the «voz-gente» bus, whose VCA carries the «sonido.voz» slider: before this, it went
  // straight to ctx.destination with no GainNode at all and the voice could not be turned down (inventory § C).
  const nucleo = audio();
  const contexto = () => nucleo.ctx();
  const vozBus = () => nucleo.bus("voz-gente");
  const ajusteVoz = o.ajuste ?? (() => undefined);
  const aplicarVolumen = () => nucleo.volumen("voz-gente", Number(ajusteVoz("sonido.voz") ?? 100) / 100);
  aplicarVolumen();
  type Voz = { panner: PannerNode; siguiente: number; dec?: AudioDecoder; marca: number; ts: number; rmsPendiente: number | null; nivelBoca: number };
  const voces = new Map<number, Voz>();
  const reproducir = (v: Voz, pcm: Float32Array, hz: number) => {
    const c = contexto();
    if (!c) return; // this browser gave no AudioContext: you still see them talk (the mouth moves with the RMS)
    const buf = c.createBuffer(1, pcm.length, hz); buf.copyToChannel(pcm, 0);
    const src = c.createBufferSource(); src.buffer = buf; src.connect(v.panner);
    const t = Math.max(v.siguiente, c.currentTime + COLA_S);
    src.start(t); v.siguiente = t + buf.duration;
    // U13: this listener's own decoded volume (not the sender's), for the speaker's mouth shape — a decaerBoca
    // tick (below) turns it into how open the shape should be, and closes it again once frames stop arriving
    let rms = 0; for (const s of pcm) rms += s * s; rms = Math.sqrt(rms / pcm.length);
    v.rmsPendiente = Math.max(v.rmsPendiente ?? 0, rms);
  };
  const vozDe = (entidad: number): Voz | null => {
    let v = voces.get(entidad);
    if (v) return v;
    const c = contexto();
    if (!c) return null;
    const panner = new PannerNode(c, { panningModel: "equalpower", distanceModel: "linear", refDistance: 1, maxDistance: LEJOS_M, rolloffFactor: 1 });
    panner.connect(vozBus() ?? c.destination); // S1: the «voz-gente» bus, never the destination straight away
    v = { panner, siguiente: 0, marca: 0, ts: 0, rmsPendiente: null, nivelBoca: 0 };
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
  // ux2-gente: «Silenciar» someone (Gente, the card in the world) = their frames are dropped HERE, before any decoding:
  // only you stop hearing them, nobody is told, and the server still relays (it is the page's choice, not a ban).
  const silenciados = new Set<number>();
  let oidaHasta = 0; // v10: somebody's voice came in within this many ms: the graph is not put to sleep when the headset is taken off
  o.session.onVoice = (m) => {
    estado.recibidas++;
    if (silenciados.has(m.entidad)) return;
    oidaHasta = performance.now() + OIDA_MS; nucleo.despertar("voz-oida", true);
    const v = vozDe(m.entidad), ahora = performance.now();
    if (!v) return;
    if (ahora - v.marca > 700) { v.marca = ahora; o.view.label(m.entidad, "habla", 800); }
    if (m.codec === VOZ_MULAW) {
      const pcm = new Float32Array(m.trama.length);
      for (let i = 0; i < pcm.length; i++) pcm[i] = deMulaw(m.trama[i]) / 32768;
      reproducir(v, pcm, MULAW_HZ);
    } else if (m.codec === VOZ_OPUS) {
      if (!v.dec || v.dec.state !== "configured") { if (!estado.sinOpus) { estado.sinOpus = true; o.decir("Alguien habla cerca, pero este navegador no puede oír su voz (le falta Opus)."); } return; }
      v.dec.decode(new EncodedAudioChunk({ type: "key", timestamp: (v.ts += TRAMA_MS * 1000), data: m.trama }));
    }
  };
  // S5: the listener is NOT set here any more. One place in the engine moves the AudioListener —
  // packages/render/src/audio/oyente.ts, called from the draw loop — and it follows the camera outside XR and the
  // headset's real pose (getViewerPose, centred between the eyes) inside it. This loop used to point the listener
  // with `cam.yaw()`, a flat angle that ignored looking up/down and the headset altogether, so in goggles turning
  // your head did not change how people sounded. Nothing else changes here: same relay, same codec, same 30 m,
  // same `equalpower` panner per speaker at the position the server gives.
  setInterval(() => {
    if (oidaHasta && performance.now() > oidaHasta) { oidaHasta = 0; nucleo.despertar("voz-oida", false); }
    if (voces.size === 0 || o.session.entity < 0) return;
    const ctx = contexto();
    if (!ctx) return;
    aplicarVolumen(); // the «sonido.voz» slider can move at any moment: the bus's VCA follows it
    const t = ctx.currentTime;
    const donde = new Map(o.session.remotePositions().map((r) => [r.id, r]));
    let hablando = false;
    for (const [e, v] of voces) {
      v.nivelBoca = decaerBoca(v.nivelBoca, v.rmsPendiente); v.rmsPendiente = null; // U13: fades on its own between frames
      o.view.voz(e, v.nivelBoca);
      const r = donde.get(e);
      if (!r) { if (t > v.siguiente + 5) { v.panner.disconnect(); v.dec?.close(); voces.delete(e); o.view.voz(e, 0); } continue; }
      v.panner.positionX.setValueAtTime(r.x, t); v.panner.positionY.setValueAtTime(r.y + 1.6, t); v.panner.positionZ.setValueAtTime(r.z, t);
      if (v.nivelBoca > HABLANDO) hablando = true;
    }
    // S1: someone is talking nearby, so music, ambience and effects step back (never the interface or the voices)
    nucleo.duck(hablando);
  }, 100);

  // ---- speaking ----
  let flujo: MediaStream | null = null, nodo: AudioWorkletNode | null = null, fuente: MediaStreamAudioSourceNode | null = null, enc: AudioEncoder | null = null;
  let acumulado = new Float32Array(0), ts = 0;
  const pintar = () => {
    nucleo.despertar("microfono", estado.encendido); // v10: leaving the headset must not put the audio graph (and so the mic capture) to sleep
    boton.setAttribute("aria-pressed", String(estado.encendido));
    const t = estado.encendido ? "Micrófono encendido: te oyen a menos de 30 m (Q apaga)" : "Micrófono apagado (Q enciende)";
    texto.innerHTML = `${icono(estado.encendido ? "microphone" : "microphone-slash")}<span class="solo-lector">${t}</span>`; boton.title = t;
  };
  async function encender(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) { o.decir("Este navegador no da el micrófono aquí (hace falta https)."); return; }
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) { estado.error = String((e as Error)?.name ?? e); o.decir(estado.error === "NotAllowedError" ? "Sin permiso para el micrófono: dalo en el candado de la barra de direcciones." : `No se pudo abrir el micrófono (${estado.error}).`); return; }
    const c = contexto();
    if (!c) { o.decir("Este navegador no da audio aquí: no se puede abrir el micrófono."); return; }
    await c.resume();
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
  const entraVR = { antes: false, pendiente: false, enCurso: false };
  const alternar = () => { entraVR.pendiente = false; if (estado.encendido) apagar(); else void encender(); }; // a press of yours settles it: nothing opens by itself afterwards
  // v10: ENTERING THE HEADSET opens the microphone by itself — a headset has no Q key, the button of the page is not in front of the eyes,
  // and talking to someone is what you came for. Once, after the entry bubble is answered (before that the server drops your voice and the
  // icon would lie), and ONLY when the browser already gave the permission: a permission prompt cannot be answered from inside an immersive
  // session, so a first-time person gets a line saying where to grant it and the wrist menu's «Micrófono» keeps working as before.
  const permiso = async (): Promise<string> => { try { return (await navigator.permissions.query({ name: "microphone" as PermissionName })).state; } catch { return "desconocido"; } };
  const vigilarVR = async (): Promise<void> => {
    const vr = o.vr; if (!vr) return;
    const dentro = vr.activo();
    if (dentro && !entraVR.antes) entraVR.pendiente = true;
    entraVR.antes = dentro;
    if (!dentro) { entraVR.pendiente = false; return; }
    if (!entraVR.pendiente || entraVR.enCurso || vr.cerrada()) return;
    entraVR.enCurso = true;
    try {
      entraVR.pendiente = false;
      if (estado.encendido) return;
      const p = await permiso();
      if (p === "granted") { await encender(); if (estado.encendido) vr.nota("Micrófono abierto: te oyen a menos de 30 m"); }
      else vr.nota("Micrófono apagado: dale permiso en la página, fuera de VR");
    } finally { entraVR.enCurso = false; }
  };
  setInterval(() => { void vigilarVR(); }, 500);
  boton.addEventListener("click", (e) => { alternar(); if (e.detail > 0) boton.blur(); });
  addEventListener("keydown", (e) => { if (e.code === "KeyQ" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !o.escribiendo(e)) alternar(); });
  pintar();
  return {
    estado, alternar,
    /** ux2-gente: stop (or start again) hearing one person, only in this page. */
    silenciar(entidad: number, si: boolean): void {
      if (si) { silenciados.add(entidad); const v = voces.get(entidad); if (v) { v.panner.disconnect(); v.dec?.close(); voces.delete(entidad); o.view.voz(entidad, 0); } }
      else silenciados.delete(entidad);
    },
    silenciado: (entidad: number): boolean => silenciados.has(entidad),
  };
}
