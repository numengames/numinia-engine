// graboso (M18b): the relic that records — a head of an electronic bear whose shell is a translucent cloud. A simple
// mesh for v1 (sphere + ears + muzzle + eyes + an antenna with a red pilot light that beats while it records) that stays as the
// FALLBACK; MIS-247: the fine head is a CC0 model of our own, activos/graboso/graboso-cabeza.glb (tools/hacer-graboso.mjs,
// 1.784 triangles, one material, three nodes: `concha` = the cloud shell, `rasgos` = the dark parts, `piloto` = the lamp). It is
// fetched the first time the relic comes out, by its content (MODELO_SHA → /a/<sha>.glb); until it lands, and if it never does
// (offline, a world that serves no house assets), the simple head is what you see. Floats over the right shoulder of whoever invoked
// it, looking where the camera looks. Lazy: packages/render/src/index.ts imports this file only at the first invocation.
import * as THREE from "three/webgpu";

/** `modelo`: the fine head's scene (the page loads /a/<MODELO_SHA>.glb); absent or failing → the simple head stays. */
export type AyudasGraboso = { world: THREE.Group; posicion: () => THREE.Vector3 | null; yaw: () => number; modelo?: (sha: string) => Promise<THREE.Object3D> };

/** The sha256 of activos/graboso/graboso-cabeza.glb (test/graboso-modelo.test.ts checks it; `node tools/hacer-graboso.mjs` prints it). */
export const MODELO_SHA = "6520815e830d36a8f8d489047e439e1c731383e0f00ed01dc28088796e7bdba8";

/** Where it floats, relative to the avatar's feet (m): to the right, a little behind, above the shoulder. */
export const SITIO = { lado: 0.45, atras: 0.25, alto: 1.75 } as const;
export const RADIO_M = 0.2;

/** The cloud: soft blobs on a pale blue-white, painted once on a canvas (no file to serve). Returns null without a 2D context (tests, odd browsers). */
export function pintarNube(lado = 256, semilla = 7): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = lado; c.height = lado;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#dfe9f6"; g.fillRect(0, 0, lado, lado);
  let s = semilla >>> 0 || 1; // tiny xorshift: the same cloud every time, no Math.random in render either
  const azar = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 90; i++) {
    const x = azar() * lado, y = azar() * lado, r = lado * (0.06 + azar() * 0.16);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const claro = azar() > 0.35;
    grad.addColorStop(0, claro ? "rgba(255,255,255,0.55)" : "rgba(150,170,200,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // the circuits glimpsed through the cloud: a few faint traces
  g.strokeStyle = "rgba(90,140,220,0.22)"; g.lineWidth = Math.max(1, lado / 128);
  for (let i = 0; i < 14; i++) {
    const x = azar() * lado, y = azar() * lado, l = lado * (0.1 + azar() * 0.25);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.lineTo(x + l, y + (azar() - 0.5) * l); g.stroke();
  }
  return c;
}

export function crearGraboso(h: AyudasGraboso) {
  const grupo = new THREE.Group(); grupo.visible = false; grupo.name = "graboso";
  const lienzo = pintarNube();
  const nube = new THREE.MeshStandardMaterial({ color: 0xeaf2ff, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
  if (lienzo) { const tex = new THREE.CanvasTexture(lienzo); tex.colorSpace = THREE.SRGBColorSpace; nube.map = tex; }
  const oscuro = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.3, metalness: 0.4 });
  const piloto = new THREE.MeshStandardMaterial({ color: 0x3a1010, emissive: 0xe03030, emissiveIntensity: 0, roughness: 0.4 });

  const craneo = new THREE.Mesh(new THREE.SphereGeometry(RADIO_M, 24, 16), nube);
  const orejaGeo = new THREE.SphereGeometry(RADIO_M * 0.42, 12, 8);
  const orejaI = new THREE.Mesh(orejaGeo, nube), orejaD = new THREE.Mesh(orejaGeo, nube);
  orejaI.position.set(-RADIO_M * 0.75, RADIO_M * 0.8, 0); orejaD.position.set(RADIO_M * 0.75, RADIO_M * 0.8, 0);
  const hocico = new THREE.Mesh(new THREE.SphereGeometry(RADIO_M * 0.45, 12, 8), nube);
  hocico.position.set(0, -RADIO_M * 0.25, -RADIO_M * 0.85); hocico.scale.set(1, 0.75, 0.8); // the face looks toward -z (where the camera looks)
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(RADIO_M * 0.14, 8, 6), oscuro); nariz.position.set(0, -RADIO_M * 0.15, -RADIO_M * 1.25);
  const ojoGeo = new THREE.SphereGeometry(RADIO_M * 0.11, 8, 6);
  const ojoI = new THREE.Mesh(ojoGeo, oscuro), ojoD = new THREE.Mesh(ojoGeo, oscuro);
  ojoI.position.set(-RADIO_M * 0.4, RADIO_M * 0.2, -RADIO_M * 0.88); ojoD.position.set(RADIO_M * 0.4, RADIO_M * 0.2, -RADIO_M * 0.88);
  const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, RADIO_M * 0.7, 6), oscuro); antena.position.set(0, RADIO_M * 1.3, 0);
  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), piloto); luz.position.set(0, RADIO_M * 1.7, 0);
  const sencilla = new THREE.Group(); sencilla.name = "graboso-sencilla"; // the fallback, hidden when the fine head arrives
  sencilla.add(craneo, orejaI, orejaD, hocico, nariz, ojoI, ojoD, antena, luz);
  grupo.add(sencilla);
  h.world.add(grupo);
  // the fine head: its three nodes take the looks above (cloud, dark, pilot), by NAME; whatever the file brings is dropped
  let fina: THREE.Object3D | null = null;
  const hacerFina = (escena: THREE.Object3D): void => {
    const vista = escena.clone(true);
    vista.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const viejo = m.material as THREE.Material; viejo.dispose?.();
      m.material = m.name === "concha" ? nube : m.name === "piloto" ? piloto : oscuro;
    });
    vista.name = "graboso-fina"; fina = vista; sencilla.visible = false; grupo.add(vista);
  };
  if (h.modelo) void h.modelo(MODELO_SHA).then(hacerFina).catch((e) => console.warn(`[graboso] la cabeza fina no se pudo cargar (se queda la sencilla): ${(e as Error)?.message ?? e}`));

  let fuera = false, grabando = false, t = 0, escala = 0;
  return {
    /** Out of the inventory (true) or kept (false); it grows and shrinks over ~0.4 s. */
    mostrar(si: boolean): void { fuera = si; if (si) grupo.visible = true; },
    grabando(si: boolean): void { grabando = si; },
    visible(): boolean { return grupo.visible; },
    /** Which head is on: «fina» (the GLB) or «sencilla» (the fallback) — the e2e leg and the test read it. */
    cabeza(): "fina" | "sencilla" { return fina ? "fina" : "sencilla"; },
    actualizar(dt: number): void {
      if (!grupo.visible) return;
      t += dt;
      escala = Math.max(0, Math.min(1, escala + (fuera ? dt : -dt) / 0.4));
      if (!fuera && escala === 0) { grupo.visible = false; return; }
      const p = h.posicion();
      if (!p) return;
      const yaw = h.yaw(), sen = Math.sin(yaw), cos = Math.cos(yaw);
      // camera forward is (-sin yaw, 0, -cos yaw); right is (cos yaw, 0, -sin yaw)
      grupo.position.set(p.x + cos * SITIO.lado + sen * SITIO.atras, p.y + SITIO.alto + Math.sin(t * 1.7) * 0.03, p.z - sen * SITIO.lado + cos * SITIO.atras);
      grupo.rotation.set(Math.sin(t * 1.1) * 0.06, yaw + Math.sin(t * 0.7) * 0.08, 0, "YXZ");
      const s = 0.2 + 0.8 * escala; grupo.scale.set(s, s, s);
      nube.opacity = 0.55 * escala;
      piloto.emissiveIntensity = grabando ? 1.2 + Math.sin(t * 6) * 0.8 : 0;
    },
    quitar(): void {
      h.world.remove(grupo);
      grupo.traverse((o) => { const g = (o as THREE.Mesh).geometry; g?.dispose(); });
      nube.map?.dispose(); nube.dispose(); oscuro.dispose(); piloto.dispose();
    },
  };
}
export type Graboso3D = ReturnType<typeof crearGraboso>;
