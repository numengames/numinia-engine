// dardos duel in AR (AR-D3): wraps the wall board of crearDianaAR (dardos.ts) with
// · a 3D scoreboard above the board (one plane, one canvas texture, repainted only when the match changes),
// · the rival's darts flying in (a short arc from the side/top) before they stick,
// · turn gating: a press / release does nothing unless it is my live turn (the power bar never fills out of turn),
// · a clean exit: the end of the AR session leaves the match so the rival is not left hanging.
// A session that did not join a duel board (`activo()` false) behaves exactly as v1. The pure parts are in
// dardos-duelo.ts (tested without a screen). All new code lives here so the wall board's own file stays untouched.
import * as THREE from "three/webgpu";
import { RADIO_M, PINTADA } from "./diana.ts";
import type { DianaAR, Dardo3D } from "./dardos.ts";
import { enBoton, rectBoton, llegadas, panelDe, panelUnirse, pintarPanel, puedeLanzar, PANEL_PX, salidaRival, vueloRival, VUELO_RIVAL_S } from "./dardos-duelo.ts";
import type { Panel } from "./dardos-duelo.ts";
import type { DueloV, P3 } from "./dardos-duelo.ts";

export type OpcionesDuelo = {
  /** The controller's `dardos.duelo()`. */
  duelo(): DueloV | null;
  /** My entity (the darts of anyone else fly in). */
  yo(): number;
  /** True while this AR session joined a duel board; false = v1, nothing changes. */
  activo(): boolean;
  /** Rounds of the board (for «Ronda r/N»). */
  rondas(): number;
  /** Leave the match (the controller's `dardos.salir()`). */
  salir(): void;
  /** v3: the panel's button was pressed (the AR ray hit «Cambiar turno» / «Empezar» / R4: «Unirme a la partida»). */
  boton?(que: "empezar" | "cambiar" | "unirse"): void;
  /** R4: the name of the remote board this wall board could join right now (it is in no match and one is free), or null. */
  unirse?(): string | null;
};
export type DianaDueloAR = DianaAR & {
  /** Call when `duelo()` changed (`alCambiar("duelo")`): repaints the panel. */
  refrescar(): void;
  /** For tests and the e2e: the panel's state and the darts in flight. */
  duelo(): { visible: boolean; pie: string; volando: number; boton: "empezar" | "cambiar" | "unirse" | null;
    /** world position of the button's centre (for the e2e to aim the controller at), or null without a button */ puntoBoton: { x: number; y: number; z: number } | null };
  /** For tests and the e2e: press the panel's button as the ray would (true if there was one). */
  pulsarBoton(): boolean;
};

/** A light dart for the flight (the stuck ones are the board's own mesh): tip at the origin, pointing along -z. */
function dardoVuelo(): THREE.Group {
  const g = new THREE.Group();
  const gris = new THREE.MeshStandardMaterial({ color: 0x8a94a3, roughness: 0.5, metalness: 0.2 });
  const naranja = new THREE.MeshStandardMaterial({ color: 0xe07a3f, roughness: 0.6 });
  const barril = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.07, 8).rotateX(Math.PI / 2).translate(0, 0, 0.035), gris);
  const alas = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.0008, 0.035).translate(0, 0, 0.125), naranja);
  g.add(barril, alas);
  return g;
}

export function envolverDuelo(j: DianaAR, o: OpcionesDuelo): DianaDueloAR {
  // the board group (position, turn, visible once placed) is the first Group of the game's root
  const diana = (j.root.children.find((c) => c.type === "Group") ?? j.root) as THREE.Object3D;
  const lienzo = document.createElement("canvas"); lienzo.width = PANEL_PX.w; lienzo.height = PANEL_PX.h;
  const ctx = lienzo.getContext("2d")!;
  const textura = new THREE.CanvasTexture(lienzo); textura.colorSpace = THREE.SRGBColorSpace;
  const ancho = 0.64, alto = ancho * (PANEL_PX.h / PANEL_PX.w);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ map: textura, transparent: true }));
  panel.position.set(0, RADIO_M * PINTADA + 0.04 + alto / 2, 0.03); panel.visible = false; diana.add(panel);
  let pie = "", actual: Panel | null = null;
  const refrescar = (): void => {
    const d = o.duelo(), libre = d ? null : o.unirse?.() ?? null; // in no match (never sat, or the result went): a free remote board offers the seat
    const p = !d && libre ? panelUnirse(libre) : panelDe(d, o.rondas());
    actual = p; pie = p.pie; pintarPanel(ctx, p, true); textura.needsUpdate = true;
    panel.visible = (o.activo() || p.boton === "unirse") && p.fase !== "nada";
  };

  // ---- the rival's darts: fly in, then stick (the board's own mesh takes over) ----
  type Vuelo = { k: string; d: Dardo3D; mesh: THREE.Group; a: P3; b: P3; t0: number };
  const vuelos = new Map<string, Vuelo>();
  const vistos = new Set<string>();
  let ultima: Dardo3D[] = [];
  const ahora = () => performance.now() / 1000;
  const clave = (x: Dardo3D) => `${x.quien}:${x.numero}`;
  const reenviar = () => j.clavados(ultima.filter((x) => !vuelos.has(clave(x))));
  const rc = new THREE.Raycaster();
  /** Is the ray on the panel's button? (the plane is hit, its uv becomes canvas px) */
  const sobreBoton = (rayo: { origen: THREE.Vector3; dir: THREE.Vector3 } | undefined, cam: THREE.Camera): boolean => {
    if (!panel.visible || !actual?.boton) return false;
    const d = new THREE.Vector3(); cam.getWorldDirection(d);
    const r = rayo ?? { origen: new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld), dir: d };
    panel.updateWorldMatrix(true, false);
    rc.set(r.origen, r.dir);
    const hit = rc.intersectObject(panel, false)[0];
    return !!hit?.uv && enBoton(actual, hit.uv.x * PANEL_PX.w, (1 - hit.uv.y) * PANEL_PX.h);
  };
  const apretar = (): boolean => { if (!actual?.boton || !panel.visible) return false; o.boton?.(actual.boton); return true; };
  let traguePulsacion = false;
  const tope = new THREE.Vector3(), dir = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, -1);

  return {
    ...j,
    refrescar,
    pulsar(rayo, cam) {
      if (j.estado().fase === "colocada" && sobreBoton(rayo, cam)) { traguePulsacion = true; apretar(); return; } // the button, not a throw
      if (j.estado().fase === "colocada" && !puedeLanzar(o.duelo(), o.activo())) return; // not my turn: no power bar
      j.pulsar(rayo, cam);
    },
    soltar(rayo, cam) {
      if (traguePulsacion) { traguePulsacion = false; return; }
      if (j.estado().fase === "colocada" && !puedeLanzar(o.duelo(), o.activo())) return;
      j.soltar(rayo, cam);
    },
    update(dt, cam) {
      j.update(dt, cam);
      if (vuelos.size === 0) return;
      let fin = false;
      for (const [k, v] of vuelos) {
        const r = vueloRival(v.a, v.b, ahora() - v.t0);
        v.mesh.position.set(r.pos.x, r.pos.y, r.pos.z);
        // point along the path (tip first)
        dir.set(v.b.x - v.a.x, v.b.y - v.a.y, v.b.z - v.a.z).normalize(); tope.copy(Z);
        v.mesh.quaternion.setFromUnitVectors(tope, dir);
        if (r.lista) { diana.remove(v.mesh); vuelos.delete(k); fin = true; }
      }
      if (fin) reenviar();
    },
    fin() {
      j.fin();
      for (const v of vuelos.values()) diana.remove(v.mesh);
      vuelos.clear(); vistos.clear();
      if (o.activo()) o.salir(); // the rival is not left hanging
    },
    clavados(lista) {
      ultima = lista;
      const nuevos = llegadas(vistos, lista, o.yo()); // always: the darts seen before joining never fly in
      if (!o.activo()) { j.clavados(lista); return; } // v1
      for (const k of [...vuelos.keys()]) if (!lista.some((x) => clave(x) === k)) { diana.remove(vuelos.get(k)!.mesh); vuelos.delete(k); } // its turn ended meanwhile
      for (const x of nuevos) {
        const mesh = dardoVuelo(); diana.add(mesh);
        const s = salidaRival(x.x, x.y, x.numero, RADIO_M);
        vuelos.set(clave(x), { k: clave(x), d: x, mesh, a: s, b: { x: x.x * RADIO_M, y: x.y * RADIO_M, z: 0.012 }, t0: ahora() });
        mesh.position.set(s.x, s.y, s.z);
      }
      reenviar();
    },
    duelo: () => {
      let puntoBoton: { x: number; y: number; z: number } | null = null;
      if (panel.visible && actual?.boton) {
        const r = rectBoton(actual.filas.length);
        diana.updateWorldMatrix(true, true);
        const w = panel.localToWorld(new THREE.Vector3(((r.x + r.w / 2) / PANEL_PX.w - 0.5) * ancho, (0.5 - (r.y + r.h / 2) / PANEL_PX.h) * alto, 0));
        puntoBoton = { x: w.x, y: w.y, z: w.z };
      }
      return { visible: panel.visible, pie, volando: vuelos.size, boton: actual?.boton ?? null, puntoBoton };
    },
    pulsarBoton: apretar,
  };
}
export { VUELO_RIVAL_S };
