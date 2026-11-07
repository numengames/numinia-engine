// lucha/peso — the «weight» of a blow (Y25): a short hit pause, a flash on the creature and a low thud. Pure and presentation
// only: nothing here touches the simulation, the fingerprint or the wire format; the server still decides damage and cooldown.
// «Reduce motion» (setting `accesibilidad.menosMovimiento`, default from the system's prefers-reduced-motion) switches the pause
// and the flash off; the «−N» text, the announcement and the sound stay, so a blow is never left without a signal.
// Safety: a flash never repeats more than DESTELLOS_POR_S_MAX times per second (photosensitivity), never fills the screen,
// and the pause is off inside a headset (pause + shake together make people sick).
// Reusable: any feature with a «hit» can ask `crearPeso(...).golpe(...)`; L5 (camera shake, vignette) must ask `reducido()` too.

/** Hit pause in frames of the page (2-5, a longer one reads as a network fault). */
export const PAUSA_MIN = 2, PAUSA_MAX = 5, PAUSA_FOTOGRAMAS = 3;
/** Flash on the creature (ms, 80-120) and the most flashes one second may hold. */
export const DESTELLO_MS = 100, DESTELLOS_POR_S_MAX = 3;
/** The low, dry thud (catalogue id of features/sonido) and how a page asks for the setting. */
export const SONIDO_GOLPE = "golpe-material";
export const AJUSTE_REDUCIR_MOVIMIENTO = "accesibilidad.menosMovimiento";

export type Peso = { pausa: number; destello: boolean };
export type Entradas = {
  /** True while «reduce motion» is on (read on every blow: the person or the system may change it at any time). */
  reducido: () => boolean;
  /** True inside a headset or AR: no pause there. */
  enXR?: () => boolean;
  reloj?: () => number;
};

export function crearPeso(e: Entradas) {
  const reloj = e.reloj ?? Date.now;
  const destellos: number[] = [];   // when each recent flash started (ms)
  const hay = (ahora: number): boolean => {
    while (destellos.length && ahora - destellos[0] >= 1000) destellos.shift();
    return destellos.length < DESTELLOS_POR_S_MAX;
  };
  /** A flash alone (an ability, a creature's lunge): false with «reduce motion» or when this second already holds the maximum. */
  const destello = (): boolean => {
    if (e.reducido()) return false;
    const ahora = reloj();
    if (!hay(ahora)) return false;
    destellos.push(ahora);
    return true;
  };
  /** A blow landed: what the presentation does. `propio` = it is my blow (only mine pauses: a crowd must not stutter the picture). */
  const golpe = (propio: boolean): Peso => {
    const pausa = propio && !e.reducido() && !e.enXR?.() ? PAUSA_FOTOGRAMAS : 0;
    return { pausa, destello: destello() };
  };
  return { destello, golpe };
}
