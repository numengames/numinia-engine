// funciones — server part (f1, R-1). Keeps one switch per piece of the world and tells every page (state «normas», «dardos», «pesca», each
// { activa, fija }); whoever may build flips one with the intent `poner` (the same rule as the espacio base: `api.puede \"construir\"`).
// The file decides (funciones.json, esquema.ts): the server re-reads it, changes ONLY that function's key (every other key kept; no file = it
// creates { schema, <función> }), validates it, writes it atomically and applies it live:
//   · normas — the gate of the conditions of entry (packages/server/src/condiciones-puerta.ts), through the seam `enlace`. Off: whoever was
//     reading gets in. On: only whoever arrives afterwards is asked (nobody already inside is put out). The file beats condiciones.json's
//     `puerta`; MOTOR_CONDICIONES_PUERTA and startServer's `condicionesPuerta` beat the file (then `fija` is true and the switch refuses).
//     The switch exists only if the world has conditions (its own condiciones.json, a community source, or the gate forced from outside).
//   · dardos, pesca — f1 keeps and publishes the state (default on, as today); f2: their own servers read it (`api.estadoDe("funciones")`) and refuse + close what ran, their pages draw nothing.
// A world with no funciones.json behaves exactly as before. No folder to write in: the change lasts until the server restarts.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { EnlaceFunciones, ParteConEnlace, PuenteNormas } from "../../packages/feature/src/index.ts";
import { funciones, FUNCIONES } from "./feature.ts";
import type { Funcion } from "./feature.ts";
import { conFuncion, FICHERO, leerFunciones } from "./esquema.ts";
import type { FuncionesMundo } from "./esquema.ts";

/** How the server touches the world's folder (features/mundo.ts passes them; none = no folder: the switch changes only this run). */
export type OpcionesFunciones = {
  leer?: (fichero: string) => unknown;
  /** `nuevo`: the file did not exist, create it only if it still does not (a broken file that `leer` could not parse is never overwritten). */
  escribir?: (fichero: string, datos: unknown, o?: { nuevo?: boolean }) => void;
};

const cortar = (t: string, n = 150) => (new TextEncoder().encode(t).length <= n ? t : `${t.slice(0, n - 1)}…`);
const NOMBRE: Record<Funcion, string> = { normas: "las normas de entrada", dardos: "los dardos", pesca: "la pesca" };

export function crearFunciones(opts: OpcionesFunciones = {}): ParteConEnlace {
  // what the file says now (a missing or wrong file says nothing; a wrong one is logged once the piece starts)
  const crudo0 = opts.leer?.(FICHERO), leido = crudo0 === undefined ? null : leerFunciones(crudo0);
  const escrito: FuncionesMundo = leido?.ok ? { ...leido.value } : {};
  let seam: { normas: PuenteNormas | null; presentes: readonly string[] } | null = null;
  const enlace: EnlaceFunciones = { normasEscritas: () => escrito.normas, conectar: (s) => { seam = s; } };

  const part = serverPart(funciones, (api) => {
    if (leido && !leido.ok) api.log(`${FICHERO} no se usa (todo como siempre): ${leido.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo) }, { to: e }); return false; };
    const valor = (f: Funcion): { activa: boolean; fija: boolean } | null => {
      if (!seam) return null;
      if (f === "normas") return seam.normas ? { activa: seam.normas.activa(), fija: seam.normas.fija } : null;
      return seam.presentes.includes(f) ? { activa: escrito[f] ?? true, fija: false } : null; // dardos, pesca: loaded by default
    };
    const publicar = (f: Funcion) => { const v = valor(f); if (v) api.state.set(f, v); else api.state.delete(f); };
    for (const f of FUNCIONES) publicar(f);
    if (seam) api.log(`funciones: ${FUNCIONES.filter((f) => valor(f)).map((f) => `${f} ${valor(f)!.activa ? "sí" : "no"}${valor(f)!.fija ? " (fija)" : ""}`).join(", ") || "ninguna con interruptor"}`);

    api.on("poner", (e, m) => {
      if (!api.puede(e, "construir")) return rechazar(e, "No puedes encender ni apagar las funciones del mundo: es cosa de quien tiene permiso de construir en este mundo.");
      const f = m.funcion as Funcion, activa = m.activa === true, ahora = valor(f);
      if (!ahora) return rechazar(e, f === "normas" ? "Este mundo no tiene condiciones de entrada: no hay normas que encender o apagar." : `Este mundo no tiene ${NOMBRE[f] ?? f}.`);
      if (ahora.fija) return rechazar(e, "Las normas de entrada las fija el servidor (MOTOR_CONDICIONES_PUERTA o su opción de arranque): el interruptor no las cambia.");
      if (opts.leer) {
        const crudo = opts.leer(FICHERO), nuevo = conFuncion(crudo, f, activa);
        if (!nuevo) return rechazar(e, `${FICHERO} no es un objeto JSON: arréglalo a mano antes de usar el interruptor.`);
        const r = leerFunciones(nuevo);
        if (!r.ok) return rechazar(e, `${FICHERO} tiene errores (${r.issues[0].path}): arréglalo a mano; el interruptor no lo toca.`);
        if (opts.escribir) {
          try { opts.escribir(FICHERO, nuevo, { nuevo: crudo === undefined }); }
          catch (err) { api.log(`no pude escribir ${FICHERO}: ${(err as Error).message}`); return rechazar(e, `No he podido guardar ${FICHERO} (${(err as NodeJS.ErrnoException).code ?? "error"}; más en el registro del servidor): la función no cambia.`); }
        } else api.log("sin carpeta del mundo donde escribir: el cambio vale hasta que el servidor se reinicie");
      } else api.log("sin carpeta del mundo donde escribir: el cambio vale hasta que el servidor se reinicie");
      escrito[f] = activa;
      if (f === "normas") seam!.normas!.poner(activa); // the gate itself; the instance lets the readers in (off) or leaves everyone inside alone (on)
      publicar(f);
      api.emit("cambiada", { funcion: f, estado: activa ? "encendida" : "apagada" }, "all");
      api.log(`la entidad ${e} ${activa ? "enciende" : "apaga"} ${f} desde el mundo`);
      return true;
    });
  });
  return Object.assign(part, { enlace });
}

export default crearFunciones();
