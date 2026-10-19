// materia (spike «materia de bloques», D-058: a particle layer ON TOP of the solid world). A shape made of big blocks — a mix
// of the role-playing dice set (d4 d6 d8 d10 d12 d20; the mix per tier comes from performance, materia-politica.mezcla) —
// that assemble from scattered spots and crumble away. ~80 % opaque blocks (depth write, no sorting, no alpha: the cheap
// path on a fill-bound Quest, saber-3d concepts/point-rendering.md) and ~20 % smaller translucent ones (additive, no depth
// write, no sorting: adding light does not care about order).
// Six shapes, three ways (materia-politica METODO; the doc there says what each costs):
//  - "relleno" (default, 2 draw calls): each instance has as many triangle slots as the biggest die of the mix; the vertex
//    stage reads its die's corners from a small float texture (vertex pulling, the trick of crowd.ts's VAT) and spare
//    slots collapse to one point (zero area: the rasteriser drops them, no fragment runs);
//  - "pegados" (2 draw calls): the dice back to back in one geometry; each instance collapses the ones that are not its own;
//  - "separados" (2 per die present): one instanced draw per die, exact triangles.
// Everything moves in the vertex stage from ONE progress uniform (0 scattered → 1 in place) plus a time uniform for the
// wobble: no per-frame CPU loop over blocks. The formulas are materia-politica.ts (tested); this file only paints them.
// Copied, not invented:
//  - per-instance target + per-instance delay + one progress uniform: the TSL dissolve of «Three.js Tutorial: Particles
//    with TSL» (https://discourse.threejs.org/t/three-js-tutorial-particles-with-tsl/86645, https://youtu.be/olufmONG7-Q);
//  - instanced geometry with per-instance attributes read in `positionNode`: three.js examples webgpu_instance_uniform /
//    webgpu_compute_particles (https://threejs.org/examples/#webgpu_compute_particles) and this repo's crowd.ts;
//  - the wobble while flying is MaterialX noise (`mx_noise_vec3`, three/tsl), the noise those examples use;
//  - dice: three's Tetrahedron/Box/Octahedron/Dodecahedron/Icosahedron geometries; the d10 from materia-politica.d10()
//    (threejs-dice proportions, MIT); the engine's own dice (features/dados) are 2D only, no 3D geometry to reuse;
//  - look: the teleport's «digital blocks» (teletransporte.ts, variante 2) and the house palette.
import * as THREE from "three/webgpu";
import { uniform, attribute, float, int, ivec2, vec3, hash, mix, clamp, smoothstep, sin, cos, rotate, positionGeometry, normalGeometry, normalize, dot, max, varying, mx_noise_vec3, textureLoad, vertexIndex, step, abs } from "three/tsl";
import type { Nivel } from "./calidad.ts";
import { RETRASO, NACER, DISPERSION, TAMANO_TRANSLUCIDO, DADOS, MEZCLA, METODO, reparto, repartirDados, trisEnviados, d10, TRIS_DADO } from "./materia-politica.ts";
import type { Metodo, Mezcla, Muestra } from "./materia-politica.ts";

type Tri = { pos: Float32Array; nor: Float32Array };
/** The six dice as flat-shaded triangle lists (xyz per vertex + normals), all about the same size (≈ 1 m across). */
export function dadosBase(): Tri[] {
  const dePoli = (g: THREE.BufferGeometry): Tri => {
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    return { pos: new Float32Array(n.getAttribute("position").array), nor: new Float32Array(n.getAttribute("normal").array) };
  };
  const diez = d10();
  for (let i = 0; i < diez.pos.length; i++) diez.pos[i] *= 0.56;
  return [
    dePoli(new THREE.TetrahedronGeometry(0.72, 0)),  // d4
    dePoli(new THREE.BoxGeometry(0.72, 0.72, 0.72)), // d6
    dePoli(new THREE.OctahedronGeometry(0.62, 0)),   // d8
    diez,                                            // d10
    dePoli(new THREE.DodecahedronGeometry(0.58, 0)), // d12
    dePoli(new THREE.IcosahedronGeometry(0.58, 0)),  // d20
  ];
}

export function crearMateria(o: { muestra: Muestra; nivel: Nivel; lado: number; mezcla?: Mezcla; metodo?: Metodo; semilla?: number }) {
  const mezcla = o.mezcla ?? MEZCLA[o.nivel], metodo = o.metodo ?? METODO;
  const { opacas, translucidas } = reparto(o.nivel, o.muestra.n);
  const dado = repartirDados(o.muestra.n, mezcla, o.semilla ?? 1);
  const uP = uniform(1), uModo = uniform(0), uT = uniform(0), uRadio = uniform(o.muestra.radio), uLado = uniform(o.lado);
  const dados = dadosBase();
  const enMezcla = DADOS.map((d) => mezcla[d] > 0);
  const grupo = new THREE.Group();
  grupo.name = "materia";
  const mallas: THREE.Mesh[] = [];
  const bases: THREE.BufferGeometry[] = [];
  let tabla: THREE.DataTexture | null = null;

  /** The shared geometry of one particle, by method. */
  function baseDe(soloDado: number): THREE.BufferGeometry {
    const base = new THREE.BufferGeometry();
    if (metodo === "separados") {
      base.setAttribute("position", new THREE.BufferAttribute(dados[soloDado].pos, 3));
      base.setAttribute("normal", new THREE.BufferAttribute(dados[soloDado].nor, 3));
    } else if (metodo === "relleno") {
      const huecos = trisEnviados(mezcla, "relleno") * 3;               // vertex slots per particle
      if (!tabla) {
        const datos = new Float32Array(huecos * 12 * 4);                  // rows 2k = corners of die k, 2k+1 = its normals
        dados.forEach((d, k) => {
          for (let v = 0; v < Math.min(d.pos.length / 3, huecos); v++) {
            datos.set([d.pos[v * 3], d.pos[v * 3 + 1], d.pos[v * 3 + 2], 1], (2 * k * huecos + v) * 4);
            datos.set([d.nor[v * 3], d.nor[v * 3 + 1], d.nor[v * 3 + 2], 0], ((2 * k + 1) * huecos + v) * 4);
          }
        });
        tabla = new THREE.DataTexture(datos, huecos, 12, THREE.RGBAFormat, THREE.FloatType);
        tabla.needsUpdate = true;
      }
      base.setAttribute("position", new THREE.BufferAttribute(new Float32Array(huecos * 3), 3)); // only its count matters
    } else {
      const usados = dados.map((d, k) => (enMezcla[k] ? d : { pos: new Float32Array(0), nor: new Float32Array(0) }));
      const nv = usados.reduce((s, d) => s + d.pos.length / 3, 0);
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), cual = new Float32Array(nv);
      let v = 0;
      usados.forEach((d, k) => { pos.set(d.pos, v * 3); nor.set(d.nor, v * 3); cual.fill(k, v, v + d.pos.length / 3); v += d.pos.length / 3; });
      base.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      base.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      base.setAttribute("aDado", new THREE.BufferAttribute(cual, 1));
    }
    bases.push(base);
    return base;
  }

  /** One instanced draw: the particles in `ids` (global numbers), opaque or translucent. */
  function malla(ids: number[], translucida: boolean, soloDado = -1): void {
    const n = ids.length;
    if (!n) return;
    const base = baseDe(soloDado);
    const geo = new THREE.InstancedBufferGeometry();
    for (const k of Object.keys(base.attributes)) geo.setAttribute(k, base.getAttribute(k));
    // per particle: target xyz + its global number (w: the same random values whatever draw it lands in); colour + die (w)
    const dst = new Float32Array(n * 4), col = new Float32Array(n * 4);
    ids.forEach((i, k) => {
      dst.set([o.muestra.puntos[i * 3], o.muestra.puntos[i * 3 + 1], o.muestra.puntos[i * 3 + 2], i], k * 4);
      col.set([o.muestra.colores[i * 3], o.muestra.colores[i * 3 + 1], o.muestra.colores[i * 3 + 2], dado[i]], k * 4);
    });
    geo.setAttribute("aDestino", new THREE.InstancedBufferAttribute(dst, 4));
    geo.setAttribute("aColor", new THREE.InstancedBufferAttribute(col, 4));
    geo.instanceCount = n;
    // culling sphere: the shape plus where its blocks wait (scattered around, or drifting up when crumbling)
    const R = o.muestra.radio;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, R * 2, 0), R * (DISPERSION + 4.5));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-R * 3, -R, -R * 3), new THREE.Vector3(R * 3, R * 5, R * 3));

    const d = attribute("aDestino", "vec4"), c = attribute("aColor", "vec4"), id = d.w, forma = c.w;
    const h = (k: number) => hash(id.mul(8).add(k));
    // materia-politica.tCubo / disperso / tamano, the same formulas
    const t = smoothstep(0, 1, clamp(clamp(uP, 0, 1).sub(h(0).mul(RETRASO)).div(1 - RETRASO), 0, 1));
    const a = h(1).mul(Math.PI * 2), r = uRadio.mul(DISPERSION).mul(h(2).mul(0.4).add(0.6));
    const junta = vec3(cos(a).mul(r), uRadio.mul(h(3).mul(1.6).add(0.2)), sin(a).mul(r));
    const deshace = vec3(cos(a).mul(r).mul(0.5), uRadio.mul(h(3).mul(2).add(2.5)), sin(a).mul(r).mul(0.5));
    const disp = mix(junta, deshace, uModo);
    const vuelo = float(1).sub(t);
    const meneo = mx_noise_vec3(disp.mul(0.7).add(vec3(uT.mul(0.35), id.mul(0.013), uT.mul(0.21)))).mul(uRadio.mul(0.45)).mul(vuelo);
    const centro = mix(disp, d.xyz, t).add(meneo);
    const tam = smoothstep(0, NACER, uP).mul(t.mul(0.45).add(0.55)).mul(uLado).mul(translucida ? TAMANO_TRANSLUCIDO : 1);
    // tumbling while flying; in place each die keeps its own resting turn (no two alike)
    const giro = vec3(h(4).sub(0.5), h(5).sub(0.5), h(6).sub(0.5)).mul(vuelo.mul(9).add(1.2)).add(vec3(uT.mul(h(7).mul(2)), uT.mul(h(8).mul(2)), 0).mul(vuelo));
    let esquina, normal, vale;
    if (metodo === "relleno") {
      const fila = int(forma).mul(2), v = int(vertexIndex);
      const p = textureLoad(tabla!, ivec2(v, fila)), nn = textureLoad(tabla!, ivec2(v, fila.add(1)));
      esquina = p.xyz; normal = nn.xyz; vale = p.w;                       // w = 0: a spare slot → collapses
    } else if (metodo === "pegados") {
      esquina = positionGeometry; normal = normalGeometry;
      vale = step(abs(attribute("aDado", "float").sub(forma)), 0.5);     // not this particle's die → collapses
    } else { esquina = positionGeometry; normal = normalGeometry; vale = float(1); }
    const local = rotate(esquina, giro).mul(vale);
    // flat palette shading (no lights: cheap fill): top faces bright, sides mid, bottoms dark — the house's painted look
    const luz = varying(float(0.58).add(max(dot(normalize(rotate(normal, giro)), normalize(vec3(0.35, 1, 0.25))), 0).mul(0.42)));
    let mat: THREE.MeshBasicNodeMaterial;
    if (!translucida) {
      mat = new THREE.MeshBasicNodeMaterial({ fog: true });
      mat.colorNode = c.xyz.mul(luz);
    } else {
      mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      mat.colorNode = mix(c.xyz, vec3(1, 1, 1), 0.35).mul(luz);
      mat.opacityNode = float(0.45).mul(smoothstep(0, NACER, uP)); // additive: brightness is the alpha
    }
    mat.positionNode = local.mul(tam).add(centro);
    const m = new THREE.Mesh(geo, mat);
    m.name = (translucida ? "materia-translucida" : "materia-opaca") + (soloDado >= 0 ? "-" + DADOS[soloDado] : "");
    m.userData.sinSombra = true;
    m.raycast = () => {};
    if (translucida) m.renderOrder = 3;
    grupo.add(m);
    mallas.push(m);
  }

  const rango = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);
  for (const [ids, tr] of [[rango(0, opacas), false], [rango(opacas, opacas + translucidas), true]] as const) {
    if (metodo === "separados") DADOS.forEach((_, k) => malla(ids.filter((i) => dado[i] === k), tr, k));
    else malla([...ids], tr);
  }
  const tris = metodo === "separados"
    ? Array.from(dado).reduce((s, k) => s + TRIS_DADO[DADOS[k]], 0)
    : (opacas + translucidas) * trisEnviados(mezcla, metodo);
  return {
    objeto: grupo,
    /** 0 = scattered (and, under NACER, not there), 1 = the shape. The only thing the CPU sets per frame. */
    progreso(p: number): void { uP.value = Math.min(1, Math.max(0, p)); },
    /** Where the scattered blocks are: around (assembling) or drifting up and away (crumbling). */
    modo(m: "junta" | "deshace"): void { uModo.value = m === "deshace" ? 1 : 0; },
    /** The wobble's clock (s); freeze it when nobody looks. */
    avanzar(dt: number): void { uT.value = (uT.value + dt) % 1000; },
    /** Draw calls and triangles this piece submits (what renderer.info should count). */
    estado: () => ({ llamadas: mallas.length, opacas, translucidas, metodo, tris }),
    dispose(): void { for (const m of mallas) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } for (const b of bases) b.dispose(); tabla?.dispose(); },
  };
}
export type Materia = ReturnType<typeof crearMateria>;
