// teletransporte — client part (N16): what a page needs to go next to someone (the list of who is here, whether this
// world allows it, whether you may switch it, whether you let yourself be found) and the light's moments (`sale`,
// `llega`) for the view to draw. It only asks: the server decides. The panel is the page's (apps/plaza/gente.ts); the
// light is packages/render/src/teletransporte.ts; agents and tests use the controller below.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg } from "../../packages/feature/src/index.ts";
import { teletransporte, MUNDO } from "./feature.ts";

export type Persona = { quien: number; nombre: string };
/** A moment of the light: someone leaves (`sale`) or arrives (`llega`) at x, y, z with this look. */
export type Destello = { tipo: "sale" | "llega"; quien: number; nombre: string; x: number; y: number; z: number; variante: number };
export type Cambio = "mundo" | "permiso" | "gente" | "viaje";

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = {
    gente: [] as Persona[], todos: 0, pedida: false,
    /** The world's answer arrived (whether it allows going next to others and a photo's place). */
    recibido: false,
    puede: false, encontrable: true,
    viaje: null as { ok: boolean; texto: string } | null,
    viajes: 0, destellos: 0,
  };
  const oyentes = new Set<(que: Cambio) => void>();
  const luces = new Set<(d: Destello) => void>();
  const avisar = (q: Cambio) => { for (const f of oyentes) { try { f(q); } catch { /* a page's listener must not stop the rest */ } } };
  const enviar = (intent: string, msg: Msg) => api?.send(intent, msg) ?? { ok: false as const, why: "la página aún no ha arrancado" };
  const mundo = () => api?.state.get(MUNDO);
  const ctl = {
    estado,
    /** Whether this world lets people go next to others now. */
    activo: (): boolean => mundo()?.activo !== false,
    /** Whether this world lets a photo's link put you at its place (entorno.json `aparicionFoto`). */
    foto: (): boolean => mundo()?.foto === true,
    /** Ask who is here now (answered as a list in estado.gente). */
    pedirGente: () => { estado.pedida = true; return enviar("gente", {}); },
    /** Go next to someone of the list (their entity number). */
    ir: (quien: number) => enviar("ir", { quien }),
    /** Go next to someone by name, as /ir does (the first of the list whose name starts so). */
    irCon: (nombre: string) => {
      const n = nombre.toLowerCase().trim(), p = estado.gente.find((g) => g.nombre.toLowerCase() === n) ?? estado.gente.find((g) => g.nombre.toLowerCase().startsWith(n));
      return p ? ctl.ir(p.quien) : { ok: false as const, why: `«${nombre}» no está en la lista: pide la lista de Gente primero` };
    },
    encontrable: (si: boolean) => enviar("encontrable", { si }),
    permitir: (si: boolean) => enviar("permitir", { si }),
    /** A photo's link opened this page: ask to appear at its place (the server checks the world allows it). */
    aparecerEnFoto: (x: number, y: number, z: number) => enviar("foto", { x, y, z }),
    /** Go to a marked site of the map (its x, z; your own height — the server drops you on the nearest floor). */
    irAPunto: (x: number, z: number, nombre = "") => enviar("punto", { x, z, nombre }),
    alCambiar: (f: (que: Cambio) => void) => { oyentes.add(f); return () => oyentes.delete(f); },
    /** The light's moments, for the view (and the page hides that avatar while the light holds it). */
    alDestello: (f: (d: Destello) => void) => { luces.add(f); return () => luces.delete(f); },
  };
  const destello = (tipo: Destello["tipo"]) => (m: Msg) => {
    const d: Destello = { tipo, quien: Number(m.quien), nombre: String(m.nombre ?? ""), x: Number(m.x), y: Number(m.y), z: Number(m.z), variante: Number(m.variante) };
    estado.destellos++;
    for (const f of luces) { try { f(d); } catch { /* idem */ } }
  };
  const part = clientPart(teletransporte, (a) => {
    api = a;
    a.state.onChange((k) => { if (k === MUNDO) { estado.recibido = a.state.get(MUNDO) !== undefined; avisar("mundo"); } });
    a.on("permiso", (m) => { estado.puede = m.puede === true; estado.encontrable = m.encontrable !== false; avisar("permiso"); });
    let nueva: Persona[] = [];
    a.on("persona", (m) => {
      const n = Number(m.n), total = Number(m.total);
      if (n === 0) nueva = [];
      if (total > 0) nueva[n] = { quien: Number(m.quien), nombre: String(m.nombre) };
      if (total === 0 || n === total - 1) { estado.gente = nueva.filter(Boolean); estado.todos = Number(m.todos); nueva = []; avisar("gente"); }
    });
    a.on("viaje", (m) => { estado.viaje = { ok: m.ok === true, texto: String(m.texto) }; if (m.ok === true) estado.viajes++; avisar("viaje"); });
    a.on("sale", destello("sale"));
    a.on("llega", destello("llega"));
  });
  return { ...ctl, part };
}

/** The page's controller (one per page). */
export const viajar = crearCliente();
export default viajar.part;
