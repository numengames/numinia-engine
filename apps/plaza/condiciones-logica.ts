// condiciones/c3 — the bubble of entry, the decisions without a browser. The server (c2) says where you stand
// (`condiciones-estado@1`); this file turns that message into the steps the page shows and into what ACEPTAR carries.
// The law is here as code, not as copy (CONDICIONES-EN-LOS-MUNDOS.md, «La ley europea»):
//   · the NORMS (contract) can close the door: one page per layer, a mandatory box per layer that has a mandatory norm;
//   · the DATA permissions never close it: they are the last step, every box EMPTY, and the two ways out
//     («Entrar sin lo opcional», «Aceptar todo y entrar») are the same kind of button (the page gives them one class);
//   · a layer is accepted as a block, by its version; nothing is accepted before the person says so.
// c6 (a layer went up a version): whoever had accepted the old one sees ONLY what the server marked in `capa.cambios` (new points, points
// whose text changed, the removed ones in a line) and nothing else is asked again; the data permissions already given for points that did
// not change stay given (they are carried in ACEPTAR: `conservados`), the new and the changed ones are offered with their box EMPTY.
import type { CondicionesAceptado, CondicionesCapa, CondicionesMensaje, CondicionesPunto } from "../../packages/net/src/index.ts";

export type Etiqueta = "nuevo" | "cambiado";
/** c6: what a layer's page shows of the change: its labels by point id, the previous titles, the removed points and the version it comes from. */
export type CambiosPagina = { desde: string; etiquetas: Record<string, Etiqueta>; antes: Record<string, string>; quitados: { id: string; titulo: string | null }[] };
export type PasoCapa = { tipo: "capa"; capa: string; nombre: string; /** the file's own name, none = the engine's plain word */ propio: string | null; version: string; normas: CondicionesPunto[]; exige: boolean; cambios?: CambiosPagina };
export type PasoDatos = { tipo: "datos"; permisos: { capa: string; punto: CondicionesPunto; etiqueta?: Etiqueta }[]; /** c6: the person is back and these are the new/changed ones only */ vuelve?: boolean };
export type Paso = PasoCapa | PasoDatos;

export const TITULO_CAMBIOS = "Han cambiado las normas";
export const SUBTITULO_CAMBIOS = "Ya aceptaste las anteriores; solo te enseñamos lo que ha cambiado.";
export const ETIQUETAS: Record<Etiqueta, string> = { nuevo: "NUEVO", cambiado: "CAMBIADO" };
export const NOTA_DATOS_VUELVE = "Lo que ya permitiste y no ha cambiado sigue como estaba. Ninguna casilla nueva sale marcada.";
/** «v1.0 → v1.1» */
export const flechaVersion = (desde: string, ahora: string): string => `v${desde} → v${ahora}`;
/** The box of a returning layer: «Acepto la versión 1.1 de las normas de Numen Games». */
export const rotuloAcepto = (p: Pick<PasoCapa, "capa" | "propio" | "version">): string =>
  `Acepto la versión ${p.version} de las normas de ${p.propio ?? (p.capa === "casa" ? "la casa" : "la comunidad")}`;
/** The line of a removed point: its old title (when the server kept it) and «ya no está». */
export const lineaQuitado = (q: { id: string; titulo: string | null }): { tachado: string; nota: string } => ({ tachado: q.titulo ?? q.id, nota: "ya no está" });
/** Is this plan the one of a person who comes back (some layer carries `cambios`)? */
export const esVuelta = (pasos: Paso[]): boolean => pasos.some((p) => p.tipo === "capa" && !!p.cambios);

/** Does this message ask for the bubble? Only a world whose gate is on, and only until you are let through. */
export const pideBurbuja = (m: CondicionesMensaje | null | undefined): boolean => !!m && m.puerta === true && m.abierta === false;

/** What a layer is called in the steps: its own `nombre` from condiciones.json, or a plain word («La casa», «La comunidad»: the engine has no brand). */
export function nombreDeCapa(c: Pick<CondicionesCapa, "capa" | "nombre">): string {
  const n = c.nombre?.trim();
  return n ? n : c.capa === "casa" ? "La casa" : c.capa === "comunidad" ? "La comunidad" : c.capa;
}

/** The steps: one page per layer that has norms (house first, then the community), then «Tus datos» when any layer has data points.
 * c6: when some layer carries `cambios` the person is back: a page only for the layers that changed (or were never accepted, in full) and
 * only the changed points on it; the layers accepted at their current version have no page; «Tus datos» holds only the new/changed ones. */
export function planificar(capas: CondicionesCapa[] | undefined | null, aceptado?: CondicionesAceptado | null): Paso[] {
  const pasos: Paso[] = [];
  const permisos: PasoDatos["permisos"] = [];
  const vuelve = (capas ?? []).some((c) => !!c.cambios);
  for (const c of capas ?? []) {
    const cb = c.cambios;
    if (vuelve && !cb && aceptado?.versiones?.[c.capa] === c.version) continue; // accepted as it is: nothing to ask
    const propio = c.nombre?.trim() || null;
    if (!cb) {
      const normas = c.puntos.filter((p) => p.tipo !== "datos");
      for (const p of c.puntos) if (p.tipo === "datos") permisos.push({ capa: c.capa, punto: p });
      if (normas.length) pasos.push({ tipo: "capa", capa: c.capa, nombre: nombreDeCapa(c), propio, version: c.version, normas, exige: normas.some((p) => p.obligatorio) });
      continue;
    }
    const etiquetas: Record<string, Etiqueta> = {};
    for (const id of cb.nuevos ?? []) etiquetas[id] = "nuevo";
    for (const id of cb.cambiados ?? []) etiquetas[id] = "cambiado";
    const mostrados = c.puntos.filter((p) => etiquetas[p.id]);
    for (const p of mostrados) if (p.tipo === "datos") permisos.push({ capa: c.capa, punto: p, etiqueta: etiquetas[p.id] });
    const normas = mostrados.filter((p) => p.tipo !== "datos");
    const antes = cb.antes ?? {};
    pasos.push({
      tipo: "capa", capa: c.capa, nombre: nombreDeCapa(c), propio, version: c.version, normas, exige: c.puntos.some((p) => p.tipo !== "datos" && p.obligatorio),
      cambios: { desde: cb.desde, etiquetas, antes, quitados: (cb.quitados ?? []).map((id) => ({ id, titulo: antes[id] ?? null })) },
    });
  }
  if (permisos.length) pasos.push({ tipo: "datos", permisos, ...(vuelve ? { vuelve: true } : {}) });
  return pasos;
}

/** c6: the data permissions the person had given that this plan does not ask about (a layer they did not have to see again, or a point that
 * did not change): ACEPTAR carries them so the server's «a later message replaces the list» does not take them away. */
export function conservados(capas: CondicionesCapa[] | undefined | null, aceptado: CondicionesAceptado | null | undefined): string[] {
  if (!aceptado || !(capas ?? []).some((c) => !!c.cambios)) return [];
  const dados = new Set(aceptado.datos ?? []), fuera: string[] = [];
  for (const c of capas ?? []) {
    const cb = c.cambios, tocados = new Set([...(cb?.nuevos ?? []), ...(cb?.cambiados ?? [])]);
    const preguntada = !cb && aceptado.versiones?.[c.capa] !== c.version; // never accepted: shown in full, the boxes decide
    if (preguntada) continue;
    for (const p of c.puntos) if (p.tipo === "datos" && dados.has(p.id) && !tocados.has(p.id)) fuera.push(p.id);
  }
  return fuera;
}

/** What the person has done so far. Boxes start empty; only the person fills them. */
export type Marcas = { normas: Record<string, boolean>; datos: Set<string> };
export const marcasVacias = (): Marcas => ({ normas: {}, datos: new Set() });

/** May the person go on from this step? A norms page with a mandatory norm needs its box; «Tus datos» never needs anything. */
export const puedeSeguir = (p: Paso | undefined, m: Marcas): boolean => !p || p.tipo === "datos" || !p.exige || m.normas[p.capa] === true;

/** Which step is the last one, where the person finally says yes (a norms page when no data permission exists). */
export const esUltimo = (pasos: Paso[], i: number): boolean => i >= pasos.length - 1;

/** The frame ACEPTAR carries: `versiones` = every shown layer at the version read (the server only counts the current text),
 * `datos` = exactly the data boxes ticked, or all of them for «Aceptar todo y entrar», or none for «Entrar sin lo opcional»; plus, for
 * someone who is back (c6), the permissions given before that no box on screen asks about (`guardados`, from `conservados`). */
export function aceptacion(pasos: Paso[], m: Marcas, modo: "marcadas" | "todo" | "ninguna", guardados: string[] = []): { versiones: Record<string, string>; datos: string[] } {
  const versiones: Record<string, string> = {};
  for (const p of pasos) if (p.tipo === "capa") versiones[p.capa] = p.version;
  const ids = pasos.flatMap((p) => (p.tipo === "datos" ? p.permisos.map((x) => x.punto.id) : []));
  const datos = modo === "todo" ? ids : modo === "ninguna" ? [] : ids.filter((id) => m.datos.has(id));
  return { versiones, datos: [...new Set([...datos, ...guardados.filter((id) => !ids.includes(id))])] }; // c6: what was given and not asked again, never what is on screen
}

/** Can the person leave through «Entrar»? Every step with a mandatory norm must have its box (the server checks again). */
export const todoMarcado = (pasos: Paso[], m: Marcas): boolean => pasos.every((p) => puedeSeguir(p, m));

/** The label of the first of the two buttons: without optional data, unless the person ticked some (then it says what it will do). */
export const rotuloSinOpcional = (marcadas: number): string => (marcadas > 0 ? "Entrar con lo que he marcado" : "Entrar sin lo opcional");
export const ROTULO_TODO = "Aceptar todo y entrar";

/** The share of the text read, 0–100, from a scrollable box's geometry. A box that fits whole is read. */
export function porcentajeLeido(scrollTop: number, clientHeight: number, scrollHeight: number): number {
  const recorrido = scrollHeight - clientHeight;
  if (recorrido <= 1) return 100;
  return Math.max(0, Math.min(100, Math.round(((scrollTop) / recorrido) * 100)));
}
