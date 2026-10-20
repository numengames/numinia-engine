// cable-huecos — a cable as a sentence WITH BLANKS (D-041, historia C «cable sin JSON»). PURE: no DOM, no clock, no
// random, no I/O. It does what cable-frase.ts does for reading, but for editing: it returns the sentence as an ordered
// list of parts — plain text, or a «hueco» (slot) that says which control the page puts there (a <select>, a text,
// a number, a button, a checkbox), its accessible label, its current value and, for a <select>, the ONLY values that
// can be chosen. The page draws one control per hueco and holds no rule: what is valid is decided here (the choices)
// and, above all, by the server (features/disparadores/server.ts re-validates everything on save). Every visible word
// lives in cable-frases.<idioma>.ts; this file only picks keys and fills {parametros}. Historia D («Decirlo») can use
// the same parts to show what it understood.
import { ACCIONES, COOLDOWN_MAX_S, RECEPTORES_MAX, TIPOS } from "./feature.ts";
import type { Accion } from "./feature.ts";
import { FRASES, fraseDeCable, idiomaDe } from "./cable-frase.ts";
import type { ClaveFrase } from "./cable-frase.ts";

export type Opcion = { valor: string; texto: string };
export type Control = "select" | "texto" | "numero" | "boton" | "casilla";
export type Hueco = "tipo" | "nombre" | "senal" | "accion" | "objeto" | "x" | "y" | "z" | "aqui" | "mision" | "paso" | "enlace" | "sonido" | "espera" | "unSoloUso";
export type Parte =
  | { texto: string }
  | { hueco: Hueco; control: Control; etiqueta: string; valor: string; opciones?: Opcion[]; min?: number; max?: number; paso?: number; largoMax?: number; receptor?: number; visible?: string };

/** What the world offers to choose from. The page fills it from the live state; the lists are plain {valor, texto}. */
export type ContextoCable = { objetos: Opcion[]; movedores: Opcion[]; misiones: Opcion[]; sonidos: Opcion[] };
export const CONTEXTO_VACIO: ContextoCable = { objetos: [], movedores: [], misiones: [], sonidos: [] };
/** The editable part of a cable (what the page keeps as a draft; a `Disparador` of the state fits). */
export type BorradorCable = { nombre?: unknown; tipo?: unknown; senal?: unknown; cooldown?: unknown; unSoloUso?: unknown; receptores?: unknown };
/** `frase` is the whole sentence as plain text (for the group's aria-label); `fin` closes the last action. */
export type CableEnHuecos = { cuando: Parte[]; acciones: Parte[][]; fin: string; espera: Parte[]; maxAcciones: number; frase: string };

/** The waits a builder can pick from (seconds); a value the cable already has is added to the list. */
export const ESPERAS_S: readonly number[] = [0, 1, 2, 5, 10, 30, 60, 300];

const llenar = (plantilla: string, valores: Record<string, string>): string =>
  plantilla.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(valores, k) ? valores[k]! : m));
const texto = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim();
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numero = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const tipoValido = (v: unknown): "boton" | "zona" | "senal" => (v === "zona" || v === "senal" ? v : "boton");
const accionValida = (v: unknown): Accion | null => ((ACCIONES as readonly string[]).includes(texto(v)) ? (texto(v) as Accion) : null);

/** «5 s», «1 min», «sin espera» — through the language file. */
export function textoEspera(segundos: number, idioma: string = "es"): string {
  const t = FRASES[idiomaDe(idioma)];
  if (segundos <= 0) return t["espera.cero"];
  if (segundos >= 60 && segundos % 60 === 0) return llenar(t["espera.min"], { minutos: String(segundos / 60) });
  return llenar(t["espera.s"], { segundos: String(segundos) });
}

/** The options of the «espera» slot: the sensible ones plus the cable's own value when it is something else. */
export function opcionesEspera(actual: unknown, idioma: string = "es"): Opcion[] {
  const a = Math.min(COOLDOWN_MAX_S, Math.max(0, Math.round(numero(actual))));
  const todos = ESPERAS_S.includes(a) ? [...ESPERAS_S] : [...ESPERAS_S, a].sort((p, q) => p - q);
  return todos.map((s) => ({ valor: String(s), texto: textoEspera(s, idioma) }));
}
export const opcionesTipo = (idioma: string = "es"): Opcion[] => TIPOS.map((t) => ({ valor: t, texto: FRASES[idiomaDe(idioma)][`tipo.${t}`] }));
export const opcionesAccion = (idioma: string = "es"): Opcion[] => ACCIONES.map((a) => ({ valor: a, texto: FRASES[idiomaDe(idioma)][`opcion.${a}`] }));

/** A list of choices that always contains the current value (a cable that names a thing no longer in the world still shows it). */
function conActual(lista: Opcion[], actual: string): Opcion[] {
  if (!actual || lista.some((o) => o.valor === actual)) return lista;
  return [{ valor: actual, texto: actual }, ...lista];
}

/** A new receiver of this action with the first valid choices of the world (the server still checks it on save). */
export function receptorNuevo(accion: string, ctx: ContextoCable = CONTEXTO_VACIO, aqui?: { x: number; y: number; z: number } | null): Record<string, unknown> {
  const a = accionValida(accion) ?? "suena";
  switch (a) {
    case "muestra": case "oculta": return { accion: a, objeto: ctx.objetos[0]?.valor ?? "" };
    case "mueve": return { accion: a, objeto: ctx.movedores[0]?.valor ?? "" };
    case "teletransporta": return { accion: a, x: Math.round(numero(aqui?.x) * 10) / 10, y: Math.round(numero(aqui?.y) * 10) / 10, z: Math.round(numero(aqui?.z) * 10) / 10 };
    case "da_paso": return { accion: a, mision: ctx.misiones[0]?.valor ?? "", paso: 1 };
    case "abre_enlace": return { accion: a, enlace: "https://" };
    case "suena": return { accion: a, sonido: ctx.sonidos.find((s) => s.valor === "campana")?.valor ?? ctx.sonidos[0]?.valor ?? "campana" };
    case "vuelve_a_seguro": return { accion: a };
  }
}

/** Split a template into text and {huecos}; `hacer` turns each name into a Parte (or null to drop it). */
function trocear(plantilla: string, hacer: (nombre: string) => Parte | null): Parte[] {
  const out: Parte[] = [];
  let desde = 0;
  for (const m of plantilla.matchAll(/\{(\w+)\}/g)) {
    if (m.index! > desde) out.push({ texto: plantilla.slice(desde, m.index) });
    const p = hacer(m[1]!);
    if (p) out.push(p);
    desde = m.index! + m[0].length;
  }
  if (desde < plantilla.length) out.push({ texto: plantilla.slice(desde) });
  return out;
}

/** The sentence of a draft as parts: «Cuando [tipo] [nombre], [acción] [objeto]. Espera [5 s]. [ ] Solo una vez.» */
export function huecosDeCable(borrador: BorradorCable | null | undefined, idioma: string = "es", ctx: ContextoCable = CONTEXTO_VACIO): CableEnHuecos {
  const t = FRASES[idiomaDe(idioma)];
  const b: BorradorCable = esObjeto(borrador) ? borrador : {};
  const tipo = tipoValido(b.tipo);
  const etiqueta = (k: string, n: number): string => llenar(t[`etiqueta.${k}` as ClaveFrase], { n: String(n) });

  const cuandoHueco = (nombre: string): Parte | null => {
    if (nombre === "tipo") return { hueco: "tipo", control: "select", etiqueta: etiqueta("tipo", 0), valor: tipo, opciones: opcionesTipo(idioma) };
    if (nombre === "nombre") return { hueco: "nombre", control: "texto", etiqueta: etiqueta("nombre", 0), valor: texto(b.nombre), largoMax: 60 };
    if (nombre === "senal") return { hueco: "senal", control: "texto", etiqueta: etiqueta("senal", 0), valor: texto(b.senal), largoMax: 32 };
    return null;
  };
  const cuando = trocear(t[tipo === "senal" ? "editor.cuandoSenal" : "editor.cuando"], cuandoHueco);

  const receptores = (Array.isArray(b.receptores) ? b.receptores : []).slice(0, RECEPTORES_MAX);
  const acciones = receptores.map((r, i): Parte[] => {
    const n = i + 1, o = esObjeto(r) ? r : {};
    const accion = accionValida(o.accion);
    const hueco = (nombre: string): Parte | null => {
      const base = { receptor: i, etiqueta: etiqueta(nombre, n) };
      switch (nombre) {
        case "accion": return { ...base, hueco: "accion", control: "select", valor: accion ?? "", opciones: accion ? opcionesAccion(idioma) : [{ valor: "", texto: t["nota.elige"] }, ...opcionesAccion(idioma)] };
        case "objeto": {
          const lista = accion === "mueve" ? ctx.movedores : ctx.objetos;
          const ops = conActual(lista, texto(o.objeto));
          return { ...base, hueco: "objeto", control: "select", valor: texto(o.objeto), opciones: ops.length ? ops : [{ valor: "", texto: t["nota.sinOpciones"] }] };
        }
        case "x": case "z": return { ...base, hueco: nombre, control: "numero", valor: String(numero(o[nombre])), min: -2000, max: 2000, paso: 0.1 };
        case "y": return { ...base, hueco: "y", control: "numero", valor: String(numero(o.y)), min: -100, max: 500, paso: 0.1 };
        case "aqui": return { ...base, hueco: "aqui", control: "boton", valor: "", visible: t["boton.aqui"] };
        case "mision": {
          // no list of quests known → a short text (the server checks it); with a list → only those, plus the current one
          if (!ctx.misiones.length) return { ...base, hueco: "mision", control: "texto", valor: texto(o.mision), largoMax: 32 };
          return { ...base, hueco: "mision", control: "select", valor: texto(o.mision), opciones: conActual(ctx.misiones, texto(o.mision)) };
        }
        case "paso": return { ...base, hueco: "paso", control: "numero", valor: String(Math.round(numero(o.paso))), min: 0, max: 999, paso: 1 };
        case "enlace": return { ...base, hueco: "enlace", control: "texto", valor: texto(o.enlace), largoMax: 190 };
        case "sonido": {
          const ops = conActual(ctx.sonidos, texto(o.sonido));
          return { ...base, hueco: "sonido", control: "select", valor: texto(o.sonido), opciones: ops.length ? ops : [{ valor: "", texto: t["nota.sinOpciones"] }] };
        }
        default: return null;
      }
    };
    const plantilla = accion ? t[`editor.${accion}` as ClaveFrase] : "{accion}";
    const partes = trocear(plantilla, hueco);
    return i === 0 ? partes : [{ texto: `${t["editor.otra"]} ` }, ...partes];
  });

  const hechoUnico = (nombre: string): Parte | null => nombre === "unSoloUso"
    ? { hueco: "unSoloUso", control: "casilla", etiqueta: etiqueta("unSoloUso", 0), valor: b.unSoloUso === true ? "1" : "", visible: t["etiqueta.unSoloUso"] } : null;
  const esperaHueco = (nombre: string): Parte | null => nombre === "espera"
    ? { hueco: "espera", control: "select", etiqueta: etiqueta("espera", 0), valor: String(Math.min(COOLDOWN_MAX_S, Math.max(0, Math.round(numero(b.cooldown))))), opciones: opcionesEspera(b.cooldown, idioma) } : null;
  const espera = [...trocear(t["editor.espera"], esperaHueco), { texto: " " } as Parte, ...trocear(t["editor.unSoloUso"], hechoUnico)];
  return { cuando, acciones, fin: t["editor.fin"], espera, maxAcciones: RECEPTORES_MAX, frase: fraseDeCable(b as Parameters<typeof fraseDeCable>[0], idioma) };
}
