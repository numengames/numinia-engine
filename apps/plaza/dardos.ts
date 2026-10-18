// dardos on the page (v1, loaded lazily by main.ts with the first dartboard): the throwing view that opens while you
// have a turn, plus the bridge to the 3D boards (view.dardos) and to the board on your real wall (view.dardosAR).
// · PC (mouse): the crosshair follows the mouse with a little hand sway; PRESS and HOLD: the power bar fills and
//   empties (the gold mark = a straight throw); RELEASE: the dart goes.
// · Phone (touch): put your finger on the board (the crosshair sits a bit above it, so you see it) and FLICK upward:
//   the faster the flick, the harder the throw (a lazy one drops, a wild one climbs); the aim is where the flick began.
// · Keyboard: arrows aim, hold Space and release to throw, Esc leaves.
// · AR (where the device has it): «En tu pared (AR)» — the board hangs on your real wall, life size (dardos-ar in
//   packages/render/src/dardos.ts).
// Everything asked goes through the controller (features/dardos/client.ts): the server decides where each dart lands.
import { escribiendo } from "./escribiendo.ts";
import { pintarDiana, caraAPixel, pixelACara, potenciaDe, PINTADA } from "../../packages/render/src/index.ts";
import type { DianaAR } from "../../packages/render/src/index.ts";
import { esTactil } from "./perfil-aparato.ts"; // U25: touch controls or not, one answer for the whole page

import { montarDuelo } from "./dardos-duelo.ts"; // AR-D3: the duel in AR and one line in the HUD (AR-D4: and the sign over the plaza board)
import type { PlazaDianas } from "../../packages/render/src/dardos-duelo-plaza-3d.ts";

type Res = { ok: true } | { ok: false; why: string };
type Dardo = { quien: number; sitio: string; numero: number; x: number; y: number; sector: number; anillo: string; puntos: number; tirada: number; texto: string; cuando: number };
type Sitio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; rumbo: number; ocupado: boolean; duelo?: boolean; remoto?: boolean; rondas?: number; espera?: boolean };
type Estado = { sitio: string; dardos: number; tirada: number; ultimo: Dardo | null; fin: { dardos: number; puntos: number; cuando: number } | null; aviso: string; marcador: { dardos: number; puntos: number; mejorDardo: number; mejorTirada: number; dianas: number } };
type Dardos = {
  estado(): Readonly<Estado>; tirando(): boolean; sitios(): Sitio[]; clavados(sitio?: string): Dardo[];
  duelo(): import("../../packages/render/src/dardos-duelo.ts").DueloV | null; jugar(sitio?: string, desde?: "sitio" | "pared"): Res; lanzar(x: number, y: number, fuerza: number, sitio?: string): Res; salir(): Res;
  alCambiar(fn: (que: "estado" | "sitios" | "clavados" | "duelo") => void): () => void;
};
type Vista = {
  dardos: { sitios(l: Sitio[]): void; clavados(l: Dardo[]): void } & Partial<PlazaDianas>;
  dardosAR(o: { alLanzar: (x: number, y: number, fuerza: number) => void; alColocar?: (pared: boolean) => void; envolver?: (j: DianaAR) => DianaAR }): Promise<DianaAR | null>;
  arSupported(): Promise<boolean>;
  ar: { exit(): Promise<void>; readonly jugando: boolean };
};

/** How long the turn's result stays (ms) after the third dart. */
export const RESULTADO_MS = 5000;
/** The hand sway on a PC (board radii): the crosshair is never perfectly still. */
export const VAIVEN = 0.045;
/** A flick this fast (canvas heights per second, upward) is a full-strength throw. */
export const FLICK_LLENO = 2.6;
/** The crosshair sits this far above the finger (px), so the finger never hides it. */
export const DEDO_PX = 56;
/** Slower than this upward (canvas heights per second) is a slide to aim, not a throw. */
export const FLICK_MIN = 0.12;
/** Strength of a flick (0-1) from its upward speed in canvas heights per second. Pure. */
export const fuerzaDeFlick = (alturasPorSegundo: number): number => Math.max(0, Math.min(1, alturasPorSegundo / FLICK_LLENO));

const CSS = `
#dardos-hud { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 30; width: min(94vw, 380px); padding: 8px 10px 10px; border-radius: 14px; background: rgba(20, 24, 30, .97); box-shadow: 0 6px 24px rgba(0,0,0,.45); color: #eef2f6; font: 14px/1.35 system-ui, sans-serif; display: grid; gap: 6px; justify-items: center; }
#dardos-hud[hidden] { display: none; }
#dardos-hud .cabeza { width: 100%; display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
#dardos-hud .cabeza .nombre { color: #ffd27a; }
#dardos-hud .tablero { position: relative; width: min(86vw, 340px); aspect-ratio: 1; touch-action: none; user-select: none; -webkit-user-select: none; cursor: crosshair; }
#dardos-hud canvas { width: 100%; height: 100%; display: block; border-radius: 50%; }
#dardos-hud .resultado { min-height: 1.5em; font-size: 18px; font-weight: 800; color: #fff; text-align: center; }
#dardos-hud .resultado.alto { color: #9fe8a8; }
#dardos-hud .resultado.diana { color: #ffd27a; animation: dardos-latido .5s ease-out 2; }
@keyframes dardos-latido { 50% { transform: scale(1.18); } }
#dardos-hud .pista, #dardos-hud .marcador { margin: 0; font-size: 12px; color: #c9d3dc; text-align: center; }
#dardos-hud .botones { display: flex; gap: 8px; }
#dardos-hud button { min-height: 40px; padding: 0 14px; border: 0; border-radius: 10px; background: #eef2f6; color: #23303b; font: 600 14px system-ui, sans-serif; }
#dardos-hud button.ar { background: #ffd27a; }
#dardos-hud button[hidden] { display: none; }
#dardos-hud button:focus-visible { outline: 3px solid #fff; }`;

export function montarDardos(o: { dardos: Dardos; view: Vista; session: { entity: number }; hud: HTMLElement }) {
  const { dardos, view, hud } = o;
  if (!document.getElementById("dardos-css")) { const st = document.createElement("style"); st.id = "dardos-css"; st.textContent = CSS; document.head.appendChild(st); }
  hud.setAttribute("aria-label", "Dardos");
  hud.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch, nor a camera drag
  hud.innerHTML = /* static markup, no data in it: every text below goes in with textContent */ `<div class="cabeza"><span class="nombre"></span><span class="cuenta"></span></div>
    <div class="tablero"><canvas width="680" height="680" aria-label="Diana: apunta y lanza"></canvas></div>
    <p class="resultado" role="status" aria-live="polite"></p>
    <p class="pista"></p><p class="marcador"></p>
    <div class="botones"><button type="button" class="ar" hidden>En tu pared (AR)</button><button type="button" class="salir">Dejarlo</button></div>`;
  const $ = <T extends HTMLElement>(s: string) => hud.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>("canvas"), tablero = $<HTMLDivElement>(".tablero"), ctx = canvas.getContext("2d")!;
  const fondo = document.createElement("canvas"); fondo.width = fondo.height = canvas.width; pintarDiana(fondo.getContext("2d")!, fondo.width);
  const PX = canvas.width;
  const tactil = esTactil();
  $<HTMLParagraphElement>(".pista").textContent = tactil
    ? "Pon el dedo en la diana y lánzalo hacia arriba: cuanto más rápido, más fuerte."
    : "Apunta con el ratón · mantén pulsado para cargar · suelta en la marca dorada para un tiro recto.";

  // ---- aim and power ----
  let aim = { x: 0, y: 0.3 }, cargando = false, desde = 0, potencia = 0, abierto = false, sitioVisto = "";
  let toque: { id: number; muestras: { t: number; y: number; cx: number; cy: number }[] } | null = null;
  let arJuego: DianaAR | null = null;
  let ultimoFlick: { alturasPorSegundo: number; muestras: number; ms: number } | null = null;
  const t0 = performance.now();
  const vaiven = (t: number) => (tactil ? { x: 0, y: 0 } : { x: VAIVEN * Math.sin(t * 1.3) + VAIVEN * 0.5 * Math.sin(t * 3.1), y: VAIVEN * Math.cos(t * 1.7) * 0.8 });
  const apuntado = () => { const v = vaiven((performance.now() - t0) / 1000); return { x: aim.x + v.x, y: aim.y + v.y }; };
  /** The bar's value from the clock (never from the last drawn frame: a slow phone draws few). */
  const potenciaAhora = () => (cargando ? potenciaDe((performance.now() - desde) / 1000) : potencia);
  const sitioActual = (): Sitio | undefined => { const e = dardos.estado(); return dardos.sitios().find((s) => s.id === (e.sitio || sitioVisto)) ?? dardos.sitios()[0]; };
  const lanzar = (x: number, y: number, f: number) => {
    const s = sitioActual(); if (!s) return;
    sitioVisto = s.id;
    const r = dardos.lanzar(x, y, f, s.id);
    if (!r.ok) $<HTMLParagraphElement>(".resultado").textContent = r.why;
  };
  const deCanvas = (ev: PointerEvent) => { const b = canvas.getBoundingClientRect(); return { cx: ((ev.clientX - b.left) / b.width) * PX, cy: ((ev.clientY - b.top) / b.height) * PX, alto: b.height }; };

  tablero.addEventListener("pointermove", (ev) => {
    if (ev.pointerType === "mouse" || ev.pointerType === "pen") { const p = deCanvas(ev); const [x, y] = pixelACara(p.cx, p.cy, PX); aim = { x, y }; }
    else if (toque && ev.pointerId === toque.id) {
      // every raw sample with its own time (a slow frame coalesces moves: the flick's speed must not depend on the fps)
      let x = 0, y = 0;
      for (const c of (ev.getCoalescedEvents?.() ?? []).concat(ev.getCoalescedEvents?.().length ? [] : [ev])) {
        const p = deCanvas(c); [x, y] = pixelACara(p.cx, p.cy - (DEDO_PX * PX) / p.alto, PX);
        toque.muestras.push({ t: c.timeStamp, y: c.clientY, cx: x, cy: y });
      }
      while (toque.muestras.length > 60) toque.muestras.shift();
      if (toque.muestras.length < 3) aim = { x, y };
      else { const m = toque.muestras; const dy = m[m.length - 1].y - m[Math.max(0, m.length - 4)].y; if (dy > -4) aim = { x, y }; } // the crosshair follows the finger, not the flick
    }
  });
  tablero.addEventListener("pointerdown", (ev) => {
    ev.preventDefault(); try { tablero.setPointerCapture?.(ev.pointerId); } catch { /* a synthetic pointer */ }
    if (ev.pointerType === "touch") {
      const p = deCanvas(ev); const [x, y] = pixelACara(p.cx, p.cy - (DEDO_PX * PX) / p.alto, PX);
      aim = { x, y }; toque = { id: ev.pointerId, muestras: [{ t: ev.timeStamp, y: ev.clientY, cx: x, cy: y }] };
    } else { cargando = true; desde = performance.now(); }
  });
  const alSoltar = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") {
      if (!toque || ev.pointerId !== toque.id) return;
      const m = toque.muestras, ahora = ev.timeStamp; toque = null;
      // the flick = the last ~110 ms before letting go (at least the previous sample, when the moves were sparse)
      let i = m.findIndex((s) => ahora - s.t <= 110); if (i < 0) i = m.length - 1; if (i === m.length - 1 && i > 0) i--;
      const a = m[i], b = m[m.length - 1];
      const dt = Math.max(16, ahora - a.t) / 1000;
      const alto = canvas.getBoundingClientRect().height || 1;
      const arriba = (a.y - (ev.clientY || b.y)) / alto / dt; // canvas heights per second, upward
      ultimoFlick = { alturasPorSegundo: Math.round(arriba * 100) / 100, muestras: m.length, ms: Math.round(ahora - a.t) };
      if (arriba < FLICK_MIN) return; // a tap, a slow slide or a slide down: not a throw
      lanzar(a.cx, a.cy, fuerzaDeFlick(arriba)); // aim = where the flick began
    } else if (cargando) {
      cargando = false; potencia = potenciaAhora(); const p = apuntado(); lanzar(p.x, p.y, potencia);
    }
  };
  tablero.addEventListener("pointerup", alSoltar);
  tablero.addEventListener("pointercancel", () => { cargando = false; toque = null; });
  addEventListener("keydown", (ev) => {
    if (!abierto || escribiendo()) return;
    const d = 0.04;
    if (ev.key === "ArrowLeft") aim.x -= d; else if (ev.key === "ArrowRight") aim.x += d;
    else if (ev.key === "ArrowUp") aim.y += d; else if (ev.key === "ArrowDown") aim.y -= d;
    else if (ev.code === "Space") { if (!ev.repeat && !cargando) { cargando = true; desde = performance.now(); } }
    else if (ev.key === "Escape") { dardos.salir(); return; }
    else return;
    ev.preventDefault(); ev.stopPropagation();
  }, true);
  addEventListener("keyup", (ev) => { if (abierto && ev.code === "Space" && cargando) { cargando = false; potencia = potenciaAhora(); const p = apuntado(); lanzar(p.x, p.y, potencia); ev.preventDefault(); ev.stopPropagation(); } }, true);
  $<HTMLButtonElement>(".salir").onclick = () => { if (dardos.tirando() || duelo.enPartida()) dardos.salir(); cerrar(); };

  const duelo = montarDuelo({ dardos, plaza: view.dardos, entity: () => o.session.entity, hud, fijarSitio: (id) => { sitioVisto = id; }, avisar: (t) => { $<HTMLParagraphElement>(".resultado").textContent = t; }, alTerminar: () => { if (abierto && !dardos.tirando() && !view.ar.jugando) cerrar(); } });

  // ---- AR: the board on your real wall ----
  const botonAR = $<HTMLButtonElement>(".ar");
  void view.arSupported().then((ok) => { botonAR.hidden = !ok; });
  botonAR.onclick = async () => {
    if (view.ar.jugando) { await view.ar.exit(); return; }
    arJuego = await view.dardosAR(duelo.opcionesAR({ alLanzar: (x, y, f) => lanzar(x, y, f) }));
    if (arJuego) arJuego.clavados(dardos.clavados(sitioActual()?.id));
  };

  // ---- drawing ----
  function dibujar(): void {
    if (!abierto) return;
    requestAnimationFrame(dibujar);
    if (cargando) potencia = potenciaAhora();
    ctx.clearRect(0, 0, PX, PX); ctx.drawImage(fondo, 0, 0);
    const s = sitioActual();
    for (const d of dardos.clavados(s?.id)) {
      const [cx, cy] = caraAPixel(d.x, d.y, PX); if (Math.hypot(d.x, d.y) > PINTADA * 1.05) continue;
      const mio = d.quien === o.session.entity;
      ctx.fillStyle = mio ? "#e07a3f" : "#8a94a3"; ctx.strokeStyle = "#111"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = mio ? "#e07a3f" : "#8a94a3"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 16, cy + 22); ctx.stroke();
    }
    // crosshair (with the sway on a PC; above the finger on a phone)
    if (!tactil || toque) {
      const p = apuntado(); const [cx, cy] = caraAPixel(p.x, p.y, PX);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.moveTo(cx - 24, cy); ctx.lineTo(cx - 6, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 24, cy); ctx.moveTo(cx, cy - 24); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 24); ctx.stroke();
    }
    // power ring (PC, keyboard): an arc around the board; gold mark = straight
    if (!tactil) {
      const r = PX / 2 - 6, a0 = Math.PI * 0.75, span = Math.PI * 1.5;
      ctx.lineWidth = 10; ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(PX / 2, PX / 2, r, a0, a0 + span); ctx.stroke();
      if (cargando || potencia > 0) { ctx.strokeStyle = Math.abs(potencia - 0.65) < 0.08 ? "#ffd27a" : potencia > 0.65 ? "#e5484d" : "#3fb6a8"; ctx.beginPath(); ctx.arc(PX / 2, PX / 2, r, a0, a0 + span * Math.max(0.01, potencia)); ctx.stroke(); }
      const m = a0 + span * 0.65; ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(PX / 2 + Math.cos(m) * (r - 12), PX / 2 + Math.sin(m) * (r - 12)); ctx.lineTo(PX / 2 + Math.cos(m) * (r + 6), PX / 2 + Math.sin(m) * (r + 6)); ctx.stroke();
    }
  }

  // ---- HUD text ----
  let cierre: ReturnType<typeof setTimeout> | null = null;
  function abrir(): void {
    if (cierre) { clearTimeout(cierre); cierre = null; }
    if (abierto) return;
    abierto = true; hud.hidden = false; requestAnimationFrame(dibujar);
    // the camera turns to look at the board from behind you (the 3D darts land where you can see them)
    const s = sitioActual(), l = s && view.dardos.linea(s.id), cam = (view as { cam?: { yaw(): number; girar(d: number): void } }).cam;
    if (l && cam && !view.ar.jugando) { const d = l.rumbo - Math.PI - cam.yaw(); cam.girar(Math.atan2(Math.sin(d), Math.cos(d))); }
  }
  function cerrar(): void { abierto = false; hud.hidden = true; cargando = false; toque = null; }
  function pintarTexto(): void {
    const e = dardos.estado(), s = sitioActual();
    $<HTMLSpanElement>(".nombre").textContent = s?.nombre ?? "Dardos";
    $<HTMLSpanElement>(".cuenta").textContent = e.sitio ? `Dardo ${Math.min(3, e.dardos + 1)}/3 · ${e.tirada} pts` : e.fin ? `Tirada: ${e.fin.puntos} pts` : "";
    const res = $<HTMLParagraphElement>(".resultado");
    const u = e.ultimo;
    if (e.aviso && (!u || performance.now() - u.cuando > 300)) { res.textContent = e.aviso; res.className = "resultado"; }
    else if (u) { res.textContent = e.fin && !e.sitio ? `${u.texto} — tirada ${e.fin.puntos}` : u.texto; res.className = `resultado${u.anillo === "dobleBull" ? " diana" : u.puntos >= 40 ? " alto" : ""}`; }
    const m = e.marcador;
    $<HTMLParagraphElement>(".marcador").textContent = m.dardos ? `Marcador: ${m.dardos} dardos · ${m.puntos} pts · mejor tirada ${m.mejorTirada} · mejor dardo ${m.mejorDardo}${m.dianas ? ` · dianas ${m.dianas}` : ""}` : "";
    botonAR.textContent = view.ar.jugando ? "Salir de AR" : "En tu pared (AR)";
  }
  dardos.alCambiar((que) => {
    if (que === "sitios") view.dardos.sitios(dardos.sitios());
    if (que === "duelo") duelo.cambio();
    if (que === "clavados") { view.dardos.clavados(dardos.clavados()); arJuego?.clavados(dardos.clavados(sitioActual()?.id)); }
    if (que === "estado") {
      const e = dardos.estado();
      if (e.sitio) { sitioVisto = e.sitio; abrir(); }
      else if (e.fin && abierto && !view.ar.jugando) { if (!cierre) cierre = setTimeout(() => { cierre = null; if (!dardos.tirando() && !duelo.enPartida()) cerrar(); }, RESULTADO_MS); }
      pintarTexto();
    }
  });
  view.dardos.sitios(dardos.sitios()); view.dardos.clavados(dardos.clavados());
  hud.hidden = true;
  const api = {
    abierto: () => abierto, apuntar: (x: number, y: number) => { aim = { x, y }; }, apuntado, potencia: () => potenciaAhora(), cargando: () => cargando,
    ar: () => arJuego?.estado() ?? null, duelo: () => duelo.vista(), flick: () => ultimoFlick, abrir, cerrar,
  };
  (globalThis as unknown as { __numinia?: Record<string, unknown> }).__numinia && (((globalThis as unknown as { __numinia: Record<string, unknown> }).__numinia).dardosHud = api);
  return api;
}
