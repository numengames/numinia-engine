// funciones/f1: the seam between the features' `funciones` piece (features/funciones/server.ts) and the server, which owns what a switch
// flips (the gate of the conditions of entry). A package cannot import features/, so the piece hangs this object on itself (`enlace`) and
// the server finds it in the list of parts it was given (packages/server/src/server.ts `enlaceDe`).
import type { ServerPart } from "./index.ts";

/** What the server lets the switch turn: the gate of the conditions of entry. `fija` = the environment or startServer's option decides it. */
export type PuenteNormas = { fija: boolean; activa(): boolean; poner(si: boolean): void };
/** e1: the state of one switch as the HTTP door (packages/server/src/funciones-http.ts) tells it. */
export type EstadoFuncion = { id: string; activa: boolean; fija: boolean };
/** e1: the result of flipping a switch from outside the world. `motivo`: desconocida (no such function), ausente (this world does not have it), fija (the server pins it), fichero (funciones.json is wrong), servidor (could not write it), arrancando (the piece has not started yet). */
export type CambioFuncion = { ok: true; estado: EstadoFuncion } | { ok: false; motivo: "desconocida" | "ausente" | "fija" | "fichero" | "servidor" | "arrancando"; texto: string };
export type EnlaceFunciones = {
  /** What funciones.json says about the gate (undefined = nothing, or the file is wrong). Read BEFORE the server builds the gate. */
  normasEscritas(): boolean | undefined;
  /** The server hands what it owns, before the instance starts: the gate (null = this world has no conditions) and the ids of the features it runs. */
  conectar(s: { normas: PuenteNormas | null; presentes: readonly string[] }): void;
  /** e1: the switches this world has, as the pages see them now (null = the piece has not started yet). */
  estado(): EstadoFuncion[] | null;
  /** e1: flip one — the SAME code the intent `poner` runs (writes funciones.json atomically, applies it live, tells every page). `quien` is for the log. */
  cambiar(funcion: string, activa: boolean, quien: string): CambioFuncion;
};
export type ParteConEnlace = ServerPart & { enlace: EnlaceFunciones };
export const conEnlace = (p: ServerPart): p is ParteConEnlace => p.feature.id === "funciones" && typeof (p as Partial<ParteConEnlace>).enlace?.conectar === "function";
