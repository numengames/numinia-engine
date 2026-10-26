// t_45ef2f70: what the page does NOT need to draw its first frame waits for it. The first load (bytes until playable, slow 4G)
// grew from 0.47 to 0.72 MB because every panel, font and table was fetched before the first frame; anything that is only
// needed once the player can move goes through `alPrimerCuadro`. Fallback: if no frame is ever drawn (a hidden tab), it
// runs after FALLBACK_MS anyway, so nothing stays unloaded for good.
export const FALLBACK_MS = 15_000;
const cola: Array<() => void> = [];
let dado = false;

const aOcio = (f: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(f, { timeout: 2000 }); else setTimeout(f, 0);
};

/** Run `f` once the first frame is drawn (right away if it already was). Errors in `f` do not stop the others. */
export function alPrimerCuadro(f: () => void | Promise<unknown>): void {
  const seguro = (): void => { try { const r = f(); if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch((e) => console.warn("[primer-cuadro]", e)); } catch (e) { console.warn("[primer-cuadro]", e); } };
  if (dado) aOcio(seguro); else cola.push(seguro);
}

/** Called by the page's draw loop on its first frame (and by the fallback timer). Idempotent. */
export function primerCuadroDado(): void {
  if (dado) return;
  dado = true;
  for (const f of cola.splice(0)) aOcio(f);
}

export const primerCuadroYaDado = (): boolean => dado;
(setTimeout(primerCuadroDado, FALLBACK_MS) as unknown as { unref?: () => void }).unref?.(); // unref: a test importing this must not wait 15 s
