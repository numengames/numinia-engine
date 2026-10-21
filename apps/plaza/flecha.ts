// T3: the guide arrow. Points at the page button of the step to do now of the followed quest (`misiones.senala()`),
// glued to its edge. Idle (no arrow) it costs nothing: no loop, no observer, no listener on the tick. While there is an
// arrow it re-places itself on a step change, on resize and when something shows/hides (one MutationObserver on
// `hidden`/`class`/`aria-expanded`), coalesced to one requestAnimationFrame.
import { objetivoDeFlecha } from "./flecha-logica.ts";
import "./flecha.css";

type Opciones = { misiones: { senala(): string; alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown } };

const SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2 L22 16 H15 V22 H9 V16 H2 Z"/></svg>';
const HUECO = 4; // px between the arrow and the button
const TAM = 30;

export function montarFlecha({ misiones }: Opciones): { reponer(): void } {
  const flecha = document.createElement("div");
  flecha.id = "flecha-guia"; flecha.setAttribute("role", "img"); flecha.hidden = true; flecha.innerHTML = SVG;
  document.body.append(flecha);

  const visible = (id: string): boolean => {
    const b = document.getElementById(id);
    if (!b || b.hidden || b.hasAttribute("data-oculto") || b.getClientRects().length === 0) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden";
  };
  const titulo = (b: HTMLElement): string => (b.getAttribute("aria-label") || b.title || b.textContent || b.id).replace(/\s+/g, " ").trim();

  let observador: MutationObserver | null = null;
  let pendiente = 0;
  const poner = (): void => {
    pendiente = 0;
    const senala = misiones.senala();
    if (!senala) { apagar(); return; }
    const id = objetivoDeFlecha(senala, visible);
    if (!id) { esconder(); vigilar(); return; } // a step asks for a button nobody can see yet (a dialogue or the phone's drawer covers it): keep watching, it will show
    const b = document.getElementById(id)!;
    const r = b.getBoundingClientRect();
    const abajo = r.top + r.height / 2 < innerHeight / 2; // button in the top half → arrow under it, pointing up
    const x = Math.max(4, Math.min(innerWidth - TAM - 4, r.left + r.width / 2 - TAM / 2));
    const y = abajo ? r.bottom + HUECO : r.top - HUECO - TAM;
    flecha.style.left = `${Math.round(x)}px`; flecha.style.top = `${Math.round(Math.max(0, Math.min(innerHeight - TAM, y)))}px`;
    flecha.dataset.lado = abajo ? "abajo" : "arriba";
    flecha.dataset.objetivo = id;
    const aviso = `Pulsa aquí: ${titulo(b)}`;
    if (flecha.getAttribute("aria-label") !== aviso) flecha.setAttribute("aria-label", aviso);
    flecha.hidden = false;
    vigilar();
  };
  function vigilar(): void {
    if (observador) return;
    observador = new MutationObserver((rs) => { if (rs.some((m) => m.target !== flecha && !flecha.contains(m.target as Node))) reponer(); });
    observador.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "aria-expanded", "data-oculto", "style"] });
    addEventListener("resize", reponer);
  }
  function esconder(): void { flecha.hidden = true; delete flecha.dataset.objetivo; flecha.removeAttribute("aria-label"); }
  function apagar(): void { // no step asks for anything: nothing to watch (nothing runs while there is no arrow)
    esconder();
    if (observador) { observador.disconnect(); observador = null; removeEventListener("resize", reponer); }
  }
  function reponer(): void { if (!pendiente) pendiente = requestAnimationFrame(poner); }

  misiones.alCambiar(reponer);
  reponer();
  return { reponer };
}
