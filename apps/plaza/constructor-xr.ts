// M22b-3, first slice: the builder's hands in VR with a controller ray (no TransformControls — Hyperfy's way, not
// Blender's gizmo). A short trigger on a placed thing selects it (same selection constructor.ts and the gizmo use);
// holding the trigger past PRENSION_MS on the thing already selected takes it at the far end of the ray — it follows
// the ray's point (on the ground or on another thing) until the trigger lets go, which drops it (one undo step, like
// every other drag: programarEnvio / terminarEnvio below send it, same cadence as constructor.ts). Squeeze on the
// selection (not while holding) duplicates it, like Shift+D on the desktop. Everything goes through
// features/objetos/client.ts: the server decides, as always (R-1).
// v2 paridad: like the computer's «Construir» button, the hands only build once the mode is on — the VR menu's «Construir»
// turns it on (`entrar`); «Dejar de construir» or leaving VR turns it off. Tracked hands are not read here yet (M22b-4); a
// delete button needs a face/panel to press (J18's wrist menu, or a wrist panel row) — out of this slice, see
// docs/BACKLOG.md M22b-3/M22b-4 and PROGRESO-M22b3.md.
import type { Donde } from "../../packages/render/src/index.ts";
import type { AccionFichaVR, DatosFichaVR } from "../../packages/render/src/vr-ficha.ts"; // types only
import { aplicarAccionVR, datosFicha, fichaVisible } from "./ficha-objeto.ts";
import type { VerbosFicha } from "./ficha-objeto.ts";

type Res = { ok: true } | { ok: false; why: string };
type Obj = Record<string, unknown> & { id: string };
type Lado = "izq" | "der";
const LADOS: Lado[] = ["der", "izq"];
type Builder = Partial<VerbosFicha> & {
  estado: { puede: boolean; seleccionado: string };
  objeto(id: string): Obj | null;
  seleccionar(id: string): Res;
  transformar(id: string, t: Partial<Donde>, lote?: string): Res;
  duplicar(): Res;
  escuchar?(fn: (que: string) => void): () => void;
};
type Rayo = { origen: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } };
type Manos = {
  rayoDe(lado: Lado): Rayo | null;
  entrada(lado: Lado): { gatillo: number; agarre: number; mano: boolean } | null;
  vibrar(lado: Lado, v?: number, ms?: number): void;
  estado?(): Record<Lado, { apunta: string | null } | null>;
};
type Editor = {
  pickRayo(origen: Rayo["origen"], dir: Rayo["dir"]): string | null;
  puntoBajoRayo(origen: Rayo["origen"], dir: Rayo["dir"], ignorar?: string): { x: number; y: number; z: number } | null;
  dondeEsta(key: string): Donde | null;
  poner(key: string, d: Partial<Donde>): void;
  sostener(key: string | null, final?: Donde): void;
};
type Vista = { vr: { active: boolean; nota?(t: string): void; ficha?(d: DatosFichaVR | null): void; onFicha?(fn: (a: AccionFichaVR) => void): unknown; onAtras?(fn: () => void): unknown }; editor: Editor; manos?: Manos };
/** v13: what the notes say about leaving, so nobody is left inside the mode without knowing the way out. */
export const NOTA_SIGUES = "Ficha cerrada. Sigues construyendo: B para dejar de construir.";
export const NOTA_DEJADO = "Has dejado de construir.";

/** Held past this long (ms) on the already-selected thing: it is taken at the ray's end, not just re-selected. */
export const PRENSION_MS = 180;
const ENVIO_MS = 125;
const VIVO_MS = 500;

export function montarConstructorVR(c: Builder, view: Vista) {
  const cogido: Record<Lado, { key: string; desfase: { x: number; z: number } } | null> = { izq: null, der: null };
  const gatilloAntes: Record<Lado, boolean> = { izq: false, der: false };
  const agarreAntes: Record<Lado, boolean> = { izq: false, der: false };
  const gatilloDesde: Record<Lado, number> = { izq: 0, der: 0 };
  let envio: { key: string; ultimo: number; pendiente: boolean; reloj: ReturnType<typeof setInterval> } | null = null;

  const enviarYa = (): Donde | null => {
    if (!envio) return null;
    const d = view.editor.dondeEsta(envio.key);
    if (d) c.transformar(envio.key, d);
    envio.ultimo = performance.now(); envio.pendiente = false;
    return d;
  };
  const programarEnvio = (key: string) => {
    if (envio && envio.key !== key) terminarEnvio();
    envio ??= { key, ultimo: -Infinity, pendiente: false, reloj: setInterval(() => { if (envio && (envio.pendiente || performance.now() - envio.ultimo >= VIVO_MS)) enviarYa(); }, ENVIO_MS) };
    envio.pendiente = true;
    if (performance.now() - envio.ultimo >= ENVIO_MS) enviarYa();
  };
  const terminarEnvio = (): Donde | null => {
    if (!envio) return null;
    const d = enviarYa();
    clearInterval(envio.reloj); envio = null;
    return d;
  };
  function soltar(lado: Lado): void {
    if (!cogido[lado]) return;
    cogido[lado] = null;
    const final = terminarEnvio();
    view.editor.sostener(null, final ?? undefined);
  }

  // C5: the object card as a panel in front of you — only for someone who may build, in VR (where picking with the ray IS the edit
  // mode: the HTML builder is not open in a headset) and with an object selected. The server still decides every action.
  let firmaFicha = "";
  let modo = false; // v2 paridad: «Construir» pressed in the VR menu
  function fichaVR(): void {
    const o = modo && view.vr.active && c.estado.puede && c.estado.seleccionado ? c.objeto(c.estado.seleccionado) : null;
    const ver = !!o && fichaVisible(c.estado.puede, view.vr.active, o.id);
    const d: DatosFichaVR | null = ver ? { titulo: datosFicha(o!).titulo, anclado: o!.fijado === true } : null;
    const f = d ? `${o!.id}|${d.titulo}|${d.anclado}` : "";
    if (f === firmaFicha) return;
    firmaFicha = f; view.vr.ficha?.(d);
  }
  view.vr.onFicha?.((a) => {
    if (!c.estado.puede || !view.vr.active) return;
    const { res, dicho } = aplicarAccionVR(c as VerbosFicha, a);
    view.vr.nota?.(a === "cerrar" && res.ok ? NOTA_SIGUES : dicho);
    if (res.ok) view.manos?.vibrar("der", 0.4, 30);
  });
  // v13: B (right) is «back» everywhere else in VR; here it leaves the mode in one press — lets go of what a hand holds, drops the
  // selection (the card goes with it) and puts the rays back to the world. The menu's own B (closing it) comes first: vr.ts only
  // calls these listeners when no menu was open.
  view.vr.onAtras?.(() => { if (modo) { dejar(); view.vr.nota?.(NOTA_DEJADO); } });
  function cuadro(): void {
    if (modo && (!view.vr.active || !c.estado.puede)) { modo = false; if (c.estado.seleccionado) c.seleccionar(""); } // left VR, or lost the role: the mode ends with it, and the selection does not stay behind
    fichaVR();
    if (!modo || !view.vr.active || !c.estado.puede) {
      for (const l of LADOS) { soltar(l); gatilloAntes[l] = agarreAntes[l] = false; gatilloDesde[l] = 0; }
      return;
    }
    const m = view.manos;
    if (!m) return;
    for (const lado of LADOS) {
      const en = m.entrada(lado);
      if (!en) { soltar(lado); gatilloAntes[lado] = agarreAntes[lado] = false; gatilloDesde[lado] = 0; continue; }
      const gatillo = en.gatillo > 0.5, agarre = en.agarre > 0.6;
      // a ray on ANY panel (the card, the menu, the watch) is for its buttons (manos.ts presses them), not for the thing behind it
      const rayo = m.estado?.()[lado]?.apunta?.startsWith("panel:") ? null : m.rayoDe(lado);
      if (cogido[lado]) {
        if (!gatillo || c.estado.seleccionado !== cogido[lado]!.key) { soltar(lado); } else if (rayo) { // v13: «Cerrar» (other hand) or B lets it go
          const p = view.editor.puntoBajoRayo(rayo.origen, rayo.dir, cogido[lado]!.key);
          if (p) { view.editor.poner(cogido[lado]!.key, { x: p.x + cogido[lado]!.desfase.x, y: p.y, z: p.z + cogido[lado]!.desfase.z }); programarEnvio(cogido[lado]!.key); }
        }
      } else {
        const key = rayo ? view.editor.pickRayo(rayo.origen, rayo.dir) : null;
        if (gatillo && !gatilloAntes[lado]) { // trigger just pressed: select what the ray points at
          gatilloDesde[lado] = performance.now();
          if (key) { c.seleccionar(key); m.vibrar(lado, 0.5, 40); }
        } else if (gatillo && gatilloDesde[lado] && performance.now() - gatilloDesde[lado] >= PRENSION_MS && key && key === c.estado.seleccionado && rayo) {
          const antes = view.editor.dondeEsta(key), p0 = view.editor.puntoBajoRayo(rayo.origen, rayo.dir, key);
          if (antes && p0) {
            cogido[lado] = { key, desfase: { x: antes.x - p0.x, z: antes.z - p0.z } };
            view.editor.sostener(key);
            m.vibrar(lado, 0.6, 60);
            view.vr.nota?.(`${String(c.objeto(key)?.nombre ?? "objeto")} cogido: suelta el gatillo para posarlo.`);
          }
        }
        if (!gatillo) gatilloDesde[lado] = 0;
        // squeeze on the selection (not while holding it): duplicate, like Shift+D on the desktop
        if (agarre && !agarreAntes[lado] && key && key === c.estado.seleccionado) {
          const r = c.duplicar();
          view.vr.nota?.(r.ok ? "Duplicado: apúntalo y mantén el gatillo para moverlo." : `No: ${r.why}`);
          if (r.ok) m.vibrar(lado, 0.6, 60);
        }
      }
      gatilloAntes[lado] = gatillo; agarreAntes[lado] = agarre;
    }
  }
  function dejar(): void { modo = false; for (const l of LADOS) { soltar(l); gatilloAntes[l] = agarreAntes[l] = false; gatilloDesde[l] = 0; } if (c.estado.seleccionado) c.seleccionar(""); fichaVR(); }
  const reloj = setInterval(cuadro, 1000 / 60);

  return {
    /** Whether the hands are building now (the VR menu's «Construir»). */
    activo: (): boolean => modo,
    /** Turns the builder's hands on (the VR menu's «Construir → Empezar»); refused outside VR or without the role. */
    entrar(): Res {
      if (!view.vr.active) return { ok: false, why: "El modo construir con el rayo solo funciona dentro de VR." };
      if (!c.estado.puede) return { ok: false, why: "No tienes permiso para construir en este mundo." };
      modo = true; return { ok: true };
    },
    /** Turns them off: lets go of what a hand holds and drops the selection (the computer's Escape). */
    salir: dejar,
    /** For checks: the key a hand holds now, or null. */
    cogido: (lado: Lado) => cogido[lado]?.key ?? null,
    parar(): void { clearInterval(reloj); for (const l of LADOS) soltar(l); },
  };
}
