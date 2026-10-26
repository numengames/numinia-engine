// pintar-vr (J18b, MIS-222 t_1b395abe; MENU-MUNECA-Y-PINTURA-VR.md §3.1, story 4 of §3.7, second slice): paint with the hand in VR.
// The VR menu's «Construir → Pintar con el mando» turns the mode on (`entrar`). Then the RIGHT hand is the brush (the left keeps the watch and the menu):
//   · controller: TRIGGER held = paint from the tip of the controller (where its ray starts); how hard it is pressed swells the line ±40 % (pressure);
//   · tracked hand: PINCH held = paint from the point between thumb and index, one fixed width (a tracked hand has no pressure);
//   · letting go of the trigger saves the stroke (pintar.ts: PUT /a/<sha>.trazo + colocar) and the other people see it as any placed object;
//   · B while painting throws that stroke away (nothing reaches the server); B with the hand free leaves the mode, like the builder's.
// While the trigger is down you see a live tube under the hand (packages/render/src/trazo-vivo.ts: one mesh, one draw call, the same generator
// the world uses to draw the saved stroke). Between strokes you see just the brush tip in the colour about to be used. The brush holds that hand
// (`manos.ocupar`): no ray, nothing to take, no pinch-walk with it. The numbers are pincel.ts's: a control point every 1.5 cm or 10° of turn, 600 at most
// (the stroke then closes by itself and the next one starts where it ended). The palette (story 5) comes next: until then colour 2 and 1.5 cm,
// changeable from code with `ajustar`. Nothing here decides anything: the server places the stroke, or says why not (permission to build).
import { GROSORES_M, opcionesValidas, type Opciones } from "./pincel.ts";
import type { Pintar } from "./pintar.ts";

type Lado = "izq" | "der";
type Res = { ok: true } | { ok: false; why: string };
type Q = readonly [number, number, number, number];
type Vivo = {
  marcar(p: readonly number[] | null, color?: number, grosor?: number): void; empezar(color: number, grosor: number): void; anadir(q: readonly number[]): void;
  seguir(q: readonly number[]): void; terminar(guardado?: Promise<unknown>): void; cancelar(): void; apagar(): void;
};
export type VistaPintarVR = {
  vr: { active: boolean; nota?(t: string): void; onAtras?(fn: () => void): unknown; menu?: { readonly abierto: boolean } };
  manos: { pincel(l: Lado): { x: number; y: number; z: number; gatillo: number; mano: boolean } | null; vibrar(l: Lado, v?: number, ms?: number): void; ocupar(nombre: string, fn: (l: Lado) => boolean): () => void };
  pincelVR: { cargar(): Promise<Vivo>; cadaCuadro(fn: (dt: number) => void): () => void };
};

/** Trigger levels: closing above, opening below (hysteresis, so a trembling finger does not cut the line). */
export const CIERRA = 0.6, ABRE = 0.3;
/** A tap that moved less than this (m) is a slip of the finger, not a line: it is dropped without a word. */
export const RECORRIDO_MIN_M = 0.01;
export const NOTA_ENTRAR = "Pintar: aprieta el gatillo derecho y mueve la mano. B: tirar el trazo o dejar de pintar.";
export const NOTA_DEJADO = "Has dejado de pintar.";
export const NOTA_TIRADO = "Trazo tirado.";

/** The trigger's value as the line's pressure: 0 at the opening level, 1 fully down (a tracked hand: 0.5, the neutral width). */
export const presionDe = (gatillo: number, mano: boolean): number => (mano ? 0.5 : Math.min(1, Math.max(0, (gatillo - ABRE) / (1 - ABRE))));

export function montarPintarVR(o: { pintar: Pintar; view: VistaPintarVR; puede(): boolean; lado?: Lado }) {
  const { pintar, view } = o, lado: Lado = o.lado ?? "der";
  let modo = false, pintando = false, bloqueado = false, vivo: Vivo | null = null, carga: Promise<void> | null = null;
  let op: Opciones = { color: 2, grosor: GROSORES_M[1] };
  let inicio: { x: number; y: number; z: number } | null = null, recorrido = 0;
  const cuenta = { trazos: 0, tirados: 0, ultimaPresion: 0 };

  view.manos.ocupar("pintar", (l) => modo && l === lado);
  const cargar = (): void => { carga ??= view.pincelVR.cargar().then((v) => { vivo = v; if (!modo) v.apagar(); }, () => { carga = null; }); };

  function tirar(): void { pintar.cancelar(); vivo?.cancelar(); pintando = false; inicio = null; }
  function apagar(): void { if (pintando) tirar(); modo = false; bloqueado = false; vivo?.apagar(); }
  function empezar(h: { x: number; y: number; z: number }, q: Q): void {
    const r = pintar.empezar(op);
    if (!r.ok) { bloqueado = true; return; } // pintar.ts already told why (no permission…); wait for the trigger to open before trying again
    pintando = true; inicio = { x: h.x, y: h.y, z: h.z }; recorrido = 0;
    vivo?.empezar(op.color, op.grosor);
    mover(h, q);
    view.manos.vibrar(lado, 0.25, 20);
  }
  function mover(h: { x: number; y: number; z: number }, q: Q): void {
    const r = pintar.punto({ x: q[0], y: q[1], z: q[2], presion: q[3] });
    if (!r.ok) return;
    if (inicio) recorrido = Math.max(recorrido, Math.hypot(h.x - inicio.x, h.y - inicio.y, h.z - inicio.z));
    if (r.r === "primero" || r.r === "añadido") vivo?.anadir(q);
    else if (r.r === "lleno") { // the 600th point: pintar.ts sent that stroke and began another at this same place; the live tube does the same
      vivo?.anadir(q); vivo?.terminar(); vivo?.empezar(op.color, op.grosor); vivo?.anadir(q);
      cuenta.trazos++; view.manos.vibrar(lado, 0.4, 30);
    }
    vivo?.seguir(q);
  }
  function soltar(): void {
    pintando = false;
    if (recorrido < RECORRIDO_MIN_M) { pintar.cancelar(); vivo?.cancelar(); inicio = null; cuenta.tirados++; return; } // a slip of the finger
    inicio = null;
    const guardado = pintar.soltar();
    vivo?.terminar(guardado);
    cuenta.trazos++;
    view.manos.vibrar(lado, 0.5, 40);
    void guardado.then((r) => { if (!r.ok) view.vr.nota?.(`No se pudo pintar: ${r.why}`); });
  }

  function cuadro(): void {
    if (!modo) return;
    if (!view.vr.active || !o.puede()) { apagar(); return; } // left VR, or lost the role: the mode ends with it
    const h = view.manos.pincel(lado);
    if (!h) { if (pintando) soltar(); return; } // the hand went out of tracking: what was painted is kept
    const gat = h.gatillo, p = presionDe(gat, h.mano), q: Q = [h.x, h.y, h.z, p];
    if (!pintando) {
      if (bloqueado && gat < ABRE) bloqueado = false;
      vivo?.marcar([h.x, h.y, h.z], op.color, op.grosor);
      if (!bloqueado && !view.vr.menu?.abierto && gat >= CIERRA) empezar(h, q);
    } else if (gat < ABRE || view.vr.menu?.abierto) soltar();
    else { cuenta.ultimaPresion = p; mover(h, q); }
  }
  view.pincelVR.cadaCuadro(cuadro);

  // B (right) is «back» everywhere in VR: with a stroke under the hand it throws that stroke away (the trigger may still be down: no new stroke
  // until it opens); with the hand free it leaves the mode. The menu's own B (closing it) comes first: vr.ts calls these only when no menu was open.
  view.vr.onAtras?.(() => {
    if (!modo) return;
    if (pintando) { tirar(); bloqueado = true; cuenta.tirados++; view.vr.nota?.(NOTA_TIRADO); } else { apagar(); view.vr.nota?.(NOTA_DEJADO); }
  });

  return {
    activo: (): boolean => modo,
    /** Turn the brush on (the VR menu's «Pintar con el mando»); refused outside VR or without the role to build. */
    entrar(): Res {
      if (!view.vr.active) return { ok: false, why: "Pintar con el mando solo funciona dentro de VR." };
      if (!o.puede()) return { ok: false, why: "No tienes permiso para construir en este mundo, y pintar es construir." };
      modo = true; bloqueado = true; cargar(); // blocked until the trigger opens: the press that chose the menu's row must not start a line
      return { ok: true };
    },
    salir: apagar,
    /** Colour 0–7 (the engine palette) and thickness in metres (0.003–0.06); the palette page (story 5) will call this. */
    ajustar(nuevo: Opciones): Res {
      const v = opcionesValidas(nuevo);
      if (!v) return { ok: false, why: "color de 0 a 7 y grosor en metros" };
      if (pintando) return { ok: false, why: "espera a soltar el trazo" };
      op = v; return { ok: true };
    },
    opciones: (): Opciones => ({ ...op }),
    /** For checks. */
    estado: () => ({ modo, pintando, bloqueado, opciones: { ...op }, recorrido, ...cuenta, pintar: pintar.estado() }),
    parar(): void { apagar(); },
  };
}
export type PintarVR = ReturnType<typeof montarPintarVR>;
