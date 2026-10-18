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

export type PowerPolicy = ReturnType<typeof createPower>;

export function createPower(caps: Caps, opts: PowerOpts = {}) {
  const mobile = isMobileClass(caps);
  let battery = !!opts.battery || caps.saveData;
  let userMaxFps = opts.maxFps ?? 0; // 0 = default for the device class
  let scale = 1; // dynamic resolution factor, 0.5..1
  let calidad: Calidad = "auto"; // N2: the person's quality choice
  let resolucion = 1; // N2: the person's share of the quality's pixel ratio, 0.25..1
  let lastDraw = -Infinity;
  let slowMs = 0, fastMs = 0, emaCost = 0, draws = 0, skipped = 0;

  const q = () => (calidad === "auto" ? null : CALIDADES[calidad]);
  const maxFps = () => (battery ? Math.min(userMaxFps || 24, 24) : userMaxFps || q()?.fps || (mobile ? 30 : 60));
  const idleFps = () => (battery ? 8 : q()?.quieto ?? (mobile ? 12 : 30));
  const pixelRatioCap = () => (battery ? 1 : q()?.ratio ?? (mobile ? 1.25 : 2));

  return {
    mobile,
    get battery() { return battery; },
    setBattery(on: boolean) { battery = on; },
    setMaxFps(n: number) { userMaxFps = n; },
    get scale() { return scale; },
    get calidad(): Calidad { return calidad; },
    /** N2: quality choice; anything unknown = auto. Call view.applyPixelRatio() after. */
    setCalidad(c: Calidad) { calidad = c === "baja" || c === "media" || c === "alta" ? c : "auto"; },
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
     * Report how long a draw took on the CPU+GPU-wait side (ms). A sustained cost above the budget
     * (heat signal) lowers the resolution step by step; sustained headroom raises it again.
     * Returns true when the scale changed (caller re-applies pixelRatio()).
     */
    reportCost(costMs: number, frameDtMs: number): boolean {
      emaCost = emaCost ? emaCost * 0.9 + costMs * 0.1 : costMs;
      const budget = 1000 / maxFps();
      const late = emaCost > budget * 0.7;
      if (late) { slowMs += frameDtMs; fastMs = 0; } else if (emaCost < budget * 0.35) { fastMs += frameDtMs; slowMs = 0; } else { slowMs = 0; fastMs = 0; }
      if (slowMs >= 2000 && scale > 0.5) { scale = Math.max(0.5, +(scale * 0.85).toFixed(3)); slowMs = 0; return true; }
      if (fastMs >= 6000 && scale < 1) { scale = Math.min(1, +(scale / 0.85).toFixed(3)); fastMs = 0; return true; }
      return false;
    },
    get stats() { return { draws, skipped, scale, emaCostMs: Math.round(emaCost * 100) / 100, targetFps: maxFps(), mobile, battery, calidad, resolucion }; },
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
