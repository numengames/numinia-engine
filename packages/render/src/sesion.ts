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

/** Frame statistics over a window (one pulse). A frame is "lost" when its interval is over 1.5× the target. */
export function medidorDeCuadros() {
  let dts: number[] = [], costs: number[] = [], lost = 0;
  return {
    cuadro(dtMs: number, costeMs: number, objetivoFps: number): void {
      if (!(dtMs > 0)) return;
      dts.push(dtMs); costs.push(costeMs);
      if (objetivoFps > 0 && dtMs > 1.5 * (1000 / objetivoFps)) lost++;
    },
    /** The window's numbers; starts a new window. */
    ventana(): { cuadros: number; cuadroMs: { p50: number; p99: number; peor: number }; perdidos: number; costeMs: { p50: number; p99: number; peor: number } } {
      const d = [...dts].sort((a, b) => a - b), c = [...costs].sort((a, b) => a - b);
      const out = { cuadros: d.length, cuadroMs: { p50: r1(pct(d, 0.5)), p99: r1(pct(d, 0.99)), peor: r1(d[d.length - 1] ?? 0) }, perdidos: lost, costeMs: { p50: r1(pct(c, 0.5)), p99: r1(pct(c, 0.99)), peor: r1(c[c.length - 1] ?? 0) } };
      dts = []; costs = []; lost = 0;
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
