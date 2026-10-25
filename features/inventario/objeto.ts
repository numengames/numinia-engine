// inventario — objeto@1 (Y3): the weapons and relics an ADVENTURE defines, one JSON file each in `aventuras/<x>/objetos/`.
// Pure (no I/O, no clock): the server reads the folder through `api.aventura("objetos")`, this file reads and checks each
// file and says WHAT is wrong in plain words (the author's diagnostic); a valid one becomes the thing `otorga` hands over.
//
//   { "formato": "objeto@1", "id": "lira-de-nyx", "tipo": "reliquia", "clase": "lira", "nombre": "Lira de Nyx",
//     "descripcion": "…", "competencia": "Tecnomancia", "propiedad": "Resonancia Memorística",
//     "factorRiesgo": { "nombre": "Desfase Armónico", "consecuencia": "Si se obtiene un Fracaso, …" },
//     "modelo": "<sha256 of a .glb>", "icono": "…", "valor": 3 }
//
// Canon (manual 06, «Reliquias»): a relic's property is always articulated with a Competencia (the points in it are the dice
// pool) and every relic has a Factor de Riesgo (what a Fracaso costs). A weapon needs the Competencia too; its Factor de
// Riesgo is optional. `modelo` (weapons only) is what the avatar holds in its hand while it is carried (MIS-246 Y2).
import { LIM, SHA256 } from "./reglas.ts";
import type { Entrega } from "./reglas.ts";

export type FactorRiesgo = { nombre: string; consecuencia: string };
export type ObjetoAventura = {
  id: string; tipo: "arma" | "reliquia"; clase: string; nombre: string; descripcion: string;
  competencia: string; propiedad: string; factorRiesgo: FactorRiesgo | null; modelo: string; icono: string; valor: number;
};
export type LecturaObjeto = { ok: true; objeto: ObjetoAventura; avisos: string[] } | { ok: false; fichero: string; problemas: string[] };

export const FORMATO_OBJETO = "objeto@1";
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const texto = (o: Record<string, unknown>, k: string, max: number, quien: string, p: string[], obligatorio = false): string => {
  const v = o[k];
  if (v === undefined || v === null || v === "") { if (obligatorio) p.push(`${quien}: falta «${k}»`); return ""; }
  if (typeof v !== "string") { p.push(`${quien}: «${k}» debe ser un texto`); return ""; }
  const t = v.trim();
  if (bytes(t) > max) { p.push(`${quien}: «${k}» pasa de ${max} bytes (tiene ${bytes(t)})`); return ""; }
  if (obligatorio && !t) p.push(`${quien}: falta «${k}»`);
  return t;
};

/** Read ONE file of `objetos/`. Never throws: a broken file is `{ ok: false, problemas }` with every problem found, not just the first. */
export function leerObjeto(fichero: string, contenido: string): LecturaObjeto {
  const p: string[] = [], avisos: string[] = [], quien = fichero;
  let raw: unknown;
  try { raw = JSON.parse(contenido); } catch (e) { return { ok: false, fichero, problemas: [`${quien}: no es JSON válido (${String((e as Error)?.message ?? e).slice(0, 80)})`] }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, fichero, problemas: [`${quien}: debe ser un objeto JSON`] };
  const o = raw as Record<string, unknown>;
  if (o.formato !== FORMATO_OBJETO) p.push(`${quien}: «formato» debe ser "${FORMATO_OBJETO}"${o.formato === undefined ? " (falta)" : ` (es ${JSON.stringify(o.formato)})`}`);
  const id = texto(o, "id", 32, quien, p, true);
  if (id && !ID.test(id)) p.push(`${quien}: «id» en minúsculas, cifras y guiones (1-32), sin espacios: «${id}»`);
  const tipo = o.tipo;
  if (tipo !== "arma" && tipo !== "reliquia") p.push(`${quien}: «tipo» debe ser "arma" o "reliquia"${tipo === undefined ? " (falta)" : ` (es ${JSON.stringify(tipo)})`}`);
  const clase = texto(o, "clase", LIM.clase, quien, p, true), nombre = texto(o, "nombre", LIM.nombre, quien, p, true);
  const descripcion = texto(o, "descripcion", 400, quien, p);
  const competencia = texto(o, "competencia", LIM.competencia, quien, p, true), propiedad = texto(o, "propiedad", LIM.propiedad, quien, p);
  let factorRiesgo: FactorRiesgo | null = null;
  const fr = o.factorRiesgo;
  if (fr !== undefined && fr !== null) {
    if (typeof fr !== "object" || Array.isArray(fr)) p.push(`${quien}: «factorRiesgo» debe ser { "nombre": …, "consecuencia": … }`);
    else { const f = fr as Record<string, unknown>; factorRiesgo = { nombre: texto(f, "nombre", LIM.riesgo, `${quien} factorRiesgo`, p, true), consecuencia: texto(f, "consecuencia", 300, `${quien} factorRiesgo`, p, true) }; }
  } else if (tipo === "reliquia") p.push(`${quien}: una reliquia lleva «factorRiesgo» (qué cuesta un Fracaso al usarla)`);
  let modelo = "";
  if (o.modelo !== undefined && o.modelo !== "") {
    if (typeof o.modelo !== "string" || !SHA256.test(o.modelo)) p.push(`${quien}: «modelo» es el sha256 de un .glb (64 caracteres hexadecimales en minúscula)`);
    else if (tipo !== "arma") avisos.push(`${quien}: «modelo» solo se dibuja en las armas; se ignora`);
    else modelo = o.modelo;
  }
  const icono = texto(o, "icono", LIM.icono, quien, p);
  const valor = o.valor === undefined ? 0 : o.valor;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0 || valor > 10000) p.push(`${quien}: «valor» es un entero de 0 a 10000`);
  if (p.length) return { ok: false, fichero, problemas: p };
  return { ok: true, avisos, objeto: { id, tipo: tipo as "arma" | "reliquia", clase, nombre, descripcion, competencia, propiedad, factorRiesgo, modelo, icono, valor: valor as number } };
}

export type Catalogo = { objetos: Map<string, ObjetoAventura>; problemas: string[]; avisos: string[] };
/** Read every `objetos/*.json` of an adventure (what `api.aventura("objetos")` returns). A duplicate id is a problem (the second is dropped); other files (notes) are skipped. */
export function leerCatalogo(ficheros: readonly { fichero: string; texto: string }[]): Catalogo {
  const c: Catalogo = { objetos: new Map(), problemas: [], avisos: [] };
  for (const f of [...ficheros].sort((a, b) => a.fichero.localeCompare(b.fichero))) {
    if (!/\.json$/i.test(f.fichero)) continue;
    const r = leerObjeto(f.fichero, f.texto);
    if (!r.ok) { c.problemas.push(...r.problemas); continue; }
    c.avisos.push(...r.avisos);
    if (c.objetos.has(r.objeto.id)) { c.problemas.push(`${f.fichero}: el id «${r.objeto.id}» ya lo usa otro fichero`); continue; }
    c.objetos.set(r.objeto.id, r.objeto);
  }
  return c;
}

/** What `otorga` hands over for a defined object. */
export const comoEntrega = (d: ObjetoAventura): Entrega => ({
  tipo: d.tipo, clase: d.clase, nombre: d.nombre, icono: d.icono, valor: d.valor, modelo: d.modelo,
  competencia: d.competencia, riesgo: d.factorRiesgo?.nombre ?? "",
});
