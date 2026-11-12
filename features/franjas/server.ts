// franjas — server part (Y37). Once a second it reads the zone's clock from entorno (read only), works out the band with
// whole numbers and keeps ONE state entry. It emits `franja` exactly once per change, and only while the day cycle runs
// (entorno `ciclo` > 0) and was already running at the previous look: not at start-up, not on arrival, not when a builder
// moves the clock with no cycle. Nothing here reads a real clock, `Math.random` or `Math.sin`; the simulation is untouched.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { franjas, MIRAR_TICKS, ZONA } from "./feature.ts";
import { DESDE_CASA, franjaDeHora, frase, idiomaDeCasa, leerDesde, siguienteDe, textosDe } from "./esquema.ts";
import type { Desde, Franja } from "./esquema.ts";

/** `desde`: the hour each band starts (franjas@1 `desde`; none = the house's 5 / 7 / 18 / 20). `idioma`: "en" (default) or
 * "es". `avisar: false` keeps the state and the query but says nothing aloud (a world that wants silence). */
export type OpcionesFranjas = { desde?: unknown; idioma?: string; avisar?: boolean };

export const crearFranjas = (opts: OpcionesFranjas = {}) => serverPart(franjas, (api: ServerApi) => {
  const r = leerDesde(opts.desde);
  if (!r.ok) api.log(`franjas: the start hours are not used (${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}); the house hours apply`);
  const desde: Desde = r.ok ? r.value : { ...DESDE_CASA };
  const idioma = opts.idioma ?? idiomaDeCasa();
  const textos = textosDe(idioma);
  const avisar = opts.avisar !== false;
  let actual: Franja | null = null, activa = false;

  const leer = (): { franja: Franja; activa: boolean } | null => {
    const v = api.estadoDe("entorno").get(ZONA);
    if (!v) return null; // no environment here: no bands
    return { franja: franjaDeHora(Number(v.hora), desde), activa: Number(v.ciclo ?? 0) > 0 };
  };
  const publicar = (f: Franja, cicla: boolean) => {
    const s = siguienteDe(f);
    if (!api.state.set(ZONA, { franja: f, siguiente: s, desde: desde[s], activa: cicla, texto: frase(idioma, f, desde) })) api.log("franjas: the state does not fit its schema");
  };
  const mirar = () => {
    const l = leer();
    if (!l || (l.franja === actual && l.activa === activa)) return;
    const antes = actual, habiaCiclo = activa;
    actual = l.franja; activa = l.activa;
    publicar(actual, activa);
    if (avisar && antes !== null && antes !== actual && habiaCiclo && activa) {
      api.emit("franja", { franja: actual, anterior: antes, texto: textos.franjas[actual].anuncio }, "all");
      api.log(`[franjas] ${antes} → ${actual}`);
    }
  };
  api.onTick((t) => { if (actual === null || t % MIRAR_TICKS === 0) mirar(); });
  api.on("consultar", (from) => {
    mirar(); // the freshest answer, not the one from up to a second ago
    if (actual === null) return void api.emit("estado", { texto: idioma === "es" ? "Este mundo no tiene franjas del día." : "This world has no time of day." }, { to: from });
    api.emit("estado", { texto: frase(idioma, actual, desde) }, { to: from });
  });
});

export default crearFranjas();
