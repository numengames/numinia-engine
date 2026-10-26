// medidor-vivo (MIS-200 t_ee19c84b): the live frame meter — one ring of the last frames, one summary, one text, one census.
// It answers on the spot what `sesion.ts` only reports to the server every 10 s: how long frames take, how many gaps
// there were, how many draw calls (the frame's own count, not three's running total), how many shader programs, and
// WHERE the draw calls come from (the census, by category). The page shows it as an overlay (`?medidor`) and in the VR
// panel, and exposes it as `__numinia.medidorVivo` for checks. Pure: no DOM, no GPU (a test feeds it frames).
//
// Cost: `cuadro()` writes five numbers into preallocated typed arrays (no allocation); `resumen()` sorts a copy of the
// ring and runs only when someone reads it (the overlay once a second). The census walks the scene once, and only on
// demand: nothing is walked while nobody asks.
import * as THREE from "three/webgpu";

/** Frames kept: ~2.7 s at 90 Hz, ~4 s at 60 Hz. */
export const CAPACIDAD_MEDIDOR = 240;
/** A gap is a frame whose interval is over this many times the window's median interval (the same rule as tools medir-sesion). */
export const FACTOR_HUECO = 1.5;
/** An interval this long is a pause (hidden tab, headset off), not a gap: it does not enter the ring. */
export const PAUSA_MS = 1000;

export type MuestraCuadro = { dtMs: number; cpuMs?: number; llamadas?: number; triangulos?: number; programas?: number };
export type ResumenMedidor = {
  cuadros: number; fps: number;
  cuadroMs: { p50: number; p99: number; max: number };
  cpuMs: { p50: number; max: number };
  /** Frames whose interval was over FACTOR_HUECO × the median, and the longest interval in the window (ms). */
  huecos: number; huecoMaxMs: number;
  /** Draw calls of the LAST frame and the window's median / worst (`drawCalls`, both eyes in XR). */
  llamadas: { ultima: number; p50: number; max: number };
  kTriangulos: number; programas: number;
};

const r1 = (x: number): number => Math.round(x * 10) / 10;
const pct = (orden: Float64Array, n: number, q: number): number => (n === 0 ? 0 : orden[Math.min(n - 1, Math.floor(q * n))]);

export function crearMedidorVivo(capacidad = CAPACIDAD_MEDIDOR) {
  const dt = new Float64Array(capacidad), cpu = new Float64Array(capacidad), llam = new Float64Array(capacidad);
  const copia = new Float64Array(capacidad);
  let n = 0, i = 0, tri = 0, prog = 0, ultimaLlamada = 0;
  return {
    /** One drawn frame. Intervals of PAUSA_MS or more (and non-numbers) are ignored. */
    cuadro(m: MuestraCuadro): void {
      if (m.programas !== undefined && Number.isFinite(m.programas)) prog = m.programas;
      if (m.triangulos !== undefined && Number.isFinite(m.triangulos)) tri = m.triangulos;
      if (!(m.dtMs > 0) || m.dtMs >= PAUSA_MS) return;
      dt[i] = m.dtMs; cpu[i] = m.cpuMs ?? 0; llam[i] = m.llamadas ?? 0;
      if (m.llamadas !== undefined) ultimaLlamada = m.llamadas;
      i = (i + 1) % capacidad; if (n < capacidad) n++;
    },
    /** The window's numbers (does not clear it: the ring just keeps the newest frames). */
    resumen(): ResumenMedidor {
      const o = copia.subarray(0, n);
      o.set(n === capacidad ? dt : dt.subarray(0, n)); o.sort();
      const p50 = pct(o, n, 0.5), p99 = pct(o, n, 0.99), max = n ? o[n - 1] : 0;
      let huecos = 0; const umbral = FACTOR_HUECO * p50;
      for (let k = 0; k < n; k++) if (dt[k] > umbral) huecos++;
      o.set(n === capacidad ? cpu : cpu.subarray(0, n)); o.sort();
      const c50 = pct(o, n, 0.5), cmax = n ? o[n - 1] : 0;
      o.set(n === capacidad ? llam : llam.subarray(0, n)); o.sort();
      const l50 = pct(o, n, 0.5), lmax = n ? o[n - 1] : 0;
      return {
        cuadros: n, fps: p50 > 0 ? Math.round(1000 / p50) : 0,
        cuadroMs: { p50: r1(p50), p99: r1(p99), max: r1(max) }, cpuMs: { p50: r1(c50), max: r1(cmax) },
        huecos, huecoMaxMs: r1(max),
        llamadas: { ultima: ultimaLlamada, p50: l50, max: lmax },
        kTriangulos: r1(tri / 1000), programas: prog,
      };
    },
    /** Forget the window (a test starts a measurement; the overlay's «reset»). */
    reiniciar(): void { n = 0; i = 0; },
  };
}
export type MedidorVivo = ReturnType<typeof crearMedidorVivo>;

/** The one line the VR panel and the overlay show. */
export function lineaMedidor(r: ResumenMedidor): string {
  if (r.cuadros === 0) return "medidor: sin cuadros";
  return `${r.fps} fps · cuadro ${r.cuadroMs.p50}/${r.cuadroMs.p99} ms · huecos ${r.huecos} (máx ${r.huecoMaxMs} ms) · llamadas ${r.llamadas.ultima} · programas ${r.programas}`;
}

/** The short line for the VR panel (a headset panel line wraps at ~42 characters, two lines at most). */
export function lineaMedidorCorta(r: ResumenMedidor): string {
  if (r.cuadros === 0) return "medidor: sin cuadros";
  return `${r.llamadas.ultima} llamadas · ${r.programas} progr. · hueco máx ${Math.round(r.huecoMaxMs)} ms`;
}

// ---- the census: where the draw calls come from ----

/** The categories of the census, in the order they print. */
export const CATEGORIAS = ["mapa", "objetos", "personas", "manos", "ancestros", "elementos", "lotes", "pesca", "nombres", "ui-vr", "otros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** What the census needs to know of an object to sort it: the names of the object and of its ancestors, nearest first. */
export function categoriaDe(nombres: readonly string[], userData: Record<string, unknown>): Categoria {
  if (userData.lote === true) return "lotes";
  for (const raw of nombres) {
    const nombre = raw.toLowerCase();
    if (nombre === "lotes" || nombre === "lote") return "lotes";
    if (nombre === "manos" || nombre.startsWith("ancla-")) return "manos";
    if (nombre.startsWith("nombre:")) return "nombres";
    if (nombre.startsWith("ancestros") || nombre.includes("ancestros")) return "ancestros";
    if (nombre.startsWith("elemento")) return "elementos";
    if (nombre.includes("pesca") || nombre.includes("boya")) return "pesca";
    if (nombre.startsWith("objeto:") || nombre.startsWith("pnj:")) return "objetos";
    if (nombre.startsWith("avatar") || nombre.startsWith("persona") || nombre.startsWith("otro:")) return "personas";
    if (nombre === "vr-rig" || nombre.startsWith("vr-") || nombre.startsWith("panel-vr")) return "ui-vr";
  }
  if (userData.mapa !== undefined) return "mapa";
  return "otros";
}

export type FilaCenso = { piezas: number; llamadas: number; materiales: number; instanciadas: number; transparentes: number; triangulos: number };
export type Censo = {
  /** Eyes that drew (1 on a screen, 2 in a headset). */
  ojos: number;
  /** Sum of every row's `llamadas`: the estimate of `renderer.info.render.drawCalls` (frustum culling applied per eye). */
  llamadas: number; piezas: number;
  /** The renderer's own count of that frame minus `llamadas`: what the census does not see (the sun's shadow pass, post-processing quads, the sky). Filled by the view. */
  resto?: number;
  porCategoria: Record<Categoria, FilaCenso>;
};

type Dibujable = THREE.Object3D & {
  isMesh?: boolean; isSprite?: boolean; isPoints?: boolean; isLine?: boolean; isInstancedMesh?: boolean; isBatchedMesh?: boolean;
  geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[]; count?: number;
};

const fila = (): FilaCenso => ({ piezas: 0, llamadas: 0, materiales: 0, instanciadas: 0, transparentes: 0, triangulos: 0 });

/**
 * Walk the scene as the renderer sees it NOW (call it between the render and the restore of hidden objects: `view`
 * does) and count what was sent to the GPU, by category. A drawable counts once per eye (when it is inside the frustum
 * three culls with: the camera's own, or the XR array camera's union), once per material group (a mesh with 2 materials is
 * 2 calls). `camaras` = the cameras that drew: the camera itself, or an XR array camera's `cameras` (+ that array camera as `union`).
 */
export function censoDeEscena(raiz: THREE.Object3D, camaras: readonly THREE.Camera[], union?: THREE.Camera): Censo {
  // three culls an XR frame ONCE, against the array camera's own (union) frustum, and then draws every survivor once per eye whose layers
  // match (not per-eye culling): `union` is that array camera. Without it (a screen) the one camera is both.
  const frustoDe = (c: THREE.Camera) => {
    const f = new THREE.Frustum(), m = new THREE.Matrix4();
    m.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    return f.setFromProjectionMatrix(m);
  };
  const frustos = union ? [{ f: frustoDe(union), capas: union.layers, ojos: camaras.map((c) => c.layers) }] : camaras.map((c) => ({ f: frustoDe(c), capas: c.layers, ojos: [c.layers] }));
  const out = {} as Record<Categoria, FilaCenso>;
  for (const c of CATEGORIAS) out[c] = fila();
  const materiales: Record<Categoria, Set<THREE.Material>> = {} as never;
  for (const c of CATEGORIAS) materiales[c] = new Set();
  const nombres: string[] = [];
  let llamadas = 0, piezas = 0;

  const visitar = (o: Dibujable): void => {
    if (!o.visible) return;
    const dibujable = o.isMesh || o.isSprite || o.isPoints || o.isLine;
    if (dibujable) {
      const geo = o.geometry as THREE.BufferGeometry | undefined;
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      if (geo && mats.length) {
        let ojos = 0;
        for (const x of frustos) if (o.layers.test(x.capas) && (o.frustumCulled === false || x.f.intersectsObject(o))) for (const l of x.ojos) if (o.layers.test(l)) ojos++;
        if (ojos > 0) {
          nombres.length = 0;
          for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name) nombres.push(p.name);
          const cat = categoriaDe(nombres, nearestUserData(o));
          const f = out[cat];
          const grupos = Array.isArray(o.material) ? Math.max(1, geo.groups.length) : 1;
          const instancias = o.isInstancedMesh ? (o.count ?? 0) : 1;
          if (instancias > 0) {
            f.piezas++; piezas++;
            f.llamadas += ojos * grupos; llamadas += ojos * grupos;
            if (o.isInstancedMesh) f.instanciadas++;
            for (const m of mats) { materiales[cat].add(m); if (m.transparent) f.transparentes++; }
            const idx = geo.index ? geo.index.count : (geo.attributes.position?.count ?? 0);
            f.triangulos += Math.round((idx / 3) * Math.max(1, instancias) * ojos);
          }
        }
      }
    }
    for (const h of o.children) visitar(h as Dibujable);
  };
  visitar(raiz as Dibujable);
  for (const c of CATEGORIAS) out[c].materiales = materiales[c].size;
  return { ojos: camaras.length, llamadas, piezas, porCategoria: out };
}

/** `userData` of the nearest ancestor (or the object) that has the map mark: the base world's boxes carry it. */
function nearestUserData(o: THREE.Object3D): Record<string, unknown> {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.mapa !== undefined || p.userData.lote === true) return p.userData;
  return o.userData;
}

/** The census as short text lines for the overlay (categories with something in them). */
export function lineasCenso(c: Censo): string[] {
  const out = [`piezas ${c.piezas} · llamadas ~${c.llamadas} (${c.ojos} ${c.ojos === 1 ? "ojo" : "ojos"})${c.resto ? ` · +${c.resto} fuera de la escena (sombra, posproceso, cielo)` : ""}`];
  for (const k of CATEGORIAS) {
    const f = c.porCategoria[k];
    if (f.piezas) out.push(`  ${k}: ${f.llamadas} (${f.piezas} piezas, ${f.materiales} mat${f.transparentes ? `, ${f.transparentes} transp.` : ""}${f.instanciadas ? `, ${f.instanciadas} inst.` : ""})`);
  }
  return out;
}
