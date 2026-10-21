// llamar-ia (ia-llamar S11): «Hablar con ella» and the E prompt on the page. Two ways in, one box:
//   - the button on an AI's card / sheet (gente-tarjeta.ts, gente.ts) → hablar(quien)
//   - «E: hablar con Ada» while you are inside Ada's bubble: the SAME prompt the holograms, the lock keypad and the video controls use (interactuar.ts
//     `locales`: it is the one «E» of the page, shown by the nearest thing in reach); it appears on the server's `entras` and goes on `sales`.
// The first time (per browser) a short notice is shown before the box: what you say is read by its brain outside the world and the answer is seen by
// those near (D-083). Then a small box sends the intent `llamar {ia, texto}` (≤ 190 bytes). The server decides everything else and answers you with
// its own notice. Names go in with textContent; innerHTML never receives text.
import { el } from "./gente-comun.ts";
import { promptHablar, sinMarca, textos } from "./gente-ia.ts";
import { aceptarAviso, avisoAceptado, crearDentro } from "./llamar-nucleo.ts";
import { prepararTexto } from "../../features/llamar/client.ts";
import { TEXTO_MAX } from "../../features/llamar/feature.ts";
import type { Cerca } from "./interactuar.ts";

type Res = { ok: boolean; why?: string };
export function montarLlamarIA(o: {
  /** The page's accessor to the feature (features/llamar/client.ts). */
  llamar: { puedeBoton(quien: number): boolean; llamar(ia: number, texto: string): { ok: true } | { ok: false; why: string } };
  ia: { de(quien: number): unknown | null; alCambiar(f: (quien: number, ficha: unknown | null) => void): () => void };
  burbuja: { alEntrar(f: (ia: number, nombre: string) => void): () => void; alSalir(f: (ia: number, nombre: string) => void): () => void };
  /** Metres from you to this player, or null. */
  distancia(quien: number): number | null;
  /** The name over its head (with or without the « · IA» mark). */
  nombre(quien: number): string | null;
  idioma?: () => string;
  almacen?: Pick<Storage, "getItem" | "setItem"> | null;
}) {
  const tx = () => textos(o.idioma?.());
  const dentro = crearDentro();
  const almacen = o.almacen === undefined ? (() => { try { return localStorage; } catch { return null; } })() : o.almacen;
  const existe = (ia: number): boolean => o.ia.de(ia) !== null;
  const puede = (ia: number): boolean => existe(ia) && o.llamar.puedeBoton(ia);
  o.burbuja.alEntrar((ia, nombre) => dentro.entra(ia, nombre));
  o.burbuja.alSalir((ia) => dentro.sale(ia));
  o.ia.alCambiar((quien, ficha) => { if (!ficha) dentro.quita(quien); });

  // ---- the dialog: notice (first time) → box ----
  const d = el("dialog", { id: "llamar-ia", className: "panel-j5" });
  const titulo = el("h2", { id: "llamar-ia-titulo" });
  d.setAttribute("aria-labelledby", "llamar-ia-titulo");
  const aviso = el("p", { id: "llamar-ia-aviso", className: "llamar-aviso" });
  const aceptar = el("button", { type: "button", id: "llamar-ia-aceptar", className: "principal" });
  const cancelarA = el("button", { type: "button", id: "llamar-ia-cancelar-aviso" });
  const filaAviso = el("div", { className: "gente-botones" }, aceptar, cancelarA);
  const campo = el("input", { type: "text", id: "llamar-ia-texto", autocomplete: "off", enterkeyhint: "send" });
  const etiqueta = el("label", { htmlFor: "llamar-ia-texto", className: "gente-letra" });
  const ayuda = el("p", { className: "gente-letra", id: "llamar-ia-ayuda" });
  const contador = el("span", { id: "llamar-ia-contador", className: "llamar-contador" });
  const enviar = el("button", { type: "submit", id: "llamar-ia-enviar", className: "principal" });
  const cancelar = el("button", { type: "button", id: "llamar-ia-cancelar" });
  const estado = el("p", { className: "estado", id: "llamar-ia-estado" }); estado.setAttribute("role", "status");
  const form = el("form", { id: "llamar-ia-form" }, etiqueta, campo, el("div", { className: "llamar-fila" }, ayuda, contador), el("div", { className: "gente-botones" }, enviar, cancelar), estado);
  form.noValidate = true;
  d.append(el("header", {}, titulo), el("div", { className: "cuerpo" }, aviso, filaAviso, form));
  document.body.appendChild(d);
  d.addEventListener("pointerdown", (e) => e.stopPropagation()); // a tap here is not a joystick touch

  let ia = -1, paso: "aviso" | "caja" = "caja";
  const nombreDe = (q: number): string => sinMarca(o.nombre(q) ?? dentro.nombre(q) ?? "");
  function pintar(): void {
    const t = tx(), n = nombreDe(ia);
    titulo.textContent = `${t.cajaTitulo} ${n}`.trim();
    aviso.textContent = t.avisoPrevio; aceptar.textContent = t.aceptar; cancelarA.textContent = t.cancelar;
    etiqueta.textContent = t.cajaEtiqueta; ayuda.textContent = t.cajaAyuda; enviar.textContent = t.enviar; cancelar.textContent = t.cancelar;
    campo.setAttribute("aria-label", t.cajaEtiqueta);
    aviso.hidden = filaAviso.hidden = paso !== "aviso"; form.hidden = paso !== "caja";
  }
  function contar(): void {
    const p = prepararTexto(campo.value);
    contador.textContent = `${p.bytes}/${TEXTO_MAX}`;
    contador.classList.toggle("pasado", p.largo);
    enviar.disabled = p.largo;
  }
  function irACaja(): void {
    paso = "caja"; pintar(); estado.textContent = ""; campo.value = ""; contar(); campo.focus();
  }
  campo.addEventListener("input", () => { contar(); estado.textContent = ""; });
  aceptar.addEventListener("click", () => { aceptarAviso(almacen); irACaja(); });
  cancelarA.addEventListener("click", () => d.close());
  cancelar.addEventListener("click", () => d.close());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = prepararTexto(campo.value);
    if (!p.texto) { estado.textContent = tx().cajaVacia; campo.focus(); return; }
    const r = o.llamar.llamar(ia, p.texto);
    if (!r.ok) { estado.textContent = r.why; return; }
    d.close(); // the server's own notice says whether the call went out
  });

  /** «Hablar con ella» (card, sheet) or E: opens the notice (first time) or the box. */
  function hablar(quien: number | null): Res {
    if (quien === null || !puede(quien)) return { ok: false, why: tx().noSePuede };
    if (d.open) return { ok: true };
    ia = quien;
    paso = avisoAceptado(almacen) ? "caja" : "aviso";
    if (paso === "caja") { estado.textContent = ""; campo.value = ""; }
    pintar(); contar();
    d.showModal();
    if (paso === "caja") campo.focus(); else aceptar.focus();
    return { ok: true };
  }

  return {
    hablar,
    /** The «Hablar con ella» button shows for this AI. */
    puede,
    abierto: (): boolean => d.open,
    /** For interactuar.ts `locales`: «E: hablar con Ada» while you are inside an AI's bubble that takes calls by button. */
    cerca(): Cerca[] {
      if (d.open) return [];
      const c = dentro.elegir(puede, o.distancia);
      if (!c) return [];
      return [{ feature: "llamar", key: `ia:${c.ia}`, intent: "llamar", prompt: promptHablar(c.nombre, o.idioma?.()), name: c.nombre, distance: c.distancia, local: () => hablar(c.ia).ok ? { ok: true } : { ok: false, why: tx().noSePuede } }];
    },
    /** For tests and the page's probe: the bubbles you are inside now. */
    dentro: () => dentro.lista(),
  };
}
