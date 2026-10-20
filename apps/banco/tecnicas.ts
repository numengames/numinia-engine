// banco de pruebas gráfico (v1): the techniques the bench can switch on, one at a time, over the same fixed scene.
// A technique is a plug: `montar(ctx)` puts it into the scene and returns how to move it each frame and how to take it
// out. Nothing else in the bench knows what a technique is, so the nature pieces (terrain, foliage, grass) and the
// particle layer register here later with `registrar()` and every report gains a row without touching the runner.
// Each technique uses the engine's real code (packages/render) with the settings of the bench tier (?nivel, default B
// = Quest in XR, TECHO_POR_NIVEL: the most that tier may ask for).
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearEmisor, pide } from "../../packages/render/src/particulas.ts";
import { LLAMAS, HUMO, POLVO, CHISPAS } from "../../packages/render/src/elementos.ts";
import { crearTeletransporte } from "../../packages/render/src/teletransporte.ts";
import { geometriaDeAgua, materialDeAgua } from "../../packages/render/src/agua-estilo.ts";
import { TECHO_POR_NIVEL, TOPE_PARTICULAS, FACTOR_PARTICULAS, SOMBRA_PX, OLAS_DESDE_M, detalleAgua, CALIDAD_POR_NIVEL } from "../../packages/render/src/calidad.ts";
import { alturaEn } from "../../packages/relieve/src/relieve.ts";
import type { Nivel } from "../../packages/render/src/calidad.ts";

export type Contexto = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  world: THREE.Group;       // the fixed scene's objects (ground, pillars): what casts and receives shadows
  camera: THREE.PerspectiveCamera;
  sol: THREE.DirectionalLight;
  nivel: Nivel;
  /** E01: the scene's ambient, its flat ground (the nature hides it) and the 24 landmark pillars (the whole nature piece hides them). */
  hemi: THREE.HemisphereLight;
  suelo: THREE.Mesh;
  hitos: THREE.Mesh[];
  /** ?escena: "plaza" (v1) or "naturaleza" (E01: the camera rides over the nature's relief). */
  escena: string;
};
export type Montada = {
  /** Every frame, with a FIXED step (s) and the bench clock (s): never wall time, so two runs draw the same frames. */
  cuadro?(dt: number, t: number): void;
  /** Take everything out and free it (the bench reloads the page between runs anyway; this keeps a later in-page A/B honest). */
  quitar(): void;
  /** What it put in the scene, for the report (particles, lights, cells…). */
  cuenta?: Record<string, number | string>;
};
export type Tecnica = {
  id: string;               // short, url-safe: ?on=<id>,<id>
  nombre: string;           // one line for the table
  origen: string;           // the engine file(s) it measures
  montar(c: Contexto): Montada | Promise<Montada>;
};

export const TECNICAS = new Map<string, Tecnica>();
export function registrar(t: Tecnica): void {
  if (!/^[a-z0-9-]+$/.test(t.id)) throw new Error(`banco: id «${t.id}» must be [a-z0-9-]`);
  if (TECNICAS.has(t.id)) throw new Error(`banco: id «${t.id}» registered twice`);
  TECNICAS.set(t.id, t);
}

// ---- niebla: the engine's distance fog (index.ts default, entorno.ts nieblaCerca/nieblaLejos). Every material that
// has fog: true gets the fog node: pure per-pixel ALU, no pass, no texture.
registrar({
  id: "niebla", nombre: "Niebla por distancia (THREE.Fog 40–140 m)", origen: "packages/render/src/index.ts, entorno.ts",
  montar(c) {
    const antes = c.scene.fog;
    c.scene.fog = new THREE.Fog(0xc9d8e4, 40, 140);
    return { quitar() { c.scene.fog = antes; }, cuenta: { cerca: 40, lejos: 140 } };
  },
});

// ---- sombras: the sun's shadow map as entorno.ts sets it (size and box per the tier's ceiling), every mesh casts and
// receives. Costs an extra depth pass (vertex side: the whole scene again) plus the shadow lookups (fragment side).
registrar({
  id: "sombras", nombre: "Sombra del sol (mapa del tope del nivel)", origen: "packages/render/src/entorno.ts sombras()",
  montar(c) {
    const calidad = TECHO_POR_NIVEL[c.nivel].sombras === "no" ? "baja" : TECHO_POR_NIVEL[c.nivel].sombras;
    const px = SOMBRA_PX[calidad], lado = calidad === "alta" ? 40 : calidad === "media" ? 30 : 20;
    const s = c.sol;
    s.castShadow = true; s.shadow.autoUpdate = true; s.shadow.intensity = 1; s.shadow.mapSize.set(px, px);
    const cam = s.shadow.camera as THREE.OrthographicCamera;
    cam.left = -lado; cam.right = lado; cam.top = lado; cam.bottom = -lado; cam.near = 1; cam.far = 160; cam.updateProjectionMatrix();
    s.shadow.bias = -0.0006; s.shadow.normalBias = 0.03;
    const tocados: THREE.Mesh[] = [];
    c.world.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.sinSombra) { m.castShadow = true; m.receiveShadow = true; tocados.push(m); } });
    // r186: castShadow stays true once on (entorno.ts); «off» = no pass + no darkening
    return { quitar() { s.shadow.autoUpdate = false; s.shadow.intensity = 0; for (const m of tocados) { m.castShadow = false; } }, cuenta: { mapa: px, lado, mallas: tocados.length } };
  },
});

// ---- particulas: the element emitters (elementos.ts presets: two fires with sparks and smoke, one dust box), counted
// and capped like elementos.ts does for the tier. One instanced sprite draw call per emitter.
registrar({
  id: "particulas", nombre: "Emisores de partículas (2 fuegos + chispas + humo, 1 polvo)", origen: "packages/render/src/particulas.ts, elementos.ts",
  montar(c) {
    const viento = uniform(new THREE.Vector3(0.4, 0, 0.1));
    const factor = FACTOR_PARTICULAS[TECHO_POR_NIVEL[c.nivel].particulas], tope = TOPE_PARTICULAS[c.nivel];
    const puestos: Array<[typeof LLAMAS, number, number]> = [[LLAMAS, -6, -4], [CHISPAS, -6, -4], [HUMO, -6, -4], [LLAMAS, 7, 3], [CHISPAS, 7, 3], [HUMO, 7, 3], [POLVO, 0, 0]];
    let total = 0;
    const emisores = puestos.map(([def, x, z]) => {
      const n = Math.max(1, Math.min(tope.emisor, Math.round(pide(def) * factor), tope.total - total));
      total += n;
      const e = crearEmisor(def, n, viento);
      e.objeto.position.set(x, def === POLVO ? 0 : 0.2, z);
      c.scene.add(e.objeto);
      return e;
    });
    return {
      cuadro(dt) { for (const e of emisores) e.avanzar(dt); },
      quitar() { for (const e of emisores) { c.scene.remove(e.objeto); e.dispose(); } },
      cuenta: { emisores: emisores.length, particulas: total },
    };
  },
});

// ---- teletransporte: the travel light (N16), as many at once as the tier allows (LUCES_MAX), relaunched in a loop at
// fixed spots with the three looks. Additive, no depth write: overdraw where the shells overlap the view.
registrar({
  id: "teletransporte", nombre: "Luz de teletransporte (todas las del nivel a la vez, en bucle)", origen: "packages/render/src/teletransporte.ts",
  montar(c) {
    const grupo = new THREE.Group();
    c.scene.add(grupo);
    const tele = crearTeletransporte({ world: grupo, nivel: () => c.nivel });
    const sitios = [[-4, 2], [-2, -3], [0, 4], [3, -2], [5, 3], [2, 6]];
    let siguiente = 0, n = 0;
    return {
      cuadro(dt, t) {
        tele.actualizar(dt);
        if (t >= siguiente) { // every 0.25 s one more light, so all of them stay busy (each lasts 1.4 s)
          const [x, z] = sitios[n % sitios.length];
          tele.lanzar({ tipo: n % 2 ? "llega" : "sale", x, y: 0, z, variante: n % 3, clave: n });
          n++; siguiente = t + 0.25;
        }
      },
      quitar() { c.scene.remove(grupo); },
      get cuenta() { const e = tele.estado(); return { activas: e.activas, max: e.max }; },
    };
  },
});

// ---- agua: the stylised water (agua-estilo.ts) on a 30 × 30 m pond with the tier's detail (vertex waves + bands,
// foam, fresnel). Transparent: it blends over the ground.
registrar({
  id: "agua", nombre: "Agua estilizada (estanque 30×30 m, detalle del nivel)", origen: "packages/render/src/agua-estilo.ts",
  montar(c) {
    const detalle = detalleAgua(c.nivel, TECHO_POR_NIVEL[c.nivel].agua);
    const forma = { tipo: "rect" as const, ancho: 30, largo: 30 };
    const tiempo = uniform(0) as unknown as { value: number }; // elementos.ts passes the same kind of uniform
    const geo = geometriaDeAgua(forma, detalle, OLAS_DESDE_M);
    const mat = materialDeAgua({ color: 0x3f8fa8, forma, detalle, tiempo }, OLAS_DESDE_M);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 0.05, -22); m.userData.sinSombra = true;
    c.scene.add(m);
    return {
      cuadro(dt) { tiempo.value += dt; },
      quitar() { c.scene.remove(m); geo.dispose(); mat.dispose(); },
      cuenta: { olas: detalle.olas, triangulos: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 },
    };
  },
});

// =====================================================================================================================
// E01 (línea base, plan-experimentos): the low-poly nature, piece by piece, and the dice particle layer (D-058).
// Every piece is the engine's real code with the bench tier's settings (`c.nivel`: niveles.ts, calidad.ts defaults as the
// page uses them) and the plaza demo world's data (work/naturaleza/mundo-demo: seed 1234, 200 m, plaza 12, pond, summer,
// hour 10.5 with the sun on the clock, wind 3 m/s). Run with `--escena naturaleza` so the camera rides over the relief.
// A piece alone is measured over the bench's ground; some costs are DIFFERENCES of two rows (the table says which):
//   Residuos + flora = nat-residuos − nat-terreno · copas de cartas = nat-arboles − nat-arboles-sin-copas ·
//   atmósfera (cielo + niebla + tono) = nat-atmosfera − entorno.
// `naturaleza` is the whole piece as the page builds it (naturaleza.ts: terrain with props, trees, grass, pond, fauna, the
// atmosphere over the real entorno, pillars and flat ground hidden): the per-tier total.
// =====================================================================================================================
const NAT = { semilla: 1234, tamano: 200, plaza: 12, estacion: "verano" as const, hora: 10.5, viento: 3 };
const ENTORNO_DEMO = { schema: "numinia-engine/entorno@1", hora: { valor: 10.5, mueveElSol: true, cicloMinutos: 0 }, cielo: { nubes: 0.35 }, viento: { fuerza: 3 } };

/** The nature's modules, loaded once per page (they are lazy chunks in the plaza too). */
const modsNat = () => Promise.all([
  import("../../packages/render/src/naturaleza/terreno.ts"), import("../../packages/render/src/naturaleza/arboles.ts"),
  import("../../packages/render/src/naturaleza/hierba.ts"), import("../../packages/render/src/naturaleza/esparcir.ts"),
  import("../../packages/render/src/naturaleza/paleta.ts"), import("../../packages/render/src/agua-estilo.ts"),
]);
const alturaEnNat = (x: number, z: number) => alturaEn(NAT.semilla, x, z);
const vientoPropio = () => uniform(new THREE.Vector3(NAT.viento, 0, 0)); // entorno.ts: direccion(0, rumbo 0) × fuerza
const nieblaHex = (c: Contexto) => (c.scene.fog instanceof THREE.Fog ? c.scene.fog.color.getHex() : 0xc9d8e4);
const calidadPagina = (n: Nivel) => CALIDAD_POR_NIVEL[n]; // what the page uses by default (not the tier's ceiling)

/** The terrain as naturaleza.ts builds it; `escena` null = only its pure functions (heights, zones) for trees and grass. */
async function terreno(c: Contexto, conProps: boolean, escena: THREE.Object3D | null) {
  const [T, , , , P] = await modsNat();
  return T.crearTerreno({ semilla: NAT.semilla, nivel: c.nivel, tamano: NAT.tamano, plaza: NAT.plaza, niebla: nieblaHex(c), escena: escena ?? undefined, estacion: NAT.estacion,
    recibeSombra: c.nivel === "A", aguaPlana: c.nivel === "D" ? P.COLOR_ESTANQUE : undefined, residuos: conProps, flora: conProps });
}

// ---- the real entorno (entorno.ts) with the demo world's entorno.json, one per page (shared by entorno, nat-atmosfera, naturaleza) ----
type EntornoBanco = { e: import("../../packages/render/src/entorno.ts").Entorno; tick(t: number): void };
const entornos = new WeakMap<Contexto, Promise<EntornoBanco>>();
function entornoDe(c: Contexto): Promise<EntornoBanco> {
  let p = entornos.get(c);
  if (!p) {
    p = (async () => {
      const [{ crearEntorno }, { baseDelMundo, conSol }, { aVista }] = await Promise.all([
        import("../../packages/render/src/entorno.ts"), import("../../features/entorno/server.ts"), import("../../features/entorno/client.ts")]);
      const grid = new THREE.Group();
      const e = crearEntorno({ renderer: c.renderer, scene: c.scene, world: c.world, camera: c.camera, hemi: c.hemi, sun: c.sol, ground: c.suelo, grid, hitos: c.hitos,
        aparato: { mobile: false }, fichero: (n) => `/no-hay-servidor/${n}`, foco: () => null });
      e.simularNivel(c.nivel);
      // the page receives the server's flat state through the client's aVista; the ground stays plain (no texture files on the bench)
      const datos = { ...aVista(conSol(baseDelMundo(ENTORNO_DEMO)) as Record<string, unknown>), suelo: "liso", sueloMapa: "", sueloNormal: "" };
      e.aplicar(datos);
      // let the lazy sky load and the first bake run (B–D bake the sky into a cube; A draws it live), as the page does in its first frames
      for (let i = 0; i < 60 && (e.ocupado() || i < 10); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
      let ultimo = -1;
      return { e, tick(t: number) { if (t !== ultimo) { ultimo = t; e.actualizar(); } } };
    })();
    entornos.set(c, p);
  }
  return p;
}

registrar({
  id: "entorno", nombre: "Entorno real del mundo demo (cielo, luz, sombras y tono del nivel)", origen: "packages/render/src/entorno.ts + features/entorno",
  async montar(c) {
    const { e, tick } = await entornoDe(c);
    return { cuadro(_dt, t) { tick(t); }, quitar() {}, get cuenta() { const s = e.estado(); return { cielo: s.modoCielo, sombras: s.sol.mapa, tono: s.tono || "agx", hdr: s.luzEntorno }; } };
  },
});

registrar({
  id: "nat-atmosfera", nombre: "Atmósfera de la naturaleza (cúpula 4 paradas + niebla nodo + tono Neutral) sobre el entorno", origen: "naturaleza/atmosfera.ts, entorno.ts atmosfera()",
  async montar(c) {
    const { e, tick } = await entornoDe(c);
    const [{ atmosferaNaturaleza }, { NIVEL_AGUA }] = await Promise.all([import("../../packages/render/src/naturaleza/atmosfera.ts"), import("../../packages/render/src/naturaleza/terreno.ts")]);
    const quitar = e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA));
    for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); } // the re-bake with the dome
    return { cuadro(_dt, t) { tick(t); }, quitar, get cuenta() { const s = e.estado(); return { cielo: s.modoCielo, tono: s.atmosfera?.tono ?? "—", nieblaNodo: String(s.atmosfera?.nieblaNodo ?? false) }; } };
  },
});

for (const conProps of [false, true]) registrar({
  id: conProps ? "nat-residuos" : "nat-terreno",
  nombre: conProps ? "Terreno CON Residuos + flora horneados (lo que dibuja el mundo)" : "Terreno desnudo (malla de alturas, sin Residuos ni flora)",
  origen: "naturaleza/terreno.ts" + (conProps ? " + residuos.ts + flora.ts" : ""),
  async montar(c) {
    const t = await terreno(c, conProps, c.world);
    const visto = c.suelo.visible; c.suelo.visible = false; // the terrain takes the flat ground's place (naturaleza.ts)
    return { quitar() { t.dispose(); c.suelo.visible = visto; }, cuenta: { triangulos: t.triangulos, residuos: t.residuos.triangulos, flora: t.flora.triangulos } };
  },
});

for (const sinCopas of [false, true]) registrar({
  id: sinCopas ? "nat-arboles-sin-copas" : "nat-arboles",
  nombre: sinCopas ? "Árboles SIN las cartas de hoja de las copas (control)" : "Árboles (cerca con copas de cartas + siluetas lejos)",
  origen: "naturaleza/arboles.ts, follaje.ts, esparcir.ts",
  async montar(c) {
    const [, A, , E, , ] = await modsNat();
    const t = await terreno(c, false, null);
    const puntos = E.esparcirArboles(t, { semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, densidad: 1, nivel: c.nivel, paleta: NAT.estacion, estanque: t.estanque });
    const arb = A.crearArboles({ vientoU: vientoPropio() as never, nivel: c.nivel, camara: c.camera }, puntos);
    if (sinCopas) { // drop every triangle whose corners are leaf cards (PARTE.carta) from the near template: the rest of the tree is untouched
      const g = arb.mallas[0].geometry, parte = g.getAttribute("parte"), idx = g.index!, keep: number[] = [];
      for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), d = idx.getX(i + 2); if (![a, b, d].every((v) => parte.getX(v) === A.PARTE.carta)) keep.push(a, b, d); }
      g.setIndex(keep);
    }
    c.world.add(arb.grupo);
    arb.repartir(c.camera.position.x, c.camera.position.y, c.camera.position.z);
    return { cuadro(_dt, tt) { arb.actualizar(tt); }, quitar() { arb.dispose(); t.dispose(); }, get cuenta() { const s = arb.estadisticas(); return { arboles: puntos.length, enVista: s.arboles, triangulos: s.triangulos, llamadas: s.llamadas }; } };
  },
});

registrar({
  id: "nat-hierba", nombre: "Hierba (matas instanciadas, anillo exterior + cercano)", origen: "naturaleza/hierba.ts",
  async montar(c) {
    const [, , H] = await modsNat();
    const t = await terreno(c, false, null);
    const hi = H.crearHierba({ vientoU: vientoPropio(), nivel: c.nivel }, { alturaEn: t.alturaEn, zonaEn: t.zonaEn, franjaEn: t.franjaEn, estacion: NAT.estacion },
      { semilla: NAT.semilla, nivel: c.nivel, escena: c.world, empujaCamara: false });
    hi.llenarTodo(c.camera);
    return { cuadro(_dt, tt) { hi.actualizar(c.camera, tt); }, quitar() { hi.dispose(); t.dispose(); }, get cuenta() { const s = hi.estadisticas(); return { tufts: s.tuftsVivos, triangulos: s.triangulosEnviados, dibujos: s.dibujos }; } };
  },
});

registrar({
  id: "nat-agua", nombre: "Agua del estanque de la naturaleza (en D va pintada en el terreno: 0)", origen: "naturaleza/naturaleza.ts + agua-estilo.ts",
  async montar(c) {
    if (c.nivel === "D") return { quitar() {}, cuenta: { agua: "pintada en el terreno" } };
    const [, , , , P, AG] = await modsNat();
    const t = await terreno(c, false, null);
    const tiempo = uniform(0) as unknown as { value: number }, r = t.estanque.radio * 1.2, forma = { tipo: "circulo" as const, radio: r };
    const detalle = detalleAgua(c.nivel, calidadPagina(c.nivel).agua);
    const luz = { cielo: uniform(new THREE.Color(nieblaHex(c))), sol: uniform(new THREE.Color(0xffffff)), solDir: uniform(new THREE.Vector3(0.5, 0.8, 0.3).normalize()) };
    const mat = AG.materialDeAgua({ color: P.COLOR_ESTANQUE, forma, detalle, tiempo, luz: luz as never, bordeOculto: r * 0.12, verdemar: true }, 12);
    const m = new THREE.Mesh(AG.geometriaDeAgua(forma, detalle, 12), mat);
    m.position.set(t.estanque.x, t.estanque.nivel, t.estanque.z); m.userData.sinSombra = true;
    c.world.add(m);
    return { cuadro(dt) { tiempo.value += dt; }, quitar() { m.removeFromParent(); m.geometry.dispose(); mat.dispose(); t.dispose(); }, cuenta: { radio: Math.round(r * 10) / 10, olas: detalle.olas } };
  },
});

registrar({
  id: "nat-fauna", nombre: "Fauna (mariposas/luciérnagas + pájaros, tabla de la casa, 10:30)", origen: "naturaleza/fauna.ts, mariposas.ts, aves.ts",
  async montar(c) {
    const [F, { FAUNA_CASA }] = await Promise.all([import("../../packages/render/src/naturaleza/fauna.ts"), import("../../features/naturaleza/fauna-casa.ts")]);
    const t = await terreno(c, false, null);
    const fa = F.crearFauna({ semilla: NAT.semilla, nivel: c.nivel, densidad: 1, especies: "", vientoU: vientoPropio(), camara: c.camera, escena: c.world, hora: () => NAT.hora, tabla: FAUNA_CASA, turnos: c.nivel !== "A", alturaEn: t.alturaEn, zonaEn: t.zonaEn });
    fa.llenarTodo(c.camera, 0);
    return { cuadro(_dt, tt) { fa.actualizar(c.camera, tt); }, quitar() { fa.dispose(); t.dispose(); }, get cuenta() { const s = fa.estadisticas(); return { llamadas: s.llamadas, triangulos: s.triangulos, mariposas: s.mariposas, pajaros: s.pajaros }; } };
  },
});

registrar({
  id: "naturaleza", nombre: "Naturaleza ENTERA como la monta la página (entorno + pieza naturaleza.ts con fauna)", origen: "naturaleza/naturaleza.ts (crearNaturaleza) + entorno.ts",
  async montar(c) {
    const { e, tick } = await entornoDe(c);
    const [{ crearNaturaleza }, { FAUNA_CASA }] = await Promise.all([import("../../packages/render/src/naturaleza/naturaleza.ts"), import("../../features/naturaleza/fauna-casa.ts")]);
    const n = crearNaturaleza({ padre: c.world, ground: c.suelo, vientoU: e.vientoU, nivel: () => c.nivel, camara: c.camera, yo: () => null,
      niebla: () => nieblaHex(c), aguaLuz: e.aguaLuz, detalleAgua: () => detalleAgua(c.nivel, e.calidadActual.agua), hora: () => NAT.hora,
      tablaFauna: async () => FAUNA_CASA, hitos: () => c.hitos, atmosfera: e.atmosfera });
    await n.aplicar({ activa: true, semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, arboles: 1, hierba: 1, estanque: true, paleta: NAT.estacion });
    for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
    let antes = 0;
    return {
      cuadro(_dt, t) { tick(t); n.actualizar(t - antes); antes = t; },
      quitar() { n.dispose(); },
      get cuenta() { const s = n.estadisticas(); return { triangulos: s.triangulos.total, llamadas: s.llamadas.total, terreno: s.triangulos.terreno, arboles: s.triangulos.arboles, hierba: s.triangulos.hierba, fauna: s.triangulos.fauna }; },
    };
  },
});

// ---- materia (D-058 spike, bd70685): ONE Residuo-sized sphere of dice blocks (r 0.7 m → 616 blocks, the tier's cap), opaque/translucent
// split from the policy (materia-politica TRANSLUCIDO: A 80/20, B 90/10, C 85/15, D none), «relleno» method (2 draw calls). Loops: gather → hold → crumble.
registrar({
  id: "materia", nombre: "Capa de materia: una esfera-Residuo de dados (2 llamadas)", origen: "packages/render/src/materia.ts, materia-politica.ts",
  async montar(c) {
    const [{ crearMateria }, MP] = await Promise.all([import("../../packages/render/src/materia.ts"), import("../../packages/render/src/materia-politica.ts")]);
    const forma = { tipo: "esfera" as const, radio: 0.7 };
    const n = MP.cuantos(MP.areaForma(forma), c.nivel);
    if (!n) return { quitar() {}, cuenta: { bloques: 0 } };
    const muestra = MP.muestrear(forma, n, 7);
    const m = crearMateria({ muestra, nivel: c.nivel, lado: MP.lado(muestra.area, muestra.n), semilla: 1 });
    const y = c.escena === "naturaleza" ? Math.max(alturaEnNat(0, 0), -0.2) : 0;
    m.objeto.position.set(0, y, 0);
    c.scene.add(m.objeto);
    const CICLO = 240 / 72; // one camera lap: gather 35 %, hold 30 %, crumble 35 %
    return {
      cuadro(dt, t) {
        const f = (t % CICLO) / CICLO;
        if (f < 0.35) { m.modo("junta"); m.progreso(f / 0.35); } else if (f < 0.65) { m.modo("junta"); m.progreso(1); } else { m.modo("deshace"); m.progreso(1 - (f - 0.65) / 0.35); }
        m.avanzar(dt);
      },
      quitar() { c.scene.remove(m.objeto); m.dispose(); },
      get cuenta() { const s = m.estado(); return { bloques: n, opacas: s.opacas, translucidas: s.translucidas, triangulos: s.tris, llamadas: s.llamadas }; },
    };
  },
});

// =====================================================================================================================
// E02 (RT1 «trozos y relevo de detalle», plan-experimentos): the terrain in ~64 m chunks with two detail rings, in the SAME one
// draw call (naturaleza/trozos.ts: index ranges over one vertex buffer + CDLOD-style morph). Compare each row with its E01 twin
// measured in the same run: nat-residuos-trozos ↔ nat-residuos · naturaleza-trozos ↔ naturaleza · nat-mapa-2km-trozos ↔
// nat-mapa-2km (a 2 × 2 km bare relief at the tier's cell size, no pond: what a growing map costs as ONE mesh vs chunks).
// `cuenta` gives the chunks' state at the end (fine/coarse, triangles drawn, index uploads).
// =====================================================================================================================
const TROZOS_BANCO = { lado: 64, radioDetalle: 64 };

registrar({
  id: "nat-residuos-trozos", nombre: "Terreno con Residuos + flora EN TROZOS de 64 m, 2 anillos, 1 llamada (E02)", origen: "naturaleza/terreno.ts + trozos.ts",
  async montar(c) {
    const [T, , , , P] = await modsNat();
    const t = T.crearTerreno({ semilla: NAT.semilla, nivel: c.nivel, tamano: NAT.tamano, plaza: NAT.plaza, niebla: nieblaHex(c), escena: c.world, estacion: NAT.estacion,
      recibeSombra: c.nivel === "A", aguaPlana: c.nivel === "D" ? P.COLOR_ESTANQUE : undefined, trozos: TROZOS_BANCO });
    const visto = c.suelo.visible; c.suelo.visible = false;
    t.trozos!.actualizar(c.camera.position.x, c.camera.position.z);
    return {
      cuadro() { t.trozos!.actualizar(c.camera.position.x, c.camera.position.z); },
      quitar() { t.dispose(); c.suelo.visible = visto; },
      get cuenta() { const e = t.trozos!.estadisticas(); return { trozos: e.trozos, finos: e.finos, gruesos: e.gruesos, triangulos: e.triangulos, malla: e.triangulosMalla, subidas: e.cambios, lado: e.ladoM }; },
    };
  },
});

registrar({
  id: "naturaleza-trozos", nombre: "Naturaleza ENTERA con el terreno EN TROZOS (E02; resto igual que «naturaleza»)", origen: "naturaleza/naturaleza.ts (trozos: true) + trozos.ts",
  async montar(c) {
    const { e, tick } = await entornoDe(c);
    const [{ crearNaturaleza }, { FAUNA_CASA }] = await Promise.all([import("../../packages/render/src/naturaleza/naturaleza.ts"), import("../../features/naturaleza/fauna-casa.ts")]);
    const n = crearNaturaleza({ padre: c.world, ground: c.suelo, vientoU: e.vientoU, nivel: () => c.nivel, camara: c.camera, yo: () => null,
      niebla: () => nieblaHex(c), aguaLuz: e.aguaLuz, detalleAgua: () => detalleAgua(c.nivel, e.calidadActual.agua), hora: () => NAT.hora,
      tablaFauna: async () => FAUNA_CASA, hitos: () => c.hitos, atmosfera: e.atmosfera, trozos: true });
    await n.aplicar({ activa: true, semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, arboles: 1, hierba: 1, estanque: true, paleta: NAT.estacion });
    for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
    let antes = 0;
    return {
      cuadro(_dt, t) { tick(t); n.actualizar(t - antes); antes = t; },
      quitar() { n.dispose(); },
      get cuenta() { const s = n.estadisticas(); return { triangulos: s.triangulos.total, llamadas: s.llamadas.total, terrenoPeor: s.triangulos.terreno, terrenoDibujado: s.trozos?.triangulos ?? 0, finos: s.trozos?.finos ?? 0, gruesos: s.trozos?.gruesos ?? 0 }; },
    };
  },
});

// radio 64 m = the catalogue's ring; radio 128 m = the coarse ring pushed out (the coarse − fine height error is p95 1–1.7 m: see e02-trozos.md)
for (const [sufijo, trozos] of [["", null], ["-trozos", TROZOS_BANCO], ["-trozos-r128", { lado: 64, radioDetalle: 128 }]] as const) registrar({
  id: "nat-mapa-2km" + sufijo,
  nombre: trozos ? `Mapa 2×2 km EN TROZOS de 64 m, anillo fino ${trozos.radioDetalle} m (1 llamada)` : "Mapa 2×2 km como UNA malla (celda del nivel)",
  origen: "naturaleza/terreno.ts" + (trozos ? " + trozos.ts" : ""),
  async montar(c) {
    const [T] = await modsNat();
    const celdas = 2 * Math.round((2000 / (NAT.tamano / T.CELDAS_TERRENO[c.nivel])) / 2); // the tier's cell size kept: A 340 · B 240 · C 200 · D 160
    const t0 = performance.now();
    const t = T.crearTerreno({ semilla: NAT.semilla, nivel: c.nivel, tamano: 2000, plaza: NAT.plaza, celdas, niebla: nieblaHex(c), escena: c.world, estacion: NAT.estacion,
      recibeSombra: c.nivel === "A", sinEstanque: true, residuos: false, trozos });
    const ms = Math.round(performance.now() - t0);
    const visto = c.suelo.visible; c.suelo.visible = false;
    t.trozos?.actualizar(c.camera.position.x, c.camera.position.z);
    return {
      cuadro() { t.trozos?.actualizar(c.camera.position.x, c.camera.position.z); },
      quitar() { t.dispose(); c.suelo.visible = visto; },
      get cuenta() { const e = t.trozos?.estadisticas(); return { celdas, malla: t.triangulos, dibujados: e?.triangulos ?? t.triangulos, finos: e?.finos ?? 0, gruesos: e?.gruesos ?? 0, msConstruir: ms }; },
    };
  },
});

// =====================================================================================================================
// E03 (agua de orilla AG1 + binarios AG10, plan-experimentos): the pond with its colour from the REAL depth of the bed
// (agua-estilo.ts `orilla`: fondoDeAgua bakes a 64² depth texture from the terrain's height function), in the two variants
// Pablo picks from photos — «a» continuous gradient (Starwild-like) and «b» the same gradient in 4 flat bands (PRI-008) —
// each with and without the 0/1 strings (binarios 0.35 = faint). Same mesh and geometry as E01's pond: 0 calls, 0 triangles
// more. `e03-agua-*` = the pond alone (vs nat-agua); `e03-nat-*` = the whole nature with its pond re-dressed (vs naturaleza).
// Measure with `--escena naturaleza --camara estanque` (E01's path never sees the pond). On D the pond is painted into the
// terrain (no water mesh): the rows equal E01's.
// =====================================================================================================================
const VARIANTES_E03 = [["a", "continuo", 0], ["b", "bandas", 0], ["a-bin", "continuo", 0.35], ["b-bin", "bandas", 0.35]] as const;
type AguaE03 = { variante: "continuo" | "bandas"; binarios: number };

/** The E03 pond material for the bench tier, over the real bed: the DRAWN terrain mesh of this tier (agua-estilo alturaDeMalla),
 * the smooth relieve function where no triangle covers a point. */
async function materialE03(c: Contexto, v: AguaE03, luz: unknown, corriente: { value: THREE.Vector3 }, tiempo: { value: number }, detalle: ReturnType<typeof detalleAgua>, suelo: THREE.Mesh) {
  const [T, , , , P, AG] = await modsNat();
  const e = T.estanqueDe(NAT.semilla, NAT.tamano), r = e.radio * 1.2, forma = { tipo: "circulo" as const, radio: r };
  const fondo = AG.fondoDeAgua(AG.alturaDeMalla(suelo, e.x - r, e.z - r, r * 2, alturaEnNat), T.NIVEL_AGUA, e.x, e.z, r * 2);
  const mat = AG.materialDeAgua({ color: P.COLOR_ESTANQUE, forma, detalle, tiempo, luz: luz as never, bordeOculto: r * 0.12, verdemar: true, orilla: { variante: v.variante, fondo }, binarios: v.binarios, corriente }, 12);
  return { mat, fondo, forma, e, r };
}

for (const [k, variante, binarios] of VARIANTES_E03) registrar({
  id: `e03-agua-${k}`, nombre: `E03 · estanque solo, agua de orilla «${variante}»${binarios ? " + binarios" : ""} (frente a nat-agua)`, origen: "agua-estilo.ts (orilla, binarios)",
  async montar(c) {
    if (c.nivel === "D") return { quitar() {}, cuenta: { agua: "pintada en el terreno" } };
    const [, , , , , AG] = await modsNat();
    const t = await terreno(c, false, null);
    const tiempo = uniform(0) as unknown as { value: number };
    const detalle = detalleAgua(c.nivel, calidadPagina(c.nivel).agua);
    const luz = { cielo: uniform(new THREE.Color(nieblaHex(c))), sol: uniform(new THREE.Color(0xffffff)), solDir: uniform(new THREE.Vector3(0.5, 0.8, 0.3).normalize()) };
    const { mat, fondo, forma } = await materialE03(c, { variante, binarios }, luz, vientoPropio() as never, tiempo, detalle, t.malla);
    const m = new THREE.Mesh(AG.geometriaDeAgua(forma, detalle, 12), mat);
    m.position.set(t.estanque.x, t.estanque.nivel, t.estanque.z); m.userData.sinSombra = true;
    c.world.add(m);
    return { cuadro(dt) { tiempo.value += dt; }, quitar() { m.removeFromParent(); m.geometry.dispose(); mat.dispose(); fondo.textura.dispose(); t.dispose(); }, cuenta: { variante, binarios, olas: detalle.olas, fondo: `${fondo.res}²` } };
  },
});

for (const [k, variante, binarios] of VARIANTES_E03) registrar({
  id: `e03-nat-${k}`, nombre: `E03 · naturaleza ENTERA con el estanque «${variante}»${binarios ? " + binarios" : ""} (frente a naturaleza)`, origen: "naturaleza.ts (crearNaturaleza) + agua-estilo.ts (orilla, binarios)",
  async montar(c) {
    const { e, tick } = await entornoDe(c);
    const [{ crearNaturaleza }, { FAUNA_CASA }] = await Promise.all([import("../../packages/render/src/naturaleza/naturaleza.ts"), import("../../features/naturaleza/fauna-casa.ts")]);
    const n = crearNaturaleza({ padre: c.world, ground: c.suelo, vientoU: e.vientoU, nivel: () => c.nivel, camara: c.camera, yo: () => null,
      niebla: () => nieblaHex(c), aguaLuz: e.aguaLuz, detalleAgua: () => detalleAgua(c.nivel, e.calidadActual.agua), hora: () => NAT.hora,
      tablaFauna: async () => FAUNA_CASA, hitos: () => c.hitos, atmosfera: e.atmosfera });
    await n.aplicar({ activa: true, semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, arboles: 1, hierba: 1, estanque: true, paleta: NAT.estacion });
    for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
    // re-dress the pond naturaleza.ts built (same mesh, same geometry): only its material changes
    const malla = c.world.getObjectByName("agua-naturaleza") as THREE.Mesh | undefined;
    let suelo: THREE.Mesh | undefined; c.world.traverse((o) => { if (o.userData.mapa === "suelo") suelo = o as THREE.Mesh; });
    const tiempo = uniform(0) as unknown as { value: number };
    let quitarAgua = () => {};
    if (malla && suelo) {
      const { mat, fondo } = await materialE03(c, { variante, binarios }, e.aguaLuz, e.vientoU as never, tiempo, detalleAgua(c.nivel, e.calidadActual.agua), suelo);
      const viejo = malla.material as THREE.Material; malla.material = mat; viejo.dispose();
      quitarAgua = () => { fondo.textura.dispose(); };
    }
    let antes = 0;
    return {
      cuadro(dt, t) { tick(t); n.actualizar(t - antes); antes = t; tiempo.value += dt; },
      quitar() { quitarAgua(); n.dispose(); },
      get cuenta() { const s = n.estadisticas(); return { variante, binarios, estanque: malla ? "re-vestido" : "pintado (D)", triangulos: s.triangulos.total, llamadas: s.llamadas.total }; },
    };
  },
});

// =====================================================================================================================
// E04 (cielo analítico, plan-experimentos): the R7.1 4-stop dome (drawn FIRST over the whole screen; baked into a cube on B–D) against
// cielo-analitico.ts (zenith → pale turquoise → ivory/nacre horizon, twilight, prismatic 22° halo, stars, crescent moon; drawn live and LAST,
// depth-tested at the far plane, on every tier). Compare: nat-cielo-analitico vs nat-atmosfera (sky + fog + tone over the real entorno) and
// naturaleza-cielo-analitico vs naturaleza (the whole piece). nat-cielo-analitico-primero = the same analytic shader drawn FIRST without depth
// test (as R7.1 draws its dome): splits «what the shader costs» from «what drawing it last saves».
// `foto-cielo` is for photos only (tools-free: work/naturaleza/e04/fotos-e04.mjs): ?hora=<h>&cielo=r71|analitico&vista=<rumbo>,<cabeceo>.
// =====================================================================================================================
async function atmosferaE04(c: Contexto, cielo: "r71" | "analitico", primero = false): Promise<Montada> {
  const { e, tick } = await entornoDe(c);
  const [{ atmosferaNaturaleza }, { NIVEL_AGUA }] = await Promise.all([import("../../packages/render/src/naturaleza/atmosfera.ts"), import("../../packages/render/src/naturaleza/terreno.ts")]);
  const quitar = e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA, cielo));
  for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
  const domo = c.world.children.find((o) => o.name === "cielo-degradado") as THREE.Mesh | undefined;
  if (primero && domo) { domo.renderOrder = -10; (domo.material as THREE.Material).depthTest = false; } // bench only: R7.1's order
  return { cuadro(_dt, t) { tick(t); }, quitar() { if (primero && domo) (domo.material as THREE.Material).depthTest = true; quitar(); },
    get cuenta() { const s = e.estado(); return { cielo: s.modoCielo, analitico: s.atmosfera?.cielo ?? "—", orden: domo?.renderOrder ?? "—" }; } };
}
registrar({ id: "nat-cielo-analitico", nombre: "E04 · Atmósfera con cielo ANALÍTICO (vivo, al final) + niebla nodo + tono Neutral", origen: "cielo-analitico.ts, entorno.ts atmosfera()", montar: (c) => atmosferaE04(c, "analitico") });
registrar({ id: "nat-cielo-analitico-primero", nombre: "E04 · control: el mismo cielo analítico dibujado PRIMERO sin prueba de profundidad", origen: "cielo-analitico.ts (orden de R7.1)", montar: (c) => atmosferaE04(c, "analitico", true) });

/** The whole nature as the page builds it, with the sky the photo/row asks for and the world at hour `hora`. */
async function naturalezaE04(c: Contexto, cielo: "r71" | "analitico", hora = NAT.hora): Promise<Montada> {
  let eb: EntornoBanco;
  if (hora === NAT.hora) eb = await entornoDe(c);
  else { // photos at other hours: the same entorno set-up as entornoDe, at that hour
    const [{ crearEntorno }, { baseDelMundo, conSol }, { aVista }] = await Promise.all([
      import("../../packages/render/src/entorno.ts"), import("../../features/entorno/server.ts"), import("../../features/entorno/client.ts")]);
    const e = crearEntorno({ renderer: c.renderer, scene: c.scene, world: c.world, camera: c.camera, hemi: c.hemi, sun: c.sol, ground: c.suelo, grid: new THREE.Group(), hitos: c.hitos,
      aparato: { mobile: false }, fichero: (n) => `/no-hay-servidor/${n}`, foco: () => null });
    e.simularNivel(c.nivel);
    e.aplicar({ ...aVista(conSol(baseDelMundo({ ...ENTORNO_DEMO, hora: { ...ENTORNO_DEMO.hora, valor: hora } })) as Record<string, unknown>), suelo: "liso", sueloMapa: "", sueloNormal: "" });
    for (let i = 0; i < 60 && (e.ocupado() || i < 10); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
    let ultimo = -1;
    eb = { e, tick(t: number) { if (t !== ultimo) { ultimo = t; e.actualizar(); } } };
  }
  const { e, tick } = eb;
  const [{ crearNaturaleza }, { FAUNA_CASA }, { atmosferaNaturaleza }, { NIVEL_AGUA }] = await Promise.all([import("../../packages/render/src/naturaleza/naturaleza.ts"),
    import("../../features/naturaleza/fauna-casa.ts"), import("../../packages/render/src/naturaleza/atmosfera.ts"), import("../../packages/render/src/naturaleza/terreno.ts")]);
  const n = crearNaturaleza({ padre: c.world, ground: c.suelo, vientoU: e.vientoU, nivel: () => c.nivel, camara: c.camera, yo: () => null,
    niebla: () => nieblaHex(c), aguaLuz: e.aguaLuz, detalleAgua: () => detalleAgua(c.nivel, e.calidadActual.agua), hora: () => hora,
    tablaFauna: async () => FAUNA_CASA, hitos: () => c.hitos, atmosfera: () => e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA, cielo)) });
  await n.aplicar({ activa: true, semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, arboles: 1, hierba: 1, estanque: true, paleta: NAT.estacion });
  for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
  let antes = 0;
  return {
    cuadro(_dt, t) { tick(t); n.actualizar(t - antes); antes = t; },
    quitar() { n.dispose(); },
    get cuenta() { const s = n.estadisticas(); return { cielo, triangulos: s.triangulos.total, llamadas: s.llamadas.total }; },
  };
}
registrar({ id: "naturaleza-cielo-analitico", nombre: "E04 · Naturaleza ENTERA con el cielo analítico (comparar con «naturaleza»)", origen: "naturaleza.ts + cielo-analitico.ts", montar: (c) => naturalezaE04(c, "analitico") });

registrar({
  id: "foto-cielo", nombre: "E04 · solo fotos: naturaleza a una hora y con un cielo, encuadre fijo (?hora, ?cielo, ?vista=rumbo,cabeceo)", origen: "naturaleza.ts + cielo-analitico.ts",
  async montar(c) {
    const q = new URLSearchParams(location.search);
    const hora = Number(q.get("hora") ?? NAT.hora), cielo = q.get("cielo") === "analitico" ? "analitico" : "r71";
    const [rumbo, cabeceo] = (q.get("vista") ?? "150,8").split(",").map(Number);
    if (q.get("k")) { // tuning/debug only: ?k=halo:0.2,nacar:0 (CIELO_ANALITICO knobs, read when the sky is built)
      const { CIELO_ANALITICO } = await import("../../packages/render/src/cielo-analitico.ts");
      for (const par of q.get("k")!.split(",")) { const [k, v] = par.split(":"); (CIELO_ANALITICO as Record<string, number>)[k] = Number(v); }
    }
    const m = await naturalezaE04(c, cielo, hora);
    // a fixed framing: from the plaza's north edge, looking along `rumbo` (from north towards east), `cabeceo` degrees up. The bench moves the
    // camera every frame (position.set + lookAt): its lookAt is replaced for this page only.
    const x = 0, z = -8, y = Math.max(alturaEnNat(x, z), -0.2) + 1.7, r = rumbo * Math.PI / 180, p = cabeceo * Math.PI / 180;
    const objetivo = new THREE.Vector3(x + Math.cos(p) * Math.sin(r) * 10, y + Math.sin(p) * 10, z - Math.cos(p) * Math.cos(r) * 10);
    const lookAt = THREE.Object3D.prototype.lookAt;
    c.camera.lookAt = function (this: THREE.Object3D) { this.position.set(x, y, z); lookAt.call(this, objetivo); } as typeof c.camera.lookAt;
    // ?solo=cielo: only the sky (every other mesh hidden) — to read the sky's own colours
    const soloCielo = () => c.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !/cielo/.test(o.name)) o.visible = false; });
    return { cuadro: q.get("solo") === "cielo" ? (dt, t) => { m.cuadro(dt, t); soloCielo(); } : m.cuadro, quitar() { m.quitar(); }, get cuenta() { return { ...m.cuenta, hora, rumbo, cabeceo }; } };
  },
});

// =====================================================================================================================
// E50 · árboles con máquina (work/naturaleza/MUNDO-PROYECTADO.md). The cost rows are E01's own `nat-arboles` and `naturaleza` run on this
// branch (the machine pieces live INSIDE the tree meshes: same rows, same draw calls). `foto-e50` is for photos only
// (work/naturaleza/e50/fotos-e50.mjs): the whole nature at ?hora, a fixed framing — ?pos=x,y,z&mira=x,y,z, or ?buscar=<piece>
// (bronce | hojalata | neon | obra | obraPortal | obraLente) to frame the nearest tree wearing it from ?dist m (it prints where, so the
// «antes» photo on E01's code can reuse the same pos/mira). Reads the E50 exports dynamically: it also runs on E01's arboles.ts.
// =====================================================================================================================
async function naturalezaAHora(c: Contexto, hora: number): Promise<Montada & { puntos: import("../../packages/render/src/naturaleza/arboles.ts").PuntoArbol[] }> {
  const [{ crearEntorno }, { baseDelMundo, conSol }, { aVista }] = await Promise.all([
    import("../../packages/render/src/entorno.ts"), import("../../features/entorno/server.ts"), import("../../features/entorno/client.ts")]);
  const e = crearEntorno({ renderer: c.renderer, scene: c.scene, world: c.world, camera: c.camera, hemi: c.hemi, sun: c.sol, ground: c.suelo, grid: new THREE.Group(), hitos: c.hitos,
    aparato: { mobile: false }, fichero: (n) => `/no-hay-servidor/${n}`, foco: () => null });
  e.simularNivel(c.nivel);
  e.aplicar({ ...aVista(conSol(baseDelMundo({ ...ENTORNO_DEMO, hora: { ...ENTORNO_DEMO.hora, valor: hora } })) as Record<string, unknown>), suelo: "liso", sueloMapa: "", sueloNormal: "" });
  for (let i = 0; i < 60 && (e.ocupado() || i < 10); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
  const [{ crearNaturaleza }, { FAUNA_CASA }] = await Promise.all([import("../../packages/render/src/naturaleza/naturaleza.ts"), import("../../features/naturaleza/fauna-casa.ts")]);
  const n = crearNaturaleza({ padre: c.world, ground: c.suelo, vientoU: e.vientoU, nivel: () => c.nivel, camara: c.camera, yo: () => null,
    niebla: () => nieblaHex(c), aguaLuz: e.aguaLuz, detalleAgua: () => detalleAgua(c.nivel, e.calidadActual.agua), hora: () => hora,
    tablaFauna: async () => FAUNA_CASA, hitos: () => c.hitos, atmosfera: e.atmosfera });
  await n.aplicar({ activa: true, semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, arboles: 1, hierba: 1, estanque: true, paleta: NAT.estacion });
  for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
  // the same points naturaleza.ts scatters (same call), to find a tree by its piece
  const [, A, , E] = await modsNat(), t = await terreno(c, false, null);
  const puntos = E.esparcirArboles(t, { semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, densidad: 1, nivel: c.nivel, paleta: NAT.estacion, estanque: t.estanque });
  void A;
  let antes = 0, ultimo = -1;
  return { puntos, cuadro(_dt, tt) { if (tt !== ultimo) { ultimo = tt; e.actualizar(); } n.actualizar(tt - antes); antes = tt; }, quitar() { n.dispose(); t.dispose(); },
    get cuenta() { const s = n.estadisticas(); return { triangulos: s.triangulos.total, llamadas: s.llamadas.total, arboles: s.triangulos.arboles }; } };
}
registrar({
  id: "foto-e50", nombre: "E50 · solo fotos: naturaleza a una hora, encuadre fijo o el árbol más cercano con una pieza (?hora, ?pos, ?mira, ?buscar, ?dist)", origen: "naturaleza.ts + arboles.ts (E50)",
  async montar(c) {
    const q = new URLSearchParams(location.search), hora = Number(q.get("hora") ?? NAT.hora);
    const m = await naturalezaAHora(c, hora);
    const A = await import("../../packages/render/src/naturaleza/arboles.ts") as Record<string, unknown>;
    const vec = (k: string) => q.get(k) ? new THREE.Vector3(...(q.get(k)!.split(",").map(Number) as [number, number, number])) : null;
    let pos = vec("pos"), mira = vec("mira"), elegido: Record<string, unknown> | null = null;
    const buscar = q.get("buscar"), PZ = A.PIEZA as Record<string, number> | undefined, pieza = A.piezaDeArbol as ((x: number, z: number, e: string) => number) | undefined;
    if (buscar && PZ && pieza) {
      const quiere = buscar === "neon" ? [PZ.neonTurquesa, PZ.neonCoral] : buscar === "obra" ? [PZ.obraPortal, PZ.obraLente] : [PZ[buscar]];
      const desde = vec("desde") ?? new THREE.Vector3(0, 0, -8), salta = Number(q.get("salta") ?? 0), sp = q.get("especie");
      const cand = m.puntos.filter((p) => quiere.includes(pieza(p.x, p.z, String(p.especie))) && (!sp || p.especie === sp)).sort((a, b) => Math.hypot(a.x - desde.x, a.z - desde.z) - Math.hypot(b.x - desde.x, b.z - desde.z));
      const p = cand[Math.min(salta, cand.length - 1)];
      if (p) {
        const d = Number(q.get("dist") ?? 6), alto = Number(q.get("alto") ?? 1.6), rumbo = Number(q.get("rumbo") ?? NaN);
        // from the side facing `desde` (or along ?rumbo degrees), at eye height over the ground there; looking at `alto` m up the tree
        const dir = Number.isFinite(rumbo) ? new THREE.Vector3(Math.sin(rumbo * Math.PI / 180), 0, -Math.cos(rumbo * Math.PI / 180)) : new THREE.Vector3(desde.x - p.x, 0, desde.z - p.z).normalize();
        const cx = p.x + dir.x * d, cz = p.z + dir.z * d;
        pos = new THREE.Vector3(cx, Math.max(alturaEnNat(cx, cz), -0.2) + Number(q.get("ojo") ?? 1.7), cz);
        mira = new THREE.Vector3(p.x, p.y + alto * p.escala, p.z);
        elegido = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), especie: p.especie, escala: +p.escala.toFixed(2), pieza: pieza(p.x, p.z, String(p.especie)), candidatos: cand.length };
      }
    }
    if (!pos || !mira) { // default framing: E04's (from the plaza's north edge, ?vista = rumbo,cabeceo)
      const [rumbo, cabeceo] = (q.get("vista") ?? "150,8").split(",").map(Number);
      const x = 0, z = -8, y = Math.max(alturaEnNat(x, z), -0.2) + 1.7, r = rumbo * Math.PI / 180, pp = cabeceo * Math.PI / 180;
      pos = new THREE.Vector3(x, y, z); mira = new THREE.Vector3(x + Math.cos(pp) * Math.sin(r) * 10, y + Math.sin(pp) * 10, z - Math.cos(pp) * Math.cos(r) * 10);
    }
    if (q.get("fov")) { (c.camera as THREE.PerspectiveCamera).fov = Number(q.get("fov")); (c.camera as THREE.PerspectiveCamera).updateProjectionMatrix(); }
    const P = pos, M = mira, lookAt = THREE.Object3D.prototype.lookAt;
    c.camera.lookAt = function (this: THREE.Object3D) { this.position.copy(P); lookAt.call(this, M); } as typeof c.camera.lookAt;
    const noche = A.nocheArbolesU as { value: number } | undefined;
    return { cuadro: m.cuadro, quitar: m.quitar, get cuenta() { return { ...m.cuenta, hora, pos: P.toArray().map((v) => +v.toFixed(2)).join(","), mira: M.toArray().map((v) => +v.toFixed(2)).join(","), noche: noche ? +noche.value.toFixed(3) : "—", ...(elegido ? { arbol: JSON.stringify(elegido) } : {}) }; } };
  },
});

// =====================================================================================================================
// E51 (agua con código, MUNDO-PROYECTADO.md): the pond re-dressed as the cyberpunk shore's deep ocean — agua-estilo.ts variant
// «oceano»: petrol-dark colour, code glyphs from a 128×64 atlas built in code (0/1, letters, house symbols) dragged by the
// current, faint by day, plankton glow at night with a pulse front — and E03's a/b with the binaries RAISED (BINARIOS_TENUE
// 0.6, bigger glyphs, dark ink). Same mesh, same draw call: compare with `naturaleza` (E01) and `e03-nat-*` in the same run,
// `--escena naturaleza --camara estanque`. Photos (tools/fotos-agua-e51.mjs) switch the hour with `__e51.hora(h)`.
// =====================================================================================================================
const VARIANTES_E51 = [["c", "oceano", undefined], ["a-bin", "continuo", 0.6], ["b-bin", "bandas", 0.6], ["a", "continuo", 0]] as const; // «a» = e03-nat-a with the hour hook (night photo of E03)

/** Re-apply the bench's demo environment at another hour (photos: day/night). Returns once the sky has settled. */
async function horaE51(e: import("../../packages/render/src/entorno.ts").Entorno, h: number): Promise<void> {
  const [{ baseDelMundo, conSol }, { aVista }] = await Promise.all([import("../../features/entorno/server.ts"), import("../../features/entorno/client.ts")]);
  const demo = { ...ENTORNO_DEMO, hora: { ...ENTORNO_DEMO.hora, valor: h } };
  e.aplicar({ ...aVista(conSol(baseDelMundo(demo)) as Record<string, unknown>), suelo: "liso", sueloMapa: "", sueloNormal: "" });
  for (let i = 0; i < 40 && (e.ocupado() || i < 8); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
}

for (const [k, variante, binarios] of VARIANTES_E51) registrar({
  id: `e51-nat-${k}`, nombre: `E51 · naturaleza ENTERA con el estanque «${variante}»${variante === "oceano" ? " (código + plancton)" : binarios ? " + binarios subidos" : " (= e03-nat-a, con gancho de hora)"} (frente a naturaleza y e03-nat-*)`,
  origen: "naturaleza.ts (crearNaturaleza) + agua-estilo.ts (orilla oceano, glifos agua-glifos.ts)",
  async montar(c) {
    const { e, tick } = await entornoDe(c);
    const [{ crearNaturaleza }, { FAUNA_CASA }] = await Promise.all([import("../../packages/render/src/naturaleza/naturaleza.ts"), import("../../features/naturaleza/fauna-casa.ts")]);
    const n = crearNaturaleza({ padre: c.world, ground: c.suelo, vientoU: e.vientoU, nivel: () => c.nivel, camara: c.camera, yo: () => null,
      niebla: () => nieblaHex(c), aguaLuz: e.aguaLuz, detalleAgua: () => detalleAgua(c.nivel, e.calidadActual.agua), hora: () => NAT.hora,
      tablaFauna: async () => FAUNA_CASA, hitos: () => c.hitos, atmosfera: e.atmosfera });
    await n.aplicar({ activa: true, semilla: NAT.semilla, tamano: NAT.tamano, plaza: NAT.plaza, arboles: 1, hierba: 1, estanque: true, paleta: NAT.estacion });
    for (let i = 0; i < 40 && (e.ocupado() || i < 5); i++) { e.actualizar(); await new Promise((r) => setTimeout(r, 30)); }
    const malla = c.world.getObjectByName("agua-naturaleza") as THREE.Mesh | undefined;
    let suelo: THREE.Mesh | undefined; c.world.traverse((o) => { if (o.userData.mapa === "suelo") suelo = o as THREE.Mesh; });
    const tiempo = uniform(0) as unknown as { value: number };
    let quitarAgua = () => {};
    if (malla && suelo) {
      const { mat, fondo } = await materialE03(c, { variante: variante as never, binarios: binarios as never }, e.aguaLuz, e.vientoU as never, tiempo, detalleAgua(c.nivel, e.calidadActual.agua), suelo);
      const viejo = malla.material as THREE.Material; malla.material = mat; viejo.dispose();
      quitarAgua = () => { fondo.textura.dispose(); };
    }
    (window as unknown as { __e51: unknown }).__e51 = { hora: (h: number) => horaE51(e, h), reloj: () => tiempo.value, sol: () => (e.aguaLuz.solDir as unknown as { value: THREE.Vector3 }).value.toArray() };
    let antes = 0;
    return {
      cuadro(dt, t) { tick(t); n.actualizar(t - antes); antes = t; tiempo.value += dt; },
      quitar() { quitarAgua(); n.dispose(); },
      get cuenta() { const s = n.estadisticas(); return { variante, binarios: binarios ?? "1 (oceano)", estanque: malla ? "re-vestido" : "pintado (D)", triangulos: s.triangulos.total, llamadas: s.llamadas.total }; },
    };
  },
});
