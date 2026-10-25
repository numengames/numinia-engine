// reaccion-clic (lote 5, «los moñoñis de la plaza reaccionan al clic»): a plain click (or tap) on a moñoni makes it hop (the render's
// `reaccionar`, packages/render/src/reaccion.ts) and a soft sound. Local to the person who clicked: nothing is sent to the server, and
// nothing changes in the world (it is a greeting, not an event). It is not a click of the builder: while the builder is open the click
// selects, and a drag (the camera) or a long press is not a click.
import { piezasDeMoñoni } from "../../features/espaciobase/bolitas.ts";

const CLIC_PX = 6, CLIC_MS = 450;
type Vista = { renderer: { domElement: HTMLElement }; pick(x: number, y: number): string | null; reaccionar(keys: readonly string[]): number };

export function montarReaccionClic(o: { view: Vista; objetos: () => { id: string; nombre?: unknown }[]; construyendo: () => boolean; sonar?: (id: string) => void }) {
  const lienzo = o.view.renderer.domElement;
  let abajo: { x: number; y: number; t: number } | null = null;
  const tocar = (x: number, y: number): boolean => {
    const k = o.view.pick(x, y);
    if (!k) return false;
    const piezas = piezasDeMoñoni(k, o.objetos());
    if (!piezas.length || !o.view.reaccionar(piezas)) return false;
    o.sonar?.("coger-soltar");
    return true;
  };
  lienzo.addEventListener("pointerdown", (e) => { abajo = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  lienzo.addEventListener("pointerup", (e) => {
    const a = abajo; abajo = null;
    if (!a || e.button !== 0 || o.construyendo()) return;
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > CLIC_PX || performance.now() - a.t > CLIC_MS) return;
    tocar(e.clientX, e.clientY);
  });
  return { tocar };
}
