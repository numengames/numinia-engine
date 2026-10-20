// espacio-base — server part (H2, H8). Stores and sends what the world's espacio-base.json says, already validated (esquema.ts, read by
// features/mundo.ts `conMundo`); every page draws the same mesh from it and the instance builds the same collision mesh. A world without
// the file publishes nothing (the page draws exactly what it drew before).
//
// Interruptor (H8, R-1, «el fichero manda», the same pattern as naturaleza's `encender`): the intent `encender` — only for whoever may build
// (`api.puede "construir"`). The server re-reads espacio-base.json, changes ONLY `activa` (every other key kept; no file = it creates
// `{ schema, activa, semilla }` with the default seed), validates it, writes it atomically and updates the state: every page draws or tears
// down the mesh live and the instance rebuilds the collision. `restaurar` (H8): the file goes back to `{ schema, activa: true, semilla: default }`
// (nothing of the old one is kept). What a restore also removes (objects, elements) belongs to those pieces: the page asks each (apps/plaza/entorno.ts).
import { serverPart } from "../../packages/feature/src/index.ts";
import { espacioBase, MUNDO } from "./feature.ts";
import { leerEspacioBase, ESQUEMA, DEFECTOS } from "./esquema.ts";
import type { EspacioBaseMundo } from "./esquema.ts";

export const FICHERO = "espacio-base.json";
/** How the server touches the world's folder (features/mundo.ts passes them; none = no folder: the switch changes only this run). */
export type OpcionesEspacioBase = {
  leer?: (fichero: string) => unknown;
  /** `nuevo`: the file did not exist, create it only if it still does not (a broken file that `leer` could not parse is never overwritten). */
  escribir?: (fichero: string, datos: unknown, o?: { nuevo?: boolean }) => void;
};

/** What a new world's file says: on, with the default seed. */
export const ficheroNuevo = (activa = true): Record<string, unknown> => ({ schema: ESQUEMA, activa, semilla: DEFECTOS.semilla });

/** The file after the switch: the world's own keys verbatim with `activa` changed (an existing seed is never replaced); no file = the smallest one. null = not an object. Pure. */
export function conActiva(crudo: unknown, activa: boolean): Record<string, unknown> | null {
  if (crudo === undefined) return ficheroNuevo(activa);
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return null;
  return { ...(crudo as Record<string, unknown>), activa };
}

const cortar = (t: string, n = 150) => (new TextEncoder().encode(t).length <= n ? t : `${t.slice(0, n - 1)}…`);

export const crearEspacioBase = (mundo: EspacioBaseMundo | null = null, opts: OpcionesEspacioBase = {}) => serverPart(espacioBase, (api) => {
  if (mundo) {
    api.state.set(MUNDO, { activa: mundo.activa, semilla: mundo.semilla }); // `objeto` is not state: features/objetos plants it once (H5)
    api.log(`espacio base: ${mundo.activa ? "encendido" : "apagado"} (semilla ${mundo.semilla})`);
  }
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo) }, { to: e }); return false; };
  /** Write `nuevo` (already validated) and publish it; false = refused (the builder was told). */
  const guardar = (e: number, nuevo: Record<string, unknown>, existia: boolean, verbo: string): boolean => {
    const r = leerEspacioBase(nuevo);
    if (!r.ok) return rechazar(e, `espacio-base.json tiene errores (${r.issues[0].path}): arréglalo a mano; el interruptor no lo toca.`);
    if (opts.escribir) {
      try { opts.escribir(FICHERO, nuevo, { nuevo: !existia }); }
      catch (err) { api.log(`no pude escribir ${FICHERO}: ${(err as Error).message}`); return rechazar(e, `No he podido guardar espacio-base.json (${(err as NodeJS.ErrnoException).code ?? "error"}; más en el registro del servidor): el espacio base no cambia.`); }
    } else api.log("sin carpeta del mundo donde escribir: el cambio vale hasta que el servidor se reinicie");
    api.state.set(MUNDO, { activa: r.value.activa, semilla: r.value.semilla });
    api.emit("cambiado", { estado: r.value.activa ? "encendido" : "apagado" }, "all");
    api.log(`${verbo} la entidad ${e} desde el mundo → espacio base ${r.value.activa ? "encendido" : "apagado"} (semilla ${r.value.semilla})`);
    return true;
  };

  api.on("encender", (e, m) => {
    if (!api.puede(e, "construir")) return rechazar(e, "No puedes encender ni apagar el espacio base: es cosa de quien tiene permiso de construir en este mundo.");
    const activa = m.activa === true;
    if (opts.leer) {
      const crudo = opts.leer(FICHERO), nuevo = conActiva(crudo, activa);
      if (!nuevo) return rechazar(e, "espacio-base.json no es un objeto JSON: arréglalo a mano antes de usar el interruptor.");
      return guardar(e, nuevo, crudo !== undefined, activa ? "lo enciende" : "lo apaga");
    }
    const ahora = api.state.get(MUNDO) as { semilla?: number } | undefined;
    return guardar(e, { ...ficheroNuevo(activa), semilla: ahora?.semilla ?? DEFECTOS.semilla }, true, activa ? "lo enciende" : "lo apaga");
  });

  api.on("semilla", (e, m) => {
    if (!api.puede(e, "construir")) return rechazar(e, "No puedes cambiar la semilla del espacio base: es cosa de quien tiene permiso de construir en este mundo.");
    const semilla = Number(m.semilla);
    if (!Number.isInteger(semilla) || semilla < 0 || semilla > 2147483647) return rechazar(e, "La semilla es un número entero entre 0 y 2147483647.");
    if (opts.leer) {
      const crudo = opts.leer(FICHERO);
      if (crudo !== undefined && (typeof crudo !== "object" || crudo === null || Array.isArray(crudo))) return rechazar(e, "espacio-base.json no es un objeto JSON: arréglalo a mano antes de usar el panel.");
      return guardar(e, { ...(crudo as Record<string, unknown> ?? ficheroNuevo()), semilla }, crudo !== undefined, "le cambia la semilla");
    }
    const ahora = api.state.get(MUNDO) as { activa?: boolean } | undefined;
    return guardar(e, { ...ficheroNuevo(ahora?.activa !== false), semilla }, true, "le cambia la semilla");
  });

  api.on("restaurar", (e) => {
    if (!api.puede(e, "construir")) return rechazar(e, "No puedes restaurar el mundo: es cosa de quien tiene permiso de construir en este mundo.");
    let existia = true;
    if (opts.leer) { try { existia = opts.leer(FICHERO) !== undefined; } catch { existia = true; } }
    return guardar(e, ficheroNuevo(true), existia, "lo restaura");
  });
});

export default crearEspacioBase();
