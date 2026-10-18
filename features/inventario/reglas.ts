// inventario — the rules, pure (no network, no clock, no randomness): what an object is, how it stacks, what you
// can carry. The canon (lore 06, Fragmento 2) decides the limits: one weapon carried, three relics carried; the
// rest waits in your Reserva. Tokens (Semillas, Células) stack by class and colour and are never carried.
export const TIPOS = ["arma", "reliquia", "token"] as const;
export type Tipo = (typeof TIPOS)[number];
export const COLORES = ["", "verde", "azul", "plateada", "dorada", "roja"] as const;
export type Color = (typeof COLORES)[number];
/** Prestige points of one Semilla del Conocimiento by colour (lore 06, «Morfología de las Semillas»). */
export const VALOR_SEMILLA: Record<Exclude<Color, "">, number> = { verde: 1, azul: 2, plateada: 3, dorada: 4, roja: 5 };

export const LIM = {
  armaPortada: 1,        // canon: «un PJ solo puede llevar consigo un arma»
  reliquiasPortadas: 3,  // canon: «no es posible portar más de tres Reliquias al mismo tiempo»
  reserva: 24,           // engine: distinct objects per person (a stack counts once); 24 with long names fit S4's 4,096 bytes per key
  pila: 999,             // engine: units in one stack
  clase: 32, nombre: 40, icono: 24, // bytes of text
} as const;

export type Objeto = {
  id: string;       // "o<serie>", unique for this person, deterministic
  tipo: Tipo;
  clase: string;    // what it is: "semilla", "celula", "hoja"… (the canon names things; the engine stores them)
  nombre: string;
  icono: string;    // a house icon's name (apps/plaza/iconos.ts); "" = the type's icon
  color: Color;     // tokens only today
  valor: number;    // prestige points per unit; 0 if none
  n: number;        // units (tokens stack); weapons and relics are always 1
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
      n: r.tipo === "token" ? n : 1, portado: r.tipo !== "token" && r.portado === true,
    });
    ids.add(r.id);
  }
  if (objetos.length > LIM.reserva) objetos.length = LIM.reserva;
  const serie = Math.max(Math.floor(Number(o.serie) || 0), ...objetos.map((x) => Number(x.id.slice(1))));
  const inv: Inventario = { v: 1, serie, objetos };
  // the limits hold even over a hand-edited file: extra carried things go back to the Reserva, oldest first kept
  let armas = 0, reliquias = 0;
  for (const x of inv.objetos) {
    if (!x.portado) continue;
    if (x.tipo === "arma" && ++armas > LIM.armaPortada) x.portado = false;
    if (x.tipo === "reliquia" && ++reliquias > LIM.reliquiasPortadas) x.portado = false;
  }
  return inv;
}

export type Resultado = { ok: true; objeto: Objeto } | { ok: false; motivo: string };

/** Hand something to this person. Tokens stack with the same class and colour; the Reserva has a size. */
export function dar(inv: Inventario, e: Entrega): Resultado {
  if (!esTipo(e.tipo)) return { ok: false, motivo: "Eso no es un arma, una reliquia ni un token." };
  const clase = corta(e.clase, LIM.clase), nombre = corta(e.nombre, LIM.nombre);
  if (!clase || !nombre) return { ok: false, motivo: "Un objeto necesita clase y nombre." };
  const color: Color = esColor(e.color) ? e.color : "";
  const n = e.tipo === "token" ? Math.max(1, Math.min(LIM.pila, Math.floor(Number(e.n) || 1))) : 1;
  const valor = Math.max(0, Math.floor(Number(e.valor ?? (clase === "semilla" && color ? VALOR_SEMILLA[color] : 0)) || 0));
  if (e.tipo === "token") {
    const pila = inv.objetos.find((x) => x.tipo === "token" && x.clase === clase && x.color === color);
    if (pila) {
      if (pila.n + n > LIM.pila) return { ok: false, motivo: `No caben más de ${LIM.pila} ${pila.nombre}.` };
      pila.n += n;
      return { ok: true, objeto: pila };
    }
  }
  if (inv.objetos.length >= LIM.reserva) return { ok: false, motivo: `Tu Reserva está llena (${LIM.reserva} objetos).` };
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
  const cuantos = o.tipo === "token" ? Math.max(1, Math.min(o.n, Math.floor(Number(n) || o.n))) : 1;
  if (cuantos < o.n) { o.n -= cuantos; return { ok: true, objeto: o }; }
  inv.objetos.splice(i, 1);
  return { ok: true, objeto: { ...o, n: 0 } };
}

/** Carry a weapon or a relic, within the canon's limits. */
export function equipar(inv: Inventario, id: string): Resultado {
  const o = inv.objetos.find((x) => x.id === id);
  if (!o) return { ok: false, motivo: "No tienes eso." };
  if (o.tipo === "token") return { ok: false, motivo: "Los tokens no se llevan encima: se guardan." };
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
  o.portado = false;
  return { ok: true, objeto: o };
}

/** A short summary for the sheet: «3 objetos · Semillas: 4 puntos de Prestigio». */
export function resumen(inv: Inventario): { objetos: number; portados: number; prestigio: number } {
  let prestigio = 0, portados = 0;
  for (const o of inv.objetos) { if (o.clase === "semilla") prestigio += o.valor * o.n; if (o.portado) portados++; }
  return { objetos: inv.objetos.length, portados, prestigio };
}
