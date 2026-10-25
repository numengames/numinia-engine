// ficha-mundo (H7): the seam between the features' `ficha-mundo` piece (features/ficha-mundo/server.ts) and the server, which owns the
// world's ficha (aventura/ficha.json), the door's aforo and the page's <title>. A package cannot import features/, so the piece hangs this
// object on itself (`ficha`) and the server finds it in the list of parts it was given (packages/server/src/server.ts).
import type { ServerPart } from "./index.ts";

/** What an owner sets and every page reads. "" = not set (the file then lacks the key); `aforo` 0 = no limit of its own (the engine's capacity). */
export type AjustesMundo = { nombre: string; portada: string; avatar: string; aforo: number };
/** What the server adds for the panel: the engine's capacity (the most `aforo` can really mean), how many are inside, and whether the change can be written. */
export type AjustesMundoVivo = AjustesMundo & { capacidad: number; dentro: number; guardado: boolean };
export type CambioAjustes = { ok: true; ajustes: AjustesMundoVivo } | { ok: false; texto: string };
export type EnlaceFicha = {
  /** The server hands what it owns, before the instance starts. */
  conectar(s: { ajustes(): AjustesMundoVivo; cambiar(c: AjustesMundo, quien: string): CambioAjustes }): void;
};
export type ParteConFicha = ServerPart & { ficha: EnlaceFicha };
export const conFicha = (p: ServerPart): p is ParteConFicha => p.feature.id === "ficha-mundo" && typeof (p as Partial<ParteConFicha>).ficha?.conectar === "function";
