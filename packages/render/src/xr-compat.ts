// xr-compat: small shims for headset browsers whose WebXR is older than what three.js expects. Pure (no DOM, no
// three.js): Node tests pass a fake session.
//
// Chrome 105 (PICO Browser 3.3.x on the Pico 4) has no `XRSession.enabledFeatures` (it arrived in Chrome 107).
// three's XRManager.setSession() reads `session.enabledFeatures.includes('layers')` right after it builds the projection
// layer; on Chrome 105 that is a TypeError, setSession rejects, `renderState.layers` is never set and the headset shows a
// black screen with zero frames. An empty list is the truthful answer for what we need: «no feature three has to
// special-case (layers, webgpu) was confirmed», so three keeps the plain projection-layer path.

/** A session as far as this file cares: `enabledFeatures` may be missing (Chrome < 107). */
export type SesionXRAntigua = { enabledFeatures?: unknown };

/**
 * Give a session the `enabledFeatures` list that old browsers lack, and return the same session. A browser that
 * already has the list is left alone. Never throws: if the session cannot take the property (frozen), it is returned
 * as it came and the caller's own error handling reports whatever three then says.
 */
export function completarSesionXR<T extends object>(sesion: T): T {
  const s = sesion as SesionXRAntigua;
  if (Array.isArray(s.enabledFeatures)) return sesion;
  try { Object.defineProperty(sesion, "enabledFeatures", { value: [], configurable: true, writable: true }); } catch { /* frozen: nothing to do */ }
  return sesion;
}

/** A failure message short enough for the T1 report (`lastError`). */
export const textoDeFallo = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 160);
