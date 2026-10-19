// naturaleza — server part (N4). The server stores and sends what the world's naturaleza.json says, already validated
// (esquema.ts, read by features/mundo.ts `conMundo`); every page builds the same landscape from it. Nothing in the simulation.
// A world without the file publishes nothing (the page draws exactly what it drew before).
//
// Interruptor (R-1, «el fichero manda»): the intent `encender` — only for whoever may build in this world (`api.puede
// "construir"`, the same permission as the builder, the environment and the cable; never a role of its own). The server
// re-reads the world's naturaleza.json, changes ONLY `activa` (every other key kept verbatim; no file = it creates
// `{ schema, activa }`), validates the result like at start, writes it atomically (tmp + rename) and then updates the state:
// every page builds or tears down the nature live, and the instance rebuilds the terrain's collision (N5) from the same state.
import { serverPart } from "../../packages/feature/src/index.ts";
import { naturaleza, MUNDO } from "./feature.ts";
import { leerNaturaleza, ESQUEMA, DEFECTOS } from "./esquema.ts";
import type { NaturalezaMundo } from "./esquema.ts";
import type { TablaFauna } from "../../packages/relieve/src/fauna.ts";
import { FAUNA_CASA } from "./fauna-casa.ts";

export const FICHERO = "naturaleza.json";
/** How the server touches the world's folder (features/mundo.ts passes them; none = no folder: the switch changes only this run). */
export type OpcionesNaturaleza = {
  leer?: (fichero: string) => unknown;
  /** `nuevo`: the file did not exist, create it only if it still does not (a broken file that `leer` could not parse is never overwritten). */
  escribir?: (fichero: string, datos: unknown, o?: { nuevo?: boolean }) => void;
};

/** The file after the switch: the world's own keys verbatim with `activa` changed; no file = the smallest one. null = not an object. Pure. */
export function conActiva(crudo: unknown, activa: boolean): Record<string, unknown> | null {
  if (crudo === undefined) return { schema: ESQUEMA, activa };
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return null;
  return { ...(crudo as Record<string, unknown>), activa };
}

const cortar = (t: string, n = 150) => (new TextEncoder().encode(t).length <= n ? t : `${t.slice(0, n - 1)}…`);

export const crearNaturaleza = (mundo: NaturalezaMundo | null = null, fauna?: TablaFauna, opts: OpcionesNaturaleza = {}) => serverPart(naturaleza, (api) => {
  const decir = (m: NaturalezaMundo, fauna?: TablaFauna) => `naturaleza: ${m.activa ? "encendida" : "apagada"} (semilla ${m.semilla}, ${m.tamano} m, plaza ${m.plaza} m, árboles ${m.arboles}, hierba ${m.hierba}, ${m.estanque ? "con" : "sin"} estanque, paleta ${m.paleta}, fauna ${m.fauna ? `${(fauna ?? FAUNA_CASA).especies.length} especies${fauna ? " del mundo" : ""}, densidad ${m.faunaDensidad}${m.faunaEspecies ? `, solo ${m.faunaEspecies}` : ""}` : "apagada"})`;
  if (mundo) {
    api.state.set(MUNDO, { ...mundo });
    api.log(decir(mundo, fauna));
  }
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo) }, { to: e }); return false; };
  const ids = (fauna ?? FAUNA_CASA).especies.map((x) => x.id);

  api.on("encender", (e, m) => {
    if (!api.puede(e, "construir")) return rechazar(e, "No puedes encender ni apagar la naturaleza: es cosa de quien tiene permiso de construir en este mundo.");
    const activa = m.activa === true;
    let valor: NaturalezaMundo;
    if (opts.leer) {
      const crudo = opts.leer(FICHERO), nuevo = conActiva(crudo, activa);
      if (!nuevo) return rechazar(e, "naturaleza.json no es un objeto JSON: arréglalo a mano antes de usar el interruptor.");
      const r = leerNaturaleza(nuevo, ids);
      if (!r.ok) return rechazar(e, `naturaleza.json tiene errores (${r.issues[0].path}): arréglalo a mano; el interruptor no lo toca.`);
      valor = r.value;
      if (opts.escribir) {
        try { opts.escribir(FICHERO, nuevo, { nuevo: crudo === undefined }); }
        catch (err) { api.log(`no pude escribir ${FICHERO}: ${(err as Error).message}`); return rechazar(e, "No he podido guardar naturaleza.json (mira el registro del servidor): la naturaleza no cambia."); }
      } else api.log(`sin carpeta del mundo donde escribir: el cambio vale hasta que el servidor se reinicie`);
    } else {
      const ahora = api.state.get(MUNDO) as NaturalezaMundo | undefined;
      valor = { ...(ahora ?? mundo ?? DEFECTOS), activa };
      api.log(`sin carpeta del mundo donde escribir: el cambio vale hasta que el servidor se reinicie`);
    }
    api.state.set(MUNDO, { ...valor });
    api.emit("cambiado", { estado: activa ? "encendida" : "apagada" }, "all");
    api.log(`la ${activa ? "enciende" : "apaga"} la entidad ${e} desde el mundo → ${decir(valor, fauna)}`);
  });
});

export default crearNaturaleza();
