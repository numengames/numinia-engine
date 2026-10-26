// medidor-ui (MIS-200 t_ee19c84b): the live frame meter's face. One API (`__numinia.medidorVivo`) and one overlay, both cheap:
//  - the ring of the last frames is always filled (five numbers a frame, no allocation) so a check can read it at any time;
//  - the overlay (`?medidor`, or `encender(true)`) rewrites one <pre> once a second and asks the view for the draw-call census
//    (a scene walk, only while it is on); in a headset the VR panel gets one short line instead;
//  - switched off, nothing is drawn, walked or written to the DOM.
import { crearMedidorVivo, lineaMedidor, lineaMedidorCorta, lineasCenso } from "../../packages/render/src/index.ts";
import type { MedidorVivo } from "../../packages/render/src/medidor-vivo.ts";

export const REFRESCO_MEDIDOR_MS = 1000;

export function montarMedidor(o: { activo: boolean; view: { censo(): unknown }; documento?: Document }) {
  const vivo: MedidorVivo = crearMedidorVivo();
  const doc = o.documento ?? (typeof document !== "undefined" ? document : undefined);
  let encendido = o.activo, pre: HTMLPreElement | null = null, ultimo = 0;
  const asegurar = (): void => {
    if (pre || !doc) return;
    pre = doc.createElement("pre");
    pre.id = "medidor";
    pre.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:99;margin:0;padding:6px 8px;border-radius:6px;background:rgba(10,14,18,.78);color:#9fe8b0;font:11px/1.35 monospace;pointer-events:none;max-width:calc(100vw - 20px);white-space:pre-wrap";
    doc.body.appendChild(pre);
  };
  const textoCenso = (): string[] => { const c = o.view.censo() as Parameters<typeof lineasCenso>[0] | null; return c ? lineasCenso(c) : ["censo: pidiendo…"]; };
  return {
    vivo,
    get activo(): boolean { return encendido; },
    encender(si: boolean): void { encendido = si; if (!si && pre) { pre.remove(); pre = null; } },
    /** A drawn frame (called by the page's loop). */
    cuadro: vivo.cuadro,
    /** The overlay, at most once a second; a no-op when off. */
    pintar(ahora: number): void {
      if (!encendido || ahora - ultimo < REFRESCO_MEDIDOR_MS) return;
      ultimo = ahora; asegurar();
      if (pre) pre.textContent = [lineaMedidor(vivo.resumen()), ...textoCenso()].join("\n");
    },
    /** The line for the VR panel: empty while off. */
    lineaVR(): string[] { return encendido ? [lineaMedidorCorta(vivo.resumen())] : []; },
    /** For checks: the window's numbers and the census of the last asked frame. */
    resumen: () => vivo.resumen(),
    censo: () => o.view.censo(),
    reiniciar: () => vivo.reiniciar(),
  };
}
