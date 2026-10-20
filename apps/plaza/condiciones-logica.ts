// condiciones/c3 — the bubble of entry, the decisions without a browser. The server (c2) says where you stand
// (`condiciones-estado@1`); this file turns that message into the steps the page shows and into what ACEPTAR carries.
// The law is here as code, not as copy (CONDICIONES-EN-LOS-MUNDOS.md, «La ley europea»):
//   · the NORMS (contract) can close the door: one page per layer, a mandatory box per layer that has a mandatory norm;
//   · the DATA permissions never close it: they are the last step, every box EMPTY, and the two ways out
//     («Entrar sin lo opcional», «Aceptar todo y entrar») are the same kind of button (the page gives them one class);
//   · a layer is accepted as a block, by its version; nothing is accepted before the person says so.
import type { CondicionesCapa, CondicionesMensaje, CondicionesPunto } from "../../packages/net/src/index.ts";

export type PasoCapa = { tipo: "capa"; capa: string; nombre: string; version: string; normas: CondicionesPunto[]; exige: boolean };
export type PasoDatos = { tipo: "datos"; permisos: { capa: string; punto: CondicionesPunto }[] };
export type Paso = PasoCapa | PasoDatos;

/** Does this message ask for the bubble? Only a world whose gate is on, and only until you are let through. */
export const pideBurbuja = (m: CondicionesMensaje | null | undefined): boolean => !!m && m.puerta === true && m.abierta === false;

/** What a layer is called in the steps: its own `nombre` from condiciones.json, or a plain word («La casa», «La comunidad»: the engine has no brand). */
export function nombreDeCapa(c: Pick<CondicionesCapa, "capa" | "nombre">): string {
  const n = c.nombre?.trim();
  return n ? n : c.capa === "casa" ? "La casa" : c.capa === "comunidad" ? "La comunidad" : c.capa;
}

/** The steps: one page per layer that has norms (house first, then the community), then «Tus datos» when any layer has data points. */
export function planificar(capas: CondicionesCapa[] | undefined | null): Paso[] {
  const pasos: Paso[] = [];
  const permisos: PasoDatos["permisos"] = [];
  for (const c of capas ?? []) {
    const normas = c.puntos.filter((p) => p.tipo !== "datos");
    for (const p of c.puntos) if (p.tipo === "datos") permisos.push({ capa: c.capa, punto: p });
    if (normas.length) pasos.push({ tipo: "capa", capa: c.capa, nombre: nombreDeCapa(c), version: c.version, normas, exige: normas.some((p) => p.obligatorio) });
  }
  if (permisos.length) pasos.push({ tipo: "datos", permisos });
  return pasos;
}

/** What the person has done so far. Boxes start empty; only the person fills them. */
export type Marcas = { normas: Record<string, boolean>; datos: Set<string> };
export const marcasVacias = (): Marcas => ({ normas: {}, datos: new Set() });

/** May the person go on from this step? A norms page with a mandatory norm needs its box; «Tus datos» never needs anything. */
export const puedeSeguir = (p: Paso | undefined, m: Marcas): boolean => !p || p.tipo === "datos" || !p.exige || m.normas[p.capa] === true;

/** Which step is the last one, where the person finally says yes (a norms page when no data permission exists). */
export const esUltimo = (pasos: Paso[], i: number): boolean => i >= pasos.length - 1;

/** The frame ACEPTAR carries: `versiones` = every shown layer at the version read (the server only counts the current text),
 * `datos` = exactly the data boxes ticked, or all of them for «Aceptar todo y entrar», or none for «Entrar sin lo opcional». */
export function aceptacion(pasos: Paso[], m: Marcas, modo: "marcadas" | "todo" | "ninguna"): { versiones: Record<string, string>; datos: string[] } {
  const versiones: Record<string, string> = {};
  for (const p of pasos) if (p.tipo === "capa") versiones[p.capa] = p.version;
  const ids = pasos.flatMap((p) => (p.tipo === "datos" ? p.permisos.map((x) => x.punto.id) : []));
  const datos = modo === "todo" ? ids : modo === "ninguna" ? [] : ids.filter((id) => m.datos.has(id));
  return { versiones, datos };
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
