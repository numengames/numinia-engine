// A world or an adventure brings its own data next to it (MUNDO_DIR, read by the server's composition root): today
// its environment (entorno.json, numinia-engine/entorno@1) and its elements (elementos.json, numinia-engine/elementos@1).
// This only swaps those two parts for ones built with the world's data; a missing file = the house default.
// The environment file may also say where people appear (`aparicion`): that is the instance's, not a feature's, so the
// composition root reads it here (`aparicionDelMundo`) and hands it to the server.
import type { ServerPart } from "../packages/feature/src/index.ts";
import { crearEntorno } from "./entorno/server.ts";
import { crearElementos } from "./elementos/server.ts";
import { crearPesca } from "./pesca/server.ts";
import type { Sitio } from "./pesca/server.ts";
import { leerAparicion } from "./entorno/esquema.ts";
import type { Aparicion } from "./entorno/esquema.ts";

export function conMundo(partes: readonly ServerPart[], leer: (fichero: string) => unknown, log: (l: string) => void = () => {}): ServerPart[] {
  // pesca.json (numinia-engine/pesca@1: { sitios: [{ id, nombre, x, y, z, radio }] }): the world's fishing spots; none = the house default
  const crudo = leer("pesca.json") as { sitios?: unknown } | null | undefined;
  const sitios = crudo?.sitios;
  // valid JSON (no syntax error logged by leerMundo) but the wrong shape: say so, same as aparicionDelMundo does for entorno.json.
  if (crudo !== undefined && !Array.isArray(sitios)) log(`[mundo] pesca.json no tiene una lista "sitios" (uso el estanque de la casa): ${JSON.stringify(crudo).slice(0, 160)}`);
  return partes.map((p) => (p.feature.id === "entorno" ? crearEntorno(leer("entorno.json")) : p.feature.id === "elementos" ? crearElementos(leer("elementos.json")) : p.feature.id === "pesca" && Array.isArray(sitios) ? crearPesca({ sitios: sitios as Sitio[] }) : p));
}

/** The world's spawn area (entorno.json `aparicion`), or null: no file, no key, or a wrong one (logged, with its path). */
export function aparicionDelMundo(leer: (fichero: string) => unknown, log: (l: string) => void = () => {}): Aparicion | null {
  const r = leerAparicion(leer("entorno.json"));
  if (r.ok) return r.value;
  log(`[mundo] aparicion de entorno.json no se usa (la gente aparece en el cuadrado de la casa): ${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return null;
}
