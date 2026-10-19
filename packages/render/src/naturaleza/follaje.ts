// follaje (naturaleza R7.4): the stylised foliage crown — a cloud of leaf cards with spherical normals, alpha without `discard` where MSAA exists,
// two tones by N·L + baked per-vertex ambient occlusion, and leaf flutter by UV rotation. Pure builders (no three.js objects) + TSL nodes; arboles.ts
// puts the cards into its ONE near-tree template, so the crowns stay in the same instanced draw call.
//
// COPIED (with licence) → TRANSFORMED:
//  - Bruno Simon, folio-2025 `sources/Game/World/Foliage.js` (MIT License, Copyright (c) 2025 Bruno Simon; licence verified 2026-10-19 at
//    github.com/brunosimon/folio-2025/blob/main/license.md). Copied: 80 planes 0.8 wide (on a unit crown) placed at THREE.Spherical(1 − rng³, π·rng, 2π·rng),
//    a random in-plane turn per plane, and the per-vertex normal `position.lerp(normalize(planeCentre), 0.85)` (spherical normals: the whole crown
//    shades as one soft volume). Copied: the two-tone colour `mix(colorA, colorB, smoothstep(0, 1, dot(normalWorld, lightDirection)))` and the leaf
//    flutter `rotateUV(uv, windStrength · 2.2, vec2(0.5))` (the alpha rotates in its card; vertices do not move). NOT copied: his leaf texture (an
//    asset of the folio, not covered by checking) — the alpha here is a procedural leaf-cluster distance field. Transformed: an ellipsoid made of
//    lobes instead of one sphere, our seeded mulberry32 instead of seedrandom's alea, the cards face the camera (our camera orbits freely; his is
//    fixed, so he could orient the planes once) — the camera-facing quad of the «fluffy trees» recipe (douges.dev/blog/threejs-trees-1, technique only;
//    Pontus Karlsson's «quadmesh-to-billboards» tutorial, technique only).
//  - three.js r186 `examples/jsm/generators/ForestGenerator.js` (MIT, © 2010-2026 three.js authors): a baked `ao` attribute (0 at the crown's base → 1 at
//    its top) mixed as `deep → bright`, and a per-instance regional colour drift baked from low-frequency noise (so the shader taps no noise).
//    Transformed: our ao also darkens the inside of the crown (Crysis, GPU Gems 3 ch. 16: AO baked per vertex).
//  - Ben Golus, «Anti-aliased Alpha Test: The Esoteric Alpha To Coverage» (technique): with MSAA, `alpha = (alpha − cutoff) / max(fwidth(alpha), 1e-4) + 0.5`
//    and `alpha *= 1 + mip · 0.25` so mips do not eat the canopy; revoconner, «Stopping fence cages from dissolving at distance on Quest 3» (technique):
//    on tile GPUs `discard` breaks early hidden-surface removal, alpha-to-coverage does not. Transformed: our alpha is a distance field (no texture, no
//    mip), so the sharpening is `0.5 − d / fwidth(d)` and the «mip» is the screen footprint of the card's UV, which dilates the leaves instead.
//    three r186 wires `material.alphaToCoverage` itself (WebGPUPipelineUtils / WebGLState, only when the target has samples); where it has none (phones
//    without antialias) we fall back to an alpha test (`discard`), as three's own `shapeCircle` does.
import { Fn, float, vec2, vec3, vec4, uv, rotateUV, fwidth, length, atan, cos, sin, max, min, clamp, log2, cameraWorldMatrix } from "three/tsl";
import { crearAzar } from "./semilla.ts";

type V3 = [number, number, number];
type N = ReturnType<typeof float>;
type V2N = ReturnType<typeof vec2>;
type V3N = ReturnType<typeof vec3>;

/** One lobe of a crown: an ellipsoid (centre and radii in metres, tree space) and its share of the cards. */
export type Lobulo = { c: V3; r: V3; peso: number };
/** One leaf card: centre (m, tree space), its four corners (offsets in the card's own plane, m, already turned in-plane), the four Bruno normals,
 *  baked ambient occlusion per corner (0 dark inside/below … 1 lit outside/top) and its sway weight (0 still … 1 the crown's rim). */
export type Carta = { c: V3; esquinas: [number, number][]; normales: V3[]; ao: number[]; mov: number };
export type Copa = { cartas: Carta[]; centro: V3; radios: V3 };

/** Card side as a fraction of the crown's mean radius (Bruno: 0.8 on a unit bush). */
export const TAM_CARTA = 0.8;
/** Bruno's spherical-normal weight: 0 = the card's own vertex position, 1 = the normal of the card's centre on the crown. */
export const PESO_ESFERA = 0.85;
/** UV corners of a card (counter-clockwise seen from the camera: right = +x, up = +y). */
export const UV_CARTA: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** The two triangles of a card on its four corners. */
export const INDICES_CARTA = [0, 1, 2, 0, 2, 3];

const n3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Bruno's crown, made of lobes: `n` cards split among the lobes by weight, each card at Spherical(1 − rng³, π·rng, 2π·rng) inside its lobe's
 * ellipsoid (most cards near the surface, a few inside to fill it), a random in-plane turn, side `TAM_CARTA × mean radius`. `pieMin` (0…1 of a lobe's
 * radius y) flattens the underside: cards below `c.y − pieMin · r.y` are lifted to it (a holm oak's dome has a flat, shaded underside).
 * Normals are Bruno's lerp toward the normal from the WHOLE crown's centre (its bounding ellipsoid), so all lobes shade as one volume.
 */
export function copaDeCartas(lobulos: readonly Lobulo[], n: number, semilla: number, pieMin = 0.55, tam = TAM_CARTA): Copa {
  const rng = crearAzar(semilla);
  const total = lobulos.reduce((s, l) => s + l.peso, 0);
  // card counts per lobe (largest remainder, so they sum to n exactly)
  const cuotas = lobulos.map((l) => (n * l.peso) / total), cuenta = cuotas.map(Math.floor);
  let falta = n - cuenta.reduce((s, c) => s + c, 0);
  for (const i of cuotas.map((q, i) => [q - Math.floor(q), i]).sort((a, b) => b[0] - a[0]).map((x) => x[1])) { if (falta-- <= 0) break; cuenta[i]++; }
  const centros: { c: V3; giro: number; lado: number }[] = [];
  lobulos.forEach((l, li) => {
    const lado = tam * (l.r[0] + l.r[1] + l.r[2]) / 3;
    for (let k = 0; k < cuenta[li]; k++) {
      // THREE.Spherical(radius, phi, theta).setFromSpherical: x = r sinφ sinθ, y = r cosφ, z = r sinφ cosθ (as Foliage.js)
      const rad = 1 - Math.pow(rng(), 3), theta = Math.PI * 2 * rng(), phi = Math.PI * rng();
      const x = rad * Math.sin(phi) * Math.sin(theta), y = Math.max(-pieMin, rad * Math.cos(phi)), z = rad * Math.sin(phi) * Math.cos(theta);
      centros.push({ c: [l.c[0] + x * l.r[0], l.c[1] + y * l.r[1], l.c[2] + z * l.r[2]], giro: rng() * 9999, lado: lado * (0.85 + 0.3 * rng()) });
    }
  });
  // the whole crown's bounding ellipsoid: what the normals and the occlusion are measured against
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const { c } of centros) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], c[a]); hi[a] = Math.max(hi[a], c[a]); }
  const centro: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radios: V3 = [Math.max(0.3, (hi[0] - lo[0]) / 2), Math.max(0.3, (hi[1] - lo[1]) / 2), Math.max(0.3, (hi[2] - lo[2]) / 2)];
  const rel = (p: V3): V3 => [(p[0] - centro[0]) / radios[0], (p[1] - centro[1]) / radios[1], (p[2] - centro[2]) / radios[2]];
  const cartas = centros.map(({ c, giro, lado }) => {
    const rc = rel(c), nc = n3(rc), h = lado / 2, cg = Math.cos(giro), sg = Math.sin(giro);
    // the card's own plane for the normals: perpendicular to its normal on the crown (where Bruno's plane would face out)
    const t = n3(Math.abs(nc[1]) < 0.95 ? [nc[2], 0, -nc[0]] : [1, 0, 0]), b: V3 = [nc[1] * t[2] - nc[2] * t[1], nc[2] * t[0] - nc[0] * t[2], nc[0] * t[1] - nc[1] * t[0]];
    const esquinas: [number, number][] = [], normales: V3[] = [], ao: number[] = [];
    const radial = Math.min(1, Math.hypot(rc[0], rc[1], rc[2])), alto = Math.min(1, Math.max(0, (rc[1] + 1) / 2));
    for (const [u, v] of UV_CARTA) {
      const x0 = (u * 2 - 1) * h, y0 = (v * 2 - 1) * h, ex = x0 * cg - y0 * sg, ey = x0 * sg + y0 * cg; // Foliage.js: plane.rotateZ(random)
      esquinas.push([ex, ey]);
      const p: V3 = [c[0] + t[0] * ex + b[0] * ey, c[1] + t[1] * ex + b[1] * ey, c[2] + t[2] * ex + b[2] * ey], rp = rel(p);
      normales.push(n3([rp[0] + (nc[0] - rp[0]) * PESO_ESFERA, rp[1] + (nc[1] - rp[1]) * PESO_ESFERA, rp[2] + (nc[2] - rp[2]) * PESO_ESFERA])); // Foliage.js: position.lerp(normal, 0.85)
      // occlusion: dark deep inside and at the underside, lit at the rim and the top (ForestGenerator `ao` = height; Crysis: inside darker); the lower
      // corners of a card a touch darker, so every card carries a small gradient of its own
      ao.push(Math.min(1, Math.max(0, 0.22 + 0.43 * radial + 0.35 * alto - (v === 0 ? 0.06 : 0))));
    }
    return { c, esquinas, normales, ao, mov: 0.35 + 0.65 * radial };
  });
  return { cartas, centro, radios };
}

// ---------------------------------------------------------------------------------------------------------------------
// TSL
// ---------------------------------------------------------------------------------------------------------------------
/** The card's corner offset (m, card plane) turned into world space along the camera's right and up: the card always faces the viewer. Per eye in XR
 *  (three's `cameraWorldMatrix` picks the eye's matrix, multiview included). */
export function esquinaHaciaCamara(esquina: V2N): V3N {
  const m = cameraWorldMatrix as unknown as { mul: (v: unknown) => { xyz: V3N } };
  const derecha = m.mul(vec4(1, 0, 0, 0)).xyz, arriba = m.mul(vec4(0, 1, 0, 0)).xyz;
  return (derecha as unknown as V3N).mul(esquina.x).add((arriba as unknown as V3N).mul(esquina.y)) as unknown as V3N;
}

/** A leaf cluster: two rings of small oval leaves pointing outward (inner ring, outer ring, offset by half a leaf) + a filled heart. */
export const HOJAS_DENTRO = 7, HOJAS_FUERA = 11;
/** How much a leaf grows per «mip level» of the card's screen footprint (Golus's `1 + mip · 0.25`, here as a dilation of the distance field). */
export const DILATA_MIP = 0.03;
/** The virtual texture size the footprint is measured in (one «mip» = one halving of a 64-px leaf texture). */
const TEXELES = 64;

/** Distance (card units, negative inside) to a ring of `n` ovals at radius `R`, semi-axes `a` (radial) × `b`, by polar domain repetition (iq, «2D distance
 *  functions» / «domain repetition», technique). The oval's distance is the cheap scaled-circle bound `(|p/ab| − 1) · min(a, b)`. */
function anilloHojas(r: N, ang: N, n: number, R: number, a: number, b: number, fase: number): N {
  const paso = (Math.PI * 2) / n;
  const al = ang.add(fase + paso / 2 + Math.PI * 2).mod(paso).sub(paso / 2) as N; // −paso/2 … paso/2 around the nearest leaf's axis (+2π: positive, so GLSL mod and WGSL % agree)
  const px = r.mul(cos(al)).sub(R) as N, py = r.mul(sin(al)) as N;
  return length(vec2(px.div(a), py.div(b))).sub(1).mul(Math.min(a, b)) as N;
}

/**
 * Signed distance (card units −1…1, negative inside) to a procedural holm-oak leaf cluster — a heart, an inner ring of 7 small oval leaves and an outer
 * ring of 11 (a dense mass with a leafy, scalloped edge) — turned by `giro` (the flutter). Pure polar maths, no texture (Bruno's folio leaf texture is not reused). Dilated with the card's screen
 * footprint so a far crown stays full (Golus's mip compensation).
 */
export function distanciaHojas(giro: N): N {
  const q = (rotateUV(uv(), giro, vec2(0.5)) as unknown as V2N).sub(0.5).mul(2) as unknown as V2N; // −1…1, centre of the card
  const r = length(q) as N, a = atan(q.y, q.x) as N;
  const corazon = r.sub(0.46) as N;
  const dentro = anilloHojas(r, a, HOJAS_DENTRO, 0.5, 0.22, 0.14, 0.3);
  const fuera = anilloHojas(r, a, HOJAS_FUERA, 0.74, 0.2, 0.12, 0.3 + Math.PI / HOJAS_FUERA);
  const d = min(corazon, min(dentro, fuera)) as N;
  const huella = length(fwidth(uv().mul(TEXELES))) as N; // texels per pixel
  const mip = max(log2(max(huella, 1e-4)), 0) as N;
  return d.sub(mip.mul(DILATA_MIP)) as N;
}

/**
 * Coverage of a card from its signed distance. With MSAA and `material.alphaToCoverage` (decided when the shader is built, like three's
 * `shapeCircle`): Golus's sharpened alpha, no `discard`. Without samples: an alpha test (`discard` outside), output 1.
 */
export const coberturaHojas = Fn(([d]: [N], builder: { renderer: { currentSamples: number }; material: { alphaToCoverage: boolean } }) => {
  if (builder.material.alphaToCoverage && builder.renderer.currentSamples > 0) return clamp(float(0.5).sub(d.div(max(fwidth(d), 1e-4))), 0, 1);
  (d.greaterThan(0) as unknown as { discard: () => void }).discard();
  return float(1);
}) as unknown as (d: N) => N;
