// aparato (U25): the device PROFILE the interface lays itself out for — escritorio, movil-vertical, movil-horizontal or
// vr — and the capabilities it declares (touch controls or not, small screen, VR, phone-class power). ONE function decides
// (`decidirAparato`); every part of the page asks the page's single copy of its answer (apps/plaza/aparato.ts), never
// matchMedia itself, so a forced profile moves the whole interface at once. Albion: «platform-specific UI profiles …
// without leaving the desktop» (REDISENO-INTERFAZ-PC-MOVIL-VR §7 U25). Rule: a new frame is measured in movil-vertical
// before it counts as done.
// Forcing (`?aparato=movil-vertical`, or the setting interfaz.aparato) works only in development (vite dev) or with
// ?debug: a shared link must never take a phone's touch controls away. `auto` reproduces the old decision exactly
// (touch HUD = pointer: coarse). No DOM: the browser is read through `Entorno`, so Node tests pass a fake one.
import { leerTextoGuardado } from "./ajustes.ts";
import type { Capacidades, Nivel } from "../../feature/src/ajustes.ts";

export const APARATOS = ["auto", "escritorio", "movil-vertical", "movil-horizontal", "vr"] as const;
export type Eleccion = (typeof APARATOS)[number];
export type Clase = Exclude<Eleccion, "auto">;
export type Marco = { ancho: number; alto: number };

/** What the interface is laid out for, and what it may assume about the device. */
export type Perfil = {
  eleccion: Eleccion;         // what was asked (auto, or the forced class)
  clase: Clase;               // the layout class the interface uses
  forzado: boolean;           // true = declared by a person, not read from the device
  tactil: boolean;            // touch controls: joystick, «Saltar», action buttons, touch help texts
  punteroGrueso: boolean;     // the main pointer is a finger
  raton: boolean;             // there is a fine pointer
  pantallaPequena: boolean;   // phone-size screen (shorter side < PANTALLA_PEQUENA_PX)
  movil: boolean;             // phone-class power (30 fps cap, contained resolution: render/power.ts)
  vr: boolean;                // a headset's browser
  marco: Marco | null;        // draw the page inside a frame of this size (forced phone profile on a desktop)
};

/** Shorter side of the window (CSS px) below which a screen counts as phone-size. */
export const PANTALLA_PEQUENA_PX = 600;
/** The frame a forced phone profile draws on a desktop: an iPhone 12-15 (390×844 CSS px), upright or on its side. */
export const MARCOS: Record<"movil-vertical" | "movil-horizontal", Marco> = {
  "movil-vertical": { ancho: 390, alto: 844 },
  "movil-horizontal": { ancho: 844, alto: 390 },
};
/** The capabilities each forced class declares. */
export const DECLARADAS: Record<Clase, Omit<Perfil, "eleccion" | "clase" | "forzado" | "marco">> = {
  escritorio: { tactil: false, punteroGrueso: false, raton: true, pantallaPequena: false, movil: false, vr: false },
  "movil-vertical": { tactil: true, punteroGrueso: true, raton: false, pantallaPequena: true, movil: true, vr: false },
  "movil-horizontal": { tactil: true, punteroGrueso: true, raton: false, pantallaPequena: true, movil: true, vr: false },
  vr: { tactil: false, punteroGrueso: false, raton: true, pantallaPequena: false, movil: true, vr: true }, // controllers point like a fine pointer
};
/** The id of the setting (packages/client/src/ajustes-motor.ts) and the URL parameter. */
export const AJUSTE_APARATO = "interfaz.aparato";
export const PARAM_APARATO = "aparato";
/** Inside the frame the page is loaded again with this parameter (so it does not frame itself again). */
export const PARAM_MARCO = "marco";

export const esEleccion = (v: unknown): v is Eleccion => typeof v === "string" && (APARATOS as readonly string[]).includes(v);

/** What the browser says, as plain values (Node tests pass them directly). */
export type Real = { punteroGrueso: boolean; raton: boolean; tactil: boolean; ancho: number; alto: number; memoriaGB: number };
type MQ = { matches: boolean };
export type Entorno = { matchMedia?: (q: string) => MQ; innerWidth?: number; innerHeight?: number; navigator?: { maxTouchPoints?: number; deviceMemory?: number } };
export function leerReal(env: Entorno = globalThis as unknown as Entorno): Real {
  const mq = (q: string) => { try { return !!env.matchMedia?.(q).matches; } catch { return false; } };
  return {
    punteroGrueso: mq("(pointer: coarse)"), raton: mq("(any-pointer: fine)"), tactil: (env.navigator?.maxTouchPoints ?? 0) > 0,
    ancho: Number(env.innerWidth) || 0, alto: Number(env.innerHeight) || 0, memoriaGB: Number(env.navigator?.deviceMemory) || 0,
  };
}

/** `auto`: the class the device itself gives. Same rule the page always used: the touch HUD comes with pointer: coarse. */
export function claseReal(r: Real): Clase {
  if (!r.punteroGrueso) return "escritorio";
  return r.ancho > r.alto ? "movil-horizontal" : "movil-vertical";
}

/** Which profile was asked: the URL first, then what the person kept in the setting; neither outside development. */
export function eleccionDesde(o: { url?: string | null; guardado?: string | null; desarrollo: boolean }): { eleccion: Eleccion; de: "url" | "ajuste" | "auto"; aviso?: string } {
  const url = o.url ?? null;
  if (!o.desarrollo) return url ? { eleccion: "auto", de: "auto", aviso: `?${PARAM_APARATO} solo vale en desarrollo o con ?debug` } : { eleccion: "auto", de: "auto" };
  if (url !== null && url !== "") {
    if (esEleccion(url)) return { eleccion: url, de: "url" }; // ?aparato=auto too: it beats a kept setting
    return { eleccion: "auto", de: "auto", aviso: `?${PARAM_APARATO}=${url} no existe: ${APARATOS.join(", ")}` };
  }
  const r = leerTextoGuardado(o.guardado ?? null);
  const v = r.ok ? r.value[AJUSTE_APARATO] : undefined;
  return esEleccion(v) && v !== "auto" ? { eleccion: v, de: "ajuste" } : { eleccion: "auto", de: "auto" };
}

/** THE decision: the profile the whole interface follows. `enMarco` = this page is already the framed copy. */
export function decidirAparato(o: { eleccion?: Eleccion; real: Real; enMarco?: boolean }): Perfil {
  const r = o.real, eleccion = o.eleccion && esEleccion(o.eleccion) ? o.eleccion : "auto";
  if (eleccion === "auto") {
    const pequena = r.ancho > 0 && r.alto > 0 && Math.min(r.ancho, r.alto) < PANTALLA_PEQUENA_PX;
    return {
      eleccion, clase: claseReal(r), forzado: false, tactil: r.punteroGrueso, punteroGrueso: r.punteroGrueso, raton: r.raton,
      pantallaPequena: pequena, movil: r.punteroGrueso || (r.memoriaGB > 0 && r.memoriaGB <= 4), vr: false, marco: null,
    };
  }
  // a phone profile forced on a device without fingers is drawn inside a phone-size frame (unless this IS the frame)
  const marco = (eleccion === "movil-vertical" || eleccion === "movil-horizontal") && !o.enMarco && !r.punteroGrueso ? { ...MARCOS[eleccion] } : null;
  return { eleccion, clase: eleccion, forzado: true, ...DECLARADAS[eleccion], marco };
}

/** What the profile adds to the capabilities registry (window.__numinia.capacidades, settings' `requiere`). A forced
 * profile overrides what the device said about its pointers and power class; `auto` only adds the class. */
export function capacidadesDelPerfil(p: Perfil): Capacidades {
  const c: Capacidades = { aparato: p.clase, aparatoForzado: p.forzado, pantallaPequena: p.pantallaPequena, interfazTactil: p.tactil };
  if (p.forzado) Object.assign(c, { tactil: p.tactil, punteroGrueso: p.punteroGrueso, raton: p.raton, movil: p.movil });
  return c;
}

/** A forced VR profile on a flat screen means the headset's tier (B) unless ?nivel says otherwise. */
export const nivelDelPerfil = (p: Perfil): Nivel | undefined => (p.forzado && p.vr ? "B" : undefined);

/** The frame's scale so it fits the window with `margen` px around it (never bigger than 1:1). */
export function escalaMarco(m: Marco, ventana: { ancho: number; alto: number }, margen = { x: 32, y: 72 }): number {
  const s = Math.min(1, (ventana.ancho - margen.x) / m.ancho, (ventana.alto - margen.y) / m.alto);
  return Math.max(0.25, Math.round(s * 1000) / 1000);
}

/** The address of the framed copy (and of the profile links): same page, other profile; `marco` only inside. */
export function direccionCon(href: string, eleccion: Eleccion | null, dentro: boolean): string {
  const u = new URL(href);
  if (eleccion === null) u.searchParams.delete(PARAM_APARATO); else u.searchParams.set(PARAM_APARATO, eleccion);
  if (dentro) u.searchParams.set(PARAM_MARCO, "dentro"); else u.searchParams.delete(PARAM_MARCO);
  return u.toString();
}
