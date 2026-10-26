// ancestros (3D, v1): the Salón de los Ancestros and the hologram of the tribute to Asimov.
// · The hall: each solid wall of the feature's state as a stone box (the same box the simulation holds, so what you
//   see is what stops you), a floor slab under them, and two PANELS on the back wall with the texts the page hands
//   over (the Three Laws on one, our AGW rules on the other: a canvas each, painted once).
// · The hologram: a BUST that evokes and never imitates (pedestal, a cone of light, a head and shoulders of plain
//   geometry in translucent cyan with a wireframe over it), with its notice on the pedestal. It sleeps dim and still;
//   LIT (someone near, the server says) it turns to you and flickers: the only thing here that costs a frame, and only
//   while a lit hologram is within VIVO_M. What it says appears on a plate over its head for a few seconds.
// · The CEILING and the hall's OWN LIGHT (MIS-228): one slab over the walls (one mesh: the hall reads as closed; it lifts out of
//   the way only while you are inside and the camera rides above it) and one dim
//   cyan point light inside, so the bust is told apart by day against a roof-shaded room instead of washing out under the sky.
//   The slab is NOT drawn on the top-down map (`userData.mapa` unset: the map would show a lid, not the room). The light is one
//   light, no shadows, made with the hall and removed with it; the device tier decides (`luz()`, tier D keeps the roof but no
//   extra light — phones must not heat) and its brightness is spent only while you are within LUZ_M of the hall.
// Procedural, no .glb. MIS-200 t_7ed19d06 (fewer pieces: every piece is a draw call per eye in a headset): the walls are ONE mesh (they share
// the stone) and the hologram is THREE (pedestal, the translucent body — cone, shoulders, neck and head as one additive mesh with the cone's
// weaker glow in the vertices — and the wireframe head). Per hall: 1 wall mesh + 1 floor + 1 ceiling + 2 panels (+1 light); per hologram
// 3 meshes (+1 plate while it speaks). Before: 5 + 1 + 1 + 2 and 6.
import * as THREE from "three/webgpu";
import { juntarPiezas, en } from "./junta.ts";

export type Muro3D = { id: string; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
export type Holograma3D = { id: string; nombre: string; x: number; y: number; z: number; rumbo: number; encendido: boolean };
export type Panel3D = { id: string; titulo: string; lineas: string[]; x: number; y: number; z: number; rumbo: number; pie?: string };
/** Beyond this (m) a lit hologram neither turns nor flickers: nothing to draw per frame. */
export const VIVO_M = 40;
/** How long what it said stays over its head (ms). */
export const DICHO_MS = 9000;
/** How fast it turns to you (fraction of the way per second, eased). */
const GIRO = 4;

const COLOR = 0x7fd8ff;
/** Opacity of the hologram's two materials [translucent body, wireframe head], lit and asleep. The cone's weaker glow is its vertex colour. */
const OPACIDAD_ENCENDIDO = [0.32, 0.22] as const, OPACIDAD_APAGADO = [0.12, 0.08] as const;
/** The cone glows this fraction of the bust (it was 0.07 against 0.32 lit, 0.03 against 0.12 asleep). */
const BRILLO_CONO = 0.22;
/** The roof slab: thickness (m) over the top of the walls. */
export const TECHO_GROSOR = 0.3;
/** The hall's light: cyan, dim (candela, like the fire lights' 6), reach (m) and the distance (m) beyond which it is switched to 0. */
export const LUZ_SALA = { color: COLOR, intensidad: 5, alcance: 16, altura: 0.7 } as const;
export const LUZ_M = 70;
function lienzoTexto(titulo: string, lineas: string[], pie: string | undefined, ancho: number, alto: number): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = ancho; c.height = alto;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(12,18,26,0.92)"; g.fillRect(0, 0, ancho, alto);
  g.strokeStyle = "#7fd8ff"; g.lineWidth = 6; g.strokeRect(10, 10, ancho - 20, alto - 20);
  g.fillStyle = "#ffd27a"; g.font = "bold 34px system-ui, sans-serif"; g.textBaseline = "top";
  g.fillText(titulo, 32, 30);
  g.fillStyle = "#eef2f6"; g.font = "26px system-ui, sans-serif";
  const maxW = ancho - 64, lh = 32;
  let y = 90;
  for (const linea of lineas) {
    let fila = "";
    for (const palabra of linea.split(" ")) {
      const prueba = fila ? `${fila} ${palabra}` : palabra;
      if (g.measureText(prueba).width > maxW && fila) { g.fillText(fila, 32, y); y += lh; fila = palabra; } else fila = prueba;
    }
    if (fila) { g.fillText(fila, 32, y); y += lh; }
    y += 14;
  }
  if (pie) { g.fillStyle = "#a9b4c0"; g.font = "italic 20px system-ui, sans-serif"; g.fillText(pie, 32, alto - 44); }
  return c;
}
function placa(c: HTMLCanvasElement, anchoM: number): THREE.Mesh {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(anchoM, (anchoM * c.height) / c.width), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.renderOrder = 5;
  return m;
}

export function crearSalon(h: { world: THREE.Object3D; camara: () => THREE.Camera; /** May the hall carry its own light on this device? (default yes) */ luz?: () => boolean }) {
  type Pared = { d: Muro3D };
  type Holo = { g: THREE.Group; materiales: THREE.MeshBasicMaterial[]; d: Holograma3D; yaw: number; placa: { m: THREE.Mesh; hasta: number } | null };
  const paredes = new Map<string, Pared>(), holos = new Map<string, Holo>(), paneles = new Map<string, THREE.Mesh>();
  let murosMalla: THREE.Mesh | null = null, murosFirma = "";
  let suelo: THREE.Mesh | null = null, techo: THREE.Mesh | null = null, luz: THREE.PointLight | null = null, centro: { x: number; z: number } | null = null, huella: { x0: number; x1: number; z0: number; z1: number } | null = null;
  const vTmp = new THREE.Vector3();
  const piedra = new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.95 });
  const sueloMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.9 });
  const techoMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.95 });
  const quitarTechoYLuz = () => {
    if (techo) { h.world.remove(techo); techo.geometry.dispose(); techo = null; }
    if (luz) { h.world.remove(luz); luz.dispose(); luz = null; }
    centro = null; huella = null;
  };
  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.7, metalness: 0.3 });
  const geoCabeza = new THREE.SphereGeometry(0.24, 18, 14);
  const geoCuello = new THREE.CylinderGeometry(0.09, 0.11, 0.14, 10);
  const geoHombros = new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 0.7);
  const geoCono = new THREE.ConeGeometry(0.55, 1.55, 24, 1, true);
  const geoPedestal = new THREE.CylinderGeometry(0.5, 0.6, 0.5, 20);
  const holoMat = (opacity: number, wire = false, colores = false) => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: wire, side: THREE.DoubleSide, vertexColors: colores });
  /** The translucent body as ONE geometry (cone + shoulders + neck + head, shared by every hologram): the cone glows weaker than the
   * bust (0.07 vs 0.32 of opacity) and that ratio lives in its vertex colour (additive blending multiplies colour by opacity). */
  let geoCuerpo: THREE.BufferGeometry | null = null;
  const cuerpo = (): THREE.BufferGeometry => geoCuerpo ??= juntarPiezas([
    { geo: geoCono, matriz: en(0, 0.5 + 0.775, 0, Math.PI), factor: BRILLO_CONO },
    { geo: geoHombros, matriz: en(0, 1.0, 0), factor: 1 },
    { geo: geoCuello, matriz: en(0, 1.0 + 0.33, 0), factor: 1 },
    { geo: geoCabeza, matriz: en(0, 1.0 + 0.62, 0), factor: 1 },
  ]);

  const crearHolo = (d: Holograma3D): Holo => {
    const g = new THREE.Group(); g.name = `ancestros:${d.id}`; g.userData.mapa = true;
    const pedestal = new THREE.Mesh(geoPedestal, pedestalMat); pedestal.position.y = 0.25; g.add(pedestal);
    const cuerpoM = new THREE.Mesh(cuerpo(), holoMat(0.32, false, true)); cuerpoM.name = "holograma-cuerpo"; g.add(cuerpoM);
    const malla = new THREE.Mesh(geoCabeza, holoMat(0.22, true)); malla.position.y = 1.0 + 0.62; malla.scale.setScalar(1.03); g.add(malla);
    h.world.add(g);
    const materiales = [cuerpoM, malla].map((m) => m.material as THREE.MeshBasicMaterial);
    return { g, materiales, d, yaw: (d.rumbo * Math.PI) / 180, placa: null };
  };
  const apagar = (o: Holo) => { o.materiales.forEach((m, i) => { m.opacity = i === 0 ? OPACIDAD_APAGADO[0] : OPACIDAD_APAGADO[1]; }); };
  const quitarPlaca = (o: Holo) => { if (!o.placa) return; o.g.remove(o.placa.m); ((o.placa.m.material as THREE.MeshBasicMaterial).map as THREE.Texture)?.dispose(); (o.placa.m.material as THREE.MeshBasicMaterial).dispose(); o.placa.m.geometry.dispose(); o.placa = null; };
  const quitarHolo = (o: Holo) => { quitarPlaca(o); h.world.remove(o.g); o.materiales.forEach((m) => m.dispose()); };
  const quitarPanel = (m: THREE.Mesh) => { h.world.remove(m); ((m.material as THREE.MeshBasicMaterial).map as THREE.Texture)?.dispose(); (m.material as THREE.MeshBasicMaterial).dispose(); m.geometry.dispose(); };

  const qTmp = new THREE.Quaternion();
  return {
    /** The walls (boxes in metres) and the floor under them; a wall gone from the list is removed. */
    muros(lista: Muro3D[]): void {
      // the walls are drawn as ONE mesh (same stone): rebuilt only when the list changes
      const firma = JSON.stringify(lista);
      if (firma !== murosFirma || (lista.length > 0) !== !!murosMalla) {
        murosFirma = firma;
        if (murosMalla) { h.world.remove(murosMalla); murosMalla.geometry.dispose(); murosMalla = null; }
        paredes.clear();
        for (const d of lista) paredes.set(d.id, { d });
        if (lista.length) {
          murosMalla = new THREE.Mesh(juntarPiezas(lista.map((d) => ({ geo: new THREE.BoxGeometry(d.x1 - d.x0, d.y1 - d.y0, d.z1 - d.z0), matriz: en((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.z0 + d.z1) / 2) }))), piedra);
          murosMalla.name = "ancestros:muros"; murosMalla.userData.mapa = true;
          h.world.add(murosMalla);
        }
      }
      if (suelo) { h.world.remove(suelo); suelo.geometry.dispose(); suelo = null; }
      quitarTechoYLuz();
      if (!lista.length) return;
      const x0 = Math.min(...lista.map((m) => m.x0)), x1 = Math.max(...lista.map((m) => m.x1)), z0 = Math.min(...lista.map((m) => m.z0)), z1 = Math.max(...lista.map((m) => m.z1));
      suelo = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.04, z1 - z0), sueloMat);
      suelo.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2); suelo.userData.mapa = "suelo";
      h.world.add(suelo);
      // the roof over the walls (one slab, the walls' footprint) and the hall's own light under it
      const alto = Math.max(...lista.map((m) => m.y1)), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      techo = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, TECHO_GROSOR, z1 - z0), techoMat);
      techo.name = "ancestros:techo"; techo.position.set(cx, alto + TECHO_GROSOR / 2, cz); techo.castShadow = true;
      h.world.add(techo);
      centro = { x: cx, z: cz }; huella = { x0, x1, z0, z1 };
      if (h.luz?.() ?? true) {
        luz = new THREE.PointLight(LUZ_SALA.color, LUZ_SALA.intensidad, LUZ_SALA.alcance, 2);
        luz.name = "ancestros:luz"; luz.castShadow = false; luz.position.set(cx, alto - LUZ_SALA.altura, cz);
        h.world.add(luz);
      }
    },
    /** The holograms: lit or not; a lit one turns to you (actualizar). */
    hologramas(lista: Holograma3D[]): void {
      const vivos = new Set(lista.map((d) => d.id));
      for (const [id, o] of holos) if (!vivos.has(id)) { quitarHolo(o); holos.delete(id); }
      for (const d of lista) {
        const o = holos.get(d.id) ?? crearHolo(d); holos.set(d.id, o);
        const encendia = o.d.encendido; o.d = d;
        o.g.position.set(d.x, d.y, d.z);
        if (!d.encendido) { apagar(o); o.yaw = (d.rumbo * Math.PI) / 180; o.g.rotation.y = o.yaw; }
        else if (!encendia) o.materiales.forEach((m, i) => { m.opacity = OPACIDAD_ENCENDIDO[i]; });
      }
    },
    /** The panels with the texts (painted once per id + text; a panel gone from the list is removed). */
    paneles(lista: Panel3D[]): void {
      const vivos = new Set(lista.map((p) => p.id));
      for (const [id, m] of paneles) if (!vivos.has(id)) { quitarPanel(m); paneles.delete(id); }
      for (const p of lista) {
        const firma = JSON.stringify(p), antes = paneles.get(p.id);
        if (antes && antes.userData.firma === firma) continue;
        if (antes) quitarPanel(antes);
        const m = placa(lienzoTexto(p.titulo, p.lineas, p.pie, 640, 800), 2.2);
        m.position.set(p.x, p.y, p.z); m.rotation.y = (p.rumbo * Math.PI) / 180; m.userData.firma = firma; m.userData.mapa = true;
        h.world.add(m); paneles.set(p.id, m);
      }
    },
    /** What a hologram just said: a plate over its head for DICHO_MS. */
    dice(id: string, texto: string, ms = DICHO_MS): void {
      const o = holos.get(id); if (!o) return;
      quitarPlaca(o);
      const m = placa(lienzoTexto("", [texto], undefined, 640, 256), 2.6);
      m.position.y = 2.25; m.renderOrder = 10;
      o.g.add(m);
      o.placa = { m, hasta: performance.now() + ms };
    },
    /** Each frame: a lit hologram within VIVO_M turns to you and flickers; its plate expires. Cheap when none is lit. */
    actualizar(dt: number, self: { x: number; z: number } | null): void {
      const now = performance.now();
      if (centro) { // the light follows the device tier (no recompile storm: one light made/removed) and costs nothing far from the hall
        const quiere = h.luz?.() ?? true;
        if (quiere && !luz && techo) { luz = new THREE.PointLight(LUZ_SALA.color, LUZ_SALA.intensidad, LUZ_SALA.alcance, 2); luz.name = "ancestros:luz"; luz.castShadow = false; luz.position.set(centro.x, techo.position.y - TECHO_GROSOR / 2 - LUZ_SALA.altura, centro.z); h.world.add(luz); }
        else if (!quiere && luz) { h.world.remove(luz); luz.dispose(); luz = null; }
        // the roof lifts out of the way when YOU are inside and the camera rides above it (else the orbit camera would show a lid, not you)
        if (techo && huella) techo.visible = !(self && self.x > huella.x0 && self.x < huella.x1 && self.z > huella.z0 && self.z < huella.z1 && h.camara().getWorldPosition(vTmp).y > techo.position.y - TECHO_GROSOR);
        if (luz && self) luz.intensity = (self.x - centro.x) ** 2 + (self.z - centro.z) ** 2 <= LUZ_M * LUZ_M ? LUZ_SALA.intensidad : 0;
      }
      for (const o of holos.values()) {
        if (o.placa && now > o.placa.hasta) quitarPlaca(o);
        if (!o.d.encendido || !self) continue;
        const dx = self.x - o.d.x, dz = self.z - o.d.z;
        if (dx * dx + dz * dz > VIVO_M * VIVO_M) continue;
        const objetivo = Math.atan2(dx, dz);
        let delta = objetivo - o.yaw; delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        o.yaw += delta * Math.min(1, GIRO * dt);
        o.g.rotation.y = o.yaw;
        const t = now / 1000, parpadeo = 0.86 + 0.1 * Math.sin(t * 23) + 0.04 * Math.sin(t * 61) - (Math.sin(t * 7.3) > 0.97 ? 0.3 : 0); // a soft shimmer and a rare dip
        o.materiales.forEach((m, i) => { m.opacity = OPACIDAD_ENCENDIDO[i] * parpadeo; });
        if (o.placa) { o.placa.m.quaternion.copy(h.camara().quaternion).premultiply(qTmp.copy(o.g.quaternion).invert()); }
      }
    },
    /** True while something here moves: a lit hologram near you, or a plate that has not expired. */
    ocupado(self: { x: number; z: number } | null): boolean {
      for (const o of holos.values()) {
        if (o.placa) return true;
        if (o.d.encendido && self && (self.x - o.d.x) ** 2 + (self.z - o.d.z) ** 2 <= VIVO_M * VIVO_M) return true;
      }
      return false;
    },
    /** For checks: what is drawn now, and the yaw (degrees) of a hologram. */
    contar(): { muros: number; techo: boolean; luz: boolean; hologramas: number; paneles: number; encendidos: number; placas: number } {
      return { muros: paredes.size, techo: !!techo, luz: !!luz, hologramas: holos.size, paneles: paneles.size, encendidos: [...holos.values()].filter((o) => o.d.encendido).length, placas: [...holos.values()].filter((o) => !!o.placa).length };
    },
    rumboDe(id: string): number | null { const o = holos.get(id); return o ? (o.yaw * 180) / Math.PI : null; },
  };
}
