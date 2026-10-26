// sesion (T1): what the page tells the server about how this player entered and how it is going.
// The pure parts (browser name, device class, frame statistics) are tested in Node; `leerAparato` reads the
// browser. Naming the device from the user agent is fine HERE because it is only a report: behaviour is
// still decided by capability (power.ts), never by browser name.

export type Clase = "visor" | "movil" | "tableta" | "escritorio";

/** "Quest Browser 41.2", "Chrome 141", "Firefox 158", "Safari 26.1"… from the UA (and UA-CH brands when present). */
export function nombreNavegador(ua: string, brands: { brand: string; version: string }[] = []): string {
  const pick: [RegExp, string][] = [
    [/OculusBrowser\/([\d.]+)/, "Quest Browser"], [/PicoBrowser\/([\d.]+)/, "Pico Browser"],
    [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"], [/Edg[A-Z]?\/([\d.]+)/, "Edge"], [/OPR\/([\d.]+)/, "Opera"],
    [/Firefox\/([\d.]+)/, "Firefox"], [/FxiOS\/([\d.]+)/, "Firefox iOS"], [/CriOS\/([\d.]+)/, "Chrome iOS"],
    [/HeadlessChrome\/([\d.]+)/, "Chrome sin pantalla"],
  ];
  for (const [re, name] of pick) { const m = re.exec(ua); if (m) return `${name} ${m[1].split(".").slice(0, 2).join(".")}`; }
  const real = brands.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand));
  if (real) return `${real.brand.replace("Google ", "")} ${real.version.split(".")[0]}`;
  const chrome = /Chrome\/([\d]+)/.exec(ua);
  if (chrome) return `Chrome ${chrome[1]}`;
  const safari = /Version\/([\d.]+).*Safari/.exec(ua);
  if (safari) return `Safari ${safari[1]}`;
  return ua ? "otro" : "¿?";
}

/** What kind of device, for the report only. */
export function claseAparato(c: { ua: string; punteroGrueso: boolean; ladoCortoPx: number }): Clase {
  if (/OculusBrowser|Quest|PicoBrowser|Pico Neo|Pico 4|Vision Pro|VR\b/i.test(c.ua)) return "visor";
  if (c.punteroGrueso) return c.ladoCortoPx >= 600 ? "tableta" : "movil";
  return "escritorio";
}

/** "Android 14", "iOS 18.1", "Windows", "Linux"… */
export function nombreSistema(ua: string, platform = "", platformVersion = ""): string {
  if (platform) return platformVersion ? `${platform} ${platformVersion.split(".")[0]}` : platform;
  const a = /Android ([\d.]+)/.exec(ua); if (a) return `Android ${a[1]}`;
  const i = /(?:iPhone|CPU) OS ([\d_]+)/.exec(ua); if (i) return `iOS ${i[1].replace(/_/g, ".")}`;
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "¿?";
}

const pct = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** A gap of at least this long between two draws, with the page visible, is a freeze (not a lost frame). */
export const CONGELACION_MS = 1000;
/** A frame is "long" when its interval is over this AND over 1.5× the target (it is also lost): a stall you notice,
 * not a frame the power policy chose to space out. 50 ms is the W3C Long Animation Frames threshold. */
export const LARGO_MS = 50;

/** What the page knows about the frame it just drew, besides its interval (all optional). */
export type Dibujo = { dc?: number; tri?: number; programas?: number; ratio?: number; xr?: boolean;
  /** t_159e18d2: cumulative shader pipelines linked by a draw after the loading screen (render/compilaciones.ts). The window reports the new ones. */ compilesTardios?: number };

type Ventana = {
  cuadros: number; cuadroMs: { p50: number; p99: number; peor: number }; perdidos: number; costeMs: { p50: number; p99: number; peor: number };
  largos: number; congelado?: { n: number; ms: number; peor: number }; dc?: { p50: number; peor: number }; kTri?: { p50: number; peor: number };
  programas?: number; programasNuevos?: number; compilesTardios?: number; cambiosRes?: number; ratio?: number; loaf?: { n: number; bloqMs: number; peorMs: number };
};

/**
 * Frame statistics over a window (one pulse). A frame is "lost" when its interval is over 1.5× the target.
 * Intervals of CONGELACION_MS or more never enter cuadroMs/perdidos (as before, so old pulses stay comparable):
 * they are counted apart as freezes, unless `pausa()` said the page stopped drawing on purpose (hidden tab, frozen
 * by the browser) since the last draw — then the gap is dropped, as it always was.
 */
export function medidorDeCuadros() {
  let dts: number[] = [], costs: number[] = [], lost = 0, largos = 0;
  let cong = 0, congMs = 0, congPeor = 0, pausado = false, enXR: boolean | undefined;
  let dcs: number[] = [], tris: number[] = [];
  let programas: number | undefined, programasAntes: number | undefined, tardios: number | undefined, tardiosAntes: number | undefined, ratio: number | undefined, cambiosRes = 0;
  let loafN = 0, loafBloq = 0, loafPeor = 0, loafVisto = false;
  const ms0 = (x: number) => Math.round(x);
  const verLoaf = (durationMs: number, blockingMs: number) => { loafVisto = true; loafN++; loafBloq += blockingMs; loafPeor = Math.max(loafPeor, durationMs); };
  return {
    cuadro(dtMs: number, costeMs: number, objetivoFps: number, d: Dibujo = {}): void {
      if (d.ratio !== undefined && Number.isFinite(d.ratio)) { if (ratio !== undefined && d.ratio !== ratio) cambiosRes++; ratio = d.ratio; }
      if (d.programas !== undefined && Number.isFinite(d.programas)) { programas = d.programas; if (programasAntes === undefined) programasAntes = d.programas; }
      if (d.compilesTardios !== undefined && Number.isFinite(d.compilesTardios)) { tardios = d.compilesTardios; if (tardiosAntes === undefined) tardiosAntes = d.compilesTardios; }
      if (d.xr !== undefined) { if (enXR !== undefined && d.xr !== enXR) pausado = true; enXR = d.xr; } // entering/leaving XR swaps loops
      if (!(dtMs > 0)) return;
      if (dtMs >= CONGELACION_MS) {
        if (pausado) { pausado = false; return; }
        cong++; congMs += dtMs; congPeor = Math.max(congPeor, dtMs);
        return;
      }
      pausado = false;
      dts.push(dtMs); costs.push(costeMs);
      if (d.dc !== undefined) dcs.push(d.dc);
      if (d.tri !== undefined) tris.push(d.tri);
      const late = objetivoFps > 0 && dtMs > 1.5 * (1000 / objetivoFps);
      if (late) lost++;
      if (late && dtMs > LARGO_MS) largos++;
    },
    /** The page stopped drawing on purpose (hidden, frozen by the browser): the next long gap is not a freeze. */
    pausa(): void { pausado = true; },
    /** A Long Animation Frame the browser saw (Chromium only: a frame over 50 ms): its duration and blockingDuration, ms. */
    loaf(durationMs: number, blockingMs = 0): void { verLoaf(durationMs, blockingMs); },
    /** Browser only: listens for the page being hidden or frozen and for Long Animation Frames, where offered. */
    vigilar(): void {
      if (typeof addEventListener !== "function") return;
      addEventListener("visibilitychange", () => { if (typeof document !== "undefined" && document.hidden) pausado = true; });
      addEventListener("pagehide", () => { pausado = true; });
      addEventListener("freeze", () => { pausado = true; }); // Page Lifecycle: the browser froze the page
      try {
        const PO = (globalThis as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
        if (PO?.supportedEntryTypes?.includes("long-animation-frame")) {
          new PO((l) => { for (const e of l.getEntries()) verLoaf(e.duration, (e as PerformanceEntry & { blockingDuration?: number }).blockingDuration ?? 0); }).observe({ type: "long-animation-frame", buffered: false });
          loafVisto = true; // supported: report n 0 too (absence then means "not measured", not "none")
        }
      } catch { /* not offered */ }
    },
    /** The window's numbers; starts a new window. Optional blocks are left out when the page cannot know them. */
    ventana(): Ventana {
      const d = [...dts].sort((a, b) => a - b), c = [...costs].sort((a, b) => a - b);
      const out: Ventana = { cuadros: d.length, cuadroMs: { p50: r1(pct(d, 0.5)), p99: r1(pct(d, 0.99)), peor: r1(d[d.length - 1] ?? 0) }, perdidos: lost, costeMs: { p50: r1(pct(c, 0.5)), p99: r1(pct(c, 0.99)), peor: r1(c[c.length - 1] ?? 0) }, largos };
      if (cong) out.congelado = { n: cong, ms: ms0(congMs), peor: ms0(congPeor) };
      if (dcs.length) { const s = dcs.sort((a, b) => a - b); out.dc = { p50: s[Math.floor(s.length / 2)], peor: s[s.length - 1] }; }
      if (tris.length) { const s = tris.sort((a, b) => a - b); out.kTri = { p50: r1(s[Math.floor(s.length / 2)] / 1000), peor: r1(s[s.length - 1] / 1000) }; }
      if (programas !== undefined) { out.programas = programas; out.programasNuevos = Math.max(0, programas - (programasAntes ?? programas)); }
      if (tardios !== undefined) out.compilesTardios = Math.max(0, tardios - (tardiosAntes ?? tardios));
      if (ratio !== undefined) { out.cambiosRes = cambiosRes; out.ratio = Math.round(ratio * 100) / 100; }
      if (loafVisto) out.loaf = { n: loafN, bloqMs: ms0(loafBloq), peorMs: ms0(loafPeor) };
      dts = []; costs = []; lost = 0; largos = 0; cong = 0; congMs = 0; congPeor = 0; dcs = []; tris = [];
      programasAntes = programas; tardiosAntes = tardios; cambiosRes = 0; loafN = 0; loafBloq = 0; loafPeor = 0;
      return out;
    },
  };
}

type Nav = Navigator & {
  deviceMemory?: number;
  connection?: { effectiveType?: string; saveData?: boolean };
  userAgentData?: { brands: { brand: string; version: string }[]; mobile: boolean; platform: string; getHighEntropyValues?(h: string[]): Promise<Record<string, unknown>> };
  getBattery?(): Promise<{ level: number; charging: boolean }>;
};

/** The battery, where the browser tells (Chromium on Android and desktop); null elsewhere. */
export async function leerBateria(): Promise<{ nivel: number; cargando: boolean } | null> {
  try { const b = await (navigator as Nav).getBattery?.(); return b ? { nivel: Math.round(b.level * 100) / 100, cargando: b.charging } : null; }
  catch { return null; }
}

/** Everything the `entrada` report says about the device (browser only). Waits at most 500 ms for UA-CH. */
export async function leerAparato(extra: { backend: string; gpu: string; xr: { vr: boolean; ar: boolean } }): Promise<Record<string, unknown>> {
  const nav = navigator as Nav, ua = nav.userAgent ?? "";
  let hi: Record<string, unknown> = {};
  try { const p = nav.userAgentData?.getHighEntropyValues?.(["model", "platformVersion", "fullVersionList"]); if (p) hi = (await Promise.race([p, new Promise((ok) => setTimeout(() => ok({}), 500))])) as Record<string, unknown>; }
  catch { /* not offered */ }
  const mq = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;
  const punteroGrueso = mq("(pointer: coarse)");
  const w = screen?.width ?? innerWidth, h = screen?.height ?? innerHeight;
  const brands = (hi.fullVersionList as { brand: string; version: string }[] | undefined) ?? nav.userAgentData?.brands ?? [];
  return {
    clase: claseAparato({ ua, punteroGrueso, ladoCortoPx: Math.min(w, h) }),
    aparato: typeof hi.model === "string" && hi.model ? hi.model : "",
    sistema: nombreSistema(ua, nav.userAgentData?.platform ?? "", String(hi.platformVersion ?? "")),
    navegador: nombreNavegador(ua, brands),
    ua: ua.slice(0, 160),
    backend: extra.backend, gpu: extra.gpu, xr: extra.xr,
    nucleos: nav.hardwareConcurrency ?? 0, memoriaGB: nav.deviceMemory ?? 0,
    pantalla: `${w}x${h}`, dpr: devicePixelRatio || 1,
    tactil: (nav.maxTouchPoints ?? 0) > 0, punteroGrueso,
    red: nav.connection?.effectiveType ?? "", ahorroDatos: !!nav.connection?.saveData,
    bateria: (await leerBateria()) ?? undefined,
    preferencias: { menosMovimiento: mq("(prefers-reduced-motion: reduce)"), masContraste: mq("(prefers-contrast: more)"), oscuro: mq("(prefers-color-scheme: dark)") },
    idioma: nav.language ?? "",
  };
}
