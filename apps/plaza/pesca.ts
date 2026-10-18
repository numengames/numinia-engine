// pesca on the page (v2, loaded lazily by main.ts with the first fishing spot or float): a HUD that appears only while
// you fish — what is happening («Esperando…», «¡Pica!», the fish's name), a tension bar (red past 80 %), a progress bar,
// a BIG touch button «Recoger» (hold = reel, let go = rest; a tap hooks at the bite) and a small «Soltar». Keyboard: hold
// F to reel, X to let go of the rod. It vibrates (navigator.vibrate) at the bite, before a surge and at the catch. When
// the fight ends the HUD stays a few seconds with a clear result: «¡Pescado!» (name, size, rarity, «En tu cesta: N»,
// a short chime, a long buzz) or «Se ha escapado» (why, a low tone). The 3D (pond, rod, line, float, the fish in the
// hand) is view.pesca (packages/render/src/pesca.ts). Everything asked goes through the controller
// (features/pesca/client.ts): the server decides. No key fires while typing (escribiendo).
import { escribiendo } from "./escribiendo.ts";
import { montarPescaManos } from "./pesca-vr.ts"; // N4: the rod in your hand in VR, and a gamepad
import { consejo } from "../../features/pesca/client.ts";
import { esTactil } from "./perfil-aparato.ts"; // U25: touch controls or not, one answer for the whole page

type Res = { ok: true } | { ok: false; why: string };
type Estado = { fase: "nada" | "espera" | "mordisqueo" | "picada" | "pelea"; sitio: string; desde: number; ventana: number; pez: string; tension: number; progreso: number; arrancada: "no" | "aviso" | "si"; recogiendo: boolean; aviso: string; ultimo: { pez: string; cm: number; rareza: string; total: number } | null; cesta: { peces: number; mejor: string; mejorCm: number } };
type Sitio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; ocupado: boolean };
type Flotador = { quien: number; x: number; y: number; z: number };
type Captura = { quien: number; pez: string; cm: number; rareza: string; desde: number };
type Que = "estado" | "flotadores" | "sitios" | "capturas";
type Pesca = { estado(): Readonly<Estado>; sitios(): Sitio[]; flotadores(): Flotador[]; capturas(): Captura[]; lanzar(sitio?: string): Res; recoger(activo: boolean): Res; pulsar(): Res; soltar(): Res; alCambiar(fn: (que: Que) => void): () => void };
type Manos = Parameters<typeof montarPescaManos>[0];
type Vista = Manos["view"] & { pesca: Manos["view"]["pesca"] & { sitios(l: Sitio[]): void; flotadores(l: Flotador[], yo: number): void; capturas(l: Captura[], yo: number): void; estado(e: { fase: Estado["fase"]; desde: number; tension: number; progreso: number; arrancada: Estado["arrancada"]; texto?: string }): void } };
type Sesion = { entity: number } & Manos["session"];

/** How long the result panel stays (ms) after a catch or an escape. */
export const RESULTADO_MS = 4000;
const RAREZA: Record<string, string> = { comun: "común", rara: "rara", legendaria: "legendaria" };
export const cmTexto = (cm: number): string => `${String(Math.round(cm * 10) / 10).replace(".", ",")} cm`;

const CSS = `
#pesca-hud { position: fixed; left: 50%; bottom: 70px; transform: translateX(-50%); z-index: 5; width: min(92vw, 380px); padding: 8px 10px; border-radius: 12px; background: rgba(20, 24, 30, .82); color: #eef2f6; font: 14px/1.4 system-ui, sans-serif; display: grid; gap: 8px; }
#pesca-hud[hidden] { display: none; }
#pesca-hud .que { min-height: 1.4em; font-weight: 600; color: #ffd27a; text-align: center; }
#pesca-hud .que.picada { color: #ff8a5b; font-size: 18px; animation: pesca-parpadeo .35s steps(2) infinite; }
@keyframes pesca-parpadeo { to { opacity: .35; } }
#pesca-hud .barras { display: grid; gap: 4px; }
#pesca-hud .que[hidden], #pesca-hud .barras[hidden], #pesca-hud .fila[hidden], #pesca-hud .pista[hidden], #pesca-hud .resultado[hidden] { display: none; }
#pesca-hud .barra { position: relative; height: 12px; border-radius: 6px; background: rgba(255,255,255,.14); overflow: hidden; }
#pesca-hud .barra > i { position: absolute; inset: 0 auto 0 0; width: 0; border-radius: 6px; background: #7bd389; transition: width .09s linear; }
#pesca-hud .barra.tension > i { background: #f0c35b; }
#pesca-hud .barra.tension.alta > i { background: #e5484d; }
#pesca-hud .barra.tension.arrancada { outline: 2px solid #ff8a5b; }
#pesca-hud .fila { display: flex; gap: 8px; align-items: stretch; }
#pesca-recoger { flex: 1; min-height: 56px; border: 0; border-radius: 12px; background: #ffd27a; color: #23303b; font: 700 20px/1 system-ui, sans-serif; touch-action: none; user-select: none; -webkit-user-select: none; }
#pesca-recoger[aria-pressed="true"] { background: #ffb347; transform: scale(.98); }
#pesca-soltar { min-height: 56px; padding: 0 14px; border: 0; border-radius: 12px; background: #eef2f6; color: #23303b; font: 600 14px system-ui, sans-serif; }
#pesca-hud button:focus-visible { outline: 3px solid #fff; }
#pesca-hud .pista { margin: 0; font-size: 12px; color: #c9d3dc; text-align: center; }
#pesca-hud .resultado { display: grid; gap: 2px; padding: 6px 4px; text-align: center; border-radius: 10px; animation: pesca-entra .25s ease-out; }
#pesca-hud .resultado.pescado { background: rgba(123, 211, 137, .18); }
#pesca-hud .resultado.escapado { background: rgba(229, 72, 77, .18); }
#pesca-hud .resultado .titulo { font-size: 22px; font-weight: 800; color: #fff; }
#pesca-hud .resultado.pescado .titulo { color: #9fe8a8; }
#pesca-hud .resultado.escapado .titulo { color: #ff9a9e; }
#pesca-hud .resultado .pez { font-size: 18px; font-weight: 700; color: #ffd27a; }
#pesca-hud .resultado .nota { font-size: 13px; color: #c9d3dc; }
@keyframes pesca-entra { from { transform: scale(.92); opacity: 0; } }`;

const TEXTO: Record<Estado["fase"], string> = { nada: "", espera: "Esperando… algo picará", mordisqueo: "Algo mordisquea el cebo", picada: "¡PICA! Recoge ahora", pelea: "Pelea: {pez}" };

/** Two short notes (a catch) or one low one (an escape), made here with the Web Audio API; follows the effects volume. */
function sonar(que: "exito" | "fallo", ctx: () => AudioContext | null, ajuste: (id: string) => unknown): void {
  try {
    const c = ctx(); if (!c) return;
    const vol = (Number(ajuste("general") ?? 80) / 100) * (Number(ajuste("efectos") ?? 80) / 100) * 0.25;
    if (vol <= 0) return;
    const notas: [number, number, number][] = que === "exito" ? [[523, 0, 0.12], [784, 0.12, 0.22]] : [[196, 0, 0.3]];
    for (const [f, t0, dur] of notas) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = que === "exito" ? "triangle" : "sawtooth"; o.frequency.value = f;
      g.gain.setValueAtTime(0, c.currentTime + t0); g.gain.linearRampToValueAtTime(vol, c.currentTime + t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
      o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
    }
  } catch { /* no audio here: the panel and the buzz still say it */ }
}

/** `ajuste` reads a setting (main.ts passes leerAjuste: importing it here would split the settings menu out of the start bundle). */
export function montarPesca(o: { pesca: Pesca; view: Vista; session: Sesion; hud: HTMLElement; ajuste?: (id: string) => unknown; interaccion?: () => Manos["interaccion"] }) {
  const ajuste = o.ajuste ?? (() => undefined);
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const tactil = esTactil();
  const hud = o.hud;
  hud.setAttribute("aria-label", "Pesca");
  hud.innerHTML = `<div class="que" role="status"></div>
<div class="resultado" role="status" hidden><div class="titulo"></div><div class="pez"></div><div class="nota"></div></div>
<div class="barras" hidden>
  <div class="barra tension" role="progressbar" aria-label="Tensión del sedal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
  <div class="barra progreso" role="progressbar" aria-label="Pez acercado" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
</div>
<div class="fila"><button id="pesca-recoger" type="button" aria-pressed="false">Recoger</button><button id="pesca-soltar" type="button">Soltar</button></div>
<p class="pista"></p>`;
  const que = hud.querySelector(".que") as HTMLElement, barras = hud.querySelector(".barras") as HTMLElement, fila = hud.querySelector(".fila") as HTMLElement, pista = hud.querySelector(".pista") as HTMLElement;
  const resultado = hud.querySelector(".resultado") as HTMLElement, titulo = resultado.querySelector(".titulo") as HTMLElement, pezEl = resultado.querySelector(".pez") as HTMLElement, nota = resultado.querySelector(".nota") as HTMLElement;
  const tension = hud.querySelector(".barra.tension") as HTMLElement, progreso = hud.querySelector(".barra.progreso") as HTMLElement;
  const recoger = hud.querySelector("#pesca-recoger") as HTMLButtonElement, soltar = hud.querySelector("#pesca-soltar") as HTMLButtonElement;
  const vibrar = (p: number | number[]) => { try { (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(p); } catch { /* not every browser lets a page vibrate */ } };
  const barra = (el: HTMLElement, v: number) => { (el.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(100, v))}%`; el.setAttribute("aria-valuenow", String(Math.round(v))); };
  let audio: AudioContext | null = null;
  const contexto = () => { try { return (audio ??= new AudioContext()); } catch { return null; } };

  // N4 on a phone: the HUD leaves the right column free (the action buttons: «Saltar», the touch bar's «Recoger»…)
  const hacerSitio = () => {
    const a = document.getElementById("acciones")?.getBoundingClientRect();
    const libre = a && a.width > 0 ? Math.max(0, innerWidth - a.left) + 8 : 0;
    if (!libre || innerWidth - libre < 240) { hud.style.left = hud.style.right = hud.style.width = hud.style.transform = ""; return; }
    Object.assign(hud.style, { left: "8px", right: `${Math.round(libre)}px`, width: "auto", transform: "none" });
  };
  addEventListener("resize", () => { if (tactil && !hud.hidden) hacerSitio(); });
  // the hint under the buttons follows what you have in your hands: touch, a gamepad, or the keyboard
  const hayMando = () => { try { return [...(navigator.getGamepads?.() ?? [])].some((g) => !!g?.connected); } catch { return false; } };
  const pistaDe = () => tactil ? "Mantén «Recoger» para tirar; suelta para que descanse el sedal"
    : hayMando() ? "Mantén A (o RT) para recoger · B suelta la caña" : "Mantén F para recoger · X suelta la caña";
  addEventListener("gamepadconnected", () => pintar()); addEventListener("gamepaddisconnected", () => pintar());
  let fase: Estado["fase"] = "nada", arrancada: Estado["arrancada"] = "no", manteniendo = false, resultadoHasta = 0, temporizador: ReturnType<typeof setTimeout> | null = null;
  const mostrarResultado = (clase: "pescado" | "escapado", t: string, p: string, n: string) => {
    resultado.className = `resultado ${clase}`; titulo.textContent = t; pezEl.textContent = p; nota.textContent = n;
    resultadoHasta = performance.now() + RESULTADO_MS;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => { temporizador = null; pintar(); }, RESULTADO_MS + 20);
  };
  const pintar = () => {
    const e = o.pesca.estado();
    if (e.fase !== fase) {
      if (e.fase === "picada") vibrar(80);
      if (e.fase === "pelea") vibrar([40, 30, 40]);
      if (e.fase === "nada" && fase !== "nada") { // the fight just ended: say clearly how
        if (e.ultimo && /^Has pescado/.test(e.aviso)) {
          mostrarResultado("pescado", "¡Pescado!", `🐟 ${e.ultimo.pez} · ${cmTexto(e.ultimo.cm)}`, `${RAREZA[e.ultimo.rareza] ?? e.ultimo.rareza} · En tu cesta: ${e.cesta.peces}`);
          vibrar([60, 40, 60, 40, 220]); sonar("exito", contexto, ajuste);
        } else if (e.aviso && !/^Has recogido/.test(e.aviso)) {
          mostrarResultado("escapado", "Se ha escapado", e.aviso.replace(/\.$/, ""), "Vuelve a lanzar la caña");
          vibrar(120); sonar("fallo", contexto, ajuste);
        }
      }
      fase = e.fase;
    }
    const pescando = e.fase !== "nada", conResultado = !pescando && performance.now() < resultadoHasta;
    hud.hidden = !pescando && !conResultado;
    if (tactil && !hud.hidden) hacerSitio();
    resultado.hidden = !conResultado;
    que.hidden = !pescando; fila.hidden = !pescando; pista.hidden = !pescando;
    if (e.arrancada === "aviso" && arrancada !== "aviso") vibrar(30);
    arrancada = e.arrancada;
    const texto = consejo(e); // N4: what to do now, not just the phase («¡Afloja, que se rompe el sedal!»)
    que.textContent = texto || TEXTO[e.fase].replace("{pez}", e.pez);
    pista.textContent = pistaDe();
    que.classList.toggle("picada", e.fase === "picada");
    barras.hidden = e.fase !== "pelea";
    barra(tension, e.tension); barra(progreso, e.progreso);
    tension.classList.toggle("alta", e.tension >= 80);
    tension.classList.toggle("arrancada", e.arrancada !== "no");
    recoger.setAttribute("aria-pressed", String(e.recogiendo));
    o.view.pesca.estado({ fase: e.fase, desde: e.desde, tension: e.tension, progreso: e.progreso, arrancada: e.arrancada, texto });
  };
  const yo = () => o.session.entity;
  o.pesca.alCambiar((que) => {
    if (que === "estado") pintar();
    else if (que === "flotadores") o.view.pesca.flotadores(o.pesca.flotadores(), yo());
    else if (que === "capturas") o.view.pesca.capturas(o.pesca.capturas(), yo());
    else o.view.pesca.sitios(o.pesca.sitios());
  });
  o.view.pesca.sitios(o.pesca.sitios()); o.view.pesca.flotadores(o.pesca.flotadores(), yo()); o.view.pesca.capturas(o.pesca.capturas(), yo()); pintar();

  // the big button: hold = reel, let go = rest (pointer capture so a finger that slides off still lets go)
  const abajo = (ev: PointerEvent) => { ev.preventDefault(); ev.stopPropagation(); recoger.setPointerCapture(ev.pointerId); manteniendo = true; o.pesca.recoger(true); };
  const arriba = (ev: PointerEvent) => { ev.stopPropagation(); if (!manteniendo) return; manteniendo = false; o.pesca.recoger(false); };
  recoger.addEventListener("pointerdown", abajo);
  recoger.addEventListener("pointerup", arriba); recoger.addEventListener("pointercancel", arriba); recoger.addEventListener("lostpointercapture", arriba);
  recoger.addEventListener("keydown", (e) => { if ((e.code === "Space" || e.code === "Enter") && !e.repeat) { e.preventDefault(); manteniendo = true; o.pesca.recoger(true); } });
  recoger.addEventListener("keyup", (e) => { if (e.code === "Space" || e.code === "Enter") { manteniendo = false; o.pesca.recoger(false); } });
  soltar.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  soltar.addEventListener("click", () => { o.pesca.soltar(); soltar.blur(); });
  // keyboard: hold F reels, X lets go of the rod; never while typing or not fishing
  addEventListener("keydown", (e) => {
    if (e.repeat || escribiendo(e) || o.pesca.estado().fase === "nada" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyF") { e.preventDefault(); manteniendo = true; o.pesca.recoger(true); }
    else if (e.code === "KeyX") { e.preventDefault(); o.pesca.soltar(); }
  });
  addEventListener("keyup", (e) => { if (e.code === "KeyF" && manteniendo) { manteniendo = false; if (o.pesca.estado().fase !== "nada") o.pesca.recoger(false); } });
  addEventListener("blur", () => { if (manteniendo) { manteniendo = false; if (o.pesca.estado().fase !== "nada") o.pesca.recoger(false); } });
  const manos = montarPescaManos({ pesca: o.pesca, view: o.view, session: o.session, get interaccion() { return o.interaccion?.(); } });
  return { pintar, manos };
}
