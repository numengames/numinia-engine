// panel — the «Funciones de este mundo» block of the Entorno panel as data (funciones/f3). PURE: no DOM, no clock, no I/O; the same
// state and language always give the same rows, and it never throws. Which rows exist (the functions this world has), what each says,
// and whether it can be pressed live HERE; the page (apps/plaza/entorno.ts) only draws one switch per row, shaped exactly like the
// «Espacio base» one, and asks the server (`ponerFuncion`) — the switch shows the server's state, never its own click.
// Every visible word lives in frases.<idioma>.ts; this file only picks keys and fills {parametros}.
import { FUNCIONES } from "./feature.ts";
import type { Funcion } from "./feature.ts";
import { FRASES_ES } from "./frases.es.ts";
import { FRASES_EN } from "./frases.en.ts";

export type Idioma = "es" | "en";
export type ClaveFrase = keyof typeof FRASES_ES;
export const IDIOMAS: readonly Idioma[] = ["es", "en"];
export const FRASES: Record<Idioma, Record<ClaveFrase, string>> = { es: FRASES_ES, en: FRASES_EN };

/** «es-ES», «EN», undefined… → a language we have; anything else is Spanish. */
export const idiomaDe = (x: unknown): Idioma => {
  const base = String(x ?? "").toLowerCase().split(/[-_]/)[0];
  return (IDIOMAS as readonly string[]).includes(base) ? (base as Idioma) : "es";
};

const llenar = (plantilla: string, valores: Record<string, string>): string =>
  plantilla.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(valores, k) ? valores[k]! : m));

/** What the page knows: the switches the world has (`actual()`: a function the world lacks is not a key), which of them the server fixes, and whether you may build. */
export type EntradaPanel = { actual: Partial<Record<Funcion, boolean>>; fija: Partial<Record<Funcion, boolean>>; puede: boolean };

export type FilaFuncion = {
  funcion: Funcion;
  etiqueta: string;
  /** The state as the server says it. */
  activa: boolean;
  fija: boolean;
  /** Can it be pressed now: you may build and the server does not fix it. */
  pulsable: boolean;
  /** The words for the state, to read it aloud («encendida» / «apagada»). */
  estado: string;
  titulo: string;
  /** Short lines under the switch: the help of the function, then «Lo fija el servidor.» when it is fixed. */
  notas: string[];
};

/** The heading of the block. */
export const tituloGrupo = (idioma: unknown = "es"): string => FRASES[idiomaDe(idioma)]["grupo"];

/** The rows for the block, in the order of FUNCIONES, only for the functions the world has. Nobody who cannot build sees the block (no rows), like «Espacio base». */
export function filasFunciones(e: EntradaPanel, idioma: unknown = "es"): FilaFuncion[] {
  if (!e || e.puede !== true) return [];
  const t = FRASES[idiomaDe(idioma)];
  const filas: FilaFuncion[] = [];
  for (const f of FUNCIONES) {
    const v = e.actual?.[f];
    if (typeof v !== "boolean") continue;
    const fija = e.fija?.[f] === true;
    const notas: string[] = [];
    if (f === "normas") notas.push(t["ayuda.normas"]);
    if (fija) notas.push(t["ayuda.fija"]);
    filas.push({ funcion: f, etiqueta: t[`funcion.${f}`], activa: v, fija, pulsable: !fija, estado: t[v ? "estado.encendida" : "estado.apagada"], titulo: t[`titulo.${f}`], notas });
  }
  return filas;
}

/** What the status line says: asking (`encendiendo`/`apagando`), done (`encendida`/`apagada`), or refused because the server fixes it (`fija`). An unknown function or step is an empty line, never a throw. */
export function textoCambio(f: Funcion, paso: "encendiendo" | "apagando" | "encendida" | "apagada" | "fija", idioma: unknown = "es"): string {
  const t = FRASES[idiomaDe(idioma)], funcion = t[`funcion.${f}` as ClaveFrase];
  const clave = ({ encendiendo: "accion.encendiendo", apagando: "accion.apagando", encendida: "hecho.encendida", apagada: "hecho.apagada", fija: "no.fija" } as const)[paso];
  return funcion && clave ? llenar(t[clave], { funcion }) : "";
}
