// dardos — client part (v2). Keeps THIS player's turn as the server tells it (which board, darts thrown, the turn's
// points, the last dart) and, for every board near you, the darts stuck in it right now (anyone's: they stay until that
// turn ends), plus your scoreboard and, in a duel board, the match (`duelo()`: whose turn, both scores, how it ended). One small controller for the page (apps/plaza/dardos.ts: the throwing view on a
// flat screen, the board on your wall in AR) and for agents. It only asks: the server decides where each dart lands.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { dardos as decl, DARDOS_TURNO, FUERZA_IDEAL } from "./feature.ts";
import type { Via } from "./feature.ts";

export { DARDOS_TURNO, FUERZA_IDEAL };
export type { Via };
export type Anillo = "dobleBull" | "bull" | "simple" | "triple" | "doble" | "fuera";
export type Dardo = { quien: number; sitio: string; numero: number; x: number; y: number; sector: number; anillo: Anillo; puntos: number; tirada: number; texto: string; cuando: number };
export type Sitio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; rumbo: number; ocupado: boolean;
  /** v2 (duel): optional, read from the shared state; a board without them is a v1 board. */
  duelo?: boolean; remoto?: boolean; rondas?: number; espera?: boolean; jugadores?: number;
  /** v3: teams the board takes (2-4). */ equipos?: number };
export type Estado = {
  sitio: string;              // the board of my turn ("" = not throwing)
  dardos: number;             // darts thrown in this turn (0-3)
  tirada: number;             // the turn's points so far
  ultimo: Dardo | null;       // my last dart (stays after the turn ends, for the result line)
  fin: { dardos: number; puntos: number; cuando: number } | null; // how my last turn ended
  aviso: string;              // the last rejection
  marcador: { dardos: number; puntos: number; mejorDardo: number; mejorTirada: number; dianas: number };
};
/** `pared`: this player joined from a real wall (AR) instead of the board's throwing line. */
export type Jugador = { entity: number; nombre: string; puntos: number; pared?: boolean;
  /** v3: this team is me / left the match. */ yo?: boolean; fuera?: boolean };
export type FinDuelo = { ganador: number | null; empate: boolean; abandono: boolean; texto: string; gane: boolean; cuando: number };
/** The match as this page sees it. Wire entity 0 is a real player: read `empate` / `ronda`, never `ganador === 0`. */
export type Duelo = {
  sitio: string;
  ronda: number;              // 1-based; 0 = waiting for a rival (`esperando`)
  esperando: boolean;
  turnoDe: number | null;     // entity whose turn it is (null while waiting or after the end)
  yo: boolean;                // my entity is one of the two players (false = a bystander near the board)
  miTurno: boolean;           // true only for the player whose turn it is
  rival: Jugador | null;      // the other player when `yo` (null while waiting, or for a bystander)
  yoPuntos: number;           // my points when `yo`, else 0
  a: Jugador; b: Jugador | null; // host and guest as the server names them (always set; for bystanders too)
  fin: FinDuelo | null;       // how the match ended (kept DUELO_FIN_MS, then `duelo()` is null again)
  /** v3: the teams that are seated, in order A..D (1 to 4; the same people as a, b), with `yo` marking mine. */
  equipos: Jugador[];
  maxEquipos: number;         // teams the board takes
  turnoEq: number;            // 1-based team on turn (0 = nobody)
  retirando: boolean;         // the visit is over: «retira los dardos», waiting for «cambiar» (RETIRANDO_S at most)
  anfitrion: boolean;         // I am the host (team A)
  puedeEmpezar: boolean;      // I am the host, waiting, and at least 2 teams are seated: `empezar()` is allowed
  puedeCambiar: boolean;      // it is my turn in a live match: `cambiar()` is allowed
};
export type Que = "estado" | "sitios" | "clavados" | "duelo";
/** After `finduelo`: how long (ms) the result stays in `duelo()` and the darts stay in the board before they come out. */
export const DUELO_FIN_MS = 30000, DUELO_DARDOS_MS = 6000;
type DatosDuelo = { sitio: string; ronda: number; turnoDe: number; a: Jugador; b: Jugador | null; fin: FinDuelo | null; equipos: Jugador[]; max: number; turnoEq: number; retirando: boolean };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función dardos no está en este servidor" };
const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const r3 = (v: number) => Math.round(v * 1000) / 1000; // Q16.16 on the wire: 0.12 arrives as 0.11999…

/** One per page (tests make one per client). `dardos` is what the page and an agent call; `espia` sees every event (tests). */
export function crearCliente(espia?: (event: string, msg: Msg) => void) {
  let A: ClientApi | null = null;
  const e: Estado = { sitio: "", dardos: 0, tirada: 0, ultimo: null, fin: null, aviso: "", marcador: { dardos: 0, puntos: 0, mejorDardo: 0, mejorTirada: 0, dianas: 0 } };
  const clavados = new Map<number, Dardo[]>(); // thrower → their darts in the board now
  const oyentes = new Set<(que: Que) => void>();
  const avisar = (que: Que) => { for (const fn of oyentes) fn(que); };
  let quitar: ReturnType<typeof setTimeout> | null = null;
  let D: DatosDuelo | null = null; // the match I know about (mine or one near me), kept from `duelo` / `finduelo`
  let quitarDuelo: ReturnType<typeof setTimeout> | null = null, olvidarDuelo: ReturnType<typeof setTimeout> | null = null;
  const enJuego = (sitio?: string): boolean => !!D && !D.fin && (sitio === undefined || D.sitio === sitio);
  const soyDe = (d: DatosDuelo): boolean => !!A && d.equipos.some((j) => j.entity === A!.self() && !j.fuera);
  const tomar = (m: Msg, ronda: number, fin: FinDuelo | null): DatosDuelo => {
    const L = ["A", "B", "C", "D"] as const;
    const plazas = m.plazas !== undefined ? Number(m.plazas) : ronda > 0 || fin ? 2 : 1; // a server of schema v2 has no `plazas`
    const yo = A ? A.self() : -1;
    const equipos: Jugador[] = L.slice(0, plazas).map((l) => { const entity = Number(m[l.toLowerCase()]); return { entity, nombre: String(m[`nombre${l}`] ?? ""), puntos: Number(m[`puntos${l}`] ?? 0), pared: m[`pared${l}`] === true, yo: entity === yo, fuera: m[`fuera${l}`] === true }; });
    return {
      sitio: String(m.sitio), ronda, turnoDe: Number(m.turnoDe ?? 0), a: equipos[0], b: equipos[1] ?? null, fin, equipos,
      max: Number(m.equipos ?? 2), turnoEq: Number(m.turnoEq ?? 0), retirando: m.retirando === true,
    };
  };

  const dardos = {
    /** The match on a board near me (or mine), or null. Same object shape for a player and for a bystander (`yo` tells). */
    duelo: (): Duelo | null => {
      if (!A || !D) return null;
      // a bystander who walked out of the board's reach forgets it; a player on a far wall (outside the state's reach) keeps it
      if (!soyDe(D) && !D.fin && !dardos.sitios().some((s) => s.id === D!.sitio)) return null;
      const yo = soyDe(D), me = A.self(), vivo = !D.fin && D.ronda > 0;
      const mio = yo ? D.equipos.find((j) => j.entity === me) ?? null : null, otro = yo && D.equipos.length === 2 ? D.equipos.find((j) => j.entity !== me) ?? null : null;
      const esperando = !D.fin && D.ronda === 0, anfitrion = yo && D.a.entity === me;
      return {
        sitio: D.sitio, ronda: D.ronda, esperando, turnoDe: vivo ? D.turnoDe : null,
        yo, miTurno: yo && vivo && D.turnoDe === me, rival: otro ? { ...otro } : null, yoPuntos: mio?.puntos ?? 0,
        a: { ...D.a }, b: D.b ? { ...D.b } : null, fin: D.fin ? { ...D.fin } : null,
        equipos: D.equipos.map((j) => ({ ...j })), maxEquipos: D.max, turnoEq: vivo ? D.turnoEq : 0, retirando: vivo && D.retirando, anfitrion,
        puedeEmpezar: esperando && anfitrion && D.equipos.length >= 2, puedeCambiar: yo && vivo && D.turnoDe === me,
      };
    },
    estado: (): Readonly<Estado> => e,
    /** True while this page has a turn going. */
    tirando: (): boolean => e.sitio !== "",
    /** The boards this page knows (state entries within reach of the area of interest). */
    sitios: (): Sitio[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Sitio) : []),
    /** The darts stuck in boards near you right now (yours included), oldest first. */
    clavados: (sitio?: string): Dardo[] => [...clavados.values()].flat().filter((d) => !sitio || d.sitio === sitio),
    /** J4: offer the «E: tirar dardos» prompt only while this page is not throwing already. */
    ofrece: (feature: string, _key: string): boolean => feature !== "dardos" || (e.sitio === "" && !(D && !D.fin && soyDe(D))),
    /** `desde: "pared"` joins a `remoto` board from a real wall far from it (the server refuses it elsewhere). */
    jugar: (sitio?: string, desde?: "sitio" | "pared"): Res => {
      if (!A) return SIN;
      const id = sitio ?? dardos.sitios().find((s) => !s.ocupado)?.id;
      if (!id) return { ok: false, why: "no hay ninguna diana cerca" };
      return A.send("jugar", desde === "pared" ? { sitio: id, desde } : { sitio: id });
    },
    /** Throw: aim (x, y) on the face in board radii, strength 0-1. Without a turn the server starts one. v4: `via` = how it was
     *  thrown (raton, teclado, tactil, vr, ar); it sets the width of the straight-strength window (ZONA_FUERZA). Missing = raton. */
    lanzar: (x: number, y: number, fuerza: number, sitio?: string, via?: Via): Res => {
      if (!A) return SIN;
      const id = sitio ?? (e.sitio || dardos.sitios()[0]?.id);
      if (!id) return { ok: false, why: "no hay ninguna diana cerca" };
      const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
      return A.send("lanzar", { sitio: id, x: r3(c(x, -3, 3)), y: r3(c(y, -3, 3)), fuerza: r3(c(fuerza, 0, 1)), ...(via ? { via } : {}) });
    },
    // in a live match you can leave on the rival's turn too (the server hands them the win)
    salir: (): Res => (A ? (e.sitio || (D && !D.fin && soyDe(D)) ? A.send("salir", {}) : { ok: false, why: "no estás tirando" }) : SIN),
    /** v3: hand the dice over (my turn only): the first press opens «retirando», the next one changes the turn. */
    cambiar: (): Res => (A ? (D && !D.fin && soyDe(D) ? A.send("cambiar", { sitio: D.sitio }) : { ok: false, why: "no estás en un duelo" }) : SIN),
    /** v3: the host starts the match (at least 2 teams seated). */
    empezar: (): Res => (A ? (D && !D.fin && soyDe(D) ? A.send("empezar", { sitio: D.sitio }) : { ok: false, why: "no estás en un duelo" }) : SIN),
    alCambiar: (fn: (que: Que) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (raw) => {
    const api: ClientApi = espia ? { ...raw, on: (ev, fn) => raw.on(ev, (m) => { espia(ev, m); fn(m); }) } : raw;
    A = api;
    api.state.onChange(() => avisar("sitios"));
    api.on("turno", (m) => {
      if (quitar) { clearTimeout(quitar); quitar = null; }
      e.sitio = String(m.sitio); e.dardos = 0; e.tirada = 0; e.fin = null; e.aviso = "";
      clavados.delete(api.self()); // a new turn: my old darts come out of the board
      avisar("estado"); avisar("clavados");
    });
    api.on("dardo", (m) => {
      const d: Dardo = { quien: Number(m.quien), sitio: String(m.sitio), numero: Number(m.numero), x: r3(Number(m.x)), y: r3(Number(m.y)), sector: Number(m.sector), anillo: m.anillo as Anillo, puntos: Number(m.puntos), tirada: Number(m.tirada), texto: String(m.texto), cuando: ahora() };
      const l = d.numero === 1 ? [] : (clavados.get(d.quien) ?? []);
      l.push(d); clavados.set(d.quien, l);
      if (d.quien === api.self()) { e.dardos = d.numero; e.tirada = d.tirada; e.ultimo = d; if (d.puntos >= 50) api.view.bounce(api.self(), 900); }
      avisar("clavados"); if (d.quien === api.self()) avisar("estado");
    });
    api.on("fin", (m) => {
      const quien = Number(m.quien);
      if (quien === api.self()) {
        e.sitio = ""; e.fin = { dardos: Number(m.dardos), puntos: Number(m.puntos), cuando: ahora() };
        const duelando = enJuego(String(m.sitio));
        if (!duelando) { // in a match my darts stay until my next turn (or the match's end)
          // my darts stay in the board a few seconds so I can look at them, then come out (another turn takes them at once)
          if (quitar) clearTimeout(quitar);
          quitar = setTimeout(() => { quitar = null; if (!e.sitio) { clavados.delete(quien); avisar("clavados"); } }, 6000);
          (quitar as { unref?: () => void }).unref?.();
        }
        if (D && !D.fin && D.ronda === 0 && D.sitio === String(m.sitio)) { D = null; avisar("duelo"); } // a host nobody joined gave up
        avisar("estado");
      } else if (D && !D.fin && D.ronda === 0 && D.sitio === String(m.sitio) && D.a.entity === quien) { D = null; avisar("duelo"); } // a bystander: the host nobody joined gave up (the sign must not wait forever)
      else if (!enJuego(String(m.sitio))) { clavados.delete(quien); avisar("clavados"); } // in a match the rival's darts stay till their next turn
    });
    api.on("marcador", (m) => { e.marcador = { dardos: Number(m.dardos), puntos: Number(m.puntos), mejorDardo: Number(m.mejorDardo), mejorTirada: Number(m.mejorTirada), dianas: Number(m.dianas) }; avisar("estado"); });
    api.on("duelo", (m) => {
      const ronda = Number(m.ronda), sitio = String(m.sitio);
      if ((!D || D.fin || D.sitio !== sitio) && ronda <= 1) { // a new match here: the old one's darts and result are gone
        if (quitarDuelo) { clearTimeout(quitarDuelo); quitarDuelo = null; }
        for (const [q, l] of clavados) { const k = l.filter((d) => d.sitio !== sitio); if (k.length) clavados.set(q, k); else clavados.delete(q); }
        avisar("clavados");
      }
      if (olvidarDuelo) { clearTimeout(olvidarDuelo); olvidarDuelo = null; }
      const antes = D;
      D = tomar(m, ronda, null);
      if (antes && !antes.fin && antes.sitio === sitio && antes.retirando && !D.retirando && antes.turnoDe !== D.turnoDe) { // «cambiar»: the darts of that visit come out of the board
        const l = (clavados.get(antes.turnoDe) ?? []).filter((d) => d.sitio !== sitio); if (l.length) clavados.set(antes.turnoDe, l); else clavados.delete(antes.turnoDe); avisar("clavados");
      }
      avisar("duelo");
    });
    api.on("finduelo", (m) => {
      const sitio = String(m.sitio), empate = m.empate === true, ganador = empate ? null : Number(m.ganador);
      const antes: DatosDuelo = tomar(m, 1, null); // both players are set at the end: build them as if mid-match
      const yo = soyDe(antes);
      D = { ...antes, ronda: D && D.sitio === sitio ? D.ronda : antes.ronda, turnoDe: 0, fin: { ganador, empate, abandono: m.abandono === true, texto: String(m.texto), gane: yo && ganador === api.self(), cuando: ahora() } };
      if (quitarDuelo) clearTimeout(quitarDuelo);
      quitarDuelo = setTimeout(() => { quitarDuelo = null; for (const [q, l] of clavados) { const k = l.filter((d) => d.sitio !== sitio); if (k.length) clavados.set(q, k); else clavados.delete(q); } avisar("clavados"); }, DUELO_DARDOS_MS);
      (quitarDuelo as { unref?: () => void }).unref?.();
      if (olvidarDuelo) clearTimeout(olvidarDuelo);
      olvidarDuelo = setTimeout(() => { olvidarDuelo = null; if (D?.fin) { D = null; avisar("duelo"); } }, DUELO_FIN_MS);
      (olvidarDuelo as { unref?: () => void }).unref?.(); // a timer must not keep a headless process alive
      avisar("duelo"); avisar("estado");
    });
    api.on("rechazado", (m) => { e.aviso = String(m.motivo); avisar("estado"); });
  });

  return { parts: [parte], dardos };
}

const pagina = crearCliente();
export const dardos = pagina.dardos;
export default pagina.parts[0];
