// cielo-horizonte (B3): the colour of the atmosphere's horizon, worked out in JS — the same formulas as three's SkyMesh
// (three r186, examples/jsm/objects/SkyMesh.js: Preetham scattering + its clouds), evaluated on the same directions
// the engine used to read back from the GPU (the two middle rows of the four side faces of a 16 px cube).
// Why: the fog of an «atmosfera» sky takes that colour (nieblaAuto). Reading it back from the GPU
// (readRenderTargetPixelsAsync → getBufferSubData) made the page wait for the whole GPU queue — every shader compile
// queued at that moment: R6 measured 0.31 s in the plaza's load. This costs ~0.1 ms and asks the GPU nothing.
// Pure: no three, no GPU (test/precompilar.test.ts compares it with colours read back from a real render).

export type ParamsCielo = {
  turbidez: number; rayleigh: number; mie: number; mieG: number;
  /** Where the sun is (SkyMesh.sunPosition; the engine gives a unit vector). */
  sol: { x: number; y: number; z: number };
  /** SkyMesh cloudCoverage / cloudDensity (0 = no clouds). */
  nubes: number; densidad: number;
  /** SkyMesh cloudElevation and cloudScale (its defaults). */
  elevacion?: number; escala?: number;
  /** Seconds of three's `time` (the clouds drift): the default 0 is a fine average. */
  tiempo?: number;
  /** Cube side in px whose middle rows are sampled (the engine's sample cube: 16). */
  px?: number;
};
type V3 = [number, number, number];

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const fract = (x: number) => x - Math.floor(x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// the clouds' noise, as SkyMesh writes it (a sinless hash: every GPU makes the same clouds)
function gradiente(ix: number, iy: number): [number, number] {
  let p0 = fract(ix * 0.1031), p1 = fract(iy * 0.1030), p2 = fract(ix * 0.0973);
  const d = p0 * (p1 + 33.33) + p1 * (p2 + 33.33) + p2 * (p0 + 33.33);
  p0 += d; p1 += d; p2 += d;
  return [fract((p0 + p1) * p2) * 2 - 1, fract((p0 + p2) * p1) * 2 - 1];
}
function ruido(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (ox: number, oy: number) => { const q = gradiente(ix + ox, iy + oy); return q[0] * (fx - ox) + q[1] * (fy - oy); };
  return mix(mix(g(0, 0), g(1, 0), ux), mix(g(0, 1), g(1, 1), ux), uy) * 1.6;
}
function fbm(x: number, y: number, deriva: number): number {
  let r = 0, a = 1;
  for (let i = 0; i < 4; i++) { r += a * ruido(x, y); a *= 0.5; x = x * 2 + deriva; y = y * 2 + deriva; }
  return r;
}

/** The sky's colour (linear, HDR, before tone mapping; as the render target held it) seen in direction `d` (unit). */
export function colorCielo(p: ParamsCielo, d: V3): V3 {
  const e = Math.E, pi = Math.PI;
  // vertex part (SkyMesh's varyings)
  const sl = Math.hypot(p.sol.x, p.sol.y, p.sol.z) || 1;
  const s: V3 = [p.sol.x / sl, p.sol.y / sl, p.sol.z / sl];
  const sunE = 1000 * Math.max(0, 1 - Math.pow(e, -((1.6110731556870734 - Math.acos(clamp(s[1], -1, 1))) / 1.5)));
  const sunfade = 1 - clamp(1 - Math.exp(p.sol.y / 450000), 0, 1);
  const rc = p.rayleigh - (1 - sunfade);
  const TR: V3 = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
  const MC: V3 = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
  const totalMie = 0.434 * (0.2 * p.turbidez * 10e-18);
  const bR = TR.map((x) => x * rc) as V3, bM = MC.map((x) => totalMie * x * p.mie) as V3;
  // fragment part
  const zen = Math.acos(Math.max(0, d[1]));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / pi, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const Fex = [0, 1, 2].map((k) => Math.exp(-(bR[k] * sR + bM[k] * sM))) as V3;
  const cosT = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
  const c = cosT * 0.5 + 0.5, rPhase = 0.05968310365946075 * (1 + c * c);
  const g = p.mieG, g2 = g * g, mPhase = 0.07957747154594767 * (1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5);
  const tinte = clamp(Math.pow(1 - s[1], 5), 0, 1);
  const Lin = [0, 1, 2].map((k) => {
    const r = (bR[k] * rPhase + bM[k] * mPhase) / (bR[k] + bM[k]);
    return Math.pow(sunE * r * (1 - Fex[k]), 1.5) * mix(1, Math.pow(sunE * r * Fex[k], 0.5), tinte);
  }) as V3;
  const L0 = Fex.map((x) => 0.1 * x) as V3;
  const base: V3 = [0, 0.0003, 0.00075];
  const col = [0, 1, 2].map((k) => (Lin[k] + L0[k]) * 0.04 + base[k]) as V3; // sun disc off (as the engine bakes it)
  if (d[1] > 0 && p.nubes > 0) {
    const elev = p.elevacion ?? 0.5, escala = p.escala ?? 0.0002, t = p.tiempo ?? 0, vel = 0.00002;
    const h = mix(1, 0.1, elev);
    const ux = (d[0] / (d[1] * h)) * escala + t * vel, uy = (d[2] / (d[1] * h)) * escala + t * vel;
    const n = clamp(fbm(ux * 1000, uy * 1000, t * vel * 300) * 0.7 + 0.5, 0, 1);
    const region = ruido(ux * 300, uy * 300) * 0.37 + 0.5;
    const cov = clamp(p.nubes + (region - 0.5) * 0.6, 0, 1), umbral = 1 - cov;
    const fade = smooth(0, 0.03 + 0.06 * elev, d[1]);
    const mascara = smooth(umbral, umbral + 0.3, n) * fade;
    const dia = smooth(-0.08, 0.3, s[1]);
    const prof = Math.max(0, n - umbral), beer = Math.exp(-4 * prof), polvo = 1 - beer * beer;
    const sombra = mix(0.45, 1, clamp(beer * polvo * 2.6, 0, 1));
    const plata = clamp(0.51 / Math.pow(1.49 - cosT * 1.4, 1.5), 0, 3);
    const borde = mascara * (1 - mascara) * 4;
    const alfa = (1 - Math.exp(-12 * prof * p.densidad)) * fade;
    for (let k = 0; k < 3; k++) {
      const sol = sunE * Fex[k] * 0.22 * 0.04;
      const nube = (Lin[k] * 0.04 + base[k] + sol * sombra + sol * plata * borde * 0.6) * Math.max(dia, 0.03);
      col[k] -= L0[k] * 0.04 * alfa;
      col[k] = mix(col[k], mix(col[k], nube, Fex[k]), alfa);
    }
  }
  return col;
}

/** The fog colour of an atmosphere sky: the mean of the two middle rows of the four side faces of a `px` cube
 * (what entorno.ts read back from the GPU until B3). Linear RGB. */
export function horizonteAtmosfera(p: ParamsCielo): V3 {
  const px = p.px ?? 16, v = 1 / px; // the centres of the two middle rows sit ±half a pixel from the horizon
  let r = 0, g = 0, b = 0, k = 0;
  for (let i = 0; i < px; i++) {
    const u = ((i + 0.5) / px) * 2 - 1;
    for (const y of [v, -v]) for (const dir of [[1, y, u], [-1, y, u], [u, y, 1], [u, y, -1]] as V3[]) {
      const l = Math.hypot(dir[0], dir[1], dir[2]);
      const c = colorCielo(p, [dir[0] / l, dir[1] / l, dir[2] / l]);
      r += c[0]; g += c[1]; b += c[2]; k++;
    }
  }
  return [r / k, g / k, b / k];
}
