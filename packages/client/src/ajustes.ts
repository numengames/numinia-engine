// ajustes (N2): the settings registry. A setting is data — id, group, type, its name and spoken description, a default
// per device tier and per capability, the capabilities it needs (`requiere`, hidden otherwise) — plus, on the page, the
// function that applies it. The FORMAT and its validation live with the plug (packages/feature/src/ajustes.ts) because
// features declare settings too. The engine declares its own (ajustes-motor.ts); each game feature may declare its own
// (`ajustes` in defineFeature, one group per feature); a world/adventure ships a JSON that changes defaults, hides engine
// settings and adds its own (schema numinia-engine/ajustes-mundo@1). What the person chooses is kept in local storage —
// versioned, old or unknown values dropped safely — per device for the engine's settings and per world for features' and
// worlds' ones, until the identity holds them (V8). No DOM: the page passes the storage; it runs in Node tests.
// Nothing here throws. Recipe: docs/EXTENDER.md («Añadir un ajuste»).
import type { Issue, Result } from "../../core/src/index.ts";
import { faltan, grupoValido, idAjusteValido, resolverDefecto, validarAjuste, validarAjustes, validarDefecto, validarValor, AJUSTES_POR_FUNCION_MAX, NOMBRE_MAX } from "../../feature/src/ajustes.ts";
import type { AjusteDecl, Alcance, Defecto, Opcion, Tipo, Valor } from "../../feature/src/ajustes.ts";
import type { CapacidadesVivas } from "./capacidades.ts";
import { GRUPOS_MOTOR } from "./ajustes-motor.ts";

export * from "../../feature/src/ajustes.ts";
export * from "./capacidades.ts";
export { AJUSTES_MOTOR, GRUPOS_MOTOR } from "./ajustes-motor.ts";
export * from "./densidad.ts"; // U20: the density dial (levels, the table of panels)
export * from "./reloj.ts"; // U3: the clock beside the minimap (format, modes)

export type Origen = { de: "motor" } | { de: "funcion" | "mundo"; id: string; nombre?: string; describe?: string };
/** A setting as the menu and agents read it (plain JSON). */
export type Vista = {
  id: string; grupo: string; tipo: Tipo; nombre: string; describe: string; valor: Valor; defecto: Valor;
  elegido: boolean; forzado: boolean; visible: boolean; falta: string[]; origen: string; alcance: Alcance;
  min?: number; max?: number; paso?: number; unidad?: string; opciones?: Opcion[]; nota?: string; soloVer?: boolean;
};
export type Grupo = { id: string; nombre: string; describe?: string; origen: string; ajustes: Vista[] };
/** Where chosen values live: localStorage in the browser, a Map in tests. */
export type Guardado = { leer(clave: string): string | null; escribir(clave: string, texto: string): void };
export type Lectura = { get(id: string): Valor | undefined };
export type Aplicar = (valor: Valor, ajustes: Lectura) => void;
/** A world's or adventure's file (apps/<mundo>/mundo.ajustes.json; with M16 the zone manifest carries the same object). */
export type MundoAjustes = { schema: typeof ESQUEMA_MUNDO; mundo: string; nombre?: string; describe?: string; defectos?: Record<string, Defecto>; ajustes?: AjusteDecl[]; ocultar?: string[] };

export const ESQUEMA_MUNDO = "numinia-engine/ajustes-mundo@1";
export const GUARDADOS_MAX = 64;            // values kept per storage key
export const GUARDADO_BYTES_MAX = 8192;     // bytes of JSON per storage key
export const VERSION_GUARDADO = 1;
export const CLAVE_GUARDADO = "numinia.ajustes"; // device-wide; per world: "numinia.ajustes.<mundo>"
const ENGINE_GROUPS = (): string[] => GRUPOS_MOTOR.map((g) => g.id);
const texto = (t: unknown, max: number, ruta: string, que: string, out: Issue[]) => {
  if (typeof t !== "string" || !t.trim() || t.length > max) out.push({ path: ruta, message: `${que}: 1-${max} characters` });
};

// ---------- what is kept (versioned) ----------
/** From an older stored shape to the next version. v0 (never shipped; how a migration looks): a flat { id: value }. */
export const MIGRACIONES: Record<number, (datos: Record<string, unknown>) => Record<string, unknown>> = {
  0: (plano) => ({ v: 1, valores: plano }),
};

/** Read a stored text: the values by id, migrated to today's version. Unreadable or newer = an issue, never a throw. */
export function leerTextoGuardado(t: string | null): Result<Record<string, unknown>> {
  if (t === null || t === "") return { ok: true, value: {} };
  let datos: unknown;
  try { datos = JSON.parse(t); } catch { return { ok: false, issues: [{ path: "guardado", message: "not JSON: starting from the defaults" }] }; }
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) return { ok: false, issues: [{ path: "guardado", message: "not an object: starting from the defaults" }] };
  let d = datos as Record<string, unknown>;
  let v = typeof d.v === "number" ? d.v : 0;
  if (!Number.isInteger(v) || v > VERSION_GUARDADO) return { ok: false, issues: [{ path: "guardado.v", message: `version ${String(d.v)} is newer than this engine's (${VERSION_GUARDADO}): starting from the defaults` }] };
  while (v < VERSION_GUARDADO) { const m = MIGRACIONES[v]; if (!m) return { ok: false, issues: [{ path: "guardado.v", message: `no way from version ${v}` }] }; d = m(d); v++; }
  const valores = d.valores;
  if (typeof valores !== "object" || valores === null || Array.isArray(valores)) return { ok: false, issues: [{ path: "guardado.valores", message: "missing" }] };
  return { ok: true, value: { ...(valores as Record<string, unknown>) } };
}

// ---------- the registry ----------
export function crearAjustes(opts: { capacidades: CapacidadesVivas; guardado?: Guardado; mundo?: string; registro?: (linea: string) => void }) {
  const caps = opts.capacidades, log = opts.registro ?? (() => {});
  const mundo = grupoValido(opts.mundo) ? opts.mundo : "mundo";
  type E = { decl: AjusteDecl; id: string; grupo: string; origen: Origen; defecto: Defecto; alcance: Alcance };
  const entradas = new Map<string, E>();
  const grupos = new Map<string, Omit<Grupo, "ajustes">>();
  for (const g of GRUPOS_MOTOR) grupos.set(g.id, { ...g, origen: "motor" });
  const elegidos = new Map<string, Valor>();   // what the person chose (kept)
  const forzados = new Map<string, Valor>();   // this load only (?bateria, ?fps): wins until the person changes it
  const ocultos = new Set<string>();           // hidden by the world's file
  const aplicadores = new Map<string, Aplicar[]>();
  const oyentes: ((id: string, valor: Valor, antes: Valor | undefined) => void)[] = [];
  const fallidos = new Set<string>();
  const claves: Record<Alcance, string> = { aparato: CLAVE_GUARDADO, mundo: `${CLAVE_GUARDADO}.${mundo}` };
  const leer = (clave: string): Map<string, unknown> => {
    let t: string | null = null;
    try { t = opts.guardado?.leer(clave) ?? null; } catch { /* private mode: nothing kept */ }
    const r = leerTextoGuardado(t);
    if (!r.ok) { log(`[ajustes] ${clave}: ${r.issues[0].message}`); return new Map(); }
    return new Map(Object.entries(r.value));
  };
  // values kept for settings not declared yet (a feature or a world file may declare them later): adopted on declare
  const pendientes: Record<Alcance, Map<string, unknown>> = { aparato: leer(claves.aparato), mundo: leer(claves.mundo) };

  const defectoDe = (e: E): Valor => resolverDefecto(e.defecto, caps.valores);
  const valorDe = (e: E): Valor => forzados.get(e.id) ?? elegidos.get(e.id) ?? defectoDe(e);
  const faltaDe = (e: E): string[] => [...faltan(e.decl.requiere, caps.valores), ...(ocultos.has(e.id) ? ["mundo:oculto"] : [])];
  const lectura: Lectura = { get: (id) => { const e = entradas.get(id); return e ? valorDe(e) : undefined; } };

  /** Mutate, then apply and announce every setting whose value or visibility changed since it was last applied or
   * announced (one place for every path: set, restablecer, a world file, a capability that changed under us). */
  const ultimo = new Map<string, [Valor, boolean]>();
  function cambiar(mutar: () => void): string[] {
    mutar();
    const hechos: string[] = [];
    for (const e of entradas.values()) {
      const v = valorDe(e), vis = faltaDe(e).length === 0, a = ultimo.get(e.id);
      if (a && a[0] === v && a[1] === vis) continue;
      ultimo.set(e.id, [v, vis]);
      hechos.push(e.id);
      if (vis) aplicar(e, v);
      for (const fn of oyentes) { try { fn(e.id, v, a?.[0]); } catch { /* a listener never breaks the others */ } }
    }
    return hechos;
  }
  function aplicar(e: E, v: Valor): void {
    for (const fn of aplicadores.get(e.id) ?? []) {
      try { fn(v, lectura); } catch (err) { if (!fallidos.has(e.id)) { fallidos.add(e.id); log(`[ajustes] '${e.id}' falló al aplicarse: ${String((err as Error)?.message ?? err)} (el resto sigue)`); } }
    }
  }
  function guardar(): void {
    if (!opts.guardado) return;
    for (const alc of ["aparato", "mundo"] as const) {
      const valores: Record<string, unknown> = {};
      let n = 0;
      for (const [id, v] of elegidos) if (entradas.get(id)?.alcance === alc && n < GUARDADOS_MAX) { valores[id] = v; n++; }
      const propios = JSON.stringify({ v: VERSION_GUARDADO, valores });
      for (const [id, v] of pendientes[alc]) if (!(id in valores) && n < GUARDADOS_MAX) { valores[id] = v; n++; }
      let t = JSON.stringify({ v: VERSION_GUARDADO, valores });
      if (t.length > GUARDADO_BYTES_MAX) t = propios.length <= GUARDADO_BYTES_MAX ? propios : JSON.stringify({ v: VERSION_GUARDADO, valores: {} });
      try { opts.guardado.escribir(claves[alc], t); } catch { if (!fallidos.has("guardar")) { fallidos.add("guardar"); log("[ajustes] no puedo guardar (¿modo privado o almacén lleno?): lo elegido dura hasta cerrar"); } }
    }
  }
  const noExiste = (id: string): string => {
    const cola = id.split(".").pop() ?? id;
    const cerca = [...entradas.keys()].filter((k) => k.endsWith(`.${cola}`) || k.startsWith(`${id.split(".")[0]}.`)).slice(0, 4);
    return `no setting '${id}'${cerca.length ? `; some that exist: ${cerca.join(", ")}` : ""} (lista() has them all)`;
  };
  const origenTexto = (o: Origen) => (o.de === "motor" ? "motor" : `${o.de}:${o.id}`);
  const vista = (e: E): Vista => {
    const d = e.decl, falta = faltaDe(e);
    return {
      id: e.id, grupo: e.grupo, tipo: d.tipo, nombre: d.nombre, describe: d.describe, valor: valorDe(e), defecto: defectoDe(e),
      elegido: elegidos.has(e.id), forzado: forzados.has(e.id), visible: falta.length === 0, falta, origen: origenTexto(e.origen), alcance: e.alcance,
      ...(d.tipo === "numero" ? { min: d.min, max: d.max, paso: d.paso, ...(d.unidad ? { unidad: d.unidad } : {}) } : {}),
      ...(d.opciones ? { opciones: d.opciones.map((o) => ({ ...o })) } : {}),
      ...(d.nota ? { nota: d.nota } : {}), ...(d.soloVer ? { soloVer: true } : {}),
    };
  };

  /** Add settings. Engine ones name an engine group; a feature's go to its own group; a world's to its own or an engine one. */
  function declarar(lista: readonly AjusteDecl[], origen: Origen = { de: "motor" }): Issue[] {
    const issues: Issue[] = [];
    if (origen.de !== "motor") {
      if (!grupoValido(origen.id)) return [{ path: String(origen.id), message: "a feature or world id: lowercase, 2-32 characters" }];
      if (!grupos.has(origen.id)) grupos.set(origen.id, { id: origen.id, nombre: origen.nombre ?? origen.id[0].toUpperCase() + origen.id.slice(1), ...(origen.describe ? { describe: origen.describe } : {}), origen: origenTexto(origen) });
    }
    if (origen.de === "funcion") issues.push(...validarAjustes(lista, `${origen.id}.ajustes`, origen.id));
    if (issues.some((x) => x.path === `${origen.de === "motor" ? "motor" : origen.id}.ajustes`)) { log(`[ajustes] ${origenTexto(origen)}: ${issues[0].message}`); return issues; }
    cambiar(() => {
      (Array.isArray(lista) ? lista : []).forEach((d, i) => {
        const nombre = idAjusteValido(d?.id) ? String(d.id) : String(i); // same naming as validarAjustes
        const ruta = origen.de === "motor" ? `motor.${d?.grupo ?? "?"}.${nombre}` : `${origen.id}.ajustes.${nombre}`;
        const v = origen.de === "funcion" ? issues.filter((x) => x.path === ruta || x.path.startsWith(`${ruta}.`)) : validarAjuste(d, ruta);
        const grupo = origen.de === "funcion" ? origen.id : (d?.grupo ?? (origen.de === "mundo" ? origen.id : ""));
        if (origen.de === "motor" && !ENGINE_GROUPS().includes(grupo)) v.push({ path: `${ruta}.grupo`, message: `one of the engine's groups: ${ENGINE_GROUPS().join(", ")}` });
        if (origen.de === "mundo" && grupo !== origen.id && !ENGINE_GROUPS().includes(grupo)) v.push({ path: `${ruta}.grupo`, message: `the world's own group ('${origen.id}') or an engine group` });
        const id = `${grupo}.${nombre}`;
        if (!v.length && entradas.has(id)) v.push({ path: ruta, message: `'${id}' is already declared (by ${origenTexto(entradas.get(id)!.origen)})` });
        if (v.length) { if (origen.de !== "funcion") issues.push(...v); return; }
        const alcance = d.alcance ?? (origen.de === "motor" ? "aparato" : "mundo");
        entradas.set(id, { decl: d, id, grupo, origen, defecto: d.defecto, alcance });
        const p = pendientes[alcance];
        if (p.has(id)) {
          const r = validarValor(d, p.get(id), id);
          p.delete(id);
          if (r.ok) elegidos.set(id, r.value);
          else log(`[ajustes] lo guardado en '${id}' ya no vale (${r.issues[0].message}): vuelve el valor por defecto`);
        }
      });
    });
    if (issues.length) log(`[ajustes] ${origenTexto(origen)}: ${issues.map((x) => `${x.path}: ${x.message}`).join("; ")}`);
    return issues;
  }

  /** A world's or adventure's file. All or nothing: any issue = nothing applied (the issues say where). */
  function aplicarMundo(json: unknown): Result<{ defectos: number; ajustes: number; ocultos: number }> {
    const issues: Issue[] = [];
    const m = json as MundoAjustes;
    if (typeof json !== "object" || json === null || m.schema !== ESQUEMA_MUNDO) return { ok: false, issues: [{ path: "schema", message: `"${ESQUEMA_MUNDO}"` }] };
    if (!grupoValido(m.mundo)) issues.push({ path: "mundo", message: "the world's id: lowercase, 2-32 characters, e.g. 'plaza'" });
    if (m.nombre !== undefined) texto(m.nombre, NOMBRE_MAX, "nombre", "the world's name, as said aloud", issues);
    const propios = new Map<string, AjusteDecl>();
    if (m.ajustes !== undefined) {
      if (!Array.isArray(m.ajustes) || m.ajustes.length > AJUSTES_POR_FUNCION_MAX) issues.push({ path: "ajustes", message: `a list of at most ${AJUSTES_POR_FUNCION_MAX} settings` });
      else m.ajustes.forEach((d, i) => {
        const ruta = `ajustes.${typeof d?.id === "string" ? d.id : i}`;
        issues.push(...validarAjuste(d, ruta));
        const g = d?.grupo ?? m.mundo, id = `${g}.${d?.id}`;
        if (g !== m.mundo && !ENGINE_GROUPS().includes(g)) issues.push({ path: `${ruta}.grupo`, message: `the world's own group ('${m.mundo}') or an engine group` });
        if (entradas.has(id) || propios.has(id)) issues.push({ path: ruta, message: `'${id}' already exists` });
        propios.set(id, d);
      });
    }
    const conocido = (id: string) => entradas.get(id)?.decl ?? propios.get(id);
    for (const [id, def] of Object.entries(m.defectos ?? {})) {
      const d = conocido(id);
      if (!d) { issues.push({ path: `defectos.${id}`, message: noExiste(id) }); continue; }
      issues.push(...validarDefecto(d, def, `defectos.${id}`));
    }
    if (m.ocultar !== undefined && !(Array.isArray(m.ocultar) && m.ocultar.every((id) => typeof id === "string" && !!conocido(id)))) issues.push({ path: "ocultar", message: "full ids of settings that exist, e.g. ['graficos.agua']" });
    if (issues.length) { log(`[ajustes] mundo: ${issues.map((x) => `${x.path}: ${x.message}`).join("; ")}`); return { ok: false, issues }; }
    if (m.ajustes?.length) declarar(m.ajustes, { de: "mundo", id: m.mundo, nombre: m.nombre, describe: m.describe });
    cambiar(() => {
      for (const [id, def] of Object.entries(m.defectos ?? {})) entradas.get(id)!.defecto = def;
      for (const id of m.ocultar ?? []) ocultos.add(id);
    });
    return { ok: true, value: { defectos: Object.keys(m.defectos ?? {}).length, ajustes: m.ajustes?.length ?? 0, ocultos: m.ocultar?.length ?? 0 } };
  }

  // a capability changed (XR answered, the OS switched to reduced motion…): defaults and visibility follow
  caps.alCambiar(() => { cambiar(() => {}); });

  return {
    mundo,
    claves,
    capacidades: caps,
    declarar,
    aplicarMundo,
    /** What a setting does on the page. Several functions may serve one id; one function may serve several ids. */
    alAplicar(id: string, fn: Aplicar): void {
      if (!entradas.has(id)) log(`[ajustes] alAplicar('${id}'): no está declarado (todavía)`);
      aplicadores.set(id, [...(aplicadores.get(id) ?? []), fn]);
    },
    /** Apply every visible setting once (the page calls it before the first frame). */
    aplicarTodo(): void { for (const e of entradas.values()) if (faltaDe(e).length === 0) aplicar(e, valorDe(e)); },
    get: lectura.get,
    /** The person (or an agent) chooses a value: validated, applied, announced to listeners and kept. */
    set(id: string, v: unknown): Result<Valor> {
      const e = entradas.get(id);
      if (!e) return { ok: false, issues: [{ path: id, message: noExiste(id) }] };
      if (e.decl.soloVer) return { ok: false, issues: [{ path: id, message: "can only be seen for now (changing keys comes later)" }] };
      const r = validarValor(e.decl, v, id);
      if (!r.ok) return r;
      cambiar(() => {
        forzados.delete(id); elegidos.set(id, r.value);
        for (const [otro, val] of Object.entries(e.decl.preajuste?.[String(r.value)] ?? {})) {
          const o = entradas.get(otro);
          if (!o) continue;
          forzados.delete(otro);
          if (val === null) { elegidos.delete(otro); continue; }
          const rv = validarValor(o.decl, val, otro);
          if (rv.ok) elegidos.set(otro, rv.value); else log(`[ajustes] preajuste de '${id}': ${rv.issues[0].message}`);
        }
      });
      guardar();
      return r;
    },
    /** A value for this load only (a URL parameter such as ?bateria): not kept; the person's next change wins. */
    forzar(id: string, v: unknown): Result<Valor> {
      const e = entradas.get(id);
      if (!e) return { ok: false, issues: [{ path: id, message: noExiste(id) }] };
      const r = validarValor(e.decl, v, id);
      if (r.ok) cambiar(() => { forzados.set(id, r.value); });
      return r;
    },
    /** Back to the default: one setting, or all of them (also forgetting what was kept for settings not loaded). */
    restablecer(id?: string): string[] {
      const hechos = cambiar(() => {
        if (id !== undefined) { elegidos.delete(id); forzados.delete(id); return; }
        elegidos.clear(); forzados.clear(); pendientes.aparato.clear(); pendientes.mundo.clear();
      });
      guardar();
      return hechos;
    },
    lista(): Vista[] { return [...entradas.values()].map(vista); },
    /** Groups in menu order (the engine's, then features' and worlds' as declared), each with its settings. */
    grupos(): Grupo[] {
      const orden = [...ENGINE_GROUPS(), ...[...grupos.keys()].filter((g) => !ENGINE_GROUPS().includes(g))];
      return orden.map((g) => ({ ...grupos.get(g)!, ajustes: [...entradas.values()].filter((e) => e.grupo === g).map(vista) })).filter((g) => g.ajustes.length > 0);
    },
    /** Hear every change of value or visibility (the menu redraws, agents may log). Returns a function that stops it. */
    alCambiar(fn: (id: string, valor: Valor, antes: Valor | undefined) => void): () => void {
      oyentes.push(fn);
      return () => { const i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); };
    },
  };
}
export type Ajustes = ReturnType<typeof crearAjustes>;
