// MIS-200 (t_febc1fc2): «Rendimiento en gafas» — three knobs for the headset's draw cost, pure so a fake renderer tests them.
// Defaults are what three does today (foveation 1, scale 1, no multiview), so a player who touches nothing sees no change.
//  - foveación: `renderer.xr.setFoveation(0 | 0.5 | 1)`, live (XRManager.js:484 writes `fixedFoveation` on the layer).
//  - escala: `renderer.xr.setFramebufferScaleFactor(0.8 | 1)`; three ignores it once presenting (XRManager.js:520), so it is
//    applied right before `setSession`.
//  - multiview: three 0.186.1 asks for it only in the renderer's constructor option (Renderer.js:105 → XRManager.js:41,405) and
//    honours it only on the WebGL backend with OVR_multiview2 (XRManager.js:1253); on a WebGPU XR session it warns and disables it
//    (XRManager.js:787-793). There is no public setter, so we set the same private flag before `setSession` reads it.
//    `multiviewDisponible` is the check that the flag still exists in the installed three (a test pins it).
//  - frecuencia: `session.updateTargetFrameRate(72)` when `supportedFrameRates` lists it (Quest); Pico's Chrome 105 has neither.

export const FOVEACIONES = [0, 0.5, 1] as const;
export const ESCALAS = [0.8, 1] as const;
export const FRECUENCIA_PEDIDA = 72;

export type RendimientoXR = { foveacion: number; escala: number; multiview: boolean };
export const RENDIMIENTO_DEFECTO: RendimientoXR = { foveacion: 1, escala: 1, multiview: false };

/** The nearest allowed value (a stored "0.5" string, a stray 0.7…); the default when it is not a number. */
function cercano(v: unknown, lista: readonly number[], defecto: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return defecto;
  let mejor = lista[0], dist = Infinity;
  for (const x of lista) { const d = Math.abs(x - n); if (d < dist) { dist = d; mejor = x; } }
  return mejor;
}
export const normalizarRendimiento = (r: Partial<{ foveacion: unknown; escala: unknown; multiview: unknown }>): RendimientoXR => ({
  foveacion: cercano(r.foveacion, FOVEACIONES, RENDIMIENTO_DEFECTO.foveacion),
  escala: cercano(r.escala, ESCALAS, RENDIMIENTO_DEFECTO.escala),
  multiview: r.multiview === true,
});

/** The slice of `renderer.xr` this file touches (three's XRManager). */
export type XRManagerLike = {
  setFoveation(v: number): void;
  setFramebufferScaleFactor(v: number): void;
  _useMultiviewIfPossible?: boolean;
};
export type RendererLike = { xr: XRManagerLike; backend?: { isWebGPUBackend?: boolean } };

/** True where the multiview flag can do anything: three still has the flag and the renderer draws with WebGL (not WebGPU). */
export const multiviewDisponible = (r: RendererLike): boolean => typeof r.xr._useMultiviewIfPossible === "boolean" && r.backend?.isWebGPUBackend !== true;

/** Apply the settings to a renderer; call before `xr.setSession` (the scale and multiview are read when the layer is made). */
export function aplicarRendimiento(r: RendererLike, cfg: Partial<RendimientoXR>): RendimientoXR {
  const c = normalizarRendimiento(cfg);
  r.xr.setFoveation(c.foveacion);
  r.xr.setFramebufferScaleFactor(c.escala);
  if (multiviewDisponible(r)) r.xr._useMultiviewIfPossible = c.multiview;
  return c;
}

/** Ask for 72 Hz where the headset lists it. Never throws; false when absent (Pico) or refused. */
export async function pedirFrecuencia(s: { supportedFrameRates?: ArrayLike<number> | null; updateTargetFrameRate?(hz: number): Promise<void> }, hz = FRECUENCIA_PEDIDA): Promise<boolean> {
  try {
    const lista = s.supportedFrameRates ? Array.from(s.supportedFrameRates) : [];
    if (!lista.includes(hz) || typeof s.updateTargetFrameRate !== "function") return false;
    await s.updateTargetFrameRate(hz);
    return true;
  } catch { return false; }
}
