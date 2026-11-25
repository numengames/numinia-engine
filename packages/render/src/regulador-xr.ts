// E2 (quality ladder, XR): the image-size governor of an XR session. Inside a headset the canvas is not what is shown, so
// the flat-screen governor (power.ts) stays out (E1) and this one decides instead, with the standard knob
// `XRView.requestViewportScale` (WebXR Device API §7.2): the headset keeps its framebuffer and draws into a smaller
// rectangle of it, so nothing is reallocated and the change costs no frame.
//   Measured on a Quest 3S, Quest Browser 157, WebGL2, 2026-11-25: scale 1 → 0.5 → 0.2 took the GPU from 4.6 to 3.3 and
//   2.3 ms per frame; `recommendedViewportScale` is null there and `PressureObserver` does not exist, so the decision
//   has to come from what the page itself can measure: frames that arrive late, and how long our own draw took.
// The rule (diagnose before choosing the lever): fewer pixels only help when the pixels are what is slow.
//   - late frames AND a short draw on the CPU side → the GPU is the limit → lower the scale one step;
//   - late frames AND a long draw on the CPU side → the CPU is the limit → leave the scale alone (it would only blur);
//   - a step down that did not bring the late frames down is undone and not tried again for a while.
// Pure: no three, no DOM. `index.ts` feeds it one call per drawn XR frame and applies the scale it returns.

export const XR_ESCALA_SUELO = 0.6;   // guaranteed floor: never draws below 60 % of the headset's own size per side (limits.json)
const PASO = 0.85;                    // one step: 15 % per side (the step of the flat governor, from Hubs)
const VENTANA_MS = 2000;              // decide on 2 s of frames
const MIN_CUADROS = 30;               // fewer frames than this in a window says nothing
const TARDE = 1.5;                    // a frame is late when it took over 1.5 refresh periods to arrive
const LENTA = 0.10;                   // a window is slow with over 10 % of late frames…
const HOLGADA = 0.02;                 // …and roomy with under 2 %
const CPU_LIMITA = 0.6;               // median draw over 60 % of the period: the CPU is what is slow
const VENTANAS_BAJAR = 2;             // 4 s of slowness before lowering
const VENTANAS_SUBIR = 5;             // 10 s of headroom before raising
const MIN_ENTRE_CAMBIOS_MS = 4000;
const ASENTAR_MS = 5000;              // after entering, or coming back from the system menu: late compiles, not load
const MEJORA_MINIMA = 0.75;           // a step down must cut the late frames to under 75 % of what they were
const VETO_MS = 60000;                // a useless step down is not tried again for a minute

export type EstadoReguladorXR = { escala: number; cambios: number; limitaCPU: number; inutiles: number; tardeUltima: number };

export function crearReguladorXR() {
  let escala = 1, cambios = 0, limitaCPU = 0, inutiles = 0, tardeUltima = 0;
  let costes: number[] = [], cuadros = 0, tarde = 0, ventanaMs = 0;
  let lentas = 0, holgadas = 0, desdeCambioMs = Infinity, asentarMs = ASENTAR_MS, vetoMs = 0;
  let tardeAlBajar = NaN; // late fraction that made us lower: the next slow window is judged against it
  const ventana = () => { costes = []; cuadros = 0; tarde = 0; ventanaMs = 0; };
  const cambia = (e: number): number => { escala = e; cambios++; desdeCambioMs = 0; lentas = 0; holgadas = 0; ventana(); return escala; };

  return {
    /** Entering a session: full size, a clean measure, and the settle time. */
    reiniciar(): void { escala = 1; lentas = 0; holgadas = 0; desdeCambioMs = Infinity; asentarMs = ASENTAR_MS; vetoMs = 0; tardeAlBajar = NaN; ventana(); },
    /**
     * One drawn XR frame: `dtMs` since the previous one, `cpuMs` our draw took, `hz` the session's refresh rate, and
     * `visible` false while the system has something on top (menu, boundary grid): those frames are not ours to judge.
     * Returns the scale to ask of every view, 1 = the headset's own size.
     */
    cuadro(dtMs: number, cpuMs: number, hz: number, visible = true): number {
      desdeCambioMs += dtMs; if (vetoMs > 0) vetoMs -= dtMs;
      if (!visible) { ventana(); lentas = 0; holgadas = 0; asentarMs = ASENTAR_MS; return escala; }
      if (asentarMs > 0) { asentarMs -= dtMs; return escala; }
      const periodo = 1000 / (hz > 0 ? hz : 72);
      cuadros++; ventanaMs += dtMs; costes.push(cpuMs);
      if (dtMs > periodo * TARDE) tarde++;
      if (ventanaMs < VENTANA_MS) return escala;
      const n = cuadros, fraccion = n ? tarde / n : 0;
      const mediana = [...costes].sort((a, b) => a - b)[n >> 1] ?? 0;
      ventana();
      if (n < MIN_CUADROS) return escala;
      tardeUltima = Math.round(fraccion * 1000) / 1000;
      if (fraccion > LENTA) {
        holgadas = 0;
        if (mediana > periodo * CPU_LIMITA) { limitaCPU++; lentas = 0; return escala; } // not the pixels: do not blur for nothing
        lentas++;
      } else if (fraccion < HOLGADA) { holgadas++; lentas = 0; }
      else { lentas = 0; holgadas = 0; }
      if (desdeCambioMs < MIN_ENTRE_CAMBIOS_MS) return escala;
      if (lentas >= VENTANAS_BAJAR) {
        if (Number.isFinite(tardeAlBajar) && fraccion > tardeAlBajar * MEJORA_MINIMA) { // the last step down bought nothing: undo it
          inutiles++; vetoMs = VETO_MS; tardeAlBajar = NaN;
          const e = +(escala / PASO).toFixed(3);
          return cambia(e > 0.995 ? 1 : e);
        }
        if (vetoMs > 0 || escala <= XR_ESCALA_SUELO) { lentas = 0; return escala; }
        tardeAlBajar = fraccion;
        return cambia(Math.max(XR_ESCALA_SUELO, +(escala * PASO).toFixed(3)));
      }
      if (holgadas >= VENTANAS_SUBIR && escala < 1) {
        tardeAlBajar = NaN;
        const e = +(escala / PASO).toFixed(3);
        return cambia(e > 0.995 ? 1 : e);
      }
      return escala;
    },
    get escala() { return escala; },
    get stats(): EstadoReguladorXR { return { escala, cambios, limitaCPU, inutiles, tardeUltima }; },
  };
}

/** The slice of an XR frame this needs (WebXR): the views of the viewer pose, each with the standard request. */
export type CuadroXRLike = { getViewerPose(espacio: unknown): { views: ArrayLike<{ requestViewportScale?(s: number | null): void }> } | null | undefined };

/** Ask every view of this frame for `escala`. False where the browser lacks the request (it then draws at full size). Never throws. */
export function pedirEscala(cuadro: CuadroXRLike | null | undefined, espacio: unknown, escala: number): boolean {
  try {
    const pose = cuadro && espacio ? cuadro.getViewerPose(espacio) : null;
    if (!pose || !pose.views.length) return false;
    let hecho = false;
    for (const v of Array.from(pose.views)) if (typeof v.requestViewportScale === "function") { v.requestViewportScale(escala); hecho = true; }
    return hecho;
  } catch { return false; }
}
