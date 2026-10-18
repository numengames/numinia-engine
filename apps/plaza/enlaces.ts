// enlaces (J4): «clic sobre cosas del mundo y abrir enlaces». A thing may carry an address (features/objetos: enlace,
// set from the inspector: apps/plaza/constructor.ts). Hovering it while playing turns the pointer into a hand (the
// affordance: this opens something); a click asks once («¿abrir https://…?», so nobody leaves the world by accident)
// and then opens it in a new tab (window.open, never this one: a world must not navigate itself away). Building mode,
// dragging the camera or a long press (orbit) never trigger it — interactuar.ts already filters those out; `pinchar`
// only runs on a true click release. Mirrors huecos.ts (U12): same shape, a different page module, no shared file.
type Objeto = { id: string; enlace?: unknown };
export type OpcionesEnlaces = {
  constructor: { objeto(id: string): Objeto | null };
  view: { renderer: { domElement: HTMLElement }; pickThing?(x: number, y: number): string | null };
  construyendo(): boolean; // build panel open or camera in build mode: no hover, no click-opens-link
  confirmar?(texto: string): boolean; // injectable for tests; default: window.confirm
  abrir?(url: string): void;         // injectable for tests; default: window.open(url, "_blank", "noopener")
};

const enlaceDe = (o: Objeto | null): string => { const s = String(o?.enlace ?? "").trim(); return s; };

export function montarEnlaces(o: OpcionesEnlaces) {
  const confirmar = o.confirmar ?? ((t: string) => confirm(t));
  const abrirUrl = o.abrir ?? ((url: string) => { window.open(url, "_blank", "noopener"); });
  const lienzo = o.view.renderer.domElement;

  /** A click on a thing while playing: if it carries a link, confirm and open it. True = it was a link (claimed). */
  const pinchar = (key: string): boolean => {
    if (o.construyendo()) return false;
    const url = enlaceDe(o.constructor.objeto(key));
    if (!url) return false;
    if (confirmar(`¿Abrir en una pestaña nueva?\n${url}`)) abrirUrl(url);
    return true; // claimed either way: a "no" to the confirm must not fall through to anything else
  };

  // ---- the hand cursor: only while playing, only over a thing that actually opens something ----
  let encima = false;
  const mover = (e: PointerEvent) => {
    if (o.construyendo()) { if (encima) { lienzo.style.cursor = ""; encima = false; } return; }
    const k = o.view.pickThing?.(e.clientX, e.clientY);
    const tiene = !!k && !!enlaceDe(o.constructor.objeto(k));
    if (tiene !== encima) { lienzo.style.cursor = tiene ? "pointer" : ""; encima = tiene; }
  };
  lienzo.addEventListener("pointermove", mover);
  lienzo.addEventListener("pointerleave", () => { if (encima) { lienzo.style.cursor = ""; encima = false; } });

  return { pinchar };
}
