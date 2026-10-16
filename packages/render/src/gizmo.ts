// gizmo (M22): the builder's hands in the 3D view. What is under the pointer (`pick`), the point under it on the
// ground or on other things (`puntoBajo`), an outline around the selection, and three's TransformControls (MIT,
// three.js addons) with handles X red, Y green, Z blue to move, turn and scale. TransformControls arrives with a
// dynamic import the first time the page asks for a tool: the start bundle never carries it.
// Knows nothing of the network: it moves the thing's group at once and reports the drag (empieza / cambia / acaba);
// the page sends `mover`. While a thing is held (a gizmo drag, or the page's grab mode) the server's echoes for it
// only update what is wanted (no rubber-banding); after the release they wait until the final transform comes back,
// or MANTENER_MS at most (then the thing goes where the server says: a refused move goes back).
import * as THREE from "three/webgpu";

export type Eje = "X" | "Y" | "Z";
export type Herramienta = "mover" | "girar" | "escalar";
/** Where a thing is: metres, degrees (applied Y, then X, then Z: Euler order "YXZ", each in [-180, 180]), scale per axis. */
export type Donde = { x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };
export type Fase = "empieza" | "cambia" | "acaba";
/** Snapping: metres, degrees, scale step; null = free. */
export type Paso = { pos: number | null; grados: number | null; escala: number | null };
export type EditorCtx = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  /** Every placed thing's group by its key. Keys starting with `~` are the page's own previews: never picked. */
  grupos(): Iterable<[string, THREE.Object3D]>;
  grupo(key: string): THREE.Object3D | undefined;
  /** Put a thing where its latest state says (after a hold the server did not echo). */
  reponer(key: string): void;
};

const RAD = Math.PI / 180;
const MANTENER_MS = 1500; // after a release, at most this long the server's older echoes are ignored
const ACTIVO_MS = 400;    // after any change here keep drawing this long (the page only draws while busy)

/** Degrees into [-180, 180]. */
export const envolver = (g: number): number => ((((g + 180) % 360) + 360) % 360) - 180;
const redondo = (v: number, paso: number, dec: number) => Number((Math.round(v / paso) * paso).toFixed(dec));
const eul = new THREE.Euler();
/** The transform a group has now, rounded to the wire's steps (0.01 m, 0.1°, 0.01): what the server will keep. */
export function dondeDe(g: THREE.Object3D): Donde {
  eul.setFromQuaternion(g.quaternion, "YXZ");
  const giro = (a: number) => redondo(envolver(a / RAD), 0.1, 1);
  return {
    x: redondo(g.position.x, 0.01, 2), y: redondo(g.position.y, 0.01, 2), z: redondo(g.position.z, 0.01, 2),
    rx: giro(eul.x), ry: giro(eul.y), rz: giro(eul.z),
    sx: redondo(g.scale.x, 0.01, 2), sy: redondo(g.scale.y, 0.01, 2), sz: redondo(g.scale.z, 0.01, 2),
  };
}
const difGiro = (a: number, b: number) => Math.abs(envolver(a - b));
/** Same transform, give or take one wire step. */
export const igualDonde = (a: Donde, b: Donde): boolean =>
  Math.abs(a.x - b.x) <= 0.011 && Math.abs(a.y - b.y) <= 0.011 && Math.abs(a.z - b.z) <= 0.011 &&
  difGiro(a.rx, b.rx) <= 0.11 && difGiro(a.ry, b.ry) <= 0.11 && difGiro(a.rz, b.rz) <= 0.11 &&
  Math.abs(a.sx - b.sx) <= 0.011 && Math.abs(a.sy - b.sy) <= 0.011 && Math.abs(a.sz - b.sz) <= 0.011;

// the part of TransformControls this file uses (three/addons/controls/TransformControls.js, r186)
type TC = THREE.EventDispatcher & {
  object: THREE.Object3D | undefined; dragging: boolean; axis: string | null;
  mode: "translate" | "rotate" | "scale"; space: "world" | "local"; size: number;
  showX: boolean; showY: boolean; showZ: boolean; showXY: boolean; showYZ: boolean; showXZ: boolean; showE: boolean; showXYZE: boolean;
  translationSnap: number | null; rotationSnap: number | null; scaleSnap: number | null;
  attach(o: THREE.Object3D): unknown; detach(): unknown; getHelper(): THREE.Object3D;
  addEventListener(type: string, fn: (e: { value?: unknown }) => void): void;
};

export function crearEditor(ctx: EditorCtx) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const suelo = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const enSuelo = new THREE.Vector3();
  const v = new THREE.Vector3();
  // the outline: a box around the selection, seen through everything (house yellow)
  const caja = new THREE.Box3();
  const marco = new THREE.Box3Helper(caja, 0xffd27a);
  const mat = marco.material as THREE.LineBasicMaterial;
  mat.depthTest = false; mat.transparent = true; mat.opacity = 0.9;
  marco.renderOrder = 998; marco.visible = false; marco.name = "seleccion";
  ctx.scene.add(marco);

  let sel: string | null = null, herramienta: Herramienta | null = null, eje: Eje | null = null, local = false;
  let paso: Paso = { pos: 0.5, grados: 15, escala: 0.1 };
  let sostenido: string | null = null;
  let soltado: { key: string; final: Donde; hasta: number } | null = null;
  let arrastre: { key: string; g: THREE.Object3D } | null = null;
  let activoHasta = 0;
  let tc: TC | null = null, cargando: Promise<void> | null = null, fallo = "";
  const oyentes: ((fase: Fase, key: string, d: Donde) => void)[] = [];
  const avisar = (fase: Fase, key: string, d: Donde) => { for (const fn of oyentes) { try { fn(fase, key, d); } catch (e) { console.warn("[gizmo]", e); } } };
  const tocar = () => { activoHasta = performance.now() + ACTIVO_MS; };
  const rayo = (cx: number, cy: number) => {
    const b = ctx.canvas.getBoundingClientRect();
    ndc.set(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
  };
  const claveDe = (o: THREE.Object3D | null): string | null => { for (; o; o = o.parent) if (o.name.startsWith("objeto:")) return o.name.slice(7); return null; };
  const candidatos = (ignorar?: string) => { const out: THREE.Object3D[] = []; for (const [k, g] of ctx.grupos()) if (k !== ignorar && !k.startsWith("~")) out.push(g); return out; };

  /** The gizmo follows the selection, the tool, the axis, the space and the snap. */
  function aplicar(): void {
    tocar();
    if (!tc) return;
    const g = sel && herramienta ? ctx.grupo(sel) : undefined;
    if (g) { if (tc.object !== g) tc.attach(g); } else if (tc.object && !tc.dragging) tc.detach();
    tc.mode = herramienta === "girar" ? "rotate" : herramienta === "escalar" ? "scale" : "translate";
    tc.space = local ? "local" : "world";
    tc.showX = !eje || eje === "X"; tc.showY = !eje || eje === "Y"; tc.showZ = !eje || eje === "Z";
    tc.showXY = tc.showYZ = tc.showXZ = tc.showE = tc.showXYZE = !eje;
    tc.translationSnap = paso.pos; tc.rotationSnap = paso.grados ? paso.grados * RAD : null; tc.scaleSnap = paso.escala;
  }
  const cargar = (): Promise<void> => (cargando ??= import("three/addons/controls/TransformControls.js").then(({ TransformControls }) => {
    const c = new TransformControls(ctx.camera as THREE.PerspectiveCamera, ctx.canvas) as unknown as TC;
    c.size = 1.4; // U10: bigger handles (Pablo: «no tienen tiradores» — three's default 1 is small on a laptop)
    ctx.scene.add(c.getHelper());
    c.addEventListener("dragging-changed", (e) => {
      if (e.value) {
        const g = c.object, key = g ? claveDe(g) : null;
        if (!g || !key) return;
        arrastre = { key, g }; sostenido = key; soltado = null;
        avisar("empieza", key, dondeDe(g));
      } else if (arrastre) {
        const { key, g } = arrastre, d = dondeDe(g);
        arrastre = null; sostenido = null; soltado = { key, final: d, hasta: performance.now() + MANTENER_MS };
        avisar("acaba", key, d);
        aplicar();
      }
      tocar();
    });
    c.addEventListener("objectChange", () => { if (arrastre && c.dragging) avisar("cambia", arrastre.key, dondeDe(arrastre.g)); tocar(); });
    c.addEventListener("change", tocar); // a handle lights up under the pointer: draw it
    tc = c;
    aplicar();
  }).catch((e) => { fallo = String((e as Error)?.message ?? e); cargando = null; console.warn(`[gizmo] no se pudo cargar: ${fallo}`); }));

  return {
    /** The key of the placed thing under a screen point (client px), or null. Previews (`~`) are never picked. */
    pick(clientX: number, clientY: number): string | null {
      rayo(clientX, clientY);
      const hit = ray.intersectObjects(candidatos(), true)[0];
      return hit ? claveDe(hit.object) : null;
    },
    /** The point under a screen point: on another thing (not `ignorar`) or on the ground (y = 0); null above the horizon. */
    puntoBajo(clientX: number, clientY: number, ignorar?: string): { x: number; y: number; z: number } | null {
      rayo(clientX, clientY);
      const hit = ray.intersectObjects(candidatos(ignorar), true)[0];
      const s = ray.ray.intersectPlane(suelo, enSuelo);
      if (hit && (!s || hit.distance <= ray.ray.origin.distanceTo(s))) return { x: hit.point.x, y: Math.max(0, hit.point.y), z: hit.point.z };
      return s ? { x: s.x, y: 0, z: s.z } : null;
    },
    /** Where a world point is on screen (client px), or null when it is behind the camera. */
    pantalla(x: number, y: number, z: number): { x: number; y: number } | null {
      v.set(x, y, z).project(ctx.camera);
      if (v.z > 1 || v.z < -1) return null;
      const b = ctx.canvas.getBoundingClientRect();
      return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height };
    },
    /** Outline a thing (null = nothing); the gizmo, if a tool is on, attaches to it. */
    seleccionar(key: string | null): void { if (sel !== key) { sel = key; aplicar(); } },
    /** The gizmo's tool, or null (no gizmo). The first call downloads TransformControls. */
    herramienta(h: Herramienta | null): Promise<void> { herramienta = h; aplicar(); return h && !tc ? cargar() : Promise.resolve(); },
    /** Only one axis's handles (null = all of them), like Blender's X / Y / Z. */
    eje(e: Eje | null): void { eje = e; aplicar(); },
    /** Handles along the thing's own axes (true) or the world's. */
    espacio(enLocal: boolean): void { local = enLocal; aplicar(); },
    paso(p: Paso): void { paso = p; aplicar(); },
    /** Download the gizmo now (when build mode opens), so the first tool shows at once. */
    cargar,
    onArrastre(fn: (fase: Fase, key: string, d: Donde) => void): void { oyentes.push(fn); },
    /** A thing's transform as drawn now (rounded to the wire's steps), or null. */
    dondeEsta(key: string): Donde | null { const g = ctx.grupo(key); return g ? dondeDe(g) : null; },
    /** U10: the box of what a thing draws in its own axes, without its scale (what `solido` needs), or null if nothing is drawn yet. */
    cajaPropia(key: string): [number, number, number, number, number, number] | null {
      const g = ctx.grupo(key);
      if (!g) return null;
      const p = g.position.clone(), q = g.quaternion.clone(), s = g.scale.clone(), padre = g.parent;
      g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.set(1, 1, 1);
      if (padre) padre.remove(g);
      g.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(g, true);
      g.position.copy(p); g.quaternion.copy(q); g.scale.copy(s);
      if (padre) padre.add(g);
      g.updateMatrixWorld(true);
      if (b.isEmpty()) return null;
      const r = (n: number) => Math.round(n * 100) / 100;
      // a picture or a screen is flat: give it 10 cm of thickness so it can still stop people
      for (const k of ["x", "y", "z"] as const) if (b.max[k] - b.min[k] < 0.1) { const m = (b.max[k] + b.min[k]) / 2; b.min[k] = m - 0.05; b.max[k] = m + 0.05; }
      return [r(b.min.x), r(b.min.y), r(b.min.z), r(b.max.x), r(b.max.y), r(b.max.z)];
    },
    /** Move a thing's group at once (no network): the page's grab mode and previews. */
    poner(key: string, d: Partial<Donde>): void {
      const g = ctx.grupo(key);
      if (!g) return;
      const a = dondeDe(g), n = { ...a, ...d };
      g.position.set(n.x, n.y, n.z);
      g.rotation.set(n.rx * RAD, n.ry * RAD, n.rz * RAD, "YXZ");
      g.scale.set(n.sx, n.sy, n.sz);
      tocar();
    },
    /** Hold a thing (its server echoes wait) or let go (`null`, with the transform last sent). */
    sostener(key: string | null, final?: Donde): void {
      if (key) { sostenido = key; soltado = null; }
      else { if (sostenido && final) soltado = { key: sostenido, final, hasta: performance.now() + MANTENER_MS }; else if (sostenido) ctx.reponer(sostenido); sostenido = null; }
      tocar();
    },
    /** render's place() asks: should this echo wait? (held, or released and not yet confirmed). */
    retiene(key: string, t: Donde): boolean {
      if (key === sostenido) return true;
      if (!soltado || soltado.key !== key) return false;
      if (performance.now() > soltado.hasta || igualDonde(t, soltado.final)) { soltado = null; return false; }
      return true;
    },
    /** The state of the hands (for the page, agents and checks). `ejeBajo` = the handle under the pointer. */
    estado() {
      return { seleccionado: sel, herramienta, eje, local, paso, cargado: !!tc, fallo, arrastrando: !!tc?.dragging, ejeBajo: tc?.axis ?? null, sostenido };
    },
    /** True while something here moves or just changed: the page keeps drawing. */
    activo(): boolean { return !!tc?.dragging || sostenido !== null || soltado !== null || performance.now() < activoHasta; },
    /** The page shows something new (a preview moved, a panel opened): keep drawing a moment. */
    despertar(): void { tocar(); },
    /** Once per drawn frame, before rendering. */
    frame(): void {
      if (soltado && performance.now() > soltado.hasta) { const k = soltado.key; soltado = null; ctx.reponer(k); tocar(); }
      if (tc?.object && !tc.object.parent) tc.detach(); // the thing was taken away while attached
      const g = sel ? ctx.grupo(sel) : undefined;
      if (g) caja.setFromObject(g);
      marco.visible = !!g && !caja.isEmpty();
    },
  };
}
export type Editor = ReturnType<typeof crearEditor>;
