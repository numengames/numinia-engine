// VR session (J6 + J10): immersive-vr, a rig that follows the avatar, stick = movement intentions (left), snap turn in
// fixed steps (right stick), comfort vignette, your hands (manos.ts: a hand holding each controller, or your tracked
// hands), a panel with what you are doing, a dialogue panel you answer with the ray, and short notes in front of you.
// render only reports intentions (`axes()` in -1..1, world frame) and choices; the sim and the server decide.
// Only offered where WebXR VR exists (Quest, Pico, desktop headsets); phones and iPhone never see the button.
// Buttons (xr-standard): A or X jump · B (right) closes the menu or leaves the dialogue · Y (left) opens/closes the menu ·
// trigger uses what the ray points at · grip takes what the hand touches · right stick: turn (sideways), and up/down
// moves through a dialogue's answers (A or the trigger chooses).
// Rediseño v2 (story E, maquetas p6/p7): turn the back of the LEFT wrist towards you and a watch shows on it (muneca.ts:
// «Menú» in the middle, microphone · camera · notices · back to the city around); «Menú» (or Y) opens the menu panel
// still in front of you at 1.2 m (menu-invocado.ts) with the computer's sections; B, «Menú» again or its X close it.
import * as THREE from "three/webgpu";
import type { Lado, Panel } from "./manos.ts";
import { ladosDelMenu, type ManoMenuVR } from "./mano-menu.ts"; // t_d5f5523a: which hand carries the watch
import { createReloj, type EstadoReloj } from "./muneca.ts";
import { createMenuInvocado, type Proveedor } from "./menu-invocado.ts";
import { createAviso } from "./muneca-aviso-vr.ts"; // v1: the first-time «turn your wrist» notice
import type { BotonReloj, Vista } from "./menu-vr.ts";
import type { PathsIcono } from "./vr-pintura.ts";
import type { AccionFichaVR, DatosFichaVR, FichaVR } from "./vr-ficha.ts"; // types only: the panel itself is fetched on first use (C5)
import type { CondicionesVR } from "./condiciones-vr.ts"; // types only: the entry bubble's panel is fetched on first use (c4)
import { ID_BARRA, palancaPagina, palancasDelPanel, type EntradaMano, type LadoMano, type ModeloVR, type Zona } from "./condiciones-vr-geom.ts"; // pure numbers, no three.js
import { empujaFuera } from "./vr-paredes.ts";
import { crearRemo, REMO_RITMO } from "./remo.ts"; // MIS-229: rowing with the hands
import { completarSesionXR, textoDeFallo } from "./xr-compat.ts"; // old headset browsers lack XRSession.enabledFeatures (Chrome 105)
import { calentarOcultos } from "./precompilar.ts"; // MIS-200: warm what only VR draws while it is still hidden
import { crearEstable } from "./entrada-estable.ts"; // MIS-200: no VR drawing until the first calm frames
import { aplicarRendimiento, normalizarRendimiento, pedirFrecuencia, type RendererLike, type RendimientoXR, RENDIMIENTO_DEFECTO } from "./rendimiento-xr.ts"; // MIS-200: foveation, scale, multiview, 72 Hz
import { audio } from "./audio/nucleo.ts"; // S1: the engine's one audio graph (it sleeps when the session ends)
/** The hands (manos.ts) as the view hands them over: loaded on entering (`cargar`), then mounted. */
export type ManosXR = { cargar(): Promise<unknown>;
  /** MIS-200: the hands' root group (once loaded), so its programs can be warmed before the session. */
  raiz?(): THREE.Object3D | null; montar(p: THREE.Object3D | null): void; update(c: THREE.Camera | null): void; andar?(excluida?: Lado | null): [number, number] | null;
  /** MIS-229 (rowing): the tracked hands pinching in empty air, world space. */
  remar?(excluida?: Lado | null): { lado: Lado; x: number; y: number; z: number }[];
  /** t_8d0bc2dd: true once per jump made with the hands (both wrists flicked up); reiniciarSalto forgets the gesture's history. */
  takeSalto?(): boolean; reiniciarSalto?(): void;
  /** t_bf8947cf: where a controller points, flattened (world, unit); null without that controller. */
  dirMando?(lado: "izq" | "der"): [number, number] | null;
  /** Rediseño v2: a hand's wrist (world) and what presses by touch on the other hand (manos.ts). */
  muneca?(lado: Lado, pos: THREE.Vector3, rot: THREE.Quaternion): { esMano: boolean } | null;
  punta?(lado: Lado, pos: THREE.Vector3): boolean;
  /** t_41d8e44c: a feature holds a hand (manos.ts `ocupar`; the view's facade keeps it until the hands arrive). */
  ocupar?(nombre: string, fn: (lado: Lado) => boolean): () => void;
  /** c8 (the entry bubble's panel is taken by its bar): what a hand's buttons say, what its ray points at, and the ray (manos.ts). */
  entrada?(lado: Lado): { gatillo: number; agarre: number; mano: boolean } | null;
  sondeo?(lado: Lado): { candidato: string | null; apunta: string | null } | null;
  rayo?(lado: Lado): { origen: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } | null };
/** t_bf8947cf (MVL1): how the left stick's push becomes a world direction — settings menu, remembered.
 * mirada: forward is where the head looks (as shipped). mando: forward is where the left controller points.
 * cuerpo: forward is the rig's own facing (only snap turns move it) — looking around does not redirect it. */
export type ModoMovimientoVR = "mirada" | "mando" | "cuerpo";
/** MIS-229: how tracked hands walk — point (pinch and hold: go where the hand points, as shipped) or row (pull back = faster, push forward = brake). */
export type GestoAndarVR = "apuntar" | "remar";

export const SNAP_DEG = 30;
/** Rediseño v2 (VR settings): the snap turn's steps the menu offers, and the stick's pace and the floor's lift limits. */
export const GIROS_DEG = [15, 30, 45] as const;
export const VELOCIDAD = { min: 0.4, max: 1 } as const;
export const ALTURA_M = { min: -0.3, max: 0.6 } as const;
export const DEADZONE = 0.2;
/** How long a note stays in front of you (ms). */
export const NOTA_MS = 3500;
/** t_ab71cff0: the stick's intention is only trusted this long after the last XR frame (a hidden session has none). */
export const INTENCION_CADUCA_MS = 1000;
/** «Salir de VR»: the second press must come within this long of the first (ms). */
export const SALIR_CONFIRMA_MS = 3000;

type XRLike = { isSessionSupported(mode: string): Promise<boolean>; requestSession(mode: string, init?: object): Promise<any> };
/** MIS-200: how long enter() waits for the hands before asking for the session (the click's activation is short-lived). */
const ESPERA_MANOS_MS = 1500;
const xrOf = (): XRLike | null => (typeof navigator !== "undefined" && (navigator as unknown as { xr?: XRLike }).xr) || null;

/** True only when this device can run an immersive-vr session. Never throws. */
export async function vrSupported(): Promise<boolean> {
  const xr = xrOf();
  if (!xr) return false;
  try { return await xr.isSessionSupported("immersive-vr"); } catch { return false; }
}

export type VRState = "off" | "on";
export type VRHooks = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  manos?: ManosXR;
  onChange?: (state: VRState) => void;
  /** MIS-200: true while the world still has loading work (models, compiles); the VR extras wait for it to end (entrada-estable.ts). */
  ocupado?: () => boolean;
  /** The house's Phosphor icons for the watch and the menu (apps/plaza/iconos.ts); without them, text only. */
  iconos?: PathsIcono;
};
/** A conversation as the dialogue panel shows it. */
export type DialogoVR = { nombre: string; texto: string; opciones: string[] };

/** Stick value after dead zone, rescaled so it starts at 0. */
export function deadzone(v: number): number {
  const a = Math.abs(v);
  return a < DEADZONE ? 0 : Math.sign(v) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
}

/** MVL1: the comfort vignette's steps, cycled by the wrist/panel «Ajustes» button — never a free dial in VR
 * (a slider needs a ray dragged steadily, which room-scale users rarely have); three named stops are enough. */
export const NIVELES_CONFORT = [0.3, 0.6, 1] as const;
export const NOMBRES_CONFORT = ["bajo", "medio", "alto"] as const;
/** The next comfort value after the current one, wrapping back to the first (pure: no THREE, no DOM). */
export function siguienteConfort(actual: number): number {
  const i = NIVELES_CONFORT.findIndex((v) => Math.abs(v - actual) < 1e-6);
  return NIVELES_CONFORT[(i < 0 ? 0 : i + 1) % NIVELES_CONFORT.length];
}
/** The comfort value's name for the panel («bajo/medio/alto»), the nearest step if it was set to anything else. */
export function nombreConfort(v: number): string {
  let mejor = 0, dist = Infinity;
  NIVELES_CONFORT.forEach((n, i) => { const d = Math.abs(n - v); if (d < dist) { dist = d; mejor = i; } });
  return NOMBRES_CONFORT[mejor];
}

/** Words into lines of at most `max` characters (no word is cut unless it alone is longer). */
export function envolver(texto: string, max: number): string[] {
  const out: string[] = [];
  let l = "";
  for (const w of texto.split(/\s+/).filter(Boolean)) {
    if (!l) l = w;
    else if (l.length + 1 + w.length <= max) l += " " + w;
    else { out.push(l); l = w; }
    while (l.length > max) { out.push(l.slice(0, max)); l = l.slice(max); }
  }
  if (l) out.push(l);
  return out;
}

/** A canvas on a plane (text panels). */
function lienzo(w: number, hgt: number, ancho: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = hgt;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(ancho, (ancho * hgt) / w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  malla.renderOrder = 20;
  return { c, g, tex, malla };
}

export function createVR(h: VRHooks) {
  const rig = new THREE.Group(); // the player's floor: follows the avatar, turns in snaps
  rig.visible = false;
  h.scene.add(rig);

  // comfort vignette: a dark ring stuck to the eyes, only visible while moving/turning
  const vc = document.createElement("canvas"); vc.width = vc.height = 128;
  const g = vc.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
  );
  vignette.position.set(0, 0, -0.15);
  vignette.renderOrder = 999;
  vignette.frustumCulled = false;

  // the panel: what you are doing (the followed quest) and how the session goes. Y brings it in front of you.
  const P = lienzo(640, 400, 0.72);
  const panel = P.malla;
  panel.position.set(-0.55, 1.35, -1.0);
  panel.rotation.y = 0.45;
  rig.add(panel);
  let panelText = "", panelDelante = false, pagina: "mision" | "mandos" | "ajustes" = "mandos";
  function setPanel(lines: string[]): void {
    const t = lines.join("\n");
    if (t === panelText) return; // nothing changed: no texture upload
    panelText = t;
    const pg = P.g;
    pg.clearRect(0, 0, 640, 400);
    pg.fillStyle = "rgba(20,30,40,0.88)"; pg.fillRect(0, 0, 640, 400);
    let y = 48;
    lines.slice(0, 8).forEach((l, i) => {
      pg.fillStyle = i === 0 ? "#ffd27a" : l.startsWith("✓") ? "#9fd8a0" : "#ffffff";
      pg.font = i === 0 ? "bold 32px sans-serif" : "26px sans-serif";
      for (const s of envolver(l, i === 0 ? 34 : 42).slice(0, 2)) { if (y < 392) pg.fillText(s, 22, y); y += i === 0 ? 40 : 34; }
      y += 4;
    });
    P.tex.needsUpdate = true;
  }

  // «Salir de VR» (motor-vr t_ad0fe9c3, Pablo: «tendría que poder salir hacia afuera con un botón»): a button under
  // the panel, pointed at with the ray of a controller or a hand and pressed (trigger / pinch) twice — the first
  // press asks, the second within SALIR_CONFIRMA_MS leaves — so a stray pinch never throws you out of the world.
  const S = lienzo(384, 88, 0.3);
  const salirMalla = S.malla;
  salirMalla.position.set(0, -0.31, 0.005);
  panel.add(salirMalla);
  let salirEncimaEn = 0, salirPideHasta = 0, salirPintado = "";
  function pintarSalir(): void {
    const ahora = performance.now(), encimaYa = ahora - salirEncimaEn < 120, pide = ahora < salirPideHasta;
    const firma = `${encimaYa}|${pide}`;
    if (firma === salirPintado) return;
    salirPintado = firma;
    const sg = S.g;
    sg.clearRect(0, 0, 384, 88);
    sg.fillStyle = pide ? "#e07a5f" : encimaYa ? "#ffd27a" : "rgba(20,30,40,0.9)"; sg.fillRect(0, 0, 384, 88);
    sg.strokeStyle = "#ffd27a"; sg.lineWidth = 4; sg.strokeRect(2, 2, 380, 84);
    sg.fillStyle = pide || encimaYa ? "#1a2430" : "#ffffff"; sg.font = "bold 34px sans-serif"; sg.textAlign = "center";
    sg.fillText(pide ? "¿Salir? Pulsa otra vez" : "Salir de VR", 192, 56);
    sg.textAlign = "start";
    S.tex.needsUpdate = true;
  }
  pintarSalir();
  const panelSalir: Panel = {
    malla: salirMalla,
    fila() { return 1; },
    encima() { salirEncimaEn = performance.now(); pintarSalir(); },
    pulsar() {
      if (performance.now() < salirPideHasta) { salirPideHasta = 0; pintarSalir(); void exit(); return; }
      salirPideHasta = performance.now() + SALIR_CONFIRMA_MS; pintarSalir();
    },
  };
  // MVL1 (Pablo: «no he visto los ajustes dentro del visor»): the panel's third page («Y» cycles mandos → misión →
  // ajustes → hidden) shows the comfort vignette's current step and a button under it, same spot as «Salir de VR»
  // would sit on other pages, pointed at and pressed to cycle bajo/medio/alto — a wrist-reachable VR-native entry
  // into a real engine setting, without a server round trip (the comfort vignette is pure client preference,
  // the same as `comfort` below): no slider, since dragging a ray steadily is hard room-scale (§4 FISICAS-CAMARA-
  // AJUSTES-MAPA.md, 16:9 panel's «Controles» tab is the flat-screen twin of this one value).
  const AJ = lienzo(384, 88, 0.3);
  const ajusteMalla = AJ.malla;
  ajusteMalla.position.set(0, -0.31, 0.005);
  panel.add(ajusteMalla);
  ajusteMalla.visible = false;
  let ajusteEncimaEn = 0, ajustePintado = "";
  function pintarAjuste(): void {
    if (pagina !== "ajustes") return;
    const encimaYa = performance.now() - ajusteEncimaEn < 120;
    const firma = `${encimaYa}|${comfort}`;
    if (firma === ajustePintado) return;
    ajustePintado = firma;
    const ag = AJ.g;
    ag.clearRect(0, 0, 384, 88);
    ag.fillStyle = encimaYa ? "#ffd27a" : "rgba(20,30,40,0.9)"; ag.fillRect(0, 0, 384, 88);
    ag.strokeStyle = "#ffd27a"; ag.lineWidth = 4; ag.strokeRect(2, 2, 380, 84);
    ag.fillStyle = encimaYa ? "#1a2430" : "#ffffff"; ag.font = "bold 30px sans-serif"; ag.textAlign = "center";
    ag.fillText(`Confort: ${nombreConfort(comfort)} (pulsa)`, 192, 56);
    ag.textAlign = "start";
    AJ.tex.needsUpdate = true;
  }
  const panelAjuste: Panel = {
    malla: ajusteMalla,
    fila() { return 1; },
    encima() { ajusteEncimaEn = performance.now(); pintarAjuste(); },
    pulsar() { comfort = siguienteConfort(comfort); ajustePintado = ""; pintarAjuste(); },
  };
  // the dialogue panel: who talks, what they say, and up to four answers you point at (or move to with the stick)
  const D = lienzo(1024, 680, 1.15);
  const dialogoMalla = D.malla;
  dialogoMalla.visible = false;
  rig.add(dialogoMalla);
  let dialogo: DialogoVR | null = null, encima = 0, dibujado = "";
  const FILA0 = 420, FILA_H = 62; // canvas px where the answers start, and each answer's height
  function pintarDialogo(): void {
    const d = dialogo;
    if (!d) return;
    const firma = JSON.stringify([d, encima]);
    if (firma === dibujado) return;
    dibujado = firma;
    const dg = D.g;
    dg.clearRect(0, 0, 1024, 680);
    dg.fillStyle = "rgba(20,30,40,0.92)"; dg.fillRect(0, 0, 1024, 680);
    dg.fillStyle = "#ffd27a"; dg.font = "bold 40px sans-serif"; dg.fillText(d.nombre.slice(0, 40), 32, 60);
    dg.fillStyle = "#ffffff"; dg.font = "32px sans-serif";
    envolver(d.texto, 56).slice(0, 8).forEach((l, i) => dg.fillText(l, 32, 112 + i * 40));
    d.opciones.slice(0, 4).forEach((o, i) => {
      const y = FILA0 + i * FILA_H, sel = encima === i + 1;
      dg.fillStyle = sel ? "#ffd27a" : "rgba(255,255,255,0.12)"; dg.fillRect(24, y, 976, FILA_H - 8);
      dg.fillStyle = sel ? "#1a2430" : "#ffffff"; dg.font = "bold 30px sans-serif";
      dg.fillText(`${i + 1}. ${o}`.slice(0, 60), 40, y + 38);
    });
    dg.fillStyle = "rgba(255,255,255,0.6)"; dg.font = "24px sans-serif";
    dg.fillText("Apunta y aprieta el gatillo · B: salir", 32, 664);
    D.tex.needsUpdate = true;
  }
  const panelDialogo: Panel = {
    malla: dialogoMalla,
    fila(uv) { const y = (1 - uv.y) * 680, n = Math.floor((y - FILA0) / FILA_H) + 1; return dialogo && n >= 1 && n <= dialogo.opciones.length && y >= FILA0 ? n : 0; },
    encima(n) { if (n !== encima) { encima = n; pintarDialogo(); } },
  };
  const delante = (m: THREE.Object3D, dist: number, abajo: number) => { // put a panel in front of the eyes, facing them
    const cam = h.renderer.xr.getCamera();
    const ojo = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), dir = new THREE.Vector3();
    cam.getWorldDirection(dir); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const p = ojo.clone().addScaledVector(dir, dist); p.y -= abajo;
    rig.worldToLocal(p); m.position.copy(p);
    const mira = ojo.clone(); mira.y -= abajo; rig.worldToLocal(mira);
    m.lookAt(rig.localToWorld(mira.clone()));
  };

  // a note in front of you for a few seconds (quest steps done, «get closer», …)
  const N = lienzo(768, 112, 0.62);
  const nota = N.malla; nota.visible = false; nota.position.set(0, -0.22, -0.9); (nota.material as THREE.MeshBasicMaterial).depthTest = false;
  let notaHasta = 0, notaTexto = "";

  // N1c: room-scale walking (the player's real steps) moves the head INSIDE the rig via the headset's own
  // tracking — the sim never sees it (only the stick feeds `step()`), so until now a real step walked the
  // eye straight through a column or wall. `empuje` is the correction accumulated so far, applied on top
  // of the sim's `self` position every frame (that position keeps getting reset by the stick/server each
  // tick, so the push must be re-added, not stored on self).
  let cajas: Float32Array | null = null;
  let empujeX = 0, empujeZ = 0, chocaHasta = 0;
  const cabeza = new THREE.Vector3();

  let state: VRState = "off";
  let session: any = null;
  let comfort = 0.8; // 0 = off, 1 = strongest
  let modoMovimiento: ModoMovimientoVR = "mirada"; // t_bf8947cf: settings menu, remembered by the registry
  let gestoAndar: GestoAndarVR = "apuntar"; // MIS-229: the setting controles.gestoAndarVR
  const remo = crearRemo(), manosRemo: { lado: string; delante: number }[] = [];
  let rendimiento: RendimientoXR = { ...RENDIMIENTO_DEFECTO }; // MIS-200: «Rendimiento en gafas», applied on entering
  let giroDeg: number = SNAP_DEG, yawDeg = 0, velocidad = 1, alturaM = 0; // rediseño v2: the menu's VR settings
  let moveX = 0, moveZ = 0, turnLatched = false, strength = 0, navLatched = false;
  let ultimoFotograma = 0; // performance.now() of the last update(): axes() goes stale after INTENCION_CADUCA_MS
  // J2: A (right) or X (left) = jump, like Hyperfy2's A; a press waits here until the page's next tick takes it
  let jumpWanted = false;
  const held = { left: [false, false, false], right: [false, false, false] }; // [A/X, B/Y, -] last frame
  const dir = new THREE.Vector3();
  const set = (s: VRState) => { if (s !== state) { state = s; h.onChange?.(s); } };
  const oyentes = { elegir: new Set<(n: number) => void>(), atras: new Set<() => void>(), ficha: new Set<(a: AccionFichaVR) => void>() };
  // C5: the object card panel — built the first time it is needed (a separate chunk: flat-screen players never download it)
  let fichaVR: FichaVR | null = null, fichaPide: DatosFichaVR | null = null, fichaCargando = false;
  // c4: the entry bubble's panel (condiciones-vr.ts), built the first time the page asks, and who listens to its presses and to the stick turning pages
  /** c8: what each hand says this frame, for the entry bubble's grab bar (only asked while that panel is up). */
  const manosParaBarra = (): EntradaMano[] => (["izq", "der"] as LadoMano[]).flatMap((lado) => {
    const en = h.manos?.entrada?.(lado); if (!en) return [];
    return [{ lado, gatillo: en.gatillo > 0.5, apuntaBarra: h.manos?.sondeo?.(lado)?.apunta === `panel:${ID_BARRA}`, rayo: h.manos?.rayo?.(lado) ?? null }];
  });
  let condPendiente: ModeloVR | null = null, condVR: CondicionesVR | null = null, condCargando: Promise<CondicionesVR> | null = null, pagLatched = false;
  const oyentesCond = { pulsa: new Set<(z: Zona) => void>(), pagina: new Set<(dir: -1 | 1) => void>() };
  // the object card sits LOW and to the LEFT of your line of sight (vr-ficha.ts `puntoFicha`): the ray to the thing you are working on,
  // straight ahead, must not pass through it, and the right hand — the one that points — stays clear of it. v13: it follows your head
  // (`fichaVR.seguir` each frame) and steps aside while the VR menu is open.
  const fichaOjo = new THREE.Vector3(), fichaMira = new THREE.Vector3();
  const fichaCabeza = () => {
    const cam = h.renderer.xr.getCamera();
    fichaOjo.setFromMatrixPosition(cam.matrixWorld); cam.getWorldDirection(fichaMira);
    return { ojo: fichaOjo, mira: fichaMira };
  };

  // Rediseño v2 (story E): the wrist watch (left wrist) and the menu panel. Both live in the WORLD (scene), not the rig:
  // the watch is placed on the wrist each frame, the menu stays where it opened while you walk or turn.
  // t_d5f5523a: the watch hand is the setting vrManoMenu (default left); the other hand presses it. Both swap together.
  let manoMenu: ManoMenuVR = "izq";
  let LADO_RELOJ: Lado = "izq", LADO_PUNTA: Lado = "der";
  const elegirManoMenu = (v: ManoMenuVR): void => { manoMenu = v; const l = ladosDelMenu(v); LADO_RELOJ = l.reloj; LADO_PUNTA = l.punta; };
  const oyentesV2 = { reloj: new Set<(b: BotonReloj) => void>(), pulsa: new Set<() => void>() };
  const avisarPulsa = () => { for (const f of oyentesV2.pulsa) try { f(); } catch { /* a page's sound must not break VR */ } };
  let pathsIcono: PathsIcono = h.iconos ?? (() => []);
  const iconos: PathsIcono = (n) => pathsIcono(n); // the page hands the house's icons over later (`vr.iconos(fn)`)
  const reloj = createReloj({ scene: h.scene, iconos });
  // t_41d8e44c (its one line): while the watch shows, its hand is busy (no pinch-walk, no ray, no grab with it)
  h.manos?.ocupar?.("reloj", (lado) => reloj.visible && lado === LADO_RELOJ);
  const menu = createMenuInvocado({ scene: h.scene, iconos, salir: () => { void exit(); }, alPulsar: avisarPulsa });
  const aviso = createAviso({ camera: h.camera }); // v1: shown once per device, the first time you enter VR (muneca-aviso.ts)
  let estadoRelojPagina: () => Omit<EstadoReloj, "menuAbierto"> = () => ({ micro: null, camara: false, avisos: 0, ciudad: false });
  reloj.estado(() => ({ ...estadoRelojPagina(), menuAbierto: menu.abierto }));
  const ojoV = new THREE.Vector3(), miraV = new THREE.Vector3(), munPos = new THREE.Vector3(), puntaV = new THREE.Vector3();
  const munRot = new THREE.Quaternion();
  function leerOjos(): void {
    const cam = h.renderer.xr.getCamera();
    ojoV.setFromMatrixPosition(cam.matrixWorld); cam.getWorldDirection(miraV);
  }
  /** «Menú» / Y: open the menu in front of the eyes (at `en`, or where it was) or close it. Returns whether it is open. */
  function alternarMenu(en?: Vista): boolean {
    if (!session || condVR?.abierto || (dialogo && dialogoMalla.visible)) return false; // c4: with the entry bubble up there is no menu (nothing in it works yet); t_166720f3: nor while a dialogue is in front
    leerOjos();
    const abre = !menu.abierto;
    const ok = menu.alternar(ojoV, miraV, en);
    if (abre && ok) panel.visible = false; // the old help card steps aside: one panel in front of you
    return ok;
  }
  reloj.alPulsar((b) => {
    avisarPulsa();
    if (b === "menu") { alternarMenu(); return; }
    if (b === "avisos") { if (menu.abierto) menu.ir("avisos"); else alternarMenu("avisos"); }
    for (const f of oyentesV2.reloj) try { f(b); } catch (e) { console.warn("[reloj]", e); }
  });

  /** MIS-200 (t_fb2f9e37): link the programs of everything VR draws — rig (panels, «Salir», dialogue), vignette, note, watch, menu,
   * entry notice, hands — while it is all still hidden, so the first VR frame does not stop to compile them. `compilar` is
   * renderer.compileAsync(o, camera, scene). Resolves with how many objects were handed over. */
  function calentar(compilar: (o: THREE.Object3D) => Promise<unknown>): Promise<number> {
    const objs = [rig, vignette, nota, reloj.malla, menu.malla, aviso.malla, h.manos?.raiz?.(), condVR?.malla];
    return calentarOcultos(objs as never, compilar as never);
  }

  let lastError = ""; // why the last enter() failed (T1 report)
  let estable = crearEstable({ ocupado: h.ocupado });
  let mostrado = false; // the VR extras are on screen (false from entering until the first calm frames)
  async function enter(): Promise<boolean> {
    const xr = xrOf();
    if (!xr || session) return false;
    // MIS-200 (t_04ada0ed): the hands come first. Normally they are prefetched and this is instant; if not, wait for them
    // only while the click's activation (needed by requestSession) is still fresh, and finish before setSession either way.
    const manosListas = (h.manos?.cargar() ?? Promise.resolve()).catch(() => {});
    await Promise.race([manosListas, new Promise((ok) => setTimeout(ok, ESPERA_MANOS_MS))]);
    if (session) return false; // a second click while waiting
    try { session = completarSesionXR(await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] })); } catch (e) { lastError = textoDeFallo(e); session = null; return false; }
    // From here the session is ours: if anything below throws (three's setSession on an old browser…), it is ended and
    // forgotten, or `session` would stay set and every later enter() would answer false with no reason (a zombie).
    try {
      await manosListas; // still before setSession: the session is not handed to three until the hands exist
      h.renderer.xr.enabled = true;
      h.renderer.xr.setReferenceSpaceType("local-floor");
      aplicarRendimiento(h.renderer as unknown as RendererLike, rendimiento); // scale + multiview are read by setSession
      await h.renderer.xr.setSession(session);
      // Nothing of VR is shown yet (rig stays hidden): the world is all you see until update() finds calm frames (mostrarVR).
      void pedirFrecuencia(session); // Quest lists 72 Hz; Pico (Chrome 105) has no list: nothing happens
      rig.add(h.camera);
      h.camera.add(vignette, nota);
      h.manos?.montar(rig);
      estable = crearEstable({ ocupado: h.ocupado, periodoMs: session.frameRate ? 1000 / session.frameRate : undefined }); mostrado = false;
      session.addEventListener("end", () => {
        session = null; h.manos?.reiniciarSalto?.(); moveX = moveZ = 0; strength = 0; fichaVR?.ocultar(); fichaPide = null; reloj.cerrar(); menu.cerrar(); aviso.cerrar(); condVR?.ocultar(false); condPendiente = null; pagLatched = false;
        h.camera.remove(vignette, nota); rig.remove(h.camera); rig.visible = false; mostrado = false;
        h.manos?.montar(null);
        h.renderer.xr.enabled = false;
        audio().siesta(); // S1: out of the session, the audio graph sleeps (battery); the next gesture wakes it
        set("off");
      });
      // t_ab71cff0: a controller that falls asleep (Quest hands over to tracked hands) or a session that stops being
      // visible must not leave its last push behind as the intention; the next frame recomputes it from what is there
      session.addEventListener("inputsourceschange", () => { moveX = moveZ = 0; });
      session.addEventListener("visibilitychange", () => { moveX = moveZ = 0; });
    } catch (e) {
      lastError = textoDeFallo(e);
      const caida = session; session = null;
      try { h.camera.remove(vignette, nota); rig.remove(h.camera); rig.visible = false; h.manos?.montar(null); } catch { /* half-built: nothing more to undo */ }
      h.renderer.xr.enabled = false;
      try { await caida?.end(); } catch { /* already over */ }
      set("off");
      return false;
    }
    set("on");
    return true;
  }
  /** The first calm frames are over: the rig (panels, hands), the entry notice and the help card appear together. */
  function mostrarVR(): void {
    mostrado = true;
    aviso.nueva();
    rig.visible = true;
    pagina = "mandos"; panel.visible = true; panelDelante = false; // the first thing you see: how the controllers work
    ajusteMalla.visible = false; salirMalla.visible = true;
  }
  async function exit(): Promise<void> { if (session) await session.end(); }

  /** Call every frame while presenting; `self` is where the avatar is (metres; J2: the floor rises with its jumps). */
  function update(self: { x: number; z: number; y?: number } | null, dtSeconds: number): void {
    if (!session) return;
    ultimoFotograma = performance.now();
    if (!mostrado) { // MIS-200: no VR drawing until the frames are calm; meanwhile only the avatar's floor follows
      if (self) rig.position.set(self.x + empujeX, (self.y ?? 0) + alturaM, self.z + empujeZ);
      if (!estable.fotograma(ultimoFotograma)) return;
      mostrarVR();
    }
    if (self) rig.position.set(self.x + empujeX, (self.y ?? 0) + alturaM, self.z + empujeZ);
    let lx = 0, ly = 0, rx = 0, ry = 0;
    const visible = (session.visibilityState ?? "visible") === "visible"; // blurred/hidden: the system owns the input
    for (const src of visible ? session.inputSources ?? [] : []) {
      const a = src.gamepad?.axes;
      if (!a || src.hand || a.length < 2) continue; // a tracked hand has no stick: it must not zero the controller's
      const sx = a.length > 3 ? a[2] : a[0], sy = a.length > 3 ? a[3] : a[1];
      if (src.handedness === "left") { lx = deadzone(sx ?? 0); ly = deadzone(sy ?? 0); }
      else if (src.handedness === "right") { rx = deadzone(sx ?? 0); ry = deadzone(sy ?? 0); }
      if ((src.handedness === "left" || src.handedness === "right") && !src.hand) { // xr-standard: buttons[4] = A/X, [5] = B/Y
        const hs = held[src.handedness as "left" | "right"], b = src.gamepad.buttons ?? [];
        const ax = !!b[4]?.pressed, by = !!b[5]?.pressed;
        if (ax && !hs[0]) {
          if (dialogo && encima) for (const f of oyentes.elegir) f(encima); // A/X chooses the answer you are on
          else jumpWanted = true;
        }
        if (by && !hs[1]) {
          // B (right): closes the menu if it is open, else «back» (the dialogue…). Y (left): opens/closes the menu
          // (rediseño v2) — the same as «Menú» on the watch; the old help panel steps aside when the menu opens.
          if (src.handedness === "right") { if (!menu.cerrar()) for (const f of oyentes.atras) f(); }
          else alternarMenu();
        }
        hs[0] = ax; hs[1] = by;
      }
    }
    // a dialogue open: the right stick up/down moves through its answers (not a turn)
    if (dialogo && Math.abs(ry) > 0.6) {
      if (!navLatched) { navLatched = true; const n = dialogo.opciones.length; encima = Math.max(1, Math.min(n, (encima || 0) + (ry > 0 ? 1 : -1))); pintarDialogo(); }
    } else if (Math.abs(ry) <= 0.6) navLatched = false;
    // snap turn: one step per push, re-armed when the stick returns to the middle
    let turned = false;
    const enPanel = palancasDelPanel(!!condVR?.abierto, !!condVR?.estallando, !!condPendiente); // c9: not while the bubble bursts (the server already let you in)
    if (enPanel) { // c4: inside the bubble the stick turns pages (either one: the left one walks nobody), it does not turn you
      const p = palancaPagina(Math.abs(rx) > Math.abs(lx) ? rx : lx, !pagLatched);
      pagLatched = !p.armado;
      if (p.dir) for (const f of oyentesCond.pagina) f(p.dir);
      turnLatched = Math.abs(rx) > 0.6;
    } else if (Math.abs(rx) > 0.6) {
      pagLatched = false;
      if (!turnLatched) { turnLatched = true; yawDeg += rx > 0 ? -giroDeg : giroDeg; rig.rotation.y = (yawDeg * Math.PI) / 180; turned = true; }
    } else turnLatched = false;
    // movement in the direction the head looks (flattened), stick up = forward.
    // The XR camera (h.renderer.xr.getCamera()) is only refreshed by three.js's own updateCamera()
    // call inside renderer.render(), which runs AFTER this update() this frame: reading it here would
    // use last frame's rig rotation, so right after a snap turn (rig.rotation.y just changed above)
    // the move direction would lag — and since snap turn is a single instant step, a player who turns
    // then immediately pushes the stick can walk a step or more in the stale (pre-turn) direction.
    // Force both updates now, with THIS frame's rig rotation already applied, before reading direction.
    rig.updateMatrixWorld(true);
    h.renderer.xr.updateCamera(h.camera);
    const xrCam = h.renderer.xr.getCamera();
    // N1c: the real head position now (room-scale walking moved it inside the rig, outside the sim's
    // knowledge) — push it back out of any solid it stepped into, on top of this frame's rig position.
    if (self && cajas) {
      cabeza.setFromMatrixPosition(xrCam.matrixWorld);
      const [dx, dz] = empujaFuera(cabeza.x, cabeza.z, self.y ?? 0, cajas);
      if (dx || dz) {
        empujeX += dx; empujeZ += dz;
        rig.position.x += dx; rig.position.z += dz;
        rig.updateMatrixWorld(true);
        h.renderer.xr.updateCamera(h.camera); // re-read the pose from the now-pushed rig before using it below
        chocaHasta = performance.now() + 220; // the dark pulse that tells you the wall stopped you
      }
    }
    xrCam.getWorldDirection(dir);
    // t_bf8947cf (MVL1): forward comes from the mode the player chose — head gaze (as shipped), the
    // left controller's own pointing direction, or the rig's own facing (unaffected by head turns).
    let fx: number, fz: number;
    const dirMando = modoMovimiento === "mando" ? h.manos?.dirMando?.("izq") : null;
    if (dirMando) { [fx, fz] = dirMando; }
    else if (modoMovimiento === "cuerpo") { rig.getWorldDirection(dir); fx = dir.x; fz = dir.z; }
    else { const len = Math.hypot(dir.x, dir.z) || 1; fx = dir.x / len; fz = dir.z / len; }
    moveX = fx * -ly + -fz * lx;
    moveZ = fz * -ly + fx * lx;
    const conMano = visible && !lx && !ly && gestoAndar === "apuntar" ? h.manos?.andar?.(menu.abierto ? LADO_RELOJ : null) : null; // tracked hands: pinch and hold in the air = walk where that hand points; t_41d8e44c: never with the hand holding the open menu
    // MIS-229, rowing (remo.ts): the hands' distance in front of the head along where you face drives a speed along that facing
    if (gestoAndar === "remar") {
      manosRemo.length = 0;
      if (visible && !lx && !ly && !enPanel) for (const m of h.manos?.remar?.(menu.abierto ? LADO_RELOJ : null) ?? []) manosRemo.push({ lado: m.lado, delante: (m.x - xrCam.matrixWorld.elements[12]) * fx + (m.z - xrCam.matrixWorld.elements[14]) * fz });
      const s = remo.paso(dtSeconds, manosRemo);
      if (s > 0 && !lx && !ly) { moveX = fx * s * REMO_RITMO; moveZ = fz * s * REMO_RITMO; }
    }
    if (conMano) { moveX = conMano[0] * 0.7; moveZ = conMano[1] * 0.7; } // walking pace (the edge, 0.9, runs)
    if (enPanel) { moveX = moveZ = 0; turned = false; } // c4: inside the bubble the sticks turn pages, they do not move or turn you (the server holds you too)
    const m = Math.hypot(moveX, moveZ);
    if (m > 1) { moveX /= m; moveZ /= m; }
    moveX *= velocidad; moveZ *= velocidad; // rediseño v2: the menu's «Velocidad» (1 = as shipped)
    // vignette fades in fast while moving or turning, out slowly; a wall push forces it fully dark for an
    // instant regardless of the comfort setting (safety feedback, not a comfort option)
    const want = (m > 0 || turned ? 1 : 0) * comfort;
    strength += (want - strength) * Math.min(1, dtSeconds * (want > strength ? 12 : 3));
    if (performance.now() < chocaHasta) strength = 1;
    (vignette.material as THREE.MeshBasicMaterial).opacity = strength;
    if (nota.visible && performance.now() > notaHasta) nota.visible = false;
    // rediseño v2: the watch on the left wrist (pressed by the right hand's fingertip or ray) and the still menu
    ojoV.setFromMatrixPosition(xrCam.matrixWorld); xrCam.getWorldDirection(miraV);
    const mun = visible && !condVR?.abierto ? h.manos?.muneca?.(LADO_RELOJ, munPos, munRot) : null; // c4: no watch inside the bubble
    const hayPunta = visible && !!h.manos?.punta?.(LADO_PUNTA, puntaV);
    reloj.update(ojoV, miraV, mun ? { posicion: munPos, rotacion: munRot, esMano: mun.esMano, lado: LADO_RELOJ } : null, hayPunta ? puntaV : null);
    menu.update(ojoV);
    aviso.update({ bloqueado: !visible || ojoV.y <= 0.1 || !!condVR?.abierto || !!condPendiente, menuAbierto: menu.abierto }); // v1: waits for a calm moment (no entry bubble)
    if (condPendiente && condVR && ojoV.y > 0.1) { // c4: the bubble's panel comes up in front of the eyes once they have a pose
      menu.cerrar(); reloj.cerrar(); panel.visible = false; // one thing in front of you: the old help card and the menu step aside
      const m = condPendiente; condPendiente = null; condVR.mostrar(m, ojoV, miraV);
    }
    condVR?.update(ojoV, miraV, hayPunta ? puntaV : null, condVR.abierto ? manosParaBarra() : []);
    h.manos?.update(h.renderer.xr.getCamera());
    // t_8d0bc2dd: both wrists flicked up = jump (bare hands have no A/X); not while a menu, the entry bubble or a dialogue is in front
    if (h.manos?.takeSalto?.()) { if (visible && !enPanel && !menu.abierto && !(dialogo && dialogoMalla.visible)) jumpWanted = true; }
    if (fichaVR) {
      fichaVR.ceder(menu.abierto); fichaVR.tick(); fichaVR.seguir(ojoV, miraV, dtSeconds);
      nota.position.y = fichaVR.visible ? 0.3 : -0.22; // the note must not sit on the card's buttons: above your line of sight while it shows
    }
    if (panel.visible) { pintarSalir(); pintarAjuste(); } // the highlight fades once the ray leaves; «¿Salir?» goes back after SALIR_CONFIRMA_MS
  }

  return {
    enter, exit, update, setPanel,
    get state() { return state; },
    get lastError() { return lastError; },
    get active() { return state === "on"; },
    /** N1c: the world's solid boxes in metres (same array `view.solidos()` converts, e.g. `cajasM` in
     * index.ts): room-scale walking into one now pushes the head back out instead of passing through. */
    paredes(b: Float32Array | null): void { cajas = b && b.length ? b : null; },
    /** Movement intention in the world frame, each -1..1. Zero when no XR frame ran lately: a real Quest stops the
     * session's frames while it is hidden (headset off the head), and the page's tick must not keep the last push. */
    axes(): [number, number] { return performance.now() - ultimoFotograma > INTENCION_CADUCA_MS ? [0, 0] : [moveX, moveZ]; },
    /** J2: true once per press of A or X since the last call (the page asks on each tick). */
    takeJump(): boolean { const j = jumpWanted; jumpWanted = false; return j; },
    get comfort() { return comfort; },
    set comfort(v: number) { comfort = Math.max(0, Math.min(1, v)); },
    get modoMovimiento() { return modoMovimiento; },
    set modoMovimiento(v: ModoMovimientoVR) { modoMovimiento = v === "mando" || v === "cuerpo" ? v : "mirada"; },
    get gestoAndar() { return gestoAndar; },
    set gestoAndar(v: GestoAndarVR) { gestoAndar = v === "remar" ? "remar" : "apuntar"; remo.reset(); },
    get manoMenu(): ManoMenuVR { return manoMenu; },
    set manoMenu(v: ManoMenuVR) { elegirManoMenu(v === "der" ? "der" : "izq"); },
    get yawDegrees() { return yawDeg; },
    /** Rediseño v2 (VR settings): snap turn step (one of GIROS_DEG), stick pace (0.4..1) and the floor's lift (m). */
    /** MIS-200 «Rendimiento en gafas»: foveation (live), scale and multiview (read on the next entry). */
    get rendimiento() { return rendimiento; },
    set rendimiento(v: Partial<RendimientoXR>) {
      rendimiento = normalizarRendimiento({ ...rendimiento, ...v });
      if (session) h.renderer.xr.setFoveation(rendimiento.foveacion); // the only one that works while presenting
    },
    get giroGrados() { return giroDeg; },
    set giroGrados(v: number) { giroDeg = (GIROS_DEG as readonly number[]).includes(v) ? v : SNAP_DEG; },
    get velocidad() { return velocidad; },
    set velocidad(v: number) { velocidad = Number.isFinite(v) ? Math.max(VELOCIDAD.min, Math.min(VELOCIDAD.max, v)) : 1; },
    get alturaM() { return alturaM; },
    set alturaM(v: number) { alturaM = Number.isFinite(v) ? Math.max(ALTURA_M.min, Math.min(ALTURA_M.max, v)) : 0; },
    /** Rediseño v2: the wrist watch and the menu panel (for the page's wiring and for checks). */
    reloj, menu, aviso,
    /** The house's Phosphor icons (name → SVG paths, viewBox 256) for the watch and the menu. */
    iconos(fn: PathsIcono): void { pathsIcono = fn; reloj.pintar(); },
    /** «Menú» / Y from the page or a check: open (at `en`) or close the menu in front of the eyes. */
    alternarMenu,
    /** What the menu shows: each view's content, from the page's own data (apps/plaza/xr-menu.ts). */
    menuProveedor(p: Proveedor): void { menu.proveedor(p); },
    /** What the watch shows (microphone, camera, notices, city). */
    relojEstado(fn: () => Omit<EstadoReloj, "menuAbierto">): void { estadoRelojPagina = fn; },
    /** A watch button other than «Menú» was pressed («micro», «camara», «avisos», «ciudad»): the page acts. */
    onReloj(fn: (b: BotonReloj) => void): () => void { oyentesV2.reloj.add(fn); return () => oyentesV2.reloj.delete(fn); },
    /** Any press on the watch or the menu (for a soft click). */
    onPulsa(fn: () => void): () => void { oyentesV2.pulsa.add(fn); return () => oyentesV2.pulsa.delete(fn); },
    get vignetteOpacity() { return strength; },
    /** What the panel shows now: the quest or the controls (Y goes quest → controls → hidden). */
    get pagina() { return pagina; },
    /** The rig (your floor in the world): where held things and hands live. */
    rig,
    /** Show a conversation in front of you (null closes it). Answers arrive through onElegir. */
    dialogo(d: DialogoVR | null): void {
      const abria = !dialogo;
      dialogo = d; dibujado = "";
      if (!d) { dialogoMalla.visible = false; encima = 0; return; }
      if (encima > d.opciones.length) encima = 0;
      pintarDialogo();
      if (session) { menu.cerrar(); panel.visible = false; } // MIS-200 t_166720f3: the dialogue is the one panel in front of you
      if (abria && session) delante(dialogoMalla, 1.15, 0.12);
      dialogoMalla.visible = !!session;
    },
    /** The panel the hands may point at (manos.ts asks for it). */
    calentar,
    paneles(): Panel[] { const out: Panel[] = dialogo && dialogoMalla.visible ? [panelDialogo] : []; out.push(...menu.paneles(), ...reloj.paneles(), ...(condVR?.paneles() ?? [])); if (fichaVR?.visible) out.push(fichaVR.panel); if (panel.visible) out.push(pagina === "ajustes" ? panelAjuste : panelSalir); return out; },
    /** c4: the entry bubble's panel (null until it has been loaded), and loading it. The page asks for it as soon as the bubble is up on a
     * headset-capable browser, so entering VR does not wait for it. */
    condiciones(): CondicionesVR | null { return condVR; },
    condicionesCargar(): Promise<CondicionesVR> {
      if (condVR) return Promise.resolve(condVR);
      condCargando ??= import("./condiciones-vr.ts").then((m) => { condVR = m.createCondicionesVR({ scene: h.scene, alPulsar: (z) => { for (const f of oyentesCond.pulsa) try { f(z); } catch (e) { console.warn("[condiciones-vr]", e); } }, alSonar: avisarPulsa }); return condVR; });
      return condCargando;
    },
    /** c4: show (or update) the bubble's panel with this model, in front of you; null closes it, `estallido` with the bubble's burst. */
    condicionesModelo(m: ModeloVR | null, estallido = false): void {
      if (!condVR) return;
      if (!m || !session) { condPendiente = null; condVR.ocultar(estallido && !!session); return; }
      if (condVR.abierto && !condVR.estallando) { condVR.actualizar(m); return; }
      condPendiente = m; // placed in the next update(): the eyes' pose is only read there (the XR camera is refreshed by the frame, not before it)
    },
    /** c4: a button, a box or an arrow of the panel was pressed (the page does what it means). */
    onCondicion(fn: (z: Zona) => void): () => void { oyentesCond.pulsa.add(fn); return () => oyentesCond.pulsa.delete(fn); },
    /** c4: the stick was pushed to the left (−1) or the right (+1) inside the bubble: turn a page. */
    onCondicionPagina(fn: (dir: -1 | 1) => void): () => void { oyentesCond.pagina.add(fn); return () => oyentesCond.pagina.delete(fn); },
    /** C5: show the object card panel for this object (null hides it). Fetches the panel's code the first time. */
    ficha(d: DatosFichaVR | null): void {
      fichaPide = d;
      if (!d || !session) { fichaVR?.ocultar(); return; }
      if (fichaVR) { fichaVR.mostrar(d); return; }
      if (fichaCargando) return;
      fichaCargando = true;
      void import("./vr-ficha.ts").then((m) => { fichaVR = m.crearFichaVR(rig, (a) => { for (const f of oyentes.ficha) f(a); }, fichaCabeza); if (fichaPide && session) fichaVR.mostrar(fichaPide); }).finally(() => { fichaCargando = false; });
    },
    onFicha(fn: (a: AccionFichaVR) => void): () => void { oyentes.ficha.add(fn); return () => oyentes.ficha.delete(fn); },
    /** For checks: the object card's panel (null until it was first shown). */
    fichaPanel(): FichaVR | null { return fichaVR; },
    /** For checks: where the «Salir de VR» button sits in the world (null while the panel is hidden), and whether it asks. */
    salirMundo(): { x: number; y: number; z: number; pide: boolean } | null {
      if (!session || !panel.visible) return null;
      salirMalla.updateMatrixWorld(true);
      const q = new THREE.Vector3().setFromMatrixPosition(salirMalla.matrixWorld);
      return { x: q.x, y: q.y, z: q.z, pide: performance.now() < salirPideHasta };
    },
    onElegir(fn: (n: number) => void): () => void { oyentes.elegir.add(fn); return () => oyentes.elegir.delete(fn); },
    onAtras(fn: () => void): () => void { oyentes.atras.add(fn); return () => oyentes.atras.delete(fn); },
    /** A short note in front of you for NOTA_MS. */
    nota(texto: string): void {
      if (!texto) return;
      notaTexto = texto; notaHasta = performance.now() + NOTA_MS;
      const ng = N.g;
      ng.clearRect(0, 0, 768, 112);
      ng.fillStyle = "rgba(20,30,40,0.9)"; ng.fillRect(0, 0, 768, 112);
      ng.fillStyle = "#ffd27a"; ng.font = "bold 30px sans-serif";
      envolver(texto, 44).slice(0, 2).forEach((l, i) => ng.fillText(l, 20, 46 + i * 40));
      N.tex.needsUpdate = true;
      nota.visible = !!session;
    },
    /** For checks: the dialogue's answer under the ray or the stick, the note shown, where the answer n sits in the world. */
    estadoPaneles() { return { dialogo: !!dialogo && dialogoMalla.visible, encima, nota: nota.visible ? notaTexto : "", panel: panel.visible, panelTexto: panelText, /** MIS-200: the VR extras (hands, watch, panels) are on screen: false from entering until the first calm frames (or the 6 s ceiling). Checks that move a hand wait for it. */ extras: mostrado }; },
    filaMundo(n: number): { x: number; y: number; z: number } | null {
      if (!dialogo || !dialogoMalla.visible || n < 1 || n > dialogo.opciones.length) return null;
      const w = 1.15, hgt = (w * 680) / 1024, py = FILA0 + (n - 1) * FILA_H + (FILA_H - 8) / 2;
      dialogoMalla.updateMatrixWorld();
      const p = new THREE.Vector3(0, hgt / 2 - (py / 680) * hgt, 0.001).applyMatrix4(dialogoMalla.matrixWorld);
      return { x: p.x, y: p.y, z: p.z };
    },
  };
}
