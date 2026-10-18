// disparadores — client part (v1, D-041). The page asks nothing but `pulsar`; the server decides. A button is drawn as
// a small block on a post (the house block, CC0) so it can be found; a zone draws nothing (its label and the mobile
// button come in story 5). `lista()` and `pulsar()` are what apps/plaza and agents use.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { disparadores as decl } from "./feature.ts";

/** The house block (features/objetos/biblioteca.json «bloque», CC0). */
const MODELO = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";
export const LADO_M = 0.3, ALTURA_M = 1.0;
export type Disparador = { id: string; nombre: string; tipo: "zona" | "boton"; x: number; y: number; z: number; radio: number; alcance: number; frase: string; cooldown: number; unSoloUso: boolean; usos: number; enEspera: boolean; agotado: boolean };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función disparadores no está en este servidor" };

/** A button's cap: a small block at hand height; sunk while waiting or spent. Pure. */
export const tapa = (v: Pick<Disparador, "x" | "y" | "z" | "enEspera" | "agotado">): PlacedObject =>
  ({ model: MODELO, x: v.x, y: v.y + ALTURA_M + (v.enEspera || v.agotado ? -0.06 : 0), z: v.z, rx: 0, ry: 0, rz: 0, sx: LADO_M, sy: LADO_M * 0.5, sz: LADO_M, animate: false });

export function crearCliente() {
  let A: ClientApi | null = null;
  const oyentes = new Set<(id: string) => void>();
  // D-041 historias 3-4: what the three receivers that only this page hears last did (for tests and agents; the
  // player hears/reads it through the normal announce — `teletransportado`, `enlace`, `sonido`).
  const estado = { ultimoEnlace: "", ultimoTeletransporte: null as { x: number; y: number; z: number } | null, ultimoSonido: "" };
  const disparadores = {
    estado,
    lista: (): Disparador[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Disparador) : []),
    pulsar: (id: string): Res => (A ? A.send("pulsar", { disparador: id }) : SIN),
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
    api.on("sonido", (m) => { estado.ultimoSonido = String(m.sonido ?? ""); });
  });
  return { parts: [parte], disparadores };
}

const pagina = crearCliente();
export const disparadores = pagina.disparadores;
export default pagina.parts[0];
