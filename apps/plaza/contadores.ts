// contadores v1 (D-044) — the page part: an accessible panel with the counters near you whose `donde` is panel or
// ambos (each a named group: the name, the value as an <output>, and the orders as buttons while you are within
// reach). The value ticks once a second (what the server publishes) and is NOT a live region: a screen reader must
// not hear every second. The milestones are: the server's `hito` and `llegada` events are announced by the engine
// (V1: the aria-live «avisos» regions), so «quedan 1 minuto» and «Sala 1: tiempo» are read aloud without this file
// doing anything. In VR the HTML is not drawn: the sign in the world (features/contadores/client.ts) and /contador in
// the chat are.
import type { Contador } from "../../features/contadores/client.ts";
import { formato } from "../../features/contadores/client.ts";

type Contadores = {
  lista(): Contador[];
  arranca(id: string): { ok: boolean; why?: string };
  para(id: string): { ok: boolean; why?: string };
  suma(id: string, cuanto?: number): { ok: boolean; why?: string };
  reinicia(id: string): { ok: boolean; why?: string };
  alCambiar(fn: (que: "lista" | "llegada" | "hito" | "aviso") => void): () => void;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e;
};

export function montarContadores(o: { contadores: Contadores; yo: () => { x: number; z: number } | null }): { visibles(): Contador[] } {
  const { contadores, yo } = o;
  const panel = el("section", { id: "contadores-panel" });
  panel.setAttribute("aria-label", "Contadores del mundo");
  panel.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  panel.hidden = true;
  document.body.appendChild(panel);
  const filas = new Map<string, { raiz: HTMLElement; valor: HTMLOutputElement; estado: HTMLElement; botones: HTMLElement; firma: string }>();

  const visibles = (): Contador[] => contadores.lista().filter((c) => c.donde !== "cartel").sort((a, b) => a.nombre.localeCompare(b.nombre));
  const alAlcance = (c: Contador): boolean => { const p = yo(); return !!p && Math.hypot(c.x - p.x, c.z - p.z) <= c.radio + 0.5; };

  const boton = (texto: string, etiqueta: string, run: () => void) => { const b = el("button", { type: "button", textContent: texto }); b.setAttribute("aria-label", etiqueta); b.addEventListener("click", run); return b; };
  const pintar = () => {
    const lista = visibles(), ids = new Set(lista.map((c) => c.id));
    for (const [id, f] of filas) if (!ids.has(id)) { f.raiz.remove(); filas.delete(id); }
    panel.hidden = lista.length === 0;
    for (const c of lista) {
      let f = filas.get(c.id);
      if (!f) {
        const valor = el("output", { className: "valor" });
        valor.setAttribute("aria-live", "off"); // once a second: never read tick by tick (the milestones are announced)
        const estado = el("span", { className: "estado" });
        const botones = el("div", { className: "botones", role: "group" });
        botones.setAttribute("aria-label", `${c.nombre}: órdenes`);
        const raiz = el("div", { className: "contador", role: "group" }, el("p", { className: "nombre", textContent: c.nombre }), valor, estado, botones);
        raiz.setAttribute("aria-label", c.nombre);
        valor.id = `contador-valor-${c.id}`;
        f = { raiz, valor, estado, botones, firma: "" }; filas.set(c.id, f); panel.appendChild(raiz);
      }
      const texto = formato(c.tipo, c.valor, c.tope);
      f.valor.value = texto; f.valor.textContent = texto;
      f.valor.setAttribute("aria-label", `${c.nombre}: ${texto}`);
      f.raiz.dataset.tipo = c.tipo; f.raiz.classList.toggle("marcha", c.marcha);
      f.estado.textContent = c.tipo === "contador" ? (c.tope ? `tope ${c.tope}` : "") : c.marcha ? "en marcha" : "parado";
      const cerca = alAlcance(c), firma = `${cerca}|${c.marcha}|${c.tipo}`;
      if (firma !== f.firma) {
        f.firma = firma;
        if (!cerca) f.botones.replaceChildren();
        else if (c.tipo === "contador") f.botones.replaceChildren(boton("+1", `${c.nombre}: sumar uno`, () => contadores.suma(c.id, 1)), boton("−1", `${c.nombre}: restar uno`, () => contadores.suma(c.id, -1)), boton("Reiniciar", `${c.nombre}: reiniciar`, () => contadores.reinicia(c.id)));
        else f.botones.replaceChildren(c.marcha ? boton("Parar", `${c.nombre}: parar`, () => contadores.para(c.id)) : boton("Arrancar", `${c.nombre}: arrancar`, () => contadores.arranca(c.id)), boton("Reiniciar", `${c.nombre}: reiniciar`, () => contadores.reinicia(c.id)));
      }
    }
  };
  contadores.alCambiar((q) => { if (q === "lista") pintar(); });
  window.setInterval(pintar, 500); // you walk up to a counter: the buttons appear
  pintar();
  return { visibles };
}
