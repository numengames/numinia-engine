// U3: the clock beside the minimap (#reloj, density Normal, glass). HH:MM, local or UTC by `interfaz.hora`; redraws once a minute.
import { etiquetaHora, formatoHora, modoHora, msHastaMinuto } from "../../packages/client/src/reloj.ts";
import type { ModoHora } from "../../packages/client/src/reloj.ts";

type Registro = { get(id: string): unknown; alAplicar(id: string, fn: (v: unknown) => void): void };

export function montarReloj(a: Registro): void {
  const caja = document.getElementById("reloj"), hora = document.getElementById("reloj-hora");
  if (!caja || !hora) return;
  let modo: ModoHora = modoHora(a.get("interfaz.hora")), timer: ReturnType<typeof setTimeout> | undefined;
  const pintar = () => {
    const t = formatoHora(Date.now(), modo);
    if (hora.textContent !== t) hora.textContent = t;
    caja.title = etiquetaHora(modo); caja.setAttribute("aria-label", `${etiquetaHora(modo)}: ${t}`);
  };
  const seguir = () => { clearTimeout(timer); pintar(); timer = setTimeout(seguir, msHastaMinuto(Date.now())); };
  a.alAplicar("interfaz.hora", (v) => { modo = modoHora(v); pintar(); });
  seguir();
}
