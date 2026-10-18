// U25: the page's ONE answer to «what device is this interface for» (touch controls, small screen, VR, phone-class
// power). Every module of the page asks `esTactil()` / `perfil()` here instead of matchMedia("(pointer: coarse)"), so
// a forced profile (?aparato=movil-vertical, or the setting «Aparato (desarrollo)») moves the whole interface at once.
// The decision itself is pure and tested: packages/client/src/aparato.ts. Forcing only works in development (vite dev)
// or with ?debug. A phone profile forced on a desktop draws the page again inside a 390×844 (or 844×390) frame, centred,
// so its own media queries see a phone-size window; this outer page then starts nothing else (main.ts stops).
// Not named «aparato.ts»: dev:lan proxies every path that starts with /a to the server.
import { APARATOS, PARAM_APARATO, PARAM_MARCO, decidirAparato, direccionCon, eleccionDesde, escalaMarco, leerReal } from "../../packages/client/src/aparato.ts";
import type { Eleccion, Perfil } from "../../packages/client/src/aparato.ts";
import { CLAVE_GUARDADO } from "../../packages/client/src/ajustes.ts";

// Node tests import modules of the page (misiones.ts…): without a browser this is the plain desktop profile, untouched.
const hayPagina = typeof location !== "undefined" && typeof document !== "undefined";
const params = new URLSearchParams(hayPagina ? location.search : "");
/** Development page (vite dev) or ?debug: development settings and forced profiles are allowed. */
export const desarrollo: boolean = !!import.meta.env?.DEV || params.has("debug");
let guardado: string | null = null;
try { guardado = localStorage.getItem(CLAVE_GUARDADO); } catch { /* private mode, or no browser */ }
const pedido = eleccionDesde({ url: params.get(PARAM_APARATO), guardado, desarrollo });
if (pedido.aviso) console.warn(`[aparato] ${pedido.aviso}`);
let dentro = params.get(PARAM_MARCO) === "dentro";
try { dentro ||= hayPagina && window.top !== window.self; } catch { dentro = true; } // a cross-origin parent: we are framed anyway
const elegido: Perfil = decidirAparato({ eleccion: pedido.eleccion, real: leerReal(), enMarco: dentro });

// the layout class for CSS (html[data-aparato="movil-vertical"], html.tactil) — set before anything is drawn
if (hayPagina) {
  document.documentElement.dataset.aparato = elegido.clase;
  document.documentElement.classList.toggle("tactil", elegido.tactil);
}

/** The profile the whole interface follows (decided once, before the first frame). */
export const perfil = (): Perfil => elegido;
/** Touch controls (joystick, «Saltar», action buttons, touch help texts): the only question most modules ask. */
export const esTactil = (): boolean => elegido.tactil;
/** Where the profile came from: the URL, the setting, or the device itself. */
export const origenPerfil = (): "url" | "ajuste" | "auto" => pedido.de;

/** Switch profile (or leave it with «auto»): the whole tab reloads with ?aparato=<e> — written even for auto, because
 * the URL wins over a kept setting (otherwise a kept «movil-vertical» would frame the page again). */
export function cambiarAparato(e: Eleccion): void {
  const t = (() => { try { return window.top ?? window; } catch { return window; } })();
  try { t.location.replace(direccionCon(t.location.href, e, false)); } catch { location.replace(direccionCon(location.href, e, false)); }
}

/** A phone profile forced on a desktop: replace this page with the frame and return true (main.ts then stops). */
export function montarMarco(): boolean {
  const m = elegido.marco;
  if (!m) return false;
  const css = document.createElement("style");
  css.textContent = `
html, body { background: #14110F !important; }
body.marco-aparato { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 16px; box-sizing: border-box; color: #C4B5A6; font: 12px/1.4 "Geist Mono", ui-monospace, monospace; }
.marco-barra { display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 4px 14px; }
.marco-barra b { color: #F9EBDC; font-weight: 600; }
.marco-barra a { color: #018EA1; text-decoration: none; padding: 2px 6px; border-radius: 6px; }
.marco-barra a:hover, .marco-barra a:focus-visible { background: rgba(1, 142, 161, .14); outline: none; }
.marco-barra a[aria-current] { color: #EFA517; }
.marco-caja { position: relative; flex: none; border: 1px solid rgba(249, 235, 220, .22); border-radius: 8px; overflow: hidden; }
.marco-caja iframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; background: #c9d8e4; }`;
  document.head.appendChild(css);
  const barra = document.createElement("nav");
  barra.className = "marco-barra"; barra.setAttribute("aria-label", "Perfil de aparato");
  const titulo = document.createElement("span");
  const escala = document.createElement("span");
  const b = document.createElement("b"); b.textContent = elegido.clase;
  titulo.append(b, ` · ${m.ancho}×${m.alto} · perfil forzado`);
  barra.append(titulo, escala);
  for (const e of APARATOS) {
    const a = document.createElement("a");
    a.href = direccionCon(location.href, e, false); a.textContent = e;
    if (e === elegido.eleccion) a.setAttribute("aria-current", "page");
    a.addEventListener("click", (ev) => { ev.preventDefault(); cambiarAparato(e); });
    barra.appendChild(a);
  }
  const caja = document.createElement("div");
  caja.className = "marco-caja";
  const fr = document.createElement("iframe");
  fr.title = `El mundo como en un ${elegido.clase.replace("-", " ")} (${m.ancho}×${m.alto})`;
  fr.width = String(m.ancho); fr.height = String(m.alto);
  fr.style.width = `${m.ancho}px`; fr.style.height = `${m.alto}px`;
  fr.allow = "fullscreen; xr-spatial-tracking; microphone; clipboard-write; gamepad";
  fr.src = direccionCon(location.href, elegido.eleccion, true);
  caja.appendChild(fr);
  const ajustar = () => {
    const s = escalaMarco(m, { ancho: innerWidth, alto: innerHeight });
    caja.style.width = `${Math.round(m.ancho * s)}px`; caja.style.height = `${Math.round(m.alto * s)}px`;
    fr.style.transform = s === 1 ? "" : `scale(${s})`;
    escala.textContent = s === 1 ? "1:1" : `escala ${Math.round(s * 100)} %`;
  };
  ajustar();
  addEventListener("resize", ajustar);
  document.body.replaceChildren(barra, caja);
  document.body.className = "marco-aparato";
  document.title = `${document.title} · ${elegido.clase}`;
  (globalThis as unknown as { __numinia?: unknown }).__numinia = { aparato: elegido, marco: { ...m, src: fr.src }, probe: { done: true }, session: { entity: 0 }, carga: { estado: "listo" } };
  return true;
}
