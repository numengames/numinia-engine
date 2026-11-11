// The VR panel's controls sheet («mandos»): what each button does in VR, as the panel shows it when you enter.
// Every line must match the bindings in packages/render/src/vr.ts (update()) and manos.ts (pinch walk, grip, trigger):
//   · A/X jump (or choose an answer in a dialogue) · B on the right hand: closes the menu, else leaves the dialogue
//   · Y on the left hand: opens or closes the menu (the same as «Menú» on the watch)
//   · tracked hands only: pinch and hold in the air walks; both wrists flicked up together jumps (manos.ts, salto-manos.ts)
//   · a controller's stick clicked and held 0.5 s on the hand that carries something lets it go (manos.ts SOLTAR_PULSAR_MS); the
//     Bolsa row «Soltar» does it too (hands have no stick)
//   · the trigger uses what the ray points at; the grip or a pinch takes what the hand touches, or (free hand next to the hand
//     that carries something) passes it over: packages/render/src/manos.ts `llevable` / CERCA_CAMBIO_M
import { tx, idiomaActivo } from "../../packages/feature/src/idioma.ts";
import type { Idioma } from "../../packages/feature/src/idioma.ts";
// Kept in its own file (no three.js, no view) so test/xr-mandos.test.ts can read the exact words.
const T = (en: string, es: string): readonly [string, string] => [en, es];
const TABLA: readonly (readonly [string, string])[] = [
  T("Controls (Y: open/close menu)", "Mandos (Y: abre o cierra el menú)"),
  T("Left: walk (edge: run) · right: turn", "Izq: andar (borde: correr) · der: girar"),
  T("Trigger: talk / use what you point at", "Gatillo: hablar / usar lo que apuntas"),
  T("Grip or pinch: pick up or pass to the other hand · stick click: drop", "Agarre o pellizco: coger o pasar de mano · palanca pulsada: soltar"),
  T("Rod: flick wrist to cast, tug on a bite · Darts: grip picks, trigger throws", "Caña: muñeca lanza, tirón al picar · Dardos: agarre coge · gatillo lanza"),
  T("A or X: jump · B: close menu or dialogue", "A o X: saltar · B: cerrar menú o diálogo"),
  T("Hands: pinch and point · 2 up, jump", "Manos: pellizca y apunta · 2 arriba, salta"),
  T("Exit: the button below, press twice", "Salir: el botón de abajo, pulsa dos veces"),
];
/** The sheet's lines in one language (default: the active one). */
export const lineasMandos = (idioma: Idioma = idiomaActivo()): string[] => TABLA.map(([en, es]) => (idioma === "es" ? es : en));
/** The same lines as an array whose items are read when asked (not at import), so a language change shows at the next read. */
export const LINEAS_MANDOS: readonly string[] = (() => {
  const a: string[] = [];
  TABLA.forEach(([en, es], i) => Object.defineProperty(a, i, { get: () => tx(en, es), enumerable: true }));
  return a;
})();
