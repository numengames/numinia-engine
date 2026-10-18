// U14 (mandos del vídeo): Pablo, en directo (17-10) — «al vídeo que está en el mundo le faltan controles para
// poder pararlo, pausarlo, bajar y subir el volumen». Primer corte, lo pequeño primero: un panel al mirar/apuntar
// un vídeo (la misma oferta «E: …» de interactuar.ts, con E, un clic o — en VR — el mando, J4/xr.ts) con Pausar,
// Parar y mi propio volumen. Funciona igual en pantalla plana y en VR para pausar/reanudar (el mismo gesto de
// siempre: xr.ts dispara `interaccion.usar()` con el mando igual que la tecla E o un clic). El panel visual con el
// deslizador de volumen y «Parar» es de pantalla plana por ahora: una sesión inmersiva (`immersive-vr`) no pide
// `dom-overlay` (packages/render/src/vr.ts; sí lo pide AR) y el HTML de la página no se ve dentro del visor —
// gemelo en VR = el panel en la muñeca (BACKLOG J13), sin construir aquí.
//
// DOS PREGUNTAS DE FONDO ESCRITAS, NO DECIDIDAS (Pablo lo pidió así; BACKLOG.md U14):
//  (a) ¿el mando es MÍO o del MUNDO? Si alguien pausa, ¿para todos los que están dentro (cine compartido, ya que el
//      reloj es compartido) o solo para quien toca? Lo que hay aquí es deliberadamente MÍO SOLO (medios.ts
//      `ControlVideo`: nunca se manda al servidor, nunca toca el reloj compartido) para no decidir por Pablo; un
//      «pausa de cine» de verdad sería un estado del lado del servidor, aparte.
//  (b) Si se decide que pausar/parar es del mundo, ¿quién tiene permiso? Debe salir de los roles de la organización
//      (STD-052, packages/server/src/roles.ts) — hoy no hay un permiso para esto (el más parecido es
//      `build-in-worlds`), así que esto NO se inventa aquí: queda para cuando se decida (a).
import type { ControlVideo } from "../../packages/render/src/index.ts";

type Obj = { id: string; tipo?: string; nombre?: string; x: number; y: number; z: number };
type Res = { ok: true } | { ok: false; why: string };
/** What interactuar.ts offers: a thing in reach whose use runs here, on the page (`local`), instead of an intent. */
export type Oferta = { feature: string; key: string; intent: string; prompt: string; name: string; distance: number; local: () => Res };
export type OpcionesVideoMandos = {
  lista(): Obj[];                              // features/objetos/client.ts `constructor.lista()`
  controlVideo(id: string): ControlVideo | null; // render view (medios.ts, per key)
  panel: HTMLElement;                           // #video-mandos (empty <section>, built here)
};

/** How close a video screen is offered (metres on the ground); same order of magnitude as the hole (huecos.ts). */
export const VIDEO_ALCANCE_M = 5;
const CSS = `
#video-mandos { position: fixed; left: 50%; bottom: 70px; transform: translateX(-50%); z-index: 5; display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px; background: rgba(20, 24, 30, .82); color: #eef2f6; font: 14px/1.4 system-ui, sans-serif; }
#video-mandos[hidden] { display: none; }
#video-mandos button { padding: 7px 10px; border: 0; border-radius: 8px; background: #eef2f6; color: #23303b; font: inherit; font-weight: 600; }
#video-mandos button:focus-visible { outline: 3px solid #ffd27a; }
#video-mandos .nombre { font-weight: 600; color: #ffd27a; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#video-mandos input[type=range] { width: 90px; }
`;

export function montarVideoMandos(o: OpcionesVideoMandos) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const nombre = document.createElement("span"); nombre.className = "nombre";
  const pausar = document.createElement("button"); pausar.type = "button";
  const parar = document.createElement("button"); parar.type = "button"; parar.textContent = "Parar";
  const volumen = document.createElement("input"); volumen.type = "range"; volumen.min = "0"; volumen.max = "100"; volumen.step = "1";
  volumen.setAttribute("aria-label", "Mi volumen de este vídeo");
  o.panel.append(nombre, pausar, parar, volumen);

  let actualId = "";
  const control = (): ControlVideo | null => (actualId ? o.controlVideo(actualId) : null);
  const refrescar = () => {
    const c = control();
    o.panel.hidden = !c;
    if (!c) return;
    pausar.textContent = c.pausado() ? "Reanudar" : "Pausar";
    if (document.activeElement !== volumen) volumen.valueAsNumber = Math.round(c.volumen() * 100);
  };
  pausar.addEventListener("click", () => { control()?.alternarPausa(); refrescar(); });
  parar.addEventListener("click", () => { control()?.parar(); refrescar(); });
  volumen.addEventListener("input", () => control()?.fijarVolumen(volumen.valueAsNumber / 100));

  /** The videos a person whose feet are at (x, y, z) may reach, nearest first (an offer for interactuar.ts). E, a
   * click or — in VR — the controller's own trigger (xr.ts) toggle Pausar/Reanudar: the same action everywhere. */
  const cerca = (x: number, z: number): Oferta[] => o.lista()
    .filter((v) => v.tipo === "video")
    .map((v) => ({ v, d: Math.hypot(v.x - x, v.z - z) }))
    .filter(({ d }) => d <= VIDEO_ALCANCE_M)
    .sort((a, b) => a.d - b.d)
    .map(({ v, d }) => ({
      feature: "medios", key: v.id, intent: "", name: v.nombre ?? "vídeo", distance: d,
      prompt: o.controlVideo(v.id)?.pausado() ? "reanudar el vídeo" : "pausar el vídeo",
      local: (): Res => {
        actualId = v.id;
        const c = o.controlVideo(v.id);
        if (!c) return { ok: false, why: "el vídeo aún no se ha cargado" };
        c.alternarPausa();
        nombre.textContent = v.nombre || "Vídeo"; refrescar();
        return { ok: true };
      },
    }));
  setInterval(refrescar, 300); // the panel follows if you walk away (controlVideo turns null once far: U10's own-battery pause)
  return { cerca };
}
