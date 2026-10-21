// burbuja — server part (ia-llamar S8). Every AI connected now has a bubble (its pass's `ia.burbuja`, which the roles feature says
// through its server-only event «iaBurbuja»; the house default — sphere, 4 m, «al-acercarte» — otherwise). Every CADA_TICKS ticks the
// server reviews, from the positions it already has, who stands inside each AI's bubble and says what changed:
//   «entraEnBurbuja» / «saleDeBurbuja»  → to the AI itself ({to: ai}); every server-side listener of this feature hears them too
//                                            (S10 `llamar`: `api.listen("burbuja", "entraEnBurbuja", …)`), people and AIs alike (`esIA`)
//   «entras» / «sales»                      → to the person only, the on-screen notice «Entras en la burbuja de <nombre> (IA)»; once per
//                                            entry, never twice for the same AI within AVISO_RESPIRO_TICKS (an edge that blinks is quiet)
// and publishes the shape in the AI's public state (key = its entity) for the page to draw (S9). The query `dentroDeBurbuja(ai)`
// answers S10/S12 from the same record. Cost: nothing at all while no AI is connected (one `size` check per tick); with AIs, one pass
// over the players every 10 ticks, each AI testing each player with a box check first — O(AIs × people), no allocation per person.
// Safety valve: at most EVENTOS_POR_BARRIDO changes are announced per review; the rest wait for the next one (and stay as they were).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { CADA_TICKS, DEFECTO, burbuja, dentro, leerBurbuja } from "./feature.ts";
import type { Burbuja, Punto } from "./feature.ts";

export const AVISO_RESPIRO_TICKS = 200;   // 10 s at 20 Hz: the entry notice of one AI to one person at most this often
export const EVENTOS_POR_BARRIDO = 100;   // entries + exits announced in one review
const NOMBRE_BYTES = 60;

const esIA = (id: string | undefined): boolean => !!id && id.startsWith("ia-"); // identidad.ts agenteDe
const enc = new TextEncoder();
/** At most `max` bytes of `s`, never splitting a character. */
function cortar(s: string, max: number): string {
  if (enc.encode(s).length <= max) return s;
  let out = "";
  for (const c of s) { if (enc.encode(out + c).length > max) break; out += c; }
  return out;
}

type Ocupante = { visto: number; esIA: boolean; avisado: boolean };
type Zona = { cfg: Burbuja; dentro: Map<number, Ocupante>; avisos: Map<number, number> };

/** One per server. `part` goes into the list of parts; the other three are the queries for S10/S12 (and tests). */
export function crearBurbuja() {
  let zonas = new Map<number, Zona>();
  let barrido = 0;
  // scratch for one review: where everybody stands, reused between reviews
  let ids = new Int32Array(64), xs = new Float64Array(64), ys = new Float64Array(64), zs = new Float64Array(64);

  const part = serverPart(burbuja, (api: ServerApi) => {
    zonas = new Map(); barrido = 0;
    const publicar = (ai: number, cfg: Burbuja): void => { api.state.set(String(ai), { forma: cfg.forma, radio: cfg.radio, visible: cfg.visible }); };
    const poner = (ai: number, cfg: Burbuja): void => {
      const z = zonas.get(ai);
      if (z) z.cfg = cfg; else zonas.set(ai, { cfg, dentro: new Map(), avisos: new Map() });
      publicar(ai, cfg);
    };
    const nombreDe = (e: number, otro: string): string => cortar(api.who(e)?.nombre || otro, NOMBRE_BYTES);

    api.onIdentify((entity, who) => { if (esIA(who.id) && !zonas.has(entity)) poner(entity, DEFECTO); });
    api.listen("roles", "iaBurbuja", (m) => {
      const entity = Number(m.quien);
      if (!esIA(api.who(entity)?.id)) return false; // only an AI has a bubble; a stray event for a person changes nothing
      poner(entity, leerBurbuja(m));
      return true;
    });

    const sale = (ai: number, z: Zona, p: number, o: Ocupante, avisar: boolean): void => {
      z.dentro.delete(p);
      api.emit("saleDeBurbuja", { ia: ai, quien: p, nombre: nombreDe(p, ""), esIA: o.esIA }, { to: ai });
      if (avisar && o.avisado && api.position(p)) api.emit("sales", { ia: ai, nombre: nombreDe(ai, "una IA") }, { to: p });
    };

    api.onLeave((e) => {
      const propia = zonas.get(e);
      if (propia) { // the AI went: tell the listeners everybody left, so nobody keeps a stale record
        for (const [p, o] of [...propia.dentro]) sale(e, propia, p, o, false);
        zonas.delete(e); api.state.delete(String(e));
      }
      for (const [ai, z] of zonas) {
        z.avisos.delete(e);
        const o = z.dentro.get(e);
        if (o) sale(ai, z, e, o, false);
      }
    });

    api.onTick((tick) => {
      if (zonas.size === 0 || tick % CADA_TICKS !== 0) return; // no AI = no work
      const n = ++barrido;
      const gente = api.players();
      if (gente.length > ids.length) { const c = Math.max(gente.length, ids.length * 2); ids = new Int32Array(c); xs = new Float64Array(c); ys = new Float64Array(c); zs = new Float64Array(c); }
      let m = 0;
      for (const e of gente) { const p = api.position(e); if (!p) continue; ids[m] = e; xs[m] = p.x; ys[m] = p.y; zs[m] = p.z; m++; }
      let cupo = EVENTOS_POR_BARRIDO;
      const pie: Punto = { x: 0, y: 0, z: 0 };
      for (const [ai, z] of zonas) {
        const a = api.position(ai);
        if (!a) continue;
        const { forma, radio } = z.cfg;
        for (let i = 0; i < m; i++) {
          const p = ids[i];
          if (p === ai) continue;
          if (Math.abs(xs[i] - a.x) > radio || Math.abs(zs[i] - a.z) > radio) continue; // outside the bounding square: no shape reaches it
          pie.x = xs[i]; pie.y = ys[i]; pie.z = zs[i];
          if (!dentro(forma, radio, a, pie)) continue;
          const o = z.dentro.get(p);
          if (o) { o.visto = n; continue; }
          if (cupo <= 0) continue; // over the valve: it waits for the next review
          cupo--;
          const ia = esIA(api.who(p)?.id);
          const rec: Ocupante = { visto: n, esIA: ia, avisado: false };
          z.dentro.set(p, rec);
          const dm = Math.min(65535, Math.round(Math.hypot(pie.x - a.x, pie.y - a.y, pie.z - a.z) * 10));
          api.emit("entraEnBurbuja", { ia: ai, quien: p, nombre: nombreDe(p, ""), distanciaDm: dm, esIA: ia }, { to: ai });
          if (!ia && tick - (z.avisos.get(p) ?? -Infinity) >= AVISO_RESPIRO_TICKS) {
            z.avisos.set(p, tick); rec.avisado = true;
            api.emit("entras", { ia: ai, nombre: nombreDe(ai, "una IA") }, { to: p });
          }
        }
        for (const [p, o] of z.dentro) if (o.visto !== n) { if (cupo <= 0) break; cupo--; sale(ai, z, p, o, true); }
      }
    });
  });

  return {
    part,
    /** Entities (people and AIs, ascending) inside this AI's bubble as of the last review (≤ 0.5 s old). [] if it has none or is no AI. */
    dentroDeBurbuja: (ai: number): number[] => [...(zonas.get(ai)?.dentro.keys() ?? [])].sort((a, b) => a - b),
    /** Is this entity inside this AI's bubble as of the last review? */
    estaEnBurbuja: (ai: number, quien: number): boolean => zonas.get(ai)?.dentro.has(quien) ?? false,
    /** The shape of this AI's bubble now, or null when the entity is no AI here. */
    burbujaDe: (ai: number): Burbuja | null => { const z = zonas.get(ai); return z ? { ...z.cfg } : null; },
  };
}

/** The server's instance, for the composition root (features/servidor.ts). `crearBurbuja()` again gives an independent one (tests). */
const unica = crearBurbuja();
export const dentroDeBurbuja = unica.dentroDeBurbuja, estaEnBurbuja = unica.estaEnBurbuja, burbujaDeIA = unica.burbujaDe;
export default unica.part;
