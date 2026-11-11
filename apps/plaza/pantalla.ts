// pantalla (M18, trozos 2 y 3): «Compartir pantalla». A real button (an entry of the bar's «Cámara» menu, P) asks the browser for your
// screen (getDisplayMedia) and shows the live picture on the nearest video screen of the world (within 30 m), or in a
// floating window if none is near. Trozo 3: when it is on a screen of the world, `red` (pantalla-red.ts) also sends it, through the
// server's relay, to everyone within reach of that screen; in the window, nothing leaves this page. No feature state changes.
// Where it works: desktop Chrome, Firefox and Safari, and iPhone with iOS 27; NOT Android Chrome, Firefox Android or the
// Quest Browser (MDN compat data: no getDisplayMedia) — there the button is hidden (`hidden` attribute) and the help says so.
// The browser opens its picker only inside the click or key handler: getDisplayMedia is called with nothing awaited before it.
// Phones stay cool: when the share stops (the entry, the window's ×, the browser's own «stop sharing», the track ending) the stream's
// tracks are stopped, the screen gets its file back and the VideoTexture is disposed.
import { icono } from "./iconos.ts";
import { tx, ligar, alCambiarIdioma } from "../../packages/feature/src/idioma.ts";
import { pantallaMasCercana, sePuedeCompartir, fraseInicio, PANTALLA_CERCA_M } from "./pantalla-logica.ts";
import type { Pantalla, Punto } from "./pantalla-logica.ts";

type Vista = { pantallas(): Pantalla[]; pantallaEnVivo(key: string, stream: MediaStream | null): boolean };
/** M18 trozo 3: what sends the share to the others (apps/plaza/pantalla-red.ts). Absent = local only. */
type Red = { empezar(key: string, stream: MediaStream): void | Promise<void>; parar(): void };

const CSS = `
#barra-arriba > #compartir-pantalla[aria-pressed="true"] { background: var(--n-accion, #017C8D) !important; color: #fff !important; border-color: var(--n-accion, #017C8D) !important; }
#pantalla-vista { position: fixed; right: 10px; top: 64px; z-index: 6; width: min(240px, 40vw); aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; background: #000; box-shadow: 0 2px 10px rgba(0, 0, 0, .4); }
#pantalla-vista video { display: block; width: 100%; height: 100%; object-fit: contain; }
#pantalla-vista button { position: absolute; top: 4px; right: 4px; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: rgba(20, 24, 30, .78); color: #eef2f6; display: inline-flex; align-items: center; justify-content: center; }
#pantalla-vista button:focus-visible { outline: 3px solid #ffd27a; }
`;

export function montarPantalla(o: { view: Vista; decir(t: string): void; escribiendo(e: KeyboardEvent): boolean; yo(): Punto | null; nombreDe(key: string): string; construyendo?(): boolean; red?: Red }) {
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
  const vista = document.createElement("div"); vista.id = "pantalla-vista"; vista.hidden = true; vista.setAttribute("role", "region"); ligar(vista, "aria-label", "Your shared screen", "Tu pantalla compartida");
  const video = document.createElement("video"); video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
  const cerrar = document.createElement("button"); cerrar.type = "button"; alCambiarIdioma(() => { cerrar.innerHTML = `${icono("x", 18)}<span class="solo-lector">${tx("Stop sharing the screen", "Dejar de compartir la pantalla")}</span>`; }); ligar(cerrar, "title", "Stop sharing", "Dejar de compartir"); // i18n-ok: wrapped in tx/ligar
  vista.append(video, cerrar);
  document.body.appendChild(vista);
  for (const el of [vista, cerrar]) el.addEventListener("pointerdown", (e) => e.stopPropagation());

  // the help line says where this works (the button is hidden where it does not)
  const ayuda = document.getElementById("help");
  if (ayuda && !puede) ayuda.append(tx(" · Share screen: desktop only (and iPhone with iOS 27)", " · Compartir pantalla: solo en ordenador (y iPhone con iOS 27)")); // where it works, P: cámara says it

  const estado = { puede, compartiendo: false, pantalla: null as string | null, error: "", veces: 0 };
  let flujo: MediaStream | null = null;
  const pintar = () => {
    boton.setAttribute("aria-pressed", String(estado.compartiendo));
    // ux2-barra: an entry of the bar's «Cámara» menu (P opens the menu): a short name, the long sentence in the tooltip
    const corto = estado.compartiendo ? tx("Stop sharing", "Dejar de compartir") : tx("Share screen", "Compartir pantalla");
    const t = estado.compartiendo ? tx("Sharing your screen", "Compartiendo tu pantalla") : tx("Share screen: people near the nearest screen in the world can see it", "Compartir pantalla: la ven quienes estén cerca de la pantalla más cercana del mundo");
    texto.innerHTML = `${icono("screencast")}<span class="solo-lector">${corto}</span>`; boton.title = t;
  };
  /** Put the share where it belongs now: on the nearest screen of the world (within reach) or in the floating window.
   * True when the place changed. QA Simposio 2026-11-11: the share follows you — starting it far from the stage put it in
   * the window for good; now walking up to the screen moves it there, and walking away brings the window back. */
  let vetada: { key: string; hasta: number } | null = null; // a screen the server refused: not asked again for a while
  function colocar(stream: MediaStream): boolean {
    const yo = o.yo();
    const libres = vetada && vetada.hasta > Date.now() ? o.view.pantallas().filter((p) => p.key !== vetada!.key) : o.view.pantallas();
    const cerca = yo ? pantallaMasCercana(yo, libres, PANTALLA_CERCA_M) : null;
    const destino = cerca?.key ?? null;
    if (destino === estado.pantalla && (destino !== null || !vista.hidden)) return false;
    if (estado.pantalla !== null && estado.pantalla !== destino) o.view.pantallaEnVivo(estado.pantalla, null);
    if (destino !== null && o.view.pantallaEnVivo(destino, stream)) {
      estado.pantalla = destino; video.pause(); video.srcObject = null; vista.hidden = true;
      void o.red?.empezar(destino, stream); // everyone near that screen sees it too
    } else {
      o.red?.parar(); estado.pantalla = null; if (video.srcObject !== stream) video.srcObject = stream; vista.hidden = false; void video.play().catch(() => {});
    }
    return true;
  }
  let vigia: ReturnType<typeof setInterval> | null = null;
  function mostrar(stream: MediaStream): void {
    flujo = stream; estado.pantalla = null; vista.hidden = true;
    colocar(stream);
    estado.compartiendo = true; estado.veces++; pintar();
    o.decir(fraseInicio(estado.pantalla === null ? null : o.nombreDe(estado.pantalla) || "pantalla"));
    if (vigia) clearInterval(vigia);
    vigia = setInterval(() => {
      if (!flujo || !colocar(flujo)) return;
      o.decir(estado.pantalla === null ? tx("You moved away from the screen: your shared screen is back in the window.", "Te has alejado de la pantalla: tu pantalla compartida vuelve a la ventana.") : tx(`Your shared screen now shows on «${o.nombreDe(estado.pantalla) || "screen"}».`, `Tu pantalla compartida se ve ahora en «${o.nombreDe(estado.pantalla) || "pantalla"}».`));
    }, 1000);
    for (const t of stream.getTracks()) t.addEventListener("ended", () => { if (flujo === stream) parar(tx("the browser stopped sharing", "el navegador dejó de compartir")); }, { once: true });
  }
  function empezar(): void {
    if (!estado.puede || estado.compartiendo) return;
    let p: Promise<MediaStream>;
    try { p = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false }); } // synchronous: still inside the gesture
    catch (e) { estado.error = String((e as Error)?.name ?? e); o.decir(tx(`Could not share the screen (${estado.error}).`, `No se pudo compartir la pantalla (${estado.error}).`)); return; }
    p.then((s) => { if (estado.compartiendo) { for (const t of s.getTracks()) t.stop(); return; } mostrar(s); })
      .catch((e: unknown) => { estado.error = String((e as Error)?.name ?? e); o.decir(estado.error === "NotAllowedError" ? tx("Nothing was shared.", "No se compartió nada.") : tx(`Could not share the screen (${estado.error}).`, `No se pudo compartir la pantalla (${estado.error}).`)); });
  }
  function parar(por = ""): void {
    if (!estado.compartiendo) return;
    const s = flujo; flujo = null;
    if (vigia) { clearInterval(vigia); vigia = null; }
    if (s) for (const t of s.getTracks()) t.stop();
    o.red?.parar();
    if (estado.pantalla !== null) o.view.pantallaEnVivo(estado.pantalla, null);
    video.pause(); video.srcObject = null; vista.hidden = true;
    estado.compartiendo = false; estado.pantalla = null; pintar();
    o.decir(por ? tx(`You stopped sharing your screen (${por}).`, `Has dejado de compartir la pantalla (${por}).`) : tx("You stopped sharing your screen.", "Has dejado de compartir la pantalla."));
  }
  /** The server ended or refused my share on `key` (busy, too far, stopped by a moderator, gone): back to the window, and not that screen again for 30 s. */
  function alPararPropia(key: string): void {
    if (!flujo || estado.pantalla !== key) return;
    vetada = { key, hasta: Date.now() + 30_000 };
    o.view.pantallaEnVivo(key, null); estado.pantalla = null;
    if (video.srcObject !== flujo) video.srcObject = flujo; vista.hidden = false; void video.play().catch(() => {});
  }
  const alternar = () => { if (estado.compartiendo) parar(); else empezar(); };
  boton.addEventListener("click", (e) => { alternar(); if (e.detail > 0) boton.blur(); });
  cerrar.addEventListener("click", () => parar());
  // ux2-barra: no key of its own any more — P opens the bar's «Cámara» menu, where this is the third entry
  pintar(); alCambiarIdioma(pintar);
  return { estado, alternar, parar, alPararPropia };
}
