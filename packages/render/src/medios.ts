// medios (U10, U11): things in the world that are not .glb models. An image (png, jpg, webp) on a plane one metre high;
// a video (mp4, webm) on a plane that plays in a loop; a sphere of sound (mp3, ogg) of radius 1 (the thing's scale
// makes it bigger). Videos and sounds run on the wall clock, so everyone hears and sees the same moment. Who hears
// them (U11, `reach`): «burbuja» = only inside the bubble (a sound's sphere, or a video's own bubble of `radius`
// metres); «zona» and «todos» = everyone, at the same volume, wherever they stand (today a world is one zone, so both
// reach the same people). Browsers start sound only after a click or a key: until then it waits. A hidden sphere, and
// a video's bubble, show only while building (verOcultos). Phones stay cool: a far video with bubble sound pauses, a
// sound nobody may hear stops.
//
// S4 · LOS MEDIOS DEL MUNDO PASAN AL GRAFO. Hasta hoy un sonido del mundo era `new Audio()` con `a.volume` bajado por
// distancia, y el oyente era la posición DE RED del jugador +1,5 m SIN orientación: un sonido a tu izquierda sonaba
// exactamente igual que uno a tu derecha. Desde aquí:
//  - un sonido del mundo es una voz del pool (`audio/voces.ts`) sobre el único `AudioContext` del motor
//    (`audio/nucleo.ts`): `PannerNode` de verdad (`inverse`, `refDistance 1`, `maxDistance` = el radio de la cosa,
//    `rolloffFactor 3`), en su bus (`ambiente` las camas, `efectos` lo puntual), con ducking y deslizadores gratis;
//  - el audio del `<video>` entra por `MediaElementAudioSourceNode` al bus `musica`, así que se duckea cuando alguien
//    habla y responde a los deslizadores de «Sonido» (antes era un `v.volume` suelto, fuera del mezclador);
//  - el oyente NO se calcula aquí: llega ya hecho desde `audio/oyente.ts` (la cámara fuera de XR, la pose real del
//    visor dentro). Este fichero solo pone la fuente donde está la cosa.
// Lo que NO cambia, porque es lo que ya funciona y tiene pruebas: el reloj de pared (umbral 0,6 s, resincronía cada
// 10 s), la pausa por distancia, `reach` burbuja|zona|todos, el radio del sonido desde la escala con tope de 50 m, y
// la espera al primer gesto del navegador. `volume` sigue leyéndose igual (y es el `gain` del emisor, como en
// `KHR_audio_emitter`). Sin Web Audio se usa el camino viejo con `HTMLAudioElement`: el mundo no se rompe, suena plano.
import * as THREE from "three/webgpu";
import { trasGesto } from "./gesto.ts"; // the person's first gesture: shared with the audio core (audio/nucleo.ts)
import type { Bus, Nucleo } from "./audio/nucleo.ts";
import type { Voces, Voz } from "./audio/voces.ts";

export type Tipo = "modelo" | "imagen" | "video" | "sonido";
export type Alcance = "burbuja" | "zona" | "todos";
type Punto = { x: number; y: number; z: number };
/** Lo que el render sabe de una cosa que suena o se ve. `bus` y `refDistance` todavía no vienen del mundo (los trae
 *  el emisor de `KHR_audio_emitter`, historia S9): están aquí para que entren sin tocar este fichero otra vez. */
export type Opciones = { hidden: boolean; volume: number; reach: Alcance; radius: number; bus?: Bus; refDistance?: number };
/** U-mandos: a video's own, per-person controls — never synced, never sent to the server (ADR candidate, not
 * decided: see docs/BACKLOG.md U14 «¿el mando es mío o del mundo?»). Pausing here freezes the picture for ME ONLY;
 * everyone else keeps watching on the shared clock. `volumen` is a 0–1 multiplier over the bubble's own volume.
 * S4: `volumen` y `silenciado` actúan ya sobre la ganancia del GRAFO, no sobre `v.volume`. */
export type ControlVideo = { pausado(): boolean; alternarPausa(): void; parar(): void; volumen(): number; fijarVolumen(v: number): void; silenciado(): boolean; alternarSilencio(): void };
/** One drawn medium: what to add to the thing's group, what to call every frame, and how to let go of it.
 * `oyente` = de dónde oyes, ya resuelto por `audio/oyente.ts` (NUNCA la posición de red: eso era el fallo que S4 quita).
 * `enVivo` (M18, video only): show a live MediaStream on the screen instead of the file (this page only; nothing is sent),
 * `null` puts the file back. */
export type Medio = { obj: THREE.Object3D; actualizar(grupo: THREE.Object3D, oyente: Punto | null, o: Opciones): void; soltar(): void; sonando(): boolean; controlVideo?: ControlVideo; enVivo?(stream: MediaStream | null): void };

const VIDEO_PAUSA_M = 40;      // farther than this (plus its bubble) a bubble video stands still: no decoding
const BORDE = 0.8;             // full volume up to 80 % of the radius, then fades to the edge (camino viejo)
const SINCRO_S = 0.6;          // a video or sound more than this off the shared clock jumps back onto it
const SINCRO_CADA_MS = 10_000; // y se vuelve a mirar cada diez segundos
const COLOR_ESFERA = 0xA6DAD5; // Verdemar (STD-023)
/** Radio máximo de una esfera de sonido (apps/plaza/constructor.ts topa ahí al construir; la regla vive también aquí,
 *  porque el radio es el `maxDistance` del panner y un mundo viejo pudo guardar una escala mayor). */
export const RADIO_SONIDO_MAX = 50;
/** De aquí en adelante un bucle es una CAMA: va por `MediaElementAudioSourceNode` (streaming) y no se descodifica.
 *  Un minuto mono a 44,1 kHz son ~5,3 MB de PCM: una cama de ambiente de 12 min serían 39 MB en memoria. */
export const CAMA_S = 20;
/** Defectos del emisor del diseño (§3), los de Hyperfy v2 a escala de mundo; `maxDistance` lo pone el radio. */
export const EMISOR = { distanceModel: "inverse" as DistanceModelType, refDistance: 1, rolloffFactor: 3 } as const;

/** Can this browser play this kind of file? (Safari before 17 has no .ogg; some phones have no .webm.) */
export function sePuedeReproducir(ext: string): boolean {
  if (typeof document === "undefined") return false;
  const tipos: Record<string, [string, string]> = { mp3: ["audio", "audio/mpeg"], ogg: ["audio", "audio/ogg"], mp4: ["video", 'video/mp4; codecs="avc1.42E01E"'], webm: ["video", "video/webm"] };
  const t = tipos[ext];
  return !t || document.createElement(t[0] as "audio" | "video").canPlayType(t[1]) !== "";
}

const distancia = (g: THREE.Object3D, p: Punto) => Math.hypot(g.position.x - p.x, g.position.y - p.y, g.position.z - p.z);
/** Volume for someone `d` metres from the centre of a bubble of radius `r`, or everyone's when the reach is wider.
 *  Solo se usa en el camino viejo (sin Web Audio) y para el respaldo del vídeo: con grafo, la distancia la hace el
 *  `PannerNode` (`distanciaDeSonido`). */
export function volumenEn(d: number, r: number, o: { volume: number; reach: Alcance }): number {
  const v = Math.max(0, Math.min(1, o.volume));
  if (o.reach !== "burbuja") return v;
  return v * (d <= r * BORDE ? 1 : d >= r ? 0 : (r - d) / (r * (1 - BORDE)));
}
/** Keep a looping media element on the wall clock: everyone at the same moment. */
function sincronizar(m: HTMLMediaElement): void {
  if (!Number.isFinite(m.duration) || m.duration <= 0) return;
  const debe = (Date.now() / 1000) % m.duration, dif = Math.abs(m.currentTime - debe);
  if (dif > SINCRO_S && dif < m.duration - SINCRO_S) m.currentTime = debe;
}

// ——— S4: el reloj de pared, en funciones puras (dos clientes con el mismo reloj caen en el mismo instante) ———

/** En qué segundo del bucle va el mundo ahora mismo. Es LA regla de la sincronía: no depende de cuándo entraste. */
export const instanteDePared = (dur: number, ahoraMs: number = Date.now()): number =>
  (!Number.isFinite(dur) || dur <= 0 ? 0 : ((ahoraMs / 1000) % dur + dur) % dur);

/** Cuánto se ha desviado del reloj compartido una voz que va por `posicion` (segundos, ya con la vuelta del bucle). */
export function desfase(posicion: number, dur: number, ahoraMs: number = Date.now()): number {
  if (!Number.isFinite(dur) || dur <= 0) return 0;
  const d = Math.abs((((posicion - instanteDePared(dur, ahoraMs)) % dur) + dur) % dur);
  return Math.min(d, dur - d);                 // el final del bucle está pegado al principio
}
/** ¿Hay que saltar? El mismo umbral de siempre (0,6 s), y nunca a menos de 0,6 s del final. */
export const necesitaSincro = (posicion: number, dur: number, ahoraMs: number = Date.now()): boolean =>
  Number.isFinite(dur) && dur > 2 * SINCRO_S && desfase(posicion, dur, ahoraMs) > SINCRO_S;

/** Las distancias del panner de una cosa que suena: `maxDistance` es su radio, y con `reach` más ancho que la
 *  burbuja la distancia NO atenúa (en `inverse`, `rolloffFactor 0` da ganancia 1 a cualquier distancia). */
export function distanciaDeSonido(r: number, o: Pick<Opciones, "reach" | "refDistance">, avisar?: (m: string) => void): { distanceModel: DistanceModelType; refDistance: number; maxDistance: number; rolloffFactor: number } {
  let ref = Number.isFinite(o.refDistance as number) ? (o.refDistance as number) : EMISOR.refDistance;
  if (!(ref > 0)) {
    // trampa real de la especificación: con `refDistance = 0` el modelo `inverse` deja la fuente MUDA para siempre
    avisar?.(`refDistance ${o.refDistance} no vale: con 0 el modelo inverse deja la fuente muda. Lo pongo en ${EMISOR.refDistance}`);
    ref = EMISOR.refDistance;
  }
  return {
    distanceModel: EMISOR.distanceModel,
    refDistance: ref,
    maxDistance: Math.max(ref, r),
    rolloffFactor: o.reach === "burbuja" ? EMISOR.rolloffFactor : 0,
  };
}
/** El bus de una cosa que suena: lo que diga la cosa; si no dice nada, `ambiente` para una cama y `efectos` para lo
 *  puntual (un sonido corto es un efecto; una cama es el ambiente del sitio). */
export const busDeSonido = (o: Opciones, cama: boolean): Bus => o.bus ?? (cama ? "ambiente" : "efectos");

/** El radio de una esfera de sonido: su escala, con suelo de 5 cm y tope de 50 m. */
export const radioDeSonido = (escala: number): number => Math.min(RADIO_SONIDO_MAX, Math.max(0.05, Number.isFinite(escala) ? escala : 0.05));

/** A plane one metre high, as wide as the picture's proportion, seen from both sides, unlit (pictures keep their colours). */
function plano(tex: THREE.Texture, aspecto: number): THREE.Mesh {
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
  m.scale.set(aspecto, 1, 1);
  return m;
}
const esferaGeo = new THREE.SphereGeometry(1, 32, 16);
/** A translucent sphere of radius 1. FrontSide outer skin (from inside, a click passes through to what is in the zone);
 * a BackSide inner skin only for the eye. `pickable` = a click on the outer skin selects the thing. */
function esfera(pickable: boolean): THREE.Group {
  const fuera = new THREE.Mesh(esferaGeo, new THREE.MeshBasicMaterial({ color: COLOR_ESFERA, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.FrontSide }));
  const dentro = new THREE.Mesh(esferaGeo, new THREE.MeshBasicMaterial({ color: COLOR_ESFERA, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.BackSide }));
  dentro.raycast = () => {};
  if (!pickable) fuera.raycast = () => {};
  const g = new THREE.Group(); g.add(fuera, dentro); g.userData.esfera = true;
  return g;
}
const soltarEsfera = (g: THREE.Group) => { for (const m of g.children as THREE.Mesh[]) (m.material as THREE.Material).dispose(); };

/** El grafo de audio, traído tarde: `audio/nucleo.ts` + `audio/voces.ts` NO entran en el paquete de arranque (son
 *  ~6 kB gz que solo hacen falta si el mundo tiene algo que suene). Se pide una vez por página. */
export type Grafo = { nucleo: Nucleo; voces: Voces; conectar: (nucleo: Nucleo, fuente: AudioNode, bus: Bus, panner?: PannerNode | null) => AudioNode | null };
let grafoProm: Promise<Grafo | null> | null = null;
export function pedirGrafo(): Promise<Grafo | null> {
  return (grafoProm ??= Promise.all([import("./audio/nucleo.ts"), import("./audio/voces.ts"), import("./audio/oyente.ts")])
    .then(([n, v, o]) => ({ nucleo: n.audio(), voces: v.voces(), conectar: o.conectar }))
    .catch(() => null));
}
/** Solo para las pruebas: pone (o quita) el grafo sin tocar el navegador. */
export function ponerGrafo(g: Grafo | null): void { grafoProm = Promise.resolve(g); }

export async function cargarImagen(url: string): Promise<Medio> {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  const img = tex.image as { width?: number; height?: number };
  const m = plano(tex, img?.width && img.height ? img.width / img.height : 1);
  return { obj: m, actualizar() {}, sonando: () => false, soltar() { tex.dispose(); (m.material as THREE.Material).dispose(); m.geometry.dispose(); } };
}

export async function cargarVideo(url: string, verOcultos: () => boolean = () => false, h: { trasGesto?: (fn: () => void) => void } = {}): Promise<Medio> {
  const esperarGesto = h.trasGesto ?? trasGesto;
  const v = document.createElement("video");
  v.crossOrigin = "anonymous"; v.src = url; v.loop = true; v.muted = true; v.playsInline = true; v.preload = "auto";
  v.setAttribute("playsinline", "");
  await new Promise<void>((ok, mal) => { v.addEventListener("loadedmetadata", () => ok(), { once: true }); v.addEventListener("error", () => mal(new Error(`no se pudo leer el vídeo (${v.error?.code ?? "?"})`)), { once: true }); });
  const tex = new THREE.VideoTexture(v);
  const pantalla = plano(tex, v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9);
  const burbuja = esfera(false); // U11: the video's bubble of sound, seen only while building
  burbuja.userData.sinCaja = true; // not part of the screen's box (selection outline, «sólido»)
  const obj = new THREE.Group(); obj.add(pantalla, burbuja);
  let quiereSonar = false, ultimaSincro = 0;
  // U-mandos: ME alone — pausing, muting or lowering volume here never touches the shared clock or anyone else's screen.
  let miPausa = false, miVolumen = 1, miSilencio = false;
  const reproducir = () => { if (miPausa) return; sincronizar(v); void v.play().catch(() => esperarGesto(reproducir)); };

  // ——— S4: el audio del vídeo entra en el mezclador ———
  // Un `MediaElementAudioSourceNode` se enchufa UNA vez por elemento (el spec no deja deshacerlo): desde ese momento
  // el sonido del vídeo sale por el grafo y `v.volume` deja de ser el mando — manda el `GainNode`.
  type Cadena = { g: GainNode; panner: PannerNode; nucleo: Nucleo };
  let cadena: Cadena | null = null, sinGrafo = false, pidiendo = false;
  const dicho = new Set<string>();
  const avisar = (m: string) => { if (!dicho.has(m)) { dicho.add(m); try { console.warn(`[medios] vídeo: ${m}`); } catch { /* sin consola */ } } };
  function enchufar(o: Opciones, r: number): void {
    if (cadena || sinGrafo || pidiendo) return;
    pidiendo = true;
    void pedirGrafo().then((gr) => {
      pidiendo = false;
      const ctx = gr?.nucleo.ctx();
      if (!gr || !ctx) { sinGrafo = true; return; }   // sin Web Audio: respaldo al camino viejo (`v.volume`)
      try {
        const g = ctx.createGain(); g.gain.value = 0;
        const panner = ctx.createPanner();
        const d = distanciaDeSonido(r, o, avisar);
        panner.panningModel = "equalpower";
        panner.distanceModel = d.distanceModel; panner.refDistance = d.refDistance;
        panner.maxDistance = d.maxDistance; panner.rolloffFactor = d.rolloffFactor;
        const src = ctx.createMediaElementSource(v);
        src.connect(g);
        // `conectar` es la única puerta a un bus (audio/oyente.ts): respeta qué buses suenan EN LA CABEZA
        if (!gr.conectar(gr.nucleo, g, busDeVideo(o), panner)) { sinGrafo = true; return; }
        cadena = { g, panner, nucleo: gr.nucleo };
        // un `<video>` con sonido NO arranca solo antes del primer gesto: hasta entonces sigue mudo (y el contexto
        // está suspendido, así que no se pierde nada). Después manda el grafo y `v.volume` deja de pintar.
        v.volume = 1;
        esperarGesto(() => { v.muted = false; });
      } catch { sinGrafo = true; avisar("este navegador no deja enchufar el vídeo al grafo"); }
    });
  }
  const busDeVideo = (o: Opciones): Bus => o.bus ?? "musica";  // el vídeo es música/espectáculo; la cosa puede decir otro
  let ultRadio = -1, ultAlcance: Alcance | null = null;
  function colocarVideo(g: THREE.Object3D, o: Opciones, r: number): void {
    const c = cadena;
    if (!c) return;
    if (r !== ultRadio || o.reach !== ultAlcance) {
      ultRadio = r; ultAlcance = o.reach;
      const d = distanciaDeSonido(r, o, avisar);
      try { c.panner.refDistance = d.refDistance; c.panner.maxDistance = d.maxDistance; c.panner.rolloffFactor = d.rolloffFactor; } catch { /* un panner terco sigue sonando */ }
    }
    const pan = c.panner as PannerNode & { positionX?: AudioParam; setPosition?: (x: number, y: number, z: number) => void };
    try {
      if (pan.positionX) { pan.positionX.value = g.position.x; (pan as unknown as { positionY: AudioParam }).positionY.value = g.position.y; (pan as unknown as { positionZ: AudioParam }).positionZ.value = g.position.z; }
      else pan.setPosition?.(g.position.x, g.position.y, g.position.z);
    } catch { /* igual: suena en el centro */ }
  }

  const controlVideo: ControlVideo = {
    pausado: () => miPausa,
    alternarPausa() { miPausa = !miPausa; if (miPausa) v.pause(); else reproducir(); },
    parar() { miPausa = true; v.pause(); v.currentTime = 0; },
    volumen: () => miVolumen,
    fijarVolumen(x) { miVolumen = Math.max(0, Math.min(1, x)); if (miVolumen > 0) miSilencio = false; },
    silenciado: () => miSilencio,
    alternarSilencio() { miSilencio = !miSilencio; },
  };
  // M18: a live stream (your shared screen) on the plane instead of the file, only on this page. The plane keeps the
  // file's proportion (the thing's box does not change); the file keeps playing underneath so the shared clock holds.
  const material = pantalla.material as THREE.MeshBasicMaterial;
  let vivo: { v: HTMLVideoElement; tex: THREE.VideoTexture } | null = null;
  const quitarVivo = () => {
    if (!vivo) return;
    vivo.v.pause(); vivo.v.srcObject = null; vivo.tex.dispose(); vivo = null;
    material.map = tex; material.needsUpdate = true;
  };
  return {
    obj,
    controlVideo,
    sonando: () => !v.paused || !!vivo,
    enVivo(stream) {
      quitarVivo();
      if (!stream) return;
      const lv = document.createElement("video");
      lv.muted = true; lv.playsInline = true; lv.autoplay = true; lv.setAttribute("playsinline", ""); lv.srcObject = stream;
      void lv.play().catch(() => {});
      const lt = new THREE.VideoTexture(lv); lt.colorSpace = THREE.SRGBColorSpace;
      material.map = lt; material.needsUpdate = true; vivo = { v: lv, tex: lt };
    },
    actualizar(g, oyente, o) {
      const r = Math.max(0.5, o.radius);
      burbuja.visible = o.reach === "burbuja" && verOcultos();
      burbuja.scale.set(r / (g.scale.x || 1), r / (g.scale.y || 1), r / (g.scale.z || 1)); // metres, whatever the screen's scale
      const d = oyente ? distancia(g, oyente) : Infinity;
      if (miPausa || (o.reach === "burbuja" && d > VIDEO_PAUSA_M + r)) { if (!v.paused) v.pause(); return; }
      if (v.paused) reproducir();
      const ahora = performance.now();
      if (ahora - ultimaSincro > SINCRO_CADA_MS) { ultimaSincro = ahora; sincronizar(v); }
      const mio = miSilencio ? 0 : miVolumen;
      if (!cadena && !sinGrafo) { enchufar(o, r); }
      if (cadena) {
        // el grafo manda: el panner hace la distancia y el bus hace el ducking y los deslizadores. Aquí solo queda
        // lo que es MÍO (mi volumen, mi silencio) y el volumen que el mundo le puso a la cosa.
        colocarVideo(g, o, r);
        const vol = Math.max(0, Math.min(1, o.volume)) * mio;
        try { cadena.g.gain.value = vol; } catch { /* un parámetro terco: el resto sigue */ }
        if (vol > 0.001 && !quiereSonar) { quiereSonar = true; esperarGesto(() => { if (quiereSonar && cadena) v.muted = false; }); }
        if (vol <= 0.001) quiereSonar = false;
        return;
      }
      // respaldo (sin Web Audio): exactamente el camino de siempre
      const vol = volumenEn(d, r, o) * mio;
      if (vol > 0.001 && !quiereSonar) { quiereSonar = true; esperarGesto(() => { if (quiereSonar) v.muted = false; }); }
      if (vol <= 0.001) { quiereSonar = false; v.muted = true; }
      v.volume = vol;
    },
    soltar() {
      quitarVivo(); v.pause(); v.removeAttribute("src"); v.load(); tex.dispose();
      if (cadena) { for (const n of [cadena.g, cadena.panner]) { try { (n as { disconnect?: () => void }).disconnect?.(); } catch { /* ya suelto */ } } cadena = null; }
      (pantalla.material as THREE.Material).dispose(); pantalla.geometry.dispose(); soltarEsfera(burbuja);
    },
  };
}

/** Lo que `cargarSonido` necesita del mundo exterior; en las pruebas se sustituye entero (sin navegador). */
export type HechurasSonido = {
  /** El grafo de audio; por defecto el de la página (traído tarde). `null` = sin Web Audio → camino viejo. */
  grafo?: () => Promise<Grafo | null>;
  /** El elemento con el que se mira la duración del fichero y que, si es una cama, SE CONVIERTE en la cama. */
  medio?: (url: string) => HTMLMediaElement;
  /** Reloj de pared en ms (el de la sincronía compartida). */
  ahora?: () => number;
  /** Reloj monótono en ms (el del «cada 10 s»). */
  monotono?: () => number;
  trasGesto?: (fn: () => void) => void;
};

let serieSonido = 0;

export function cargarSonido(url: string, verOcultos: () => boolean, h: HechurasSonido = {}): Medio {
  const pedir = h.grafo ?? pedirGrafo;
  const hacerMedio = h.medio ?? ((u: string) => { const a = new Audio(); a.crossOrigin = "anonymous"; a.preload = "metadata"; a.src = u; return a; });
  const ahoraMs = h.ahora ?? (() => Date.now());
  const monotono = h.monotono ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const esperarGesto = h.trasGesto ?? trasGesto;

  const grupo = esfera(true);
  const id = `medio:sonido:${++serieSonido}:${url}`;
  const dicho = new Set<string>();
  const avisar = (m: string) => { if (!dicho.has(m)) { dicho.add(m); try { console.warn(`[medios] «${url}»: ${m}`); } catch { /* sin consola */ } } };

  /** «sonda» = mirando la duración · «cama» = bucle largo por streaming · «corto» = buffer cacheado ·
   *  «viejo» = sin Web Audio, `HTMLAudioElement` como siempre · «muerto» = soltado. */
  let fase: "sonda" | "cama" | "corto" | "viejo" | "muerto" = "sonda";
  let grafo: Grafo | null = null;
  let dur = 0;                               // duración del fichero (s); 0 = no se sabe
  let sonda: HTMLMediaElement | null = null; // el elemento de la sonda / de la cama
  let voz: Voz | null = null;
  let viejo: HTMLAudioElement | null = null; // camino viejo
  let quiere = false;                        // ¿debería estar sonando ahora?
  let ultimaSincro = 0, arranqueMs = 0, desde = 0;
  let ultRadio = -1, ultAlcance: Alcance | null = null, ultBus: Bus | null = null, ultVol = -1;
  let ultimaO: Opciones | null = null, ultimoG: THREE.Object3D | null = null;

  // ——— camino viejo (sin Web Audio): es el de hoy, letra por letra ———
  function arrancarViejo(): void {
    if (fase === "muerto") return;
    fase = "viejo";
    const a = new Audio();
    a.crossOrigin = "anonymous"; a.src = url; a.loop = true; a.preload = "auto";
    a.addEventListener("error", () => avisar(`no se pudo leer el sonido (${a.error?.code ?? "?"})`), { once: true });
    viejo = a;
    avisar("este navegador no tiene Web Audio: suena plano, sin izquierda ni derecha");
  }
  const reproducirViejo = () => { const a = viejo; if (a && quiere) { sincronizar(a); void a.play().catch(() => esperarGesto(reproducirViejo)); } };

  // ——— el grafo: la sonda decide si esto es una cama o un sonido corto ———
  void pedir().then((gr) => {
    if (fase === "muerto") return;
    if (!gr || !gr.nucleo.ctx()) { arrancarViejo(); repetirUltima(); return; }
    grafo = gr;
    let m: HTMLMediaElement;
    try { m = hacerMedio(url); } catch { arrancarViejo(); repetirUltima(); return; }
    sonda = m;
    const decidir = () => {
      if (fase !== "sonda") return;
      const d = Number(m.duration);
      dur = Number.isFinite(d) && d > 0 ? d : 0;
      // sin duración (un flujo, un servidor sin Content-Length) se trata como cama: lo seguro es NO descodificar
      fase = dur === 0 || dur >= CAMA_S ? "cama" : "corto";
      if (fase === "corto") { try { m.removeAttribute("src"); m.load?.(); } catch { /* ya suelto */ } sonda = null; }
      repetirUltima();
    };
    try {
      m.addEventListener("loadedmetadata", decidir, { once: true });
      m.addEventListener("error", () => { if (fase === "sonda") { avisar(`no se pudo leer el sonido (${(m as HTMLAudioElement).error?.code ?? "?"})`); fase = "cama"; } }, { once: true });
      if (Number.isFinite(m.duration) && m.duration > 0) decidir();   // ya estaba en caché
    } catch { fase = "cama"; }
  });
  /** Cuando el grafo (o la sonda) llega tarde, se vuelve a aplicar el último estado conocido: así un sonido empieza
   *  en cuanto puede, sin esperar al siguiente fotograma. */
  const repetirUltima = () => { if (ultimaO && ultimoG && fase !== "muerto") medio.actualizar(ultimoG, ultimoOyente, ultimaO); };
  let ultimoOyente: Punto | null = null;

  // ——— arrancar y parar en el grafo ———
  function arrancar(g: THREE.Object3D, o: Opciones, r: number): void {
    const gr = grafo;
    if (!gr) return;
    const bus = busDeSonido(o, fase === "cama"), dist = distanciaDeSonido(r, o, avisar);
    const posicion = { x: g.position.x, y: g.position.y, z: g.position.z };
    const gain = Math.max(0, Math.min(1, o.volume));     // U11 `volume` ES el `gain` del emisor (KHR_audio_emitter)
    ultRadio = r; ultAlcance = o.reach; ultBus = bus; ultVol = gain;
    if (fase === "cama") {
      const m = sonda;
      if (!m) return;
      m.loop = true;
      // el reloj de pared: la cama entra por donde va el mundo, no por el principio
      if (dur > 0) { try { m.currentTime = instanteDePared(dur, ahoraMs()); } catch { /* algunos no dejan antes de cargar */ } }
      voz = gr.voces.cama({ id, uri: url, medio: m, bus, gain, posicion, loop: true, distancia: dist });
      if (!voz) { arrancarViejo(); return; }
      arranqueMs = ahoraMs(); desde = dur > 0 ? instanteDePared(dur, arranqueMs) : 0;
      ponerEnMarcha(m);
      return;
    }
    // corto: buffer cacheado, y `start(cuando, desplazamiento)` lo deja en el instante compartido
    desde = dur > 0 ? instanteDePared(dur, ahoraMs()) : 0;
    arranqueMs = ahoraMs();
    voz = gr.voces.reproducir({ id, uri: url, bus, gain, posicion, loop: true, distancia: dist, desplazamiento: desde, cooldown: 0, prioridad: 60 });
    if (!voz) { arrancarViejo(); return; }
  }
  /** Un `<audio>` no arranca antes del primer gesto: se reintenta tras él (como siempre). */
  function ponerEnMarcha(m: HTMLMediaElement): void {
    const intentar = () => { if (quiere && fase === "cama" && sonda === m) { try { const p = m.play?.(); if (p && typeof p.catch === "function") p.catch(() => esperarGesto(intentar)); } catch { esperarGesto(intentar); } } };
    intentar();
  }
  function parar(): void {
    if (voz) { try { voz.parar(); } catch { /* ya parada */ } voz = null; }
    if (fase === "cama" && sonda) { try { sonda.pause?.(); } catch { /* ya parada */ } }
  }

  const medio: Medio = {
    obj: grupo,
    sonando: () => (fase === "viejo" ? !!viejo && !viejo.paused : !!voz && voz.real()),
    actualizar(g, oyente, o) {
      if (fase === "muerto") return;
      ultimaO = o; ultimoG = g; ultimoOyente = oyente;
      grupo.visible = !o.hidden || verOcultos();
      const r = radioDeSonido(g.scale.x);
      // de dónde oyes lo decide `audio/oyente.ts`: aquí NO se calcula nada (antes era la posición de red +1,5 m)
      const d = oyente ? distancia(g, oyente) : Infinity;
      const gain = Math.max(0, Math.min(1, o.volume));
      // pausa por distancia: fuera de la burbuja no suena (y nada de descodificar). Con `reach` más ancho, siempre.
      const oible = gain > 0.001 && (o.reach !== "burbuja" || d < r);

      if (fase === "viejo") {
        const vol = volumenEn(d, r, o);
        if (vol > 0.001) {
          viejo!.volume = vol;
          if (!quiere) { quiere = true; reproducirViejo(); }
          const t = monotono();
          if (t - ultimaSincro > SINCRO_CADA_MS) { ultimaSincro = t; sincronizar(viejo!); }
        } else if (quiere) { quiere = false; viejo!.pause(); }
        return;
      }
      if (fase === "sonda" || !grafo) { quiere = oible; return; }   // todavía no se sabe qué es: se recuerda y ya

      if (!oible) { if (quiere) { quiere = false; parar(); } return; }
      if (!quiere || !voz) { quiere = true; parar(); arrancar(g, o, r); return; }

      // ya suena: lo que cambie en caliente. Radio, alcance o bus nuevos piden reconstruir la voz (el pool no deja
      // cambiarle las distancias a una voz viva); el volumen y la posición se mueven sin cortar.
      if (r !== ultRadio || o.reach !== ultAlcance || busDeSonido(o, fase === "cama") !== ultBus || gain !== ultVol) { parar(); arrancar(g, o, r); return; }
      grafo.voces.mover(id, { x: g.position.x, y: g.position.y, z: g.position.z });

      // el reloj de pared, cada diez segundos y con el umbral de 0,6 s de siempre
      const t = monotono();
      if (t - ultimaSincro > SINCRO_CADA_MS) {
        ultimaSincro = t;
        if (fase === "cama" && sonda) sincronizarCama(sonda);
        else if (dur > 0) {
          const pos = (desde + (ahoraMs() - arranqueMs) / 1000) % dur;
          if (necesitaSincro(pos, dur, ahoraMs())) { parar(); arrancar(g, o, r); }   // start(…, desplazamiento) de nuevo
        }
      }
    },
    soltar() {
      fase = "muerto"; quiere = false;
      parar();
      if (sonda) { try { sonda.pause?.(); sonda.removeAttribute?.("src"); sonda.load?.(); } catch { /* ya suelto */ } sonda = null; }
      if (viejo) { try { viejo.pause(); viejo.removeAttribute("src"); viejo.load(); } catch { /* ya suelto */ } viejo = null; }
      soltarEsfera(grupo);
    },
  };

  /** La cama va por `currentTime`, como siempre: mismo umbral, misma vuelta del bucle. */
  function sincronizarCama(m: HTMLMediaElement): void {
    const d = Number(m.duration);
    if (!Number.isFinite(d) || d <= 0) return;
    if (necesitaSincro(Number(m.currentTime) || 0, d, ahoraMs())) { try { m.currentTime = instanteDePared(d, ahoraMs()); } catch { /* algunos no dejan */ } }
  }

  return medio;
}