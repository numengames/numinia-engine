// V13: the façade of the voice subtitles. The page's first load is capped (limits.json), and nobody needs the column until
// the «Subtítulos de voz» setting is on AND somebody audible talks: the real module (subtitulos.ts) is fetched then, once.
import type { OpcionesSubtitulos } from "./subtitulos.ts";

type Real = ReturnType<typeof import("./subtitulos.ts").montarSubtitulos>;

export function montarSubtitulosPuerta(o: OpcionesSubtitulos) {
  let real: Real | null = null, cargando = false;
  const cargar = (): void => {
    if (real || cargando) return;
    cargando = true;
    void import("./subtitulos.ts").then((m) => { real = m.montarSubtitulos(o); }, () => { cargando = false; }); // offline: the next voice tries again
  };
  return {
    /** voz.ts: this person is audible and talking now. The very first call only brings the module in; the next one (≤ 100 ms later) draws. */
    hablando(entidad: number, escenario: boolean): void { if (!o.activo()) return; if (real) real.hablando(entidad, escenario); else cargar(); },
    olvidar(entidad: number): void { real?.olvidar(entidad); },
    lectores(n: number): void { if (real) real.lectores(n); else if (n > 0) { cargar(); } },
    cajas: (): ReturnType<Real["cajas"]> => real?.cajas() ?? [],
  };
}
