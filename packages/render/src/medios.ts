// medios (U10, U11): things in the world that are not .glb models. An image (png, jpg, webp) on a plane one metre high;
// a video (mp4, webm) on a plane that plays in a loop; a sphere of sound (mp3, ogg) of radius 1 (the thing's scale
// makes it bigger). Videos and sounds run on the wall clock, so everyone hears and sees the same moment. Who hears
// them (U11, `reach`): «burbuja» = only inside the bubble (a sound's sphere, or a video's own bubble of `radius`
// metres), full volume up to 80 % of the radius and fading to the edge; «zona» and «todos» = everyone, at the same
// volume, wherever they stand (today a world is one zone, so both reach the same people). Browsers start sound only
// after a click or a key: until then it waits. A hidden sphere, and a video's bubble, show only while building
// (verOcultos). Phones stay cool: a far video with bubble sound pauses, a sound nobody may hear stops.
import * as THREE from "three/webgpu";

export type Tipo = "modelo" | "imagen" | "video" | "sonido";
export type Alcance = "burbuja" | "zona" | "todos";
type Punto = { x: number; y: number; z: number };
export type Opciones = { hidden: boolean; volume: number; reach: Alcance; radius: number };
/** One drawn medium: what to add to the thing's group, what to call every frame, and how to let go of it. */
export type Medio = { obj: THREE.Object3D; actualizar(grupo: THREE.Object3D, oyente: Punto | null, o: Opciones): void; soltar(): void; sonando(): boolean };

const VIDEO_PAUSA_M = 40;      // farther than this (plus its bubble) a bubble video stands still: no decoding
const BORDE = 0.8;             // full volume up to 80 % of the radius, then fades to the edge
const SINCRO_S = 0.6;          // a video or sound more than this off the shared clock jumps back onto it
const COLOR_ESFERA = 0xA6DAD5; // Verdemar (STD-023)

/** Browsers start sound only after the person clicked or pressed a key: wait for that once, then retry everything. */
let gesto = false;
const enEspera = new Set<() => void>();
function trasGesto(fn: () => void): void { if (gesto) fn(); else enEspera.add(fn); }
if (typeof addEventListener === "function") {
  const listo = () => { gesto = true; for (const fn of [...enEspera]) { enEspera.delete(fn); fn(); } };
  for (const t of ["pointerdown", "keydown", "touchend"]) addEventListener(t, listo, { capture: true, passive: true });
}
/** Can this browser play this kind of file? (Safari before 17 has no .ogg; some phones have no .webm.) */
export function sePuedeReproducir(ext: string): boolean {
  if (typeof document === "undefined") return false;
  const tipos: Record<string, [string, string]> = { mp3: ["audio", "audio/mpeg"], ogg: ["audio", "audio/ogg"], mp4: ["video", 'video/mp4; codecs="avc1.42E01E"'], webm: ["video", "video/webm"] };
  const t = tipos[ext];
  return !t || document.createElement(t[0] as "audio" | "video").canPlayType(t[1]) !== "";
}

const distancia = (g: THREE.Object3D, p: Punto) => Math.hypot(g.position.x - p.x, g.position.y - p.y, g.position.z - p.z);
/** Volume for someone `d` metres from the centre of a bubble of radius `r`, or everyone's when the reach is wider. */
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

export async function cargarImagen(url: string): Promise<Medio> {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  const img = tex.image as { width?: number; height?: number };
  const m = plano(tex, img?.width && img.height ? img.width / img.height : 1);
  return { obj: m, actualizar() {}, sonando: () => false, soltar() { tex.dispose(); (m.material as THREE.Material).dispose(); m.geometry.dispose(); } };
}

export async function cargarVideo(url: string, verOcultos: () => boolean = () => false): Promise<Medio> {
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
  const reproducir = () => { sincronizar(v); void v.play().catch(() => trasGesto(reproducir)); };
  return {
    obj,
    sonando: () => !v.paused,
    actualizar(g, oyente, o) {
      const r = Math.max(0.5, o.radius);
      burbuja.visible = o.reach === "burbuja" && verOcultos();
      burbuja.scale.set(r / (g.scale.x || 1), r / (g.scale.y || 1), r / (g.scale.z || 1)); // metres, whatever the screen's scale
      const d = oyente ? distancia(g, oyente) : Infinity;
      if (o.reach === "burbuja" && d > VIDEO_PAUSA_M + r) { if (!v.paused) v.pause(); return; }
      if (v.paused) reproducir();
      const ahora = performance.now();
      if (ahora - ultimaSincro > 10_000) { ultimaSincro = ahora; sincronizar(v); }
      const vol = volumenEn(d, r, o);
      if (vol > 0.001 && !quiereSonar) { quiereSonar = true; trasGesto(() => { if (quiereSonar) v.muted = false; }); }
      if (vol <= 0.001) { quiereSonar = false; v.muted = true; }
      v.volume = vol;
    },
    soltar() { v.pause(); v.removeAttribute("src"); v.load(); tex.dispose(); (pantalla.material as THREE.Material).dispose(); pantalla.geometry.dispose(); soltarEsfera(burbuja); },
  };
}

export function cargarSonido(url: string, verOcultos: () => boolean): Medio {
  const a = new Audio();
  a.crossOrigin = "anonymous"; a.src = url; a.loop = true; a.preload = "auto";
  // no waiting for the file: the sphere shows at once (iPhones do not even fetch audio before a tap)
  a.addEventListener("error", () => console.warn(`[medios] no se pudo leer el sonido ${url} (${a.error?.code ?? "?"})`), { once: true });
  const grupo = esfera(true);
  let quiere = false, ultimaSincro = 0;
  const reproducir = () => { if (quiere) { sincronizar(a); void a.play().catch(() => trasGesto(reproducir)); } };
  return {
    obj: grupo,
    sonando: () => !a.paused,
    actualizar(g, oyente, o) {
      grupo.visible = !o.hidden || verOcultos();
      const r = Math.max(0.05, g.scale.x), d = oyente ? distancia(g, oyente) : Infinity;
      const vol = volumenEn(d, r, o);
      if (vol > 0.001) {
        a.volume = vol;
        if (!quiere) { quiere = true; reproducir(); }
        const ahora = performance.now();
        if (ahora - ultimaSincro > 10_000) { ultimaSincro = ahora; sincronizar(a); }
      } else if (quiere) { quiere = false; a.pause(); }
    },
    soltar() { quiere = false; a.pause(); a.removeAttribute("src"); a.load(); soltarEsfera(grupo); },
  };
}
