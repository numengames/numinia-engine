// anclar (Pablo 11-11): a box that stays beside someone in the world (the person talking to you, the one who gave your quest),
// and never covers another panel. Every frame while shown: their head on the screen → the first free spot around them (right,
// left, above, below; the side away from the centre first, where your own character stands), kept inside the window. When no spot
// is free it takes the one that covers least. Phones keep their own bottom sheets (nothing here runs on a coarse pointer).
export type Caja = { x: number; y: number; w: number; h: number };
const HUECO = 56, MARGEN = 16;

/** Panels a box beside someone must not cover (the visible ones only; the box itself is skipped). */
export const OCUPADOS = ["#hud-personaje", "#barra-arriba", "#mision-seguida", "#minimapa", "#libro", "#dialogo", "#mision-ahora",
  "#panel-construir", "#dock-construir", "#acciones", "#chat", ".panel-j5[open]", "#ficha-objeto", "#interactuar", "#avisos-pila"];

const corta = (a: Caja, b: Caja): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Where a box of size `t` goes beside a point `p` (screen px), avoiding `ocupado`. Pure, for tests. */
export function sitioLibre(p: { x: number; y: number }, t: { w: number; h: number }, ventana: { w: number; h: number }, ocupado: readonly Caja[]): { x: number; y: number } {
  const dentro = (x: number, y: number): Caja => ({ x: Math.round(Math.min(Math.max(x, MARGEN), ventana.w - MARGEN - t.w)), y: Math.round(Math.min(Math.max(y, MARGEN), ventana.h - MARGEN - t.h)), w: t.w, h: t.h });
  const derecha = dentro(p.x + HUECO, p.y - 40), izquierda = dentro(p.x - HUECO - t.w, p.y - 40);
  const arriba = dentro(p.x - t.w / 2, p.y - HUECO - t.h), abajo = dentro(p.x - t.w / 2, p.y + HUECO * 2);
  const orden = p.x >= ventana.w / 2 ? [derecha, izquierda, arriba, abajo] : [izquierda, derecha, arriba, abajo];
  let mejor = orden[0], menos = Infinity;
  for (const c of orden) {
    const tapa = ocupado.reduce((s, o) => s + corta(c, o), 0);
    if (tapa === 0) return { x: c.x, y: c.y };
    if (tapa < menos) { menos = tapa; mejor = c; }
  }
  return { x: mejor.x, y: mejor.y };
}

/** Keeps `caja` beside `donde()` every frame while `activo()`; adds the class «anclado» and the CSS variables --dlg-x / --dlg-y. */
export function anclar(caja: HTMLElement, donde: () => { x: number; y: number } | null, activo: () => boolean): { seguir(): void } {
  let siguiendo = false;
  const ocupados = (): Caja[] => [...document.querySelectorAll<HTMLElement>(OCUPADOS.join(","))]
    .filter((e) => e !== caja && !caja.contains(e) && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden")
    .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })
    .filter((r) => r.w > 0 && r.h > 0);
  return {
    seguir(): void {
      if (siguiendo || matchMedia("(pointer: coarse)").matches) return;
      siguiendo = true;
      const paso = (): void => {
        if (!activo() || caja.hidden) { siguiendo = false; caja.classList.remove("anclado"); return; }
        const p = donde();
        if (p) {
          const s = sitioLibre(p, { w: caja.offsetWidth, h: caja.offsetHeight }, { w: innerWidth, h: innerHeight }, ocupados());
          caja.style.setProperty("--dlg-x", `${s.x}px`); caja.style.setProperty("--dlg-y", `${s.y}px`); caja.classList.add("anclado");
        } else caja.classList.remove("anclado");
        requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    },
  };
}
