// disparadores — client part (v1, D-041). The page asks nothing but `pulsar`; the server decides. A button is drawn as
// a small block on a post (the house block, CC0) so it can be found; a zone draws nothing (its label and the mobile
// button come in story 5). `lista()` and `pulsar()` are what apps/plaza and agents use.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { disparadores as decl } from "./feature.ts";

/** The house block (features/objetos/biblioteca.json «bloque», CC0). */
const MODELO = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";
export const LADO_M = 0.3, ALTURA_M = 1.0;
export type Disparador = { id: string; nombre: string; tipo: "zona" | "boton"; x: number; y: number; z: number; radio: number; alcance: number; frase: string; cooldown: number; unSoloUso: boolean; usos: number; enEspera: boolean; agotado: boolean; receptores: Record<string, unknown>[] };
/** What `crearDisparador` takes: one line of disparadores.json (`radio` = the zone's radius or the button's reach). */
export type NuevoDisparador = { id: string; tipo: "zona" | "boton" | "senal"; receptores: Record<string, unknown>[]; nombre?: string; x?: number; y?: number; z?: number; radio?: number; frase?: string; senal?: string; cooldown?: number; unSoloUso?: boolean };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función disparadores no está en este servidor" };
/** D-041 historias 5-6: lo que llega en el campo `receptores` del estado (JSON) o se manda a editar_receptores, sin
 * JSON roto: una lista vacía en vez de tirar. Lo usa `lista()` al leer y `editarReceptores()` al mandar. */
const receptoresDe = (v: unknown): Record<string, unknown>[] => { try { const r = JSON.parse(String(v ?? "[]")); return Array.isArray(r) ? r : []; } catch { return []; } };

/** A button's cap: a small block at hand height; sunk while waiting or spent. Pure. */
export const tapa = (v: Pick<Disparador, "x" | "y" | "z" | "enEspera" | "agotado">): PlacedObject =>
  ({ model: MODELO, x: v.x, y: v.y + ALTURA_M + (v.enEspera || v.agotado ? -0.06 : 0), z: v.z, rx: 0, ry: 0, rz: 0, sx: LADO_M, sy: LADO_M * 0.5, sz: LADO_M, animate: false });

export function crearCliente() {
  let A: ClientApi | null = null;
  const oyentes = new Set<(id: string) => void>();
  // D-041 historias 3-4: what the receivers that only this page hears last did (for tests and agents; the player
  // hears/reads it through the normal announce — `teletransportado`, `enlace`). S6: `suena` belongs to the sound
  // piece now (features/sonido), which plays the house catalogue's file instead of the fixed beep that lived here.
  const estado = { ultimoEnlace: "", ultimoTeletransporte: null as { x: number; y: number; z: number } | null };
  const disparadores = {
    estado,
    lista: (): Disparador[] => (A ? A.state.keys().map((k) => { const v = A!.state.get(k) as Msg; return { id: k, ...v, receptores: receptoresDe(v.receptores) } as Disparador; }) : []),
    pulsar: (id: string): Res => (A ? A.send("pulsar", { disparador: id }) : SIN),
    // D-041 historias 5-6: reemplaza en vivo los receptores de un disparador (solo construir); el servidor valida y,
    // si acepta, todos ven el cambio al momento (alCambiar) y, si el mundo lo permite, reescribe disparadores.json.
    editarReceptores: (id: string, receptores: Record<string, unknown>[]): Res => (A ? A.send("editarReceptores", { disparador: id, receptores: JSON.stringify(receptores) }) : SIN),
    // Historia A (cable sin JSON): crea o borra un disparador entero en vivo (solo construir). La página solo manda la
    // petición; el servidor valida (mismo lector que disparadores.json), pone o quita el cable para todos y reescribe el fichero.
    crearDisparador: (d: NuevoDisparador): Res => (A ? A.send("crearDisparador", { disparador: d.id, nombre: d.nombre ?? "", tipo: d.tipo, x: d.x ?? 0, y: d.y ?? 0, z: d.z ?? 0, radio: d.radio ?? 3, frase: d.frase ?? "", senal: d.senal ?? "", cooldown: d.cooldown ?? 0, unSoloUso: d.unSoloUso ?? false, receptores: JSON.stringify(d.receptores) }) : SIN),
    borrarDisparador: (id: string): Res => (A ? A.send("borrarDisparador", { disparador: id }) : SIN),
    alCambiar: (fn: (id: string) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };
  const parte: ClientPart = clientPart(decl, (api) => {
    A = api;
    api.state.onChange((key, v) => {
      const boton = v && v.tipo === "boton";
      api.view.place?.(`disparadores:${key}`, boton ? tapa(v as unknown as Disparador) : null);
      api.view.place?.(`disparadores:${key}:poste`, boton ? { model: MODELO, x: Number(v.x), y: Number(v.y) + ALTURA_M / 2, z: Number(v.z), rx: 0, ry: 0, rz: 0, sx: 0.08, sy: ALTURA_M, sz: 0.08, animate: false } : null);
      api.view.tag?.(`disparadores:${key}`, boton ? { text: String(v.nombre), x: Number(v.x), y: Number(v.y) + ALTURA_M + 0.5, z: Number(v.z) } : null);
      for (const fn of oyentes) fn(key);
    });
    api.on("disparado", (m) => { if (Number(m.quien)) api.view.bounce(Number(m.quien), 300); });
    // D-041 historia 4: the page only ASKS before opening a world-wired link (abre_enlace); it never auto-navigates.
    api.on("enlace", (m) => {
      const enlace = String(m.enlace ?? "");
      if (typeof window !== "undefined" && typeof window.confirm === "function" && window.confirm(`¿Abrir este enlace en una pestaña nueva?\n${enlace}`)) {
        window.open(enlace, "_blank", "noopener,noreferrer");
      }
      estado.ultimoEnlace = enlace;
    });
    api.on("teletransportado", (m) => { estado.ultimoTeletransporte = { x: Number(m.x), y: Number(m.y), z: Number(m.z) }; });
  });
  return { parts: [parte], disparadores };
}

const pagina = crearCliente();
export const disparadores = pagina.disparadores;
export default pagina.parts[0];
