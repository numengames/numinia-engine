// A world or an adventure brings its own data next to it (MUNDO_DIR, read by the server's composition root): today
// its environment (entorno.json, numinia-engine/entorno@1) and its elements (elementos.json, numinia-engine/elementos@1).
// This only swaps those two parts for ones built with the world's data; a missing file = the house default.
// The environment file may also say where people appear (`aparicion`): that is the instance's, not a feature's, so the
// composition root reads it here (`aparicionDelMundo`) and hands it to the server.
import type { ServerPart } from "../packages/feature/src/index.ts";
import { crearEntorno } from "./entorno/server.ts";
import { crearElementos } from "./elementos/server.ts";
import { crearPesca } from "./pesca/server.ts";
import type { Sitio as SitioPesca } from "./pesca/server.ts";
import { crearDardos } from "./dardos/server.ts";
import type { Sitio as SitioDardos } from "./dardos/server.ts";
import { crearDados } from "./dados/server.ts";
import type { Torre as TorreDados } from "./dados/server.ts";
import { leerAparicion, leerAparicionFoto, leerSuelo } from "./entorno/esquema.ts";
import { crearSuelo } from "./suelo/server.ts"; // D-045
import type { SueloMundo } from "./entorno/esquema.ts";
import { crearTeletransporte } from "./teletransporte/server.ts";
import { crearWeb } from "./web/server.ts";
import { crearPuertas } from "./puertas/server.ts";
import type { Puerta } from "./puertas/server.ts";
import { crearBotones } from "./botones/server.ts";
import type { Boton } from "./botones/server.ts";
import { crearCogibles } from "./cogibles/server.ts";
import type { Cosa as CosaCogible } from "./cogibles/server.ts";
import { leerWebMundo } from "./web/feature.ts";
import { crearContadores } from "./contadores/server.ts";
import { leerContadores } from "./contadores/feature.ts";
import type { Aparicion } from "./entorno/esquema.ts";
import { crearDisparadores, leerDisparadores } from "./disparadores/server.ts";

export function conMundo(partes: readonly ServerPart[], leer: (fichero: string) => unknown, log: (l: string) => void = () => {}): ServerPart[] {
  // pesca.json (numinia-engine/pesca@1: { sitios: [{ id, nombre, x, y, z, radio, rumbo? }] }): the world's fishing spots; none = the house default
  const crudoPesca = leer("pesca.json") as { sitios?: unknown } | null | undefined;
  const sitiosPesca = crudoPesca?.sitios;
  // valid JSON (no syntax error logged by leerMundo) but the wrong shape: say so, same as aparicionDelMundo does for entorno.json.
  if (crudoPesca !== undefined && !Array.isArray(sitiosPesca)) log(`[mundo] pesca.json no tiene una lista "sitios" (uso el estanque de la casa): ${JSON.stringify(crudoPesca).slice(0, 160)}`);
  // dardos.json (numinia-engine/dardos@1: { sitios: [{ id, nombre, x, y, z, radio }] }): the world's dartboards; none = the house default
  const crudoDardos = leer("dardos.json") as { sitios?: unknown } | null | undefined;
  const sitiosDardos = crudoDardos?.sitios;
  if (crudoDardos !== undefined && !Array.isArray(sitiosDardos)) log(`[mundo] dardos.json no tiene una lista "sitios" (uso la diana de la casa): ${JSON.stringify(crudoDardos).slice(0, 160)}`);
  // dados.json (numinia-engine/dados@1: { torres: [{ id, nombre, x, y, z, radio, dados }] }): the world's dice towers; none = no tower (/tirar still rolls where you stand)
  const crudoDados = leer("dados.json") as { torres?: unknown } | null | undefined;
  const torresDados = crudoDados?.torres;
  if (crudoDados !== undefined && !Array.isArray(torresDados)) log(`[mundo] dados.json no tiene una lista "torres" (no pongo ninguna torre): ${JSON.stringify(crudoDados).slice(0, 160)}`);
  // N16: entorno.json `aparicionFoto` (off when absent or wrong; a wrong one is said once): a photo's link puts you at its place
  const crudoEntorno = leer("entorno.json"), af = crudoEntorno === undefined ? { ok: true as const, value: false } : leerAparicionFoto(crudoEntorno);
  if (!af.ok) log(`[mundo] aparicionFoto de entorno.json no se usa (apagado): ${af.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  const fotoSi = af.ok && af.value;
  // web.json (numinia-engine/web@1: { dominios: ["numinia.org"], pantallas: [{ id, url, titulo, texto?, x, y?, z, ry?, ancho?, alto? }] }):
  // the sites this world's screens may show and the screens it ships; none = no web screens at all (N17)
  const crudoWeb = leer("web.json");
  const leidoWeb = crudoWeb === undefined ? null : leerWebMundo(crudoWeb);
  for (const pr of leidoWeb?.problemas ?? []) log(`[mundo] web.json: ${pr.path}: ${pr.message} (esa parte no se usa)`);
  // interacciones.json (numinia-engine/interacciones@1: { puertas: [{ id, nombre, x, y?, z, ry?, ancho?, alto?, radio?, cierraEn?, abierta? }],
  // botones: [{ id, nombre, x, y?, z, radio?, puerta? }], cosas: [{ id, nombre, x, y?, z, modelo?, escala?, radio? }] }): J4; none = nothing placed
  const crudoInter = leer("interacciones.json") as { puertas?: unknown; botones?: unknown; cosas?: unknown } | null | undefined;
  const inter = { puertas: crudoInter?.puertas, botones: crudoInter?.botones, cosas: crudoInter?.cosas };
  if (crudoInter !== undefined && !Array.isArray(inter.puertas) && !Array.isArray(inter.botones) && !Array.isArray(inter.cosas)) log(`[mundo] interacciones.json no tiene ninguna lista "puertas", "botones" o "cosas" (no pongo nada): ${JSON.stringify(crudoInter).slice(0, 160)}`);
  const sueloMundo = sueloDelMundo(leer); // D-045: the same values the instance got (logged once there)
  // contadores.json (numinia-engine/contadores@1, D-044: { contadores: [{ id, nombre, tipo, x, z, segundos | inicio, tope, donde?, evento?, manda? }] }):
  // the world's timers and counters; none = no counter. Each wrong line is left out with its reason; the rest is used.
  const crudoContadores = leer("contadores.json");
  const leidoContadores = crudoContadores === undefined ? null : leerContadores(crudoContadores);
  for (const pr of leidoContadores?.problemas ?? []) log(`[mundo] contadores.json: ${pr.path}: ${pr.message} (esa línea no se usa)`);

  // disparadores.json (numinia-engine/disparadores@1: { disparadores: [{ id, nombre, tipo: zona|boton, x, y?, z, radio?, frase?, cooldown?, un_solo_uso?, receptores: [{ accion, … }] }] }):
  // D-041, the cable; none = no trigger. Each bad line is left out with its reason (leerDisparadores); a wrong shape is said too.
  const crudoDisp = leer("disparadores.json");
  const leidoDisp = crudoDisp === undefined ? null : leerDisparadores(crudoDisp);
  for (const pr of leidoDisp?.problemas ?? []) log(`[mundo] disparadores.json: ${pr}`);
  return partes.map((p) => (p.feature.id === "disparadores" && leidoDisp ? crearDisparadores({ disparadores: leidoDisp.disparadores }) : p.feature.id === "contadores" && leidoContadores ? crearContadores({ contadores: leidoContadores.valor }) : p.feature.id === "suelo" && sueloMundo ? crearSuelo(sueloMundo) : p.feature.id === "puertas" && Array.isArray(inter.puertas) ? crearPuertas({ puertas: inter.puertas as Puerta[] }) : p.feature.id === "botones" && Array.isArray(inter.botones) ? crearBotones({ botones: inter.botones as Boton[] }) : p.feature.id === "cogibles" && Array.isArray(inter.cosas) ? crearCogibles({ cosas: inter.cosas as CosaCogible[] }) : p.feature.id === "web" && leidoWeb ? crearWeb(leidoWeb.valor) : p.feature.id === "dados" && Array.isArray(torresDados) ? crearDados({ torres: torresDados as TorreDados[] }) : p.feature.id === "teletransporte" ? (fotoSi ? crearTeletransporte({ foto: true }) : p) : p.feature.id === "entorno" ? crearEntorno(leer("entorno.json")) : p.feature.id === "elementos" ? crearElementos(leer("elementos.json")) : p.feature.id === "pesca" && Array.isArray(sitiosPesca) ? crearPesca({ sitios: sitiosPesca as SitioPesca[] }) : p.feature.id === "dardos" && Array.isArray(sitiosDardos) ? crearDardos({ sitios: sitiosDardos as SitioDardos[] }) : p));
}

/** D-045: the world's void (entorno.json `sueloMinimo` + `vuelta`), or null: no file, no key, or a wrong one (logged). */
export function sueloDelMundo(leer: (fichero: string) => unknown, log: (l: string) => void = () => {}): SueloMundo | null {
  const r = leerSuelo(leer("entorno.json"));
  if (r.ok) return r.value;
  log(`[mundo] sueloMinimo/vuelta de entorno.json no se usan (este mundo no tiene vacío): ${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return null;
}

/** The world's spawn area (entorno.json `aparicion`), or null: no file, no key, or a wrong one (logged, with its path). */
export function aparicionDelMundo(leer: (fichero: string) => unknown, log: (l: string) => void = () => {}): Aparicion | null {
  const r = leerAparicion(leer("entorno.json"));
  if (r.ok) return r.value;
  log(`[mundo] aparicion de entorno.json no se usa (la gente aparece en el cuadrado de la casa): ${r.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return null;
}
