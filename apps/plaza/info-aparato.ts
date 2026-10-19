// Ajustes › Gráficos «Este aparato» and Ajustes › Cuenta y privacidad «Tu identidad»: read-only facts that used to fill the
// player sheet (rediseño v2, story B: «Tú» shows who you are; the machine's numbers live with the settings they explain).
// `filasAparato` / `filasIdentidad` are pure (test/tu-logica.test.ts); `infoDom` builds a fieldset the settings menu files
// under a category like any group (its rows are `.ajuste` so the search and the category buttons treat them alike).
// Not named «ajustes-…»: dev:lan proxies every path that starts with /a to the server.
import { duracion } from "../../packages/client/src/mapa.ts";

export type FuenteInfo = {
  view: { backend: string; power: { mobile: boolean; battery: boolean; scale: number; targetFps(active: boolean): number }; vr: { active: boolean }; ar: { state: string } };
  session: { entity: number; who: { id: string; nombre: string } | null; stats: { rttMs: number; visible: number } };
  /** performance.now() when the server welcomed this page (0 = not yet). */
  desde(): number;
  ahora(): number;
};

/** The device and this visit: graphics, class, frame rate, resolution, battery mode, where you look at it, time, ping, people. */
export function filasAparato(f: FuenteInfo): [string, string][] {
  const p = f.view.power, xr = f.view.vr.active ? "realidad virtual" : f.view.ar.state !== "off" ? "realidad aumentada" : "pantalla";
  const t0 = f.desde(), s = f.session.stats;
  return [
    ["Gráficos", f.view.backend],
    ["Clase", p.mobile ? "móvil (cuida el calor: menos cuadros y menos resolución)" : "escritorio"],
    ["Cuadros por segundo", `hasta ${p.targetFps(true)} moviéndote, ${p.targetFps(false)} en reposo`],
    ["Resolución", `${Math.round(p.scale * 100)} %${p.scale < 1 ? " (bajada para no calentar)" : ""}`],
    ["Modo batería", p.battery ? "sí (tecla B para quitarlo)" : "no (tecla B para ponerlo)"],
    ["Viendo en", xr],
    ["Conectado", t0 > 0 ? duracion(f.ahora() - t0) : "conectando…"],
    ["Ping", s.rttMs < 0 ? "—" : `${s.rttMs} ms`],
    ["Personas a la vista", String(s.visible)],
  ];
}
/** Who this browser is to the world: name, guest id (shortened), your number in this zone. */
export function filasIdentidad(f: Pick<FuenteInfo, "session">): [string, string][] {
  const w = f.session.who;
  return [
    ["Nombre", w?.nombre ?? "Invitado (esperando al servidor…)"],
    ["Identificador de invitado", w ? `${w.id.slice(0, 6)}… (el mismo en cada visita desde este navegador)` : "—"],
    ["Tu número en esta zona", f.session.entity >= 0 ? String(f.session.entity) : "—"],
  ];
}

/** A read-only group: <fieldset data-grupo=id> with a legend, a line and a definition list; `pintar()` refreshes it in place. */
export function infoDom(id: string, nombre: string, describe: string, filas: () => [string, string][]): { fs: HTMLFieldSetElement; pintar(): void } {
  const fs = document.createElement("fieldset"), lg = document.createElement("legend"), p = document.createElement("p");
  fs.dataset.grupo = id; fs.className = "solo-lectura"; lg.textContent = nombre; p.className = "describe"; p.textContent = describe;
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
