// render: draws what it is given. Knows nothing about the network or the simulation.
// Three.js WebGPURenderer: WebGPU where the browser has it, its own WebGL2 backend elsewhere.
import * as THREE from "three/webgpu";
import { createAR, arSupported } from "./ar.ts";
export { arSupported } from "./ar.ts";
export type { ARState, JuegoAR, RayoAR } from "./ar.ts";
export { potenciaDe, ESCALA_PLAZA } from "./dardos.ts";
export type { DianaAR, Dardo3D } from "./dardos.ts";
export { pintarDiana, caraAPixel, pixelACara, PINTADA } from "./diana.ts";
import { createVR, vrSupported } from "./vr.ts";
import { crearPuestos } from "./puestos.ts";
import { crearVitrina } from "./vitrina.ts";
export type { Vitrina } from "./vitrina.ts";
export type { Donde as DondePuesto } from "./puestos.ts";
export { vrSupported } from "./vr.ts";
export type { VRState, DialogoVR } from "./vr.ts";
/** Rediseño v2: the VR session as the page wires its watch and menu (apps/plaza/xr-menu.ts). */
export type MenuVR = ReturnType<typeof createVR>;
export type { Contenido as ContenidoMenuVR } from "./menu-invocado.ts";
import type { Manos, EventoMano, Llevable, ResCambio, ResSoltar } from "./manos.ts";
export type { EventoMano, Lado, Llevable, ResCambio, ResSoltar } from "./manos.ts";
import { createPower, readCaps, checkCost, conClase } from "./power.ts";
export { createPower, readCaps, checkCost, conClase } from "./power.ts";
export { limitesGraficos } from "./capacidades.ts"; // N2: max texture size for the capabilities
export type { FrameCost } from "./power.ts";
export { leerAparato, leerBateria, medidorDeCuadros } from "./sesion.ts";
import { createCamara } from "./camara.ts";
// S5: the engine's one listener — the only place the AudioListener moves (audio/oyente.ts). Type-only here: the
// module itself is loaded lazily below, so it costs the start bundle nothing (D2, and the cap is already tight).
import type { Oyente, Camara as CamaraOyente } from "./audio/oyente.ts";
export { haciaMundo, TECLAS_CAMARA, CAMARA } from "./camara.ts";
export type { Camara, ModoCamara } from "./camara.ts";
import { crearEditor } from "./gizmo.ts";
import { cargarImagen, cargarVideo, cargarSonido, sePuedeReproducir, fijarRelojMundo, desfasesDeVideos } from "./medios.ts";
import type { Medio, ControlVideo } from "./medios.ts";
export { sePuedeReproducir } from "./medios.ts";
export type { ControlVideo } from "./medios.ts";
export type { Donde, Eje, Herramienta, Fase, Paso, Editor } from "./gizmo.ts";
export { transformarGrupo, centroGrupo } from "./grupo.ts";
import { createAvatares } from "./avatares.ts";
import { asentadoEn, nuevaMarcha, seguir, sueloDeVista } from "./avatares-politica.ts";
import type { Marcha } from "./avatares-politica.ts";
import type { SueloTerreno } from "./avatares-politica.ts";
import { prepararGltf, usarRenderer } from "./gltf.ts";
import { contarPiezas, ordenCarga, puedeEmpezar } from "./carga-orden.ts";
import type { Movimiento } from "./avatares-politica.ts";
export type { Movimiento } from "./avatares-politica.ts";
export type { CatalogoAvatares } from "./avatares.ts";
import type { CatalogoAvatares } from "./avatares.ts";
import { createNombres, NOMBRE_VISIBLE_M } from "./nombres.ts";
import { createAros } from "./aros.ts"; // ia-visible S5: a green ring on the floor under every AI (pooled, one shared geometry)
import { arosMax } from "./ia-marca.ts";
import { createOjosIA } from "./ojos-ia.ts"; // t_5096d6f4: the eyes of an AI say the size of its model (one mesh per near AI, shared geometry and material)
import { ojosMax } from "./ojos-ia-forma.ts";
import { createOrbesIA } from "./orbe-ia.ts"; // t_466efdb8: the «thinking» orb over an AI that was called and has not answered (one instanced quad for all, none on tier D)
import { orbesMax } from "./orbe-ia-forma.ts";
import { createBurbujas } from "./burbujas.ts"; // ia-llamar S9: the action bubble of every AI (4 shapes; pooled, shared geometry and materials, capped)
import { burbujasMax } from "./burbujas-politica.ts";
import { createPompas } from "./pompas.ts"; // condiciones/c5: the bubble over someone who is still reading the norms
import { elegirMirado, escalaAcotada, nombreVisible, NOMBRE_GRADOS_MAX, type Mirable } from "./carteles.ts";
export { NOMBRE_VISIBLE_M, NOMBRES_DIBUJADOS, BOCADILLO_VISIBLE_M } from "./nombres.ts";
import { crearCenital } from "./cenital.ts";
export type { Huella, ImagenCenital } from "./cenital.ts";
import { crearEntorno } from "./entorno.ts";
import { crearPuerta, TOPE_MS } from "./posproceso-politica.ts"; // H12b: pure cost gate (the passes themselves load lazily)
import type { Posproceso } from "./posproceso.ts";
import { vistaElementos } from "./elementos-vista.ts";

import { crearEspacioBasePerezoso } from "./espacio-base/cargador.ts"; // H2: the empty night world of luminous lines (a separate chunk, fetched only when a world asks)
import { crearNaturalezaPerezosa, horaDeEntorno } from "./naturaleza/cargador.ts"; // N4b: relief + trees + grass from a seed (the piece is a separate chunk, fetched only when a world asks)
import { audio } from "./audio/nucleo.ts"; // F5: the creatures sound on the shared audio core (ambient bus)
import { vistaPesca } from "./pesca-vista.ts";
import { vistaDados } from "./dados-vista.ts";
import { crearDianas3D, crearDianaAR } from "./dardos.ts";
import { crearPantallasWeb } from "./web.ts";
import { crearSalon } from "./ancestros.ts";
import type { DianaAR } from "./dardos.ts";
import { detalleAgua, LUCES_FUEGO, IMAGEN_PX } from "./calidad.ts";
import type { Nivel as NivelCalidad } from "./calidad.ts";
import { crearLotes } from "./lotes.ts";
import { crearFijados, type Fijado } from "./fijados.ts";
import { censoDeEscena, type Censo } from "./medidor-vivo.ts";
import { debeMejorar, ficheroDeNivel, nivelParaCargar } from "./lod-modelo.ts";
import { crearHitosMalla } from "./hitos-malla.ts";
import { HITOS_PLAZA, ALTO_HITO } from "./hitos-plaza.ts";
import { fundirAnimado } from "./fundir.ts";
import { congelarMatrices } from "./congelar.ts";
import { crearQuietos } from "./fundir-quietos.ts";
import { hornearEscena } from "./hornear.ts";
import type { Fundido } from "./fundir.ts";
import type { Parte } from "./lotes.ts";
import { INSTANCIAR_DESDE, INSTANCIAR_DESDE_VR, instanciarDesde, lejosDeNiebla, tapadoPorNiebla, esGrupoDeFuncion } from "./dibujo-politica.ts";
import { crearTeletransporte } from "./teletransporte.ts";
import { crearPrecompilador, calentarOcultos, ESPERA_MAX_MS } from "./precompilar.ts";
import { contarCompiles } from "./compilaciones.ts";
export { INSTANCIAR_DESDE, INSTANCIAR_DESDE_VR, instanciarDesde, lejosDeNiebla, tapadoPorNiebla } from "./dibujo-politica.ts";
export { crearMedidorVivo, lineaMedidor, lineaMedidorCorta, lineasCenso, CATEGORIAS } from "./medidor-vivo.ts"; // MIS-200 t_ee19c84b: the live frame meter and the draw-call census
export type { EntornoDatos } from "./entorno.ts";
export type { Luz } from "./teletransporte.ts";
// D-058 spike: «materia de bloques» — a shape of dice-shaped blocks that assembles and crumbles (materia.ts, materia-politica.ts)
export { crearMateria } from "./materia.ts";
export type { Materia } from "./materia.ts";
export { mezcla, muestrear, muestrearMalla, cuantos, lado, areaForma, MEZCLA, BLOQUES_PIEZA } from "./materia-politica.ts";
export type { Forma, Mezcla, Metodo, Muestra } from "./materia-politica.ts";
export type { Calidad, Nivel } from "./calidad.ts";
import { decidirLOD } from "./lod-politica.ts";
import { personaEn, type Proyectada } from "./gente-politica.ts";
import { REACCION_MS, reaccionDe } from "./reaccion.ts"; // lote 5: the hop of a clicked thing
export { decidirLOD, LOD_LEJOS_M, LOD_HISTERESIS_M } from "./lod-politica.ts";
export type { EstadoLOD } from "./lod-politica.ts";

export type Backend = "WebGPU" | "WebGL2";
/** Someone to draw. J2 (optional, additive): `y` = height of the feet in metres (0 = on the plaza), `speed` =
 * horizontal speed in m/s (≈4 walking, ≈8 running) for whoever animates avatars. */
export type Placed = { id: number; x: number; z: number; y?: number; speed?: number };
/** H1: a thing in the world (same shape as the feature plug's PlacedObject; render does not import it). Degrees, YXZ.
 * `color` (optional «#rrggbb»): the model painted in that colour (quest things: two blocks that differ). */
export type Thing = { model: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; animate: boolean; color?: string;
  /** U10 (optional): modelo (.glb, the default), imagen / video (a plane), sonido (a sphere: radius = sx); file extension; hidden while playing; volume 0-1. */
  kind?: "modelo" | "imagen" | "video" | "sonido" | "trazo"; ext?: string; hidden?: boolean; volume?: number;
  /** U11 (optional): who hears it (burbuja: inside the bubble; zona, todos: everyone, at the same volume) and a video's bubble radius (m). */
  reach?: "burbuja" | "zona" | "todos"; radius?: number;
  /** H5 (optional): the mixer group a sound or video plays in (the thing says; without it the engine picks: ambient for a bed, effects for a short sound, music for a video). */
  bus?: "musica" | "efectos" | "ambiente";
  /** N22 (optional): part of the room (pinned or backdrop), downloaded first (carga-orden.ts). */
  sala?: boolean;
  /** MIS-222 t_e41c0a12 (optional): the builder pinned it (fijado): it never moves, so its parts are merged by material with the other pinned things (fijados.ts). */
  fijo?: boolean };
/** J10: where a thing you carry goes: a hand in XR («izq»/«der»), or beside you on a flat screen («yo»). */
export type Llevar = "izq" | "der" | "yo";
/** J10: the biggest side of a thing held in a hand (m). */
export const EN_MANO_M = 0.16;
const LOADS_AT_ONCE = 4;   // H1: model files downloading at the same time; the nearest first
const ANIMATE_WITHIN_M = 40; // H1: farther than this, a model's animation stands still (cold phones)

/** T1: the graphics chip's name, read once (B3: at start, before any shader is queued; a WebGL read waits for the
 * whole GPU queue). WebGPU: the adapter's info. "" when the browser hides it. */
async function leerGpu(renderer: THREE.WebGPURenderer, backend: Backend): Promise<string> {
  try {
    const b = renderer.backend as unknown as { device?: { adapterInfo?: Record<string, string> }; gl?: WebGL2RenderingContext };
    if (backend === "WebGPU") {
      const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: Record<string, string> } | null> } };
      const info = b.device?.adapterInfo ?? (await nav.gpu?.requestAdapter())?.info;
      return info ? [info.vendor, info.architecture, info.description].filter(Boolean).join(" ").slice(0, 120) : "";
    }
    const gl = b.gl;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "").slice(0, 120);
  } catch { return ""; }
}

export async function createView(parent: HTMLElement, opts: { forceWebGL?: boolean; arMaxMs?: number; battery?: boolean; maxFps?: number; movil?: boolean; assetUrl?: (model: string) => string; lods?: (sha: string) => number; leer?: (url: string) => Promise<ArrayBuffer | null>; avatares?: { catalogo?: CatalogoAvatares; yo?: () => number; eleccion?: (clave: number | "yo") => number | undefined;
    /** habitante@1 `apariencia`: the .glb of the world (sha256, size) this other player wears INSTEAD of an avatar, or undefined. Asked every sync(). */
    cuerpoPropio?: (id: number) => { sha: string; escala: number } | undefined } } = {}) {
  // U25: `movil` = the device class a forced profile declares (?aparato, development only); undefined = read the device
  const power = createPower(conClase(readCaps(), opts.movil), { battery: opts.battery, maxFps: opts.maxFps });
  // XR on a WebGPU backend needs the session's "webgpu" feature (XRGPUBinding); Quest Browser 152 has neither (measured
  // 16-10 over USB): there a WebGPU page can never enter VR or AR. Devices that can do XR but not XR-on-WebGPU draw
  // with WebGL2 from the start (the backend cannot change later).
  const xrSinGpu = typeof (globalThis as { XRGPUBinding?: unknown }).XRGPUBinding === "undefined" && (await vrSupported() || await arSupported());
  const renderer = new THREE.WebGPURenderer({ antialias: !power.mobile, alpha: !power.mobile, /* H8: a transparent canvas lets a web screen's page show through the hole its panel punches (desktop only) */ forceWebGL: !!opts.forceWebGL || xrSinGpu, powerPreference: power.mobile ? "low-power" : "high-performance" });
  usarRenderer(renderer); // N22: KTX2 textures transcode to what this GPU takes
  await renderer.init();
  const backend: Backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
  // B3: the synchronous questions to the GPU are asked ONCE, here, while its queue is still empty. Asked later (three
  // reads the anisotropy limit on the first texture; the T1 pulse read the chip's name after the welcome) each one
  // waited for every shader compile queued before it: R6 measured 0.52 s and 0.14-0.27 s during the events load.
  const gl = (renderer.backend as unknown as { gl?: WebGL2RenderingContext }).gl;
  try { (renderer.backend as unknown as { capabilities?: { getMaxAnisotropy?(): number } }).capabilities?.getMaxAnisotropy?.(); } catch { /* WebGPU: nothing to ask */ }
  const paralelo = backend === "WebGPU" || !!gl?.getSupportedExtensions()?.includes("KHR_parallel_shader_compile"); // three takes it at init
  const gpuNombre = leerGpu(renderer, backend);
  // t_159e18d2: pipelines three links inside a drawn frame (not through compileAsync) are counted; after the loading screen each one is a late compile
  const compiles = contarCompiles((renderer as unknown as { backend: Parameters<typeof contarCompiles>[0] }).backend, undefined, () => firmaEscena());
  /** t_159e18d2: the scene's light set changed (a light made or removed: three re-keys EVERY lit material of the world). Start linking the world
   * for the new set now, off the frame (compileAsync, in parallel where the GPU can), instead of letting the next drawn frame do it. One call per tick. */
  let lucesAvisadas = 0, lucesPendiente = false;
  const camaraDeCompilar = (): THREE.Camera => (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera);
  /** The camera a headset frame is keyed by (an ArrayCamera of two eyes, RenderObject.getDynamicCacheKey hashes `cameras.length`): stand-in for compiling its variants before a session exists. */
  const ojosFalsos = new THREE.ArrayCamera([new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()]);
  /** renderer.compileAsync, but keyed the way a frame is drawn. Inside a headset session three leaves its XR target as the current render target, and compileAsync
   * then builds its render objects for THAT output context while render() draws into the internal frame-buffer target: a different context, so a different key
   * (RenderObject.getMaterialCacheKey hashes `context.id`) and the draw links everything again. With no target set, compileAsync picks the frame-buffer one too. */
  function compilarComoSeDibuja(o: THREE.Object3D, cam: THREE.Camera): Promise<void> {
    const rt = renderer.getRenderTarget();
    if (rt === null) return renderer.compileAsync(o, cam, scene);
    renderer.setRenderTarget(null);
    try { return renderer.compileAsync(o, cam, scene); } finally { renderer.setRenderTarget(rt); } // the synchronous start has already read the context
  }
  /** Every program the world can draw with the scene as it is NOW (what three re-keys when the light set, the tier or the camera changes): the visible scene with nothing
   * left out by the frustum, plus the hidden lote/pinned-cell meshes that only show while they have instances. `extra`: more roots (the headset-only stand-ins). */
  async function compilarMundo(cam: THREE.Camera, extra: THREE.Object3D[] = []): Promise<void> {
    const c = (o: THREE.Object3D) => compilarComoSeDibuja(o, cam);
    // both started before either is awaited: three reads the light set (and a light born hidden is made visible only for this call) when each compile starts
    await Promise.all([calentarOcultos([scene as never], c as never, false), calentarOcultos([lotes.raiz as never, fijados.raiz as never, ...(extra as never[])], c as never)]);
  }
  let pausaLuz = 0; // draws held back while the programs for a new light set link (see luzCambiada)
  function luzCambiada(): void {
    lucesAvisadas++;
    if (lucesPendiente) return; lucesPendiente = true;
    queueMicrotask(() => {
      lucesPendiente = false;
      // three keeps ONE render object per mesh, whatever the key: linking the new light set re-keys it, and a frame drawn meanwhile (still keyed by the old set or the new)
      // flips it back and links again. So the screen keeps its last picture until the world's programs for the new set are ready (at most ESPERA_MAX_MS).
      pausaLuz++;
      let listo: Promise<unknown>;
      try { listo = compilarMundo(camaraDeCompilar()); } catch { listo = Promise.resolve(); }
      let fin = false; const soltar = () => { if (!fin) { fin = true; pausaLuz--; } };
      void Promise.race([listo.catch(() => {}), new Promise((ok) => setTimeout(ok, ESPERA_MAX_MS))]).then(soltar);
    });
  }
  /** The scene-wide state three keys every material by (compilaciones.ts names it on each late compile). */
  function firmaEscena(): string {
    let luces = 0; scene.traverseVisible((o) => { if ((o as THREE.Light).isLight) luces++; });
    const f = scene.fog as THREE.Fog | null;
    return `nivel ${entorno.nivel} · tono ${renderer.toneMapping} · niebla ${f ? "fog" : scene.fogNode ? "nodo" : "no"} · entorno ${scene.environment ? "si" : "no"} · sombra ${sun.castShadow ? (sun.shadow.autoUpdate && sun.shadow.intensity > 0 ? "viva" : "parada") : "no"} · luces ${luces} · xr ${renderer.xr.isPresenting ? 1 : 0} · fondo ${scene.background ? "si" : "no"}`;
  }
  renderer.setPixelRatio(power.pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8e4);
  scene.fog = new THREE.Fog(0xc9d8e4, 40, 140);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 7, 10);

  const world = new THREE.Group(); // the normal world; hidden while AR shows the real one
  scene.add(world);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0xa7b89c }));
  ground.rotation.x = -Math.PI / 2;
  world.add(ground);
  const grid = new THREE.GridHelper(200, 100, 0x6f7f68, 0x8d9c86);
  grid.position.y = 0.01;
  world.add(grid);

  // landmarks: only the pillars that mean something (hitos-plaza.ts: the two the example quest names); fixed positions, no randomness
  const pillarGeo = new THREE.BoxGeometry(1, ALTO_HITO, 1);
  const hitos: THREE.Mesh[] = []; // H4: the environment may hide them (hitos: false)
  for (const h of HITOS_PLAZA) {
    const p = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color: h.color }));
    p.name = h.nombre; p.userData.proposito = h.proposito;
    p.position.set(h.x, ALTO_HITO / 2, h.z);
    world.add(p); hitos.push(p);
  }
  // J5: what the top-down map draws (cenital.ts): ground and grid as its background, the pillars as landmarks
  ground.userData.mapa = grid.userData.mapa = "suelo";
  for (const o of world.children) if (o !== ground && o !== grid) o.userData.mapa = true;

  const bodyGeo = new THREE.CapsuleGeometry(0.35, 1.0, 4, 12);
  const selfMat = new THREE.MeshStandardMaterial({ color: 0xe07a3f });
  const otherMat = new THREE.MeshStandardMaterial({ color: 0x6d7f99 });
  const selfMesh = new THREE.Mesh(bodyGeo, selfMat);
  selfMesh.visible = false;
  world.add(selfMesh);
  const others = new Map<number, THREE.Mesh>();
  const cuerposPropios = new Map<number, { marcha: Marcha }>(), sinCuerpo = new Map<number, THREE.Mesh>(); let antesPropios = -1; // habitante@1 `apariencia`: who wears a .glb of the world, and the others for the VRM pass
  // N1: the camera (mouse, keys, touch, gamepad; play and build modes) — packages/render/src/camara.ts
  const cam = createCamara(camera, renderer.domElement, { enXR: () => renderer.xr.isPresenting });
  const feet = { x: 0, y: 0, z: 0 };

  // S5: THE listener. One per page, moved from one place only (audio/oyente.ts) and from the draw loop below:
  // outside XR it follows this camera (position AND orientation — before S5 nothing followed the head); inside an
  // immersive session it follows the headset's real pose (`XRFrame.getViewerPose`), centred between the two eyes,
  // brought into world coordinates by the rig the camera hangs from. WebXR says nothing about audio: this copy is
  // entirely ours (work/motor-ar/sonido/raw/02-web-audio-y-aparatos.md §e). Measured cost: 0.21 µs/frame flat,
  // 0.43 µs in XR (≈0.004 % of a 90 Hz frame), so it runs every frame — no need to drop it to 30 Hz.
  let oyente: Oyente | null = null;
  void import("./audio/oyente.ts").then(({ crearOyente }) => {
    oyente = crearOyente({
      camara: () => camera as unknown as CamaraOyente,
      xr: {
        presentando: () => renderer.xr.isPresenting,
        fotograma: () => (renderer.xr.getFrame?.() ?? null) as never,
        espacio: () => renderer.xr.getReferenceSpace?.() ?? null,
      },
    });
  }).catch(() => { /* no listener: everything else still draws and the voice still plays, just not head-tracked */ });
  // entering and leaving an immersive session: attended at once, so the sound never lags a frame behind the eyes
  // (on leaving, the listener goes back to the flat camera).
  try {
    renderer.xr.addEventListener?.("sessionstart", () => oyente?.alEntrarXR());
    renderer.xr.addEventListener?.("sessionend", () => oyente?.alSalirXR());
  } catch { /* a renderer without those events: the loop notices the change by itself */ }

  // J10: your hands in XR (manos.ts, loaded when you enter XR: not in the start bundle). What they may reach are the
  // placed things (never while AR shows the real room). Until it arrives, `manos` keeps the page's rules and listeners.
  // three gives a session's inputs only to controller slots that already exist: make both now (cheap, core three).
  for (const i of [0, 1]) { renderer.xr.getController(i); renderer.xr.getControllerGrip(i); renderer.xr.getHand(i); }
  let manosReal: Manos | null = null, manosCarga: Promise<Manos> | null = null;
  const reglasManos: Parameters<Manos["reglas"]>[0] = {}, oyentesManos = new Set<(e: EventoMano) => void>(), ocupantesManos = new Map<string, (l: "izq" | "der") => boolean>(), llevablesManos = new Map<string, Llevable>();
  const cargarManos = () => (manosCarga ??= import("./manos.ts").then(({ createManos }) => {
    const m = createManos({
      renderer,
      *objetos() { if (ar.state !== "off") return; for (const [k, s] of things) yield [k, s.group] as [string, THREE.Object3D]; },
      *etiquetas() { if (ar.state !== "off") return; for (const [k, r] of tags) yield [k, r.s] as [string, THREE.Object3D]; },
      nota: (t) => vr.nota(t),
      paneles: () => [...vr.paneles(), ...web.paneles(), ...(dardosVRReal?.paneles() ?? [])], // N17: a web screen's «Abrir fuera de VR»; v6: the darts' scoreboard button
    });
    m.reglas(reglasManos);
    for (const [n, f] of ocupantesManos) m.ocupar(n, f);
    for (const [n, l] of llevablesManos) m.llevable(n, l);
    m.on((e) => { for (const f of oyentesManos) f(e); });
    return (manosReal = m);
  }));
  const manos = {
    cargar: cargarManos,
    raiz: () => manosReal?.raiz ?? null,
    montar: (p: THREE.Object3D | null) => manosReal?.montar(p),
    update: (c: THREE.Camera | null) => manosReal?.update(c),
    reglas(o: Parameters<Manos["reglas"]>[0]) { Object.assign(reglasManos, o); manosReal?.reglas(o); },
    /** A feature that holds a hand (a dart in it): asked live; kept until the hands module arrives. */
    ocupar(nombre: string, fn: (l: "izq" | "der") => boolean) { ocupantesManos.set(nombre, fn); return manosReal?.ocupar(nombre, fn) ?? (() => { if (ocupantesManos.get(nombre) === fn) ocupantesManos.delete(nombre); }); },
    /** Hand to hand: a held thing (rod, quest item) registers here; kept until the hands module arrives. */
    llevable(nombre: string, l: Llevable) { llevablesManos.set(nombre, l); const off = manosReal?.llevable(nombre, l); return () => { off?.(); if (llevablesManos.get(nombre) === l) llevablesManos.delete(nombre); }; },
    llevando: () => manosReal?.llevando() ?? [],
    cambiarMano: (): ResCambio => manosReal?.cambiarMano() ?? { ok: false, why: "Las manos aún no están listas" },
    /** N3: let go of what a hand carries (no hand: the first thing carried). */
    soltar: (l?: "izq" | "der"): ResSoltar => manosReal?.soltar(l) ?? { ok: false, why: "Las manos aún no están listas" },
    sondeo: (l: "izq" | "der") => manosReal?.sondeo(l) ?? null,
    ocupadaPorOtros: (l: "izq" | "der", excepto: string) => manosReal?.ocupadaPorOtros(l, excepto) ?? false,
    on(fn: (e: EventoMano) => void) { oyentesManos.add(fn); return () => oyentesManos.delete(fn); },
    ancla: (l: "izq" | "der") => manosReal?.ancla(l) ?? null,
    rayo: (l: "izq" | "der") => manosReal?.rayo(l) ?? null,
    andar: (excluida?: "izq" | "der" | null) => manosReal?.andar(excluida) ?? null,
    takeSalto: () => manosReal?.takeSalto() ?? false, // t_8d0bc2dd: both wrists flicked up
    reiniciarSalto: () => manosReal?.reiniciarSalto(),
    dirMando: (l: "izq" | "der") => manosReal?.dirMando(l) ?? null,
    muneca: (l: "izq" | "der", pos: THREE.Vector3, rot: THREE.Quaternion) => manosReal?.muneca(l, pos, rot) ?? null, // rediseño v2: the wrist watch
    punta: (l: "izq" | "der", pos: THREE.Vector3) => manosReal?.punta(l, pos) ?? false,
    vibrar: (l: "izq" | "der", v?: number, ms?: number) => manosReal?.vibrar(l, v, ms),
    entrada: (l: "izq" | "der") => manosReal?.entrada(l) ?? null,
    pincel: (l: "izq" | "der") => manosReal?.pincel(l) ?? null, // J18b: where a brush in this hand paints, and the trigger
    rayoDe: (l: "izq" | "der") => manosReal?.rayoDe(l) ?? null,
    estado: () => manosReal?.estado() ?? { izq: null, der: null },
  };
  const ar = createAR({ renderer, scene, world, domOverlayRoot: document.getElementById("hud") ?? undefined, maxMs: opts.arMaxMs, manos,
    maqueta: { // J8b: the live plaza in miniature on your table
      yo: () => selfXZ,
      *otros() { for (const m of others.values()) yield { x: m.position.x, z: m.position.z, y: m.position.y - 0.85 }; },
      hitos: () => hitos,
      *cosas() { for (const [k, s] of things) yield [k, s.want] as [string, { x: number; y: number; z: number }]; },
    } });

  const vr = createVR({ renderer, scene, camera, manos, alEntrar: () => { const ojos = renderer.xr.getCamera(); void renderer.compileAsync(scene, ojos, scene).catch(() => {}); }, ocupado: () => loading > 0 || precompilar.pendientes() > 0 }); // MIS-200: the VR extras wait for the world's loading work
  // where XR exists, the hands' code is fetched a few seconds after start, so entering VR/AR does not wait for it
  void Promise.all([vrSupported(), arSupported()]).then(([v, a]) => { if (v || a) setTimeout(() => { void cargarManos().catch(() => {}); }, 3000); });
  // MIS-200: once the hands are in and the world has stopped loading, link the programs only VR draws (rig, panels, vignette, watch, hands) while hidden,
  // so the first VR frame does not compile them (200-860 ms measured). Only where a VR session can exist; nothing is drawn.
  let vrCalentado = false; // the VR variants of the rig are linked (what only a headset draws, hidden on the desktop)
  void vrSupported().then((v) => { if (!v) return; setTimeout(async () => {
    try { await cargarManos(); } catch { /* no hands: the rest still warms */ }
    for (let i = 0; i < 60 && (loading > 0 || precompilar.pendientes() > 0); i++) await new Promise((ok) => setTimeout(ok, 500));
    // a VR frame is drawn with an ArrayCamera of two eyes, which three keys apart from the desktop camera (see precompilar.ts). Only what the desktop never
    // draws is warmed here (the rig, panels, hands: nothing else reuses their render objects). The WORLD is not: three shares one render object between the
    // desktop draw and a compile with the same output context, so a stereo/tier-B variant of the world made now would be overwritten by the next desktop
    // frame (and the desktop's own relinked): the world is linked once the session exists, behind the entry veil (calentarEntrada).
    try { await vr.calentar((o) => renderer.compileAsync(o, ojosFalsos, scene)); } catch { /* best effort */ }
    vrCalentado = true;
  }, 3500); });
  /** t_159e18d2: entering VR changes what every lit material is keyed by (tier B: no environment light, shadows stopped, baked sky, a headset's stereo camera,
   * the fire lights), so the world's programs relink. Done in a drawn frame that is a stall of up to a second inside the headset; done here, under a black veil
   * the headset keeps drawing (head tracking never stops), it is a short wait instead. The veil lifts when the world's VR variants are linked (or after VELO_MAX_MS). */
  const VELO_MAX_MS = 4000;
  const escenaVelo = new THREE.Scene(); escenaVelo.background = new THREE.Color(0x000000);
  let velo: { lanzado: boolean; t0: number; ms: number | null } | null = null, ultimoVelo: { ms: number; agotado: boolean } | null = null;
  try { renderer.xr.addEventListener?.("sessionstart", () => { velo = { lanzado: false, t0: performance.now(), ms: null }; }); renderer.xr.addEventListener?.("sessionend", () => { velo = null; }); } catch { /* no events: no veil */ }
  /** What only a headset draws as instances (copies from INSTANCIAR_DESDE_VR on, the pillars, the pinned cells): their meshes do not exist or are hidden on the desktop. */
  function instanciasSoloVR(): THREE.Group {
    const modelos = new Set<string>(), standIns = new THREE.Group();
    for (const t of things.values()) {
      if (!t.partes || t.mixer || t.model.startsWith("~") || modelos.has(t.model) || copiasDe(t.model) < INSTANCIAR_DESDE_VR) continue;
      modelos.add(t.model);
      for (const q of t.partes) { const im = new THREE.InstancedMesh(q.geo, q.mat, 1); im.castShadow = q.sombra && !q.sinSombra; im.receiveShadow = !q.sinSombra; if (q.sinSombra) im.userData.sinSombra = true; standIns.add(im); }
    }
    return standIns;
  }
  async function calentarEntrada(): Promise<void> {
    await vr.calentar((o) => compilarComoSeDibuja(o, renderer.xr.getCamera()));
    await compilarMundo(renderer.xr.getCamera(), [instanciasSoloVR()]);
  }
  function iniciarVelo(v: NonNullable<typeof velo>): void {
    v.lanzado = true;
    let fin = false;
    const levantar = (agotado: boolean) => { if (fin) return; fin = true; v.ms = Math.round(performance.now() - v.t0); ultimoVelo = { ms: v.ms, agotado }; if (velo === v) velo = null; };
    const tope = setTimeout(() => levantar(true), VELO_MAX_MS);
    void calentarEntrada().catch(() => {}).then(() => { clearTimeout(tope); levantar(false); });
  }
  const cenital = crearCenital(renderer, scene, world, backend); // J5: the zone from above (big map) and its footprints
  let selfXZ: { x: number; z: number; y?: number } | null = null;
  // J1: you and the nearest players as VRM humanoids (avatares.ts); the capsules above stay as their anchors
  // N1b: the solid boxes in metres (view.solidos): the camera does not go through them, avatars stand on them
  let cajasM: ArrayLike<number> = [], cajasFx: Int32Array | null = null;
  let sueloT: SueloTerreno | null = null; // a world with relieve: the ground the simulation walks on (view.sueloTerreno); null = the plaza and the boxes
  const avs = createAvatares({ world, mobile: power.mobile, xr: () => renderer.xr.isPresenting, catalogo: opts.avatares?.catalogo, yo: opts.avatares?.yo, compilar: (o) => renderer.compileAsync(o, camera, scene),
    suelo: sueloDeVista(() => cajasM, () => sueloT),
    asentar: (x, z, y) => { const dib = sueloT && naturaleza.terreno?.alturaDibujadaEn; return dib ? asentadoEn(sueloT!, dib, x, z, y) : 0; }, eleccion: opts.avatares?.eleccion });
  // H4 + H12: sky, sun, light, fog, wind and ground come from data (features/entorno), quality from the device tier
  const entorno = crearEntorno({ renderer, scene, world, camera, hemi, sun, ground, grid, hitos, aparato: { mobile: power.mobile, deviceMemoryGB: readCaps().deviceMemoryGB, saveData: readCaps().saveData }, foco: () => selfXZ,
    fichero: (f) => { const i = f.lastIndexOf("."); return (opts.assetUrl ?? ((m: string) => `/a/${m}.glb`))(f.slice(0, i)).replace(/\.glb$/, f.slice(i)); } });
  const elementos = vistaElementos({ renderer, scene, world, camera, entorno, luzCambiada }); // H4/H8: water, fire, smoke, dust (lazy)
  const tele = crearTeletransporte({ world, nivel: () => entorno.nivel }); // N16: the light of a trip (none on tier D)

  const yoNat = { x: 0, y: 0, z: 0 }; // F4 audit: one object reused every frame (the nature reads it at once)
  const naturaleza = crearNaturalezaPerezosa({ padre: world, ground, vientoU: entorno.vientoU, nivel: () => entorno.nivel, camara: camera, yo: () => (selfXZ ? (yoNat.x = selfXZ.x, yoNat.y = selfXZ.y ?? 0, yoNat.z = selfXZ.z, yoNat) : null), niebla: () => (scene.fog instanceof THREE.Fog ? scene.fog.color.getHex() : 0xc9d8e4), aguaLuz: entorno.aguaLuz, detalleAgua: () => detalleAgua(entorno.nivel, entorno.calidadActual.agua), hora: () => horaDeEntorno(entorno.datos), nucleo: audio, hitos: () => hitos, atmosfera: entorno.atmosfera }); // R7.1 atmosphere; N4 + F4 + F5 (creature sound on the audio core's ambient bus) (hour of day for the fauna)
  const espacioBase = crearEspacioBasePerezoso({ padre: world, ground, nivel: () => entorno.nivel, dia: entorno.diaU, hitos: () => hitos, atmosfera: entorno.atmosfera }); // H2: builds nothing until a world brings espacio-base.json


  // feature decorations (J7): a text label over an avatar and a short bounce; both expire on their own
  type Target = number | "self";
  const labels = new Map<Target, { mesh: THREE.Mesh; until: number }>();
  const bounces = new Map<Target, number>(); // target -> until (ms)
  const reacciones = new Map<string, number>(); // lote 5: placed thing key -> when its little hop started (ms); see reaccion.ts
  const labelGeo = new THREE.PlaneGeometry(1.6, 0.4);
  const meshOf = (t: Target): THREE.Mesh | undefined => (t === "self" ? (selfMesh.visible ? selfMesh : undefined) : others.get(t));
  const nombres = createNombres({ world, camera, avatarOf: meshOf }); // J3: names over heads and speech bubbles
  const aros = createAros({ world, avatarOf: (t) => meshOf(t), camera, max: () => arosMax(power.mobile) }); // ia-visible S5: nothing is made until the first AI
  const ojosIA = createOjosIA({ world, cuerpo: (t) => meshOf(t), visible: (t) => (t === "self" ? selfMat.visible : true), cabeza: (t, out) => avs.cabeza(t === "self" ? "yo" : t, out), rumbo: (t) => avs.rumbo(t === "self" ? "yo" : t), camera, max: () => ojosMax(power.mobile) });
  const orbesIA = createOrbesIA({ world, cuerpo: (t) => meshOf(t), visible: (t) => (t === "self" ? selfMat.visible : true), encima: (t, c) => nombres.above(t, c), camera, max: () => orbesMax(power.mobile), nivel: () => entorno.nivel });
  const burbujas = createBurbujas({ world, avatarOf: (t) => meshOf(t), yo: () => selfXZ ? { x: selfXZ.x, y: selfXZ.y ?? 0, z: selfXZ.z } : null, max: () => burbujasMax(power.mobile, renderer.xr.isPresenting) }); // ia-llamar S9: nothing is made until the first AI
  const pompas = createPompas({ world, avatarOf: (t) => meshOf(t) }); // condiciones/c5: a bubble around whoever is reading the norms (one shared sphere)
  // pesca v1: rods, lines and floats of whoever fishes near (lazy: packages/render/src/pesca.ts). "self" hides in first person, so the rod uses the capsule's place anyway
  const pesca = vistaPesca({ world, posicionDe: (t) => (t === "self" ? selfMesh.position : others.get(t)?.position) ?? null,
    manoDe: (t, out) => avs.mano(t === "self" ? "yo" : t, "derecha", out), orientar: (t, rumbo) => avs.orientar(t === "self" ? "yo" : t, rumbo),
    agua: { luz: entorno.aguaLuz, detalle: () => detalleAgua(entorno.nivel, entorno.calidadActual.agua) } }); // N2: the pond's water follows the tier
  const dados3d = vistaDados({ world, permitido: () => !power.mobile && !renderer.xr.isPresenting }); // lote 8 (mesa): 3D dice falling into a tower's tray — PC only for now (lazy: dados-3d.ts)
  const dardos = crearDianas3D({ world }); // dardos v1: the boards near you and the darts in them (dardos.ts)
  // N18: what people wear (features/bienes): a good's model in the right hand or on the head, on the VRM's bone or the capsule
  const plantillasPuestos = new Map<string, Promise<THREE.Object3D>>();
  const puestos = crearPuestos({ world,
    cargar: (model) => {
      let t = plantillasPuestos.get(model);
      if (!t) { t = getTools().then(async (h) => (await h.load(assetUrl(model))).scene as THREE.Object3D); plantillasPuestos.set(model, t); t.catch(() => plantillasPuestos.delete(model)); }
      return t.then(async (raiz) => (await getTools()).clone(raiz));
    },
    cuerpo: (q) => (q === "self" ? (selfMesh.visible ? selfMesh : null) : others.get(q) ?? null),
    visible: (q) => (q === "self" ? selfMat.visible : true),
    hueso: (q, donde, out) => (donde === "mano" ? avs.mano(q === "self" ? "yo" : q, "derecha", out) : avs.cabeza(q === "self" ? "yo" : q, out)),
    rumbo: (q) => avs.rumbo(q === "self" ? "yo" : q) });
  const web = crearPantallasWeb({ world, camera, enXR: () => renderer.xr.isPresenting, cajas: () => cajasM, agujero: () => !power.mobile && !ppVivo && !!matchMedia?.("(pointer: fine)").matches, lienzo: renderer.domElement }); // N17: web screens (web.ts); H8: hole-punch on a desktop
  // M18b: the Graboso, the relic that records, over your right shoulder (lazy: packages/render/src/graboso.ts, fetched at the first invocation)
  const grabosoPos = new THREE.Vector3();
  let graboso3d: import("./graboso.ts").Graboso3D | null = null, grabosoCarga: Promise<void> | null = null;
  const grabosoQuiere = { fuera: false, grabando: false };
  const graboso = {
    /** Out (true) or kept (false). The first call downloads the mesh's code. */
    mostrar(si: boolean): void {
      grabosoQuiere.fuera = si;
      if (graboso3d) { graboso3d.mostrar(si); return; }
      if (!si) return;
      grabosoCarga ??= import("./graboso.ts").then((m) => {
        graboso3d = m.crearGraboso({ world, posicion: () => (selfXZ ? grabosoPos.set(selfXZ.x, selfXZ.y ?? 0, selfXZ.z) : null), yaw: () => cam.yaw(),
          modelo: async (sha) => (await (await getTools()).load(assetUrl(sha))).scene as THREE.Object3D }); // MIS-247: the fine head, by its content
        graboso3d.mostrar(grabosoQuiere.fuera); graboso3d.grabando(grabosoQuiere.grabando);
      }).catch((e) => console.warn(`[graboso] no se pudo cargar: ${(e as Error)?.message ?? e}`));
    },
    grabando(si: boolean): void { grabosoQuiere.grabando = si; graboso3d?.grabando(si); },
    visible(): boolean { return graboso3d?.visible() ?? false; },
    /** MIS-247: which head is on («fina» = the GLB, «sencilla» = the fallback; «ninguna» = the relic's code has not loaded yet). */
    cabeza(): "fina" | "sencilla" | "ninguna" { return graboso3d?.cabeza() ?? "ninguna"; },
  };
  const ancestros = crearSalon({ world, camara: () => (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera), luz: () => LUCES_FUEGO[entorno.nivel] > 0, luzCambiada }); // ancestros v1: the hall and the hologram of the tribute to Asimov (ancestros.ts)
  function dropLabel(t: Target): void {
    const d = labels.get(t);
    if (!d) return;
    world.remove(d.mesh);
    const mat = d.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose(); mat.dispose();
    labels.delete(t);
  }
  // N4: the rod in your real hand in VR, and the gauge facing the camera that draws
  pesca.conManos({ ancla: (l) => (renderer.xr.isPresenting && vr.active ? manos.ancla(l) : null), camara: () => (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera), xr: () => renderer.xr.isPresenting });

  // dardos in VR (packages/render/src/dardos-vr.ts): the dart in your hand, flying and falling; lazy, fetched by the page only on a VR-capable device
  let dardosVRReal: import("./dardos-vr.ts").DardosVR | null = null, dardosVRCarga: Promise<import("./dardos-vr.ts").DardosVR> | null = null;
  const dardosVR = {
    cargar: () => (dardosVRCarga ??= import("./dardos-vr.ts").then((m) => (dardosVRReal = m.crearDardosVR({ world, ancla: (l) => manos.ancla(l), suelo: () => selfXZ?.y ?? 0, una: dardos.una, apunta: (l) => manosReal?.dirRayo(l) ?? null })))),
    actualizar: (dt: number) => dardosVRReal?.actualizar(dt),
    real: () => dardosVRReal,
    contar: () => dardosVRReal?.contar() ?? null,
  };

  // painting in VR (J18b story 4): the stroke being painted, live under the hand (packages/render/src/trazo-vivo.ts; lazy, fetched by the page's pintar-vr.ts
  // only on a VR-capable device). `cadaCuadro` is the page's per-frame reader (after the hands moved); then the live tube uploads what changed.
  let trazoVivoReal: import("./trazo-vivo.ts").TrazoVivo | null = null, trazoVivoCarga: Promise<import("./trazo-vivo.ts").TrazoVivo> | null = null;
  const cuadrosPincel = new Set<(dt: number) => void>();
  const pincelVR = {
    cargar: () => (trazoVivoCarga ??= import("./trazo-vivo.ts").then((m) => (trazoVivoReal = m.crearTrazoVivo({ world })))),
    cadaCuadro(fn: (dt: number) => void): () => void { cuadrosPincel.add(fn); return () => cuadrosPincel.delete(fn); },
    actualizar(dt: number): void { for (const f of cuadrosPincel) { try { f(dt); } catch (e) { console.warn("[pincel]", e); } } trazoVivoReal?.actualizar(); },
    real: () => trazoVivoReal,
    contar: () => trazoVivoReal?.contar() ?? null,
  };

  // beacons (R1): a column of light with a text at a world point; expires on its own
  const beacons: { group: THREE.Group; until: number }[] = [];
  const beaconGeo = new THREE.CylinderGeometry(0.6, 0.6, 40, 16, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  function dropBeacon(b: { group: THREE.Group }): void {
    world.remove(b.group);
    for (const ch of b.group.children) { const m = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial; if (m !== beaconMat) { m.map?.dispose(); m.dispose(); } }
  }
  // J5: waypoints («Marcar destino» on the map): the same column, kept until dropped; busy() ignores them (cool phones)
  const waypoints = new Map<number, { group: THREE.Group; until: number }>();
  let waypointSeq = 0;
  function updateDecorations(now: number): void {
    for (const w of waypoints.values()) w.group.children[1].quaternion.copy(camera.quaternion);
    for (let i = beacons.length - 1; i >= 0; i--) {
      const b = beacons[i];
      if (now > b.until) { dropBeacon(b); beacons.splice(i, 1); } else b.group.children[1].quaternion.copy(camera.quaternion);
    }
    for (const [t, d] of labels) {
      const m = meshOf(t);
      if (!m || now > d.until) { dropLabel(t); continue; }
      d.mesh.position.set(m.position.x, nombres.above(t, m), m.position.z); // over the name and the bubble, if any (J3)
      d.mesh.quaternion.copy(camera.quaternion); // always faces whoever looks
    }
    updateRotulos(now);
    pompas.update(now);
    aros.update();
    ojosIA.update(); // after the avatars moved (the VRM's head follows its capsule)
    orbesIA.update(now); // after the plates are placed: it floats over the name
    burbujas.update(now);
  }

  // ---- U22: who shows a name. The one in the middle of your view (a person, or a name over a thing), whoever speaks,
  // everybody while `verTodos` is held (Alt, a touch button, a gamepad button). 
  // Size: a plate never takes more than 8° of the view (carteles.ts), so near the person it shrinks instead of filling the screen.
  let verTodos = false, hablando: string | null = null, miradoPrevio: string | null = null, rotulosPendiente = true;
  const ojoC = new THREE.Vector3(), alanteC = new THREE.Vector3(), qC = new THREE.Quaternion();
  function updateRotulos(now: number): void {
    rotulosPendiente = false;
    camera.getWorldPosition(ojoC); camera.getWorldQuaternion(qC); alanteC.set(0, 0, -1).applyQuaternion(qC);
    const cand: Mirable<string>[] = nombres.candidatos().map((c) => ({ ...c, clave: `a:${String(c.clave)}` }));
    for (const [k, r] of tags) cand.push({ clave: `t:${k}`, x: r.x, z: r.z, pies: r.y - 2.2, cabeza: r.y });
    const mirado = verTodos ? null : elegirMirado(ojoC, alanteC, cand, miradoPrevio, NOMBRE_VISIBLE_M);
    miradoPrevio = mirado;
    nombres.update(now, { todos: verTodos, mirado: mirado?.startsWith("a:") ? (mirado.slice(2) === "self" ? "self" : Number(mirado.slice(2))) : null });
    const alto = ROT_NOMBRE * ROT_M;
    for (const [k, r] of tags) {
      const d = Math.hypot(r.x - ojoC.x, r.y - ojoC.y, r.z - ojoC.z);
      r.s.visible = nombreVisible({ todos: verTodos && d <= NOMBRE_VISIBLE_M, mirado: mirado === `t:${k}`, habla: hablando === k }); // (a «!» / «✓» mark does not keep the plate on: the story asks for the one you look at and who speaks)
      if (!r.s.visible) continue;
      const e = escalaAcotada(1, alto, d, NOMBRE_GRADOS_MAX); // whole plate (mark, trade) shrinks with its name line
      r.s.scale.set(ROT_ANCHO * ROT_M * e, r.s.userData.alto * e, 1);
    }
  }

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---- H1: things placed in the world (features/objetos): a model by its sha256, loaded once per file and cloned,
  // the nearest first, never more than LOADS_AT_ONCE downloads at a time ----
  type Gltf = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  type Pieza = { geo: THREE.BufferGeometry; mat: THREE.Material; sombra: boolean; sinSombra?: boolean };
  type Slot = { group: THREE.Group; want: Thing; model: string; loaded: boolean; failed: boolean; mixer?: THREE.AnimationMixer; medio?: Medio; color?: string; horneado?: boolean;
    /** N12: the baked parts (copies of one model share them: a lote draws them), and a sphere round the group's origin that holds the model (m, before scale). */
    partes?: Parte[]; radio?: number;
    /** J14: a baked figure's two LODs (cerca = its baked parts, lejos = one piece) */
    piezaCerca?: Pieza[]; piezaLejos?: Pieza; lod?: "cerca" | "lejos";
    /** B3: set while this copy's shaders are being prepared (precompilar.ts); a new model or pose for the slot drops it. */
    preparando?: object;
    /** H13: the level of detail this copy was loaded from (0/undefined = the whole model), and set while the whole model loads to replace it. */
    nivel?: number; mejorando?: boolean; sinNivel?: boolean;
    /** The longest side (px) this picture's texture was capped at when it loaded (calidad.ts IMAGEN_PX of the tier then). */
    imgPx?: number };
  const esferaTmp = new THREE.Sphere();
  /** N12: the radius (m, before the copy's scale) of a sphere round the origin that holds `o`, a copy not yet in the world. */
  const radioDe = (o: THREE.Object3D): number => { o.updateMatrixWorld(true); tmpBox.setFromObject(o); if (tmpBox.isEmpty()) return 1; tmpBox.getBoundingSphere(esferaTmp); return esferaTmp.center.length() + esferaTmp.radius; };
  let verOcultos = false; // U10: while building, hidden spheres of sound are drawn
  const fichero = (t: Thing) => `${t.model}.${t.kind && t.kind !== "modelo" ? t.ext ?? "glb" : "glb"}`; // what a slot draws
  /** A thing painted in its `color` (materials cloned once per copy; "" puts the model's own back). */
  function pintar(s: Slot): void {
    const c = s.want.color ?? "";
    if (!s.loaded || s.color === c) return;
    s.color = c;
    s.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const propio = (m.userData.propio ??= m.material) as THREE.Material;
      if (!c) { m.material = propio; return; }
      const nuevo = (Array.isArray(propio) ? propio[0] : propio).clone() as THREE.MeshStandardMaterial;
      if (nuevo.color) nuevo.color.set(c);
      if (m.userData.fundido?.colores) nuevo.vertexColors = false; // N15: its colours live in the vertices; painted, one colour
      if ("map" in nuevo) nuevo.map = null;
      m.material = nuevo;
    });
  }
  // J10: things you carry: in a hand in XR, beside you on a flat screen; back to their place when let go
  const llevados = new Map<string, Llevar>();
  const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3();
  function soltarLlevado(k: string): void {
    const s = things.get(k);
    llevados.delete(k);
    if (!s) return;
    if (s.group.parent !== world) world.add(s.group);
    placeGroup(s);
  }
  function colocarLlevados(): void {
    let i = 0;
    for (const [k, donde] of llevados) {
      const s = things.get(k);
      if (!s) continue;
      const ancla = donde !== "yo" && renderer.xr.isPresenting ? manos.ancla(donde) : null;
      if (ancla) {
        if (s.group.parent !== ancla) {
          ancla.add(s.group);
          s.group.position.set(0, 0, 0); s.group.rotation.set(0, 0, 0); s.group.scale.set(s.want.sx, s.want.sy, s.want.sz);
          s.group.updateMatrixWorld(true);
          tmpBox.setFromObject(s.group); const lado = Math.max(...tmpBox.getSize(tmpV).toArray()) || 1;
          const anclaEscala = ancla.getWorldScale(tmpV).x || 1;
          s.group.scale.multiplyScalar(Math.min(1, EN_MANO_M / lado) / anclaEscala);
          tmpBox.setFromObject(s.group); tmpBox.getCenter(tmpV); s.group.position.copy(ancla.worldToLocal(tmpV)).negate(); // centred in the hand
        }
        continue;
      }
      // flat screen (or that hand is not here): beside your avatar at hand height, one each side
      if (s.group.parent !== world) { world.add(s.group); s.group.rotation.set(0, 0, 0); s.group.scale.set(s.want.sx * 0.6, s.want.sy * 0.6, s.want.sz * 0.6); }
      if (!selfXZ) continue;
      const lado = i++ % 2 === 0 ? 1 : -1, yaw = cam.yaw();
      s.group.position.set(selfXZ.x + Math.cos(yaw) * 0.55 * lado, (selfXZ.y ?? 0) + 0.9, selfXZ.z - Math.sin(yaw) * 0.55 * lado);
    }
  }
  const assetUrl = opts.assetUrl ?? ((m: string) => `/a/${m}.glb`);
  // the glTF loader (~26 kB gz) arrives only when the first thing does: a world without things never downloads it
  type Merge = (gs: THREE.BufferGeometry[]) => THREE.BufferGeometry | null;
  type Tools = { load: (url: string) => Promise<Gltf>; clone: (o: THREE.Object3D) => THREE.Object3D; merge: Merge };
  let tools: Promise<Tools> | null = null;
  const getTools = () => (tools ??= Promise.all([import("three/addons/loaders/GLTFLoader.js"), import("three/addons/utils/SkeletonUtils.js"), import("three/addons/utils/BufferGeometryUtils.js")])
    .then(async ([g, u, b]) => { const l = await prepararGltf(new g.GLTFLoader()); return { load: async (url: string) => { const b = opts.leer ? await opts.leer(url) : null; return (b ? l.parseAsync(b, "") : l.loadAsync(url)) as unknown as Promise<Gltf>; }, // M16: bytes the page already holds by hash (apps/plaza/manifiesto.ts), checked against the manifest; else the loader fetches
       clone: (o: THREE.Object3D) => u.clone(o as never) as unknown as THREE.Object3D, merge: (gs) => b.mergeGeometries(gs as never) as unknown as THREE.BufferGeometry | null }; }));
  // A model that does not animate (people of the world, quest things) is baked ONCE per file into one mesh per
  // material, in the pose it comes in: the house robot goes from 19 draw calls to 3. Copies share the geometry.
  const horneados = new Map<string, Pieza[] | null>();
  function hornear(model: string, raiz: THREE.Object3D, merge: Merge): Pieza[] | null {
    if (horneados.has(model)) return horneados.get(model)!;
    let out: Pieza[] | null = null;
    try { out = hornearEscena(raiz, merge); } catch (err) { console.warn(`[objetos] no pude hornear ${model}:`, err); out = null; } // E5: hornear.ts (positions as floats first)
    horneados.set(model, out);
    return out;
  }
  // N12: a model drawn whole (not baked) but that never moves inside (no clips, no skin, plain meshes): its parts as
  // they sit in the file, so its copies can be drawn instanced too (lotes.ts). null = it cannot (it animates or has
  // something an instanced mesh does not draw the same: skins, several materials on one mesh, lines, points, sprites).
  const enteros = new Map<string, Parte[] | null>();
  function partesEnteras(model: string, g: Gltf): Parte[] | null {
    if (enteros.has(model)) return enteros.get(model)!;
    let out: Parte[] | null = g.animations.length ? null : [];
    if (out) {
      g.scene.updateMatrixWorld(true);
      const inv = g.scene.parent ? g.scene.parent.matrixWorld.clone().invert() : new THREE.Matrix4(); // a copy carries the root's own transform too
      g.scene.traverseVisible((o) => {
        if (!out) return;
        const m = o as THREE.Mesh;
        if ((o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || (m.isMesh && ((m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material) || m.morphTargetInfluences?.length))) { out = null; return; }
        if (m.isMesh) out.push({ geo: m.geometry, mat: m.material as THREE.Material, sombra: m.castShadow, sinSombra: !!m.userData.sinSombra || undefined, rel: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
      });
      if (out && !(out as Parte[]).length) out = null;
    }
    enteros.set(model, out);
    return out;
  }
  // N15: a model that animates is fused ONCE per file (fundir.ts): one skinned mesh per look sharing one skeleton, so
  // each copy costs 1-3 draw calls instead of one per piece (the house robot: 19 -> 1). Looks and moves the same.
  const quietoDe = crearQuietos(); // E2: one without clips, one mesh per look (fundir-quietos.ts)
  const fundidos = new Map<string, Fundido | null>();
  function fundido(model: string, g: Gltf, clone: Tools["clone"]): Fundido | null {
    if (fundidos.has(model)) return fundidos.get(model)!;
    let f: Fundido | null = null;
    try { f = g.animations.length ? fundirAnimado(clone(g.scene), g.animations) : null; } catch (err) { console.warn(`[objetos] no pude fundir ${model}:`, err); f = null; }
    fundidos.set(model, f);
    return f;
  }
  // J14: farther than LOD_LEJOS_M, a baked figure drops to ONE piece (one draw call, one flat-shaded colour
  // per baked part, no texture): the house robot goes 3 -> 1 while it is far enough not to show the loss.
  // Reuses hornear()'s parts (already in the model's local space) instead of walking the glTF again.
  const horneadosPieza = new Map<string, Pieza | null>();
  function hornearPieza(model: string, partes: Pieza[] | null, merge: Merge): Pieza | null {
    if (horneadosPieza.has(model)) return horneadosPieza.get(model)!;
    let out: Pieza | null = null;
    if (partes && partes.length) {
      try {
        const coloreadas = partes.map(({ geo, mat }) => {
          const g = geo.clone();
          g.deleteAttribute("uv"); // one flat colour per part: no texture to sample
          const base = (Array.isArray(mat) ? mat[0] : mat) as THREE.MeshStandardMaterial;
          const c = base.color ?? new THREE.Color(0xffffff);
          const n = g.attributes.position.count, col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
          g.setAttribute("color", new THREE.BufferAttribute(col, 3));
          return g;
        });
        const geo = coloreadas.length === 1 ? coloreadas[0] : merge(coloreadas);
        if (geo) {
          geo.computeBoundingSphere(); geo.computeBoundingBox();
          out = { geo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), sombra: partes.some((p) => p.sombra), sinSombra: partes.every((p) => p.sinSombra) || undefined };
        }
      } catch (err) { console.warn(`[objetos] no pude hornear en una pieza ${model}:`, err); out = null; }
    }
    horneadosPieza.set(model, out);
    return out;
  }
  /** Builds the Object3D a Slot shows for a set of baked parts (one Mesh each, sharing geometry across copies). */
  function representacion(piezas: Pieza[]): THREE.Object3D {
    const g = new THREE.Group();
    for (const p of piezas) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = p.sombra; if (p.sinSombra) m.userData.sinSombra = true; g.add(m); }
    return g;
  }
  /** J14: a baked figure beyond LOD_LEJOS_M shows its one-piece LOD; up close, its baked parts. Hysteresis
   * (lod-politica.ts) stops it flipping at the edge of the band. Called once per frame per baked thing. */
  function actualizarLOD(s: Slot): void {
    if (!s.piezaLejos || !s.piezaCerca) return;
    const d = selfXZ ? Math.sqrt(distance2(s)) : 0;
    const nuevo = s.want.color ? "cerca" : decidirLOD(d, s.lod); // a thing coloured after loading: back to its baked parts, the only ones pintar() can tint
    if (nuevo === s.lod) return;
    s.lod = nuevo;
    s.group.clear();
    s.group.add(representacion(nuevo === "lejos" ? [s.piezaLejos] : s.piezaCerca));
  }
  const files = new Map<string, Promise<{ g: Gltf; clone: Tools["clone"]; merge: Merge }>>(); // model -> its parsed file, shared by every copy
  // B3: shaders ready before a model shows (precompilar.ts): batches through compileAsync, in parallel where the GPU can
  // C: a model's textures go to the GPU here too, in the same task as its shaders and before it is shown — the first draw
  // of a model then neither uploads nor decodes anything, and the loading screen's «ready» means textured, not just parsed.
  const texturasSubidas = new WeakSet<THREE.Texture>();
  function subirTexturas(raiz: THREE.Object3D): void {
    raiz.traverse((x) => {
      const m = (x as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) for (const v of Object.values(mat)) {
        const t = v as THREE.Texture | null;
        if (!t || !(t as { isTexture?: boolean }).isTexture || texturasSubidas.has(t) || (t as { isVideoTexture?: boolean }).isVideoTexture) continue;
        texturasSubidas.add(t);
        try { renderer.initTexture(t); } catch { /* a texture that cannot be pre-uploaded is uploaded by its first draw, as before */ }
      }
    });
  }
  const precompilar = crearPrecompilador({ compilar: (g) => { subirTexturas(g as unknown as THREE.Object3D); return compilarComoSeDibuja(g as unknown as THREE.Object3D, camaraDeCompilar()); }, grupo: () => new THREE.Group() as never, paralelo: () => paralelo }); // in a headset the frame is stereo: the stereo camera keys it
  /** t_159e18d2: the world's own feature groups (fishing spot, effect elements, the Ancestors' hologram and panels) are not things: nothing prepared their
   * programs, so each piece linked inside the first frame that drew it (the hologram, the water, the rod: 18 late links measured). A group that gained
   * pieces is hidden for the few frames its programs take to link (compileAsync), then shown. */
  const piezasDeGrupo = new WeakMap<THREE.Object3D, number>();
  function vigilarGrupo(c: THREE.Object3D): void {
    let n = 0; c.traverse(() => { n++; });
    if (piezasDeGrupo.get(c) === n) return;
    piezasDeGrupo.set(c, n);
    c.visible = false;
    const sinCulling: [THREE.Object3D, boolean][] = [];
    c.traverse((x) => { if (x.frustumCulled) { sinCulling.push([x, true]); x.frustumCulled = false; } }); // what is behind the camera must be linked too
    const listo: Promise<unknown>[] = [];
    try {
      subirTexturas(c);
      listo.push(compilarComoSeDibuja(c, camaraDeCompilar()));
    } catch { /* a lost device: show it anyway */ }
    for (const [x] of sinCulling) x.frustumCulled = true;
    const mostrar = () => { if (piezasDeGrupo.get(c) !== undefined) c.visible = true; };
    void Promise.race([Promise.all(listo.map((p) => Promise.resolve(p).catch(() => {}))), new Promise((ok) => setTimeout(ok, ESPERA_MAX_MS))]).then(mostrar);
  }
  const instanciasPreparadas = new Set<string>();
  let xrPosible = false; // a headset can present here: its lotes start at INSTANCIAR_DESDE_VR, so those programs are warmed too
  void vrSupported().then((v) => { xrPosible = v; }, () => {});
  const copiasDe = (model: string) => { let n = 0; for (const t of things.values()) if (t.model === model) n++; return n; };
  const sombrasPuestas = () => sun.castShadow && sun.shadow.autoUpdate;
  const things = new Map<string, Slot>();
  const waiting = new Set<string>();
  let loading = 0, animatingNear = false;
  const RAD = Math.PI / 180;
  const distance2 = (s: Slot) => (selfXZ ? (s.want.x - selfXZ.x) ** 2 + (s.want.z - selfXZ.z) ** 2 : 0);
  function placeGroup(s: Slot): void {
    const w = s.want;
    s.group.position.set(w.x, w.y, w.z);
    s.group.rotation.set(w.rx * RAD, w.ry * RAD, w.rz * RAD, "YXZ");
    s.group.scale.set(w.sx, w.sy, w.sz);
    if (!s.medio && s.want.kind !== "sonido" && s.want.kind !== "video") s.group.visible = !w.hidden || verOcultos; // D-041: a hidden model is not drawn while playing (medios.ts does it for sound and video)
  }
  // N22: the room first (pinned/backdrop things: the hall you stand in), then the nearest; what is far (LEJOS_M) waits
  // until nothing near is still downloading, so it never takes the phone's bandwidth from what you see (carga-orden.ts)
  let cercaCargando = 0, pumpPedido = false;
  /** N22: one pump after every thing of a message is placed (a world's welcome places them all at once), so the first
   * four downloads are the right four, not the first four keys. */
  function pumpPronto(): void { if (pumpPedido) return; pumpPedido = true; queueMicrotask(() => { pumpPedido = false; pumpLoads(); }); }
  function pumpLoads(): void {
    while (loading < LOADS_AT_ONCE && waiting.size) {
      let best = "", bestO = Infinity, bestD = Infinity, quedanCerca = false;
      for (const k of waiting) {
        const s = things.get(k);
        if (!s) { best = k; bestO = -1; break; } // gone: dropped below
        const d = distance2(s), o = ordenCarga(s.want, d);
        if (o < 2) quedanCerca = true;
        if (o < bestO || (o === bestO && d < bestD)) { bestO = o; bestD = d; best = k; }
      }
      if (bestO >= 2 && !puedeEmpezar(cercaCargando, quedanCerca)) return; // far: after the near ones (a finished load pumps again)
      waiting.delete(best);
      const s = things.get(best);
      if (!s) continue;
      const cerca = bestO < 2;
      const model = s.model;
      if (s.want.kind && s.want.kind !== "modelo") { cargarMedio(best, s, cerca); continue; }
      // H13: a still thing that is far when its turn comes loads a lighter level of the model (if the server made one); `clave`
      // names that file everywhere a model's file is the key (parsed file, baked parts, instanced stand-ins). `model` stays the thing's own.
      const nivel = s.want.animate || s.sinNivel ? 0 : nivelParaCargar(selfXZ ? Math.sqrt(distance2(s)) : null, opts.lods?.(model.replace(/\.glb$/, "")) ?? 0);
      s.nivel = nivel;
      const clave = ficheroDeNivel(model, nivel);
      let file = files.get(clave);
      if (!file) { file = getTools().then(async (t) => ({ g: await t.load(assetUrl(clave.replace(/\.glb$/, ""))), clone: t.clone, merge: t.merge })); files.set(clave, file); }
      loading++; if (cerca) cercaCargando++;
      file.then(({ g, clone, merge }) => {
        const now = things.get(best);
        if (!now || now.model !== model || (now.loaded && !now.mejorando) || now.preparando || now.nivel !== nivel) return; // removed or changed while it downloaded
        const quieto = !now.want.animate ? hornear(clave, g.scene, merge) : null;
        let copy: THREE.Object3D;
        const fu = !quieto && now.want.animate ? fundido(model, g, clone) : null;
        const qu = !quieto && !fu ? quietoDe(clave, g.scene, g.animations) : null;
        // J14: a thing painted a custom colour keeps its baked parts (pintar() cannot tint a merged,
        // vertex-coloured piece); anything else gets both LODs and starts at whichever distance picks.
        const pieza = quieto && !now.want.color ? hornearPieza(clave, quieto, merge) : null;
        const lod: "cerca" | "lejos" = pieza ? decidirLOD(selfXZ ? Math.sqrt(distance2(now)) : 0, undefined) : "cerca";
        if (quieto) copy = representacion(lod === "lejos" && pieza ? [pieza] : quieto);
        else copy = clone(fu ? fu.escena : qu ? qu.escena : g.scene); // E2: a still model drawn merged
        const partes = quieto ?? qu?.partes ?? partesEnteras(clave, g) ?? undefined;
        // B3: its shaders are prepared first (precompilar.ts) and only then is it shown; the first copy of a model
        // compiles, the rest find the programs ready. Copies drawn together (lotes.ts) use instanced programs: a
        // one-instance stand-in per part prepares those too, once per model, when the world has enough copies of it.
        // The LOD it is not showing yet (J14) is prepared alongside, so switching later does not stall either.
        const objs: THREE.Object3D[] = [copy];
        if (quieto && pieza) objs.push(representacion(lod === "lejos" ? quieto : [pieza]));
        if (partes && !instanciasPreparadas.has(clave) && copiasDe(model) >= (xrPosible ? INSTANCIAR_DESDE_VR : INSTANCIAR_DESDE)) {
          instanciasPreparadas.add(clave);
          for (const q of partes) { const im = new THREE.InstancedMesh(q.geo, q.mat, 1); im.castShadow = q.sombra; objs.push(im); }
        }
        if (sombrasPuestas()) for (const o of objs) o.traverse((x) => { if ((x as THREE.Mesh).isMesh && !x.userData.sinSombra) { x.castShadow = true; x.receiveShadow = true; } }); // as entorno marks them: same shader
        const yo = {};
        now.preparando = yo;
        precompilar.preparar(objs, () => {
          if (things.get(best) !== now || now.preparando !== yo || now.model !== model || (now.loaded && !now.mejorando) || now.nivel !== nivel) return; // removed or changed while it compiled
          now.preparando = undefined;
          // J14's LODs are set only now: actualizarLOD() must not show the copy before its shaders are ready
          if (quieto) { now.piezaCerca = quieto; now.piezaLejos = pieza ?? undefined; now.lod = lod; }
          now.horneado = !!quieto; now.partes = partes;
          now.radio = radioDe(copy) * (now.want.animate ? 1.5 : 1); // an animation may reach out of its rest pose
          if (now.mejorando) { now.group.clear(); now.mejorando = false; } // H13: the whole model replaces the level it was showing, in the same frame
          if (!now.want.animate) congelarMatrices(copy); // a still model never recomposes its node matrices again (congelar.ts: measured in tools/medir-recorrido.mjs)
          now.group.add(copy);
          if (now.want.animate && g.animations.length) { now.mixer = new THREE.AnimationMixer(copy); now.mixer.clipAction((fu ? fu.clips : g.animations)[0]).play(); }
          now.loaded = true; now.color = undefined; pintar(now);
          if (llevados.has(best) && now.group.parent !== world) { const d = llevados.get(best)!; soltarLlevado(best); llevados.set(best, d); } // re-fit in the hand
        });
      }).catch((e) => {
        const now = things.get(best);
        files.delete(clave); // a later placement may try again
        if (now && now.model === model && nivel > 0) { now.sinNivel = true; now.nivel = 0; waiting.add(best); return; } // H13: the level did not come: the whole model, as before
        if (now && now.model === model) { now.mejorando = false; if (!now.loaded) now.failed = true; }
        console.warn(`[objetos] no se pudo cargar ${assetUrl(clave.replace(/\.glb$/, ""))}: ${(e as Error)?.message ?? e}`);
      }).finally(() => { loading--; if (cerca) cercaCargando--; pumpLoads(); });
    }
  }
  /** U10: an image, a video or a sphere of sound instead of a .glb (medios.ts). */
  function cargarMedio(key: string, s: Slot, cerca = true): void {
    const t = s.want, url = assetUrl(t.model).replace(/\.glb$/, `.${t.ext ?? "glb"}`), model = s.model;
    if ((t.kind === "video" || t.kind === "sonido") && !sePuedeReproducir(t.ext ?? "")) { s.failed = true; console.warn(`[medios] este navegador no reproduce .${t.ext}`); return; }
    if (t.kind === "imagen") s.imgPx = IMAGEN_PX[entorno.nivel];
    const p = t.kind === "trazo" ? import("./trazo.ts").then((m) => m.cargarTrazo(url)) /* lazy: nothing downloaded until a world has a stroke */ : t.kind === "imagen" ? cargarImagen(`${url}?px=${s.imgPx}`, s.imgPx) /* the server's copy made for this tier (activos.ts `?px=`); a picture still bigger than the tier (no copy yet) is redrawn to its size before it is a texture */ : t.kind === "video" ? cargarVideo(url, () => verOcultos) : Promise.resolve(cargarSonido(url, () => verOcultos));
    loading++; if (cerca) cercaCargando++;
    p.then((m) => {
      const now = things.get(key);
      if (!now || now.model !== model || now.loaded) { m.soltar(); return; }
      now.radio = radioDe(m.obj); now.group.add(m.obj); now.medio = m; now.loaded = true;
    }).catch((e) => {
      const now = things.get(key);
      if (now && now.model === model) now.failed = true;
      console.warn(`[medios] no se pudo cargar ${url}: ${(e as Error)?.message ?? e}`);
    }).finally(() => { loading--; if (cerca) cercaCargando--; pumpLoads(); });
  }
  let mediosSonando = false;
  /** The tier the pictures were last checked against: entering VR makes it B, and a picture loaded bigger than B's size is let go
   * and loaded again at B's (the browser has the file cached for a year), so the headset never holds the desktop-size copies. */
  let nivelImagenes: NivelCalidad = entorno.nivel;
  function ajustarImagenes(): void {
    const nv = entorno.nivel;
    if (nv === nivelImagenes) return;
    nivelImagenes = nv;
    let hay = false;
    for (const [k, s] of things) {
      if (s.want.kind !== "imagen" || !s.loaded || !((s.imgPx ?? 0) > IMAGEN_PX[nv])) continue;
      s.medio?.soltar(); s.medio = undefined; s.group.clear(); s.radio = undefined; s.loaded = false; s.failed = false; waiting.add(k); hay = true;
    }
    if (hay) pumpPronto();
  }
  function updateThings(dt: number): void {
    animatingNear = false; mediosSonando = false;
    ajustarImagenes();
    if (reacciones.size) { // lote 5: a clicked thing hops on top of where its state puts it, and goes back exactly there when it ends
      const t = performance.now();
      for (const [k, t0] of reacciones) {
        const s = things.get(k), x = (t - t0) / REACCION_MS;
        if (!s || x >= 1 || llevados.has(k) || editor.retiene(k, s.want)) { reacciones.delete(k); if (s && !llevados.has(k) && !editor.retiene(k, s.want)) placeGroup(s); continue; }
        const r = reaccionDe(x), w = s.want;
        s.group.position.y = w.y + r.sube * Math.max(0.3, Math.abs(w.sy));
        s.group.scale.set(w.sx * r.ancho, w.sy * r.alto, w.sz * r.ancho);
      }
    }
    const r2 = ANIMATE_WITHIN_M ** 2;
    // S4/S5: de dónde oyes es LO QUE DICE EL OYENTE (audio/oyente.ts): la cámara fuera de XR, la pose real del visor
    // dentro. Antes era la posición DE RED del jugador +1,5 m y sin orientación, y por eso un sonido a tu izquierda
    // sonaba igual que uno a tu derecha. Mientras el módulo del oyente no haya llegado (un par de fotogramas) se usa
    // la cámara a secas, para que un sonido no nazca mudo.
    const op = oyente?.pose();
    const sano = (q: { x: number; y: number; z: number }): boolean => Number.isFinite(q.x + q.y + q.z);
    const oidoOyente = op && op.fuente !== "ninguna" ? { x: op.x, y: op.y, z: op.z } : null;
    // al salir de VR la cámara puede traer NaN un cuadro: sin posición sana no hay oyente (nada de NaN en `volume`)
    const oido: { x: number; y: number; z: number } | null = oidoOyente && sano(oidoOyente) ? oidoOyente : sano(camera.position) ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null;
    for (const [k, s] of things) {
      if (s.nivel && s.loaded && !s.mejorando && debeMejorar(selfXZ ? Math.sqrt(distance2(s)) : null, s.nivel)) { s.mejorando = true; s.nivel = undefined; waiting.add(k); pumpPronto(); } // H13: you came near: load the whole model
      if (s.medio) { s.medio.actualizar(s.group, oido, { hidden: !!s.want.hidden, volume: s.want.volume ?? 1, reach: s.want.reach ?? "burbuja", radius: s.want.radius ?? 8, ...(s.want.bus ? { bus: s.want.bus } : {}) }); if (s.want.kind === "video" && s.medio.sonando()) mediosSonando = true; }
      if (s.horneado) actualizarLOD(s); // J14: far baked figures drop to one piece (one draw call)
      if (!s.mixer) continue;
      if (distance2(s) <= r2) { s.mixer.update(dt); animatingNear = true; }
    }
  }
  // M22: the builder's hands (pick, the point under the pointer, the selection's outline, the lazy gizmo): gizmo.ts.
  // While a thing is held its server echoes only update `want` (editor.retiene), so it never jumps back mid-drag.
  const editor = crearEditor({
    scene, camera, canvas: renderer.domElement,
    *grupos() { for (const [k, s] of things) yield [k, s.group] as [string, THREE.Object3D]; },
    grupo: (k) => things.get(k)?.group,
    reponer: (k) => { const s = things.get(k); if (s) placeGroup(s); },
  });

  // ---- J5: names that stay over things (people of the world). Sprites: they face the camera by themselves, so
  // nothing runs per frame; the fog fades the far ones. pickThing tells which thing (or name) is under a screen point.
  // U14 (4): a label may carry a second, smaller line under the name (a person's trade) and a mark above it («!» in a
  // warm colour: something for you now; «✓» in green: done). Its canvas is drawn again only when its text or mark
  // changes — a new position just moves it — so standing still costs nothing (tagDraws() counts the canvases drawn).
  type Rotulo = { s: THREE.Sprite; firma: string; x: number; y: number; z: number; marca: boolean };
  type DatosRotulo = { text: string; x: number; y: number; z: number; sub?: string; mark?: "!" | "✓" | "" };
  const tags = new Map<string, Rotulo>();
  let tagDibujos = 0;
  const ROT_ANCHO = 512, ROT_NOMBRE = 96, ROT_SUB = 48, ROT_MARCA = 160, ROT_M = 2.9 / 512; // px (the name line as before); metres per px
  function dropTag(key: string): void {
    const r = tags.get(key);
    if (!r) return;
    world.remove(r.s); r.s.material.map?.dispose(); r.s.material.dispose(); tags.delete(key);
  }
  /** The mark as shapes (no font needs to have «✓»), with a dark edge so it reads over any sky or floor: a warm «!» (a
   * tapered bar and a dot) or a green tick. `h` = its height in px. */
  function dibujarMarca(g: CanvasRenderingContext2D, mark: "!" | "✓", cx: number, cy: number, h: number): void {
    g.save(); g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = "rgba(16,12,6,0.92)";
    if (mark === "!") {
      const top = cy - h / 2, alto = h * 0.64, r = h * 0.12;
      g.beginPath();
      g.moveTo(cx - h * 0.15, top); g.lineTo(cx + h * 0.15, top); g.lineTo(cx + h * 0.09, top + alto); g.lineTo(cx - h * 0.09, top + alto); g.closePath();
      g.moveTo(cx + r, cy + h / 2 - r); g.arc(cx, cy + h / 2 - r, r, 0, Math.PI * 2);
      g.lineWidth = h * 0.13; g.stroke();
      g.fillStyle = "#ffb21e"; g.fill();
    } else {
      g.beginPath(); g.moveTo(cx - h * 0.38, cy + h * 0.02); g.lineTo(cx - h * 0.1, cy + h * 0.32); g.lineTo(cx + h * 0.42, cy - h * 0.34);
      g.lineWidth = h * 0.32; g.stroke();
      g.strokeStyle = "#3fd46a"; g.lineWidth = h * 0.19; g.stroke();
    }
    g.restore();
  }
  /** A label's canvas, top to bottom: the mark (if any), the name, the trade (if any); the plate behind the two lines. */
  function dibujarRotulo(t: DatosRotulo): HTMLCanvasElement {
    const sub = t.sub ?? "", mark = t.mark || "", arriba = mark ? ROT_MARCA : 0;
    const c = document.createElement("canvas"); c.width = ROT_ANCHO; c.height = arriba + ROT_NOMBRE + (sub ? ROT_SUB : 0);
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(20,30,40,0.78)"; g.fillRect(0, arriba, ROT_ANCHO, c.height - arriba);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#ffffff"; g.font = "bold 44px sans-serif";
    g.fillText(t.text.slice(0, 26), ROT_ANCHO / 2, arriba + (sub ? 46 : 50), ROT_ANCHO - 20);
    if (sub) { g.fillStyle = "#e2edf6"; g.font = "36px sans-serif"; g.fillText(sub.slice(0, 40), ROT_ANCHO / 2, arriba + ROT_NOMBRE + 4, ROT_ANCHO - 24); }
    if (mark) dibujarMarca(g, mark, ROT_ANCHO / 2, arriba / 2, arriba - 16);
    tagDibujos++;
    return c;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

  // ---- N12: draw calls for Quest (80). Only while the frame is drawn: (a) what the fog covers completely is not drawn
  // (things, people, VRMs, names over things: the fog stays exactly as the world says), (b) still copies of one baked
  // model (and colour), from INSTANCIAR_DESDE on, are drawn as one instanced mesh per material (lotes.ts), and so are
  // the capsules of the people who wear no VRM (the far crowd: one call for all). Before and after the frame every
  // object is as it was, so picking, the map, footprints, hands and the gizmo never see any of this.
  const lotes = crearLotes(world);
  const fijados = crearFijados(world); // MIS-200 t_e41c0a12: pinned things merged by material and cell (fijados.ts); shown only while the frame is drawn
  const fijosCuadro: Fijado[] = [], fijosSlots: Slot[] = [], instanciados = new Set<Slot>();
  const hitosMalla = crearHitosMalla(hitos, pillarGeo, lotes.raiz); // MIS-200: the pillars are ONE instanced call (hitos-malla.ts); lotes.raiz shows only while the frame is drawn
  const capsulasParte: Parte[] = [{ geo: bodyGeo, mat: otherMat, sombra: false }];
  const ojo = new THREE.Vector3(), ocultosCuadro: THREE.Object3D[] = [], enLuz = new Set<number | "self">();
  const porLote = new Map<string, { partes: Parte[]; color: string; slots: Slot[] }>();
  const idPartes = new WeakMap<Parte[], number>();
  let nPartes = 0;
  const capsulasCuadro: THREE.Mesh[] = [], matricesTmp: THREE.Matrix4[] = [];
  let dibujoUltimo = { lejos: Infinity, niebla: 0, instanciadas: 0, lotes: 0 };
  const matricesDe = (objs: readonly THREE.Object3D[]): THREE.Matrix4[] => {
    matricesTmp.length = objs.length;
    for (let i = 0; i < objs.length; i++) { objs[i].updateWorldMatrix(false, false); matricesTmp[i] = objs[i].matrixWorld; } // world never moves
    return matricesTmp;
  };
  const esferasFunciones = new WeakMap<THREE.Object3D, { cuadro: number; c: THREE.Vector3 | null; r: number }>(), cajaTmp = new THREE.Box3(), sizeTmp = new THREE.Vector3();
  let cuadroEsferas = 0;
  function antesDelCuadro(): void {
    const lejos = lejosDeNiebla(scene.fog as unknown as Parameters<typeof lejosDeNiebla>[0]);
    (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(ojo);
    const tapa = (o: THREE.Object3D, r: number) => tapadoPorNiebla(o.position.x - ojo.x, o.position.y - ojo.y, o.position.z - ojo.z, r, lejos);
    const ocultar = (o: THREE.Object3D) => { o.visible = false; ocultosCuadro.push(o); };
    let niebla = 0, instanciadas = 0;
    for (const v of porLote.values()) v.slots.length = 0;
    for (const [k, s] of things) {
      const g = s.group;
      if (!s.loaded || !g.visible || g.parent !== world) continue; // still loading, hidden, or carried in a hand
      if (tapa(g, (s.radio ?? 1) * Math.max(Math.abs(g.scale.x), Math.abs(g.scale.y), Math.abs(g.scale.z)))) { ocultar(g); niebla++; continue; }
      if (!s.partes || s.mixer || k.startsWith("~")) continue; // a held copy too: its matrix is read every frame
      // the same model can hold two kinds of parts (baked when it stands still, whole when `animar` is on): copies share a lote only if they share the parts, or the two kinds overwrite each other's group every frame and neither reaches the threshold
      let id = idPartes.get(s.partes); if (id === undefined) idPartes.set(s.partes, (id = ++nPartes));
      const color = s.want.color ?? "", clave = `${s.model}|${color}|${id}`;
      let v = porLote.get(clave);
      if (!v || v.partes !== s.partes) porLote.set(clave, (v = { partes: s.partes, color, slots: [] }));
      v.slots.push(s);
    }
    lotes.empezar();
    let nLotes = 0;
    const desde = instanciarDesde(renderer.xr.isPresenting);
    for (const [clave, v] of porLote) {
      if (v.slots.length < desde) continue;
      lotes.dibujar(clave, v.partes, v.color, matricesDe(v.slots.map((s) => s.group)));
      for (const s of v.slots) ocultar(s.group);
      instanciadas += v.slots.length; nLotes++;
      for (const s of v.slots) instanciados.add(s);
    }
    // pinned, still (no mixer: `animar` is on by default, a model without clips has none), unpainted copies that no lote draws: one mesh per material and cell instead of one per model part
    fijosCuadro.length = 0; fijosSlots.length = 0;
    for (const [k, s] of things) {
      const g = s.group;
      if (!s.want.fijo || !s.loaded || !s.partes || s.mixer || s.want.color || k.startsWith("~") || !g.visible || g.parent !== world || instanciados.has(s)) continue;
      g.updateWorldMatrix(true, false);
      fijosCuadro.push({ id: k, partes: s.partes, matriz: g.matrixWorld, x: g.position.x, z: g.position.z }); fijosSlots.push(s);
    }
    instanciados.clear();
    fijados.actualizar(fijosCuadro);
    for (let i = 0; i < fijosSlots.length; i++) if (fijados.cubre(fijosCuadro[i].id)) { const g = fijosSlots[i].group; if (g.visible) ocultar(g); }
    fijados.antes((x, y, z, r) => tapadoPorNiebla(x - ojo.x, y - ojo.y, z - ojo.z, r, lejos));
    capsulasCuadro.length = 0;
    // N16: whoever the light holds is not there (nor slides across while the server moves them)
    enLuz.clear();
    for (const k of tele.ocultos()) enLuz.add(k);
    if (enLuz.has("self") && selfMesh.visible) ocultar(selfMesh);
    for (const [id, m] of others) {
      if (enLuz.has(id)) { if (m.visible) ocultar(m); continue; }
      if (m.layers.mask === 0) continue; // wears a VRM (avatares.ts hides the capsule this way)
      if (tapa(m, 1)) { ocultar(m); niebla++; continue; }
      capsulasCuadro.push(m);
    }
    if (capsulasCuadro.length >= INSTANCIAR_DESDE) {
      lotes.dibujar("~capsulas", capsulasParte, "", matricesDe(capsulasCuadro));
      for (const m of capsulasCuadro) ocultar(m);
      instanciadas += capsulasCuadro.length; nLotes++;
    }
    lotes.terminar();
    for (const r of avs.raices()) if (r.visible && tapa(r, 2)) { ocultar(r); niebla++; }
    for (const k of enLuz) { const r = avs.raiz(k === "self" ? "yo" : k); if (r?.visible) ocultar(r); }
    for (const r of tags.values()) if (r.s.visible && tapa(r.s, 3)) { ocultar(r.s); niebla++; }
    // t_43143556: the world's own feature groups (fishing spot, dartboard, effect elements, the Ancestors' pieces) are not
    // things: they never went through the fog cut above, and a Quest looking down a long world drew every one of them
    // (a pond 110 m away cost 6 calls under a fog that ends at 60). Same rule, the group's bounding sphere (re-measured every
    // 60 frames: a rod's line or a dart in flight grows it).
    for (const c of world.children) {
      if (c.visible && esGrupoDeFuncion(c.name)) vigilarGrupo(c);
      if (!c.visible || !esGrupoDeFuncion(c.name)) continue;
      let e = esferasFunciones.get(c);
      if (!e || cuadroEsferas - e.cuadro >= 60) {
        const caja = cajaTmp.setFromObject(c);
        e = { cuadro: cuadroEsferas, c: caja.isEmpty() ? null : caja.getCenter(new THREE.Vector3()), r: caja.isEmpty() ? 0 : caja.getSize(sizeTmp).length() / 2 };
        esferasFunciones.set(c, e);
      }
      if (e.c && tapadoPorNiebla(e.c.x - ojo.x, e.c.y - ojo.y, e.c.z - ojo.z, e.r, lejos)) { ocultar(c); niebla++; }
    }
    cuadroEsferas++;
    hitosMalla.antes();
    lotes.raiz.visible = true; fijados.raiz.visible = true;
    dibujoUltimo = { lejos, niebla, instanciadas, lotes: nLotes };
  }
  function despuesDelCuadro(): void {
    for (const o of ocultosCuadro) o.visible = true;
    ocultosCuadro.length = 0;
    hitosMalla.despues();
    lotes.raiz.visible = false; fijados.raiz.visible = false;
  }
  // MIS-200: the Graboso inside XR films a small mirror of the left eye (espejo-xr.ts); the module is fetched at the first
  // recording in XR and `espejoXR` stays null (one null check per frame) in every other session
  let espejoXR: import("./espejo-xr.ts").EspejoXR | null = null, espejoCarga: Promise<import("./espejo-xr.ts").EspejoXR> | null = null;
  const espejoGrabar = {
    /** The 2D canvas that mirrors one eye while the XR session lasts; the recorder films it instead of the main canvas. */
    async encender(): Promise<HTMLCanvasElement> {
      espejoCarga ??= import("./espejo-xr.ts").then((m) => (espejoXR = m.crearEspejoXR({ renderer, scene, backend })));
      return (await espejoCarga).encender();
    },
    apagar(): void { espejoXR?.apagar(); },
    escritos(): number { return espejoXR?.escritos() ?? 0; },
    lienzo(): HTMLCanvasElement | null { return espejoXR?.lienzo() ?? null; },
  };
  // MIS-222: one photo of the headset's view (foto-xr.ts), drawn right after an XR frame; fetched at the first photo in XR
  let fotoXR: import("./foto-xr.ts").FotoXR | null = null, fotoCarga: Promise<import("./foto-xr.ts").FotoXR> | null = null;
  const fotoVR = {
    /** A canvas with what the headset sees now (no VR furniture: the watch, the menu, the notices and everything the VR rig holds — help card, «Salir», dialogue, vignette, hands), or a rejection when no XR frame came. Only inside an XR session. */
    async sacar(): Promise<HTMLCanvasElement> {
      if (!renderer.xr.isPresenting) throw new Error("no estás dentro de VR");
      fotoCarga ??= import("./foto-xr.ts").then((m) => (fotoXR = m.crearFotoXR({ renderer, scene, backend, ocultar: () => [vr.reloj.malla, vr.menu.malla, vr.aviso.malla, ...vr.rig.children] })));
      return (await fotoCarga).sacar();
    },
  };
  // H12b: bloom + AO through a RenderPipeline, only on level A and only when asked. posproceso.ts (and the node modules it needs) is fetched when
  // the first effect is switched on: nothing of it is in the start bundle, and a phone or a headset never asks (the tier clamps the wish to off).
  let pp: Posproceso | null = null, ppCarga: Promise<Posproceso> | null = null, ppVivo = false;
  const puertaPP = crearPuerta(), alApagarPP: (() => void)[] = [];
  const ppEstado = { apagadoPorCoste: 0, ultimaMediaMs: 0, error: "" };
  async function sincronizarPP(): Promise<void> {
    const e = entorno.efectosActual, quiere = (e.bloom || e.ao) && !renderer.xr.isPresenting;
    if (!quiere) { ppVivo = false; pp?.soltar(); return; }
    try {
      ppCarga ??= import("./posproceso.ts").then((m) => m.crearPosproceso({ renderer, scene, camera }));
      const m = await ppCarga;
      const ahora = entorno.efectosActual;
      if (!(ahora.bloom || ahora.ao)) return; // switched off while the chunks came
      await m.construir(ahora);
      pp = m; puertaPP.reiniciar(); power.paron(3); ppVivo = true; ppEstado.error = "";
    } catch (err) { ppVivo = false; ppEstado.error = String((err as Error)?.message ?? err); console.warn("posproceso:", ppEstado.error); pp?.soltar(); } // no effect rather than no picture
  }
  entorno.alCambiarEfectos(() => { void sincronizarPP(); });
  const posproceso = {
    /** The extra passes are drawing now. */
    get activo(): boolean { return ppVivo; },
    /** Per drawn frame, from the page: `dtMs` since the last draw and whether something moves. The cost gate switches the effects off if the machine cannot hold the target. */
    vigilar(dtMs: number, activo: boolean): void {
      if (!ppVivo || !activo || dtMs > 250) return;
      const tope = Math.max(TOPE_MS, (1.25 * 1000) / power.targetFps(true));
      if (puertaPP.alDibujar(dtMs, tope) === "apagar") {
        ppEstado.apagadoPorCoste++; ppEstado.ultimaMediaMs = Math.round(puertaPP.media() * 10) / 10;
        entorno.efectos({ bloom: false, ao: false }); // the soft shadows stay: they cost no pass
        for (const f of alApagarPP) f();
      }
    },
    /** Tell me when the cost gate switched the passes off by itself (the settings menu then shows them off). */
    alApagar(f: () => void): void { alApagarPP.push(f); },
    estado: () => ({ activo: ppVivo, construido: pp ? { ...pp.construido } : null, ...ppEstado, mediaMs: Math.round(puertaPP.media() * 10) / 10, muestras: puertaPP.muestras() }),
    /** Force a build now and resolve when it is drawing (checks). */
    listo: async (): Promise<boolean> => { await sincronizarPP(); return ppVivo; },
  };
  // MIS-200 t_ee19c84b: the draw-call census (medidor-vivo.ts). Walked once, right after the frame is drawn and while the frame's
  // hidden things are still hidden (so lotes show, their copies do not: the scene as the GPU got it), and only when asked.
  let censoPedido = false, censoUltimo: Censo | null = null;
  function tomarCenso(): void {
    censoPedido = false;
    const xr = renderer.xr.isPresenting;
    const union = xr ? (renderer.xr.getCamera() as THREE.ArrayCamera) : null;
    const camaras = union ? (union.cameras ?? []) : [camera];
    if (camaras.length) { censoUltimo = censoDeEscena(scene, camaras, union ?? undefined); censoUltimo.resto = renderer.info.render.drawCalls - censoUltimo.llamadas; }
  }
  function dibujarCuadro(): void {
    // t_159e18d2: the entry veil (see calentarEntrada): the headset keeps getting frames while the world's programs link
    if (velo && renderer.xr.isPresenting) { if (!velo.lanzado) iniciarVelo(velo); renderer.render(escenaVelo, camera); return; }
    if (pausaLuz > 0 && compiles.estado().cargaLista) return; // a new light set is linking (luzCambiada): the screen keeps its last picture
    antesDelCuadro();
    try { if (ppVivo && pp && !renderer.xr.isPresenting) pp.dibujar(); else renderer.render(scene, camera); if (censoPedido) tomarCenso(); if (espejoXR?.activo()) espejoXR.cuadro(performance.now()); if (fotoXR?.pendiente()) fotoXR.cuadro(); } finally { despuesDelCuadro(); }
  }

  // B4: three's own count of live shader programs (WebGPURenderer info.memory.programs); it only grows when one is made
  const programasVivos = (): number => (renderer as unknown as { info: { memory: { programs?: number } } }).info.memory.programs ?? 0;
  let programasVistos = programasVivos();
  // t_8217ffea (N1, N2): in VR your hands wear your avatar's skin and your own body is drawn under your head (settings controles.pielManosVR / cuerpoVR)
  let cuerpoVR = true, pielManosVR = true;
  function cuerpoEnVR(): void {
    manosReal?.piel(pielManosVR ? avs.colorPiel("yo") : null);
    if (!cuerpoVR) return;
    camera.updateWorldMatrix(true, false);
    const e = camera.matrixWorld.elements;
    avs.colocarVR({ x: e[12], y: e[13], z: e[14], fx: -e[8], fy: -e[9], fz: -e[10], ux: e[4], uy: e[5], uz: e[6] }, performance.now());
  }
  /** Move the camera (N1), then draw. */
  function dibujar(dtSeconds: number): void {
    updateDecorations(performance.now());
    updateThings(dtSeconds);
    selfMat.visible = renderer.xr.isPresenting || !cam.primeraPersona(); // N1: in first person your body is not drawn
    editor.frame();
    entorno.actualizar(); naturaleza.actualizar(dtSeconds); espacioBase.actualizar(dtSeconds); elementos.actualizar(dtSeconds); tele.actualizar(dtSeconds); graboso3d?.actualizar(dtSeconds); ancestros.actualizar(dtSeconds, selfXZ);
    if (renderer.xr.isPresenting) { ar.update(dtSeconds); vr.update(selfXZ, dtSeconds); cuerpoEnVR(); pesca.actualizar(dtSeconds); dardosVR.actualizar(dtSeconds); pincelVR.actualizar(dtSeconds); colocarLlevados(); puestos.actualizar(); web.actualizar(); oyente?.actualizar(); dibujarCuadro(); return; } // S5: tras vr.update, el oyente lee la pose de la cabeza de este cuadro // N4: after the hands moved, so a held rod does not trail a frame
    pesca.actualizar(dtSeconds); dardos.actualizar(dtSeconds); dados3d.actualizar(dtSeconds);
    if (selfXZ) { feet.x = selfXZ.x; feet.y = selfXZ.y ?? 0; feet.z = selfXZ.z; } // N1b: the height too (jumps, floors)
    cam.update(dtSeconds, selfXZ ? feet : null);
    oyente?.actualizar(); // S5: right after the camera moved — the listener is where you hear from, nothing else
    colocarLlevados();
    puestos.actualizar(); // N18: after the avatars moved (sync), so a lantern does not trail its hand
    dibujarCuadro();
    web.actualizar(); // N17: after the frame, so the iframes follow the camera this frame drew from
  }

  return {
    backend,
    power,
    renderer,
    /** The world's camera (checks project points through it). */
    camera,
    /** The scene itself (tools/medir-recorrido.mjs walks it to time the per-frame matrix update). */
    scene,
    /** T1: the graphics chip as the browser names it ("" when it hides it). Read once at start (B3), then remembered. */
    gpu(): Promise<string> { return gpuNombre; },
    /** T1: refresh rate of the XR session (Hz); 0 outside XR or when the browser does not say. */
    xrHz(): number {
      const s = renderer.xr.getSession() as unknown as { frameRate?: number } | null;
      return renderer.xr.isPresenting && s?.frameRate ? s.frameRate : 0;
    },
    ar,
    arSupported,
    vr,
    vrSupported,
    /** H4 + H12: the environment (aplicar, estado, calidad, capacidades) — packages/render/src/entorno.ts. */
    entorno,
    /** H12b: bloom + AO passes (activo, vigilar, alApagar, estado) — packages/render/src/posproceso.ts, loaded the first time an effect is switched on, level A only. */
    posproceso,
    /** N4: the world's low-poly nature (aplicar, estadisticas, terreno) — packages/render/src/naturaleza/naturaleza.ts; builds nothing until a world asks. */
    naturaleza,
    /** H2: the espacio base (aplicar, estadisticas, alturaEn) — packages/render/src/espacio-base/espacio-base.ts; builds nothing until a world asks. */
    espacioBase,
    /** H4/H8: water, fire, smoke and dust (poner, contar) — packages/render/src/elementos.ts, loaded with the first one. */
    elementos,
    /** N16: the light of a trip (lanzar, estado) — packages/render/src/teletransporte.ts; the body hides meanwhile. */
    teletransporte: { lanzar: tele.lanzar, estado: tele.estado },
    /** pesca v1: fishing spots, floats and my own phase (sitios, flotadores, estado, contar) — packages/render/src/pesca.ts, loaded with the first spot. */
    pesca,
    /** lote 8 (mesa): the 3D dice of the rolls heard at a tower (tirar, contar) — packages/render/src/dados-vista.ts, loaded with the first roll. */
    dados: dados3d,
    /** dardos v1: boards near you and their darts (sitios, clavados, linea, contar) — packages/render/src/dardos.ts. */
    dardos,
    /** dardos in VR: load the 3D side (`cargar()`), then enMano / volar / soltar / posicion / local / aMundo / cadaCuadro; `contar()` for checks. */
    dardosVR,
    /** painting in VR (J18b): load the live tube (`cargar()`), then marcar / empezar / anadir / seguir / terminar / cancelar / apagar; `cadaCuadro(fn)` is the page's per-frame reader; `contar()` for checks. */
    pincelVR,
    /** N17: web screens — a panel everywhere, the live page in CSS3D near you on PC/phone, «Abrir fuera de VR» in VR (web.ts). */
    web,
    /** ancestros v1: the Salón de los Ancestros (muros, hologramas, paneles, dice, contar) — packages/render/src/ancestros.ts. */
    ancestros,
    /** dardos v1 in AR: enter immersive-ar with a real-size board for your wall (dardos.ts crearDianaAR); null if the
     * session could not start. Press/hold/release throws: `alLanzar` gets aim (board radii) and strength. */
    async dardosAR(o: { alLanzar: (x: number, y: number, fuerza: number) => void; alColocar?: (pared: boolean) => void; zona?: number; envolver?: (j: DianaAR) => DianaAR }): Promise<DianaAR | null> {
      const j = (o.envolver ?? ((x: DianaAR) => x))(crearDianaAR(o)); // AR-D3: the duel wraps the wall board (dardos-duelo-ar.ts)
      return (await ar.jugar(j)) ? j : null;
    },
    /** M18b: the Graboso over your shoulder (mostrar, grabando, visible) — packages/render/src/graboso.ts, loaded when first invoked. */
    graboso,
    /** MIS-200: the XR mirror the Graboso records inside a headset session (espejo-xr.ts; off until switched on). */
    espejoGrabar,
    /** MIS-222: one photo of what the headset sees (foto-xr.ts); the page frames and saves it (apps/plaza/foto.ts). */
    fotoVR,
    /** Place everyone for this frame (J2: at their height). */
    sync(self: { x: number; z: number; y?: number; speed?: number } | null, list: Placed[]): void {
      selfXZ = self;
      if (self) { selfMesh.visible = true; selfMesh.position.set(self.x, (self.y ?? 0) + 0.85, self.z); }
      const seen = new Set<number>();
      for (const o of list) {
        seen.add(o.id);
        let m = others.get(o.id);
        if (!m) { m = new THREE.Mesh(bodyGeo, otherMat); world.add(m); others.set(o.id, m); }
        m.position.set(o.x, (o.y ?? 0) + 0.85, o.z);
      }
      for (const [id, m] of others) if (!seen.has(id)) { world.remove(m); others.delete(id); }
      const now = performance.now();
      for (const [t, until] of bounces) {
        const m = meshOf(t);
        if (!m || now > until) bounces.delete(t);
        else m.position.y += Math.abs(Math.sin(now / 90)) * 0.35;
      }
      // habitante@1 `apariencia`: an AI that has a body of its own is drawn as a model of the world (the same path as a person of the
      // world, `place`), turned where it walks (our models face +z: yaw = atan2(vx, vz), the avatars' rule); its capsule hides, no VRM is dressed on it.
      const propios = opts.avatares?.cuerpoPropio;
      if (propios || cuerposPropios.size) {
        const dtC = antesPropios < 0 ? 0 : Math.min(0.25, (now - antesPropios) / 1000); antesPropios = now;
        for (const [id, m] of others) {
          const c = propios?.(id);
          if (!c) continue;
          let k = cuerposPropios.get(id);
          if (!k) { k = { marcha: nuevaMarcha() }; cuerposPropios.set(id, k); }
          seguir(k.marcha, m.position.x, m.position.z, dtC);
          m.layers.mask = 0; // the capsule's way of saying «something else draws this one» (avatares.ts does the same)
          this.place(`cuerpo:${id}`, { model: c.sha, x: m.position.x, y: m.position.y - 0.85, z: m.position.z, rx: 0, ry: k.marcha.rumbo / RAD, rz: 0, sx: c.escala, sy: c.escala, sz: c.escala, animate: false });
        }
        for (const [id, k] of cuerposPropios) {
          const m = others.get(id);
          if (m && propios?.(id)) continue;
          this.place(`cuerpo:${id}`, null); cuerposPropios.delete(id); if (m) m.layers.mask = 1; // it left, or changed body: the capsule comes back (a VRM, if it gets one, hides it again)
        }
        sinCuerpo.clear();
        for (const [id, m] of others) if (!cuerposPropios.has(id)) sinCuerpo.set(id, m);
      }
      // J1: VRMs follow the capsules (hops and jumps included); yours hides in first person (camera branch: view.cam)
      avs.sync(self ? selfMesh : null, cuerposPropios.size ? sinCuerpo : others, !!(this as unknown as { cam?: { primeraPersona?: () => boolean } }).cam?.primeraPersona?.(), now);
    },
    /** U13: who you hear right now, 0..1 (apps/plaza/voz.ts; never your own id, voz.ts never hears you). Drives
     * that avatar's "aa" mouth shape, kept aside at load (J1's avatares-vrm.ts `bocaDe`) just for this. */
    voz(id: number, nivel: number): void { avs.nivelVoz(id, nivel); },
    /** A short text over an avatar (`"self"` = your own) for `ms` milliseconds. Replaces the previous one. */
    label(t: Target, text: string, ms: number): void {
      dropLabel(t);
      const c = document.createElement("canvas"); c.width = 256; c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgba(20,30,40,0.85)"; g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#ffd27a"; g.textAlign = "center"; g.textBaseline = "middle";
      const corto = text.slice(0, 18);
      let tam = 34;                                    // shrink to fit the 256 px chip: «≈ Desestabilizado» used to be cut at both ends
      g.font = `bold ${tam}px sans-serif`;
      while (tam > 16 && g.measureText(corto).width > 244) { tam -= 2; g.font = `bold ${tam}px sans-serif`; }
      g.fillText(corto, 128, 34);
      const mesh = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      mesh.renderOrder = 10;
      world.add(mesh);
      labels.set(t, { mesh, until: performance.now() + ms });
    },
    /** Make an avatar hop for `ms` milliseconds. */
    bounce(t: Target, ms: number): void { bounces.set(t, performance.now() + ms); },
    /** A column of light with a text at a world point for `ms` milliseconds. */
    beacon(x: number, z: number, text: string, ms: number): void {
      const group = new THREE.Group();
      const col = new THREE.Mesh(beaconGeo, beaconMat); col.position.y = 20;
      const c = document.createElement("canvas"); c.width = 256; c.height = 64;
      const g = c.getContext("2d")!;
      g.fillStyle = "rgba(20,30,40,0.85)"; g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#ffd27a"; g.font = "bold 26px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text.slice(0, 22), 128, 34);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      tag.position.y = 4.3; tag.renderOrder = 10; // U14 (4): over a person's label with its trade and mark (its top: ~3.7 m)
      group.add(col, tag); group.position.set(x, 0, z);
      world.add(group);
      beacons.push({ group, until: performance.now() + ms });
    },
    /** Beacons alive right now (for checks). */
    beaconCount(): number { return beacons.length + waypoints.size; },
    /** H9: the point of the ground (y = 0) under a point of the screen (CSS pixels, like a drop's clientX/Y), or null
     * when that ray never meets the ground (the sky) or meets it too far away. */
    sueloBajo(clientX: number, clientY: number): { x: number; z: number } | null {
      const r = renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
      const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      return p && p.distanceTo(camera.position) <= 150 ? { x: p.x, z: p.z } : null;
    },
    /** J5: a name that stays over a thing (`key` as in place), or `null` to take it away. U14 (4): `sub` = a smaller
     * second line (a person's trade), `mark` = «!» or «✓» above the name. The plate's bottom edge stays where a plain
     * name's was (just over the head): a trade or a mark grow it upwards. Same text and mark = only moved. */
    tag(key: string, t: DatosRotulo | null): void {
      if (!t) { dropTag(key); return; }
      const firma = `${t.mark || ""}\n${t.text}\n${t.sub ?? ""}`, y = t.y - (ROT_NOMBRE / 2) * ROT_M, antes = tags.get(key);
      if (antes && antes.firma === firma) { antes.s.position.set(t.x, y, t.z); antes.x = t.x; antes.y = t.y; antes.z = t.z; return; }
      dropTag(key);
      const c = dibujarRotulo(t), tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.name = `nombre:${key}`; s.center.set(0.5, 0); s.userData.alto = c.height * ROT_M; s.scale.set(ROT_ANCHO * ROT_M, c.height * ROT_M, 1); s.position.set(t.x, y, t.z); s.renderOrder = 10;
      s.visible = false; // U22: shown by updateRotulos (looked at, speaking, marked, or «todos»)
      world.add(s); tags.set(key, { s, firma, x: t.x, y: t.y, z: t.z, marca: !!t.mark });
    },
    /** J5: names over things alive right now (for checks). */
    tagCount(): number { return tags.size; },
    /** U14 (4): label canvases drawn since the page started (for checks: it must not grow while nothing changes). */
    tagDraws(): number { return tagDibujos; },
    /** J4: the key of the placed thing (or of the thing whose name it is) under a screen point, nearest first; null if none. */
    pickThing(clientX: number, clientY: number): string | null {
      const r = renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObjects([...[...things.values()].map((s) => s.group), ...[...tags.values()].map((r) => r.s)], true)) {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          if (o.name.startsWith("objeto:")) return o.name.slice(7);
          if (o.name.startsWith("nombre:")) return o.name.slice(7);
        }
      }
      return null;
    },
    /** ux2-gente: the entity of the other person under a screen point (the nearest), or null. Each body is projected
     * feet and head (cheap: one Vector3 per person on a click, never per frame); the rule is gente-politica.ts. */
    pickPerson(clientX: number, clientY: number): number | null {
      const r = renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      camera.updateMatrixWorld();
      const v = new THREE.Vector3(), lista: Proyectada[] = [];
      const aPantalla = (x: number, y: number, z: number) => { v.set(x, y, z).project(camera); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; };
      for (const [id, m] of others) {
        if (!m.visible && !m.parent) continue;
        const prof = v.copy(m.position).applyMatrix4(camera.matrixWorldInverse).z * -1;
        lista.push({ id, prof, pies: aPantalla(m.position.x, m.position.y - 0.85, m.position.z), cabeza: aPantalla(m.position.x, m.position.y + 0.9, m.position.z) });
      }
      const q = personaEn(lista, clientX, clientY);
      if (q === null) return null;
      // not through a wall: a thing drawn between you and them (nearer than their body) keeps the click
      const m = others.get(q)!;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hasta = camera.getWorldPosition(v).distanceTo(m.position) - 0.6;
      const tapa = ray.intersectObjects([...things.values()].map((s) => s.group), true).find((h: THREE.Intersection) => h.object.visible);
      return tapa && tapa.distance < hasta ? null : q;
    },
    /** ux2-gente: where a person's head is on the screen (CSS pixels) and how far from you, for the small card beside
     * them; null when they are gone or behind the camera. */
    personaEnPantalla(id: number): { x: number; y: number; m: number } | null {
      const m = others.get(id); if (!m) return null;
      const r = renderer.domElement.getBoundingClientRect();
      camera.updateMatrixWorld();
      const v = new THREE.Vector3(m.position.x, m.position.y + 0.95, m.position.z).project(camera);
      if (v.z > 1 || v.z < -1) return null;
      const d = selfXZ ? Math.hypot(m.position.x - selfXZ.x, m.position.z - selfXZ.z) : 0;
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, m: d };
    },
    /** J5: a waypoint: a beacon that stays until `dropWaypoint(id)` and never keeps the page drawing. Returns its id. */
    waypoint(x: number, z: number, text: string): number { this.beacon(x, z, text, Infinity); waypoints.set(++waypointSeq, beacons.pop()!); return waypointSeq; },
    dropWaypoint(id: number): void { const w = waypoints.get(id); if (w) { dropBeacon(w); waypoints.delete(id); } },
    /** J5: the zone seen from above (the big map's picture), the footprints of what stands in it (the minimap's
     * landmarks) and a number that changes when they do. Cost and the two ways (gpu, huellas): cenital.ts.
     * U14: the picture is cut where the world's environment says (`mapa.corte`, `mapaCorte()`) unless `corte` is given. */
    cenital: (o?: { px?: number; incluir?: { x: number; z: number }; modo?: "gpu" | "huellas"; corte?: number }) => cenital.generar({ ...o, corte: o?.corte ?? entorno.corte() }),
    huellas: () => cenital.huellas(),
    cenitalVersion: () => cenital.version(),
    mapaCorte: () => entorno.corte(),
    /** H1: put a thing in the world, move it, change its model, or take it away (`null`). */
    place(key: string, t: Thing | null): void {
      const s = things.get(key);
      if (!t) { if (s) { s.mixer?.stopAllAction(); s.medio?.soltar(); s.group.parent?.remove(s.group); things.delete(key); waiting.delete(key); llevados.delete(key); } return; }
      if (!s) {
        const group = new THREE.Group(); group.name = `objeto:${key}`; world.add(group);
        const ns: Slot = { group, want: t, model: fichero(t), loaded: false, failed: false };
        things.set(key, ns); placeGroup(ns); waiting.add(key); pumpPronto(); return;
      }
      s.want = t; if (!editor.retiene(key, t) && !llevados.has(key)) placeGroup(s);
      pintar(s);
      if (s.model !== fichero(t) || (s.horneado && t.animate)) { s.mixer?.stopAllAction(); s.mixer = undefined; s.medio?.soltar(); s.medio = undefined; s.group.clear(); s.partes = undefined; s.radio = undefined; s.horneado = false; s.piezaCerca = undefined; s.piezaLejos = undefined; s.lod = undefined; s.preparando = undefined; s.nivel = undefined; s.mejorando = false; s.sinNivel = false; s.model = fichero(t); s.loaded = false; s.failed = false; waiting.add(key); pumpPronto(); } // a baked copy cannot move: load it whole
      else if (!t.animate && s.mixer) { s.mixer.stopAllAction(); s.mixer = undefined; }
    },
    /** Lote 5: the little hop of a clicked thing (reaccion.ts) for each key given; the keys not placed are ignored. Local: nothing is sent. */
    reaccionar(keys: readonly string[]): number { const t = performance.now(); let n = 0; for (const k of keys) if (things.has(k) && !k.startsWith("~")) { reacciones.set(k, t); n++; } return n; },
    /** For checks: where a placed thing is drawn right now (position and scale), or null. */
    dibujadoDe(key: string): { x: number; y: number; z: number; sx: number; sy: number } | null { const g = things.get(key)?.group; return g ? { x: g.position.x, y: g.position.y, z: g.position.z, sx: g.scale.x, sy: g.scale.y } : null; },
    /** For checks: the things hopping right now. */
    reaccionando(): string[] { return [...reacciones.keys()]; },
    /** H1: things placed, how many have their model drawn, and how many failed to load (for checks). `~` keys = the page's previews, not counted. */
    objects(): { placed: number; loaded: number; failed: number } {
      let placed = 0, loaded = 0, failed = 0;
      for (const [k, s] of things) { if (k.startsWith("~")) continue; placed++; if (s.loaded) loaded++; if (s.failed) failed++; }
      return { placed, loaded, failed };
    },
    /** U-mandos: a video's own, per-person pause/stop/volume (medios.ts `ControlVideo`), or `null` when `key` is not
     * a loaded video. Never touches the shared clock: it only changes what THIS person sees and hears. */
    controlVideo(key: string): ControlVideo | null { return things.get(key)?.medio?.controlVideo ?? null; },
    /** M18: the video screens drawn right now (their file loaded) and where they stand, for the page to pick the nearest. */
    pantallas(): { key: string; x: number; y: number; z: number }[] {
      const r: { key: string; x: number; y: number; z: number }[] = [];
      for (const [k, s] of things) if (s.want.kind === "video" && s.loaded && s.medio?.enVivo) r.push({ key: k, x: s.want.x, y: s.want.y, z: s.want.z });
      return r;
    },
    /** M18: show a live MediaStream (your shared screen) on a video screen, on this page only — nothing is sent anywhere;
     * `null` puts the file back. False when there is no loaded video screen with that key. */
    pantallaEnVivo(key: string, stream: MediaStream | null): boolean {
      const s = things.get(key);
      if (!s?.loaded || !s.medio?.enVivo) return false;
      s.medio.enVivo(stream);
      return true;
    },
    /**
     * C: the world within view, for the loading screen: how many pieces stand within view distance (the room and what is near, as
     * carga-orden.ts ranks them: what proximity loading defers is not counted), and how many of those are ready — the model
     * downloaded, its textures uploaded and its shaders compiled (`loaded` is set only after precompilar), or failed (it will not
     * come). Hidden things and sounds are not drawn, so they are not waited for. Avatars (their VRM and first clips) count too.
     */
    cargaMundo(): { total: number; listas: number; fallidas: number; avatares: { total: number; listos: number } } {
      const { total, listas, fallidas } = contarPiezas((function* () { for (const [k, s] of things) yield { key: k, kind: s.want.kind, hidden: s.want.hidden, sala: s.want.sala, distancia2: distance2(s), loaded: s.loaded, failed: s.failed }; })(), verOcultos);
      const a = avs.cargas();
      return { total: total + a.pedidas, listas: listas + (a.pedidas - a.pendientes), fallidas, avatares: { total: a.pedidas, listos: a.pedidas - a.pendientes } };
    },
    /** B3: how the world's models got their shaders ready before showing (precompilar.ts): prepared, batches, failures,
     * shown without waiting (ESPERA_MAX_MS), in the queue, ms per batch, and whether this GPU links in parallel. */
    shaders() { return precompilar.estado(); },
    /** t_159e18d2: has the VR warm-up finished (the programs a headset session draws were linked while hidden)? false where no VR exists. */
    vrCalentado(): boolean { return vrCalentado; },
    /** t_159e18d2: the entry veil — `activo` while it is up, `ultimo` how long the last one took (ms) and whether it hit VELO_MAX_MS instead of finishing. */
    veloVR() { return { activo: velo !== null, ultimo: ultimoVelo }; },
    /** t_159e18d2: shader pipelines linked inside a drawn frame instead of through compileAsync (compilaciones.ts): `tardias` counts those after
     * the loading screen came down (must stay 0 while walking), with the last few named in `recientes`. */
    compiles() { const luces: string[] = []; scene.traverseVisible((o) => { if ((o as THREE.Light).isLight) luces.push(`${o.name || o.type}${(o as THREE.Light).intensity ? "" : ":0"}`); }); return { ...compiles.estado(), lucesAvisadas, luces }; },
    /** The loading screen came down: from here a pipeline linked by a draw counts as late. */
    cargaOculta(): void { compiles.cargaLista(); },
    /** Zero the late counters (a check starts a walk). */
    reiniciarCompiles(): void { compiles.reiniciarTardias(); },
    /** J10: carry a placed thing (`key` as in place): in a hand in XR, beside you on a flat screen; `null` puts it back. */
    llevar(key: string, donde: Llevar | null): void {
      if (!donde) { if (llevados.has(key)) soltarLlevado(key); return; }
      if (llevados.get(key) === donde) return;
      if (llevados.has(key)) soltarLlevado(key);
      llevados.set(key, donde);
    },
    /** J10: what you carry and where (for checks). */
    llevando(): Record<string, Llevar> { return Object.fromEntries(llevados); },
    /** N18: put one of a person's goods (a model by its sha256) in their right hand or on their head, for everyone who
     * sees them (`"self"` = you); `null` takes it off. features/bienes decides who wears what (view.lleva). */
    vestir(t: Target, p: { model: string; donde: "mano" | "cabeza"; nombre?: string } | null, ranura?: "arma"): void { puestos.poner(t, p, ranura); },
    /** N18: a model (sha256) turning in its own small canvas — the sheet's «ver en 3D». Close it when it goes away. */
    vitrina(canvas: HTMLCanvasElement, model: string) { return crearVitrina(canvas, async () => (await getTools()).load(assetUrl(model)).then((g) => g.scene as THREE.Object3D), { pixelRatio: renderer.getPixelRatio() }); },
    /** N18 (for checks): who wears what, loaded, drawn this frame, and at what height. */
    puestos(): ReturnType<typeof puestos.estado> { return puestos.estado(); },
    /** J10: your hands in XR (manos.ts): rules, events, state. */
    manos,
    /** t_8217ffea (N2): in VR your own avatar is drawn under your head, head and arms collapsed (default yes; the setting controles.cuerpoVR). */
    get cuerpoVR(): boolean { return cuerpoVR; },
    set cuerpoVR(v: boolean) { cuerpoVR = v; avs.cuerpoPropio(v); },
    /** t_8217ffea (N1): in VR your hands wear your avatar's skin colour with circuit lights (default yes; controles.pielManosVR). Off = the plain skin. */
    get pielManosVR(): boolean { return pielManosVR; },
    set pielManosVR(v: boolean) { pielManosVR = v; },
    /** M22: the builder's hands (packages/render/src/gizmo.ts): select, the point under the pointer, gizmo, hold. */
    editor,
    /** M22: the key of the placed thing under a screen point (client px), or null. */
    pick: editor.pick,
    /** M22: the point under a screen point on the ground (y = 0) or on other things (not `ignorar`), or null. */
    puntoBajo: editor.puntoBajo,
    /** Who has a label right now (for checks). */
    labels(): Target[] { return [...labels.keys()]; },
    /** J1: VRM avatars (for checks): files loaded, clips, who wears which avatar and which clip plays. */
    avatares(): ReturnType<typeof avs.stats> { return avs.stats(); },
    /** J7b: play a move (the wheel's) on an avatar's VRM, or stop it (`null`); false = no VRM there (show a label). */
    movimiento(t: Target, mov: Movimiento | null): boolean { return avs.movimiento(t === "self" ? "yo" : t, mov); },
    /** t_3f0e5846: fetch the clips of the move the person is pointing at in the wheel; nothing at world entry. */
    precargarMovimientos(clips: readonly string[]): void { avs.precargar(clips); },
    /** asiento: a standing avatar faces `rumbo` (radians, atan2(dx, dz)); `undefined` = walk-driven again. */
    orientar(t: Target, rumbo: number | undefined): void { avs.orientar(t === "self" ? "yo" : t, rumbo); },
    /** J3: the name over an avatar (`null` takes it away); drawn for the nearest 32 within 24 m, never over yourself. */
    nameTag(t: Target, text: string | null): void { nombres.nameTag(t, text); },
    /** J3: a speech bubble over an avatar for `ms` (wrapped, up to 6 lines); the latest replaces the one before. */
    bubble(t: Target, text: string, ms: number): void { nombres.bubble(t, text, ms); },
    /** J3: where names, bubbles and labels sit — world y of the top of the drawn avatar. Default: the capsule's top
     * (centre y + 0.85); VRM avatars (J1) pass their head bone's height. */
    setHeadTop(fn: (t: Target, avatar: THREE.Object3D) => number): void { nombres.setTop(fn); },
    /** U22: show everybody's name (true while Alt, a touch button or a gamepad button is held), or only the one you look at and who speaks. */
    verNombres(todos: boolean): void { if (verTodos !== todos) { verTodos = todos; rotulosPendiente = true; } },
    /** U22: the key of the person you talk to (a name over a thing, as in `tag`: «pnj:alma»), shown while the dialogue lasts; null = none. */
    hablando(clave: string | null): void { if (hablando !== clave) { hablando = clave; rotulosPendiente = true; } },
    /** J3: names and bubbles the page holds, and whether each is drawn now (for checks). */
    nameTags() { return nombres.nameTags(); },
    /** MIS-265: runs `f` with the people's name plates and bubbles hidden (a picture for a public cover carries nobody's name). */
    sinRotulos<T>(f: () => T): T { return nombres.sinRotulos(f); },
    /** ia-visible S4: this avatar is an AI (`activa`|`dormida`) or no longer (`null`): its plate is always on, green, with an «IA» chip (and a moon asleep). `ojos` (t_5096d6f4) = the colour and shape of its model-size step, drawn on its face. */
    ia(t: Target, estado: "activa" | "dormida" | null, ojos?: { color: number; forma: "punto" | "ranura" | "redondo" | "estrella" } | null): void { nombres.ia(t, estado); aros.poner(t, estado); ojosIA.poner(t, estado === null ? null : ojos ?? null); burbujas.dormida(t, estado === "dormida"); rotulosPendiente = true; },
    /** t_466efdb8: this AI is thinking (the server says it was called and has not answered) or not any more: a «thinking» orb over its plate. Off on tier D and far away; one draw call for all of them. */
    pensando(t: Target, si: boolean): void { orbesIA.poner(t, si); },
    /** t_466efdb8: «menos movimiento» — the orbs stand still. */
    orbeQuieto(si: boolean): void { orbesIA.quieto(si); },
    /** t_466efdb8 (for checks): who thinks, how many orbs are drawn, that they share one mesh. */
    orbesIA() { return orbesIA.lista(); },
    /** ia-visible S5 (for checks): who has a ring, whether it is drawn, and how much the rings share (one geometry, one material per state). */
    aros() { return { lista: aros.lista(), ...aros.compartidos() }; },
    /** t_5096d6f4 (for checks): who has eyes (colour and shape), whether they are drawn, and how much the eyes share (one geometry per shape, one material per colour). */
    ojosIA() { return { lista: ojosIA.lista(), ...ojosIA.compartidos() }; },
    /** ia-llamar S9: this AI has an action bubble of this shape, radius and visibility (`null`: it has none now); `dormida` = it sleeps (dim, dashed). */
    burbuja(t: Target, cfg: { forma: "esfera" | "cupula" | "cilindro" | "caja"; radio: number; visible: "siempre" | "al-acercarte" | "nunca" } | null, dormida = false): void { burbujas.poner(t, cfg, dormida); },
    /** ia-llamar S9: you have just entered this AI's bubble: it lights up for a moment (not when its keeper chose «nunca»). */
    burbujaDestello(t: Target): void { burbujas.destellar(t, performance.now()); },
    /** ia-llamar S9 (for checks): who has a bubble (shape, radius, visibility, drawn or not, level) and how much the bubbles share. */
    burbujas() { return { lista: burbujas.lista(), ...burbujas.compartidos() }; },
    bubbles() { return nombres.bubbles(); },
    /** condiciones/c5: this avatar is (`true`) or is no longer (`false`: it accepted, it bursts) inside a bubble reading the world's norms; its plate says so
     * («<name> · <etiqueta>»). Cheap: one shared sphere and material; nothing is drawn for a world with nobody reading. */
    leyendo(entidad: number, si: boolean, etiqueta?: string): void { nombres.leyendo(entidad, si, etiqueta); pompas.poner(entidad, si, performance.now()); rotulosPendiente = true; },
    /** condiciones/c5 (for checks): who has a bubble, whether it is drawn, who is bursting, and how much the bubbles share. */
    pompas() { return { lista: pompas.lista(), ...pompas.compartidos() }; },
    /** True while a label, a bounce or a near animation is alive: the power policy must keep drawing. */
    /** U10: draw hidden spheres of sound (while building) or not (while playing). */
    verOcultos(si: boolean): void { verOcultos = si; for (const s of things.values()) placeGroup(s); },
    /** MIS-200 (t_9687b5fc): the world still loads models or shaders: the entry buttons wait (the same gate as the VR entry, not busy()). */
    cargando(): boolean { return loading > 0 || precompilar.pendientes() > 0; },
    busy(): boolean { return mediosSonando || labels.size > 0 || bounces.size > 0 || beacons.length > 0 || animatingNear || reacciones.size > 0 || loading > 0 || precompilar.pendientes() > 0 || cam.ocupada() || editor.activo() || avs.busy() || nombres.busy() || pompas.busy() || aros.busy() || ojosIA.busy() || orbesIA.busy() || burbujas.busy() || verTodos || rotulosPendiente || entorno.ocupado() || elementos.ocupado() || pesca.ocupado() || dados3d.ocupado() || tele.ocupado() || graboso.visible() || ancestros.ocupado(selfXZ); },
    /** Apply the power policy's current pixel ratio (call after `power.reportCost` returns true or battery changes). */
    applyPixelRatio(): void { renderer.setPixelRatio(power.pixelRatio()); renderer.setSize(innerWidth, innerHeight); power.paron(2); }, // B4: the next frames pay the resize
    /** What the last draw cost: draw calls and triangles (three's own counters; no screen needed). */
    lastFrame(): { calls: number; triangles: number } {
      const r = (renderer as unknown as { info: { render: { drawCalls: number; triangles: number } } }).info.render;
      return { calls: r.drawCalls, triangles: r.triangles };
    },
    /** N1: the camera — orbit, zoom, first person, build mode. See camara.ts. */
    cam,
    /** S5: the engine's one audio listener (it already runs every frame; this is for reading it). `null` only in
     * the instant between the first frame and its lazy module arriving. */
    oyente: (): Oyente | null => oyente,
    /** M18: the clock videos and sounds follow, in ms: pass the SERVER's (`session.relojServidorMs`) so every page is at the
     * same second; `null` (or a source that returns `null`) goes back to this computer's clock. */
    fijarRelojMundo,
    /** M18 (to measure): how far (s) from the world's clock each video that plays now is. */
    desfasesDeVideos,
    /** N1b: the world's solid boxes as the simulation holds them (Q16.16, `session.solidos()`): the camera does not go
     * through them and an avatar on a stair or a roof walks instead of «jumping». Cheap every frame (converted on change). */
    solidos(fx: Int32Array | null | undefined): void {
      if (!fx || fx === cajasFx) return;
      cajasFx = fx;
      const m = new Float32Array(fx.length);
      for (let i = 0; i < fx.length; i++) m[i] = fx[i] / 65536;
      cajasM = m;
      cam.paredes(fx);
      vr.paredes(cajasM as Float32Array); // N1c: real room-scale walking also stops at a wall now
    },
    /** avatares/suelo-relieve: where the world has relieve, the ground the simulation walks on (`session.sueloTerreno()`; null otherwise).
     * Avatars measure «in the air» from it (a hill is not a jump) and are drawn on the DRAWN terrain, not sunk in the coarser collision mesh. */
    sueloTerreno(t: SueloTerreno | null | undefined): void { sueloT = t ?? null; },
    /** Move the camera (N1), then draw. */
    draw(dtSeconds: number): void {
      // B4: tell the resolution policy what it must not measure — models still loading, or a frame in which three
      // compiled a new shader program (blocking, on its first draw) or something else created one since the last draw
      power.setCargando(loading > 0 || waiting.size > 0);
      try { dibujar(dtSeconds); } finally {
        compiles.primerCuadro();
        const p = programasVivos();
        if (p > programasVistos) power.paron();
        programasVistos = p;
      }
    },
    /** B4 (for checks): live shader programs as three counts them. */
    programas(): number { return programasVivos(); },
    /** MIS-200 t_ee19c84b: where the draw calls of the last frame come from, by category (the census of medidor-vivo.ts). The first call
     * returns null and asks for one: the next drawn frame walks the scene (so nothing is walked while nobody asks); read again after it. */
    censo(): Censo | null { censoPedido = true; return censoUltimo; },
    /** N12 (for checks): the last frame — from which distance the fog covers everything (m; Infinity = no fog), how
     * many things/people/names it hid, how many copies were drawn instanced and in how many lotes; `mallas` = the
     * instanced meshes those cost (≈ draw calls), `escrituras` = matrix uploads since the start (still = no uploads). */
    dibujo(): { lejos: number; niebla: number; instanciadas: number; lotes: number; mallas: number; escrituras: number } {
      const e = lotes.estado();
      return { ...dibujoUltimo, mallas: e.mallas, escrituras: e.escrituras };
    },
    loop(fn: (timeMs: number) => void): void { renderer.setAnimationLoop(fn); },
    get drawn(): number { return others.size + (selfMesh.visible ? 1 : 0); },
  };
}