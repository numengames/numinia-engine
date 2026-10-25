// t_d5f5523a (MIS-200): which hand carries the wrist watch («la mano del menú») and which hand presses it.
// The setting `vrManoMenu` (packages/client/src/ajustes-motor.ts) picks the watch hand, default left; the other
// hand is the pressing one (fingertip or ray). Pure: vr.ts reads it, the tests check it.
import type { Lado } from "./manos.ts";

export type ManoMenuVR = "izq" | "der";

export function ladosDelMenu(mano: ManoMenuVR): { reloj: Lado; punta: Lado } {
  return mano === "der" ? { reloj: "der", punta: "izq" } : { reloj: "izq", punta: "der" };
}
