// medios (U10): things in the world that are not .glb models. An image (png, jpg, webp) on a plane one metre high; a
// video (mp4, webm) on a plane that plays in a loop, on the same clock for everyone (the wall clock), muted until the
// page has had a click or a key (browsers forbid sound before that), its sound fading with distance; a sphere of
// sound (mp3, ogg): a translucent sphere of radius 1 (the thing's scale makes it bigger) where the file plays; you hear
// it inside, it fades out near the edge, and it stops outside. A hidden sphere is not drawn while playing (only while
// building: verOcultos). Phones stay cool: a far video pauses, a sphere you are not in stops its file.
import * as THREE from "three/webgpu";

export type Tipo = "modelo" | "imagen" | "video" | "sonido";
type Punto = { x: number; y: number; z: number };
/** One drawn medium: what to add to the thing's group, what to call every frame, and how to let go of it. */
export type Medio = { obj: THREE.Object3D; actualizar(grupo: THREE.Object3D, oyente: Punto | null, opciones: { hidden: boolean; volume: number }): void; soltar(): void; sonando(): boolean };

const VIDEO_PAUSA_M = 40;      // farther than this a video stands still (no decoding: cool phones)
const VIDEO_OIDO_M = 25;       // a video's sound reaches this far (beyond its own size)
const BORDE = 0.8;             // a sphere of sound plays at full volume up to 80 % of its radius, then fades to its edge
const SINCRO_S = 0.6;          // a video more than this off the shared clock jumps back onto it
const COLOR_ESFERA = 0x9ad0ff;

/** Browsers start sound only after the person clicked or pressed a key: wait for that once, then retry everything. */
let gesto = false;
const enEspera = new Set<() => void>();
function trasGesto(fn: () => void): void {
  if (gesto) { fn(); return; }
  enEspera.add(fn);
}
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

/** A plane one metre high, as wide as the picture's proportion, seen from both sides, unlit (pictures keep their colours). */
function plano(tex: THREE.Texture, aspecto: number): THREE.Mesh {
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
  m.scale.set(aspecto, 1, 1);
  return m;
}

export async function cargarImagen(url: string): Promise<Medio> {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  const img = tex.image as { width?: number; height?: number };
  const m = plano(tex, img?.width && img.height ? img.width / img.height : 1);
  return { obj: m, actualizar() {}, sonando: () => false, soltar() { tex.dispose(); (m.material as THREE.Material).dispose(); m.geometry.dispose(); } };
}

export async function cargarVideo(url: string): Promise<Medio> {
  const v = document.createElement("video");
  v.crossOrigin = "anonymous"; v.src = url; v.loop = true; v.muted = true; v.playsInline = true; v.preload = "auto";
  v.setAttribute("playsinline", "");
  await new Promise<void>((ok, mal) => { v.addEventListener("loadedmetadata", () => ok(), { once: true }); v.addEventListener("error", () => mal(new Error(`no se pudo leer el vídeo (${v.error?.code ?? "?"})`)), { once: true }); });
  const tex = new THREE.VideoTexture(v);
  const m = plano(tex, v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9);
  let quiereSonar = false, ultimaSincro = 0;
  const sincronizar = () => { // everyone sees the same moment: position = wall clock modulo the length
    if (!Number.isFinite(v.duration) || v.duration <= 0) return;
    const debe = (Date.now() / 1000) % v.duration;
    if (Math.abs(v.currentTime - debe) > SINCRO_S && Math.abs(v.currentTime - debe) < v.duration - SINCRO_S) v.currentTime = debe;
  };
  const reproducir = () => { sincronizar(); void v.play().catch(() => trasGesto(reproducir)); };
  return {
    obj: m,
    sonando: () => !v.paused,
    actualizar(g, oyente, o) {
      const d = oyente ? distancia(g, oyente) : Infinity, tam = Math.max(g.scale.x, g.scale.y);
      if (d > VIDEO_PAUSA_M + tam) { if (!v.paused) v.pause(); return; }
      if (v.paused) reproducir();
      const ahora = performance.now();
      if (ahora - ultimaSincro > 10_000) { ultimaSincro = ahora; sincronizar(); }
      const vol = Math.max(0, Math.min(1, o.volume)) * Math.max(0, 1 - Math.max(0, d - tam) / VIDEO_OIDO_M);
      if (vol > 0.001 && !quiereSonar) { quiereSonar = true; trasGesto(() => { if (quiereSonar) v.muted = false; }); }
      if (vol <= 0.001) { quiereSonar = false; v.muted = true; }
      v.volume = vol;
    },
    soltar() { v.pause(); v.removeAttribute("src"); v.load(); tex.dispose(); (m.material as THREE.Material).dispose(); m.geometry.dispose(); },
  };
}

const esferaGeo = new THREE.SphereGeometry(1, 32, 16);
export function cargarSonido(url: string, verOcultos: () => boolean): Medio {
  const a = new Audio();
  a.crossOrigin = "anonymous"; a.src = url; a.loop = true; a.preload = "auto";
  // no waiting for the file: the sphere shows at once (iPhones do not even fetch audio before a tap)
  a.addEventListener("error", () => console.warn(`[medios] no se pudo leer el sonido ${url} (${a.error?.code ?? "?"})`), { once: true });
  // FrontSide: from inside the sphere a click passes through it (to pick what is in the zone); a second, inner skin
  // (BackSide) only for the eye, never for the pointer
  const fuera = new THREE.Mesh(esferaGeo, new THREE.MeshBasicMaterial({ color: COLOR_ESFERA, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.FrontSide }));
  const dentro = new THREE.Mesh(esferaGeo, new THREE.MeshBasicMaterial({ color: COLOR_ESFERA, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.BackSide }));
  dentro.raycast = () => {};
  const grupo = new THREE.Group();
  grupo.add(fuera, dentro);
  grupo.userData.esfera = true;
  let quiere = false;
  const reproducir = () => { if (quiere) void a.play().catch(() => trasGesto(reproducir)); };
  return {
    obj: grupo,
    sonando: () => !a.paused,
    actualizar(g, oyente, o) {
      grupo.visible = !o.hidden || verOcultos();
      const r = Math.max(0.05, g.scale.x), d = oyente ? distancia(g, oyente) : Infinity;
      const vol = Math.max(0, Math.min(1, o.volume)) * (d <= r * BORDE ? 1 : d >= r ? 0 : (r - d) / (r * (1 - BORDE)));
      if (vol > 0.001) { a.volume = vol; if (!quiere) { quiere = true; reproducir(); } }
      else if (quiere) { quiere = false; a.pause(); }
    },
    soltar() { quiere = false; a.pause(); a.removeAttribute("src"); a.load(); for (const m of [fuera, dentro]) (m.material as THREE.Material).dispose(); },
  };
}
