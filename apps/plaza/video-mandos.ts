// U14 (video controls): Pablo, live (17-10) — «the video in the world lacks controls to
// stop it, pause it, turn the volume down and up». First cut, the small thing first: a panel when looking at/aiming at
// a video (the same «E: …» offer of interactuar.ts, with E, a click or — in VR — the controller, J4/xr.ts) with Pausar,
// Parar and my own volume. It works the same on a flat screen and in VR for pause/resume (the usual gesture:
// xr.ts fires `interaccion.usar()` with the controller just like the E key or a click). The visual panel with the
// volume slider and «Parar» is flat-screen only for now: an immersive session (`immersive-vr`) does not request
// `dom-overlay` (packages/render/src/vr.ts; AR does) and the page's HTML is not visible inside the headset —
// VR twin = the panel on the wrist (BACKLOG J13), not built here.
//
// TWO UNDERLYING QUESTIONS, WRITTEN DOWN, NOT DECIDED (Pablo asked for it this way; BACKLOG.md U14):
//   (a) Is the control MINE or the WORLD's? If someone pauses, does it stop for everyone inside (shared cinema, since the
//           clock is shared) or only for whoever touches it? What is here is deliberately MINE ONLY (medios.ts
//           `ControlVideo`: never sent to the server, never touches the shared clock) so as not to decide for Pablo; a
//           real «cinema pause» would be a server-side state, separate.
//   (b) If pausing/stopping is decided to be the world's, who has permission? It must come from the organisation's roles
//           (STD-052, packages/server/src/roles.ts) — today there is no permission for this (the closest is
//           `build-in-worlds`), so this is NOT invented here: it waits until (a) is decided.
import type { ControlVideo } from "../../packages/render/src/index.ts";
import { tx, ligar } from "../../packages/feature/src/idioma.ts";

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
  const parar = document.createElement("button"); parar.type = "button"; ligar(parar, "textContent", "Stop", "Parar");
  // S4: mute — the one that was missing (until today the video's mute was automatic by volume and could not be requested).
  // It is MINE, like the rest of the control: it acts on the graph's gain, it is not sent to the server (U14 is still open).
  const silencio = document.createElement("button"); silencio.type = "button";
  const volumen = document.createElement("input"); volumen.type = "range"; volumen.min = "0"; volumen.max = "100"; volumen.step = "1";
  ligar(volumen, "aria-label", "My volume for this video", "Mi volumen de este vídeo");
  o.panel.append(nombre, pausar, parar, silencio, volumen);

  let actualId = "";
  const control = (): ControlVideo | null => (actualId ? o.controlVideo(actualId) : null);
  const refrescar = () => {
    const c = control();
    o.panel.hidden = !c;
    if (!c) return;
    pausar.textContent = c.pausado() ? tx("Resume", "Reanudar") : tx("Pause", "Pausar");
    const mudo = c.silenciado();
    silencio.textContent = mudo ? tx("Unmute", "Oír") : tx("Mute", "Silenciar");
    silencio.setAttribute("aria-pressed", mudo ? "true" : "false");
    if (document.activeElement !== volumen) volumen.valueAsNumber = Math.round(c.volumen() * 100);
  };
  pausar.addEventListener("click", () => { control()?.alternarPausa(); refrescar(); });
  parar.addEventListener("click", () => { control()?.parar(); refrescar(); });
  silencio.addEventListener("click", () => { control()?.alternarSilencio(); refrescar(); });
  volumen.addEventListener("input", () => { control()?.fijarVolumen(volumen.valueAsNumber / 100); refrescar(); });

  /** The videos a person whose feet are at (x, y, z) may reach, nearest first (an offer for interactuar.ts). E, a
   * click or — in VR — the controller's own trigger (xr.ts) toggle Pausar/Reanudar: the same action everywhere. */
  const cerca = (x: number, z: number): Oferta[] => o.lista()
    .filter((v) => v.tipo === "video")
    .map((v) => ({ v, d: Math.hypot(v.x - x, v.z - z) }))
    .filter(({ d }) => d <= VIDEO_ALCANCE_M)
    .sort((a, b) => a.d - b.d)
    .map(({ v, d }) => ({
      feature: "medios", key: v.id, intent: "", name: v.nombre ?? tx("video", "vídeo"), distance: d,
      prompt: o.controlVideo(v.id)?.pausado() ? tx("resume the video", "reanudar el vídeo") : tx("pause the video", "pausar el vídeo"),
      local: (): Res => {
        actualId = v.id;
        const c = o.controlVideo(v.id);
        if (!c) return { ok: false, why: tx("the video has not loaded yet", "el vídeo aún no se ha cargado") };
        c.alternarPausa();
        nombre.textContent = v.nombre || tx("Video", "Vídeo"); refrescar();
        return { ok: true };
      },
    }));
  setInterval(refrescar, 300); // the panel follows if you walk away (controlVideo turns null once far: U10's own-battery pause)
  return { cerca };
}
