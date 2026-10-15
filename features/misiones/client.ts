// misiones — client part (J5): draws the people (pnj) and the quest things, keeps THIS player's quest book (built from
// events that reach only them) and offers one small controller that the page (apps/plaza: dialogue box, book, prompt)
// and agents use. It only asks: the server decides every step.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { pnj as pnjDecl, misiones as misionesDecl } from "./feature.ts";
import biblioteca from "../objetos/biblioteca.json" with { type: "json" };

const modelo = (id: string) => biblioteca.modelos.find((m) => m.id === id)?.modelo ?? "";
const ROBOT = modelo("robot"), BLOQUE = modelo("bloque");
/** The house robot is ~4.6 m tall as it comes; people of the world stand ~1.8 m. */
export const ESCALA_ROBOT = 0.4;
/** Where a person's name floats: above the head of a 1.8 m figure, scaled with it. */
export const ALTO_NOMBRE = 2.25;

/** How a person of the world looks TODAY: a library model at its place (the house robot by default), still (no idle
 * animation: phones stay cool). The avatar branch (VRM) replaces this one function. */
export function aspectoPnj(v: Msg): { cuerpo: PlacedObject; nombre: { text: string; x: number; y: number; z: number } } {
  const propio = String(v.modelo ?? ""), e = Number(v.escala) * (propio ? 1 : ESCALA_ROBOT);
  return {
    cuerpo: { model: propio || ROBOT, x: Number(v.x), y: 0, z: Number(v.z), rx: 0, ry: Number(v.giro), rz: 0, sx: e, sy: e, sz: e, animate: false },
    nombre: { text: String(v.nombre), x: Number(v.x), y: ALTO_NOMBRE * Number(v.escala), z: Number(v.z) },
  };
}
/** How a quest thing looks: its model, or the house block (a small crate). */
export const aspectoCosa = (v: Msg): PlacedObject => {
  const e = Number(v.escala);
  return { model: String(v.modelo ?? "") || BLOQUE, x: Number(v.x), y: 0, z: Number(v.z), rx: 0, ry: 0, rz: 0, sx: e, sy: e, sz: e, animate: false };
};

export type PasoVista = { n: number; texto: string; tipo: string; hecho: boolean; x: number; z: number; donde: string; que: string };
export type MisionVista = { id: string; titulo: string; descripcion: string; estado: "activa" | "hecha"; paso: number; pasos: number; seguida: boolean; recompensa: string; lista: PasoVista[] };
export type Objetivo = { mision: string; paso: number; nombre: string; texto: string; x: number; z: number; seguida: boolean };
export type Dialogo = { pnj: string; nombre: string; texto: string; opciones: string[] };
type Res = { ok: true } | { ok: false; why: string };

/** One per page (tests make one per client). `misiones` is what the page's panels and an agent call. */
export function crearCliente() {
  let P: ClientApi | null = null, M: ClientApi | null = null;
  const libro = new Map<string, MisionVista>();
  let dialogo: Dialogo | null = null;
  const estado = { ultimoRechazo: "", ultimoAviso: "" };
  const oyentes = new Set<(que: "libro" | "dialogo") => void>();
  const avisar = (que: "libro" | "dialogo") => { for (const f of oyentes) { try { f(que); } catch { /* a panel's problem is its own */ } } };
  const sin = (why: string): Res => ({ ok: false, why });

  const actual = (m: MisionVista): PasoVista | undefined => m.lista.find((s) => s.n === m.paso);
  const misiones = {
    estado,
    /** The book as it arrived: active quests first, then the completed ones. */
    libro: (): MisionVista[] => [...libro.values()],
    /** Where each active quest's current step points (for the map: mapa reads this). */
    objetivos: (): Objetivo[] => [...libro.values()].filter((m) => m.estado === "activa").flatMap((m) => {
      const s = actual(m);
      return s ? [{ mision: m.id, paso: s.n, nombre: s.donde, texto: s.texto, x: s.x, z: s.z, seguida: m.seguida }] : [];
    }),
    /** For the player sheet: how many, the badges, and what is being followed. */
    resumen: () => {
      const todas = [...libro.values()], seg = todas.find((m) => m.seguida && m.estado === "activa"), s = seg && actual(seg);
      return {
        activas: todas.filter((m) => m.estado === "activa").length,
        hechas: todas.filter((m) => m.estado === "hecha").length,
        insignias: todas.filter((m) => m.estado === "hecha" && m.recompensa).map((m) => m.recompensa),
        seguida: seg ? { mision: seg.id, titulo: seg.titulo, paso: seg.paso + 1, pasos: seg.pasos, texto: s?.texto ?? "", donde: s?.donde ?? "" } : null,
      };
    },
    /** The conversation open right now (null = none). */
    dialogo: () => dialogo,
    hablar: (pnj: string): Res => P?.send("hablar", { pnj }) ?? sin("la página aún no ha arrancado"),
    /** Choose answer n (1-4) of the open conversation. */
    elegir: (n: number): Res => (dialogo && P ? (n >= 1 && n <= dialogo.opciones.length ? P.send("elegir", { pnj: dialogo.pnj, opcion: n }) : sin(`no hay respuesta ${n}`)) : sin("no hay ninguna conversación abierta")),
    adios: (): Res => { if (!dialogo || !P) return sin("no hay ninguna conversación abierta"); const r = P.send("adios", { pnj: dialogo.pnj }); dialogo = null; avisar("dialogo"); return r; },
    aceptar: (mision: string): Res => M?.send("aceptar", { mision }) ?? sin("la página aún no ha arrancado"),
    abandonar: (mision: string): Res => M?.send("abandonar", { mision }) ?? sin("la página aún no ha arrancado"),
    seguir: (mision: string): Res => M?.send("seguir", { mision }) ?? sin("la página aún no ha arrancado"),
    usar: (cosa: string): Res => M?.send("usar", { cosa }) ?? sin("la página aún no ha arrancado"),
    /** Whether the page should offer «E: …» for a thing: quest things only while a current step needs them. */
    ofrece: (feature: string, key: string): boolean => feature !== "misiones" || [...libro.values()].some((m) => m.estado === "activa" && actual(m)?.que === key && (actual(m)?.tipo === "coge" || actual(m)?.tipo === "usa")),
    /** Call `fn` when the book or the conversation changes; returns how to stop. */
    alCambiar: (fn: (que: "libro" | "dialogo") => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const pnjPart = clientPart(pnjDecl, (a) => {
    P = a;
    a.state.onChange((key, v) => {
      if (!v) { a.view.place?.(`pnj:${key}`, null); a.view.tag?.(`pnj:${key}`, null); return; }
      const look = aspectoPnj(v);
      a.view.place?.(`pnj:${key}`, look.cuerpo);
      a.view.tag?.(`pnj:${key}`, look.nombre);
    });
    a.on("dialogo", (m) => {
      dialogo = { pnj: String(m.pnj), nombre: String(m.nombre), texto: String(m.texto), opciones: [m.o1, m.o2, m.o3, m.o4].map(String).filter(Boolean) };
      avisar("dialogo");
    });
    a.on("fin", (m) => { if (dialogo?.pnj === String(m.pnj)) { dialogo = null; avisar("dialogo"); } });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); avisar("dialogo"); });
  });

  const misionesPart = clientPart(misionesDecl, (a) => {
    M = a;
    a.state.onChange((key, v) => a.view.place?.(`cosa:${key}`, v ? aspectoCosa(v) : null));
    a.on("libro", () => { libro.clear(); avisar("libro"); });
    a.on("mision", (m) => {
      libro.set(String(m.id), { id: String(m.id), titulo: String(m.titulo), descripcion: String(m.descripcion), estado: m.estado === "hecha" ? "hecha" : "activa", paso: Number(m.paso), pasos: Number(m.pasos), seguida: m.seguida === true, recompensa: String(m.recompensa ?? ""), lista: [] });
      avisar("libro");
    });
    a.on("paso", (m) => {
      const mv = libro.get(String(m.mision));
      if (!mv) return;
      const s: PasoVista = { n: Number(m.n), texto: String(m.texto), tipo: String(m.tipo), hecho: m.hecho === true, x: Number(m.x), z: Number(m.z), donde: String(m.donde), que: String(m.que ?? "") };
      mv.lista = [...mv.lista.filter((x) => x.n !== s.n), s].sort((p, q) => p.n - q.n);
      avisar("libro");
    });
    a.on("aceptada", () => avisar("libro"));
    a.on("avance", () => avisar("libro"));
    a.on("completada", () => avisar("libro"));
    a.on("aviso", (m) => { estado.ultimoAviso = String(m.texto); avisar("libro"); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); avisar("libro"); });
  });

  const parts: ClientPart[] = [pnjPart, misionesPart];
  return { parts, misiones };
}

const pagina = crearCliente();
/** The page's controller (apps/plaza mounts the dialogue box, the book and the prompt on it; agents call it too). */
export const misiones = pagina.misiones;
export default pagina.parts;
