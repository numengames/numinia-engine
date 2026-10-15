// ajustes (N2): the FORMAT of a setting and its validation — what the engine (client/src/ajustes-motor.ts), each game
// feature (`ajustes` in defineFeature) and each world's file declare. Pure data rules; the registry that keeps values,
// applies them and decides defaults on this device is packages/client/src/ajustes.ts. Validation returns issues with
// paths; nothing here throws. Recipe: docs/EXTENDER.md («Añadir un ajuste»).
import type { Issue, Result } from "../../core/src/index.ts";

export type Nivel = "A" | "B" | "C" | "D";
/** Device tiers of limits.json («devices»): A desktop, B standalone headset, C mid phone, D old phone / Chromebook. */
export const NIVELES: readonly Nivel[] = ["A", "B", "C", "D"];
export type ValorCapacidad = boolean | number | string;
/** What this device can do: one flat object of plain values (packages/client/src/capacidades.ts reads it). */
export type Capacidades = Record<string, ValorCapacidad>;

export type Valor = boolean | number | string;
export type Tipo = "bool" | "numero" | "eleccion" | "tecla";
export const TIPOS: readonly Tipo[] = ["bool", "numero", "eleccion", "tecla"];
export type Opcion = { valor: string; nombre: string };
/** A default that depends on the device: the first `si` whose capabilities all hold wins, then the tier, then `valor`. */
export type DefectoRico = { valor: Valor; nivel?: Partial<Record<Nivel, Valor>>; si?: { requiere: string[]; valor: Valor }[] };
export type Defecto = Valor | DefectoRico;
/** Where a chosen value is kept: for the whole device, or for this world only. */
export type Alcance = "aparato" | "mundo";
export type AjusteDecl = {
  id: string;            // camelCase, unique in its group: "resolucion" (the full id is "graficos.resolucion")
  grupo?: string;        // engine settings: graficos, sonido, controles, accesibilidad, interfaz, privacidad; a feature's: its id
  tipo: Tipo;            // bool · numero (min, max, paso, unidad) · eleccion (opciones) · tecla (a KeyboardEvent.code)
  nombre: string;        // the label, as said aloud (≤ 40)
  describe: string;      // what it changes, one line a screen reader says (≤ 160)
  defecto: Defecto;
  min?: number; max?: number; paso?: number; unidad?: string;
  opciones?: Opcion[];
  requiere?: string[];   // capabilities it needs ("webgpu", "!tactil", "memoriaGB>=4"); hidden and not applied otherwise
  nota?: string;         // shown under it, e.g. "Llega con H5" (honest about what does not work yet)
  alcance?: Alcance;     // default: engine settings per device, features' and worlds' per world
  soloVer?: boolean;     // shown, not changeable (key bindings until remapping exists)
  preajuste?: Record<string, Record<string, Valor | null>>; // eleccion: choosing an option also sets these (null = back to default)
};

export const NOMBRE_MAX = 40, DESCRIBE_MAX = 160, NOTA_MAX = 90, OPCIONES_MAX = 16;
export const AJUSTES_POR_FUNCION_MAX = 16;  // settings one feature (or one world file) may add
const ID = /^[a-z][a-zA-Z0-9]{0,31}$/, GRUPO = /^[a-z][a-z0-9-]{1,31}$/, TECLA = /^[A-Z][A-Za-z0-9]{1,23}$/, OPCION = /^[a-z0-9][a-z0-9-]{0,23}$/;
export const idAjusteValido = (s: unknown): s is string => typeof s === "string" && ID.test(s);
export const grupoValido = (s: unknown): s is string => typeof s === "string" && GRUPO.test(s);

// ---------- `requiere`: the capabilities a setting needs ----------
// "webgpu" (truthy) · "!tactil" (falsy) · "memoriaGB>=4", "nivel=A", "maxTextura>4096" (compare; as numbers when both are)
const EXPR = /^(!?)([a-zA-Z][a-zA-Z0-9.]*)(?:(>=|<=|=|>|<)([A-Za-z0-9.-]+))?$/;
export const exprValida = (e: unknown): boolean => typeof e === "string" && EXPR.test(e);

export function cumple(expr: string, c: Capacidades): boolean {
  const m = EXPR.exec(expr);
  if (!m) return false;
  const [, no, id, op, lit] = m;
  const v = c[id];
  let r: boolean;
  if (!op) r = !!v;
  else {
    const a = Number(v), b = Number(lit);
    const num = typeof v === "number" || (typeof v === "string" && v !== "" && !Number.isNaN(a));
    if (op === "=") r = num && !Number.isNaN(b) ? a === b : String(v) === lit;
    else if (!num || Number.isNaN(b)) r = false;
    else r = op === ">=" ? a >= b : op === "<=" ? a <= b : op === ">" ? a > b : a < b;
  }
  return no ? !r : r;
}

/** The expressions of `requiere` this device does not meet (empty = it may be shown and applied). */
export const faltan = (req: readonly string[] | undefined, c: Capacidades): string[] => (req ?? []).filter((e) => !cumple(e, c));

/** The value of a default on this device. */
export function resolverDefecto(d: Defecto, c: Capacidades): Valor {
  if (typeof d !== "object" || d === null) return d;
  for (const s of d.si ?? []) if (faltan(s.requiere, c).length === 0) return s.valor;
  const n = d.nivel?.[c.nivel as Nivel];
  return n !== undefined ? n : d.valor;
}

// ---------- validation ----------
const decimales = (p: number) => (String(p).split(".")[1] ?? "").length;
/** Is `v` a value this setting accepts? Numbers are snapped to the step. */
export function validarValor(d: AjusteDecl, v: unknown, ruta: string): Result<Valor> {
  const no = (message: string): Result<Valor> => ({ ok: false, issues: [{ path: ruta, message }] });
  if (d.tipo === "bool") return typeof v === "boolean" ? { ok: true, value: v } : no("true or false");
  if (d.tipo === "numero") {
    const min = d.min ?? 0, max = d.max ?? 0, paso = d.paso ?? 1, u = d.unidad ? ` ${d.unidad}` : "";
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return no(`a number from ${min} to ${max}${u}, in steps of ${paso}`);
    return { ok: true, value: Math.min(max, Number((min + Math.round((v - min) / paso) * paso).toFixed(decimales(paso)))) };
  }
  if (d.tipo === "eleccion") {
    const vals = (d.opciones ?? []).map((o) => o.valor);
    return typeof v === "string" && vals.includes(v) ? { ok: true, value: v } : no(`one of: ${vals.join(", ")}`);
  }
  if (d.tipo === "tecla") return typeof v === "string" && TECLA.test(v) ? { ok: true, value: v } : no('a KeyboardEvent.code, e.g. "KeyO" or "Escape"');
  return no("unknown type");
}

const valorIssues = (d: AjusteDecl, v: unknown, ruta: string): Issue[] => { const r = validarValor(d, v, ruta); return r.ok ? [] : r.issues; };

/** Is this default right for the setting, for every tier and every condition? */
export function validarDefecto(d: AjusteDecl, def: unknown, ruta: string): Issue[] {
  if (def === undefined) return [{ path: ruta, message: "every setting needs a default (defecto)" }];
  if (typeof def !== "object" || def === null) return valorIssues(d, def, ruta);
  const r = def as DefectoRico, out: Issue[] = [...valorIssues(d, r.valor, `${ruta}.valor`)];
  if (r.nivel !== undefined) {
    if (typeof r.nivel !== "object" || r.nivel === null) out.push({ path: `${ruta}.nivel`, message: "nivel: { A?, B?, C?, D? } (device tiers, limits.json)" });
    else for (const [k, v] of Object.entries(r.nivel)) {
      if (!NIVELES.includes(k as Nivel)) out.push({ path: `${ruta}.nivel.${k}`, message: "tiers are A, B, C and D (limits.json «devices»)" });
      else out.push(...valorIssues(d, v, `${ruta}.nivel.${k}`));
    }
  }
  if (r.si !== undefined) {
    if (!Array.isArray(r.si)) out.push({ path: `${ruta}.si`, message: "si: [{ requiere: [capabilities], valor }] — the first that holds wins" });
    else r.si.forEach((s, i) => {
      if (!s || !Array.isArray(s.requiere) || !s.requiere.length || !s.requiere.every(exprValida)) out.push({ path: `${ruta}.si.${i}.requiere`, message: 'capabilities, e.g. ["menosMovimiento"] or ["memoriaGB>=4"]' });
      out.push(...valorIssues(d, s?.valor, `${ruta}.si.${i}.valor`));
    });
  }
  return out;
}

const texto = (t: unknown, max: number, ruta: string, que: string, out: Issue[]) => {
  if (typeof t !== "string" || !t.trim() || t.length > max) out.push({ path: ruta, message: `${que}: 1-${max} characters` });
};

/** Check one declaration. `ruta` names it in the issues (e.g. "gestos.ajustes.etiquetas"). */
export function validarAjuste(d: unknown, ruta: string): Issue[] {
  if (typeof d !== "object" || d === null) return [{ path: ruta, message: "a setting is an object: { id, tipo, nombre, describe, defecto } (docs/EXTENDER.md)" }];
  const a = d as AjusteDecl, out: Issue[] = [];
  if (!idAjusteValido(a.id)) out.push({ path: `${ruta}.id`, message: "camelCase id, letter first, up to 32 characters, e.g. 'resolucion'" });
  if (a.grupo !== undefined && !grupoValido(a.grupo)) out.push({ path: `${ruta}.grupo`, message: "lowercase group id, e.g. 'graficos'" });
  if (!TIPOS.includes(a.tipo)) { out.push({ path: `${ruta}.tipo`, message: "bool, numero, eleccion or tecla" }); return out; }
  texto(a.nombre, NOMBRE_MAX, `${ruta}.nombre`, "its name, as said aloud (the label)", out);
  texto(a.describe, DESCRIBE_MAX, `${ruta}.describe`, "what it changes, one line a screen reader says", out);
  if (a.nota !== undefined) texto(a.nota, NOTA_MAX, `${ruta}.nota`, "a short note shown under it", out);
  if (a.tipo === "numero") {
    const { min, max, paso } = a;
    if (!(Number.isFinite(min) && Number.isFinite(max) && (min as number) < (max as number))) out.push({ path: `${ruta}.min`, message: "numero needs finite min < max" });
    else if (!(typeof paso === "number" && paso > 0 && ((max as number) - (min as number)) / paso <= 10_000)) out.push({ path: `${ruta}.paso`, message: "paso > 0, at most 10,000 steps from min to max" });
    if (a.unidad !== undefined && (typeof a.unidad !== "string" || a.unidad.length > 8)) out.push({ path: `${ruta}.unidad`, message: "a short unit such as % or m (≤ 8)" });
  } else if (a.min !== undefined || a.max !== undefined || a.paso !== undefined) out.push({ path: `${ruta}.min`, message: "min, max and paso belong to numero settings" });
  if (a.tipo === "eleccion") {
    const ops = a.opciones;
    if (!Array.isArray(ops) || ops.length < 1 || ops.length > OPCIONES_MAX) out.push({ path: `${ruta}.opciones`, message: `eleccion needs 1-${OPCIONES_MAX} opciones: [{ valor, nombre }]` });
    else {
      const vistos = new Set<string>();
      ops.forEach((o, i) => {
        if (!o || typeof o.valor !== "string" || !OPCION.test(o.valor) || vistos.has(o.valor)) out.push({ path: `${ruta}.opciones.${i}.valor`, message: "a different lowercase word or number for each option, e.g. 'alta' or '60'" });
        else vistos.add(o.valor);
        texto(o?.nombre, NOMBRE_MAX, `${ruta}.opciones.${i}.nombre`, "the option's name, as said aloud", out);
      });
    }
  } else if (a.opciones !== undefined) out.push({ path: `${ruta}.opciones`, message: "opciones belong to eleccion settings" });
  if (a.requiere !== undefined && !(Array.isArray(a.requiere) && a.requiere.every(exprValida))) out.push({ path: `${ruta}.requiere`, message: 'capabilities such as "webgpu", "!tactil" or "memoriaGB>=4" (window.__numinia.capacidades lists them)' });
  if (a.alcance !== undefined && a.alcance !== "aparato" && a.alcance !== "mundo") out.push({ path: `${ruta}.alcance`, message: "aparato (the whole device) or mundo (this world only)" });
  if (a.soloVer !== undefined && typeof a.soloVer !== "boolean") out.push({ path: `${ruta}.soloVer`, message: "true or false" });
  if (a.preajuste !== undefined) {
    if (a.tipo !== "eleccion" || typeof a.preajuste !== "object" || a.preajuste === null) out.push({ path: `${ruta}.preajuste`, message: "preajuste: { option: { 'grupo.id': valor | null } }, for eleccion settings" });
    else for (const [op, pares] of Object.entries(a.preajuste)) {
      if (!(a.opciones ?? []).some((o) => o?.valor === op)) out.push({ path: `${ruta}.preajuste.${op}`, message: "not one of its opciones" });
      for (const k of Object.keys(pares ?? {})) if (!/^[a-z][a-z0-9-]{1,31}\.[a-z][a-zA-Z0-9]{0,31}$/.test(k)) out.push({ path: `${ruta}.preajuste.${op}.${k}`, message: "full setting ids, e.g. 'graficos.sombras'" });
    }
  }
  if (!out.length) out.push(...validarDefecto(a, a.defecto, `${ruta}.defecto`));
  return out;
}

/** Check the settings a feature declares (defineFeature calls this): each lives in the feature's own group. */
export function validarAjustes(lista: unknown, ruta: string, grupo: string): Issue[] {
  if (!Array.isArray(lista)) return [{ path: ruta, message: "ajustes: a list [{ id, tipo, nombre, describe, defecto }] (docs/EXTENDER.md «Añadir un ajuste»)" }];
  const out: Issue[] = [], vistos = new Set<string>();
  if (lista.length > AJUSTES_POR_FUNCION_MAX) out.push({ path: ruta, message: `at most ${AJUSTES_POR_FUNCION_MAX} settings` });
  lista.forEach((d, i) => {
    const id = idAjusteValido(d?.id) ? String(d.id) : String(i), p = `${ruta}.${id}`;
    out.push(...validarAjuste(d, p));
    if (d?.grupo !== undefined && d.grupo !== grupo) out.push({ path: `${p}.grupo`, message: `its settings live in its own group ('${grupo}'): leave grupo out` });
    if (vistos.has(id)) out.push({ path: p, message: "two settings with the same id" });
    vistos.add(id);
  });
  return out;
}
