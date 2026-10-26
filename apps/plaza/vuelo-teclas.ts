// Keys that move you up and down while you fly (H2): a HELD Space keeps climbing, a held Ctrl keeps descending.
// The simulation reads BTN_JUMP as «pressed since the last input» (a jump is one press), so on the ground the page sends it
// once per key press and ignores the browser's key-repeat; in flight the same bit means «climb this tick», so a held Space
// must send it every tick. Nothing changes on the ground: held Space there is still one jump per press.
import { BTN_JUMP, BTN_BAJAR } from "../../packages/sim/src/index.ts";

/** The buttons a keyboard adds to a tick because of what is HELD now: Space while flying climbs, Ctrl descends (on foot the simulation ignores BTN_BAJAR). */
export function botonesDeVuelo(teclas: { has(code: string): boolean }, volando: boolean): number {
  let b = 0;
  if (volando && teclas.has("Space")) b |= BTN_JUMP;
  if (teclas.has("ControlLeft") || teclas.has("ControlRight")) b |= BTN_BAJAR;
  return b;
}
