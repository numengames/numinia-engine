// pesca → inventario: what a landed fish is as an object of the Inventario. Pure (no network, no clock, no randomness):
// the species decides the stack (clase = the table's id, one line per species and rarity colour), the rarity decides the
// colour and the value. pesca emits it as its own server-only `otorga` event; inventario hears it (DONANTES) and keeps it.
import type { Rareza } from "./server.ts";

/** The rarity colour of a catch (inventario's COLORES): plateada = común, azul = rara, dorada = legendaria. */
export const COLOR_POR_RAREZA: Record<Rareza, "plateada" | "azul" | "dorada"> = { comun: "plateada", rara: "azul", legendaria: "dorada" };
/** Value of one fish by rarity (a number for the object; no economy hangs from it yet). */
export const VALOR_POR_RAREZA: Record<Rareza, number> = { comun: 1, rara: 3, legendaria: 10 };
/** The house icon of a catch (apps/plaza/iconos.ts). */
export const ICONO_PEZ = "fish";

/** What `otorga` carries for one fish landed by the entity `quien`. */
export function otorgaDeCaptura(quien: number, pez: { id: string; nombre: string; rareza: Rareza }) {
  return { quien, tipo: "captura" as const, clase: pez.id.slice(0, 32), nombre: pez.nombre, icono: ICONO_PEZ, color: COLOR_POR_RAREZA[pez.rareza], valor: VALOR_POR_RAREZA[pez.rareza], n: 1 };
}
