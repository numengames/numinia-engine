// espejo — client part (mundo-hermes, v0). Draws each mirrored thing as a flat black-and-white shape by its `tipo` (a clock for a cron, a cube for a
// session, a slab with lamps for the switch panel — all made by code in packages/render/src/formas-planas.ts) with its Spanish label from the card,
// draws the floors of the zones with a white edge on the black ground, and offers the small controller the page's panel uses to TOUCH a thing:
// `usar` (the server tells me, only me, what it is and what it offers) and `pedir` (the server forwards the request out and tells me the result or that
// nobody answered). It only asks: the server checks who, where, which verb and how often. Texts that come from outside are untrusted: they are only
// ever put in labels and `textContent`, never in markup. No DOM here.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { espejo as decl } from "./feature.ts";

export type EstadoCosa = "activo" | "programado" | "pausado" | "fallo" | "apagado" | "desconocido";
export type Cosa = { clave: string; tipo: string; id: string; titulo: string; subtitulo: string; estado: EstadoCosa; zona: string; x: number; z: number; acciones: string[] };
/** What /status tells about the mirror (features/espejo/esquema.ts `vistaPublica`). */
export type Vista = { zonas: { id: string; nombre: string; cartel: string; x: number; z: number; ancho: number; fondo: number; tipos: string[] }[]; funciones: Record<string, boolean> };
export type Que = "cosas" | "ficha" | "pedido" | "resultado" | "rechazo" | "fuente" | "funcion";
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "el espejo no está en este servidor" };

/** The words a person reads for a state (Spanish, «usted» is not needed here: they are labels). */
export const TEXTO_ESTADO: Record<EstadoCosa, string> = { activo: "activo", programado: "programado", pausado: "en pausa", fallo: "con fallo", apagado: "apagado", desconocido: "sin estado" };
/** The words for a verb, as buttons say them. Anything not listed is shown as the verb itself. */
export const TEXTO_VERBO: Record<string, string> = {
  "cron.pausar": "Pausar", "cron.reanudar": "Reanudar", "cron.ejecutar": "Ejecutar ahora",
  "sesion.nueva": "Nueva sesión", "sesion.reanudar": "Reanudar sesión", "sesion.abrir": "Abrir sesión",
};
/** The words for a function of the switch panel (Spanish); anything not listed is shown as its own name. */
export const TEXTO_FUNCION: Record<string, string> = { salud: "la salud", cron: "las tareas programadas", sesiones: "las sesiones", chat: "el chat" };
/** The state of a shape in the house language (off / starting / on / fail), by kind of thing. Pure. */
export function estadoDeForma(tipo: string, estado: EstadoCosa): "off" | "starting" | "on" | "fail" {
  if (estado === "fallo") return "fail";
  if (tipo === "cron") return estado === "programado" ? "on" : estado === "activo" ? "starting" : "off";
  if (tipo === "sesion") return estado === "activo" ? "on" : "off";
  return estado === "activo" || estado === "programado" ? "on" : "off";
}
/** A steady number 0..1 from a key (where a clock's hand points, so each one looks its own). Pure. */
export function manoDe(clave: string): number {
  let h = 2166136261; for (let i = 0; i < clave.length; i++) { h ^= clave.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
const ALTO_ROTULO: Record<string, number> = { cron: 3.1, sesion: 2.9, salud: 2.9 };

/** One per page (tests make one per client). */
export function crearCliente() {
  let A: ClientApi | null = null;
  let vista: Vista | null = null;
  const cosas = new Map<string, Cosa>();
  const oyentes = new Set<(que: Que, clave?: string) => void>();
  const avisar = (que: Que, clave?: string) => { for (const fn of oyentes) fn(que, clave); };
  const e = { ficha: null as { objeto: string; texto: string; cuando: number } | null, pedido: null as { objeto: string; verbo: string; texto: string; cuando: number } | null, resultado: null as { objeto: string; verbo: string; ok: boolean; texto: string; cuando: number } | null, rechazo: "", conectada: null as boolean | null, funcion: null as { funcion: string; activa: boolean; texto: string } | null };
  // the switch of the Entorno panel and of the slab's lamps: it only asks; `activa` follows what the server told /status and `funcion`
  const interruptor = {
    estado: { puede: false, ultimoRechazo: "" },
    /** Is this function on? (default «salud», the threshold's master lamp: the row of the Entorno panel) */
    activa: (funcion = "salud"): boolean => vista?.funciones[funcion] === true,
    poner(activa: boolean, funcion = "salud"): Res { const r = A ? A.send("encender", { funcion, activa }) : SIN; esperaEncender = r.ok; return r; },
  };
  let esperaEncender = false;
  const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const leer = (clave: string, v: Msg): Cosa => {
    const [tipo, ...resto] = clave.split("/");
    return { clave, tipo, id: resto.join("/"), titulo: String(v.titulo ?? ""), subtitulo: String(v.subtitulo ?? ""), estado: String(v.estado ?? "desconocido") as EstadoCosa, zona: String(v.zona ?? ""), x: Number(v.x ?? 0), z: Number(v.z ?? 0), acciones: String(v.acciones ?? "").split(" ").filter(Boolean) };
  };
  const luces = (): boolean[] => (vista ? Object.values(vista.funciones) : []);
  /** Draw (or take away) one thing. */
  const dibujar = (c: Cosa | null, clave: string) => {
    const v = A?.view;
    if (!v) return;
    if (!c) { v.forma?.(`espejo:${clave}`, null); v.tag?.(`espejo:${clave}`, null); return; }
    const forma = c.tipo === "cron" ? "reloj" : c.tipo === "salud" ? "losa" : "cubo";
    v.forma?.(`espejo:${clave}`, { forma, x: c.x, z: c.z, estado: estadoDeForma(c.tipo, c.estado), rumbo: 0, ...(forma === "reloj" ? { mano: manoDe(clave) } : {}), ...(forma === "losa" ? { luces: luces() } : {}) });
    v.tag?.(`espejo:${clave}`, { text: c.titulo, sub: TEXTO_ESTADO[c.estado], x: c.x, y: ALTO_ROTULO[c.tipo] ?? 3, z: c.z });
  };
  /** The floors of the zones (a white edge on the black ground; dashed when everything the zone shows is switched off) and their signs. */
  const dibujarZonas = () => {
    const v = A?.view;
    if (!v || !vista) return;
    const FUNC: Record<string, string> = { salud: "salud", cron: "cron", sesion: "sesiones", mensaje: "chat" };
    for (const z of vista.zonas) {
      const encendida = z.tipos.some((t) => vista!.funciones[FUNC[t] ?? t] === true);
      v.forma?.(`espejo:zona:${z.id}`, { forma: "suelo", x: z.x, z: z.z, estado: encendida ? "on" : "off", ancho: z.ancho, fondo: z.fondo, discontinuo: !encendida });
      v.tag?.(`espejo:zona:${z.id}`, { text: z.cartel || z.nombre, sub: encendida ? "" : "apagada", x: z.x, y: 3.6, z: z.z + z.fondo / 2 - 0.5 });
    }
    for (const c of cosas.values()) if (c.tipo === "salud") dibujar(c, c.clave); // the panel's lamps follow the switches
  };

  const controlador = {
    /** Things in the world, as the server told this page. */
    cosas: (): Cosa[] => [...cosas.values()],
    cosa: (clave: string): Cosa | null => cosas.get(clave) ?? null,
    estado: e,
    interruptor,
    vista: (): Vista | null => vista,
    /** What /status said about the mirror (zones, switches): draws the floors and lamps. Call once the page knows it; safe before the connection. */
    configurar(v: unknown): void {
      const x = v as Vista | null | undefined;
      vista = x && Array.isArray(x.zonas) ? x : null;
      if (A) dibujarZonas();
      avisar("cosas");
    },
    /** Look at a thing (the server answers me alone with its card). */
    usar: (clave: string): Res => (A ? A.send("usar", { objeto: clave }) : SIN),
    /** Ask for an action on a thing (the server only forwards it; the result comes back, or «no ha respondido»). */
    pedir: (clave: string, verbo: string): Res => (A ? A.send("pedir", { objeto: clave, verbo }) : SIN),
    alCambiar(fn: (que: Que, clave?: string) => void): () => void { oyentes.add(fn); return () => oyentes.delete(fn); },
    /** Forget the card I was showing (the panel closed). */
    cerrarFicha(): void { e.ficha = null; e.pedido = null; e.resultado = null; e.rechazo = ""; avisar("ficha"); },
  };

  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((clave, v) => {
      if (v) cosas.set(clave, leer(clave, v)); else cosas.delete(clave);
      dibujar(v ? cosas.get(clave)! : null, clave);
      avisar("cosas", clave);
    });
    if (vista) dibujarZonas();
    api.on("ficha", (m) => { e.ficha = { objeto: String(m.objeto), texto: String(m.texto), cuando: ahora() }; e.pedido = null; e.resultado = null; e.rechazo = ""; avisar("ficha", String(m.objeto)); });
    api.on("pedido", (m) => { e.pedido = { objeto: String(m.objeto), verbo: String(m.verbo), texto: String(m.texto), cuando: ahora() }; e.resultado = null; avisar("pedido", String(m.objeto)); });
    api.on("resultado", (m) => { e.resultado = { objeto: String(m.objeto), verbo: String(m.verbo), ok: m.ok === true, texto: String(m.texto), cuando: ahora() }; e.pedido = null; avisar("resultado", String(m.objeto)); });
    api.on("rechazado", (m) => { e.rechazo = String(m.motivo); if (esperaEncender) { esperaEncender = false; interruptor.estado.ultimoRechazo = e.rechazo; } avisar("rechazo"); });
    api.on("permiso", (m) => { interruptor.estado.puede = m.encender === true; });
    api.on("funcion", (m) => { esperaEncender = false; if (vista) { vista.funciones[String(m.funcion)] = m.activa === true; dibujarZonas(); } e.funcion = { funcion: String(m.funcion), activa: m.activa === true, texto: String(m.texto) }; avisar("funcion"); });
    api.on("aviso", (m) => { e.conectada = m.conectada === true; avisar("fuente"); });
  });
  return { parts: [parte], espejo: controlador };
}

const pagina = crearCliente();
export const espejo = pagina.espejo;
export const interruptor = pagina.espejo.interruptor;
export default pagina.parts[0];
