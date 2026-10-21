// burbuja (burbujas v1): the small label that stays up while you are inside a voice bubble («En La mesa: solo te oyen los de la mesa»).
// The notice that you entered or left comes from the feature's event (the notices region, which screen readers read); this keeps
// the state visible. Nothing is decided here: the server's relay is what makes the bubble.
export type PaginaBurbuja = {
  mia(): { etiqueta: string; modo: "aislada" | "abierta" } | null;
  alCambiar(fn: () => void): () => void;
};
/** The text of the label for a bubble (kept in step with the server's notice). Pure. */
export const textoCartel = (b: { etiqueta: string; modo: "aislada" | "abierta" }): string => {
  const e = b.etiqueta ? b.etiqueta[0].toLowerCase() + b.etiqueta.slice(1) : "la burbuja";
  return b.modo === "abierta" ? `En ${b.etiqueta}: te oyen los de ${e} y quien esté cerca` : `En ${b.etiqueta}: solo te oyen los de ${e}`;
};
export function montarBurbuja(o: { burbujas: PaginaBurbuja; cartel: HTMLElement }): void {
  const pintar = (): void => {
    const b = o.burbujas.mia();
    if (!b) { if (!o.cartel.hidden) o.cartel.hidden = true; return; }
    const t = textoCartel(b);
    if (o.cartel.textContent !== t) o.cartel.textContent = t; // textContent only: the name is somebody's text
    if (o.cartel.hidden) o.cartel.hidden = false;
  };
  o.burbujas.alCambiar(pintar);
  pintar();
}
