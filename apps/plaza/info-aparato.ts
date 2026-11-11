// Ajustes › Gráficos «Este aparato» and Ajustes › Cuenta y privacidad «Tu identidad»: read-only facts that used to fill the
// player sheet (rediseño v2, story B: «Tú» shows who you are; the machine's numbers live with the settings they explain).
// `filasAparato` / `filasIdentidad` are pure (test/tu-logica.test.ts); `infoDom` builds a fieldset the settings menu files
// under a category like any group (its rows are `.ajuste` so the search and the category buttons treat them alike).
// Not named «ajustes-…»: dev:lan proxies every path that starts with /a to the server.
import { duracion } from "../../packages/client/src/mapa.ts";
import { tx, alCambiarIdioma } from "../../packages/feature/src/idioma.ts";

export type FuenteInfo = {
  view: { backend: string; power: { mobile: boolean; battery: boolean; scale: number; targetFps(active: boolean): number }; vr: { active: boolean }; ar: { state: string } };
  session: { entity: number; who: { id: string; nombre: string } | null; stats: { rttMs: number; visible: number } };
  /** performance.now() when the server welcomed this page (0 = not yet). */
  desde(): number;
  ahora(): number;
};

/** The device and this visit: graphics, class, frame rate, resolution, battery mode, where you look at it, time, ping, people. */
export function filasAparato(f: FuenteInfo): [string, string][] {
  const p = f.view.power, xr = f.view.vr.active ? tx("virtual reality", "realidad virtual") : f.view.ar.state !== "off" ? tx("augmented reality", "realidad aumentada") : tx("screen", "pantalla");
  const t0 = f.desde(), s = f.session.stats;
  return [
    [tx("Graphics", "Gráficos"), f.view.backend],
    [tx("Class", "Clase"), p.mobile ? tx("phone (watches the heat: fewer frames, lower resolution)", "móvil (cuida el calor: menos cuadros y menos resolución)") : tx("desktop", "escritorio")],
    [tx("Frames per second", "Cuadros por segundo"), tx(`up to ${p.targetFps(true)} while moving, ${p.targetFps(false)} at rest`, `hasta ${p.targetFps(true)} moviéndote, ${p.targetFps(false)} en reposo`)],
    [tx("Resolution", "Resolución"), tx(`${Math.round(p.scale * 100)} %${p.scale < 1 ? " (lowered to stay cool)" : ""}`, `${Math.round(p.scale * 100)} %${p.scale < 1 ? " (bajada para no calentar)" : ""}`)],
    [tx("Battery mode", "Modo batería"), p.battery ? tx("yes (press B to turn it off)", "sí (tecla B para quitarlo)") : tx("no (press B to turn it on)", "no (tecla B para ponerlo)")],
    [tx("Viewing on", "Viendo en"), xr],
    [tx("Connected", "Conectado"), t0 > 0 ? duracion(f.ahora() - t0) : tx("connecting…", "conectando…")],
    ["Ping", s.rttMs < 0 ? "—" : `${s.rttMs} ms`],
    [tx("People in sight", "Personas a la vista"), String(s.visible)],
  ];
}
/** Who this browser is to the world: name, guest id (shortened), your number in this zone. */
export function filasIdentidad(f: Pick<FuenteInfo, "session">): [string, string][] {
  const w = f.session.who;
  return [
    [tx("Name", "Nombre"), w?.nombre ?? tx("Guest (waiting for the server…)", "Invitado (esperando al servidor…)")],
    [tx("Guest id", "Identificador de invitado"), w ? tx(`${w.id.slice(0, 6)}… (the same on every visit from this browser)`, `${w.id.slice(0, 6)}… (el mismo en cada visita desde este navegador)`) : "—"],
    [tx("Your number in this zone", "Tu número en esta zona"), f.session.entity >= 0 ? String(f.session.entity) : "—"],
  ];
}

/** A read-only group: <fieldset data-grupo=id> with a legend, a line and a definition list; `pintar()` refreshes it in place. */
export function infoDom(id: string, nombre: string | (() => string), describe: string | (() => string), filas: () => [string, string][]): { fs: HTMLFieldSetElement; pintar(): void } {
  const fs = document.createElement("fieldset"), lg = document.createElement("legend"), p = document.createElement("p");
  fs.dataset.grupo = id; fs.className = "solo-lectura"; p.className = "describe";
  const rotular = () => { lg.textContent = typeof nombre === "function" ? nombre() : nombre; p.textContent = typeof describe === "function" ? describe() : describe; };
  rotular(); alCambiarIdioma(rotular);
  const fila = document.createElement("div"); fila.className = "ajuste info"; fila.dataset.id = `info.${id}`;
  const dl = document.createElement("dl"); fila.append(dl); fs.append(lg, p, fila);
  let firma = "";
  const pintar = () => {
    const f = filas(), s = JSON.stringify(f);
    if (s === firma) return; firma = s;
    dl.replaceChildren(...f.flatMap(([k, v]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
  };
  pintar();
  return { fs, pintar };
}
