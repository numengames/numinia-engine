// dardos on the page (v1, loaded lazily by main.ts with the first dartboard): the throwing view that opens while you
// have a turn, plus the bridge to the 3D boards (view.dardos) and to the board on your real wall (view.dardosAR).
// · PC (mouse): the crosshair follows the mouse with a little hand sway (it settles when you press, drifts if you hold too
//   long); PRESS and HOLD: the power bar beside the board fills and empties (its gold window = a straight throw, the width the
//   SERVER judges: ZONA_FUERZA); RELEASE: the dart goes, and for a moment the bar shows where you let go (PERFECTO / CASI /
//   FLOJO ↓ / FUERTE ↑) and the board where you aimed and where the dart landed.
// · Phone (touch): put your finger on the board (the crosshair sits a bit above it, so you see it) and FLICK upward:
//   the faster the flick, the harder the throw (a lazy one drops, a wild one climbs); the aim is where the flick began.
// · Keyboard: arrows or WASD aim (Shift = fine step), hold Space and release to throw, Esc leaves.
// · VR (where the device has it): take a dart with the grip or a pinch and throw it with your hand (dardos-vr.ts).
// · AR (where the device has it): «En tu pared (AR)» — the board hangs on your real wall, life size (dardos-ar in
//   packages/render/src/dardos.ts).
// Everything asked goes through the controller (features/dardos/client.ts): the server decides where each dart lands.
import { escribiendo } from "./escribiendo.ts";
import { pintarDiana, caraAPixel, pixelACara, potenciaDe, PINTADA } from "../../packages/render/src/index.ts";
import type { DianaAR } from "../../packages/render/src/index.ts";
import { esTactil } from "./perfil-aparato.ts"; // U25: touch controls or not, one answer for the whole page
import { FUERZA_IDEAL, DARDOS_TURNO, ZONA_FUERZA } from "../../features/dardos/feature.ts";
import type { Via } from "../../features/dardos/feature.ts";
import { etiquetaSuelta, SUELTA_MS, ATERRIZAJE_MS, amplitudVaiven, amplitudTrasSoltar, VAIVEN_REPOSO, vaivenDe, PASO, PASO_FINO, TECLAS_APUNTAR } from "../../features/dardos/barra.ts";
import type { Suelta } from "../../features/dardos/barra.ts";

import { montarDuelo } from "./dardos-duelo.ts"; // AR-D3: the duel in AR and one line in the HUD (AR-D4: and the sign over the plaza board)
import type { PlazaDianas } from "../../packages/render/src/dardos-duelo-plaza-3d.ts";

type Res = { ok: true } | { ok: false; why: string };
type Dardo = { quien: number; sitio: string; numero: number; x: number; y: number; sector: number; anillo: string; puntos: number; tirada: number; texto: string; cuando: number };
type Sitio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; rumbo: number; ocupado: boolean; duelo?: boolean; remoto?: boolean; rondas?: number; espera?: boolean };
type Estado = { sitio: string; dardos: number; tirada: number; ultimo: Dardo | null; fin: { dardos: number; puntos: number; cuando: number } | null; aviso: string; marcador: { dardos: number; puntos: number; mejorDardo: number; mejorTirada: number; dianas: number } };
type Dardos = {
  estado(): Readonly<Estado>; tirando(): boolean; sitios(): Sitio[]; clavados(sitio?: string): Dardo[];
  duelo(): import("../../packages/render/src/dardos-duelo.ts").DueloV | null; cambiar(): Res; empezar(): Res; jugar(sitio?: string, desde?: "sitio" | "pared"): Res; lanzar(x: number, y: number, fuerza: number, sitio?: string, via?: Via): Res; salir(): Res;
  alCambiar(fn: (que: "estado" | "sitios" | "clavados" | "duelo") => void): () => void;
};
type Vista = {
  dardos: { sitios(l: Sitio[]): void; clavados(l: Dardo[]): void; apuntar(id: string, origen: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): { x: number; y: number } | null } & Partial<PlazaDianas>;
  dardosAR(o: { alLanzar: (x: number, y: number, fuerza: number) => void; alColocar?: (pared: boolean) => void; zona?: number; envolver?: (j: DianaAR) => DianaAR }): Promise<DianaAR | null>;
  arSupported(): Promise<boolean>;
  vrSupported(): Promise<boolean>;
  ar: { exit(): Promise<void>; readonly jugando: boolean };
  vr: { active: boolean; nota?(t: string): void };
  manos?: { on(fn: (e: { tipo: string; lado: "izq" | "der" }) => void): () => void; rayo(lado: "izq" | "der"): { origen: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } | null; vibrar(lado: "izq" | "der", v?: number, ms?: number): void };
};

/** How long the turn's result stays (ms) after the third dart. */
export const RESULTADO_MS = 5000;
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
#dardos-hud.pc { width: min(96vw, 500px); }
#dardos-hud .mesa { display: flex; align-items: stretch; gap: 4px; }
#dardos-hud .tablero { position: relative; width: min(86vw, 340px); aspect-ratio: 1; touch-action: none; user-select: none; -webkit-user-select: none; cursor: crosshair; }
#dardos-hud.pc .tablero { width: min(calc(96vw - 170px), 340px); }
#dardos-hud canvas.diana { width: 100%; height: 100%; display: block; border-radius: 50%; }
#dardos-hud .guia { position: relative; display: flex; align-items: stretch; }
#dardos-hud .guia[hidden] { display: none; }
#dardos-hud canvas.barra { width: 40px; height: 100%; display: block; }
#dardos-hud .rotulos { position: relative; width: 84px; font-size: 11px; font-weight: 800; letter-spacing: .02em; }
#dardos-hud .rotulos span { position: absolute; left: 4px; white-space: nowrap; }
#dardos-hud .rotulos .fuerte { top: 0; color: #ff9a9d; }
#dardos-hud .rotulos .medio { color: #ffd27a; transform: translateY(50%); }
#dardos-hud .rotulos .flojo { bottom: 0; color: #6fd6c8; }
#dardos-hud .rotulos.con-suelta span { opacity: .25; }
#dardos-hud .suelta { position: absolute; left: 0; margin: 0; padding: 1px 6px; border: 2px solid currentColor; border-radius: 6px; background: #0b0e12; font-size: 14px; font-weight: 900; white-space: nowrap; transform: translateY(50%); z-index: 2; }
#dardos-hud .suelta[hidden] { display: none; }
#dardos-hud .suelta.perfecto { color: #ffd27a; } #dardos-hud .suelta.casi { color: #fff; } #dardos-hud .suelta.flojo { color: #6fd6c8; } #dardos-hud .suelta.fuerte { color: #ff9a9d; }
#dardos-hud .resultado { min-height: 1.3em; font-size: 24px; font-weight: 800; color: #fff; text-align: center; }
#dardos-hud .resultado.alto { color: #9fe8a8; }
#dardos-hud .resultado.triple { color: #ffd27a; } #dardos-hud .resultado.doble { color: #9fe8a8; }
#dardos-hud .resultado.diana { color: #ff8a8e; animation: dardos-latido .5s ease-out 2; }
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
    <div class="mesa"><div class="tablero"><canvas class="diana" width="680" height="680" aria-label="Diana: apunta y lanza"></canvas></div>
      <div class="guia" hidden><canvas class="barra" width="80" height="680" role="img" aria-label="Barra de fuerza: suelta con la barra dentro de la zona dorada"></canvas><div class="rotulos"><span class="fuerte">FUERTE ↑</span><span class="medio">PERFECTO</span><span class="flojo">FLOJO ↓</span><p class="suelta" role="status" aria-live="assertive" hidden></p></div></div></div>
    <p class="resultado" role="status" aria-live="polite"></p>
    <p class="pista"></p><p class="marcador"></p>
    <div class="botones"><button type="button" class="ar" hidden>En tu pared (AR)</button><button type="button" class="salir">Dejarlo</button></div>`;
  const $ = <T extends HTMLElement>(s: string) => hud.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>("canvas.diana"), barraC = $<HTMLCanvasElement>("canvas.barra"), bctx = barraC.getContext("2d")!, guia = $<HTMLDivElement>(".guia"), tablero = $<HTMLDivElement>(".tablero"), ctx = canvas.getContext("2d")!;
  const fondo = document.createElement("canvas"); fondo.width = fondo.height = canvas.width; pintarDiana(fondo.getContext("2d")!, fondo.width);
  const PX = canvas.width;
  const tactil = esTactil();
  // PC: the bar beside the board (28 css px, the board's height); a phone has none (the flick's speed is the strength)
  hud.classList.toggle("pc", !tactil); guia.hidden = tactil;
  $<HTMLParagraphElement>(".pista").textContent = tactil
    ? "Pon el dedo en la diana y lánzalo hacia arriba: cuanto más rápido, más fuerte."
    : "Ratón: apunta, mantén pulsado y suelta con la barra en la zona dorada. Teclado: flechas o WASD apuntan (Mayús = paso fino), Espacio mantiene y suelta, Esc sale.";
  /** The bar's canvas row for a strength p (0-1), as a fraction of its height from the bottom: the same maths draws the marks and places the words. */
  const BORDE = 6, fraccion = (p: number) => (BORDE + p * (barraC.height - 2 * BORDE)) / barraC.height;
  const rotulos = $<HTMLDivElement>(".rotulos"), medio = $<HTMLSpanElement>(".rotulos .medio"), etiqueta = $<HTMLParagraphElement>("p.suelta");
  medio.style.bottom = `${fraccion(FUERZA_IDEAL) * 100}%`;

  // ---- aim and power ----
  let aim = { x: 0, y: 0.3 }, cargando = false, desde = 0, potencia = 0, abierto = false, sitioVisto = "";
  let viaCarga: Via = "raton"; // how the charge in progress was started (mouse press / Space): it sets the window the server judges
  let toque: { id: number; muestras: { t: number; y: number; cx: number; cy: number }[] } | null = null;
  let arJuego: DianaAR | null = null;
  let ultimoFlick: { alturasPorSegundo: number; muestras: number; ms: number } | null = null;
  /** The last release: where the bar was, its word, where you aimed, and (when the server answers) where the dart landed. */
  type Suelto = { p: number; via: Via; tipo: Suelta; t: number; apuntado: { x: number; y: number }; cae: { x: number; y: number; t: number } | null };
  let suelto: Suelto | null = null;
  let ampSuelta = VAIVEN_REPOSO, tSuelta = 0; // the sway's amplitude at the last release, and when (it eases back to rest)
  const t0 = performance.now();
  /** The time of an input event: its own stamp (when the hand did it), not the moment a busy page got to read it. Same clock as performance.now(). */
  const marca = (ev: Event): number => (ev.timeStamp > 0 && ev.timeStamp <= performance.now() + 50 ? ev.timeStamp : performance.now());
  const numeroDardo = () => Math.min(DARDOS_TURNO, dardos.estado().dardos + 1);
  const amplitud = (ahora: number) => (cargando ? amplitudVaiven((ahora - desde) / 1000) : amplitudTrasSoltar(ampSuelta, (ahora - tSuelta) / 1000));
  /** Where the dart would go at time `ahora` (ms): the aim plus the hand's sway (a PC only; the pattern is the dart's number's). */
  const apuntadoEn = (ahora: number) => { if (tactil) return { x: aim.x, y: aim.y }; const v = vaivenDe((ahora - t0) / 1000, numeroDardo(), amplitud(ahora)); return { x: aim.x + v.x, y: aim.y + v.y }; };
  const apuntado = () => apuntadoEn(performance.now());
  /** The bar's value from the clock (never from the last drawn frame: a slow phone draws few). */
  const potenciaAhora = () => (cargando ? potenciaDe((performance.now() - desde) / 1000) : potencia);
  const sitioActual = (): Sitio | undefined => { const e = dardos.estado(); return dardos.sitios().find((s) => s.id === (e.sitio || sitioVisto)) ?? dardos.sitios()[0]; };
  const lanzar = (x: number, y: number, f: number, via: Via) => {
    const s = sitioActual(); if (!s) return;
    sitioVisto = s.id;
    const r = dardos.lanzar(x, y, f, s.id, via);
    if (!r.ok) $<HTMLParagraphElement>(".resultado").textContent = r.why;
  };
  const deCanvas = (ev: PointerEvent) => { const b = canvas.getBoundingClientRect(); return { cx: ((ev.clientX - b.left) / b.width) * PX, cy: ((ev.clientY - b.top) / b.height) * PX, alto: b.height }; };
  /** Start charging the bar (mouse press or Space), at the event's own time. */
  const cargar = (ev: Event, via: Via) => { if (cargando) return; cargando = true; desde = marca(ev); viaCarga = via; potencia = 0; suelto = null; etiqueta.hidden = true; rotulos.classList.remove("con-suelta"); };
  /** Let go: the strength is read at the event's own time; the word, the ghost mark and the aim ring show; the dart goes. */
  const soltar = (ev: Event) => {
    const ahora = marca(ev), p = apuntadoEn(ahora), via = viaCarga;
    const f = Math.round(potenciaDe((ahora - desde) / 1000) * 1000) / 1000;
    ampSuelta = amplitud(ahora); tSuelta = ahora; cargando = false; potencia = f;
    const tipo = etiquetaSuelta(f, ZONA_FUERZA[via]);
    suelto = { p: f, via, tipo, t: performance.now(), apuntado: p, cae: null };
    etiqueta.textContent = tipo.etiqueta; etiqueta.className = `suelta ${tipo.clase}`; etiqueta.style.bottom = `${fraccion(f) * 100}%`; etiqueta.hidden = false; rotulos.classList.add("con-suelta");
    lanzar(p.x, p.y, f, via);
  };

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
    } else if (ev.button === 0) cargar(ev, "raton");
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
      lanzar(a.cx, a.cy, fuerzaDeFlick(arriba), "tactil"); // aim = where the flick began
    } else if (cargando && viaCarga === "raton") soltar(ev);
  };
  tablero.addEventListener("pointerup", alSoltar);
  tablero.addEventListener("pointercancel", () => { cargando = false; toque = null; });
  addEventListener("keydown", (ev) => {
    if (!abierto || escribiendo()) return;
    const dir = TECLAS_APUNTAR[ev.code] ?? TECLAS_APUNTAR[ev.key];
    if (dir) { const d = ev.shiftKey ? PASO_FINO : PASO; aim = { x: aim.x + dir[0] * d, y: aim.y + dir[1] * d }; }
    else if (ev.code === "Space") { if (!ev.repeat) cargar(ev, "teclado"); }
    else if (ev.key === "Escape") { dardos.salir(); return; }
    else return;
    ev.preventDefault(); ev.stopPropagation();
  }, true);
  addEventListener("keyup", (ev) => { if (abierto && ev.code === "Space" && cargando && viaCarga === "teclado") { soltar(ev); ev.preventDefault(); ev.stopPropagation(); } }, true);
  $<HTMLButtonElement>(".salir").onclick = () => { if (dardos.tirando() || duelo.enPartida()) dardos.salir(); cerrar(); };

  const duelo = montarDuelo({ dardos, plaza: view.dardos, entity: () => o.session.entity, hud, fijarSitio: (id) => { sitioVisto = id; }, avisar: (t) => { $<HTMLParagraphElement>(".resultado").textContent = t; }, alTerminar: () => { if (abierto && !dardos.tirando() && !view.ar.jugando) cerrar(); } });

  // ---- AR: the board on your real wall ----
  const botonAR = $<HTMLButtonElement>(".ar");
  void view.arSupported().then((ok) => { botonAR.hidden = !ok; });
  botonAR.onclick = async () => {
    if (view.ar.jugando) { await view.ar.exit(); return; }
    arJuego = await view.dardosAR({ ...duelo.opcionesAR({ alLanzar: (x, y, f) => lanzar(x, y, f, "ar") }), zona: ZONA_FUERZA.ar });
    if (arJuego) arJuego.clavados(dardos.clavados(sitioActual()?.id));
  };

  // ---- drawing ----
  /** The bar: a dark track with a thin light border, the fill (teal under the window, red over it, never gold), the window
   *  (flat gold band, white 2 px border, side notches; it lights up while the fill is inside it) and the ghost mark of the last release. */
  function dibujarBarra(ahora: number): void {
    const W = barraC.width, H = barraC.height, x0 = 12, ancho = W - 24; // 28 css px of track in a 40 css px canvas: the notches live in the margin
    const y = (p: number) => H - fraccion(p) * H; // the same row the words use
    const zona = ZONA_FUERZA[cargando ? viaCarga : suelto?.via ?? "raton"], zlo = FUERZA_IDEAL - zona, zhi = FUERZA_IDEAL + zona;
    bctx.clearRect(0, 0, W, H);
    bctx.fillStyle = "#0b0e12"; bctx.fillRect(x0, 0, ancho, H); bctx.strokeStyle = "#8a94a3"; bctx.lineWidth = 2; bctx.strokeRect(x0 + 1, 1, ancho - 2, H - 2);
    const nivel = cargando ? potencia : suelto && ahora - suelto.t < SUELTA_MS ? suelto.p : 0;
    const franja = (a: number, b: number, color: string) => { if (b <= a) return; bctx.fillStyle = color; bctx.fillRect(x0 + 8, y(b), ancho - 16, y(a) - y(b)); };
    franja(0, Math.min(nivel, zlo), "#3fb6a8"); franja(zhi, nivel, "#e5484d");
    // the window on top of the fill
    const dentro = cargando && nivel >= zlo - 1e-9 && nivel <= zhi + 1e-9;
    const yt = y(zhi), alto = y(zlo) - y(zhi);
    bctx.fillStyle = dentro ? "#fff4cf" : "#ffd27a"; bctx.fillRect(x0 + 2, yt, ancho - 4, alto);
    bctx.strokeStyle = "#fff"; bctx.lineWidth = 4; bctx.strokeRect(x0 + 2, yt, ancho - 4, alto);
    bctx.fillStyle = "#fff"; const ym = y(FUERZA_IDEAL); // two notches pointing at the window, one on each side
    bctx.beginPath(); bctx.moveTo(0, ym - 10); bctx.lineTo(x0 - 1, ym); bctx.lineTo(0, ym + 10); bctx.closePath(); bctx.fill();
    bctx.beginPath(); bctx.moveTo(W, ym - 10); bctx.lineTo(W - x0 + 1, ym); bctx.lineTo(W, ym + 10); bctx.closePath(); bctx.fill();
    if (cargando) { bctx.fillStyle = "#fff"; bctx.fillRect(x0 - 2, y(nivel) - 2, ancho + 4, 4); } // the level now
    if (suelto && ahora - suelto.t < SUELTA_MS) { // the ghost: where you let go
      bctx.globalAlpha = Math.min(1, (SUELTA_MS - (ahora - suelto.t)) / 250);
      bctx.fillStyle = "#000"; bctx.fillRect(x0 - 10, y(suelto.p) - 8, ancho + 20, 16); bctx.fillStyle = "#fff"; bctx.fillRect(x0 - 8, y(suelto.p) - 5, ancho + 16, 10);
      bctx.globalAlpha = 1;
    }
  }
  function dibujar(): void {
    if (!abierto) return;
    requestAnimationFrame(dibujar);
    const ahora = performance.now();
    if (cargando) potencia = potenciaAhora();
    ctx.clearRect(0, 0, PX, PX); ctx.drawImage(fondo, 0, 0);
    const s = sitioActual();
    for (const d of dardos.clavados(s?.id)) {
      const [cx, cy] = caraAPixel(d.x, d.y, PX); if (Math.hypot(d.x, d.y) > PINTADA * 1.05) continue;
      const mio = d.quien === o.session.entity, col = mio ? "#e07a3f" : "#8a94a3";
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 20, cy + 28); ctx.stroke();
      ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (mio) { ctx.fillStyle = "#111"; ctx.font = "bold 18px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(d.numero), cx, cy + 1); } // 1-2-3 of the visit
    }
    // where you aimed (ring) and where the dart landed (a line to it): after the release, ATERRIZAJE_MS from the landing
    if (suelto) {
      suelto.cae ??= (() => { const u = dardos.estado().ultimo; return u && u.quien === o.session.entity && u.cuando >= suelto!.t ? { x: u.x, y: u.y, t: ahora } : null; })();
      if (ahora - (suelto.cae?.t ?? suelto.t) < ATERRIZAJE_MS && ahora - suelto.t < 2 * ATERRIZAJE_MS) {
        const [ax, ay] = caraAPixel(suelto.apuntado.x, suelto.apuntado.y, PX);
        ctx.lineWidth = 3;
        if (suelto.cae) { const [bx, by] = caraAPixel(suelto.cae.x, suelto.cae.y, PX); ctx.setLineDash([8, 6]); ctx.strokeStyle = "#111"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); }
        ctx.strokeStyle = "#111"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(ax, ay, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 3; ctx.stroke();
      }
    }
    // crosshair (with the sway on a PC; above the finger on a phone): a dark stroke under the white one, so it reads on the cream rings too
    if (!tactil || toque) {
      const p = apuntado(); const [cx, cy] = caraAPixel(p.x, p.y, PX);
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.moveTo(cx - 24, cy); ctx.lineTo(cx - 6, cy); ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 24, cy); ctx.moveTo(cx, cy - 24); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 24);
      ctx.strokeStyle = "#111"; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
    }
    if (!tactil) { dibujarBarra(ahora); if (suelto && ahora - suelto.t >= SUELTA_MS && !etiqueta.hidden) { etiqueta.hidden = true; rotulos.classList.remove("con-suelta"); } }
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
  function cerrar(): void { abierto = false; hud.hidden = true; cargando = false; toque = null; suelto = null; etiqueta.hidden = true; rotulos.classList.remove("con-suelta"); }
  function pintarTexto(): void {
    const e = dardos.estado(), s = sitioActual();
    $<HTMLSpanElement>(".nombre").textContent = s?.nombre ?? "Dardos";
    $<HTMLSpanElement>(".cuenta").textContent = e.sitio ? `Dardo ${Math.min(3, e.dardos + 1)}/3 · ${e.tirada} pts` : e.fin ? `Tirada: ${e.fin.puntos} pts` : "";
    const res = $<HTMLParagraphElement>(".resultado");
    const u = e.ultimo;
    if (e.aviso && (!u || performance.now() - u.cuando > 300)) { res.textContent = e.aviso; res.className = "resultado"; }
    else if (u) { res.textContent = e.fin && !e.sitio ? `${u.texto} — tirada ${e.fin.puntos}` : u.texto; res.className = `resultado${u.anillo === "dobleBull" ? " diana" : u.anillo === "triple" ? " triple" : u.anillo === "doble" ? " doble" : u.puntos >= 40 ? " alto" : ""}`; }
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
  // VR: throw with the hand (dardos-vr.ts). Only a headset-capable device fetches it, after start, never before requestSession.
  let vrApi: unknown = null;
  void view.vrSupported().then((ok) => ok ? import("./dardos-vr.ts") : null).then((m) => m && m.montarDardosVR({ dardos, view: view as never, yo: () => o.session.entity })).then((a) => { vrApi = a; }).catch((e) => console.warn(`[dardos] VR: ${(e as Error)?.message ?? e}`));
  const api = {
    abierto: () => abierto, apuntar: (x: number, y: number) => { aim = { x, y }; }, apuntado, potencia: () => potenciaAhora(), cargando: () => cargando, zona: () => ZONA_FUERZA[cargando ? viaCarga : "raton"], suelto: () => suelto && { p: suelto.p, via: suelto.via, etiqueta: suelto.tipo.etiqueta, apuntado: suelto.apuntado, cae: suelto.cae && { x: suelto.cae.x, y: suelto.cae.y } },
    ar: () => arJuego?.estado() ?? null, duelo: () => duelo.vista(), flick: () => ultimoFlick, abrir, cerrar, vr: () => vrApi,
  };
  (globalThis as unknown as { __numinia?: Record<string, unknown> }).__numinia && (((globalThis as unknown as { __numinia: Record<string, unknown> }).__numinia).dardosHud = api);
  return api;
}
