// funciones/f1: the seam between the features' `funciones` piece (features/funciones/server.ts) and the server, which owns what a switch
// flips (the gate of the conditions of entry). A package cannot import features/, so the piece hangs this object on itself (`enlace`) and
// the server finds it in the list of parts it was given (packages/server/src/server.ts `enlaceDe`).
import type { ServerPart } from "./index.ts";

/** What the server lets the switch turn: the gate of the conditions of entry. `fija` = the environment or startServer's option decides it. */
export type PuenteNormas = { fija: boolean; activa(): boolean; poner(si: boolean): void };
export type EnlaceFunciones = {
  /** What funciones.json says about the gate (undefined = nothing, or the file is wrong). Read BEFORE the server builds the gate. */
  normasEscritas(): boolean | undefined;
  /** The server hands what it owns, before the instance starts: the gate (null = this world has no conditions) and the ids of the features it runs. */
  conectar(s: { normas: PuenteNormas | null; presentes: readonly string[] }): void;
};
export type ParteConEnlace = ServerPart & { enlace: EnlaceFunciones };
export const conEnlace = (p: ServerPart): p is ParteConEnlace => p.feature.id === "funciones" && typeof (p as Partial<ParteConEnlace>).enlace?.conectar === "function";
