// pantalla-logica (M18): the decisions behind «Compartir pantalla», with no DOM so node:test can run them
// (test/pantalla.test.ts). Which video screen of the world gets your shared screen (the nearest within 30 m), and
// whether this browser can share at all (getDisplayMedia exists only on desktop browsers and iPhone with iOS 27; never on
// Android Chrome, Firefox Android or the Quest Browser — and only over https or localhost).
export type Punto = { x: number; y?: number; z: number };
export type Pantalla = { key: string; x: number; y: number; z: number };

/** Farther than this, a screen is not «near»: your share goes to a floating window instead. */
export const PANTALLA_CERCA_M = 30;

/** The nearest screen to `yo` within `max` metres (horizontal distance, like the voice bubble), or null. Ties keep the first. */
export function pantallaMasCercana(yo: Punto, pantallas: readonly Pantalla[], max = PANTALLA_CERCA_M): Pantalla | null {
  let mejor: Pantalla | null = null, mejorD = Infinity;
  for (const p of pantallas) {
    const d = Math.hypot(p.x - yo.x, p.z - yo.z);
    if (d <= max && d < mejorD) { mejor = p; mejorD = d; }
  }
  return mejor;
}

type Navegador = { mediaDevices?: { getDisplayMedia?: unknown } } | undefined;
type Direccion = { protocol: string; hostname: string };
/** Can this page ask for the screen? The function must exist and the page must be a secure context (https, localhost). */
export function sePuedeCompartir(nav: Navegador, loc: Direccion): boolean {
  if (typeof nav?.mediaDevices?.getDisplayMedia !== "function") return false;
  return loc.protocol === "https:" || loc.hostname === "localhost" || loc.hostname === "127.0.0.1" || loc.hostname === "[::1]";
}

/** The sentence said when the share starts: on a screen of the world, or in a floating window. */
export function fraseInicio(nombre: string | null): string {
  return nombre === null ? "No hay ninguna pantalla cerca: la ves en una ventana (solo la ves tú por ahora)." : `Compartiendo tu pantalla en «${nombre}» (solo la ves tú por ahora).`;
}
