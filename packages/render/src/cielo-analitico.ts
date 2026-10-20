// cielo-analitico (E04 · AC3 + AC9): the whole sky as ONE function in the dome's shader — zenith → pale turquoise → ivory/nacre horizon, the
// warm twilight glow, the sun's disc and glare, a subtle prismatic 22° halo, stars (barely there by day, clear at night) and a crescent moon —
// drawn LIVE on every tier and LAST (after the opaque scene, depth pinned at the far plane), so only the sky you actually see is shaded.
//
// COPIED from:
//  · starwild.io sky (proprietary: idea only, work/starwild/shaders/009 `skyRadiance`, 010 vertex, 011 fragment): horizon → zenith by
//    pow(smoothstep(0, .8, elevation), .65); the sunset glow pow(dot(ray, sun), 12) · twilight · smoothstep(0, .08, elevation); the sun disc
//    smoothstep(cos .022, cos .019, dot); the crescent = a disc minus an offset disc with soft analytic edges; the dome's depth pinned at the
//    far plane (gl_Position.z = w · 0.99999; 0 with a reversed depth buffer) so XR's float32 projection never opens a hole in it.
//  · three r186 src/renderers/common/Background.js (MIT): the sky's clip position from the view ROTATION only (modelViewMatrix · vec4(p, 0)),
//    projected with w = 1 and z forced to the far plane.
//  · Meta, WebXR performance best practices (developers.meta.com/horizon/documentation/web/webxr-perf-bp): draw the sky LAST so the depth test
//    rejects every pixel the scene already covers (the R7.1 dome and three's background mesh are drawn FIRST, over the whole screen).
//  · Dave Hoskins, «Hash without Sine» (shadertoy.com/view/4djSRW, MIT), as three's SkyMesh already writes it for its clouds: the star cells.
//  · The 22° halo's geometry and colour order (red inside, blue outside): Les Cowley, Atmospheric Optics, «22° halo»
//    (atoptics.co.uk/halo/common.htm). Colours: paleta.ts CIELO_E04 (house tokens only).
// CHANGED: starwild draws its stars as a separate Points object (one more draw call) — here they are cells of a hash over the view direction in
// the same fragment (0 calls); the moon sits where entorno.ts puts the night light (40° up, opposite the sun's bearing); the day's horizon is a
// band whose tint slides from warm ivory (towards the sun) to cool nacre (away from it), the spec's «turquesas pálidos, marfiles, nácar».
// COMBINED: with entorno.ts R7.1 (its day/night stops lerped by the hour on the CPU feed this function) and the fog: the fog's far stop is
// `lejos(dir)` — the same gradient, nacre band and glare, without stars, moon or halo (those never sit on the ground).
import * as THREE from "three/webgpu";
import { Fn, If, uniform, vec3, vec4, float, mix, smoothstep, normalize, positionLocal, modelViewMatrix, cameraProjectionMatrix, dot, max, pow, fract, floor, length, abs, exp } from "three/tsl";
import { CIELO_E04 } from "./naturaleza/paleta.ts";

/** A TSL node (three/tsl has no exported node type that `node --test` type-stripping would check: keep it loose). */
type Nodo = ReturnType<typeof vec3>;
type UColor = { value: THREE.Color } & Nodo;
/** What entorno.ts hands a sky function: its four stops (already lerped day → night by the hour, with the warm band at sunrise/sunset), the
 *  sun's halo colour, how much day it is (0 night … 1 day) and the sun's direction (unit). */
export type EntradasCielo = {
  cenit: UColor; alto: UColor; horizonte: UColor; suelo: UColor; sol: UColor;
  dia: { value: number } & Nodo; solDir: { value: THREE.Vector3 } & Nodo;
};
/** What a sky function gives back: the dome's colour for a unit direction, the colour of the fog's far stop for a unit direction, and the dome's
 *  clip-space vertex (drawn at the far plane). */
export type NodosCielo = { domo: (dir: Nodo) => Nodo; lejos: (dir: Nodo) => Nodo; vertice: Nodo };

/** The knobs (spec §Cielo «parámetros configurables»: intensidad_halo, estrellas_visibles, luminosidad). Defaults = measured fantasy. */
export const CIELO_ANALITICO = {
  /** Prismatic 22° halo: strength over the sky (0 = off), angular radius (rad) and half-width (rad). */
  halo: 0.1, haloRadio: 22 * Math.PI / 180, haloAncho: 1.6 * Math.PI / 180,
  /** Stars: how many cells hold one (1 − umbral), how big the cell grid is (cells per radian) and how much shows by day (fraction of the night). */
  estrellasUmbral: 0.965, estrellasCeldas: 110, estrellasDeDia: 0.06,
  /** The sun's disc (cos of the outer and inner radius) and its HDR gain before tone mapping. */
  discoFuera: Math.cos(0.03), discoDentro: Math.cos(0.024), discoGanancia: 3.0,
  /** The moon (outer/inner cos of its radius), its crescent's offset and its HDR gain. */
  lunaFuera: Math.cos(0.024), lunaDentro: Math.cos(0.021), lunaCorte: 0.013, lunaGanancia: 1.7,
  /** H2: the full moon of the espacio base (outer/inner cos of its radius, ≈ 2°). */
  lunaLlenaFuera: Math.cos(0.036), lunaLlenaDentro: Math.cos(0.032),
  /** The nacre band over the horizon: how thick (elevation where it fades) and how strong. */
  nacarAlto: 0.22, nacar: 0.45,
} as const;

/** Day amount by the sun's height (sin of its altitude), the same curve entorno.ts uses (alt −6° → 0, +12° → 1). */
const S = (g: number) => Math.sin(g * Math.PI / 180);
const suave = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** CPU, once per render: the twilight band (1 while the sun is within ±6–14° of the horizon), the stars' amount and the moon's. Pure: tested. */
export function cicloCielo(solY: number): { ocaso: number; estrellas: number; luna: number } {
  const dia = suave(S(-6), S(12), solY);
  const ocaso = suave(S(-8), S(0), solY) * (1 - suave(S(4), S(16), solY));
  const noche = 1 - suave(S(-10), S(2), solY);
  return { ocaso, estrellas: Math.max(noche, CIELO_ANALITICO.estrellasDeDia * dia), luna: noche };
}
/** The moon's direction for this sun: 40° up, opposite the sun's bearing (entorno.ts puts the night light there). */
export function direccionLuna(sol: THREE.Vector3, out = new THREE.Vector3(), grados = 40, mismoRumbo = false): THREE.Vector3 {
  const h = Math.hypot(sol.x, sol.z) || 1, c = Math.cos(grados * Math.PI / 180), s = Math.sin(grados * Math.PI / 180);
  const k = mismoRumbo ? 1 : -1; // H2b: the espacio base's moon keeps the (set) sun's bearing: at midnight it is due north, where the spawn's view of the mountain looks (opposite it fell behind the camera)
  const x = k * sol.x / h, z = k * sol.z / h, g = mismoRumbo ? 0.35 : 0, cg = Math.cos(g), sg = Math.sin(g); // …and 20° towards +x: centred in the on-foot frame, clear of the HUD's corners
  return out.set((x * cg - z * sg) * c, s, (x * sg + z * cg) * c);
}

/** Hoskins' «hash without sine» (vec3 → float in [0, 1)), as three's SkyMesh writes it. */
const hash31 = (p: Nodo): Nodo => {
  let q = fract(p.mul(vec3(0.1031, 0.103, 0.0973)));
  q = q.add(dot(q, q.yzx.add(33.33)));
  return fract(q.x.add(q.y).mul(q.z));
};

/** The analytic sky over entorno.ts's stops. One function for the dome, a lighter one for the fog's far stop, and the far-plane vertex.
 *  `C` = the accent colours (nacre, twilight, halo, stars, moon): any world may bring its own (R-1); the nature's are paleta.ts CIELO_E04. */
export function cieloAnalitico(u: EntradasCielo, C: typeof CIELO_E04 = CIELO_E04, o: { lunaLlena?: boolean } = {}): NodosCielo {
  const K = CIELO_ANALITICO;
  // NOT vec3(new THREE.Color(h)): vec3() reads .x/.y/.z and a Color has none (it came out BLACK on the GPU: found in the E04 photos).
  // A uniform takes the Color as it is (sRGB hex → linear working space), like entorno.ts's stops.
  const col = (h: number) => uniform(new THREE.Color(h));
  const lunaV = new THREE.Vector3(0, 1, 0);
  // hour-driven scalars: worked out on the CPU from the sun once per render (no per-pixel trigonometry)
  const ocasoU = uniform(0).onRenderUpdate(() => cicloCielo(u.solDir.value.y).ocaso);
  const estrellasU = uniform(0).onRenderUpdate(() => cicloCielo(u.solDir.value.y).estrellas);
  const lunaU = uniform(0).onRenderUpdate(() => cicloCielo(u.solDir.value.y).luna);
  const lunaDir = uniform(lunaV).onRenderUpdate(() => direccionLuna(u.solDir.value, lunaV, o.lunaLlena ? 8 : 40, !!o.lunaLlena)); // H2b: the espacio base's full moon hangs low (8°; at 22° it fell above the on-foot frame): in view from the spawn looking at the mountain
  const corteV = new THREE.Vector3(), derecha = new THREE.Vector3(), arriba = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const lunaCorte = uniform(corteV).onRenderUpdate(() => { // the crescent's cutting disc: the moon's centre nudged sideways (once per render)
    const l = direccionLuna(u.solDir.value, corteV);
    derecha.crossVectors(Y, l).normalize(); arriba.crossVectors(l, derecha);
    return corteV.addScaledVector(derecha, -K.lunaCorte).addScaledVector(arriba, 0.004).normalize();
  });
  const solXZ = new THREE.Vector3();
  const sxz = uniform(solXZ).onRenderUpdate(() => solXZ.set(u.solDir.value.x, 0, u.solDir.value.z + 1e-4).normalize()); // the sun's bearing

  /** Gradient + nacre band + twilight glow + glare: what both the dome and the fog see. */
  const base = (dir: Nodo): Nodo => {
    const y = dir.y, e = max(y, 0.0);
    // starwild's curve, through OUR three stops: horizon (ivory) → upper sky (pale turquoise) → zenith
    const t = pow(smoothstep(0.0, 0.8, e), 0.65);
    let c = mix(mix(u.horizonte, u.alto, smoothstep(0.0, 0.45, t)), u.cenit, smoothstep(0.4, 1.0, t));
    // nacre: a clean band over the horizon, warm ivory towards the sun's bearing, cool pearl away from it (day only)
    const haciaSol = dot(normalize(vec3(dir.x, 0.0, dir.z).add(vec3(0.0, 0.0, 1e-4))), sxz).mul(0.5).add(0.5);
    const banda = float(1.0).sub(smoothstep(0.0, K.nacarAlto, abs(y))).mul(u.dia).mul(K.nacar);
    c = mix(c, mix(col(C.nacarFrio), col(C.marfilCalido), haciaSol), banda);
    // below the horizon: the ground haze stop
    c = mix(c, u.suelo, smoothstep(0.0, 0.3, y.negate()));
    // sun: the warm twilight glow (starwild) and the day glare (R7.1's two lobes)
    const s = max(dot(dir, u.solDir), 0.0);
    c = c.add(col(C.ocaso).mul(pow(s, 12.0)).mul(ocasoU).mul(smoothstep(-0.02, 0.08, y)).mul(0.6));
    return mix(c, u.sol, pow(s, 8.0).mul(0.18).add(pow(s, 64.0).mul(0.45)).mul(u.dia));
  };

  // the dome: the base sky + sun, halo, stars and moon. Branches on the sky's own regions (contiguous on screen, so whole warps take the
  // same side) and on the hour (uniform): by day the moon is skipped, the halo's maths only runs near its ring, the stars only above 1.7°.
  const domoFn = Fn(([dir]: [Nodo]) => {
    const c = base(dir).toVar();
    const y = dir.y;
    If(y.greaterThan(-0.015), () => {
      const s = dot(dir, u.solDir);
      const sobre = smoothstep(-0.015, 0.025, y); // sun, moon and stars only above the horizon
      // AC9 · prismatic 22° halo: a thin ring, amber/coral inside → verdigris → violet outside (atoptics), faint
      const d = s.sub(Math.cos(K.haloRadio)).div(Math.sin(K.haloRadio) * K.haloAncho); // ≈ (angle − 22°)/width, sign flipped (inside > 0)
      If(abs(d).lessThan(3.0).and(u.dia.greaterThan(0.0)), () => {
        const prisma = mix(mix(col(C.haloFuera), col(C.haloMedio), smoothstep(-1.2, 0.0, d)), col(C.haloDentro), smoothstep(0.0, 1.2, d));
        c.addAssign(prisma.mul(exp(d.mul(d).negate())).mul(K.halo).mul(u.dia).mul(sobre));
      });
      // the sun's disc
      c.assign(mix(c, u.sol.mul(K.discoGanancia), smoothstep(K.discoFuera, K.discoDentro, s).mul(sobre).mul(max(u.dia, 0.15))));
      // stars: one hashed cell per ~0.5°; a cell holds a star above the threshold; by day only the brightest show, faintly
      If(y.greaterThan(0.03).and(estrellasU.greaterThan(0.0)), () => {
        const p = dir.mul(K.estrellasCeldas), celda = floor(p), h = hash31(celda);
        const centro = celda.add(0.5).add(fract(vec3(h.mul(17.0), h.mul(29.0), h.mul(43.0))).sub(0.5).mul(0.6));
        const brillo = smoothstep(K.estrellasUmbral, 1.0, h);
        const estrella = float(1.0).sub(smoothstep(0.08, 0.32, length(p.sub(centro)))).mul(brillo);
        const deDia = mix(smoothstep(0.6, 1.0, brillo), float(1.0), float(1.0).sub(u.dia)); // by day only the strongest cells
        c.addAssign(col(C.estrella).mul(estrella).mul(deDia).mul(estrellasU).mul(smoothstep(0.03, 0.3, y)).mul(1.4));
      });
      // crescent moon: a disc minus an offset disc (starwild), soft analytic edges; the offset disc's centre comes from the CPU
      If(lunaU.greaterThan(0.0), () => {
        const cosLuna = dot(dir, lunaDir);
        if (o.lunaLlena) { // H2: a full moon (a bigger round disc and a soft halo), as in the espacio base's approved prototype
          const disco = smoothstep(K.lunaLlenaFuera, K.lunaLlenaDentro, cosLuna);
          c.addAssign(col(C.luna).mul(pow(max(cosLuna, 0.0), 260.0)).mul(0.22).mul(lunaU).mul(sobre));
          c.assign(mix(c, col(C.luna).mul(K.lunaGanancia), disco.mul(lunaU).mul(sobre)));
        } else {
          const disco = smoothstep(K.lunaFuera, K.lunaDentro, cosLuna);
          const corte = smoothstep(K.lunaFuera, K.lunaDentro, dot(dir, lunaCorte));
          c.assign(mix(c, col(C.luna).mul(K.lunaGanancia), disco.mul(float(1.0).sub(corte)).mul(lunaU).mul(sobre)));
        }
      });
    });
    return c;
  });
  const domo = (dir: Nodo): Nodo => (domoFn as unknown as (d: Nodo) => Nodo)(dir);

  // the far-plane vertex (three's Background.js recipe + starwild's 0.99999): rotation only, z pinned just inside the far plane
  const vertice = Fn((builder: { renderer?: { reversedDepthBuffer?: boolean } }) => {
    const vista = modelViewMatrix.mul(vec4(positionLocal, 0.0));
    const clip = cameraProjectionMatrix.mul(vec4(vista.xyz, 1.0));
    return clip.setZ(builder.renderer?.reversedDepthBuffer ? clip.w.mul(1e-5) : clip.w.mul(0.99999));
  })() as Nodo;

  return { domo, lejos: base, vertice };
}

/** For the dome's colour node: the unit view direction of a dome fragment. */
export const direccionDomo = (): Nodo => normalize(positionLocal) as Nodo;
