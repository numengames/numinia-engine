// sol-real (D-076): the world's sun follows the real one where you are — only if (1) the world offers it (entorno `solReal`, a piece a space
// switches on: R-1), (2) YOU switched it on in the settings, and (3) the browser's own question «share your location?» is answered yes.
// The place is read in this browser, rounded to a whole degree (about 100 km) at once, the sun is computed here (packages/render/src/sol-real.ts:
// no weather service, no request), kept in memory only — never sent to the server, never written to the settings or any file. Declining or any
// error switches the setting back off and the world's own sun stays.
import { posicionSol, posicionValida, zonaAproximada } from "../../packages/render/src/sol-real.ts";

export type Accion = "pedir" | "seguir" | "apagar";
/** What to do now: ask the browser for the place, follow with the place already known, or leave the world's own sun. */
export function decidirSolReal(e: { acepta: boolean; ofrece: boolean; zona: boolean; pidiendo: boolean }): Accion {
  if (!e.acepta || !e.ofrece) return "apagar";
  if (e.zona) return "seguir";
  return e.pidiendo ? "seguir" : "pedir";
}

type Ajustes = { get(id: string): unknown; set(id: string, v: unknown): unknown; alCambiar(f: (id: string, v: unknown) => void): unknown };
export type SolRealOpciones = {
  view: { entorno: { ofreceSolReal: boolean; solReal(s: { altura: number; rumbo: number; hora: number } | null): boolean } };
  ajustes: Ajustes;
  decir?: (t: string) => void;
  /** For tests: the browser's geolocation and the clock. */
  geo?: Pick<Geolocation, "getCurrentPosition"> | null;
  ahora?: () => number;
  cadaMs?: number;
};

export function montarSolReal(o: SolRealOpciones) {
  const id = "graficos.solReal";
  const geo = o.geo === undefined ? (typeof navigator !== "undefined" ? navigator.geolocation : null) : o.geo;
  const ahora = o.ahora ?? Date.now;
  let zona: { lat: number; lon: number } | null = null, pidiendo = false, reloj: ReturnType<typeof setInterval> | null = null, solicitudes = 0;
  const apagar = () => { if (reloj) { clearInterval(reloj); reloj = null; } o.view.entorno.solReal(null); };
  const poner = () => { if (zona) o.view.entorno.solReal(posicionSol(ahora(), zona.lat, zona.lon)); };
  function pedir(): void {
    if (!geo) { o.ajustes.set(id, false); o.decir?.("Este navegador no sabe dónde estás: el sol sigue siendo el del mundo."); return; }
    pidiendo = true; solicitudes++;
    geo.getCurrentPosition(
      (p) => {
        pidiendo = false;
        if (!posicionValida(p.coords.latitude, p.coords.longitude)) { o.ajustes.set(id, false); return; }
        zona = zonaAproximada(p.coords.latitude, p.coords.longitude); // rounded NOW: the exact place is not kept
        revisar();
      },
      () => { pidiendo = false; zona = null; o.ajustes.set(id, false); o.decir?.("No has compartido tu ubicación: el sol sigue siendo el del mundo."); },
      { enableHighAccuracy: false, maximumAge: 3600_000, timeout: 20_000 },
    );
  }
  function revisar(): void {
    const a = decidirSolReal({ acepta: o.ajustes.get(id) === true, ofrece: o.view.entorno.ofreceSolReal, zona: !!zona, pidiendo });
    if (a === "apagar") { apagar(); if (o.ajustes.get(id) !== true) zona = null; return; }
    if (a === "pedir") { pedir(); return; }
    if (zona) { poner(); if (!reloj) reloj = setInterval(poner, o.cadaMs ?? 60_000); }
  }
  o.ajustes.alCambiar((cual) => { if (cual === id) revisar(); });
  const vigila = setInterval(revisar, 5000); // the world may start (or stop) offering it while you stand there
  revisar();
  return { revisar, apagar, estado: () => ({ zona: zona ? { ...zona } : null, siguiendo: !!reloj, solicitudes }), parar: () => { clearInterval(vigila); apagar(); } };
}
