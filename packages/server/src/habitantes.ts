// habitantes (the engine's own door, camino A of «Add an AI»; camino B is an outside agent: puerta.ts +
// agentes-http.ts). An inhabitant lives IN this world: its whole habitante@1 file (agent/formato.ts) sits in
// aventura/habitantes/<id>.json and the owner's panel manages it with GET/POST/DELETE (habitantes-http.ts) or the
// chat order that shares this same code. Pure file management + validation; this module never talks to a model.
// The inhabitants themselves are walked and talked by a SEPARATE process (numinia-habitantes, packages/agent/src/
// main.ts, DISENO-IAS-MOTOR.md D2: an LLM or a slow script must never sit in the tick). That service reads
// habitantes/ only once, at its own start, so a change here does nothing to it until it restarts: `recargar` is
// told after every write so the caller can restart it (installed: `systemctl restart numinia-habitantes`); this
// engine process is not root and never calls systemctl on its own account.
import { mkdirSync, renameSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { leerHabitantes, validarHabitante } from "../../agent/src/formato.ts";
import type { Habitante } from "../../agent/src/formato.ts";
import { lectorAventura } from "./aventura.ts";

export const HABITANTES_CARPETA = "habitantes";

export type OpcionesHabitantes = {
  aventura: string | null;                    // the adventure folder (its habitantes/ is read and written)
  agentesExternos?: () => ReadonlySet<string>; // ids already taken by an outside agent (agentes/): one id, one kind of AI
  recargar?: () => void;                       // told once after a file changes (restart numinia-habitantes)
  log?: (l: string) => void;
};

export type MotivoHabitante = "invalido" | "conflicto" | "no-hay" | "servidor" | "sin-permiso";
/** The escalón from which an inhabitant BUILDS (formato.ts ESCALONES: 4 = «y construye»). */
export const ESCALON_CONSTRUYE = 4;
/** Who asks for it, as far as building goes (t_6c1f98aa, H3): `puedeConstruir` = the pass is an owner's or holds «build-in-worlds». */
export type QuienPide = { puedeConstruir: boolean };
export type ResultadoHabitante =
  | { ok: true; texto: string; habitante?: { id: string; nombre: string; escalon: number } }
  | { ok: false; motivo: MotivoHabitante; texto: string };

export type GestionHabitantes = ReturnType<typeof crearHabitantesGestion>;

export function crearHabitantesGestion(o: OpcionesHabitantes) {
  const log = o.log ?? (() => {});
  const agentesExternos = o.agentesExternos ?? (() => new Set<string>());
  let lista = new Map<string, Habitante>();

  /** Read aventura/habitantes/ again (at start and after a change): what loads and, in the log, what does not. */
  const leer = (): number => {
    const r = leerHabitantes(lectorAventura(o.aventura ?? null, log)(HABITANTES_CARPETA));
    for (const p of r.problemas) log(`[habitantes] no se carga: ${p}`);
    lista = new Map(r.habitantes.map((h) => [h.id, h]));
    return lista.size;
  };
  leer();

  const fichero = (id: string) => (o.aventura ? join(o.aventura, HABITANTES_CARPETA, `${id}.json`) : null);
  const vista = (h: Habitante): { id: string; nombre: string; escalon: number } => ({ id: h.id, nombre: h.nombre, escalon: h.escalon });

  /** Write a new inhabitant's whole file (habitante@1) and read the list again; told to `recargar` once it loads. */
  const anadir = (cuerpo: unknown, quien?: QuienPide): ResultadoHabitante => {
    const r = validarHabitante(cuerpo, "habitante");
    if (!r.ok) return { ok: false, motivo: "invalido", texto: r.issues.map((i) => `${i.path.split(".").slice(1).join(".") || i.path}: ${i.message}`).join("; ") };
    // t_6c1f98aa (H3): building needs a role. An inhabitant of escalón 4 builds, so only a pass that may build itself can create one;
    // a caller that says nothing about who asks (`quien` absent) cannot (fail closed). Decided here, after the file is valid, before any write.
    if (r.value.escalon >= ESCALON_CONSTRUYE && quien?.puedeConstruir !== true) {
      log(`[habitantes] «${r.value.id}» (escalón ${r.value.escalon}) rechazado: quien lo pide no puede construir en este mundo`);
      return { ok: false, motivo: "sin-permiso", texto: `Un habitante de escalón ${ESCALON_CONSTRUYE} construye, y tu pase no deja construir en este mundo (falta el permiso «build-in-worlds»): pide uno de escalón 0 o 2, o que te lo asignen con ese rol.` };
    }
    const id = r.value.id;
    const f = fichero(id);
    if (!f || !o.aventura) return { ok: false, motivo: "servidor", texto: "Este mundo no tiene carpeta de aventura donde guardar habitantes." };
    if (agentesExternos().has(id)) return { ok: false, motivo: "conflicto", texto: `«${id}» es un agente de fuera de este mundo (agentes/${id}.json): un habitante necesita otro id.` };
    if (lista.has(id) || existsSync(f)) return { ok: false, motivo: "conflicto", texto: `Ya hay un habitante «${id}» (o su fichero): quítalo antes.` };
    try {
      mkdirSync(join(o.aventura, HABITANTES_CARPETA), { recursive: true });
      const tmp = `${f}.tmp-${process.pid}`;
      writeFileSync(tmp, JSON.stringify(r.value, null, 2) + "\n");
      renameSync(tmp, f);
    } catch (e) { log(`[habitantes] no puedo escribir ${f}: ${(e as Error).message}`); return { ok: false, motivo: "servidor", texto: "No he podido guardar el fichero del habitante (mira el registro del servidor)." }; }
    leer();
    if (!lista.has(id)) return { ok: false, motivo: "servidor", texto: "El fichero se guardó pero no se carga (mira el registro del servidor)." };
    log(`[habitantes] se añade el habitante «${id}»`);
    o.recargar?.();
    return { ok: true, texto: `Hecho: «${r.value.nombre}» vive en este mundo (aventura/habitantes/${id}.json); el servicio de habitantes se recarga.`, habitante: vista(lista.get(id)!) };
  };

  /** Delete an inhabitant's file and read the list again; told to `recargar` once it is gone. */
  const quitar = (id: string): ResultadoHabitante => {
    const f = fichero(id);
    if (!f || !lista.has(id)) return { ok: false, motivo: "no-hay", texto: `No hay ningún habitante «${id}» en este mundo.` };
    try { unlinkSync(f); } catch (e) { log(`[habitantes] no puedo borrar ${f}: ${(e as Error).message}`); return { ok: false, motivo: "servidor", texto: "No he podido borrar el fichero del habitante (mira el registro del servidor)." }; }
    leer();
    log(`[habitantes] se quita el habitante «${id}»`);
    o.recargar?.();
    return { ok: true, texto: `«${id}» ya no vive en este mundo; el servicio de habitantes se recarga.` };
  };

  return {
    leer, anadir, quitar,
    /** GET /habitantes: the small, public-ish view (never the brain's persona or any stored notes). */
    listar: (): Array<{ id: string; nombre: string; escalon: number }> => [...lista.values()].map(vista),
    /** The inhabitant listed with this id, or null (the puerta/server use the whole habitante@1, e.g. its name). */
    habitante: (id: string): Habitante | null => lista.get(id) ?? null,
    get habitantes(): Habitante[] { return [...lista.values()]; },
  };
}
