// menu-logica (ux2-barra): the pure part of the top bar's drop-down menus (menu-barra.ts): which entry a key moves the
// focus to, and whether a menu has anything to show. No DOM here, so test/menu-barra.test.ts runs it in node.

/** The index the focus goes to inside a menu of `n` entries of which `visibles` are shown (indices into the n),
 * from `actual` (-1 = none yet), after `tecla` (KeyboardEvent.key). null = the key is not the menu's. Wraps around. */
export function siguienteEntrada(visibles: readonly number[], actual: number, tecla: string): number | null {
  if (!visibles.length) return null;
  const i = visibles.indexOf(actual), ultimo = visibles.length - 1;
  switch (tecla) {
    case "ArrowDown": return visibles[i < 0 || i === ultimo ? 0 : i + 1];
    case "ArrowUp": return visibles[i <= 0 ? ultimo : i - 1];
    case "Home": case "PageUp": return visibles[0];
    case "End": case "PageDown": return visibles[ultimo];
    default: return null;
  }
}

/** The indices of the entries a menu shows now (an entry hides with its own `hidden` attribute). */
export const entradasVisibles = (ocultas: readonly boolean[]): number[] => ocultas.flatMap((o, i) => (o ? [] : [i]));

/** A menu with nothing to show hides its button too (a dead button never stays in the bar). */
export const botonVisible = (ocultas: readonly boolean[]): boolean => ocultas.some((o) => !o);

/** The camera button's state from what its three modes are doing: recording wins (the red dot), then sharing. */
export function estadoCamara(o: { grabando: boolean; compartiendo: boolean }): "grabando" | "compartiendo" | null {
  return o.grabando ? "grabando" : o.compartiendo ? "compartiendo" : null;
}

/** «Teclas y ayuda»: the help line (#help, «WASD: andar · Mayús: correr · …», each module appends its own) as rows of
 * key and what it does. A piece without «: » is a note of its own (key ""); empty pieces and repeats go. */
export function filasDeAyuda(texto: string): Array<{ tecla: string; que: string }> {
  const filas: Array<{ tecla: string; que: string }> = [], vistas = new Set<string>();
  for (const trozo of texto.split("·")) {
    const t = trozo.replace(/\s+/g, " ").trim();
    if (!t || vistas.has(t)) continue;
    vistas.add(t);
    const i = t.indexOf(": ");
    filas.push(i > 0 ? { tecla: t.slice(0, i).trim(), que: t.slice(i + 2).trim() } : { tecla: "", que: t });
  }
  return filas;
}
