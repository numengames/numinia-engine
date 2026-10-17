// agua-estilo (N2): the engine's stylised water, one procedural node material shared by the elements' water (ponds,
// fountains, the templates' seas: elementos.ts) and the fishing pond (pesca.ts). Flat colour in the house look
// (PRI-008: solid colour bands, no photo texture, no mirror): a shallow band by the shore and a deep one in the middle,
// shore foam that breathes, a stepped fresnel toward the sky's horizon colour, and — climbing with the device tier
// (calidad.ts DETALLE_AGUA) — vertex waves on big water with lighter crests, drifting light streaks, fake caustics in the
// shallows and stepped sun glints. No texture, no render target, no second scene pass: one draw call per water at every
// tier; the cost is ALU per pixel (D: bands + foam + fresnel only). Lit by the scene (Lambert), so night darkens it.
import * as THREE from "three/webgpu";
import { uniform, uv, vec2, vec3, vec4, float, mix, positionLocal, positionWorld, cameraPosition, normalize, dot, reflect, pow, max, min, clamp, abs, sin, cos, fract, smoothstep, exp, length, oneMinus } from "three/tsl";
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
};

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
  const hondura = clamp(orilla.div(profundo), 0, 1);
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
  if (conOlas) mat.positionNode = positionLocal.add(vec3(0, alturaOla(pLocal).mul(0.5).add(0.5).mul(A).mul(smoothstep(0, Math.min(3, lado * 0.15), orilla)), 0));
  // ---- colour: flat bands (shallow · middle · deep), crests, streaks, caustics ----
  const base = new THREE.Color(o.color);
  // three flat steps of the builder's colour (linear): a bright turquoise shallow, the colour itself, a deeper saturated one
  const hondo = vec3(base.r * 0.62, base.g * 0.78, base.b * 0.95);
  const medio = vec3(base.r * 1.05, base.g * 1.1, base.b * 1.1);
  const claro = mix(vec3(base.r, base.g, base.b), vec3(0.32, 0.86, 0.8), 0.55).mul(1.15);
  const banda1 = smoothstep(0.16, 0.2, hondura), banda2 = smoothstep(0.55, 0.59, hondura);
  let col = mix(mix(claro, medio, banda1), hondo, banda2) as unknown as ReturnType<typeof vec3>;
  const pw = positionWorld.xz as unknown as N2;
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
    col = col.add(vec3(1, 1, 0.92).mul(red.mul(0.22).mul(oneMinus(smoothstep(0.15, 0.6, hondura))))) as typeof col;
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
  const V = normalize(cameraPosition.sub(positionWorld));
  const fr = oneMinus(clamp(V.y, 0, 1));
  const escalon = smoothstep(0.86, 0.88, fr).mul(0.2).add(smoothstep(0.955, 0.965, fr).mul(0.16));
  col = mix(col, luz.cielo as unknown as typeof col, escalon) as typeof col;
  // ---- shore foam: a band that breathes along the shore; with espumaViva a broken second line runs in to the shore ----
  const tt = d.espumaViva ? reloj : float(0);
  const ruido = sin(pw.x.mul(2.3).add(tt.mul(1.1))).mul(sin(pw.y.mul(1.9).sub(tt.mul(0.9)))).mul(0.5).add(0.5);
  const anchoEspuma = Math.min(0.32, Math.max(0.1, lado * 0.035));
  const e = ruido.mul(0.6).add(0.45).mul(anchoEspuma);
  let espuma = oneMinus(smoothstep(e.sub(0.03), e, orilla)) as N;
  if (d.espumaViva) {
    const fase = fract(reloj.mul(0.16).add(ruido.mul(0.12)));
    const donde = oneMinus(fase).mul(anchoEspuma * 3.2).add(anchoEspuma * 0.9);
    const linea2 = oneMinus(smoothstep(0.02, 0.06, abs(orilla.sub(donde)))).mul(fase).mul(smoothstep(0.35, 0.55, ruido));
    espuma = max(espuma, linea2) as N;
  }
  col = mix(col, vec3(1, 1, 1), espuma) as typeof col;
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
  mat.opacityNode = max(mix(float(0.76), float(0.93), banda1.mul(0.5).add(banda2.mul(0.5))).add(escalon.mul(0.2)), espuma);
  return mat;
}
