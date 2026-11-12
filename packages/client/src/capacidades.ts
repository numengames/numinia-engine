// capacidades (N2): what this device and browser can do, as ONE flat object of plain values that people, the settings
// registry (`requiere`, defaults by capability) and AI agents read the same way (window.__numinia.capacidades).
// Decide by capability, never by browser name (AGENTS.md, principle 2). No DOM: the browser is read through an
// `entorno` argument (globalThis by default), so Node tests pass a fake one. The `requiere` grammar lives with the
// settings format (packages/feature/src/ajustes.ts). A new capability = one line in CAPACIDADES (what it means) + one
// probe (how to read it): docs/extender/anadir-una-capacidad.md.
import { NIVELES } from "../../feature/src/ajustes.ts";
import { tx } from "./idioma.ts";
import type { Capacidades, Nivel, ValorCapacidad } from "../../feature/src/ajustes.ts";
export { NIVELES, cumple, faltan, exprValida } from "../../feature/src/ajustes.ts";
export type { Capacidades, Nivel, ValorCapacidad } from "../../feature/src/ajustes.ts";

/** What each capability means, English first then Spanish (people and agents read this; `describir()` lists it next to the value).
 * Each value is a getter: it reads the active language when asked, not at import. */
const T = (en: string, es: string): [string, string] => [en, es];
const TABLA_CAPACIDADES: Record<string, [string, string]> = {
  nivel: T(
    "Device tier: A desktop, B standalone headset, C mid phone, D old phone (limits.json). ?nivel=X forces it.",
    "Nivel del aparato: A escritorio, B visor autónomo, C móvil medio, D móvil viejo (limits.json). ?nivel=X lo fuerza.",
  ),
  movil: T(
    "Phone class (coarse pointer or ≤ 4 GB): 30 fps cap and contained resolution (render/power.ts).",
    "Clase móvil (puntero grueso o ≤ 4 GB): tope de 30 fps y resolución contenida (render/power.ts).",
  ),
  backend: T(
    "What three.js draws with: WebGPU or WebGL2.",
    "Con qué dibuja three.js: WebGPU o WebGL2.",
  ),
  webgpu: T(
    "The browser offers WebGPU (navigator.gpu), even if it draws with WebGL2.",
    "El navegador ofrece WebGPU (navigator.gpu), aunque se dibuje con WebGL2.",
  ),
  xrApi: T(
    "The browser has WebXR (navigator.xr).",
    "El navegador tiene WebXR (navigator.xr).",
  ),
  xrVr: T(
    "Can enter immersive VR (immersive-vr).",
    "Puede entrar en VR inmersiva (immersive-vr).",
  ),
  xrAr: T(
    "Can enter AR (immersive-ar).",
    "Puede entrar en AR (immersive-ar).",
  ),
  tactil: T(
    "Touch screen (maxTouchPoints > 0).",
    "Pantalla táctil (maxTouchPoints > 0).",
  ),
  punteroGrueso: T(
    "The main pointer is a finger (pointer: coarse).",
    "El puntero principal es un dedo (pointer: coarse).",
  ),
  raton: T(
    "There is a fine pointer: mouse or trackpad (any-pointer: fine).",
    "Hay un puntero fino: ratón o panel táctil (any-pointer: fine).",
  ),
  mando: T(
    "A gamepad is connected right now (Gamepad API).",
    "Hay un mando conectado ahora (Gamepad API).",
  ),
  menosMovimiento: T(
    "The system asks for less motion (prefers-reduced-motion: reduce).",
    "El sistema pide menos movimiento (prefers-reduced-motion: reduce).",
  ),
  masContraste: T(
    "The system asks for more contrast (prefers-contrast: more).",
    "El sistema pide más contraste (prefers-contrast: more).",
  ),
  oscuro: T(
    "The system uses the dark theme (prefers-color-scheme: dark).",
    "El sistema usa el tema oscuro (prefers-color-scheme: dark).",
  ),
  memoriaGB: T(
    "Device memory in GB as the browser reports it (0 = it does not say; Chromium rounds and caps at 8).",
    "Memoria del aparato en GB según el navegador (0 = no lo dice; Chromium redondea y topa en 8).",
  ),
  nucleos: T(
    "Logical cores (hardwareConcurrency; 0 = it does not say).",
    "Núcleos lógicos (hardwareConcurrency; 0 = no lo dice).",
  ),
  bateriaApi: T(
    "The browser reports the battery level (Battery API).",
    "El navegador dice el nivel de batería (Battery API).",
  ),
  ahorroDatos: T(
    "The system asks to save data (Save-Data).",
    "El sistema pide ahorrar datos (Save-Data).",
  ),
  dpr: T(
    "Physical pixels per CSS pixel (devicePixelRatio).",
    "Píxeles físicos por píxel CSS (devicePixelRatio).",
  ),
  maxTextura: T(
    "Largest texture side on this GPU, in pixels (0 = unknown).",
    "Lado máximo de una textura en esta gráfica, en píxeles (0 = no se sabe).",
  ),
  pantallaCompleta: T(
    "Can go full screen (Fullscreen API).",
    "Puede ponerse a pantalla completa (Fullscreen API).",
  ),
  vibracion: T(
    "Can vibrate (navigator.vibrate).",
    "Puede vibrar (navigator.vibrate).",
  ),
  voz: T(
    "Can speak with the system voice (speechSynthesis; V3).",
    "Puede hablar con la voz del sistema (speechSynthesis; V3).",
  ),
  webTransport: T(
    "Has WebTransport (M9).",
    "Tiene WebTransport (M9).",
  ),
  aparato: T(
    "Interface layout class: escritorio, movil-vertical, movil-horizontal or vr (U25, aparato.ts). ?aparato=X forces it in development.",
    "Clase de disposición de la interfaz: escritorio, movil-vertical, movil-horizontal o vr (U25, aparato.ts). ?aparato=X la fuerza en desarrollo.",
  ),
  aparatoForzado: T(
    "The device class was set by a person (?aparato or the setting), not by the device: tactil, punteroGrueso, raton and movil are the declared ones.",
    "La clase de aparato la fijó una persona (?aparato o el ajuste), no el aparato: tactil, punteroGrueso, raton y movil son los declarados.",
  ),
  pantallaPequena: T(
    "Phone screen: the short side of the window is under 600 CSS px (or the forced profile says so).",
    "Pantalla de móvil: el lado corto de la ventana mide menos de 600 px CSS (o lo declara el perfil forzado).",
  ),
  interfazTactil: T(
    "The interface shows the touch controls (joystick, «Jump», action buttons).",
    "La interfaz enseña los mandos táctiles (joystick, «Saltar», botones de acción).",
  ),
  desarrollo: T(
    "Development page (vite dev) or opened with ?debug: shows the development settings.",
    "Página de desarrollo (vite dev) o abierta con ?debug: enseña los ajustes de desarrollo.",
  ),
  debug: T(
    "The page was opened with ?debug (whoever develops): on desktop it shows the stats by default (U23).",
    "La página se abrió con ?debug (quien desarrolla): en escritorio enseña las estadísticas por defecto (U23).",
  ),
};
export const CAPACIDADES: Record<string, string> = Object.defineProperties({}, Object.fromEntries(Object.entries(TABLA_CAPACIDADES).map(([k, [en, es]]) => [k, { get: () => tx(en, es), enumerable: true }])));

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
  const info: Record<string, string> = Object.defineProperties({}, Object.getOwnPropertyDescriptors(CAPACIDADES)); // keeps the getters: the meaning follows the language
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
