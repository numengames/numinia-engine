// inventario — the rules, pure (no network, no clock, no randomness): what an object is, how it stacks, what you
// can carry. The canon (lore 06, Fragmento 2) decides the limits: one weapon carried, three relics carried; the
// rest waits in your Reserva. Tokens (Semillas, Células) stack by class and colour and are never carried; so do the
// catches of the fishing (v2 of this feature: «captura», one stack per species and rarity colour, never carried).
export const TIPOS = ["arma", "reliquia", "token", "captura"] as const;
export type Tipo = (typeof TIPOS)[number];
/** Types that stack (same type, class and colour = one line with a count) and are only kept, never carried. */
export const apila = (t: Tipo): boolean => t === "token" || t === "captura";
export const COLORES = ["", "verde", "azul", "plateada", "dorada", "roja"] as const;
export type Color = (typeof COLORES)[number];
/** Prestige points of one Semilla del Conocimiento by colour (lore 06, «Morfología de las Semillas»). */
export const VALOR_SEMILLA: Record<Exclude<Color, "">, number> = { verde: 1, azul: 2, plateada: 3, dorada: 4, roja: 5 };

/** «La Bolsa galáctica» (a wink: 42): how many slots the bag has. One slot per stack (tokens and catches of one kind stack);
 * what you carry (1 weapon, 3 relics) does not use a slot. The server decides; the page draws exactly this many sockets. */
export const BOLSA_HUECOS = 42;
export const LIM = {
  armaPortada: 1,        // canon: «un PJ solo puede llevar consigo un arma»
  reliquiasPortadas: 3,  // canon: «no es posible portar más de tres Reliquias al mismo tiempo»
  reserva: BOLSA_HUECOS + 1 + 3, // engine: distinct objects per person (a stack counts once) = the bag's slots + what is carried (stored in pages: PAGINA)
  pila: 999,             // engine: units in one stack
  clase: 32, nombre: 40, icono: 24, // bytes of text
} as const;

export type Objeto = {
  id: string;       // "o<serie>", unique for this person, deterministic
  tipo: Tipo;
  clase: string;    // what it is: "semilla", "celula", "hoja"… (the canon names things; the engine stores them)
  nombre: string;
  icono: string;    // a house icon's name (apps/plaza/iconos.ts); "" = the type's icon
  color: Color;     // tokens (their colour) and catches (their rarity: plateada común, azul rara, dorada legendaria)
  valor: number;    // prestige points per unit; 0 if none
  n: number;        // units (tokens and catches stack); weapons and relics are always 1
  portado: boolean; // carried with you (weapons and relics only)
};
export type Inventario = { v: 1; serie: number; objetos: Objeto[] };
/** What another feature hands over: the engine gives it an id and stacks it. */
export type Entrega = { tipo: Tipo; clase: string; nombre: string; icono?: string; color?: Color; valor?: number; n?: number };

export const nuevoInventario = (): Inventario => ({ v: 1, serie: 0, objetos: [] });

const corta = (s: unknown, max: number): string => { const t = typeof s === "string" ? s : ""; return new TextEncoder().encode(t).length <= max ? t : new TextDecoder().decode(new TextEncoder().encode(t).slice(0, max)).replace(/\uFFFD$/, ""); };
const esTipo = (t: unknown): t is Tipo => TIPOS.includes(t as Tipo);
const esColor = (c: unknown): c is Color => COLORES.includes(c as Color);

/** Read what S4 stored: a broken value is an empty inventory (never a crash); each object is sanitised. */
export function leerInventario(raw: unknown): Inventario {
  if (!raw || typeof raw !== "object") return nuevoInventario();
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.objetos)) return nuevoInventario();
  const objetos: Objeto[] = [];
  const ids = new Set<string>();
  for (const x of o.objetos) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (typeof r.id !== "string" || !/^o\d{1,9}$/.test(r.id) || ids.has(r.id) || !esTipo(r.tipo)) continue;
    const n = Math.max(1, Math.min(LIM.pila, Math.floor(Number(r.n) || 1)));
    objetos.push({
      id: r.id, tipo: r.tipo, clase: corta(r.clase, LIM.clase), nombre: corta(r.nombre, LIM.nombre), icono: corta(r.icono, LIM.icono),
      color: esColor(r.color) ? r.color : "", valor: Math.max(0, Math.floor(Number(r.valor) || 0)),
      n: apila(r.tipo) ? n : 1, portado: !apila(r.tipo) && r.portado === true,
    });
    ids.add(r.id);
  }
  const serie = Math.max(Math.floor(Number(o.serie) || 0), ...objetos.map((x) => Number(x.id.slice(1))));
  const inv: Inventario = { v: 1, serie, objetos };
  // the limits hold even over a hand-edited file: extra carried things go back to the Reserva, oldest first kept
  let armas = 0, reliquias = 0;
  for (const x of inv.objetos) {
    if (!x.portado) continue;
    if (x.tipo === "arma" && ++armas > LIM.armaPortada) x.portado = false;
    if (x.tipo === "reliquia" && ++reliquias > LIM.reliquiasPortadas) x.portado = false;
  }
  // and the bag keeps its size: what does not fit the 42 slots is dropped, newest first (carried things are never dropped)
  let huecos = 0;
  inv.objetos = inv.objetos.filter((x) => x.portado || ++huecos <= BOLSA_HUECOS);
  return inv;
}

export type Resultado = { ok: true; objeto: Objeto } | { ok: false; motivo: string; llena?: true };

/** Slots of the bag in use: everything not carried (a stack is one slot). */
export const ocupados = (inv: Inventario): number => inv.objetos.reduce((s, x) => s + (x.portado ? 0 : 1), 0);
export const bolsaLlena = (inv: Inventario): boolean => ocupados(inv) >= BOLSA_HUECOS;
export const textoLlena = `Tu Bolsa está llena (${BOLSA_HUECOS}/${BOLSA_HUECOS})`;

// S4 keeps at most STORE_VALUE_MAX (4,096) bytes per key and 46 objects with long names do not fit one: the Inventario is
// stored in pages of PAGINA objects (`i:<id>`, `i:<id>:1`…); the first page carries the series and how many more pages follow.
export const PAGINA = 14;
export const PAGINAS_MAX = Math.ceil(LIM.reserva / PAGINA);
export function trocear(inv: Inventario): unknown[] {
  const paginas: unknown[] = [];
  for (let i = 0; i < Math.max(1, inv.objetos.length); i += PAGINA) paginas.push(i === 0 ? { v: 1, serie: inv.serie, objetos: inv.objetos.slice(0, PAGINA), mas: Math.max(0, Math.ceil(inv.objetos.length / PAGINA) - 1) } : { v: 1, p: i / PAGINA, objetos: inv.objetos.slice(i, i + PAGINA) });
  return paginas;
}
/** The reverse: `leer(j)` returns the stored value of page j (0 = the first). A value written before pages existed has no `mas`. */
export function juntar(leer: (j: number) => unknown): Inventario {
  const p0 = leer(0);
  if (!p0 || typeof p0 !== "object") return nuevoInventario();
  const r = p0 as Record<string, unknown>, objetos: unknown[] = Array.isArray(r.objetos) ? [...r.objetos] : [];
  const mas = Math.min(PAGINAS_MAX - 1, Math.max(0, Math.floor(Number(r.mas) || 0)));
  for (let j = 1; j <= mas; j++) { const q = leer(j) as Record<string, unknown> | null; if (q && Array.isArray(q.objetos)) objetos.push(...q.objetos); }
  return leerInventario({ ...r, objetos });
}

/** Hand something to this person. Tokens and catches stack with the same class, colour and name (two seeds of one colour but different names stay apart); a new stack needs a free slot of the bag. */
export function dar(inv: Inventario, e: Entrega): Resultado {
  if (!esTipo(e.tipo)) return { ok: false, motivo: "Eso no es un arma, una reliquia, un token ni una captura." };
  const clase = corta(e.clase, LIM.clase), nombre = corta(e.nombre, LIM.nombre);
  if (!clase || !nombre) return { ok: false, motivo: "Un objeto necesita clase y nombre." };
  const color: Color = esColor(e.color) ? e.color : "";
  const n = apila(e.tipo) ? Math.max(1, Math.min(LIM.pila, Math.floor(Number(e.n) || 1))) : 1;
  const valor = Math.max(0, Math.floor(Number(e.valor ?? (clase === "semilla" && color ? VALOR_SEMILLA[color] : 0)) || 0));
  if (apila(e.tipo)) {
    const pila = inv.objetos.find((x) => x.tipo === e.tipo && x.clase === clase && x.color === color && x.nombre === nombre);
    if (pila) {
      if (pila.n + n > LIM.pila) return { ok: false, motivo: `No caben más de ${LIM.pila} ${pila.nombre}.` };
      pila.n += n;
      return { ok: true, objeto: pila };
    }
  }
  if (bolsaLlena(inv)) return { ok: false, motivo: `${textoLlena}.`, llena: true }; // a NEW slot is needed and there is none
  inv.serie++;
  const objeto: Objeto = { id: `o${inv.serie}`, tipo: e.tipo, clase, nombre, icono: corta(e.icono, LIM.icono), color, valor, n, portado: false };
  inv.objetos.push(objeto);
  return { ok: true, objeto };
}

/** Drop `n` units (all by default): a stack shrinks, anything else goes away. */
export function quitar(inv: Inventario, id: string, n?: number): Resultado {
  const i = inv.objetos.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, motivo: "No tienes eso." };
  const o = inv.objetos[i];
  const cuantos = apila(o.tipo) ? Math.max(1, Math.min(o.n, Math.floor(Number(n) || o.n))) : 1;
  if (cuantos < o.n) { o.n -= cuantos; return { ok: true, objeto: o }; }
  inv.objetos.splice(i, 1);
  return { ok: true, objeto: { ...o, n: 0 } };
}

/** Carry a weapon or a relic, within the canon's limits. */
export function equipar(inv: Inventario, id: string): Resultado {
  const o = inv.objetos.find((x) => x.id === id);
  if (!o) return { ok: false, motivo: "No tienes eso." };
  if (o.tipo === "token") return { ok: false, motivo: "Los tokens no se llevan encima: se guardan." };
  if (o.tipo === "captura") return { ok: false, motivo: "Los peces no se llevan encima: se guardan." };
  if (o.portado) return { ok: true, objeto: o };
  const portados = inv.objetos.filter((x) => x.portado && x.tipo === o.tipo).length;
  if (o.tipo === "arma" && portados >= LIM.armaPortada) return { ok: false, motivo: "Solo puedes llevar un arma contigo; guarda la otra antes." };
  if (o.tipo === "reliquia" && portados >= LIM.reliquiasPortadas) return { ok: false, motivo: `No puedes portar más de ${LIM.reliquiasPortadas} reliquias a la vez.` };
  o.portado = true;
  return { ok: true, objeto: o };
}

/** Put a carried thing back in the Reserva. */
export function desequipar(inv: Inventario, id: string): Resultado {
  const o = inv.objetos.find((x) => x.id === id);
  if (!o) return { ok: false, motivo: "No tienes eso." };
  if (o.portado && bolsaLlena(inv)) return { ok: false, motivo: `${textoLlena}: no hay hueco donde guardarlo.`, llena: true }; // it needs a slot again
  o.portado = false;
  return { ok: true, objeto: o };
}

/** t_f87ffb93: the Graboso is a relic of class «graboso». A world that DEFINES that relic (its aventura/objetos/ has one, see
 * `mundoDefineGraboso`) shows the Graboso's button and K only to whoever CARRIES it; a world that does not define it keeps the
 * Graboso for everyone, as before (a world that never uses the inventory must not lose it). Pure: the page, the watch in VR and
 * the tests read the same two functions. */
export const CLASE_GRABOSO = "graboso";
export const llevaGraboso = (objetos: readonly { tipo: string; clase: string; portado: boolean }[]): boolean =>
  objetos.some((o) => o.tipo === "reliquia" && o.clase === CLASE_GRABOSO && o.portado);
export const grabosoLibre = (exige: boolean, objetos: readonly { tipo: string; clase: string; portado: boolean }[]): boolean => !exige || llevaGraboso(objetos);
/** Does one of the world's object files (aventura/objetos/*.json) define a relic of class «graboso»? Lenient on purpose (the strict
 * reading and its diagnostics are objeto.ts): any readable JSON with `tipo: "reliquia"` and `clase: "graboso"` counts. */
export function mundoDefineGraboso(ficheros: readonly { fichero: string; texto: string }[]): boolean {
  for (const f of ficheros) {
    if (!/\.json$/i.test(f.fichero)) continue;
    try { const o = JSON.parse(f.texto) as { tipo?: unknown; clase?: unknown }; if (o && o.tipo === "reliquia" && o.clase === CLASE_GRABOSO) return true; } catch { /* a broken file is for the author's check */ }
  }
  return false;
}

/** A short summary for the sheet: «3 objetos · Semillas: 4 puntos de Prestigio». */
export function resumen(inv: Inventario): { objetos: number; portados: number; prestigio: number } {
  let prestigio = 0, portados = 0;
  for (const o of inv.objetos) { if (o.clase === "semilla") prestigio += o.valor * o.n; if (o.portado) portados++; }
  return { objetos: inv.objetos.length, portados, prestigio };
}
