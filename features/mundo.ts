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
import { crearBaculo, leerBaculos } from "./baculo/server.ts";
import { crearDados } from "./dados/server.ts";
import type { Torre as TorreDados } from "./dados/server.ts";
import { leerAparicion, leerAparicionFoto, leerSuelo } from "./entorno/esquema.ts";
import { crearSuelo } from "./suelo/server.ts"; // D-045
import { crearNaturaleza } from "./naturaleza/server.ts"; // N4
import { leerNaturaleza } from "./naturaleza/esquema.ts";
import { crearFunciones } from "./funciones/server.ts"; // f1: the feature switches (funciones.json)
import { crearEspacioBase } from "./espaciobase/server.ts"; // H2
import { leerEspacioBase, DEFECTOS as DEFECTOS_BASE } from "./espaciobase/esquema.ts";
import { crearObjetos } from "./objetos/server.ts"; // H5: the Logo Khepri, planted once
import { sembradoBase } from "./espaciobase/sembrado.ts";
import { validarTabla } from "../packages/relieve/src/fauna.ts"; // F1
import { FAUNA_CASA } from "./naturaleza/fauna-casa.ts";
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
import { crearLucha } from "./lucha/server.ts";
import { leerPvp } from "./lucha/estados.ts";
import type { Criatura } from "./lucha/server.ts";
import type { Aparicion } from "./entorno/esquema.ts";
import { crearDisparadores, leerDisparadores, serializarDisparadores } from "./disparadores/server.ts";
import type { OpcionesDecir } from "./disparadores/server.ts";
import { sonidosParaCable } from "./sonido/server.ts";
import { crearMovedores } from "./movedores/server.ts";
import { leerMovedores } from "./movedores/feature.ts";
import { crearAncestros } from "./ancestros/server.ts";
import type { Holograma, Muro } from "./ancestros/server.ts";

export function conMundo(partes: readonly ServerPart[], leer: (fichero: string) => unknown, log: (l: string) => void = () => {}, escribir?: (fichero: string, datos: unknown, o?: { nuevo?: boolean }) => void, extras: { decir?: Omit<OpcionesDecir, "sonidos"> } = {}): ServerPart[] {
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
  // baculos.json (numinia-engine/baculos@1: { cantidad?: 1–5, sitios?: [{ x, y?, z }] }): the Director's staff(s) and their pedestals; none = this world has no staff
  const leidoBaculos = leerBaculos(leer("baculos.json"));
  for (const pr of leidoBaculos?.problemas ?? []) log(`[mundo] baculos.json: ${pr}`);
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
  // naturaleza.json (numinia-engine/naturaleza@1, N4: { activa?, semilla?, tamano?, plaza?, densidad?: { arboles?, hierba? }, estanque?, paleta? }):
  // relief, trees and grass from a seed; none = the flat ground as always. A wrong file is not used (every issue logged with its path).
  // fauna.json (numinia-engine/fauna@1, F1: { especies: [{ id, nombre, grupo, rareza, peso, colores, luz, zonas, hora, tamano, vuelo, bandada? }] }): the world's own
  // animals instead of the house table (features/naturaleza/fauna.json); a wrong one is not used (every issue logged) and the house table stays.
  const crudoFauna = leer("fauna.json"), leidaFauna = crudoFauna === undefined ? null : validarTabla(crudoFauna);
  if (leidaFauna && !leidaFauna.ok) log(`[mundo] fauna.json no se usa (uso la tabla de la casa): ${leidaFauna.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  const tablaFauna = leidaFauna?.ok ? leidaFauna.value : undefined;
  const crudoNat = leer("naturaleza.json"), leidoNat = crudoNat === undefined ? null : leerNaturaleza(crudoNat, (tablaFauna ?? FAUNA_CASA).especies.map((e) => e.id));
  if (leidoNat && !leidoNat.ok) log(`[mundo] naturaleza.json no se usa (suelo plano): ${leidoNat.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  const natMundo = leidoNat?.ok ? leidoNat.value : null;
  // espacio-base.json (numinia-engine/espacio-base@1, H2: { activa?, semilla?, modo? }): the empty night world whose ground is a luminous line mesh;
  // none = nothing changes. A wrong file is not used (every issue logged). A world that ALSO has the nature on keeps the nature (the two grounds
  // would fight over the same place and the same collision mesh): the espacio base is then left out and the log says so.
  const crudoBase = leer("espacio-base.json"), leidoBase = crudoBase === undefined ? null : leerEspacioBase(crudoBase);
  if (leidoBase && !leidoBase.ok) log(`[mundo] espacio-base.json no se usa (suelo plano): ${leidoBase.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  const baseOk = leidoBase?.ok ? leidoBase.value : null, baseMundo = baseOk && baseOk.activa && natMundo?.activa ? null : baseOk;
  if (baseOk && baseOk.activa && natMundo?.activa) log("[mundo] espacio-base.json y naturaleza.json están los dos encendidos: se usa la naturaleza; apaga una de las dos (activa: false)");
  // Interruptor «Naturaleza»: with a world folder (`escribir`), the piece also gets the folder so whoever may build turns it on
  // or off from inside the world (it rewrites only `activa`; a world without the file gets one); without a folder, the house part.
  // contadores.json (numinia-engine/contadores@1, D-044: { contadores: [{ id, nombre, tipo, x, z, segundos | inicio, tope, donde?, evento?, manda? }] }):
  // the world's timers and counters; none = no counter. Each wrong line is left out with its reason; the rest is used.
  const crudoContadores = leer("contadores.json");
  const leidoContadores = crudoContadores === undefined ? null : leerContadores(crudoContadores);
  for (const pr of leidoContadores?.problemas ?? []) log(`[mundo] contadores.json: ${pr.path}: ${pr.message} (esa línea no se usa)`);

  // disparadores.json (numinia-engine/disparadores@1: { disparadores: [{ id, nombre, tipo: zona|boton, x, y?, z, radio?, frase?, cooldown?, un_solo_uso?, receptores: [{ accion, … }] }] }):
  // D-041, the cable; none = no trigger. Each bad line is left out with its reason (leerDisparadores); a wrong shape is said too.
  const crudoDisp = leer("disparadores.json");
  // Historia D («Decirlo»): the sounds a cable may play are the house catalogue's (looping beds and the body's own steps are not for a button)
  const decirDelMundo: OpcionesDecir = { pensar: null, ...extras.decir, sonidos: sonidosParaCable() };
  const leidoDisp = crudoDisp === undefined ? null : leerDisparadores(crudoDisp);
  for (const pr of leidoDisp?.problemas ?? []) log(`[mundo] disparadores.json: ${pr}`);
  // Lienzo (onboarding): a world folder WITHOUT disparadores.json still gets a writer, so the first cable someone creates live
  // («+ Nuevo cable», crearDisparador) is written to the folder and survives a restart. The first write creates the file (`nuevo`:
  // it never overwrites a hand-written one that appeared or was broken); later writes rename over it. Without a file the part
  // starts empty, exactly like the house part: the simulation footprint does not change (test/disparadores.test.ts).
  let dispEscrito = crudoDisp !== undefined;
  const escribirDisp = escribir ? (ds: Parameters<typeof serializarDisparadores>[0]) => { escribir("disparadores.json", serializarDisparadores(ds), { nuevo: !dispEscrito }); dispEscrito = true; } : undefined;

  // movedores.json (numinia-engine/movedores@1, D-043: { movedores: [{ id, nombre, modelo, tipo: vaiven|interruptor,
  // ax,ay,az,bx,by,bz, arx?,ary?,arz?,brx?,bry?,brz?, sx?,sy?,sz?, duracion, espera?, radio?, evento?, empiezaEn? }] }):
  // things the server moves and rotates with a duration (platform, sliding door, lift); none = nothing moves.
  const crudoMov = leer("movedores.json");
  const leidoMov = crudoMov === undefined ? null : leerMovedores(crudoMov);
  for (const pr of leidoMov?.problemas ?? []) log(`[mundo] movedores.json: ${pr.path}: ${pr.message} (esa línea no se usa)`);

  // lucha.json (numinia-engine/lucha@1: { criaturas: [{ id, especie, x, y, z, nombre?, reaparicion? }] }): the world's creatures; none = the house default
  const crudoL = leer("lucha.json") as { criaturas?: unknown } | null | undefined;
  const criaturas = crudoL?.criaturas;
  if (crudoL !== undefined && !Array.isArray(criaturas)) log(`[mundo] lucha.json no tiene una lista "criaturas" (uso la criatura de la casa): ${JSON.stringify(crudoL).slice(0, 160)}`);
  // entorno.json `pvp` / `zonasPvp` (L8): may people strike people, in the world and in each zone; absent = nobody does. Each wrong line is said.
  const lp = leerPvp(crudoEntorno), pvpMundo = lp.ok ? lp.value : lp.parcial ?? null;
  if (!lp.ok) for (const i of lp.issues) log(`[mundo] ${i.path}: ${i.message} (esa parte no se usa)`);
  // funciones.json (numinia-engine/funciones@1, f1: { normas?, dardos?, pesca? }): the world's feature switches; with a folder to write in the piece also lets whoever builds flip them; none and no folder = the house part
  const crudoFunciones = leer("funciones.json");
  // ancestros.json (numinia-engine/ancestros@1: { hologramas: [{ id, nombre, x, z, y?, rumbo?, radio? }], muros: [{ id, x0, z0, x1, z1, y0?, y1? }] }):
  // the world's own Salón de los Ancestros; none = the house hall at (0, −48) with Asimov. Empty lists = no hall at all (a blank world: the lienzo).
  // A list that is missing keeps that half of the house's; each wrong line is left out by the feature with its reason.
  const crudoAnc = leer("ancestros.json") as { hologramas?: unknown; muros?: unknown } | null | undefined;
  const anc = { hologramas: crudoAnc?.hologramas, muros: crudoAnc?.muros };
  if (crudoAnc !== undefined && !Array.isArray(anc.hologramas) && !Array.isArray(anc.muros)) log(`[mundo] ancestros.json no tiene ninguna lista "hologramas" o "muros" (uso el salón de la casa): ${JSON.stringify(crudoAnc).slice(0, 160)}`);
  const ancMundo = Array.isArray(anc.hologramas) || Array.isArray(anc.muros);
  return partes.map((p) => (p.feature.id === "funciones" && (escribir || crudoFunciones !== undefined) ? crearFunciones({ leer, escribir }) : p.feature.id === "espacio-base" && (baseMundo || escribir) ? crearEspacioBase(baseMundo, { leer, escribir }) : p.feature.id === "objetos" && (baseMundo?.activa || escribir) ? crearObjetos(undefined, baseMundo?.activa ? sembradoBase(baseMundo) : [], escribir ? sembradoBase(DEFECTOS_BASE) : []) : p.feature.id === "entorno" && baseMundo?.activa && crudoEntorno === undefined ? crearEntorno({ hora: { valor: 0, mueveElSol: true } }) : p.feature.id === "lucha" && (Array.isArray(criaturas) || pvpMundo) ? crearLucha({ criaturas: Array.isArray(criaturas) ? criaturas as Criatura[] : undefined, pvp: pvpMundo ?? undefined }) : p.feature.id === "disparadores" && (leidoDisp || escribirDisp || extras.decir?.pensar) ? crearDisparadores({ disparadores: leidoDisp?.disparadores, escribir: escribirDisp, decir: decirDelMundo }) : p.feature.id === "contadores" && leidoContadores ? crearContadores({ contadores: leidoContadores.valor }) : p.feature.id === "movedores" && leidoMov ? crearMovedores({ movedores: leidoMov.valor }) : p.feature.id === "suelo" && sueloMundo ? crearSuelo(sueloMundo) : p.feature.id === "naturaleza" && (natMundo || escribir) ? crearNaturaleza(natMundo, tablaFauna, { leer, escribir }) : p.feature.id === "puertas" && Array.isArray(inter.puertas) ? crearPuertas({ puertas: inter.puertas as Puerta[] }) : p.feature.id === "botones" && Array.isArray(inter.botones) ? crearBotones({ botones: inter.botones as Boton[] }) : p.feature.id === "cogibles" && Array.isArray(inter.cosas) ? crearCogibles({ cosas: inter.cosas as CosaCogible[] }) : p.feature.id === "web" && leidoWeb ? crearWeb(leidoWeb.valor) : p.feature.id === "baculo" ? crearBaculo(leidoBaculos?.valor ?? null, { leer, escribir }) : p.feature.id === "dados" ? crearDados({ torres: Array.isArray(torresDados) ? torresDados as TorreDados[] : undefined, activa: crudoDados !== undefined && crudoDados !== null && (crudoDados as { activa?: unknown }).activa !== false, io: { leer, escribir } }) : p.feature.id === "teletransporte" ? (fotoSi ? crearTeletransporte({ foto: true }) : p) : p.feature.id === "entorno" ? crearEntorno(leer("entorno.json")) : p.feature.id === "elementos" ? crearElementos(leer("elementos.json")) : p.feature.id === "pesca" && Array.isArray(sitiosPesca) ? crearPesca({ sitios: sitiosPesca as SitioPesca[] }) : p.feature.id === "dardos" && Array.isArray(sitiosDardos) ? crearDardos({ sitios: sitiosDardos as SitioDardos[] }) : p.feature.id === "ancestros" && ancMundo ? crearAncestros({ hologramas: Array.isArray(anc.hologramas) ? anc.hologramas as Holograma[] : undefined, muros: Array.isArray(anc.muros) ? anc.muros as Muro[] : undefined }) : p));
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
