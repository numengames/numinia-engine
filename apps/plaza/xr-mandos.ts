// The VR panel's controls sheet («mandos»): what each button does in VR, as the panel shows it when you enter.
// Every line must match the bindings in packages/render/src/vr.ts (update()) and manos.ts (pinch walk, grip, trigger):
//   · A/X jump (or choose an answer in a dialogue) · B on the right hand: closes the menu, else leaves the dialogue
//   · Y on the left hand: opens or closes the menu (the same as «Menú» on the watch)
//   · tracked hands only: pinch and hold in the air walks; both wrists flicked up together jumps (manos.ts, salto-manos.ts)
//   · the trigger uses what the ray points at; the grip or a pinch takes what the hand touches, or (free hand next to the hand
//     that carries something) passes it over: packages/render/src/manos.ts `llevable` / CERCA_CAMBIO_M
// Kept in its own file (no three.js, no view) so test/xr-mandos.test.ts can read the exact words.
export const LINEAS_MANDOS: readonly string[] = [
  "Mandos (Y: abre o cierra el menú)",
  "Izquierda: andar (al borde, correr) · derecha: girar",
  "Gatillo: hablar / usar lo que apuntas",
  "Agarre o pellizco: coger o pasar de mano",
  "Caña: muñeca lanza, tirón al picar · Dardos: agarre coge · gatillo lanza",
  "A o X: saltar · B: cerrar menú o diálogo",
  "Manos: pellizca y apunta · 2 arriba, salta",
  "Salir: el botón de abajo, pulsa dos veces",
];
