// pantalla-completa: «Watch full screen» — LOCAL ONLY, like «Compartir pantalla». Seated in front of a 3D video screen that shows something
// right now (a share or a playing video), an extra button joins the bottom bar (key F while F is free: not while fishing, building or
// in a wheel/photo mode, which take the key first; the key is the plain KeyF until the keymap lands). It opens the same picture in an overlay <video> over the page and asks the browser
// for real full screen where it lets (phones that cannot still get the overlay, which fills the screen). F, the × button or Esc closes it;
// standing up or the screen going quiet closes it too. In VR there is no DOM full screen: the button is not offered. The sound stays the world's.
import { icono } from "./iconos.ts";
import { pantallaParaVer } from "./pantalla-completa-logica.ts";
import type { Sentado } from "./pantalla-completa-logica.ts";

type Fuente = { video: HTMLVideoElement; enVivo: boolean } | null;
type Vista = { pantallasMostrando(): { key: string; x: number; y: number; z: number }[]; pantallaFuente(key: string): Fuente; vr: { readonly active: boolean } };
const CSS = `
/* the house lays the bar as a 360×80 box (anchored by its bottom): with this chip the row wraps, so the box grows upward instead of dropping the chip off screen */
html body #acciones:has(#pantalla-completa-abrir:not([hidden])) { height: auto !important; }
/* phones hide the whole bar (movil.css): the same button then stands alone above the bottom edge */
#pantalla-completa-abrir.suelto { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 8; min-height: 48px; padding: 0 16px; border: 1px solid var(--n-linea, #444); border-radius: 8px; background: var(--n-elev, rgba(20, 24, 30, .86)); color: var(--n-texto, #eef2f6); font: 600 14px system-ui, sans-serif; }
#pantalla-completa-abrir.suelto[hidden] { display: none; }
#pantalla-completa-abrir.suelto kbd { display: none; }
#pantalla-completa { position: fixed; inset: 0; z-index: 60; background: #000; display: flex; align-items: center; justify-content: center; }
#pantalla-completa[hidden] { display: none; }
#pantalla-completa video { width: 100%; height: 100%; object-fit: contain; background: #000; }
#pantalla-completa button { position: absolute; top: 12px; right: 12px; min-height: 44px; padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 8px; background: rgba(20, 24, 30, .78); color: #eef2f6; font: 600 14px system-ui, sans-serif; }
#pantalla-completa button:focus-visible { outline: 3px solid #ffd27a; }
`;
const ETIQUETA = "Watch full screen";

export function montarPantallaCompleta(o: { view: Vista; sentado(): Sentado | null; escribiendo(e: KeyboardEvent): boolean; teclaLibre(): boolean; barra?: HTMLElement | null }) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const barra = o.barra ?? document.getElementById("acciones");
  const boton = document.createElement("button");
  boton.type = "button"; boton.id = "pantalla-completa-abrir"; boton.hidden = true; boton.title = "Watch what is on the screen in front of you, full screen (Esc to leave)";
  boton.setAttribute("aria-keyshortcuts", "F");
  const rotulo = document.createElement("span"); rotulo.textContent = ETIQUETA; boton.append(rotulo);
  const tecla = document.createElement("kbd"); tecla.textContent = "F"; boton.append(tecla);
  barra?.appendChild(boton);
  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch

  const capa = document.createElement("div"); capa.id = "pantalla-completa"; capa.hidden = true; capa.setAttribute("role", "dialog"); capa.setAttribute("aria-label", "Screen, full screen");
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.autoplay = true; video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
  const cerrarBtn = document.createElement("button"); cerrarBtn.type = "button"; cerrarBtn.innerHTML = `${icono("x", 18)}<span>Exit full screen</span>`;
  capa.append(video, cerrarBtn); document.body.appendChild(capa);
  for (const el of [capa, cerrarBtn]) el.addEventListener("pointerdown", (e) => e.stopPropagation());

  const estado = { oferta: null as string | null, abierta: false, pantalla: null as string | null };
  let resincro: ReturnType<typeof setInterval> | null = null;
  const oferta = (): string | null => pantallaParaVer(o.sentado(), o.view.pantallasMostrando(), { vr: o.view.vr.active })?.key ?? null;

  function abrir(): void {
    const key = estado.abierta ? null : oferta();
    if (!key) return;
    const f = o.view.pantallaFuente(key); if (!f) return;
    estado.abierta = true; estado.pantalla = key;
    const origen = f.video.srcObject as MediaStream | null;
    if (f.enVivo && origen) video.srcObject = origen; // the same MediaStream as the screen in the world
    else { // a file: the same file at the same moment (the world's own <video> stays the one the 3D screen draws from)
      video.srcObject = null; video.loop = true; video.src = f.video.currentSrc || f.video.src;
      const alinear = () => { if (Number.isFinite(f.video.currentTime) && Math.abs(video.currentTime - f.video.currentTime) > 0.5) video.currentTime = f.video.currentTime; };
      video.addEventListener("loadedmetadata", alinear, { once: true }); resincro = setInterval(alinear, 2000);
    }
    capa.hidden = false; void video.play().catch(() => {});
    void capa.requestFullscreen?.().catch(() => {}); // where the browser lets; otherwise the overlay already fills the page
    cerrarBtn.focus({ preventScroll: true });
  }
  function cerrar(): void {
    if (!estado.abierta) return;
    estado.abierta = false; estado.pantalla = null;
    if (resincro) { clearInterval(resincro); resincro = null; }
    video.pause(); video.srcObject = null; video.removeAttribute("src"); video.load();
    capa.hidden = true;
    if (document.fullscreenElement === capa) void document.exitFullscreen().catch(() => {});
    boton.blur();
  }
  /** Re-asked a few times a second: the button follows the seat and the screen; an open picture goes when its reason does. */
  function mirar(): void {
    const movil = (document.documentElement.dataset.aparato ?? "").startsWith("movil"), sitio = movil || !barra ? document.body : barra; // no bar on a phone
    if (boton.parentElement !== sitio) sitio.appendChild(boton);
    boton.classList.toggle("suelto", sitio === document.body);
    estado.oferta = oferta();
    const ver = estado.oferta !== null && !estado.abierta;
    if (boton.hidden === ver) boton.hidden = !ver;
    if (estado.abierta && estado.oferta === null) cerrar(); // stood up, the screen went quiet, or VR started
  }
  const vigia = setInterval(mirar, 250);
  boton.addEventListener("click", () => abrir());
  cerrarBtn.addEventListener("click", () => cerrar());
  document.addEventListener("fullscreenchange", () => { if (estado.abierta && document.fullscreenElement !== capa) { /* Esc leaves real full screen: the overlay goes with it */ cerrar(); } });
  addEventListener("keydown", (e) => {
    if (e.repeat || o.escribiendo(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (estado.abierta && (e.code === "Escape" || e.code === "KeyF")) { e.preventDefault(); cerrar(); }
    else if (!estado.abierta && e.code === "KeyF" && o.teclaLibre() && oferta()) { e.preventDefault(); abrir(); }
  });
  mirar();
  return { estado, abrir, cerrar, mirar, parar: () => { clearInterval(vigia); cerrar(); } };
}
