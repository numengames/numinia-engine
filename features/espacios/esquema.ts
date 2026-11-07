// espacios — the world's file and the pure rules (v1, Y50+Y51). Kept apart from feature.ts so the page (which only needs the
// declaration) does not carry the reader or the placement rules: the server and the composition root import this file.
// Every number here is an INTEGER in centimetres: the rules decide with integers, so the same orders give the same result.
import { ESPACIOS_MAX, ESPACIO_OBJETOS_MAX } from "./feature.ts";

/** A kind of thing that can be placed: height and footprint width (cm) and what it may rest on ("suelo" = the floor, or another type's id). */
export type Tipo = { alto: number; ancho: number; sobre: string[] };
export type EspacioFichero = { id: string; nombre: string; x: number; z: number; y?: number; radio: number; tope: number };
/** A placed thing: n (its number, never reused), type, x z (cm, world), y (cm above the floor of the space: the server computes it), sobre (n of its supporter, 0 = floor). */
export type Cosa = { n: number; t: string; x: number; z: number; y: number; s: number };
export type Problema = { path: string; message: string };
export type Colocacion = { ok: true; y: number } | { ok: false; motivo: string };

const PLANTILLA = "{ \"schema\": \"numinia-engine/espacios@1\", \"espacios\": [{ \"id\": \"rincon-1\", \"nombre\": \"Rincón\", \"x\": 0, \"z\": 0, \"radio\": 8, \"tope\": 20 }] }";

/** Cut untrusted text to `max` bytes: control characters out, blanks collapsed, an ellipsis when cut. Never throws. */
export function cortar(t: unknown, max: number): string {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
}

/** The kinds of thing when the world lists none: a crate (stacks), a table (floor only) and a cup (only on a table). */
export const TIPOS_DEFECTO: Readonly<Record<string, Tipo>> = Object.freeze({
  caja: { alto: 100, ancho: 100, sobre: ["suelo", "caja"] },
  mesa: { alto: 80, ancho: 160, sobre: ["suelo"] },
  taza: { alto: 10, ancho: 20, sobre: ["mesa"] },
});

/** Read entorno/espacios.json. Each wrong line is left out WITH its reason (path + how to fix); the rest is used. */
export function leerEspacios(crudo: unknown): { valor: EspacioFichero[]; tipos: Record<string, Tipo>; problemas: Problema[] } {
  const problemas: Problema[] = [], valor: EspacioFichero[] = [];
  let tipos: Record<string, Tipo> = { ...TIPOS_DEFECTO };
  if (crudo === undefined || crudo === null) return { valor, tipos, problemas };
  if (typeof crudo !== "object" || Array.isArray(crudo)) return { valor, tipos, problemas: [{ path: "espacios", message: `espacios.json es un objeto: ${PLANTILLA}` }] };
  const o = crudo as { schema?: unknown; espacios?: unknown; cosas?: unknown };
  if (o.schema !== undefined && o.schema !== "numinia-engine/espacios@1") problemas.push({ path: "espacios.schema", message: "el esquema es \"numinia-engine/espacios@1\"" });
  if (o.cosas !== undefined) {
    if (typeof o.cosas !== "object" || o.cosas === null || Array.isArray(o.cosas)) problemas.push({ path: "espacios.cosas", message: "cosas: { \"caja\": { \"alto\": 1, \"ancho\": 1, \"sobre\": [\"suelo\", \"caja\"] } } (metros)" });
    else {
      const propios: Record<string, Tipo> = {};
      for (const [id, t] of Object.entries(o.cosas as Record<string, unknown>)) {
        const path = `espacios.cosas.${id.slice(0, 16)}`, c = t as Record<string, unknown>;
        if (!/^[a-z0-9-]{1,16}$/.test(id)) { problemas.push({ path, message: "un tipo se llama con 1 a 16 letras minúsculas, cifras o guiones" }); continue; }
        const m = (k: string) => (typeof c?.[k] === "number" && Number.isFinite(c[k] as number) && (c[k] as number) >= 0.01 && (c[k] as number) <= 20 ? Math.round((c[k] as number) * 100) : null);
        const alto = m("alto"), ancho = m("ancho");
        if (alto === null || ancho === null) { problemas.push({ path, message: "alto y ancho en metros, de 0,01 a 20" }); continue; }
        if (!Array.isArray(c.sobre) || !c.sobre.length || c.sobre.some((s) => typeof s !== "string")) { problemas.push({ path: `${path}.sobre`, message: "sobre: lista de dónde puede ir, \"suelo\" o el nombre de otro tipo" }); continue; }
        propios[id] = { alto, ancho, sobre: (c.sobre as string[]).slice(0, 8) };
      }
      if (Object.keys(propios).length) tipos = propios;
    }
  }
  if (o.espacios !== undefined && !Array.isArray(o.espacios)) { problemas.push({ path: "espacios.espacios", message: `una lista de espacios: ${PLANTILLA}` }); return { valor, tipos, problemas }; }
  const vistos = new Set<string>(), lista = Array.isArray(o.espacios) ? o.espacios : [];
  for (const [i, c] of lista.entries()) {
    const path = `espacios.espacios[${i}]`, e = c as Record<string, unknown>;
    if (!e || typeof e !== "object" || Array.isArray(e)) { problemas.push({ path, message: "cada espacio es un objeto" }); continue; }
    const id = String(e.id ?? "");
    if (!/^[a-z0-9-]{1,16}$/.test(id)) { problemas.push({ path: `${path}.id`, message: "un id de 1 a 16 letras minúsculas, cifras o guiones" }); continue; }
    if (vistos.has(id)) { problemas.push({ path: `${path}.id`, message: `«${id}» está repetido` }); continue; }
    const num = (k: string) => typeof e[k] === "number" && Number.isFinite(e[k] as number);
    if (!num("x") || !num("z")) { problemas.push({ path, message: "x y z en metros (números)" }); continue; }
    if (e.radio !== undefined && (!num("radio") || (e.radio as number) < 2 || (e.radio as number) > 60)) { problemas.push({ path: `${path}.radio`, message: "radio: de 2 a 60 metros (8 si falta)" }); continue; }
    if (e.tope !== undefined && (!num("tope") || !Number.isInteger(e.tope) || (e.tope as number) < 0 || (e.tope as number) > ESPACIO_OBJETOS_MAX)) { problemas.push({ path: `${path}.tope`, message: `tope: entero de 0 a ${ESPACIO_OBJETOS_MAX} (el máximo de limits.json space_objects_max; ${ESPACIO_OBJETOS_MAX} si falta)` }); continue; }
    const nombre = e.nombre === undefined ? `Espacio ${id}` : cortar(e.nombre, 40);
    if (!nombre) { problemas.push({ path: `${path}.nombre`, message: "un nombre de 1 a 40 bytes (se corta si es más largo)" }); continue; }
    if (valor.length >= ESPACIOS_MAX) { problemas.push({ path, message: `como mucho ${ESPACIOS_MAX} espacios por mundo` }); break; }
    vistos.add(id);
    valor.push({ id, nombre, x: Number(e.x), z: Number(e.z), y: num("y") ? Number(e.y) : undefined, radio: num("radio") ? Number(e.radio) : 8, tope: e.tope === undefined ? ESPACIO_OBJETOS_MAX : (e.tope as number) });
  }
  return { valor, tipos, problemas };
}

/** The placement rules (Y51), pure and integer: may a `tipo` be put at (x, z) cm, resting on thing `sobre` (0 = the floor)? On success, the height (cm) the server gives it.
 * Rules, in order: the type exists · the space has room (`tope`) · the spot is inside the space (`centro`, `radio` cm) · what is under it exists, is a
 * kind its type may rest on, and has room under the spot (the new centre lies within the supporter's footprint) · nothing of the same level overlaps it. */
export function puedeColocar(esp: { cx: number; cz: number; radio: number; tope: number }, cosas: readonly Cosa[], tipos: Readonly<Record<string, Tipo>>, tipo: string, x: number, z: number, sobre: number): Colocacion {
  const t = tipos[tipo];
  if (!t) return { ok: false, motivo: `No existe la cosa «${cortar(tipo, 16)}». Las que hay: ${Object.keys(tipos).join(", ")}.` };
  if (cosas.length >= Math.min(esp.tope, ESPACIO_OBJETOS_MAX)) return { ok: false, motivo: `Este espacio está lleno: ${cosas.length} de ${Math.min(esp.tope, ESPACIO_OBJETOS_MAX)} objetos. Retira alguno primero.` };
  const dx = x - esp.cx, dz = z - esp.cz;
  if (dx * dx + dz * dz > esp.radio * esp.radio) return { ok: false, motivo: "Ese sitio queda fuera de tu espacio. Elige un punto dentro de su borde." };
  let y = 0;
  if (sobre === 0) {
    if (!t.sobre.includes("suelo")) return { ok: false, motivo: `${tipo} no va en el suelo: ponla sobre ${t.sobre.join(" o ")} (indica el número de la cosa en «sobre»).` };
  } else {
    const b = cosas.find((c) => c.n === sobre);
    if (!b) return { ok: false, motivo: `No hay ninguna cosa número ${sobre} que la sostenga. Usa sobre 0 para el suelo.` };
    if (!t.sobre.includes(b.t)) return { ok: false, motivo: `${tipo} no puede ir sobre ${b.t}: solo sobre ${t.sobre.join(" o ")}.` };
    const medio = Math.trunc((tipos[b.t]?.ancho ?? 0) / 2);
    if (Math.abs(x - b.x) > medio || Math.abs(z - b.z) > medio) return { ok: false, motivo: `Ahí no hay nada debajo: ponla sobre ${b.t} ${b.n}, dentro de su superficie (a menos de ${medio} cm de su centro).` };
    y = b.y + (tipos[b.t]?.alto ?? 0);
  }
  for (const c of cosas) {
    if (c.s !== sobre) continue;
    const reparto = Math.trunc(((tipos[c.t]?.ancho ?? 0) + t.ancho) / 2);
    if (Math.abs(x - c.x) < reparto && Math.abs(z - c.z) < reparto) return { ok: false, motivo: `Ahí ya está ${c.t} ${c.n}. Deja sitio: al menos ${reparto} cm entre centros.` };
  }
  return { ok: true, y };
}

/** May thing `n` be taken away? Not while another thing rests on it. */
export function puedeRetirar(cosas: readonly Cosa[], n: number): { ok: true } | { ok: false; motivo: string } {
  const c = cosas.find((k) => k.n === n);
  if (!c) return { ok: false, motivo: `No hay ninguna cosa número ${n}. Pide «mirar» para ver la lista.` };
  const encima = cosas.filter((k) => k.s === n);
  if (encima.length) return { ok: false, motivo: `${c.t} ${n} tiene ${encima.length === 1 ? "1 cosa" : `${encima.length} cosas`} encima (${encima.map((k) => k.n).join(", ")}): retírala${encima.length === 1 ? "" : "s"} primero.` };
  return { ok: true };
}

/** Everything a space keeps (the store value): owner (guest id), the owner's display name, the space's name, guests [id, name], things and the next number. */
export type Guardado = { d: string; dn: string; nom: string; inv: [string, string][]; c: Cosa[]; sig: number };
export const vacio = (nombre: string): Guardado => ({ d: "", dn: "", nom: nombre, inv: [], c: [], sig: 1 });
/** Read a stored value defensively (a hand-edited or old one never throws). */
export function leerGuardado(v: unknown, nombre: string): Guardado {
  const g = vacio(nombre);
  if (!v || typeof v !== "object") return g;
  const o = v as Record<string, unknown>;
  if (typeof o.d === "string") g.d = o.d.slice(0, 64);
  if (typeof o.dn === "string") g.dn = cortar(o.dn, 48);
  if (typeof o.nom === "string" && o.nom.trim()) g.nom = cortar(o.nom, 40);
  if (Array.isArray(o.inv)) for (const p of o.inv.slice(0, 12)) if (Array.isArray(p) && typeof p[0] === "string") g.inv.push([p[0].slice(0, 64), cortar(p[1], 48)]);
  if (Array.isArray(o.c)) for (const c of o.c.slice(0, ESPACIO_OBJETOS_MAX)) { const k = c as Cosa; if (k && [k.n, k.x, k.z, k.y, k.s].every((q) => Number.isInteger(q)) && typeof k.t === "string") g.c.push({ n: k.n, t: k.t.slice(0, 16), x: k.x, z: k.z, y: k.y, s: k.s }); }
  g.sig = Number.isInteger(o.sig) && (o.sig as number) > g.c.reduce((a, c) => Math.max(a, c.n), 0) ? (o.sig as number) : g.c.reduce((a, c) => Math.max(a, c.n), 0) + 1;
  return g;
}
