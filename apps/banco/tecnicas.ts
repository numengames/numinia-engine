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
import { TECHO_POR_NIVEL, TOPE_PARTICULAS, FACTOR_PARTICULAS, SOMBRA_PX, OLAS_DESDE_M, detalleAgua } from "../../packages/render/src/calidad.ts";
import type { Nivel } from "../../packages/render/src/calidad.ts";

export type Contexto = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  world: THREE.Group;       // the fixed scene's objects (ground, pillars): what casts and receives shadows
  camera: THREE.PerspectiveCamera;
  sol: THREE.DirectionalLight;
  nivel: Nivel;
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
