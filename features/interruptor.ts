// interruptor — what every piece that can be turned on and off from inside the world shares (Pablo, 2026-10-21: every piece
// is a SWITCH, not only a file). The pattern is features/naturaleza and features/espaciobase: the page only ASKS (intent
// `encender { activa }`), the SERVER decides who may and writes the world's file (the world's folder, atomically), and every
// page then follows the state the server publishes. Here the part that is the same for every piece: WHO may flip it, how a
// page learns whether it may (event `permiso`, only to that person) and how the file is changed.
//   Who: whoever may DIRECT here (`api.puede "dirigir"` = STD-052 manage-rituals: by a role, by /dueño or by holding the
//   Director's staff) or rules the world (`api.puede "mandar"` = administrator; owners hold every permission). Nobody
//   else: their row is not shown and the server refuses the order. No role of its own (roles are numinia.com's).
import type { Msg, ServerApi } from "../packages/feature/src/index.ts";

export const NO_PUEDE = "Encender o apagar una pieza del mundo es cosa de quien dirige aquí (permiso «Gestionar rituales», o el báculo del Director) o de quien manda en el mundo.";
/** May this person flip a piece of the world on or off? The server asks it on every `encender`. */
export const puedeInterruptor = (api: ServerApi, e: number): boolean => api.puede(e, "dirigir") || api.puede(e, "mandar");

/** How the server touches the world's folder (features/mundo.ts passes them; none = no folder: the switch only lasts this run). */
export type EntornoMundo = {
  leer?: (fichero: string) => unknown;
  /** `nuevo`: the file did not exist, create it only if it still does not (a broken file `leer` could not parse is never overwritten). */
  escribir?: (fichero: string, datos: unknown, o?: { nuevo?: boolean }) => void;
};

/** Change ONLY these keys of the world's file (every other key kept verbatim; no file = it creates `{ schema, …cambios }`). Pure. null = not an object. */
export function conCambios(crudo: unknown, esquema: string, cambios: Record<string, unknown>): Record<string, unknown> | null {
  if (crudo === undefined) return { schema: esquema, ...cambios };
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return null;
  return { ...(crudo as Record<string, unknown>), ...cambios };
}
/** Write the change to the world's file. "" = written; "sin carpeta" = this world has no folder to write (the change lasts until restart); else why not. */
export function guardarEnMundo(io: EntornoMundo | undefined, fichero: string, esquema: string, cambios: Record<string, unknown>, log: (l: string) => void): string {
  if (!io?.escribir) return "sin carpeta";
  const crudo = io.leer ? io.leer(fichero) : undefined, nuevo = conCambios(crudo, esquema, cambios);
  if (!nuevo) return `${fichero} no es un objeto JSON: arréglalo a mano antes de usar el interruptor.`;
  try { io.escribir(fichero, nuevo, { nuevo: crudo === undefined }); return ""; }
  catch (err) { log(`no pude escribir ${fichero}: ${(err as Error).message}`); return `No he podido guardar ${fichero} (${(err as NodeJS.ErrnoException).code ?? "error"}; más en el registro del servidor): no cambia.`; }
}
/** Tell a person whether they may flip the pieces (event `permiso`, only to them). Each piece's feature declares the event. */
export const decirPermiso = (api: ServerApi, e: number): void => { api.emit("permiso", { encender: puedeInterruptor(api, e) } as Msg, { to: e }); };
/** The three moments a person's permission is told: entering, showing who they are, and their roles (or a loan) changing. */
export function vigilarPermiso(api: ServerApi): void {
  api.onJoin((e) => decirPermiso(api, e));
  api.onIdentify((e) => decirPermiso(api, e));
  api.listen("roles", "cambio", (m) => { decirPermiso(api, Number(m.quien)); return true; });
}
