// cable-frase — a cable as one human sentence (D-041, historia B «cable sin JSON»). PURE: no DOM, no clock, no
// random, no I/O; the same trigger and language always give the same string, and it never throws (anything it does
// not understand becomes a safe sentence from the language file). Every visible word lives in cable-frases.<idioma>.ts;
// this file only picks keys and fills {parametros}. The panel (apps/plaza/cable.ts) shows it today; the server and
// agents (historia D, «Decirlo») import the same function to show a sentence for confirmation.
import { FRASES_ES } from "./cable-frases.es.ts";
import { FRASES_EN } from "./cable-frases.en.ts";

export type Idioma = "es" | "en";
export type ClaveFrase = keyof typeof FRASES_ES;
export const IDIOMAS: readonly Idioma[] = ["es", "en"];
export const FRASES: Record<Idioma, Record<ClaveFrase, string>> = { es: FRASES_ES, en: FRASES_EN };

/** The part of a trigger the sentence needs (the page's, the server's and a file line's `Disparador` all fit). */
export type DisparadorFrase = { nombre?: unknown; tipo?: unknown; senal?: unknown; cooldown?: unknown; unSoloUso?: unknown; receptores?: unknown };

/** «es-ES», «EN», undefined… → a language we have; anything else is Spanish. */
export const idiomaDe = (x: unknown): Idioma => {
  const base = String(x ?? "").toLowerCase().split(/[-_]/)[0];
  return (IDIOMAS as readonly string[]).includes(base) ? (base as Idioma) : "es";
};

/** Fills {name} placeholders in ONE pass: a value that itself contains «{x}» is never expanded again. */
const llenar = (plantilla: string, valores: Record<string, string>): string =>
  plantilla.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(valores, k) ? valores[k]! : m));
const texto = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim();
const num = (v: unknown): string => { const n = Number(v); return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : "?"; };
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function accion(t: Record<ClaveFrase, string>, r: unknown): string {
  if (!esObjeto(r)) return t["accion.desconocida"];
  const clave = `accion.${texto(r.accion)}` as ClaveFrase;
  if (!Object.prototype.hasOwnProperty.call(t, clave) || clave === "accion.desconocida") return t["accion.desconocida"];
  return llenar(t[clave], {
    objeto: texto(r.objeto), x: num(r.x), y: num(r.y), z: num(r.z), mision: texto(r.mision), paso: num(r.paso), enlace: texto(r.enlace), sonido: texto(r.sonido),
  });
}

function unir(t: Record<ClaveFrase, string>, partes: string[]): string {
  if (partes.length === 1) return partes[0]!;
  if (partes.length === 2) return llenar(t["lista.dos"], { a: partes[0]!, b: partes[1]! });
  let resto = partes[0]!;
  for (let i = 1; i < partes.length - 1; i++) resto = llenar(t["lista.sep"], { a: resto, b: partes[i]! });
  return llenar(t["lista.ultimo"], { resto, ultimo: partes[partes.length - 1]! });
}

/** «Cuando alguien pulse “Botón rojo”, muestra “Farola”. Espera 5 s.» — see the files for the other kinds and languages. */
export function fraseDeCable(disparador: DisparadorFrase | null | undefined, idioma: string = "es"): string {
  const t = FRASES[idiomaDe(idioma)];
  if (!esObjeto(disparador)) return t["frase.vacia"];
  const tipo = texto(disparador.tipo);
  const clave: ClaveFrase = tipo === "boton" || tipo === "zona" || tipo === "senal" ? (`cuando.${tipo}` as ClaveFrase) : "cuando.otro";
  const cuando = llenar(t[clave], { nombre: texto(disparador.nombre), senal: texto(disparador.senal) });
  const receptores = Array.isArray(disparador.receptores) ? disparador.receptores : [];
  const principal = receptores.length
    ? llenar(t["frase.completa"], { cuando, acciones: unir(t, receptores.map((r) => accion(t, r))) })
    : llenar(t["frase.sinAcciones"], { cuando });
  const extras: string[] = [principal];
  const espera = Math.round(Number(disparador.cooldown));
  if (Number.isFinite(espera) && espera > 0) extras.push(llenar(t["extra.espera"], { segundos: String(espera) }));
  if (disparador.unSoloUso === true) extras.push(t["extra.unSoloUso"]);
  return extras.join(" ");
}
