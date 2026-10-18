// power: decides WHEN to draw and at WHAT resolution. Pure (no DOM, no three.js): testable with fake clocks.
// Decided by capability (coarse pointer, memory, save-data), never by browser name.

export type Caps = { coarsePointer: boolean; saveData: boolean; deviceMemoryGB: number; dpr: number };
export type PowerOpts = { maxFps?: number; battery?: boolean };
export type Frame = { hidden: boolean; active: boolean }; // active = something moves or the user is giving input

/** Read the capabilities of the current device (browser only; tests pass a fake `Caps`). */
export function readCaps(): Caps {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    coarsePointer: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
    saveData: !!nav.connection?.saveData,
    deviceMemoryGB: nav.deviceMemory ?? 8,
    dpr: devicePixelRatio || 1,
  };
}

export const isMobileClass = (c: Caps): boolean => c.coarsePointer || c.deviceMemoryGB <= 4;
/** U25: the capabilities with the device class a forced profile declares (true phone, false desktop, undefined = as read). */
export function conClase(c: Caps, movil: boolean | undefined): Caps {
  if (movil === undefined) return c;
  return movil ? { ...c, coarsePointer: true } : { ...c, coarsePointer: false, deviceMemoryGB: Math.max(c.deviceMemoryGB, 8) };
}

/** N2: the person's quality choice (settings menu). `auto` = by device class, as above. */
export type Calidad = "auto" | "baja" | "media" | "alta";
/** What each explicit quality allows: pixel ratio cap, fps while something moves, fps when nothing does. */
export const CALIDADES: Record<Exclude<Calidad, "auto">, { ratio: number; fps: number; quieto: number }> = {
  baja: { ratio: 1, fps: 30, quieto: 12 },
  media: { ratio: 1.5, fps: 60, quieto: 20 },
  alta: { ratio: 2, fps: 60, quieto: 30 },
};

/**
 * B4 · DINAMICA: dynamic resolution without swinging. Copied, not invented:
 * - Hubs `src/systems/auto-pixel-ratio.js`: decide on the MEDIAN of a measuring period (5 s there), skip the first
 *   seconds after the scene shows (30 s there), two thresholds (30 / 48 fps: hysteresis), and after failing 3 times at
 *   a ratio lower the ceiling so it is not retried (NUM_TIMES_DECREASED_BEFORE_CHANGING_MAX_PIXEL_RATIO).
 * - Babylon `packages/dev/core/src/Misc/sceneOptimizer.ts` (`trackerDuration` 2000 ms, `executeWhenReady`): one
 *   decision per period, never while the scene is not ready. `Misc/performanceMonitor.ts`: a rolling window.
 * Ours measures the CPU cost of a draw (`cpuMs`), so a frame that compiled a shader or resized the canvas is not a
 * sample at all (`paron`), and loading is not measured (`setCargando`).
 */
const VENTANA_MS = 2000;            // one decision per 2 s of frames (Babylon trackerDuration)
const MIN_MUESTRAS = 8;             // fewer clean frames in a window = no decision
const ALTO = 0.7, BAJO = 0.35;      // median above 70 % of the budget = slow; below 35 % = room (in between: stay)
const VENTANAS_BAJAR = 2;           // 4 s of slowness to go down
const VENTANAS_SUBIR = 3;           // 6 s of room to go up
const MIN_ENTRE_CAMBIOS_MS = 5000;  // never two changes within 5 s (each one is a resize: 0.1-0.4 s of main thread)
const ASENTAR_MS = 3000;            // after loading ends, wait 3 s before measuring (late compiles, GC)
const FALLOS_TECHO = 2;             // dropping from the same scale twice: do not climb back to it
const PASO = 0.85;                  // one step of scale
const SUBIDA_FALLIDA_MS = 20000;    // dropping within 20 s of a climb: that climb failed; the next waits ×2 (to ×8)

export type PowerPolicy = ReturnType<typeof createPower>;

export function createPower(caps: Caps, opts: PowerOpts = {}) {
  const mobile = isMobileClass(caps);
  let battery = !!opts.battery || caps.saveData;
  let userMaxFps = opts.maxFps ?? 0; // 0 = default for the device class
  let scale = 1; // dynamic resolution factor, 0.5..1
  let calidad: Calidad = "auto"; // N2: the person's quality choice
  let resolucion = 1; // N2: the person's share of the quality's pixel ratio, 0.25..1
  let lastDraw = -Infinity;
  let emaCost = 0, draws = 0, skipped = 0;
  // B4: dynamic resolution that does not swing. State of the measuring window and of the hysteresis.
  let muestras: number[] = [], ventanaMs = 0;   // costs of the current window (clean frames only) and its frame time
  let lentas = 0, holgadas = 0;                 // consecutive slow / roomy windows
  let desdeCambioMs = Infinity;                 // frame time since the last scale change
  let cargando = false, asentarMs = 0;          // loading now; settle time still to wait after it ends
  let paronPendiente = 0;                       // next N reports are stalls (shader compiled, resize): not measured
  let techo = 1;                                // highest scale allowed (lowered when one level keeps failing)
  const bajadasDesde = new Map<number, number>(); // times we had to drop FROM each scale
  let cambios = 0, ignorados = 0;
  let medianaAlBajar = NaN;                     // the median that made us drop: the next drop needs proof the last one helped
  let desdeSubidaMs = Infinity, subidasFallidas = 0; // a drop soon after a climb = the climb failed: wait longer next time
  const reiniciarVentana = () => { muestras = []; ventanaMs = 0; };
  const reiniciarTodo = () => { reiniciarVentana(); lentas = 0; holgadas = 0; };
  /** A change: restart the measurement at the new resolution (the next frame pays the resize: not measured). */
  const cambio = (): true => { cambios++; desdeCambioMs = 0; reiniciarTodo(); paronPendiente = Math.max(paronPendiente, 2); return true; };

  const q = () => (calidad === "auto" ? null : CALIDADES[calidad]);
  const maxFps = () => (battery ? Math.min(userMaxFps || 24, 24) : userMaxFps || q()?.fps || (mobile ? 30 : 60));
  const idleFps = () => (battery ? 8 : q()?.quieto ?? (mobile ? 12 : 30));
  const pixelRatioCap = () => (battery ? 1 : q()?.ratio ?? (mobile ? 1.25 : 2));

  return {
    mobile,
    get battery() { return battery; },
    setBattery(on: boolean) { battery = on; reiniciarTodo(); },
    setMaxFps(n: number) { userMaxFps = n; },
    get scale() { return scale; },
    get calidad(): Calidad { return calidad; },
    /** N2: quality choice; anything unknown = auto. Call view.applyPixelRatio() after. */
    setCalidad(c: Calidad) { calidad = c === "baja" || c === "media" || c === "alta" ? c : "auto"; techo = 1; bajadasDesde.clear(); subidasFallidas = 0; medianaAlBajar = NaN; reiniciarTodo(); },
    get resolucion() { return resolucion; },
    /** N2: share of the pixel ratio the person wants (0.25..1; 1 = all the quality allows). Call view.applyPixelRatio() after. */
    setResolucion(f: number) { resolucion = Number.isFinite(f) ? Math.min(1, Math.max(0.25, f)) : 1; },
    /** The fps we aim at right now. */
    targetFps(active: boolean): number { return active ? maxFps() : Math.min(idleFps(), maxFps()); },
    /** Pixel ratio to give the renderer: device ratio, capped by class or quality, shrunk by dynamic resolution and the person's share. */
    pixelRatio(): number { return Math.max(0.5, Math.min(caps.dpr, pixelRatioCap()) * scale * resolucion); },
    /** Should this display-loop callback draw? Call once per callback with the clock in ms. */
    shouldDraw(now: number, f: Frame): boolean {
      if (f.hidden) { skipped++; return false; }
      // 1.5 ms tolerance: display callbacks jitter around the ideal interval
      if (now - lastDraw < 1000 / this.targetFps(f.active) - 1.5) { skipped++; return false; }
      lastDraw = now; draws++;
      return true;
    },
    /**
     * B4: this draw was a stall that says nothing about the device's steady load — a shader program was compiled
     * (three compiles on the first draw of a material, blocking: 0.3-1.7 s), or the canvas was resized. The next
     * `n` reports are not measured. The view calls it; nobody else needs to.
     */
    paron(n = 1): void { paronPendiente = Math.max(paronPendiente, n); },
    /** B4: models are downloading/being placed. Nothing is measured while loading, nor for `ASENTAR_MS` after. */
    setCargando(on: boolean): void {
      if (on === cargando) return;
      cargando = on;
      if (on) reiniciarTodo(); else asentarMs = ASENTAR_MS;
    },
    get cargando() { return cargando; },
    /**
     * Report how long a draw took on the CPU side (ms) and the frame interval (ms). Returns true when the scale
     * changed (caller re-applies pixelRatio()). B4 — copied from Hubs `auto-pixel-ratio.js` and Babylon
     * `SceneOptimizer` (see the header of DINAMICA below): decide on the MEDIAN of a 2 s window of clean frames
     * (an isolated spike cannot move a median), lower only after 2 slow windows in a row and raise only after 3
     * roomy ones (hysteresis: 70 % / 35 % of the budget), at least 5 s between changes, nothing measured while
     * loading or for 3 s after, frames with a compile or a resize ignored, and a level that failed twice is not
     * tried again.
     */
    reportCost(costMs: number, frameDtMs: number): boolean {
      emaCost = emaCost ? emaCost * 0.9 + costMs * 0.1 : costMs; // kept for stats (the pulse and the ficha read it)
      desdeCambioMs += frameDtMs; desdeSubidaMs += frameDtMs;
      if (paronPendiente > 0) { paronPendiente--; ignorados++; return false; }
      if (cargando) { ignorados++; return false; }
      if (asentarMs > 0) { asentarMs -= frameDtMs; ignorados++; return false; }
      muestras.push(costMs); ventanaMs += frameDtMs;
      if (ventanaMs < VENTANA_MS) return false;
      const n = muestras.length;
      const mediana = n >= MIN_MUESTRAS ? [...muestras].sort((a, b) => a - b)[n >> 1] : NaN;
      reiniciarVentana();
      if (!Number.isFinite(mediana)) return false; // too few clean frames to say anything
      const budget = 1000 / maxFps();
      if (mediana > budget * ALTO) { lentas++; holgadas = 0; }
      else if (mediana < budget * BAJO) { holgadas++; lentas = 0; }
      else { lentas = 0; holgadas = 0; }
      if (desdeCambioMs < MIN_ENTRE_CAMBIOS_MS) return false;
      if (lentas >= VENTANAS_BAJAR && scale > 0.5) {
        // the previous drop did not lower the cost: resolution is not what is slow (the CPU is) — dropping more only blurs
        if (mediana > medianaAlBajar * 0.9) { lentas = 0; return false; }
        const k = bajadasDesde.get(scale) ?? 0;
        bajadasDesde.set(scale, k + 1);
        if (k + 1 >= FALLOS_TECHO) techo = Math.min(techo, +(scale * PASO).toFixed(3)); // Hubs: stop retrying it
        if (desdeSubidaMs < SUBIDA_FALLIDA_MS) subidasFallidas++;
        medianaAlBajar = mediana;
        scale = Math.max(0.5, +(scale * PASO).toFixed(3));
        return cambio();
      }
      if (holgadas >= VENTANAS_SUBIR * 2 ** Math.min(subidasFallidas, 3) && scale < techo) {
        scale = Math.min(techo, +(scale / PASO).toFixed(3));
        if (scale > 0.995) scale = Math.min(1, techo); // 0.522 / 0.85^4 = 0.999: snap to the device's own ratio
        medianaAlBajar = NaN; desdeSubidaMs = 0;
        return cambio();
      }
      return false;
    },
    get stats() { return { draws, skipped, scale, cambios, ignorados, techo, cargando, emaCostMs: Math.round(emaCost * 100) / 100, targetFps: maxFps(), mobile, battery, calidad, resolucion }; },
  };
}

/** Cost-per-frame gate for device tier D (checked headless by e2e): numbers come from limits.json. */
export type FrameCost = { calls: number; triangles: number; cpuMs: number };
export function checkCost(c: FrameCost, max: { calls: number; triangles: number }): string[] {
  const out: string[] = [];
  if (c.calls > max.calls) out.push(`draw calls ${c.calls} > ${max.calls}: instance repeated meshes or merge geometries`);
  if (c.triangles > max.triangles) out.push(`triangles ${c.triangles} > ${max.triangles}: use lower-detail meshes (LOD) for this tier`);
  return out;
}
