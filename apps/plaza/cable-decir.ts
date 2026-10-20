// cable-decir — the page side of «Decírselo al mundo» (D-041, historia D). It holds NO logic: it sends the sentence, shows
// «Pensando…», then what the SERVER answered — the proposal as a sentence with «Aplicar» / «Cancelar», or the reason it
// said no — and, when the world has no AI (or no quota), it hides the text box and shows the server's reason in its place.
// The model, its key, the closed lists and every check live on the server; the page never sees a key.
import { FRASES, idiomaDe } from "../../features/disparadores/cable-frase.ts";
import type { ClaveFrase } from "../../features/disparadores/cable-frase.ts";

type Res = { ok: true } | { ok: false; why: string };
export type RespuestaDecir = { que: "propuesta"; propuesta: string; frase: string } | { que: "no"; motivo: string } | { que: "creado"; id: string };
export type OpcionesDecir = {
  decir: {
    estado: { puede: boolean; motivo: string };
    pedir(texto: string, idioma?: string): Res; confirmar(propuesta: string): Res;
    alResponder(fn: (r: RespuestaDecir) => void): () => void; alCambiar(fn: () => void): () => void;
  };
  idioma(): string;
  avisar(t: string): void;     // soltar.ts' status line (role=status)
  /** Height of the box in characters the server accepts: only a hint for the browser; the server decides. */
  maximo?: number;
};

export const ESTILO_DECIR = `
#cable-decir{margin:0 0 12px;padding:8px;border:1px solid currentColor;border-radius:8px}
#cable-decir h4{margin:0 0 6px;font-size:1em}
#cable-decir textarea{display:block;width:100%;box-sizing:border-box;min-height:calc(64px / var(--ui,1));font:inherit;padding:6px 8px;resize:vertical}
#cable-decir button{min-height:calc(44px / var(--ui,1));min-width:calc(44px / var(--ui,1));padding:0 12px;font:inherit;margin:6px 6px 0 0}
#cable-decir .decir-estado{margin:6px 0 0}
#cable-decir .decir-propuesta{margin:8px 0 0;padding:8px;border-left:4px solid currentColor}
#cable-decir .decir-propuesta p{margin:0 0 4px;line-height:1.4}
#cable-decir .decir-frase{font-weight:600}
#cable-decir .decir-motivo{margin:0;line-height:1.4}
#cable-decir button:focus-visible,#cable-decir textarea:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}
`;

export function montarDecir(o: OpcionesDecir) {
  const T = (k: ClaveFrase): string => FRASES[idiomaDe(o.idioma())][k];
  const raiz = document.createElement("section");
  raiz.id = "cable-decir"; raiz.setAttribute("aria-label", T("decir.titulo"));
  const titulo = document.createElement("h4"); titulo.textContent = T("decir.titulo");
  const motivo = document.createElement("p"); motivo.className = "decir-motivo"; motivo.id = "cable-decir-motivo";
  const caja = document.createElement("div");
  const area = document.createElement("textarea");
  area.id = "cable-decir-texto"; area.rows = 2; area.maxLength = o.maximo ?? 300;
  area.placeholder = T("decir.ejemplo"); area.setAttribute("aria-label", T("decir.etiqueta"));
  const boton = document.createElement("button"); boton.type = "button"; boton.id = "cable-decir-boton"; boton.textContent = T("decir.boton");
  const estado = document.createElement("p"); estado.className = "decir-estado"; estado.id = "cable-decir-estado"; estado.setAttribute("role", "status"); estado.setAttribute("aria-live", "polite");
  const error = document.createElement("p"); error.className = "decir-estado"; error.id = "cable-decir-error"; error.setAttribute("role", "alert");
  const prop = document.createElement("div"); prop.className = "decir-propuesta"; prop.id = "cable-decir-propuesta"; prop.hidden = true; prop.setAttribute("role", "group"); prop.setAttribute("aria-label", T("decir.propuesta"));
  const intro = document.createElement("p"); intro.textContent = T("decir.propuesta");
  const frase = document.createElement("p"); frase.className = "decir-frase"; frase.id = "cable-decir-frase"; frase.tabIndex = -1;
  const aplicar = document.createElement("button"); aplicar.type = "button"; aplicar.id = "cable-decir-aplicar"; aplicar.textContent = T("decir.aplicar");
  const cancelar = document.createElement("button"); cancelar.type = "button"; cancelar.id = "cable-decir-cancelar"; cancelar.textContent = T("decir.cancelar");
  prop.append(intro, frase, aplicar, cancelar);
  caja.append(area, boton);
  raiz.append(titulo, motivo, caja, estado, error, prop);

  let esperando = false, propuesta = "";
  const limpiar = () => { prop.hidden = true; propuesta = ""; frase.textContent = ""; };
  const pintar = () => {
    const e = o.decir.estado;
    caja.hidden = !e.puede; motivo.hidden = e.puede; motivo.textContent = e.puede ? "" : e.motivo;
    if (!e.puede) { limpiar(); esperando = false; estado.textContent = ""; }
    boton.disabled = esperando; area.disabled = esperando;
  };
  const pedir = () => {
    const t = area.value.trim();
    if (!t || esperando) return;
    error.textContent = ""; limpiar();
    const r = o.decir.pedir(t, idiomaDe(o.idioma()));
    if (!r.ok) { error.textContent = r.why; return; }
    esperando = true; estado.textContent = T("decir.pensando"); pintar();
  };
  boton.addEventListener("click", pedir);
  area.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey || !ev.shiftKey)) { ev.preventDefault(); pedir(); } });
  aplicar.addEventListener("click", () => {
    if (!propuesta) return;
    const r = o.decir.confirmar(propuesta);
    if (!r.ok) { error.textContent = r.why; return; }
    aplicar.disabled = true;
  });
  cancelar.addEventListener("click", () => { limpiar(); estado.textContent = T("decir.cancelado"); area.focus(); });

  o.decir.alResponder((r) => {
    esperando = false; aplicar.disabled = false;
    if (r.que === "propuesta") {
      propuesta = r.propuesta; frase.textContent = r.frase; prop.hidden = false; estado.textContent = ""; error.textContent = "";
      pintar(); aplicar.focus();   // the focus move reads the group's label and the sentence; no toast (on a phone it would cover «Aplicar»)
    } else if (r.que === "no") {
      limpiar(); estado.textContent = ""; error.textContent = r.motivo; pintar();   // role=alert reads it; no toast over the buttons
    } else if (propuesta) {                       // «creado» after our Aplicar
      limpiar(); area.value = ""; error.textContent = ""; estado.textContent = T("decir.hecho"); o.avisar(T("decir.hecho")); pintar(); area.focus();
    }
  });
  o.decir.alCambiar(pintar);
  pintar();
  return { raiz, refrescar: pintar };
}
