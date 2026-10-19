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
    const mat = AG.materialDeAgua({ color: P.COLOR_ESTANQUE, forma, detalle, tiempo, luz: luz as never, bordeOculto: r * 0.12 }, 12);
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
