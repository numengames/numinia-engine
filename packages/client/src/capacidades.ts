// capacidades (N2): what this device and browser can do, as ONE flat object of plain values that people, the settings
// registry (`requiere`, defaults by capability) and AI agents read the same way (window.__numinia.capacidades).
// Decide by capability, never by browser name (AGENTS.md, principle 2). No DOM: the browser is read through an
// `entorno` argument (globalThis by default), so Node tests pass a fake one. The `requiere` grammar lives with the
// settings format (packages/feature/src/ajustes.ts). A new capability = one line in CAPACIDADES (what it means) + one
// probe (how to read it): docs/EXTENDER.md «Añadir una capacidad».
import { NIVELES } from "../../feature/src/ajustes.ts";
import type { Capacidades, Nivel, ValorCapacidad } from "../../feature/src/ajustes.ts";
export { NIVELES, cumple, faltan, exprValida } from "../../feature/src/ajustes.ts";
export type { Capacidades, Nivel, ValorCapacidad } from "../../feature/src/ajustes.ts";

/** What each capability means (people and agents read this; `describir()` lists it next to the value). */
export const CAPACIDADES: Record<string, string> = {
  nivel: "Nivel del aparato: A escritorio, B visor autónomo, C móvil medio, D móvil viejo (limits.json). ?nivel=X lo fuerza.",
  movil: "Clase móvil (puntero grueso o ≤ 4 GB): tope de 30 fps y resolución contenida (render/power.ts).",
  backend: "Con qué dibuja three.js: WebGPU o WebGL2.",
  webgpu: "El navegador ofrece WebGPU (navigator.gpu), aunque se dibuje con WebGL2.",
  xrApi: "El navegador tiene WebXR (navigator.xr).",
  xrVr: "Puede entrar en VR inmersiva (immersive-vr).",
  xrAr: "Puede entrar en AR (immersive-ar).",
  tactil: "Pantalla táctil (maxTouchPoints > 0).",
  punteroGrueso: "El puntero principal es un dedo (pointer: coarse).",
  raton: "Hay un puntero fino: ratón o panel táctil (any-pointer: fine).",
  mando: "Hay un mando conectado ahora (Gamepad API).",
  menosMovimiento: "El sistema pide menos movimiento (prefers-reduced-motion: reduce).",
  masContraste: "El sistema pide más contraste (prefers-contrast: more).",
  oscuro: "El sistema usa el tema oscuro (prefers-color-scheme: dark).",
  memoriaGB: "Memoria del aparato en GB según el navegador (0 = no lo dice; Chromium redondea y topa en 8).",
  nucleos: "Núcleos lógicos (hardwareConcurrency; 0 = no lo dice).",
  bateriaApi: "El navegador dice el nivel de batería (Battery API).",
  ahorroDatos: "El sistema pide ahorrar datos (Save-Data).",
  dpr: "Píxeles físicos por píxel CSS (devicePixelRatio).",
  maxTextura: "Lado máximo de una textura en esta gráfica, en píxeles (0 = no se sabe).",
  pantallaCompleta: "Puede ponerse a pantalla completa (Fullscreen API).",
  vibracion: "Puede vibrar (navigator.vibrate).",
  voz: "Puede hablar con la voz del sistema (speechSynthesis; V3).",
  webTransport: "Tiene WebTransport (M9).",
  aparato: "Clase de disposición de la interfaz: escritorio, movil-vertical, movil-horizontal o vr (U25, aparato.ts). ?aparato=X la fuerza en desarrollo.",
  aparatoForzado: "La clase de aparato la fijó una persona (?aparato o el ajuste), no el aparato: tactil, punteroGrueso, raton y movil son los declarados.",
  pantallaPequena: "Pantalla de móvil: el lado corto de la ventana mide menos de 600 px CSS (o lo declara el perfil forzado).",
  interfazTactil: "La interfaz enseña los mandos táctiles (joystick, «Saltar», botones de acción).",
  desarrollo: "Página de desarrollo (vite dev) o abierta con ?debug: enseña los ajustes de desarrollo.",
  debug: "La página se abrió con ?debug (quien desarrolla): en escritorio enseña las estadísticas por defecto (U23).",
};

type MQ = { matches: boolean };
/** The parts of a browser global this module reads. Node tests pass a fake. */
export type Entorno = {
  navigator?: {
    maxTouchPoints?: number; deviceMemory?: number; hardwareConcurrency?: number; gpu?: unknown; xr?: unknown;
    connection?: { saveData?: boolean }; getBattery?: unknown; getGamepads?: () => ArrayLike<unknown | null>; vibrate?: unknown;
  };
  matchMedia?: (q: string) => MQ;
  devicePixelRatio?: number;
  document?: { fullscreenEnabled?: boolean };
  speechSynthesis?: unknown;
  WebTransport?: unknown;
  location?: { search?: string };
};

/** The media queries behind the preference capabilities (the page listens to their changes). */
export const CONSULTAS = {
  punteroGrueso: "(pointer: coarse)",
  raton: "(any-pointer: fine)",
  menosMovimiento: "(prefers-reduced-motion: reduce)",
  masContraste: "(prefers-contrast: more)",
  oscuro: "(prefers-color-scheme: dark)",
} as const;

/** Is a gamepad connected right now? */
export function hayMando(nav: Entorno["navigator"]): boolean {
  try { return Array.from(nav?.getGamepads?.() ?? []).some((g) => !!g); } catch { return false; }
}

/** ?debug in the address (U23); «?debug=0» or «?debug=no» say no. Never throws. */
export function hayDebug(search: string | undefined): boolean {
  try {
    const p = new URLSearchParams(search ?? "");
    return p.has("debug") && !["0", "no", "false"].includes((p.get("debug") ?? "").toLowerCase());
  } catch { return false; }
}

/** Same rule as render/power.ts `isMobileClass` (the page passes power's own value to keep one source). */
export const esMovil = (c: Capacidades): boolean => !!c.punteroGrueso || (Number(c.memoriaGB) > 0 && Number(c.memoriaGB) <= 4);

/** The device tier, by capability (estimated: the T1 session reports from real devices will correct it). */
export function nivelAparato(c: Capacidades): Nivel {
  if (c.movil && c.xrVr) return "B";             // a phone-class device that can do immersive VR: a standalone headset
  if (c.movil) return Number(c.memoriaGB) > 0 && Number(c.memoriaGB) <= 2 ? "D" : "C";
  return "A";
}

/** Everything the browser says without a renderer (backend, maxTextura and XR come from the view, later). */
export function leerNavegador(env: Entorno = globalThis as unknown as Entorno): Capacidades {
  const nav = env.navigator ?? {};
  const mq = (q: string) => { try { return !!env.matchMedia?.(q).matches; } catch { return false; } };
  const c: Capacidades = {
    backend: "", webgpu: !!nav.gpu, xrApi: !!nav.xr, xrVr: false, xrAr: false,
    tactil: (nav.maxTouchPoints ?? 0) > 0, punteroGrueso: mq(CONSULTAS.punteroGrueso), raton: mq(CONSULTAS.raton), mando: hayMando(nav),
    menosMovimiento: mq(CONSULTAS.menosMovimiento), masContraste: mq(CONSULTAS.masContraste), oscuro: mq(CONSULTAS.oscuro),
    memoriaGB: Number(nav.deviceMemory) || 0, nucleos: Number(nav.hardwareConcurrency) || 0,
    bateriaApi: typeof nav.getBattery === "function", ahorroDatos: !!nav.connection?.saveData,
    dpr: Number(env.devicePixelRatio) || 1, maxTextura: 0, pantallaCompleta: !!env.document?.fullscreenEnabled,
    vibracion: typeof nav.vibrate === "function", voz: !!env.speechSynthesis, webTransport: typeof env.WebTransport === "function",
    debug: hayDebug(env.location?.search),
  };
  c.movil = esMovil(c);
  c.nivel = nivelAparato(c);
  return c;
}

// ---------- live capabilities: values that change (XR answers later, a gamepad is plugged in, the OS theme…) ----------
export type Sonda = { id: string; describe: string; leer: () => ValorCapacidad | Promise<ValorCapacidad> };

export function crearCapacidades(inicial: Capacidades, opts: { nivel?: Nivel } = {}) {
  const valores: Capacidades = { ...inicial };   // ONE object, changed in place: window.__numinia.capacidades stays valid
  const info: Record<string, string> = { ...CAPACIDADES };
  const oyentes: ((cambiadas: string[]) => void)[] = [];
  const forzado = opts.nivel && NIVELES.includes(opts.nivel) ? opts.nivel : undefined;
  /** Change some values; the tier is recomputed (unless forced) and listeners hear which ids changed. */
  const poner = (parcial: Capacidades): string[] => {
    const cambiadas: string[] = [];
    for (const [k, v] of Object.entries(parcial)) if (valores[k] !== v) { valores[k] = v; cambiadas.push(k); }
    const n = forzado ?? nivelAparato(valores);
    if (valores.nivel !== n) { valores.nivel = n; cambiadas.push("nivel"); }
    if (cambiadas.length) for (const fn of oyentes) { try { fn(cambiadas); } catch { /* a listener never breaks the others */ } }
    return cambiadas;
  };
  poner({});
  return {
    valores,
    poner,
    /** A new capability: what it means and how to read it (sync or a promise). A probe that throws reads as false. */
    agregar(s: Sonda): void {
      info[s.id] = s.describe;
      let v: ValorCapacidad | Promise<ValorCapacidad>;
      try { v = s.leer(); } catch { poner({ [s.id]: false }); return; }
      if (v instanceof Promise) v.then((x) => poner({ [s.id]: x }), () => poner({ [s.id]: false }));
      else poner({ [s.id]: v });
    },
    /** Every capability with its value and meaning, sorted by id (for agents and the docs). */
    describir(): { id: string; valor: ValorCapacidad; describe: string }[] {
      return Object.keys(valores).sort().map((id) => ({ id, valor: valores[id], describe: info[id] ?? "" }));
    },
    alCambiar(fn: (cambiadas: string[]) => void): void { oyentes.push(fn); },
  };
}
export type CapacidadesVivas = ReturnType<typeof crearCapacidades>;
