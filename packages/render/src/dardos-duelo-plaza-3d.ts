// dardos duel in the plaza (AR-D4), the 3D side: a scoreboard sign (one plane, one canvas texture) above the board of
// THAT duel, and the short arc of the darts the remote player throws. It hangs from the 3D boards of dardos.ts through
// the three small handles `crearDianas3D` returns (grupo, malla, alFotograma); ordinary boards are never touched.
// The pure parts (text, tag, when to fly) are in dardos-duelo-plaza.ts and dardos-duelo.ts.
import * as THREE from "three/webgpu";
import { ALTURA_M, PINTADA, RADIO_M } from "./diana.ts";
import { ESCALA_PLAZA } from "./dardos.ts";
import type { Dardo3D } from "./dardos.ts";
import { llegadas, vueloRival } from "./dardos-duelo.ts";
import type { DueloV, P3 } from "./dardos-duelo.ts";
import { LETRERO_PX, claveLetrero, debeVolar, destinoPlaza, letreroDe, pintarLetrero, salidaPlaza } from "./dardos-duelo-plaza.ts";

/** What `crearDianas3D` offers (see dardos.ts): a board's group and face, one stuck dart's mesh, and a per-frame hook. */
export type PlazaDianas = {
  grupo(id: string): { g: THREE.Group; face: THREE.Group } | null;
  malla(id: string, quien: number, numero: number): THREE.Object3D | null;
  alFotograma(fn: (dt: number) => void): () => void;
};

export function crearLetreroPlaza(p: PlazaDianas) {
  const lienzo = document.createElement("canvas"); lienzo.width = LETRERO_PX.w; lienzo.height = LETRERO_PX.h;
  const ctx = lienzo.getContext("2d")!;
  const textura = new THREE.CanvasTexture(lienzo); textura.colorSpace = THREE.SRGBColorSpace;
  const ancho = 1.5, alto = ancho * (LETRERO_PX.h / LETRERO_PX.w);
  const letrero = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ map: textura, transparent: true }));
  letrero.name = "dardos:letrero"; letrero.visible = false;
  const sobre = ALTURA_M * 1.15 + RADIO_M * PINTADA * ESCALA_PLAZA + 0.1 + alto / 2; // just above the board's rim
  letrero.position.set(0, sobre, 0.12);
  let sitio = "", clave = "", repintados = 0, ultimo: DueloV | null = null;

  const mostrar = (d: DueloV | null, rondas: number): void => {
    const l = letreroDe(d, rondas), g = d && l.panel.fase !== "nada" ? p.grupo(d.sitio) : null;
    if (!g || !d) { letrero.visible = false; sitio = ""; return; }
    if (letrero.parent !== g.g) g.g.add(letrero); // the board's group was rebuilt, or it is another board
    sitio = d.sitio; letrero.visible = true;
    const k = claveLetrero(l);
    if (k !== clave) { clave = k; pintarLetrero(ctx, l); textura.needsUpdate = true; repintados++; } // only when the duel changed
  };

  // ---- the remote player's darts: a short arc from above-left before they stick ----
  type Vuelo = { m: THREE.Object3D; a: P3; b: P3; pos: THREE.Vector3; rot: THREE.Euler; t0: number };
  const vistos = new Set<string>(), pendientes: { x: Dardo3D; t: number }[] = [], vuelos: Vuelo[] = [];
  const Z = new THREE.Vector3(0, 0, -1), dir = new THREE.Vector3();
  const ahora = (): number => performance.now();
  const quitar = p.alFotograma(() => {
    const t = ahora();
    for (let i = pendientes.length - 1; i >= 0; i--) { // the stuck mesh exists once the view took the list; start its flight then
      const { x, t: visto } = pendientes[i], m = p.malla(x.sitio, x.quien, x.numero);
      if (m) {
        const a = salidaPlaza(x.x, x.y), b = destinoPlaza(x.x, x.y);
        vuelos.push({ m, a, b, pos: new THREE.Vector3(b.x, b.y, b.z), rot: m.rotation.clone(), t0: t }); pendientes.splice(i, 1);
      } else if (t - visto > 1000) pendientes.splice(i, 1);
    }
    for (let i = vuelos.length - 1; i >= 0; i--) {
      const v = vuelos[i];
      if (!v.m.parent) { vuelos.splice(i, 1); continue; } // its turn ended meanwhile
      const r = vueloRival(v.a, v.b, (t - v.t0) / 1000);
      if (r.lista) { v.m.position.copy(v.pos); v.m.rotation.copy(v.rot); vuelos.splice(i, 1); continue; }
      v.m.position.set(r.pos.x, r.pos.y, r.pos.z);
      dir.set(v.b.x - v.a.x, v.b.y - v.a.y, v.b.z - v.a.z).normalize(); v.m.quaternion.setFromUnitVectors(Z, dir);
    }
  });

  return {
    /** Call when `duelo()` changed (or the boards did): shows, hides and repaints the sign of that board. */
    duelo(d: DueloV | null, rondas: number): void { ultimo = d; mostrar(d, rondas); },
    /** Call with the controller's darts after they changed: the new ones of a remote player in a live duel will fly in. */
    llegan(lista: Dardo3D[], d: DueloV | null): void {
      const t = ahora();
      for (const x of llegadas(vistos, lista, -1)) if (debeVolar(d, x, t)) pendientes.push({ x, t });
    },
    /** For tests and the e2e. */
    estado: () => ({ visible: letrero.visible, sitio, repintados, volando: vuelos.length + pendientes.length, duelo: ultimo }),
    lienzo,
    quitar() { quitar(); letrero.removeFromParent(); },
  };
}
