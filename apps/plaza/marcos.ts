// U3 (minimum): the frames. The table in packages/client/src/densidad.ts says where each panel sits (anchor + box), from which
// density it shows and when; this file turns it into ONE stylesheet (cssMarcos), starts the density dial, the clock and the notices'
// stack, and turns the glass off at the lowest quality. No per-frame work: everything here is attributes, one <style> and timers.
import { cssMarcos } from "../../packages/client/src/densidad.ts";
import { montarDensidad } from "./densidad.ts";
import { montarReloj } from "./reloj.ts";
import { montarAvisos } from "./avisos.ts";

type Registro = { get(id: string): unknown; set(id: string, v: unknown): unknown; alAplicar(id: string, fn: (v: unknown) => void): void };

export function montarMarcos(a: Registro): ReturnType<typeof montarDensidad> {
  const estilo = document.createElement("style"); estilo.id = "marcos"; estilo.textContent = cssMarcos(); document.head.appendChild(estilo);
  // glass costs a blur per frame on the GPU: «Baja» quality and battery mode draw the panels plain (the wireframe's rule)
  const html = document.documentElement;
  const cristal = () => html.toggleAttribute("data-sin-cristal", a.get("graficos.calidad") === "baja" || a.get("graficos.bateria") === true);
  a.alAplicar("graficos.calidad", cristal); a.alAplicar("graficos.bateria", cristal); cristal();
  const dial = montarDensidad(a);
  montarReloj(a); montarAvisos();
  return dial;
}
