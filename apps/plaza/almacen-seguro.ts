// almacen-seguro: the page's storage, safe when the browser blocks it (mundo-hermes M7). A page in a sandboxed frame WITHOUT allow-same-origin (Hermes
// Desktop's SandboxedFrame) has an opaque origin: reading `localStorage`, `sessionStorage`, `document.cookie` or `caches` THROWS a SecurityError, and the
// page's first lines read them. Imported FIRST by main.ts. When the storage works this does nothing at all (same page, same behaviour); when it throws, a
// memory copy takes its place for this visit (the guest token is then not kept between visits: the host app gives a new visit every time, and says so in the docs).
type Mundo = Record<string, unknown>;
const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(String(k)) ?? null, setItem: (k: string, v: unknown) => void m.set(String(k), String(v)), removeItem: (k: string) => void m.delete(String(k)), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
/** Replace what throws on `w` (the window) and `d` (its document); returns the names it replaced (for tests). */
export function instalarAlmacenSeguro(w: Mundo, d: Mundo | null = null): string[] {
  const puestas: string[] = [], pone = (o: object, k: string, desc: PropertyDescriptor): void => { try { Object.defineProperty(o, k, { configurable: true, ...desc }); puestas.push(k); } catch { /* not replaceable: nothing to do */ } };
  for (const k of ["localStorage", "sessionStorage", "caches"]) { try { void w[k]; } catch { pone(w, k, { value: k === "caches" ? undefined : memoria() }); } }
  if (d) { try { void d.cookie; } catch { pone(d, "cookie", { get: () => "", set: () => {} }); } }
  return puestas;
}
instalarAlmacenSeguro(globalThis as unknown as Mundo, typeof document !== "undefined" ? (document as unknown as Mundo) : null);
