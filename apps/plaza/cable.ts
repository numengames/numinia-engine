// cable (D-041), builder view (historia 5): a read panel inside the build panel listing every trigger a world wires in
// disparadores.json — its name, type, state (ready / waiting / spent) and how many times it has fired — plus, for a
// button, a «Probar» press to fire it without walking up to it (handy to check a cooldown or a one-use trigger before
// anyone else is near it). It is a LIST, not an editor: what each receiver DOES (muestra, teletransporta, …) is not
// part of the state the server sends to the page (not a secret like a lock's code — just not wired yet) and the
// server never rewrites disparadores.json while the instance runs, so wiring stays a file you edit before it starts.
// See PREGUNTAS-cable-h5-6.md for whether a live editor is worth its own piece. Visitors never see this panel.
type Res = { ok: true } | { ok: false; why: string };
export type Disparador = { id: string; nombre: string; tipo: "zona" | "boton"; cooldown: number; unSoloUso: boolean; usos: number; enEspera: boolean; agotado: boolean };
export type OpcionesCable = {
  constructor: { estado: { puede: boolean }; escuchar(fn: (que: string) => void): () => void };
  disparadores: { lista(): Disparador[]; pulsar(id: string): Res; alCambiar(fn: (id: string) => void): () => void };
  decir(texto: string): void; // soltar.ts' status line (role=status)
  panel: HTMLElement | null;  // the build panel: the «Cable» list goes at its end
};

const estadoTexto = (d: Disparador): string => d.agotado ? "agotado" : d.enEspera ? "en espera" : "listo";

export function montarCable(o: OpcionesCable) {
  const caja = document.createElement("div");
  caja.id = "cable-panel"; caja.setAttribute("role", "group"); caja.setAttribute("aria-label", "Cable: disparadores del mundo");
  const titulo = document.createElement("p"); titulo.textContent = "Cable (disparadores del mundo):";
  const lista = document.createElement("ul"); lista.id = "cable-lista";
  caja.append(titulo, lista);
  o.panel?.append(caja);

  const fila = (d: Disparador): HTMLLIElement => {
    const li = document.createElement("li");
    const texto = document.createElement("span");
    texto.textContent = `${d.nombre} (${d.tipo}${d.unSoloUso ? ", un solo uso" : ""}) · ${estadoTexto(d)} · ${d.usos} uso(s)`;
    li.append(texto);
    if (d.tipo === "boton") {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Probar";
      b.title = `Disparar «${d.nombre}» como si lo pulsaras, para comprobar su cableado`;
      b.addEventListener("click", () => { const r = o.disparadores.pulsar(d.id); if (!r.ok) o.decir(`No: ${r.why}.`); });
      li.append(" ", b);
    }
    return li;
  };

  const refrescar = () => {
    caja.style.display = o.constructor.estado.puede ? "" : "none";
    if (!o.constructor.estado.puede) return;
    const ds = o.disparadores.lista();
    if (!ds.length) { lista.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Sin disparadores: añádelos en disparadores.json." })); return; }
    lista.replaceChildren(...ds.map(fila));
  };
  o.constructor.escuchar((que) => { if (que === "permiso") refrescar(); });
  o.disparadores.alCambiar(() => refrescar());
  refrescar();
  return { refrescar };
}
