// pantalla (M18, trozo 2): «Compartir pantalla» — LOCAL ONLY. A real button (and the P key) asks the browser for your
// screen (getDisplayMedia) and shows the live picture on the nearest video screen of the world (within 30 m), or in a
// floating window if none is near. Nothing leaves this page: no wire message, nothing to the server, no feature state
// changes; other people keep seeing the screen's file. Sending it to others is the next slice (M18 trozo 3).
// Where it works: desktop Chrome, Firefox and Safari, and iPhone with iOS 27; NOT Android Chrome, Firefox Android or the
// Quest Browser (MDN compat data: no getDisplayMedia) — there the button is hidden (`hidden` attribute) and the help says so.
// The browser opens its picker only inside the click or key handler: getDisplayMedia is called with nothing awaited before it.
// Phones stay cool: when the share stops (the button, P, the browser's own «stop sharing», the track ending) the stream's
// tracks are stopped, the screen gets its file back and the VideoTexture is disposed.
import { icono } from "./iconos.ts";
import { pantallaMasCercana, sePuedeCompartir, fraseInicio, PANTALLA_CERCA_M } from "./pantalla-logica.ts";
import type { Pantalla, Punto } from "./pantalla-logica.ts";

type Vista = { pantallas(): Pantalla[]; pantallaEnVivo(key: string, stream: MediaStream | null): boolean };

const CSS = `
#barra-arriba > #compartir-pantalla[aria-pressed="true"] { background: var(--n-accion, #017C8D) !important; color: #fff !important; border-color: var(--n-accion, #017C8D) !important; }
#pantalla-vista { position: fixed; right: 10px; top: 64px; z-index: 6; width: min(240px, 40vw); aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; background: #000; box-shadow: 0 2px 10px rgba(0, 0, 0, .4); }
#pantalla-vista video { display: block; width: 100%; height: 100%; object-fit: contain; }
#pantalla-vista button { position: absolute; top: 4px; right: 4px; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: rgba(20, 24, 30, .78); color: #eef2f6; display: inline-flex; align-items: center; justify-content: center; }
#pantalla-vista button:focus-visible { outline: 3px solid #ffd27a; }
`;

export function montarPantalla(o: { view: Vista; decir(t: string): void; escribiendo(e: KeyboardEvent): boolean; yo(): Punto | null; nombreDe(key: string): string; construyendo?(): boolean }) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const puede = sePuedeCompartir(navigator, location);
  const boton = document.createElement("button");
  boton.type = "button"; boton.id = "compartir-pantalla"; boton.className = "solo-icono"; boton.setAttribute("aria-pressed", "false");
  boton.hidden = !puede; // the `hidden` attribute: the top bar's display rule for buttons must not win (tema.css)
  const texto = document.createElement("span");
  boton.append(texto);
  document.body.appendChild(boton);
  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch

  // the floating window, for when no screen of the world is near
  const vista = document.createElement("div"); vista.id = "pantalla-vista"; vista.hidden = true; vista.setAttribute("role", "region"); vista.setAttribute("aria-label", "Tu pantalla compartida");
  const video = document.createElement("video"); video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
  const cerrar = document.createElement("button"); cerrar.type = "button"; cerrar.innerHTML = `${icono("x", 18)}<span class="solo-lector">Dejar de compartir la pantalla</span>`; cerrar.title = "Dejar de compartir (P)";
  vista.append(video, cerrar);
  document.body.appendChild(vista);
  for (const el of [vista, cerrar]) el.addEventListener("pointerdown", (e) => e.stopPropagation());

  // the help line says where this works (the button is hidden where it does not)
  const ayuda = document.getElementById("help");
  if (ayuda) ayuda.append(puede ? " · P: compartir pantalla" : " · Compartir pantalla: solo en ordenador (y iPhone con iOS 27)");

  const estado = { puede, compartiendo: false, pantalla: null as string | null, error: "", veces: 0 };
  let flujo: MediaStream | null = null;
  const pintar = () => {
    boton.setAttribute("aria-pressed", String(estado.compartiendo));
    const t = estado.compartiendo ? "Compartiendo tu pantalla (solo la ves tú por ahora; P deja de compartir)" : "Compartir pantalla (P): se ve en la pantalla más cercana del mundo, solo en tu navegador por ahora";
    texto.innerHTML = `${icono("screencast")}<span class="solo-lector">${t}</span>`; boton.title = t;
  };
  function mostrar(stream: MediaStream): void {
    flujo = stream;
    const yo = o.yo();
    const cerca = yo ? pantallaMasCercana(yo, o.view.pantallas(), PANTALLA_CERCA_M) : null;
    if (cerca && o.view.pantallaEnVivo(cerca.key, stream)) estado.pantalla = cerca.key;
    else { estado.pantalla = null; video.srcObject = stream; vista.hidden = false; void video.play().catch(() => {}); }
    estado.compartiendo = true; estado.veces++; pintar();
    o.decir(fraseInicio(estado.pantalla === null ? null : o.nombreDe(estado.pantalla) || "pantalla"));
    for (const t of stream.getTracks()) t.addEventListener("ended", () => { if (flujo === stream) parar("el navegador dejó de compartir"); }, { once: true });
  }
  function empezar(): void {
    if (!estado.puede || estado.compartiendo) return;
    let p: Promise<MediaStream>;
    try { p = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false }); } // synchronous: still inside the gesture
    catch (e) { estado.error = String((e as Error)?.name ?? e); o.decir(`No se pudo compartir la pantalla (${estado.error}).`); return; }
    p.then((s) => { if (estado.compartiendo) { for (const t of s.getTracks()) t.stop(); return; } mostrar(s); })
      .catch((e: unknown) => { estado.error = String((e as Error)?.name ?? e); o.decir(estado.error === "NotAllowedError" ? "No se compartió nada." : `No se pudo compartir la pantalla (${estado.error}).`); });
  }
  function parar(por = ""): void {
    if (!estado.compartiendo) return;
    const s = flujo; flujo = null;
    if (s) for (const t of s.getTracks()) t.stop();
    if (estado.pantalla !== null) o.view.pantallaEnVivo(estado.pantalla, null);
    video.pause(); video.srcObject = null; vista.hidden = true;
    estado.compartiendo = false; estado.pantalla = null; pintar();
    o.decir(por ? `Has dejado de compartir la pantalla (${por}).` : "Has dejado de compartir la pantalla.");
  }
  const alternar = () => { if (estado.compartiendo) parar(); else empezar(); };
  boton.addEventListener("click", (e) => { alternar(); if (e.detail > 0) boton.blur(); });
  cerrar.addEventListener("click", () => parar());
  // P toggles it, unless you are typing or building (while building P pins the selected thing)
  addEventListener("keydown", (e) => { if (e.code === "KeyP" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !o.escribiendo(e) && !o.construyendo?.() && !boton.hidden) alternar(); });
  pintar();
  return { estado, alternar, parar };
}
