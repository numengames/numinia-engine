// elementos (H4 + H8): water, fire, smoke and dust drawn from data (features/elementos fields, read by name), tiered
// by device (calidad.ts): reflective water (three's WaterMesh) only on desktop and near, a cheap animated-normal water
// elsewhere; fire = flames + sparks + smoke (GPU particles, particulas.ts) + a smoothly flickering light (≤ 3 flashes/s)
// for the nearest fires only; everything animates only near (ANIMAR_M) and on screen, and is not drawn past DIBUJAR_M.
import * as THREE from "three/webgpu";
import { uniform, texture, uv, vec2, normalMap, mix } from "three/tsl";
import { crearEmisor, pide } from "./particulas.ts";
import type { EmisorDef, Emisor } from "./particulas.ts";
import { parpadeo } from "./curvas.ts";
import { normalesDeAgua } from "./agua-normales.ts";
import { particulasPara, LUCES_FUEGO, ANIMAR_M, DIBUJAR_M } from "./calidad.ts";
import type { Entorno } from "./entorno.ts";
import type { Cuenta } from "./elementos-vista.ts";

type Datos = Record<string, unknown>;
const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// ---- what each element is made of (data; a world could bring its own later) ----
export const LLAMAS: EmisorDef = { forma: "cono", radio: 0.32, ritmo: 60, vida: [0.55, 1.05], velocidad: [0, 1.5, 0], dispersion: 0.22, tamano: [[0, 0.55], [0.3, 1], [1, 0.2]], tamanoMax: 0.95, giro: [-1.2, 1.2], color: [[0, 1, 0.82, 0.42], [0.35, 1, 0.48, 0.1], [1, 0.55, 0.12, 0.04]], alfa: [[0, 0], [0.12, 0.85], [0.6, 0.55], [1, 0]], mezcla: "aditiva", gravedad: 1.1, viento: 0.12, suave: 0.85 };
export const CHISPAS: EmisorDef = { forma: "cono", radio: 0.25, ritmo: 10, vida: [0.8, 1.6], velocidad: [0, 3, 0], dispersion: 0.9, tamano: [[0, 1], [1, 0.3]], tamanoMax: 0.07, giro: [0, 0], color: [[0, 1, 0.9, 0.55], [1, 1, 0.45, 0.1]], alfa: [[0, 1], [0.7, 1], [1, 0]], mezcla: "aditiva", gravedad: -1.4, viento: 0.4, suave: 0.3 };
export const HUMO: EmisorDef = { forma: "cono", radio: 0.4, ritmo: 9, vida: [4.5, 7.5], velocidad: [0, 1.3, 0], dispersion: 0.22, tamano: [[0, 0.35], [1, 2.6]], tamanoMax: 1.5, giro: [-0.35, 0.35], color: [[0, 0.5, 0.5, 0.5], [1, 0.78, 0.78, 0.78]], alfa: [[0, 0], [0.15, 0.38], [0.7, 0.22], [1, 0]], mezcla: "normal", gravedad: 0.12, viento: 0.6, vagar: 0.8, suave: 0.9 };
export const POLVO: EmisorDef = { forma: "caja", caja: [14, 3, 14], ritmo: 40, vida: [4, 8], velocidad: [0, 0.05, 0], dispersion: 0.25, tamano: [[0, 0.6], [0.5, 1], [1, 0.8]], tamanoMax: 0.1, giro: [-1, 1], color: [[0, 1, 1, 1], [1, 1, 1, 1]], alfa: [[0, 0], [0.2, 0.6], [0.8, 0.45], [1, 0]], mezcla: "normal", gravedad: -0.05, viento: 1, vagar: 1.2, suave: 0.7 };

type Uno = {
  datos: Datos; grupo: THREE.Group; emisores: Emisor[]; radio: number;
  agua?: { malla: THREE.Mesh; tiempo: { value: number }; reflejo: THREE.Mesh | null; reflejoCargando: boolean };
  fuego?: { semilla: number; luz: THREE.PointLight | null; base: number };
  visible: boolean; animando: boolean;
};

export function crearElementos(h: { renderer: THREE.WebGPURenderer; scene: THREE.Scene; world: THREE.Group; camera: THREE.PerspectiveCamera; entorno: Entorno }) {
  const { world, camera, entorno } = h;
  const todos = new Map<string, Uno>();
  const normales = normalesDeAgua();
  let enUso = 0, calidadVista = JSON.stringify(entorno.calidadActual), nivelVisto = entorno.nivel, animando = 0, tiempo = 0;
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), esfera = new THREE.Sphere();
  const lenaGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.95, 6);
  const lenaMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.95, emissive: new THREE.Color(0x401000), emissiveIntensity: 0.6 });
  const luces: THREE.PointLight[] = []; // the fire-light pool, made on the first fire (adding lights recompiles lit materials once)

  function emisor(u: Uno, def: EmisorDef, cuantas: number): Emisor | null {
    const q = particulasPara(entorno.nivel, entorno.calidadActual.particulas, cuantas, enUso);
    if (q <= 0) return null;
    const e = crearEmisor(def, q, entorno.vientoU);
    enUso += e.cuantas; u.emisores.push(e); u.grupo.add(e.objeto);
    return e;
  }

  function aguaSimple(d: Datos): { malla: THREE.Mesh; t: { value: number } } {
    const mat = new THREE.MeshStandardNodeMaterial({ color: n(d.color, 0x2f6f8f), roughness: 0.08, metalness: 0, transparent: true, opacity: 0.86 });
    const rep = vec2(Math.max(1, n(d.ancho, 6) / 3), Math.max(1, n(d.largo, 4) / 3));
    const t = uniform(0);
    const a = texture(normales, uv().mul(rep).add(vec2(t.mul(0.021), t.mul(0.013))));
    const b = texture(normales, uv().mul(rep).mul(0.63).sub(vec2(t.mul(0.017), t.mul(-0.011))));
    mat.normalNode = normalMap(mix(a, b, 0.5), vec2(0.6, 0.6));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(n(d.ancho, 6), n(d.largo, 4)), mat);
    m.rotation.x = -Math.PI / 2; m.userData.sinSombra = true; m.receiveShadow = true; m.name = "agua";
    return { malla: m, t };
  }

  function crear(key: string, d: Datos): Uno {
    const grupo = new THREE.Group(); grupo.name = `elemento:${key}`;
    grupo.position.set(n(d.x), n(d.y), n(d.z)); grupo.rotation.y = n(d.giro) * Math.PI / 180;
    const u: Uno = { datos: d, grupo, emisores: [], radio: 2, visible: true, animando: false };
    const tam = n(d.tamano, 1), fuerza = Math.max(0, n(d.intensidad, 1));
    const tipo = String(d.tipo);
    if (tipo === "agua") {
      const { malla, t } = aguaSimple(d);
      grupo.add(malla);
      u.agua = { malla, tiempo: t, reflejo: null, reflejoCargando: false };
      u.radio = Math.hypot(n(d.ancho, 6), n(d.largo, 4)) / 2;
    } else if (tipo === "fuego") {
      const lena = new THREE.InstancedMesh(lenaGeo, lenaMat, 3);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < 3; i++) { e.set(Math.PI / 2 - 0.35, (i * Math.PI * 2) / 3, 0, "YXZ"); q.setFromEuler(e); m.compose(new THREE.Vector3(Math.sin((i * Math.PI * 2) / 3) * 0.18, 0.16, Math.cos((i * Math.PI * 2) / 3) * 0.18), q, new THREE.Vector3(1, 1, 1)); lena.setMatrixAt(i, m); }
      lena.scale.setScalar(tam); lena.raycast = () => {};
      grupo.add(lena);
      emisor(u, LLAMAS, pide(LLAMAS) * fuerza)?.escala(tam);
      if (entorno.nivel !== "D") emisor(u, CHISPAS, pide(CHISPAS) * fuerza)?.escala(tam);
      const humo = emisor(u, HUMO, Math.round(pide(HUMO) * 0.6 * fuerza)); humo?.escala(0.7 * tam); humo?.tinte(0x707070);
      u.fuego = { semilla: (key.length * 7.3 + n(d.x)) % 10, luz: null, base: 6 * tam * Math.max(0.2, fuerza) };
      u.radio = 3 * tam + 6;
    } else if (tipo === "humo") {
      const e = emisor(u, HUMO, pide(HUMO) * fuerza); e?.escala(tam); e?.tinte(n(d.color, 0x8c8c8c));
      u.radio = 8 * tam + 4;
    } else if (tipo === "polvo") {
      const area = n(d.ancho, 14) * n(d.largo, 14);
      const e = emisor(u, POLVO, Math.round(area * 0.2 * POLVO.vida[1] * fuerza));
      e?.caja(n(d.ancho, 14), Math.max(0.2, n(d.alto, 3)), n(d.largo, 14)); e?.tinte(n(d.color, 0xd9c9a3));
      u.radio = Math.hypot(n(d.ancho, 14), n(d.largo, 14)) / 2 + 6;
    }
    world.add(grupo);
    return u;
  }

  function quitar(key: string): void {
    const u = todos.get(key);
    if (!u) return;
    for (const e of u.emisores) { enUso -= e.cuantas; e.dispose(); }
    if (u.fuego?.luz) { u.fuego.luz.intensity = 0; u.fuego.luz.userData.de = ""; }
    u.agua?.malla.geometry.dispose(); (u.agua?.malla.material as THREE.Material | undefined)?.dispose();
    if (u.agua?.reflejo) { u.agua.reflejo.geometry.dispose(); (u.agua.reflejo.material as THREE.Material).dispose(); }
    world.remove(u.grupo);
    todos.delete(key);
  }

  function reflejo(u: Uno): void { // three's WaterMesh (a reflection pass): desktop tier, chosen quality, near
    const a = u.agua!;
    if (a.reflejo || a.reflejoCargando) return;
    a.reflejoCargando = true;
    import("three/addons/objects/WaterMesh.js").then((m) => {
      if (!todos.has(keyOf(u))) return;
      const d = u.datos;
      const w = new m.WaterMesh(new THREE.PlaneGeometry(n(d.ancho, 6), n(d.largo, 4)), { waterNormals: normales, sunDirection: entorno.solDir, sunColor: entorno.solColorU.value, waterColor: n(d.color, 0x2f6f8f), distortionScale: 2.2, size: 1.5, alpha: 0.92, resolutionScale: 0.5 });
      w.rotation.x = -Math.PI / 2; w.userData.sinSombra = true; w.name = "agua-reflejos"; w.visible = false;
      a.reflejo = w; u.grupo.add(w);
    }).catch((e) => console.warn(`[elementos] agua sin reflejos: ${(e as Error)?.message ?? e}`)).finally(() => { a.reflejoCargando = false; });
  }
  const keyOf = (u: Uno) => { for (const [k, v] of todos) if (v === u) return k; return ""; };

  function rehacer(): void { for (const [k, u] of [...todos]) { quitar(k); todos.set(k, crear(k, u.datos)); } }

  function luzPara(u: Uno, quedan: THREE.PointLight[]): void {
    const l = quedan.shift();
    if (!l || !u.fuego) return;
    u.fuego.luz = l;
    const tam = n(u.datos.tamano, 1);
    l.position.set(n(u.datos.x), n(u.datos.y) + 0.9 * tam, n(u.datos.z)); l.distance = 14 * tam; l.userData.de = "x";
  }

  return {
    poner(key: string, d: Datos | null): void {
      const u = todos.get(key);
      if (!d) { quitar(key); return; }
      if (u) quitar(key);
      todos.set(key, crear(key, d));
    },
    actualizar(dt: number): void {
      // quality or tier changed (settings menu, entering VR): rebuild with the new caps and variants
      const c = JSON.stringify(entorno.calidadActual);
      if (c !== calidadVista || entorno.nivel !== nivelVisto) { calidadVista = c; nivelVisto = entorno.nivel; rehacer(); }
      tiempo += dt;
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
      animando = 0;
      const fuegos: [number, Uno][] = [];
      for (const u of todos.values()) {
        const dx = u.grupo.position.x - camera.position.x, dz = u.grupo.position.z - camera.position.z, dist = Math.hypot(dx, dz);
        esfera.center.copy(u.grupo.position); esfera.radius = u.radio;
        const enPantalla = frustum.intersectsSphere(esfera);
        u.visible = dist - u.radio < DIBUJAR_M;
        u.grupo.visible = u.visible;
        u.animando = u.visible && enPantalla && dist - u.radio < ANIMAR_M;
        if (u.animando) { animando++; for (const e of u.emisores) e.avanzar(dt); }
        if (u.agua) {
          if (u.animando) u.agua.tiempo.value += dt;
          const quiere = entorno.calidadActual.agua === "reflejos" && u.visible && dist - u.radio < 60;
          if (quiere) reflejo(u);
          const r = u.agua.reflejo;
          if (r) { r.visible = quiere; u.agua.malla.visible = !quiere; }
        }
        if (u.fuego) { u.fuego.luz = null; if (u.visible) fuegos.push([dist, u]); }
      }
      // fire lights: the nearest fires get the tier's lights (made once, on the first fire)
      const max = LUCES_FUEGO[entorno.nivel];
      if (fuegos.length && luces.length < max) while (luces.length < max) { const l = new THREE.PointLight(0xff8a3a, 0, 14, 2); l.castShadow = false; h.scene.add(l); luces.push(l); }
      fuegos.sort((a, b) => a[0] - b[0]);
      const quedan = luces.slice(0, max);
      for (const [, u] of fuegos) luzPara(u, quedan);
      for (const l of luces) l.intensity = 0;
      for (const [, u] of fuegos) if (u.fuego?.luz) u.fuego.luz.intensity = u.fuego.base * parpadeo(tiempo, u.fuego.semilla) * (u.animando ? 1 : 0.9);
    },
    ocupado(): boolean { return animando > 0; },
    contar(): Cuenta {
      const c: Cuenta = { agua: 0, fuego: 0, humo: 0, polvo: 0, particulas: 0, emisores: 0, luces: 0, animando, reflejos: 0, cargado: true };
      for (const u of todos.values()) {
        const t = String(u.datos.tipo) as "agua" | "fuego" | "humo" | "polvo";
        if (t in c) c[t]++;
        if (!u.visible) continue;
        c.emisores += u.emisores.length;
        for (const e of u.emisores) c.particulas += e.cuantas;
        if (u.agua?.reflejo?.visible) c.reflejos++;
        if (u.fuego?.luz && u.fuego.luz.intensity > 0) c.luces++;
      }
      return c;
    },
  };
}
