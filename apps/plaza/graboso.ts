// graboso (M18b): the page's side of the Graboso, the relic that records what you see. A «Grabar» entry in the top
// bar's «Cámara» menu and the K key take it out (it starts recording at once) and put it away (the clip is kept); the hard cap
// (packages/client/src/graboso.ts, 30–60 s) puts it away by itself. Video = canvas.captureStream() of the engine's
// canvas (what your camera sees, HUD excluded); audio = your microphone with the browser's permission (denied or no
// https → silent clip, said aloud). A pill at the top centre shows «● 0:12 / 1:00» and, after, Descargar / Ver / Quitar.
// Only the last clip stays, in memory; nothing goes to the server or localStorage. Sharing/uploading is a later row.
// t_f87ffb93 (Y1 connected): a world that DEFINES the Graboso as a relic (aventura/objetos/ has `clase: "graboso"`) shows the
// button, K and the watch's «Grabar» only to whoever carries that relic (`permiso`, the inventory's `grabosoLibre`); a world
// that does not define it keeps the Graboso for everyone, as before. «Invocar» in the panel L is still to do.
// Design: ../../../mmo-browser-study/GRABOSO-DISENO.md.
import { icono } from "./iconos.ts";
import { crearGraboso, elegirFormato, TOPE_S, type Clip, type Estado, type Grabador } from "../../packages/client/src/graboso.ts";
import { escribiendo } from "./escribiendo.ts";

const TECLA = "KeyK";
export type OpcionesGraboso = {
  lienzo: HTMLCanvasElement;                                   // the engine's canvas (view.renderer.domElement)
  view: { graboso: { mostrar(si: boolean): void; grabando(si: boolean): void } }; // the head over your shoulder
  barra: HTMLElement | null;                                   // the top bar (#barra-arriba); the button goes there
  decir(t: string): void;                                      // the page's polite aria-live line
  cuadros?: number;                                            // frames per second asked of captureStream (30)
  xr?: { presentando(): boolean; espejo: Espejo };             // inside an XR session the canvas gets no frames: film the mirror instead
  /** The inventory's rule (features/inventario/reglas.ts `grabosoLibre`): may this player use the Graboso now? Absent = always (a page with no inventory). */
  permiso?: { libre(): boolean; alCambiar(fn: () => void): () => void };
};
/** The XR mirror (packages/render/src/espejo-xr.ts through view.espejoGrabar): a small 2D canvas that follows one eye. */
export type Espejo = { encender(): Promise<HTMLCanvasElement>; apagar(): void };

/** Which canvas the recorder films: the engine's, or (inside an XR session) the mirror of one eye. Pure, so a test can pin it. */
export async function elegirFuente(lienzo: HTMLCanvasElement, xr?: { presentando(): boolean; espejo: Espejo }): Promise<{ fuente: HTMLCanvasElement; espejo: boolean }> {
  if (xr?.presentando()) return { fuente: await xr.espejo.encender(), espejo: true };
  return { fuente: lienzo, espejo: false };
}

const CSS = `
#graboso-hud { position: fixed; left: 50%; top: 108px; transform: translateX(-50%); z-index: 8; display: none; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 999px; background: rgba(20, 24, 30, .82); color: #eef2f6; font: 600 13px "Geist", system-ui, sans-serif; }
#graboso-hud.visible { display: flex; }
#graboso-hud .punto { width: 10px; height: 10px; border-radius: 50%; background: #D33440; animation: graboso-latido 1.2s ease-in-out infinite; }
#graboso-hud.listo .punto { background: #A6DAD5; animation: none; }
@keyframes graboso-latido { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { #graboso-hud .punto { animation: none; } }
#graboso-hud .tiempo { font-variant-numeric: tabular-nums; min-width: 7ch; }
#graboso-hud button, #graboso-hud select { min-height: 28px; padding: 2px 8px; border: 1px solid #3A332D; border-radius: 6px; background: #292420; color: #F9EBDC; font: inherit; }
#graboso-hud button:hover { border-color: #C4B5A6; }
#graboso-hud a { color: #A6DAD5; }
#graboso-video { position: fixed; left: 50%; top: 154px; transform: translateX(-50%); z-index: 8; width: min(480px, calc(100vw - 20px)); border-radius: 8px; background: #000; }
#graboso-video[hidden] { display: none; }
#barra-arriba > #graboso[aria-pressed="true"] { background: var(--n-grana, #D33440) !important; color: #fff !important; border-color: var(--n-grana, #D33440) !important; }
`;

/** The real recorder: MediaRecorder over the canvas stream (+ the microphone when allowed). Built once per clip. */
export function grabadorDeNavegador(lienzo: HTMLCanvasElement, cuadros = 30, xr?: OpcionesGraboso["xr"]): Grabador {
  let rec: MediaRecorder | null = null, mic: MediaStream | null = null, trozos: Blob[] = [], tipo = "", espejo: Espejo | null = null;
  return {
    async empezar(t) {
      if (typeof MediaRecorder === "undefined" || typeof lienzo.captureStream !== "function") throw new Error("este navegador no sabe grabar el lienzo");
      const f = await elegirFuente(lienzo, xr); espejo = f.espejo ? xr!.espejo : null; // the mirror only runs while it is filmed
      const video = f.fuente.captureStream(cuadros);
      let sonido = false;
      if (navigator.mediaDevices?.getUserMedia) {
        try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); sonido = true; }
        catch { mic = null; } // denied or no device: the clip goes silent and crearGraboso says so
      }
      try {
        const flujo = new MediaStream([...video.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])]);
        trozos = []; tipo = t;
        rec = new MediaRecorder(flujo, { mimeType: t, videoBitsPerSecond: 4_000_000 });
        rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) trozos.push(e.data); };
        rec.start(1000); // a chunk per second: a hard close loses at most one
      } catch (e) { espejo?.apagar(); espejo = null; mic?.getTracks().forEach((p) => p.stop()); mic = null; throw e; }
      return { sonido };
    },
    parar() {
      return new Promise<{ blob: Blob | null; tipo: string }>((ok) => {
        const r = rec; rec = null;
        const cerrar = () => {
          mic?.getTracks().forEach((p) => p.stop()); mic = null;
          espejo?.apagar(); espejo = null;
          r?.stream.getTracks().forEach((p) => p.stop());
          ok({ blob: trozos.length ? new Blob(trozos, { type: tipo.split(";")[0] }) : null, tipo });
        };
        if (!r || r.state === "inactive") return cerrar();
        r.onstop = cerrar;
        try { r.stop(); } catch { cerrar(); }
      });
    },
  };
}

export function montarGraboso(o: OpcionesGraboso) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const boton = document.createElement("button");
  boton.type = "button"; boton.id = "graboso"; boton.setAttribute("aria-pressed", "false"); boton.setAttribute("aria-keyshortcuts", "K");
  // ux2-barra: «Grabar», an entry of the bar's «Cámara» menu (K still takes the Graboso out and puts it away)
  const etiqueta = (t: string) => { boton.innerHTML = `${icono("record")}<span class="solo-lector">${t}</span>`; }; // constants only
  etiqueta("Grabar");
  boton.title = "Grabar (K): el Graboso graba lo que ves y dices, de 30 s a 1 min; guárdalo y descarga el clip.";
  if (o.barra) o.barra.appendChild(boton); else document.body.appendChild(boton);
  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  const libre = () => { try { return o.permiso ? o.permiso.libre() : true; } catch { return true; } };

  const hud = document.createElement("div"); hud.id = "graboso-hud"; hud.setAttribute("aria-label", "El Graboso");
  const punto = document.createElement("span"); punto.className = "punto"; punto.setAttribute("aria-hidden", "true");
  const tiempo = document.createElement("span"); tiempo.className = "tiempo"; tiempo.textContent = "";
  const tope = document.createElement("select"); tope.setAttribute("aria-label", "Tope del clip");
  for (const [v, t] of [[30, "30 s"], [45, "45 s"], [60, "1 min"]] as const) { const op = document.createElement("option"); op.value = String(v); op.textContent = t; if (v === TOPE_S.defecto) op.selected = true; tope.appendChild(op); }
  const descargar = document.createElement("a"); descargar.textContent = "Descargar"; descargar.hidden = true;
  const ver = document.createElement("button"); ver.type = "button"; ver.textContent = "Ver"; ver.hidden = true; ver.setAttribute("aria-pressed", "false");
  const quitar = document.createElement("button"); quitar.type = "button"; quitar.textContent = "Quitar"; quitar.hidden = true;
  hud.append(punto, tiempo, tope, descargar, ver, quitar);
  const video = document.createElement("video"); video.id = "graboso-video"; video.controls = true; video.hidden = true; video.setAttribute("aria-label", "Tu clip del Graboso");
  document.body.append(hud, video);
  for (const t of ["pointerdown", "wheel", "keydown"]) hud.addEventListener(t, (e) => e.stopPropagation());

  const lienzoTipo = elegirFormato((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  let url = "";
  const soltarUrl = () => { if (url) { URL.revokeObjectURL(url); url = ""; } video.hidden = true; video.removeAttribute("src"); ver.setAttribute("aria-pressed", "false"); };
  const pintar = (e: Estado) => {
    const fuera = e.fase !== "guardado";
    boton.setAttribute("aria-pressed", String(fuera));
    etiqueta(e.fase === "grabando" ? "Guardar" : e.fase === "despertando" ? "Grabar…" : "Grabar");
    o.view.graboso.mostrar(fuera); o.view.graboso.grabando(e.fase === "grabando");
    if (!fuera && boton.hidden !== !libre()) boton.hidden = !libre(); // kept: the button follows the relic again
    hud.classList.toggle("visible", fuera || !!e.clip);
    hud.classList.toggle("listo", !fuera && !!e.clip);
    tope.hidden = fuera;
    const clip = !fuera && e.clip ? e.clip : null;
    descargar.hidden = ver.hidden = quitar.hidden = !clip;
    if (clip) { tiempo.textContent = `Clip ${formato(clip.duracionS)}${clip.conSonido ? "" : " · sin sonido"}`; prepararClip(clip); }
    else if (fuera) tiempo.textContent = e.fase === "despertando" ? "despertando…" : gr.contador();
    else { tiempo.textContent = ""; soltarUrl(); }
  };
  const formato = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let clipPreparado: Clip | null = null;
  const prepararClip = (c: Clip) => {
    if (clipPreparado === c) return;
    soltarUrl(); clipPreparado = c;
    url = URL.createObjectURL(c.blob);
    descargar.href = url; descargar.download = c.nombre;
  };
  const gr = crearGraboso({
    grabador: grabadorDeNavegador(o.lienzo, o.cuadros, o.xr), ahora: () => performance.now(), tipo: lienzoTipo,
    alCambiar: pintar, avisar: (a) => o.decir(a.texto),
  });
  tope.addEventListener("change", () => gr.tope(Number(tope.value)));
  ver.addEventListener("click", () => { const abierto = video.hidden; if (abierto && url) { video.src = url; video.hidden = false; void video.play().catch(() => {}); } else { video.pause(); video.hidden = true; } ver.setAttribute("aria-pressed", String(abierto)); });
  quitar.addEventListener("click", () => { soltarUrl(); clipPreparado = null; gr.quitarClip(); o.decir("Clip descartado."); });
  boton.addEventListener("click", () => { if (libre() || gr.estado.fase !== "guardado") void gr.alternar(); });
  addEventListener("keydown", (e) => { if (e.code === TECLA && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !escribiendo(e)) { if (!libre() && gr.estado.fase === "guardado") return; e.preventDefault(); void gr.alternar(); } });
  // without the relic: no button (the bar's «Cámara» menu hides the entry by itself), no K in the help line, and a recording
  // in progress is kept first (never lose a clip because the relic went back to the Reserva)
  const ayuda = document.getElementById("help"), AYUDA_K = " · K: grabar";
  const pintarPermiso = () => {
    const si = libre();
    if (!si && gr.estado.fase === "grabando") void gr.alternar();
    boton.hidden = !si && gr.estado.fase === "guardado";
    if (ayuda) { const tiene = ayuda.textContent?.includes(AYUDA_K); if (!si && tiene) ayuda.textContent = ayuda.textContent!.replace(AYUDA_K, ""); else if (si && !tiene && !ayuda.textContent?.includes("K: grabar")) ayuda.textContent += AYUDA_K; }
  };
  const sinOirPermiso = o.permiso?.alCambiar(pintarPermiso);
  // the counter and the hard cap, once per second
  let ultimo = "";
  const reloj = setInterval(() => { if (gr.estado.fase !== "grabando") return; gr.tic(); const t = gr.contador(); if (t !== ultimo) { ultimo = t; tiempo.textContent = t; } }, 250);
  addEventListener("pagehide", () => { if (gr.estado.fase === "grabando") void gr.guardar(); });
  pintar(gr.estado); pintarPermiso();
  return { graboso: gr, boton, hud, soporta: !!lienzoTipo, tipo: lienzoTipo, libre, parar: () => { clearInterval(reloj); sinOirPermiso?.(); } };
}
