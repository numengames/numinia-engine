// A world or an adventure brings its own data next to it (MUNDO_DIR, read by the server's composition root): today
// its environment (entorno.json, numinia-engine/entorno@1) and its elements (elementos.json, numinia-engine/elementos@1).
// This only swaps those two parts for ones built with the world's data; a missing file = the house default.
import type { ServerPart } from "../packages/feature/src/index.ts";
import { crearEntorno } from "./entorno/server.ts";
import { crearElementos } from "./elementos/server.ts";

export function conMundo(partes: readonly ServerPart[], leer: (fichero: string) => unknown): ServerPart[] {
  return partes.map((p) => (p.feature.id === "entorno" ? crearEntorno(leer("entorno.json")) : p.feature.id === "elementos" ? crearElementos(leer("elementos.json")) : p));
}
