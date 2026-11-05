// espejo — the file format `numinia-engine/espejo@1` (mundo-hermes, historia 2). Pure: no engine, no DOM, no sockets.
// A world turns the MIRROR on with entorno/espejo.json: an outside source (a Hermes plugin, a CI, a home panel…) publishes a list of
// «things» (id, type, title, state, zone, verbs) and the server puts them in the world; people ask for verbs on them and the SERVER only
// forwards the request outwards (it never runs anything). Without the file nothing changes (cost 0, same bytes).
//   { "schema": "numinia-engine/espejo@1", "activa": true,
//     "funciones": { "cron": true, "sesiones": true, "salud": false },        // one switch per function of the outside app (F0 §1); absent = off
//     "fuente": { "tipo": "enlace-local", "puerto": 8791 },                    // where the outside source connects (127.0.0.1 only)
//     "zonas": [ { "id": "z7", "nombre": "El reloj", "centro": { "x": 40, "z": -10 }, "ancho": 16, "fondo": 16, "alto": 6, "tipos": ["cron"], "cartel": "EL RELOJ · tareas programadas" } ],
//     "acciones": { "cron.pausar": "confirmar", "cron.ejecutar": "aprobar" } } // per verb: the safety the owner asks; NEVER «libre» for a verb that changes things
// Every issue says its path and how to fix it. A wrong file is not used at all (the mirror stays off) and every issue is logged.
// Texts that come from outside (titles, subtitles) are UNTRUSTED: `limpiar` cuts them to their size and strips control characters;
// the page paints them escaped and they never enter an AI's instructions (STD-050).
import type { Issue, Result } from "../../packages/core/src/index.ts";

export const ESQUEMA = "numinia-engine/espejo@1";
export const FICHERO = "espejo.json";

/** One switch per function of the outside app, in the order of F0 §1 (P1 first). The switch name is the key in `funciones{}`. */
export const FUNCIONES = [
  "salud", "cron", "sesiones", "chat", "aprobaciones", "subagentes", "perfiles", "mcp", "skills", "biblioteca",
  "opciones", "memoria", "journey", "lienzo", "kanban", "mensajeria", "plugins",
  "metas", "archivos", "uso", "voz", "navegador",
] as const;
export type Funcion = (typeof FUNCIONES)[number];

/** What each function is called for a person, WITH its article (Spanish): «Apagar el gasto», «Encender los agentes». Every function has one: a test keeps it complete. */
export const TEXTO_FUNCION: Record<Funcion, string> = {
  salud: "la salud", cron: "las tareas programadas", sesiones: "las sesiones", chat: "el chat", aprobaciones: "las aprobaciones", subagentes: "los subagentes",
  perfiles: "los agentes", mcp: "las herramientas conectadas", skills: "las habilidades", biblioteca: "la biblioteca", opciones: "las opciones", memoria: "la memoria",
  journey: "el recorrido", lienzo: "el lienzo", kanban: "el tablero", mensajeria: "la mensajería", plugins: "los complementos", metas: "las metas",
  archivos: "los archivos", uso: "el gasto", voz: "la voz", navegador: "el navegador",
};
/** The label of a function (with article), or its own name when it is not one of ours. */
export function textoFuncion(f: string): string { return (TEXTO_FUNCION as Record<string, string | undefined>)[f] ?? f; }
/** The same without the article, for lists: «tareas programadas». */
export function nombreFuncion(f: string): string { return textoFuncion(f).replace(/^(el|la|los|las) /, ""); }
/** The label of a button that jumps to a zone, in correct Spanish: «El umbral» → «Ir al umbral», «La torre de control» → «Ir a la torre de control». Pure. */
export function textoIrA(zona: string): string {
  const n = zona.trim();
  const m = /^(El|La|Los|Las)\s+(.+)$/.exec(n);
  if (!m) return `Ir a ${n}`;
  const art = m[1]!.toLowerCase(), resto = m[2]!;
  return art === "el" ? `Ir al ${resto}` : `Ir a ${art} ${resto}`;
}

/** What a thing IS: each type belongs to one function (the switch that turns it on). `salud` has the master light of the threshold. */
export const TIPOS = {
  salud: "salud", cron: "cron", sesion: "sesiones", mensaje: "chat", aprobacion: "aprobaciones", subagente: "subagentes", perfil: "perfiles",
  mcp: "mcp", skill: "skills", documento: "biblioteca", opcion: "opciones", memoria: "memoria", estrella: "journey", artefacto: "lienzo",
  tarjeta: "kanban", canal: "mensajeria", plugin: "plugins", meta: "metas", fichero: "archivos", uso: "uso", voz: "voz", ventana: "navegador",
} as const satisfies Record<string, Funcion>;
export type Tipo = keyof typeof TIPOS;
export const TIPOS_LISTA = Object.keys(TIPOS) as Tipo[];

/** The verbs a thing may offer, each tied to the function that owns it. The mirror refuses any other word, whoever sends it. */
export const VERBOS = {
  "cron.pausar": "cron", "cron.reanudar": "cron", "cron.ejecutar": "cron",
  "sesion.nueva": "sesiones", "sesion.reanudar": "sesiones", "sesion.abrir": "sesiones",
  "mensaje.enviar": "chat", "aprobacion.responder": "aprobaciones",
  "subagente.dirigir": "subagentes", "subagente.parar": "subagentes",
  "perfil.activar": "perfiles", "mcp.probar": "mcp", "mcp.activar": "mcp",
  "skill.abrir": "skills", "skill.activar": "skills", "documento.abrir": "biblioteca",
  "opcion.cambiar": "opciones", "memoria.abrir": "memoria", "artefacto.abrir": "lienzo",
  "tarjeta.mover": "kanban", "canal.probar": "mensajeria", "plugin.activar": "plugins",
  "meta.pausar": "metas", "meta.reanudar": "metas", "fichero.abrir": "archivos",
} as const satisfies Record<string, Funcion>;
export type Verbo = keyof typeof VERBOS;
export const VERBOS_LISTA = Object.keys(VERBOS) as Verbo[];

/** The safety a verb asks. There is deliberately NO «libre»: whatever changes something in the outside app needs a person's yes (A0 §3.5).
 *  `confirmar` = a two-step button in the world; `aprobar` = that AND the outside app's own approver. The owner may lower `aprobar` to `confirmar`, never to nothing. */
export const SEGURIDADES = ["confirmar", "aprobar"] as const;
export type Seguridad = (typeof SEGURIDADES)[number];
/** What each verb asks when the file says nothing: everything `aprobar`. */
export const SEGURIDAD_DEFECTO: Seguridad = "aprobar";
/** Verbs that only OPEN something to read (no change anywhere): they still go out as requests, but may be asked as `confirmar`. They are the only ones the world may lower further in a later version. */
export const SOLO_LEER: readonly Verbo[] = ["skill.abrir", "documento.abrir", "memoria.abrir", "artefacto.abrir", "fichero.abrir", "sesion.abrir"];

/** Bounds (bytes for texts: the shared-state codec counts bytes). */
export const LIMITES = {
  id: 32, titulo: 60, subtitulo: 120, cartel: 80, zonaNombre: 40, zonas: 12, tiposPorZona: 8, verbosPorCosa: 6, objetosPorLote: 200, objetosPorZona: 200,
  coord: 2000, puertoMin: 1024, puertoMax: 65535, alto: 40, lado: 200,
} as const;
export const ESTADOS = ["activo", "programado", "pausado", "fallo", "apagado", "desconocido"] as const;
export type Estado = (typeof ESTADOS)[number];

export type Zona = { id: string; nombre: string; x: number; z: number; ancho: number; fondo: number; alto: number; tipos: Tipo[]; cartel: string };
export type Espejo = {
  activa: boolean;
  /** Switches: only the functions named true are on; everything else is OFF (an unnamed function is off, unlike funciones.json). */
  funciones: Record<Funcion, boolean>;
  fuente: { tipo: "enlace-local"; puerto: number };
  zonas: Zona[];
  /** The safety asked per verb (every verb has one; the default fills the rest). */
  acciones: Record<Verbo, Seguridad>;
};

/** A thing as the outside source publishes it (alta / cambio / lote). Checked by `leerObjeto`. */
export type Objeto = { tipo: Tipo; id: string; titulo: string; subtitulo: string; estado: Estado; zona: string; x: number; z: number; luz: boolean; acciones: Verbo[] };

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const enc = new TextEncoder();
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

/** Cut an outside text to `max` bytes on a character, control characters and line breaks turned into spaces. Pure; it never throws. */
export function limpiar(t: unknown, max: number): string {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  if (enc.encode(s).length <= max) return s;
  let out = "";
  for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
}
const bytes = (s: string) => enc.encode(s).length;
const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const lista = (xs: readonly string[]) => xs.join(", ");

const CLAVES_RAIZ = ["schema", "activa", "funciones", "fuente", "zonas", "acciones", "notas"];
const CLAVES_ZONA = ["id", "nombre", "centro", "ancho", "fondo", "alto", "tipos", "luz", "cartel"];

/** Read entorno/espejo.json. A missing `funciones` means every function OFF; a missing `acciones` means every verb `aprobar`. */
export function leerEspejo(json: unknown): Result<Espejo> {
  if (!obj(json)) return { ok: false, issues: [{ path: "espejo", message: `un objeto JSON, p. ej. { "schema": "${ESQUEMA}", "activa": true, "funciones": { "cron": true } }` }] };
  const issues: Issue[] = [], push = (path: string, message: string) => issues.push({ path, message });
  for (const k of Object.keys(json)) if (!CLAVES_RAIZ.includes(k)) push(`espejo.${k}`, `clave desconocida: quítala o corrige el nombre (las claves son: ${lista(CLAVES_RAIZ)})`);
  if (json.schema !== ESQUEMA) push("espejo.schema", `debe ser "${ESQUEMA}"`);
  const v: Espejo = { activa: true, funciones: Object.fromEntries(FUNCIONES.map((f) => [f, false])) as Record<Funcion, boolean>, fuente: { tipo: "enlace-local", puerto: 8791 }, zonas: [], acciones: Object.fromEntries(VERBOS_LISTA.map((a) => [a, SEGURIDAD_DEFECTO])) as Record<Verbo, Seguridad> };

  if (json.activa !== undefined) { if (typeof json.activa === "boolean") v.activa = json.activa; else push("espejo.activa", "true o false (false apaga el espejo entero sin borrar el fichero)"); }

  if (json.funciones !== undefined) {
    if (!obj(json.funciones)) push("espejo.funciones", `un objeto { "cron": true, … }; las funciones son: ${lista(FUNCIONES)}`);
    else for (const [k, x] of Object.entries(json.funciones)) {
      if (!(FUNCIONES as readonly string[]).includes(k)) { push(`espejo.funciones.${k}`, `función desconocida: quítala o corrige el nombre (las funciones son: ${lista(FUNCIONES)})`); continue; }
      if (typeof x === "boolean") v.funciones[k as Funcion] = x; else push(`espejo.funciones.${k}`, "true o false (true enciende la función, false la apaga)");
    }
  }

  if (json.fuente !== undefined) {
    const f = json.fuente;
    if (!obj(f)) push("espejo.fuente", `un objeto { "tipo": "enlace-local", "puerto": 8791 }`);
    else {
      for (const k of Object.keys(f)) if (k !== "tipo" && k !== "puerto") push(`espejo.fuente.${k}`, "clave desconocida (son: tipo, puerto)");
      if (f.tipo !== undefined && f.tipo !== "enlace-local") push("espejo.fuente.tipo", `solo "enlace-local" (el enlace solo escucha en 127.0.0.1)`);
      if (f.puerto !== undefined) { if (Number.isInteger(f.puerto) && num(f.puerto, LIMITES.puertoMin, LIMITES.puertoMax)) v.fuente.puerto = f.puerto as number; else push("espejo.fuente.puerto", `un puerto entero entre ${LIMITES.puertoMin} y ${LIMITES.puertoMax}`); }
    }
  }

  if (json.acciones !== undefined) {
    if (!obj(json.acciones)) push("espejo.acciones", `un objeto { "cron.pausar": "confirmar", … }; los verbos son: ${lista(VERBOS_LISTA)}`);
    else for (const [k, x] of Object.entries(json.acciones)) {
      if (!(VERBOS_LISTA as readonly string[]).includes(k)) { push(`espejo.acciones.${k}`, `verbo desconocido: quítalo o corrige el nombre (los verbos son: ${lista(VERBOS_LISTA)})`); continue; }
      if (x === "libre") push(`espejo.acciones.${k}`, `nunca «libre»: lo que cambia algo fuera necesita el sí de una persona. Use "confirmar" o "aprobar"`);
      else if (!(SEGURIDADES as readonly unknown[]).includes(x)) push(`espejo.acciones.${k}`, `${lista(SEGURIDADES)}`);
      else v.acciones[k as Verbo] = x as Seguridad;
    }
  }

  if (json.zonas !== undefined) {
    if (!Array.isArray(json.zonas)) push("espejo.zonas", "una lista de zonas [{ id, nombre, centro: { x, z }, ancho, fondo, alto, tipos, cartel }]");
    else {
      if (json.zonas.length > LIMITES.zonas) push("espejo.zonas", `como mucho ${LIMITES.zonas} zonas`);
      const vistas = new Set<string>();
      json.zonas.slice(0, LIMITES.zonas).forEach((z, i) => {
        const p = `espejo.zonas[${i}]`;
        if (!obj(z)) { push(p, "un objeto { id, nombre, centro, ancho, fondo, alto, tipos, cartel }"); return; }
        for (const k of Object.keys(z)) if (!CLAVES_ZONA.includes(k)) push(`${p}.${k}`, `clave desconocida (son: ${lista(CLAVES_ZONA)})`);
        const id = z.id, nombre = z.nombre;
        if (typeof id !== "string" || !ID_RE.test(id)) push(`${p}.id`, "minúsculas, cifras, . _ - ; hasta 32 caracteres");
        else if (vistas.has(id)) push(`${p}.id`, `«${id}» está repetido`); else vistas.add(id);
        if (typeof nombre !== "string" || !nombre.trim() || bytes(nombre) > LIMITES.zonaNombre) push(`${p}.nombre`, `texto de 1 a ${LIMITES.zonaNombre} bytes`);
        const c = z.centro;
        if (!obj(c) || !num(c.x, -LIMITES.coord, LIMITES.coord) || !num(c.z, -LIMITES.coord, LIMITES.coord)) push(`${p}.centro`, `{ "x": metros, "z": metros } entre −${LIMITES.coord} y ${LIMITES.coord}`);
        for (const [k, max] of [["ancho", LIMITES.lado], ["fondo", LIMITES.lado], ["alto", LIMITES.alto]] as const) if (!num(z[k], 1, max)) push(`${p}.${k}`, `metros entre 1 y ${max}`);
        if (!Array.isArray(z.tipos) || z.tipos.length < 1 || z.tipos.length > LIMITES.tiposPorZona) push(`${p}.tipos`, `de 1 a ${LIMITES.tiposPorZona} tipos de: ${lista(TIPOS_LISTA)}`);
        else z.tipos.forEach((t, j) => { if (!(TIPOS_LISTA as readonly unknown[]).includes(t)) push(`${p}.tipos[${j}]`, `tipo desconocido (son: ${lista(TIPOS_LISTA)})`); });
        if (z.luz !== undefined && !(typeof z.luz === "string" && /^#[0-9a-fA-F]{6}$/.test(z.luz))) push(`${p}.luz`, `un color "#rrggbb"`);
        if (z.cartel !== undefined && (typeof z.cartel !== "string" || bytes(z.cartel) > LIMITES.cartel)) push(`${p}.cartel`, `texto de hasta ${LIMITES.cartel} bytes`);
        if (typeof id === "string" && typeof nombre === "string" && obj(c) && Array.isArray(z.tipos) && !issues.some((x) => x.path === p || x.path.startsWith(`${p}.`) || x.path.startsWith(`${p}[`))) {
          v.zonas.push({ id, nombre: nombre.trim(), x: c.x as number, z: c.z as number, ancho: z.ancho as number, fondo: z.fondo as number, alto: z.alto as number, tipos: z.tipos as Tipo[], cartel: limpiar(z.cartel ?? nombre, LIMITES.cartel) });
        }
      });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: v };
}

/** The types this mirror shows: those whose function is switched on (and the mirror itself is on). */
export const tiposEncendidos = (e: Espejo): Tipo[] => (e.activa ? TIPOS_LISTA.filter((t) => e.funciones[TIPOS[t]]) : []);
/** The functions that are on, in F0 order — what the engine tells the outside source in `hola.funciones` (what is off is never asked for). */
export const funcionesEncendidas = (e: Espejo): Funcion[] => (e.activa ? FUNCIONES.filter((f) => e.funciones[f]) : []);

/** One thing as an outside source publishes it, checked and cleaned. `zona` must exist; a missing x/z is the zone's centre; the verbs must be known,
 *  belong to the thing's own function and be allowed. Never throws; the issues say the path (`objeto.titulo`…). */
export function leerObjeto(crudo: unknown, e: Pick<Espejo, "zonas">, path = "objeto"): Result<Objeto> {
  if (!obj(crudo)) return { ok: false, issues: [{ path, message: `un objeto { tipo, id, titulo, estado, zona, acciones }` }] };
  const issues: Issue[] = [], push = (p: string, message: string) => issues.push({ path: `${path}.${p}`, message });
  for (const k of Object.keys(crudo)) if (!["tipo", "id", "titulo", "subtitulo", "estado", "zona", "x", "z", "luz", "acciones"].includes(k)) push(k, "clave desconocida (son: tipo, id, titulo, subtitulo, estado, zona, x, z, luz, acciones)");
  const tipo = crudo.tipo as Tipo;
  if (!(TIPOS_LISTA as readonly unknown[]).includes(crudo.tipo)) push("tipo", `uno de: ${lista(TIPOS_LISTA)}`);
  if (typeof crudo.id !== "string" || !ID_RE.test(crudo.id)) push("id", "minúsculas, cifras, . _ - ; hasta 32 caracteres");
  if (typeof crudo.titulo !== "string" || !crudo.titulo.trim()) push("titulo", `texto de 1 a ${LIMITES.titulo} bytes`);
  else if (bytes(crudo.titulo) > LIMITES.titulo) push("titulo", `más de ${LIMITES.titulo} bytes: el título debe ser más corto (se rechaza, no se corta)`);
  if (crudo.subtitulo !== undefined && (typeof crudo.subtitulo !== "string" || bytes(crudo.subtitulo) > LIMITES.subtitulo)) push("subtitulo", `texto de hasta ${LIMITES.subtitulo} bytes`);
  if (crudo.estado !== undefined && !(ESTADOS as readonly unknown[]).includes(crudo.estado)) push("estado", `uno de: ${lista(ESTADOS)}`);
  const zona = e.zonas.find((z) => z.id === crudo.zona);
  if (typeof crudo.zona !== "string") push("zona", "el id de una zona del espejo"); else if (!zona) push("zona", `no hay ninguna zona «${limpiar(crudo.zona, 32)}» (hay: ${lista(e.zonas.map((z) => z.id)) || "ninguna"})`);
  if (zona && (TIPOS_LISTA as readonly unknown[]).includes(crudo.tipo) && !zona.tipos.includes(tipo)) push("tipo", `la zona «${zona.id}» no admite el tipo «${tipo}» (admite: ${lista(zona.tipos)})`);
  for (const k of ["x", "z"] as const) if (crudo[k] !== undefined) {
    if (!num(crudo[k], -LIMITES.coord, LIMITES.coord)) push(k, `metros entre −${LIMITES.coord} y ${LIMITES.coord}`);
    else if (zona && Math.abs((crudo[k] as number) - (k === "x" ? zona.x : zona.z)) > (k === "x" ? zona.ancho : zona.fondo) / 2) push(k, `fuera de la zona «${zona.id}» (mide ${k === "x" ? zona.ancho : zona.fondo} m desde su centro)`);
  }
  if (crudo.luz !== undefined && typeof crudo.luz !== "boolean") push("luz", "true o false");
  const verbos: Verbo[] = [];
  if (crudo.acciones !== undefined) {
    if (!Array.isArray(crudo.acciones) || crudo.acciones.length > LIMITES.verbosPorCosa) push("acciones", `una lista de hasta ${LIMITES.verbosPorCosa} verbos`);
    else crudo.acciones.forEach((a, i) => {
      if (!(VERBOS_LISTA as readonly unknown[]).includes(a)) push(`acciones[${i}]`, `verbo desconocido «${limpiar(a, 24)}» (los verbos son: ${lista(VERBOS_LISTA)})`);
      else if ((TIPOS_LISTA as readonly unknown[]).includes(crudo.tipo) && VERBOS[a as Verbo] !== TIPOS[tipo]) push(`acciones[${i}]`, `el verbo «${a}» es de la función «${VERBOS[a as Verbo]}», no de la de un «${tipo}» («${TIPOS[tipo]}»)`);
      else verbos.push(a as Verbo);
    });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { tipo, id: crudo.id as string, titulo: limpiar(crudo.titulo, LIMITES.titulo), subtitulo: limpiar(crudo.subtitulo ?? "", LIMITES.subtitulo), estado: (crudo.estado as Estado | undefined) ?? "desconocido", zona: zona!.id, x: (crudo.x as number | undefined) ?? zona!.x, z: (crudo.z as number | undefined) ?? zona!.z, luz: crudo.luz === true, acciones: verbos } };
}

/** What the page may know of the mirror (GET /status → `espejo`): where the zones are and which of their functions are switched on. No source, no key,
 *  no verbs: only what is needed to draw the floors and the lamps of the switch panel. `funciones` lists only the functions some zone shows (in F0 order). */
export type VistaEspejo = { zonas: { id: string; nombre: string; cartel: string; x: number; z: number; ancho: number; fondo: number; tipos: Tipo[] }[]; funciones: Partial<Record<Funcion, boolean>> };
export function vistaPublica(e: Espejo): VistaEspejo | null {
  if (!e.activa) return null;
  const mostradas = new Set<Funcion>(e.zonas.flatMap((z) => z.tipos.map((t) => TIPOS[t])));
  return {
    zonas: e.zonas.map((z) => ({ id: z.id, nombre: z.nombre, cartel: z.cartel, x: z.x, z: z.z, ancho: z.ancho, fondo: z.fondo, tipos: z.tipos })),
    funciones: Object.fromEntries(FUNCIONES.filter((f) => mostradas.has(f)).map((f) => [f, e.funciones[f]])),
  };
}
