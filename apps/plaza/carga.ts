// U1 on the page's side: the loading screen is plain HTML + a small controller inside index.html (it paints before any module
// loads). This file only gives main.ts a typed handle on `window.__numinia.carga` (and a harmless stand-in for pages without
// the shell, like the unit tests). The states: cargando · atascado · cancelado · listo · reconectando · sin-conexion · salido.
export type Carga = {
  readonly fase: string; readonly hecho: number; readonly total: number; readonly estado: string; readonly pct: number; readonly avisos: number; readonly mostrada: boolean;
  /** Enter a phase (codigo · grafica · red · mundo · preparar): the earlier ones count as done; `hecho` of `total` inside it (unidad «bytes» or a count). */
  irA(fase: string, hecho?: number, total?: number, unidad?: string): void;
  /** Another state that needs the whole screen: a cut connection, leaving. Buttons are [text, action]. */
  mensaje(estado: string, titulo: string, texto: string, botones?: [string, () => void][]): void;
  texto(t: string): void;
  /** Said at once to screen readers (role=alert). */
  aviso(t: string): void;
  listo(): void; ocultar(): void; reintentar(): void; cancelar(): void;
};
const hueco: Carga = { fase: "listo", hecho: 0, total: 0, estado: "listo", pct: 100, avisos: 0, mostrada: false, irA() {}, mensaje() {}, texto() {}, aviso() {}, listo() {}, ocultar() {}, reintentar() {}, cancelar() {} };
export const carga: Carga = (globalThis as unknown as { __numinia?: { carga?: Carga } }).__numinia?.carga ?? hueco;
