// agua-estilo (N2): the engine's stylised water, one procedural node material shared by the elements' water (ponds,
// fountains, the templates' seas: elementos.ts) and the fishing pond (pesca.ts). Flat colour in the house look
// (PRI-008: solid colour bands, no photo texture, no mirror): a shallow band by the shore and a deep one in the middle,
// shore foam that breathes, a stepped fresnel toward the sky's horizon colour, and — climbing with the device tier
// (calidad.ts DETALLE_AGUA) — vertex waves on big water with lighter crests, drifting light streaks, fake caustics in the
// shallows and stepped sun glints. No texture, no render target, no second scene pass: one draw call per water at every
// tier; the cost is ALU per pixel (D: bands + foam + fresnel only). Lit by the scene (Lambert), so night darkens it.
// E03 (AG1 agua de orilla + AG10 binarios, opt-in through `orilla` / `binarios`): the colour comes from the REAL depth of the
// bed under each pixel (a 64² R8 texture baked once on the CPU from the terrain's height function: Pirates' heightmap idea,
// starwild's per-vertex depth idea; own code), in two variants for Pablo: «continuo» (one smooth gradient, Starwild-like) and
// «bandas» (the very same gradient sampled in 4 flat steps, PRI-008). Shore band, foam on the true waterline and a pale wash
// that comes and goes where the water is thinnest (starwild 021 idea); opacity grows with depth and the grazing angle.
// Binaries = translucent 0/1 strings drifting with the current under the surface (parallax by depth), now and then lifted
// to a crest; faint by default. Same mesh, same draw call, one texture read more per pixel.
import { CASA, AGUA_ORILLA } from "./naturaleza/paleta.ts";
import * as THREE from "three/webgpu";
import { uniform, uv, vec2, vec3, vec4, float, mix, positionLocal, positionWorld, cameraPosition, normalize, dot, reflect, pow, max, min, clamp, abs, sin, cos, fract, smoothstep, exp, length, oneMinus, texture, floor, fwidth, step } from "three/tsl";
import type { DetalleAgua } from "./calidad.ts";

type N = ReturnType<typeof float>;
type N2 = ReturnType<typeof vec2>;
/** A ripple ring: (x, z, t0, strength) in world metres and the water's own clock (pesca: float landing, bite, jump). */
export type Onda = { value: THREE.Vector4 };
/** The scene's light the water reads: the horizon colour (fresnel), the sun's colour and direction (glints). */
export type LuzAgua = { cielo: { value: THREE.Color }; sol: { value: THREE.Color }; solDir: { value: THREE.Vector3 } };
/** The water's outline, so the shader knows how far each pixel is from the shore (metres). */
export type FormaAgua = { tipo: "rect"; ancho: number; largo: number } | { tipo: "circulo"; radio: number };
export type OpcionesAgua = {
  color: number; forma: FormaAgua; detalle: DetalleAgua; tiempo: { value: number };
  luz?: LuzAgua; ondas?: Onda[];
  /** Metres of the outer edge hidden under a bank (the pond's earth ring): the foam starts past it. */
  bordeOculto?: number;
  /** E03 · AG1: colour, shore band, foam and wash from the real depth of the bed (fondoDeAgua); without it, the N2 look. */
  orilla?: OrillaAgua;
  /** E03 · AG10: how visible the drifting 0/1 strings are (0 = off, default off; 0.35 = «tenue», the spec's default). */
  binarios?: number;
  /** The current that drags the binaries (world vec3, m/s; e.g. entorno's `vientoU`): the water drifts at ~12 % of it. */
  corriente?: { value: THREE.Vector3 };
};
/** E03 variants Pablo picks from photos: one smooth gradient (Starwild-like) or the same gradient in 4 flat steps (PRI-008). */
export type VarianteOrilla = "continuo" | "bandas";
/** The bed under a water: depth texture over a square of side `lado` (m) whose corner is (x0, z0) in world xz. */
export type FondoAgua = { textura: THREE.DataTexture; x0: number; z0: number; lado: number; res: number; datos: Uint8Array };
/** Signed distance (m) to the zero crossings of a res² grid of depths (+ in the water): the crossings are found on every
 * texel edge by linear interpolation, then each texel takes the nearest one. Brute force; 64² × a few hundred points. */
function distanciaAOrilla(prof: Float32Array, res: number, paso: number): Float32Array {
  const px: number[] = [], pz: number[] = [];
  const corte = (i0: number, j0: number, i1: number, j1: number) => {
    const a = prof[j0 * res + i0], b = prof[j1 * res + i1];
    if ((a > 0) === (b > 0)) return;
    const k = a / (a - b); px.push(i0 + (i1 - i0) * k); pz.push(j0 + (j1 - j0) * k);
  };
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) { if (i + 1 < res) corte(i, j, i + 1, j); if (j + 1 < res) corte(i, j, i, j + 1); }
  const out = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    let m = 1e9;
    for (let q = 0; q < px.length; q++) { const dx = px[q] - i, dz = pz[q] - j, d2 = dx * dx + dz * dz; if (d2 < m) m = d2; }
    const d = px.length ? Math.sqrt(m) * paso : 99;
    out[j * res + i] = prof[j * res + i] > 0 ? d : -d;
  }
  return out;
}
export type OrillaAgua = { variante: VarianteOrilla; fondo: FondoAgua };

// ---- E03 · the depth model, shared by the shader and its CPU twins (tests, docs) ----
/** The RG8 bed texture: R = depth, −0.5 m (land above the water) … +2 m (deep), 1 cm steps; G = signed distance to the
 * waterline, −1 m (on land) … +8 m (out in the water), 3.5 cm steps. Foam, wash and the shore band are laid in METRES from
 * the waterline (G), so they keep their width on a bank as flat as the pond's; the colour follows the depth (R). */
export const FONDO = { min: -0.5, rango: 2.5, res: 64, distMin: -1, distRango: 9 } as const;
/** e-folding depth (m) of the colour: moderate depth (spec §Agua): 0.38 m already reads «media», 1.4 m «honda». */
export const PROF_COLOR = 0.55;
/** Flat steps of the «bandas» variant (PRI-008: 3–4 bands). */
export const BANDAS_ORILLA = 4;
/** Shore band, foam and wash: metres from the waterline. */
export const ORILLA_M = { franja: 1.4, espuma: 0.14, lavado: 2.6 } as const;
/** 0 at the waterline … → 1 deep: the colour parameter of both variants. */
export const tDeProfundidad = (d: number) => 1 - Math.exp(-Math.max(0, d) / PROF_COLOR);
/** «bandas»: the same parameter in n flat levels 0, 1/(n−1) … 1 (the shader softens each edge by one pixel). */
export const bandear = (t: number, n = BANDAS_ORILLA) => Math.min(Math.floor(Math.min(Math.max(t, 0), 0.99999) * n), n - 1) / (n - 1);
const lin = (hex: number) => new THREE.Color(hex);
/** CPU twin of the shader's colour ramp (linear rgb, before light): somera → media → honda (paleta.ts AGUA_ORILLA). */
export function rampaOrilla(t: number): [number, number, number] {
  const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const s = lin(AGUA_ORILLA.somera), m = lin(AGUA_ORILLA.media), h = lin(AGUA_ORILLA.honda);
  const a = ss(0, 0.55, t), b = ss(0.5, 1, t);
  const mx = (p: number, q: number, k: number) => p + (q - p) * k;
  return [mx(mx(s.r, m.r, a), h.r, b), mx(mx(s.g, m.g, a), h.g, b), mx(mx(s.b, m.b, a), h.b, b)];
}
/**
 * Bake the bed under a water once (CPU, pure apart from the texture object): depth = water level − ground height on a res²
 * grid over the square centred at (cx, cz) with side `lado`. Use the terrain's own height function (terreno.alturaEn).
 */
export function fondoDeAgua(alturaEn: (x: number, z: number) => number, nivel: number, cx: number, cz: number, lado: number, res: number = FONDO.res): FondoAgua {
  const datos = new Uint8Array(res * res * 2), x0 = cx - lado / 2, z0 = cz - lado / 2, prof = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) prof[j * res + i] = nivel - alturaEn(x0 + ((i + 0.5) / res) * lado, z0 + ((j + 0.5) / res) * lado);
  const dist = distanciaAOrilla(prof, res, lado / res), u8 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  for (let k = 0; k < res * res; k++) { datos[k * 2] = u8((prof[k] - FONDO.min) / FONDO.rango); datos[k * 2 + 1] = u8((dist[k] - FONDO.distMin) / FONDO.distRango); }
  const textura = new THREE.DataTexture(datos, res, res, THREE.RGFormat, THREE.UnsignedByteType);
  textura.magFilter = THREE.LinearFilter; textura.minFilter = THREE.LinearFilter; textura.generateMipmaps = false;
  textura.wrapS = textura.wrapT = THREE.ClampToEdgeWrapping; textura.colorSpace = THREE.NoColorSpace; textura.needsUpdate = true;
  textura.name = "agua-fondo";
  return { textura, x0, z0, lado, res, datos };
}
const texel = (f: FondoAgua, x: number, z: number) => Math.min(f.res - 1, Math.max(0, Math.floor(((z - f.z0) / f.lado) * f.res))) * f.res + Math.min(f.res - 1, Math.max(0, Math.floor(((x - f.x0) / f.lado) * f.res)));
/**
 * The height of the DRAWN ground (its triangles, not the smooth terrain function) over a square: on a coarse lattice the
 * drawn bank crosses the water metres away from where the smooth function does, and the foam must sit on the line the eye
 * sees. Only the triangles over the square are kept, bucketed 16²; the highest triangle under (x, z) wins (props baked in
 * the mesh poke out of the water and get their own foam). Falls back to `otra` where no triangle covers the point.
 */
export function alturaDeMalla(malla: THREE.Mesh, x0: number, z0: number, lado: number, otra: (x: number, z: number) => number): (x: number, z: number) => number {
  malla.updateMatrixWorld(true);
  const g = malla.geometry, pos = g.getAttribute("position"), idx = g.index, n = idx ? idx.count : pos.count;
  const v = new THREE.Vector3(), B = 16, cubos: number[][] = Array.from({ length: B * B }, () => []), tri: number[] = [];
  const P = (k: number) => { v.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(malla.matrixWorld); return [v.x, v.y, v.z]; };
  for (let k = 0; k + 2 < n; k += 3) {
    const a = P(k), b = P(k + 1), c = P(k + 2);
    const mnx = Math.min(a[0], b[0], c[0]), mxx = Math.max(a[0], b[0], c[0]), mnz = Math.min(a[2], b[2], c[2]), mxz = Math.max(a[2], b[2], c[2]);
    if (mxx < x0 || mnx > x0 + lado || mxz < z0 || mnz > z0 + lado) continue;
    const t = tri.length / 9; tri.push(...a, ...b, ...c);
    const i0 = Math.max(0, Math.floor(((mnx - x0) / lado) * B)), i1 = Math.min(B - 1, Math.floor(((mxx - x0) / lado) * B));
    const j0 = Math.max(0, Math.floor(((mnz - z0) / lado) * B)), j1 = Math.min(B - 1, Math.floor(((mxz - z0) / lado) * B));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cubos[j * B + i].push(t);
  }
  return (x, z) => {
    const i = Math.min(B - 1, Math.max(0, Math.floor(((x - x0) / lado) * B))), j = Math.min(B - 1, Math.max(0, Math.floor(((z - z0) / lado) * B)));
    let mejor = -Infinity;
    for (const t of cubos[j * B + i]) {
      const o = t * 9, ax = tri[o], az = tri[o + 2], bx = tri[o + 3], bz = tri[o + 5], cx = tri[o + 6], cz = tri[o + 8];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * tri[o + 1] + l2 * tri[o + 4] + l3 * tri[o + 7];
      if (y > mejor) mejor = y;
    }
    return mejor > -Infinity ? mejor : otra(x, z);
  };
}
/** CPU twin: the depth (m) the shader reads at a world point (nearest texel). */
export const profundidadEn = (f: FondoAgua, x: number, z: number): number => (f.datos[texel(f, x, z) * 2] / 255) * FONDO.rango + FONDO.min;
/** CPU twin: the signed distance (m) to the waterline the shader reads (+ in the water). */
export const distanciaOrillaEn = (f: FondoAgua, x: number, z: number): number => (f.datos[texel(f, x, z) * 2 + 1] / 255) * FONDO.distRango + FONDO.distMin;

/** R1: the house sea-green (paleta.ts CASA.verdemar) the shallows lean to. R5.2: the pond colour lives in paleta.ts (re-exported here). */
const VERDEMAR = new THREE.Color(CASA.verdemar);
export { COLOR_ESTANQUE } from "./naturaleza/paleta.ts";
const LUZ_POR_DEFECTO: LuzAgua = { cielo: uniform(new THREE.Color(0xc9d8e4)), sol: uniform(new THREE.Color(0xffffff)), solDir: uniform(new THREE.Vector3(0.5, 0.8, 0.3).normalize()) } as unknown as LuzAgua;
/** Wave height (m) the waves reach on water this big (shorter side): a lake swells, a sea swells more. */
export const amplitudOlas = (lado: number) => Math.min(0.35, Math.max(0.05, lado * 0.006));
/** Grid cells per side for big water: about one per 1.25 m, never above the tier's cap (0 = flat, one quad). */
export const celdasOlas = (lado: number, tope: number) => (tope <= 0 ? 1 : Math.max(1, Math.min(tope, Math.ceil(lado / 1.25))));

/** The plane or disc the water is drawn on, already lying flat (+y up), with enough cells for its waves. */
export function geometriaDeAgua(forma: FormaAgua, detalle: DetalleAgua, olasDesde: number): THREE.BufferGeometry {
  if (forma.tipo === "circulo") return new THREE.CircleGeometry(forma.radio, 40).rotateX(-Math.PI / 2);
  const lado = Math.min(forma.ancho, forma.largo), olas = lado >= olasDesde ? detalle.olas : 0;
  const k = celdasOlas(Math.max(forma.ancho, forma.largo), olas), ka = Math.max(1, Math.round(k * forma.ancho / Math.max(forma.ancho, forma.largo))), kl = Math.max(1, Math.round(k * forma.largo / Math.max(forma.ancho, forma.largo)));
  return new THREE.PlaneGeometry(forma.ancho, forma.largo, olas ? ka : 1, olas ? kl : 1).rotateX(-Math.PI / 2);
}

/** The stylised water material. With `olas` > 0 and a grid geometry (geometriaDeAgua) the surface moves. */
export function materialDeAgua(o: OpcionesAgua, olasDesde: number): THREE.MeshLambertNodeMaterial {
  const d = o.detalle, luz = o.luz ?? LUZ_POR_DEFECTO;
  const reloj = o.tiempo as unknown as N;
  const mat = new THREE.MeshLambertNodeMaterial({ transparent: true });
  mat.name = "agua-estilo";
  // ---- distance to the shore (m) and how deep this pixel «is» (0 shore … 1 deep) ----
  const u = uv();
  let orilla: N, lado: number;
  if (o.forma.tipo === "rect") {
    const { ancho, largo } = o.forma;
    orilla = min(min(u.x, oneMinus(u.x)).mul(ancho), min(u.y, oneMinus(u.y)).mul(largo)) as N;
    lado = Math.min(ancho, largo);
  } else {
    orilla = oneMinus(length(u.sub(0.5)).mul(2)).mul(o.forma.radio) as N;
    lado = o.forma.radio * 2;
  }
  orilla = max(orilla.sub(o.bordeOculto ?? 0), 0) as N;
  const profundo = Math.min(4, Math.max(0.6, lado * 0.3));
  let hondura = clamp(orilla.div(profundo), 0, 1) as N;
  const pw = positionWorld.xz as unknown as N2;
  const V = normalize(cameraPosition.sub(positionWorld));
  // ---- E03: the real depth of the bed (m) under this pixel; it replaces the outline's distance everywhere ----
  const orillaForma = orilla; // the outline's distance: the vertex waves keep fading on it (no texture read in the vertex stage)
  const sh = o.orilla, bandas = sh?.variante === "bandas";
  let prof: N = float(0) as N, aOrilla: N = float(0) as N; // depth (m) · signed distance to the waterline (m)
  if (sh) {
    const f = sh.fondo;
    const lecho = texture(f.textura, vec2(pw.x.sub(f.x0).div(f.lado), pw.y.sub(f.z0).div(f.lado)));
    prof = lecho.r.mul(FONDO.rango).add(FONDO.min) as unknown as N;
    aOrilla = lecho.g.mul(FONDO.distRango).add(FONDO.distMin) as unknown as N;
    hondura = oneMinus(exp(max(prof, 0).div(-PROF_COLOR))) as N;
    orilla = max(aOrilla, 0) as N; // metres from the waterline (wave fade, crests, streak masks)
  }
  /** «bandas»: n flat levels with each edge softened over one pixel (fwidth), so the steps never shimmer. */
  const bandearN = (x: N, n: number): N => { const y = x.mul(n), w = clamp(fwidth(y), 0.0005, 0.5); return min(floor(y).add(smoothstep(oneMinus(w), float(1), fract(y))).div(n - 1), 1) as N; };
  /** A hard edge at `a` (bands) or a soft ramp of width `ancho` (continuous): 1 below, 0 above. */
  const bajo = (x: N, a: number, ancho: number): N => (bandas ? oneMinus(smoothstep(float(a).sub(fwidth(x)), float(a).add(fwidth(x)), x)) : oneMinus(smoothstep(a - ancho, a + ancho, x))) as N;
  // ---- vertex waves (big water only): three long swells, faded to nothing near the shore so the edge stays put ----
  const conOlas = o.forma.tipo === "rect" && d.olas > 0 && lado >= olasDesde;
  const A = amplitudOlas(lado);
  const alturaOla = (p: N2): N => {
    const w1 = sin(dot(p, vec2(0.21, 0.13)).add(reloj.mul(0.9)));
    const w2 = sin(dot(p, vec2(-0.12, 0.27)).add(reloj.mul(1.25))).mul(0.6);
    const w3 = sin(dot(p, vec2(0.37, -0.31)).add(reloj.mul(1.9))).mul(0.3);
    return w1.add(w2).add(w3).div(1.9) as N; // -1 … 1
  };
  // the plane lies in local xz (rotated geometry), so local xz are metres on the surface
  const pLocal = positionLocal.xz as unknown as N2;
  // waves only rise above the rest height (troughs never dip under the ground the water lies on)
  if (conOlas) mat.positionNode = positionLocal.add(vec3(0, alturaOla(pLocal).mul(0.5).add(0.5).mul(A).mul(smoothstep(0, Math.min(3, lado * 0.15), orillaForma)), 0));
  // ---- colour: flat bands (shallow · middle · deep), crests, streaks, caustics ----
  const base = new THREE.Color(o.color);
  // three flat steps of the builder's colour (linear): a bright turquoise shallow, the colour itself, a deeper saturated one
  const hondo = vec3(base.r * 0.62, base.g * 0.78, base.b * 0.95);
  const medio = vec3(base.r * 1.05, base.g * 1.1, base.b * 1.1);
  const claro = mix(vec3(base.r, base.g, base.b), vec3(VERDEMAR.r, VERDEMAR.g, VERDEMAR.b), 0.55).mul(1.05); // R1: shallows lean sea-green (house Verdemar), not neon turquoise
  const banda1 = smoothstep(0.16, 0.2, hondura), banda2 = smoothstep(0.55, 0.59, hondura);
  let col = mix(mix(claro, medio, banda1), hondo, banda2) as unknown as ReturnType<typeof vec3>;
  const c3 = (hex: number) => { const k = new THREE.Color(hex); return vec3(k.r, k.g, k.b); };
  if (sh) { // E03 ramp: somera → media → honda (paleta.ts AGUA_ORILLA); «bandas» samples the very same ramp at 4 flat levels
    const t = bandas ? bandearN(hondura, BANDAS_ORILLA) : hondura;
    col = mix(mix(c3(AGUA_ORILLA.somera), c3(AGUA_ORILLA.media), smoothstep(0, 0.55, t)), c3(AGUA_ORILLA.honda), smoothstep(0.5, 1, t)) as typeof col;
    // the shore band: a clear strip where the water barely covers the bed
    col = mix(col, c3(AGUA_ORILLA.franja), bajo(aOrilla, ORILLA_M.franja, 0.6).mul(0.5)) as typeof col;
  }
  if (conOlas) {
    const cresta = smoothstep(0.6, 0.65, alturaOla(pLocal)).mul(smoothstep(0, 2, orilla));
    col = mix(col, claro, cresta.mul(0.55)) as typeof col;
  }
  if (d.lineas) { // light streaks drifting with the wind: thin crests of a warped sine field, broken into dashes
    const s = sin(pw.x.mul(0.55).add(sin(pw.y.mul(0.8).add(reloj.mul(0.35))).mul(1.6)).add(reloj.mul(0.45)));
    const corte = smoothstep(0.1, 0.4, sin(pw.y.mul(0.9).sub(pw.x.mul(0.3)).add(reloj.mul(0.2))));
    const linea = smoothstep(0.93, 0.965, s).mul(corte).mul(smoothstep(0.1, 0.35, hondura));
    col = mix(col, vec3(0.93, 0.98, 1), linea.mul(0.65)) as typeof col;
  }
  if (d.causticas) { // fake caustics: the net where three drifting sine waves cross zero, only in the shallows
    const q = pw.mul(1.6);
    const v = sin(q.x.add(sin(q.y.mul(1.3).add(reloj.mul(0.7))))).add(sin(q.y.add(sin(q.x.mul(1.7).sub(reloj.mul(0.6)))))).add(sin(q.x.add(q.y).mul(0.7).sub(reloj.mul(0.9))));
    const red = oneMinus(smoothstep(0.08, 0.3, abs(v)));
    // E03: over the real bed the shallows are wide, so the net stays faint and only where the water is thinnest
    const zonaCaustica = sh ? oneMinus(smoothstep(0.08, 0.32, hondura)).mul(0.1) : oneMinus(smoothstep(0.15, 0.6, hondura)).mul(0.22);
    col = col.add(vec3(1, 1, 0.92).mul(red.mul(zonaCaustica))) as typeof col;
  }
  // ---- ripple rings (pesca): pale rings leaving a point, fading in 4 s ----
  for (const r of o.ondas ?? []) {
    const w = r as unknown as ReturnType<typeof vec4>;
    const edad = reloj.sub(w.z), dd = length(pw.sub(w.xy));
    const amp = w.w.mul(exp(edad.mul(-0.9))).mul(smoothstep(0, 0.05, edad)).mul(smoothstep(-0.1, 0.1, edad.negate().add(4)));
    const anillo = oneMinus(smoothstep(0.03, 0.09, abs(fract(dd.sub(edad.mul(1.1)).mul(1.6)).sub(0.5)))).mul(smoothstep(edad.mul(1.1).add(0.05), edad.mul(1.1).sub(0.6), dd)).mul(smoothstep(0.0, 0.3, dd));
    col = mix(col, vec3(0.92, 0.97, 1), clamp(anillo.mul(amp).mul(1.4), 0, 0.85)) as typeof col;
  }
  // ---- stepped fresnel toward the horizon: the water at a grazing angle takes the sky's colour, in two flat steps ----
  const fr = oneMinus(clamp(V.y, 0, 1));
  const escalon = sh && !bandas ? smoothstep(0.8, 0.985, fr).mul(0.36) : smoothstep(0.86, 0.88, fr).mul(0.2).add(smoothstep(0.955, 0.965, fr).mul(0.16));
  col = mix(col, luz.cielo as unknown as typeof col, escalon) as typeof col;
  // ---- shore foam: a band that breathes along the shore; with espumaViva a broken second line runs in to the shore ----
  const tt = d.espumaViva ? reloj : float(0);
  const ruido = sin(pw.x.mul(2.3).add(tt.mul(1.1))).mul(sin(pw.y.mul(1.9).sub(tt.mul(0.9)))).mul(0.5).add(0.5);
  const anchoEspuma = Math.min(0.32, Math.max(0.1, lado * 0.035));
  const e = ruido.mul(0.6).add(0.45).mul(anchoEspuma);
  let espuma = oneMinus(smoothstep(e.sub(0.03), e, orilla)) as N;
  let lavado: N = float(0) as N;
  if (sh) {
    // foam on the TRUE waterline, breathing with the noise; a broken second line runs in from ~2 m out to the shore
    const eh = ruido.mul(0.16).add(ORILLA_M.espuma);
    espuma = oneMinus(smoothstep(eh.sub(0.08), eh, aOrilla)).mul(0.85) as N;
    if (d.espumaViva) {
      const fase = fract(reloj.mul(0.16).add(ruido.mul(0.12)));
      const donde = oneMinus(fase).mul(1.8).add(0.5);
      espuma = max(espuma, oneMinus(smoothstep(0.05, 0.16, abs(aOrilla.sub(donde)))).mul(fase).mul(smoothstep(0.35, 0.55, ruido))) as N;
    }
    // the wash (starwild 021 idea): a pale veil where the water is thinnest that comes and goes, bands of ~18 m running along the shore
    const ola = sin(tt.mul(1.4).add(dot(pw, vec2(0.031, 0.041)).mul(6.2832))).mul(0.25).add(0.35);
    const lav = bajo(aOrilla, ORILLA_M.lavado * 0.5, ORILLA_M.lavado * 0.5).mul(ola);
    lavado = (bandas ? step(0.3, lav).mul(0.45) : lav) as N;
    col = mix(col, c3(AGUA_ORILLA.espuma), lavado.mul(0.7)) as typeof col;
  } else if (d.espumaViva) {
    const fase = fract(reloj.mul(0.16).add(ruido.mul(0.12)));
    const donde = oneMinus(fase).mul(anchoEspuma * 3.2).add(anchoEspuma * 0.9);
    const linea2 = oneMinus(smoothstep(0.02, 0.06, abs(orilla.sub(donde)))).mul(fase).mul(smoothstep(0.35, 0.55, ruido));
    espuma = max(espuma, linea2) as N;
  }
  // ---- E03 · AG10: 0/1 strings drifting with the current, under the surface (parallax by depth), now and then on a crest ----
  const vis = Math.min(1, Math.max(0, o.binarios ?? 0));
  if (vis > 0) {
    const cur = (o.corriente ? (o.corriente as unknown as ReturnType<typeof vec3>).xz.mul(0.12) : vec2(0.24, 0.09)) as unknown as N2;
    const rapidez = max(length(cur), 0.05), dir = cur.div(rapidez) as unknown as N2;
    const bajoAgua = sh ? min(max(prof, 0), 0.6).mul(0.7) : float(0.25);
    const pB = pw.sub(V.xz.mul(bajoAgua.div(max(V.y, 0.25)))) as unknown as N2; // where the view ray meets a layer under the surface
    const largo = dot(pB, dir), traves0 = dot(pB, vec2(dir.y.negate(), dir.x));
    const traves = traves0.add(sin(largo.mul(0.35).add(reloj.mul(0.3))).mul(0.3)); // the strings meander with the flow
    const fila = floor(traves.div(1.0)), h1 = (a: N, b: N) => fract(sin(a.mul(127.1).add(b.mul(311.7))).mul(43758.5453)) as N;
    const avance = largo.sub(reloj.mul(rapidez).mul(h1(fila, float(3.7)).mul(0.8).add(0.6))); // each row its own speed
    const celda = floor(avance.div(0.6)), cx = fract(avance.div(0.6)).sub(0.5), cy = fract(traves.div(1.0)).sub(0.5); // digits ~0.35 × 0.7 m
    const tramo = h1(floor(celda.div(7)), fila); // strings of 7 digits; a third of them lit, each fading in and out
    const encendido = step(0.66, tramo).mul(smoothstep(0.1, 0.7, sin(reloj.mul(0.45).add(tramo.mul(40)))));
    const cero = oneMinus(smoothstep(0.1, 0.19, abs(length(vec2(cx.div(0.27), cy.div(0.34))).sub(0.8))));
    const uno = oneMinus(smoothstep(0.055, 0.09, abs(cx))).mul(oneMinus(smoothstep(0.28, 0.33, abs(cy))));
    const dist = length(cameraPosition.xz.sub(pw));
    const glifo = mix(cero, uno, step(0.5, h1(celda, fila.add(17)))).mul(encendido).mul(oneMinus(smoothstep(25, 55, dist)))
      .mul(sh ? smoothstep(0.8, 2.5, aOrilla) : float(1)).mul(oneMinus(espuma)) as N;
    // «a veces en la cresta»: where a slow swell peaks, a few strings come up lighter (the pond has no vertex waves)
    const cresta = smoothstep(0.82, 0.97, sin(dot(pw, vec2(0.23, 0.17)).sub(reloj.mul(0.8))).mul(sin(dot(pw, vec2(-0.11, 0.29)).add(reloj.mul(0.5)))));
    col = mix(col, mix(c3(AGUA_ORILLA.codigo), c3(AGUA_ORILLA.codigoCresta), cresta), glifo.mul(vis * 0.7).mul(cresta.mul(0.6).add(1))) as typeof col;
  }
  col = mix(col, sh ? c3(AGUA_ORILLA.espuma) : vec3(1, 1, 1), espuma) as typeof col;
  mat.colorNode = col;
  // foam reads white even in shade (a little of its own light), like painted foam; the sun's colour tints it
  let propia = (luz.sol as unknown as typeof col).mul(espuma.mul(0.35)) as typeof col;
  // ---- stepped sun glints (the «reflejos» choice on desktop): a few hard white sparks where the sun reflects ----
  if (d.destellos) {
    const nx = cos(pw.x.mul(1.7).add(reloj.mul(1.3))).mul(0.16).add(cos(pw.x.add(pw.y).mul(3.1).sub(reloj.mul(2.1))).mul(0.07));
    const nz = cos(pw.y.mul(1.5).sub(reloj.mul(1.1))).mul(0.16).add(cos(pw.y.sub(pw.x).mul(2.7).add(reloj.mul(1.7))).mul(0.07));
    const Nn = normalize(vec3(nx, 1, nz));
    const L = normalize(luz.solDir as unknown as ReturnType<typeof vec3>);
    const brillo = pow(max(dot(reflect(L.negate(), Nn), V), 0), 90);
    const chispa = smoothstep(0.45, 0.5, brillo).mul(oneMinus(espuma)).mul(smoothstep(0.0, 0.08, L.y));
    propia = propia.add((luz.sol as unknown as typeof col).mul(chispa.mul(1.3))) as typeof col;
  }
  mat.emissiveNode = propia;
  if (sh) { // E03: thin water shows its bed, deep water and grazing views close it (starwild's opacity idea: depth over the view's cosine)
    const cubre = oneMinus(exp(max(prof, 0).mul(-1.8).div(max(V.y, 0.08)))) as N;
    mat.opacityNode = max(max(mix(float(0.32), float(0.95), bandas ? bandearN(cubre, BANDAS_ORILLA) : cubre).add(escalon.mul(0.2)), espuma), lavado);
  } else mat.opacityNode = max(mix(float(0.76), float(0.93), banda1.mul(0.5).add(banda2.mul(0.5))).add(escalon.mul(0.2)), espuma);
  return mat;
}
