// t_45ef2f70 (third step): the Inventario's façade. inventario.ts (the Bolsa panel: slots, equipment, drag and drop, the
// item card: ~5 kB gz) is not needed to draw the first frame, so main.ts mounts THIS: the same `{ abrir, cerrar, pintar }`
// whose calls wait for the real panel and run in order when it lands after the first frame. The bar's button and R
// (when the builder does not own the letter) bring it right away. The summary line and the pulse on the button stay in
// the start bundle (inventario-resumen.ts): the sheet, the VR menu and fishing use them.
import { crearPuerta } from "./puerta.ts";
import { escribiendo } from "./escribiendo.ts";

type Real = ReturnType<typeof import("./inventario.ts").montarInventario>;
type Ctl = Parameters<typeof import("./inventario.ts").montarInventario>[0];
export type InventarioPuerta = Real;

export function montarInventarioPuerta(c: Ctl, boton: HTMLButtonElement): InventarioPuerta {
  boton.setAttribute("aria-haspopup", "dialog"); boton.setAttribute("aria-controls", "inventario");
  boton.setAttribute("aria-expanded", "false"); boton.setAttribute("aria-keyshortcuts", "R");
  const alClic = (): void => ya((r) => r.abrir());
  const alTeclado = (e: KeyboardEvent): void => {
    if (e.repeat || e.code !== "KeyR" || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e) || document.body.classList.contains("construyendo")) return;
    e.preventDefault(); e.stopPropagation(); ya((r) => r.abrir());
  };
  const puerta = crearPuerta<Real>(async () => {
    const m = await import("./inventario.ts");
    boton.removeEventListener("click", alClic); removeEventListener("keydown", alTeclado, { capture: true }); // the real panel listens from now on
    return m.montarInventario(c, boton);
  }, "inventario");
  boton.addEventListener("click", alClic);
  addEventListener("keydown", alTeclado, { capture: true });
  /** Queue and bring the panel now (the person pressed something that needs it). */
  const ya = (f: (r: Real) => void): void => { puerta.despues(f); void puerta.cargarYa().catch(() => {}); };
  return {
    abrir: () => ya((r) => r.abrir()),
    cerrar: () => { puerta.real()?.cerrar(); },
    pintar: ((...a: unknown[]) => puerta.despues((r) => (r.pintar as (...x: unknown[]) => void)(...a))) as Real["pintar"],
  };
}
