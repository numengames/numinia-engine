// pesca with your hands (N4), loaded with the fishing HUD (apps/plaza/pesca.ts). Two inputs that are not a keyboard or a
// touch screen:
//  · VR (controller or tracked hand): every boardwalk has a rod standing on a holder. Put your hand on its handle (it
//    glows) and press the grip — or pinch, with a tracked hand — to take it; it is then in your real hand. Cast with a
//    flick of the rod forward (where you look); hold the trigger (or keep pinching) to reel; lift the rod sharply to
//    strike at the bite. The rod buzzes when a fish nibbles, hard at the bite, and with the line's tension in the
//    fight. A small gauge above the rod says what to do and shows the fish; the line's tension is a bar standing
//    on the water beside your float (packages/render/src/pesca-boya.ts), where your eyes are while you fish. Grip again (or pinch at the
//    holder) to put the rod back; walking away from the pond puts it back too.
//  · a gamepad on a flat screen: A casts at a spot (the «pescar» prompt), A or RT held reels, B lets go.
// Everything goes through the controller (features/pesca/client.ts): the server decides, as with F and the button.
import { crearGestos, conHisteresis } from "../../features/pesca/gestos.ts";
import { instruccion } from "../../features/pesca/instrucciones.ts";

type Lado = "izq" | "der";
type Res = { ok: true } | { ok: false; why: string };
type Estado = { fase: "nada" | "espera" | "mordisqueo" | "picada" | "pelea"; sitio: string; tension: number; arrancada: "no" | "aviso" | "si" };
type Pesca = { estado(): Readonly<Estado>; lanzar(sitio?: string): Res; recoger(activo: boolean): Res; pulsar(): Res; soltar(): Res; alCambiar(fn: (que: string) => void): () => void };
type P3 = { x: number; y: number; z: number };
type VistaPesca = {
  cadaCuadro(fn: (dt: number) => void): () => void; instruccion?(t: string): void; sujetar(lado: Lado | null, sitio?: string): void; resaltar(id: string): void;
  alAlcance(conTomada?: boolean): { lado: Lado; sitio: string; d: number } | null; punta(): P3 | null; soporte(id: string): P3 | null; mirada(): { x: number; z: number } | null;
};
type Vista = {
  pesca: VistaPesca;
  vr: { active: boolean; nota?(t: string): void };
  manos?: { reglas(o: { ocupada?: (l: Lado) => boolean }): void; vibrar(l: Lado, v?: number, ms?: number): void; entrada(l: Lado): { gatillo: number; agarre: number; mano: boolean } | null };
};
type Sesion = { selfPosition(alpha: number): P3 };
type Interaccion = { actual(): { feature: string } | null; usar(): Res };

/** Walk this far (m) from the rod's holder with the rod and it goes back on its own (no fishing from the other side of the plaza). */
export const LEJOS_M = 6;

export function montarPescaManos(o: { pesca: Pesca; view: Vista; session: Sesion; interaccion?: Interaccion }) {
  const { pesca, view } = o;
  const g = crearGestos(), apretado = conHisteresis();
  let capturado = false, ultimoAntes: unknown = null, textoPuesto = "";
  let sujeta: Lado | null = null, sitio = "", reelVR = false, agarreAntes: Record<Lado, boolean> = { izq: false, der: false }, pellizcoAntes: Record<Lado, boolean> = { izq: false, der: false };
  const rastro: unknown[] = []; // the last gesture samples (the e2e reads them when a gesture is missed)
  let pinzaAntes = false, quietoHasta = 0, ultimoZumbido = 0, faseAntes: Estado["fase"] = "nada", arrancadaAntes: Estado["arrancada"] = "no";
  // the hand holding the rod — and a hand at a holder's handle, about to take it — neither points nor «uses» things with
  // its trigger/pinch (or a pinch to take the rod would also cast from the «pescar» prompt)
  let cercaLado: Lado | null = null;
  view.manos?.reglas({ ocupada: (l) => l === sujeta || l === cercaLado });

  /** The line over my rod: what to do in this phase (features/pesca/instrucciones.ts); "" hides it. */
  const decir = (t: string) => { if (t !== textoPuesto) { textoPuesto = t; view.pesca.instruccion?.(t); } };
  const zumbar = (v: number, ms: number) => { if (sujeta) view.manos?.vibrar(sujeta, v, ms); };
  const tomar = (lado: Lado, id: string) => { agarreAntes[lado] = pellizcoAntes[lado] = pinzaAntes = true; quietoHasta = performance.now() + 300; sujeta = lado; sitio = id; capturado = false; ultimoAntes = (pesca.estado() as { ultimo?: unknown }).ultimo; g.reiniciar(); view.pesca.sujetar(lado, id); view.pesca.resaltar(""); view.manos?.vibrar(lado, 0.6, 60); view.vr.nota?.("Caña cogida: lánzala con un golpe de muñeca hacia delante"); };
  const dejar = () => {
    if (!sujeta) return;
    if (reelVR) { reelVR = false; if (pesca.estado().fase !== "nada") pesca.recoger(false); }
    view.manos?.vibrar(sujeta, 0.3, 40);
    agarreAntes[sujeta] = pellizcoAntes[sujeta] = true; // the pinch/grip that put it back is still closed: open it before taking again
    sujeta = null; sitio = ""; capturado = false; view.pesca.sujetar(null); decir("");
  };
  const flanco = (antes: Record<Lado, boolean>, l: Lado, ahora: boolean) => { const b = ahora && !antes[l]; antes[l] = ahora; return b; };

  // the rod's haptics follow the fish: a nibble ticks, the bite thumps, a coming surge warns, the fight hums with tension
  pesca.alCambiar((que) => {
    if (que !== "estado" || !sujeta) return;
    const e = pesca.estado();
    if (e.fase !== faseAntes) {
      if (e.fase === "mordisqueo") zumbar(0.25, 40);
      if (e.fase === "picada") zumbar(1, 180);
      if (e.fase === "pelea") zumbar(0.7, 90);
      if (e.fase === "nada" && faseAntes !== "nada") { reelVR = false; g.reiniciar(); }
      faseAntes = e.fase;
    }
    if (e.arrancada === "aviso" && arrancadaAntes !== "aviso") zumbar(0.9, 120);
    arrancadaAntes = e.arrancada;
  });

  function vr(): void {
    const m = view.manos;
    if (!m) return;
    const e = pesca.estado();
    if (!sujeta) {
      const cerca = e.fase === "nada" ? view.pesca.alAlcance() : null;
      cercaLado = cerca?.lado ?? null;
      view.pesca.resaltar(cerca?.sitio ?? "");
      for (const l of ["der", "izq"] as Lado[]) {
        const en = m.entrada(l);
        const agarre = flanco(agarreAntes, l, !!en && (en.mano ? en.gatillo > 0.5 : en.agarre > 0.6));
        if (agarre && cerca?.lado === l && e.fase === "nada") { tomar(l, cerca.sitio); break; }
      }
      return;
    }
    cercaLado = null;
    if ((e as { ultimo?: unknown }).ultimo !== ultimoAntes && e.fase === "nada") capturado = true; // I landed a fish: next, put the rod back
    else if (e.fase !== "nada") { capturado = false; ultimoAntes = (e as { ultimo?: unknown }).ultimo; }
    decir(instruccion({ fase: e.fase, tension: e.tension, arrancada: e.arrancada, capturado }));
    const en = m.entrada(sujeta);
    if (!en) { dejar(); return; } // the controller went to sleep or the hand was lost
    // put it back: grip again (controller), or a pinch with the rod at its holder while not fishing (hand)
    const agarre = flanco(agarreAntes, sujeta, en.mano ? false : en.agarre > 0.6);
    if (agarre) { if (e.fase !== "nada") pesca.soltar(); dejar(); return; }
    const sop = view.pesca.soporte(sitio), yo = o.session.selfPosition(1);
    if (sop && Math.hypot(sop.x - yo.x, sop.z - yo.z) > LEJOS_M) { if (e.fase !== "nada") pesca.soltar(); dejar(); view.vr.nota?.("La caña ha vuelto a su soporte"); return; }
    const pellizca = flanco(pellizcoAntes, sujeta, en.mano && en.gatillo > 0.5);
    if (en.mano && (en.gatillo > 0.5) !== pinzaAntes) { pinzaAntes = en.gatillo > 0.5; quietoHasta = Math.max(quietoHasta, performance.now() + 250); g.reiniciar(); } // a pinch closing or opening jerks the tracked joints
    if (pellizca && e.fase === "nada") { const c = view.pesca.alAlcance(true); if (c?.sitio === sitio && c.lado === sujeta) { dejar(); return; } }
    // gestures with the rod tip
    const p = view.pesca.punta(), mir = view.pesca.mirada();
    if (p && mir && performance.now() >= quietoHasta) {
      const r = g.muestra({ t: performance.now(), ...p }, mir);
      rastro.push([Math.round(performance.now()), Math.round(r.adelante * 10) / 10, Math.round(r.vel.y * 10) / 10, r.lanzar ? "L" : r.tiron ? "T" : "", e.fase]); if (rastro.length > 120) rastro.shift();
      if (r.lanzar && e.fase === "nada") { const res = pesca.lanzar(sitio); if (res.ok) zumbar(0.5, 70); else view.vr.nota?.(res.why); }
      else if (r.tiron && (e.fase === "picada" || e.fase === "pelea")) { pesca.pulsar(); zumbar(0.6, 50); }
    }
    // reeling: the trigger (or a held pinch) while fishing
    const quiere = e.fase !== "nada" && apretado(en.gatillo);
    if (quiere !== reelVR && e.fase !== "nada") { reelVR = quiere; pesca.recoger(quiere); }
    else if (e.fase === "nada") reelVR = false;
    // the fight hums with the line's tension, so you can fish with your eyes on the water
    const ahora = performance.now();
    if (e.fase === "pelea" && ahora - ultimoZumbido > 160) { ultimoZumbido = ahora; zumbar(Math.min(1, 0.1 + (e.tension / 100) ** 2 * 0.9), 60); }
  }

  // ---- a gamepad on a flat screen: A casts at the «pescar» prompt, A or RT held reels, B lets go ----
  let botonesAntes = [false, false], reelPad = false;
  function mando(): void {
    if (typeof navigator.getGamepads !== "function") return;
    let pad: Gamepad | null = null;
    for (const x of navigator.getGamepads()) if (x && x.connected) { pad = x; break; }
    if (!pad) { if (reelPad) { reelPad = false; if (pesca.estado().fase !== "nada") pesca.recoger(false); } return; }
    const a = !!pad.buttons[0]?.pressed, b = !!pad.buttons[1]?.pressed, rt = (pad.buttons[7]?.value ?? 0) > 0.5;
    const e = pesca.estado(), aBaja = a && !botonesAntes[0], bBaja = b && !botonesAntes[1];
    botonesAntes = [a, b];
    if (e.fase === "nada") {
      reelPad = false;
      if (aBaja && o.interaccion?.actual()?.feature === "pesca") o.interaccion.usar();
      return;
    }
    if (bBaja) { pesca.soltar(); return; }
    const quiere = a || rt;
    if (quiere !== reelPad) { reelPad = quiere; pesca.recoger(quiere); }
  }

  const parar = view.pesca.cadaCuadro(() => {
    if (view.vr.active) vr();
    else { if (sujeta) dejar(); cercaLado = null; view.pesca.resaltar(""); mando(); }
  });
  return { sujeta: () => sujeta, sitio: () => sitio, rastro: () => rastro.slice(), parar };
}
