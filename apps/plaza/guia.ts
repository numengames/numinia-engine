// guia on the page (mundo-hermes M6): the guide walks with the visitor and says one short line in Spanish «usted» when they enter a zone or touch a thing.
// She is a flat white silhouette (shape `guia` of formas-extra.ts) that follows at 3 m — smooth, no physics — and a small speech bubble of plain HTML.
// She never acts: nothing here sends a request, presses a verb or touches the world. Loaded by main.ts only when the switch `guia` is on (nothing of it is in the start bundle).
import type { espejo as Controlador } from "../../features/espejo/client.ts";
import { DISTANCIA_M, aparecerCerca, fraseDe, seguir, zonaDe } from "../../features/espejo/guia.ts";
import type { Pose } from "../../features/espejo/guia.ts";
import { ligar } from "../../packages/feature/src/idioma.ts";

type Ctl = typeof Controlador;
export const CLAVE_FORMA = "espejo:guia";
const DURA_FRASE_MS = 7000;
const CSS = `
#guia-voz { position: fixed; left: 50%; top: 62px; transform: translateX(-50%); z-index: 7; box-sizing: border-box; width: min(92vw, 440px); padding: 10px 14px; background: #000; color: #fff; border: 2px solid #fff; font: 14px/1.4 "DejaVu Sans Mono", "Courier New", monospace; pointer-events: none; }
#guia-voz[hidden] { display: none; }
#guia-voz b { display: block; margin-bottom: 4px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #FFD400; }
#guia-voz span { overflow-wrap: anywhere; }
`;
type Forma = (key: string, f: { forma: "guia"; x: number; z: number; estado: "on"; rumbo: number } | null) => void;

export function montarGuia(o: { espejo: Ctl; yo: () => { x: number; z: number } | null; forma: Forma; mover: (key: string, x: number, z: number, rumbo: number) => void; doc?: Document }) {
  const d = o.doc ?? document;
  const estilo = d.createElement("style"); estilo.textContent = CSS; d.head.appendChild(estilo);
  const voz = d.createElement("div"); voz.id = "guia-voz"; voz.hidden = true; voz.setAttribute("role", "status"); voz.setAttribute("aria-live", "polite");
  const quien = d.createElement("b"), texto = d.createElement("span"); ligar(quien, "textContent", "The guide", "La guía"); voz.append(quien, texto); d.body.appendChild(voz);

  let pose: Pose | null = null, zonaAntes: string | null | undefined, dichoHasta = 0, caminando = false, saludado = false, ultimaFicha = "";
  const decir = (t: string): void => { if (!t) return; texto.textContent = t; voz.hidden = false; dichoHasta = performance.now() + DURA_FRASE_MS; };
  const activa = (): boolean => o.espejo.interruptor.activa("guia") && !!o.espejo.vista()?.guia;
  const frases = (): Record<string, string> => o.espejo.vista()?.guia?.frases ?? {};

  const quitar = (): void => { if (!pose) return; o.forma(CLAVE_FORMA, null); pose = null; voz.hidden = true; zonaAntes = undefined; saludado = false; };
  // touching a thing: the card opens (`ficha`) → she says what that kind of thing is
  const baja = o.espejo.alCambiar((que) => {
    if (que !== "ficha") return;
    const f = o.espejo.estado.ficha;
    if (!f || !activa() || f.objeto === ultimaFicha) { if (!f) ultimaFicha = ""; return; }
    ultimaFicha = f.objeto; decir(fraseDe(frases(), `tocar:${f.objeto.split("/")[0]}`));
  });

  /** Called every frame by the page; returns true while she is moving (so the page keeps drawing). */
  function cuadro(dt: number): boolean {
    if (!activa()) { quitar(); return false; }
    const yo = o.yo();
    if (!yo) return false;
    if (!pose) { pose = aparecerCerca(yo); o.forma(CLAVE_FORMA, { forma: "guia", x: pose.x, z: pose.z, estado: "on", rumbo: pose.rumbo }); }
    const antes = pose;
    pose = seguir(pose, yo, dt / 1000);
    caminando = Math.hypot(pose.x - antes.x, pose.z - antes.z) > 1e-4;
    if (caminando || pose.rumbo !== antes.rumbo) o.mover(CLAVE_FORMA, pose.x, pose.z, pose.rumbo);
    const z = zonaDe(yo.x, yo.z, o.espejo.vista()?.zonas ?? []);
    if (zonaAntes === undefined) { zonaAntes = z; if (!saludado) { saludado = true; decir(fraseDe(frases(), "saludo")); } }
    else if (z !== zonaAntes) { zonaAntes = z; if (z) decir(fraseDe(frases(), z)); }
    if (!voz.hidden && performance.now() > dichoHasta) voz.hidden = true;
    return caminando;
  }
  return { cuadro, decir, quitar, baja, voz, pose: () => pose, activa, distancia: DISTANCIA_M };
}
