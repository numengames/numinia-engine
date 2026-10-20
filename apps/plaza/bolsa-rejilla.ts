// La Bolsa galáctica, the pure part: how the Inventario maps onto a classic game grid. No DOM, no network: the page
// (inventario.ts) draws what this returns, the tests check it. 42 slots (BOLSA_HUECOS, the number the server enforces),
// one per stack in the order the server keeps them; what you carry (1 weapon + 3 relics) lives in 4 equipment slots
// and takes no bag slot. Colours, type lines, keyboard moves and drag targets live here so they are tested too.
import { BOLSA_HUECOS } from "../../features/inventario/reglas.ts";

export type Objeto = { id: string; tipo: "arma" | "reliquia" | "token" | "captura"; clase: string; nombre: string; icono: string; color: string; valor: number; n: number; portado: boolean };
export type Zona = "equipo" | "bolsa";
/** Equipment slots: the weapon first, then the three relics. */
export const FORMAS_EQUIPO = ["arma", "reliquia", "reliquia", "reliquia"] as const;

/** The house icon of a type when the object brings none (the subset is STD-023's; new glyphs are the Oracle's call). */
export const ICONO_TIPO: Record<Objeto["tipo"], string> = { arma: "crosshair", reliquia: "eye", token: "globe-hemisphere-west", captura: "fish" };
/** The faint silhouette of an empty equipment slot. */
export const SILUETA: Record<"arma" | "reliquia", string> = { arma: "sword", reliquia: "sparkle" };
/** A catch's rarity as the server writes it into the colour (features/pesca/otorga.ts: plateada común, azul rara, dorada legendaria). */
export const RAREZA_DE_COLOR: Record<string, string> = { plateada: "común", azul: "rara", dorada: "legendaria" };
/** The little line under a catch's name: «pez · rara». */
export const detalleDeCaptura = (o: Pick<Objeto, "color">): string => `pez · ${RAREZA_DE_COLOR[o.color] ?? "común"}`;

/** Slot border / glow colour: the object's own colour (tokens, catches: their rarity), else its type's. */
const COLOR_HEX: Record<string, string> = { verde: "#6fcf7f", azul: "#5aa2ff", plateada: "#c3ceda", dorada: "#ffc247", roja: "#ff6b64" };
const COLOR_TIPO: Record<Objeto["tipo"], string> = { arma: "#e59a5c", reliquia: "#b78cff", token: "#c3ceda", captura: "#c3ceda" };
export const colorDe = (o: Pick<Objeto, "tipo" | "color">): string => COLOR_HEX[o.color] ?? COLOR_TIPO[o.tipo];

export type Plano = { equipo: (Objeto | null)[]; bolsa: (Objeto | null)[]; ocupados: number; huecos: number; llena: boolean };
/** Objects → slots. `equipo[0]` is the weapon, `equipo[1..3]` the relics; `bolsa` has exactly `huecos` entries (null = an empty socket),
 * the not-carried objects in the order they arrive (a thing put back returns to the place it had). More objects than slots (a server that
 * disagrees) are cut at `huecos`: the server is the one who decides, the page never draws a 43rd socket. */
export function plano(objetos: readonly Objeto[], huecos: number = BOLSA_HUECOS): Plano {
  const equipo: (Objeto | null)[] = [null, null, null, null];
  let r = 1;
  const bolsa: (Objeto | null)[] = [];
  for (const o of objetos) {
    if (o.portado) { if (o.tipo === "arma" && !equipo[0]) equipo[0] = o; else if (o.tipo === "reliquia" && r < 4) equipo[r++] = o; }
    else if (bolsa.length < huecos) bolsa.push(o);
  }
  const ocupados = bolsa.length;
  while (bolsa.length < huecos) bolsa.push(null);
  return { equipo, bolsa, ocupados, huecos, llena: ocupados >= huecos };
}

/** «12 / 42». */
export const cuentaTexto = (p: Pick<Plano, "ocupados" | "huecos">): string => `${p.ocupados} / ${p.huecos}`;
/** The line under the name: «pez · rara», «arma», «semilla · verde». */
export const lineaTipo = (o: Objeto): string => o.tipo === "captura" ? detalleDeCaptura(o) : o.tipo === "token" ? [o.clase, o.color].filter(Boolean).join(" · ") : o.tipo;
export const nombreConCuenta = (o: Objeto): string => (o.n > 1 || o.tipo === "captura") && o.n > 0 ? `${o.nombre} × ${o.n}` : o.nombre;
/** What the detail card says about its worth. */
export function lineaValor(o: Objeto): string {
  if (o.tipo === "token") return o.valor ? `${o.valor * o.n} ${o.valor * o.n === 1 ? "punto" : "puntos"} de Prestigio` : "";
  if (o.tipo === "captura") return o.valor ? `Valor ${o.valor}${o.n > 1 ? ` cada uno · ${o.valor * o.n} en total` : ""}` : "";
  return o.portado ? "Lo llevas contigo" : "Guardado en la Bolsa";
}
/** The accessible name of a slot (the colour alone never tells the rarity). */
export const etiquetaHueco = (o: Objeto | null, i: number, zona: Zona): string =>
  o ? `${nombreConCuenta(o)}, ${lineaTipo(o)}${o.portado ? ", contigo" : ""}` : zona === "equipo" ? `${i === 0 ? "Arma" : `Reliquia ${i}`}: vacío` : `Hueco ${i + 1} de la Bolsa: vacío`;
/** «Llevar» / «Guardar» where it applies (weapons and relics only). */
export const accionDe = (o: Objeto): "Llevar" | "Guardar" | null => o.tipo === "arma" || o.tipo === "reliquia" ? (o.portado ? "Guardar" : "Llevar") : null;
/** Dropping an object on a zone: what the server is asked (null = nothing to do). Only weapons and relics move, only across the two zones. */
export const destinoDeSoltar = (o: Objeto, zona: Zona | null): "equipar" | "desequipar" | null =>
  accionDe(o) === null || !zona ? null : zona === "equipo" && !o.portado ? "equipar" : zona === "bolsa" && o.portado ? "desequipar" : null;

/** Arrow keys over the equipment row (4 slots) above the bag grid (`cols` wide): where focus goes, or null for a key that is not ours. */
export function mover(zona: Zona, i: number, tecla: string, cols: number, huecos: number = BOLSA_HUECOS): { zona: Zona; i: number } | null {
  const lim = zona === "equipo" ? 4 : huecos, tope = (n: number) => Math.max(0, Math.min(lim - 1, n));
  switch (tecla) {
    case "ArrowLeft": return { zona, i: tope(i - 1) };
    case "ArrowRight": return { zona, i: tope(i + 1) };
    case "Home": return { zona, i: 0 };
    case "End": return { zona, i: lim - 1 };
    case "ArrowDown": return zona === "equipo" ? { zona: "bolsa", i: Math.min(i, huecos - 1) } : { zona, i: i + cols < huecos ? i + cols : i };
    case "ArrowUp": return zona === "bolsa" ? (i < cols ? { zona: "equipo", i: Math.min(i, 3) } : { zona, i: i - cols }) : { zona, i };
    default: return null;
  }
}

/** Slots whose stack grew (or that are new) since last time: the panel flashes them. `antes` is updated to `ahora`. */
export function novedades(antes: Map<string, number>, ahora: readonly Pick<Objeto, "id" | "n">[]): Set<string> {
  const nuevos = new Set<string>();
  for (const o of ahora) if (o.n > (antes.get(o.id) ?? 0)) nuevos.add(o.id);
  antes.clear(); for (const o of ahora) antes.set(o.id, o.n);
  return nuevos;
}
