// dardos — server part (v2: duel). The server owns the turn (three darts), where every dart lands and what it scores. The
// page sends what the player chose (aim point on the face + throw strength); the server bends it: a throw weaker than
// FUERZA_IDEAL drops, a harder one climbs a little and scatters more, and a hand tremor whose direction comes from a
// hash of the tick the throw arrived on (and who threw, and which dart) moves it inside a small disc. No Math.random:
// the same throws on the same ticks land on the same spots (tests pin it). Scoring uses a real board's proportions.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { dardos, CERCA_M, DARDOS_TURNO, FUERZA_IDEAL, TURNO_INACTIVO_S, RONDAS_DEFECTO, RONDAS_MAX } from "./feature.ts";

export type Sitio = { id: string; nombre: string; x: number; z: number; y?: number; radio?: number; rumbo?: number;
  /** v2: the board takes a second player and plays a match; `remoto`: a player may join from a real wall far away; `rondas`: 1-5 (default 3). */
  duelo?: boolean; remoto?: boolean; rondas?: number };
export type Anillo = "dobleBull" | "bull" | "simple" | "triple" | "doble" | "fuera";
/** The server's tick rate (Hz). */
export const HZ = 20;
/** The default board of a world without its own dardos.json: south-west of the plaza, away from every other house
 * default — the pesca pond (18, -14), the "pilar dorado" landmark (18, 0), despertar's fountain (0, 12) and old tree
 * (-18, -10), and the example adventure's pnj/cosas (all within |x|, |z| <= ~14). Its face looks at the plaza. */
export const SITIOS_DEFECTO: Sitio[] = [{ id: "diana", nombre: "Diana de la plaza", x: -22, z: 20, y: 0, radio: 4.5 }];

/** Dartboard geometry (real board proportions: 451 mm board, double ring's outer edge = 170 mm = radius 1) and scoring.
 * packages/render/src/diana.ts paints with the same numbers (test/dardos.test.ts checks they agree). */
export const ANILLOS = {
  dobleBull: 0.0747,   // <= this: 50 points (6.35 mm / 170)
  bull:      0.187,    // <= this (and > dobleBull): 25 points (15.9 mm / 170)
  tripleIn:  0.582,
  tripleOut: 0.629,    // between these two: sector x 3
  dobleIn:   0.953,
  dobleOut:  1.0,      // between these two: sector x 2; past 1.0: out (0 points)
} as const;
export const SECTORES = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const; // clockwise from the top, 18° each
export function sectorDe(grados: number): number {
  const i = Math.floor((((grados + 9) % 360 + 360) % 360) / 18);
  return SECTORES[i];
}
export function resolverTiro(angulo: number, radio: number): { sector: number; anillo: Anillo; multiplicador: number; puntos: number } {
  const sector = sectorDe(angulo);
  if (radio <= ANILLOS.dobleBull) return { sector: 0, anillo: "dobleBull", multiplicador: 1, puntos: 50 };
  if (radio <= ANILLOS.bull) return { sector: 0, anillo: "bull", multiplicador: 1, puntos: 25 };
  if (radio > ANILLOS.dobleOut) return { sector, anillo: "fuera", multiplicador: 0, puntos: 0 };
  if (radio >= ANILLOS.dobleIn) return { sector, anillo: "doble", multiplicador: 2, puntos: sector * 2 };
  if (radio >= ANILLOS.tripleIn && radio <= ANILLOS.tripleOut) return { sector, anillo: "triple", multiplicador: 3, puntos: sector * 3 };
  return { sector, anillo: "simple", multiplicador: 1, puntos: sector };
}
/** A point of the face (x right, y up, in radii) → the scorer's polar form (degrees from the top, clockwise; radius). */
export function polar(x: number, y: number): { angulo: number; radio: number } {
  const a = (Math.atan2(x, y) * 180) / Math.PI;
  return { angulo: (a + 360) % 360, radio: Math.hypot(x, y) };
}
/** What a person reads when the dart lands («Triple 20 · 60», «¡Diana! · 50», «Fuera»). */
export function textoDe(r: { sector: number; anillo: Anillo; puntos: number }): string {
  switch (r.anillo) {
    case "dobleBull": return "¡Diana! · 50";
    case "bull": return "Bull · 25";
    case "triple": return `Triple ${r.sector} · ${r.puntos}`;
    case "doble": return `Doble ${r.sector} · ${r.puntos}`;
    case "simple": return `${r.sector} · ${r.puntos}`;
    default: return "Fuera";
  }
}

/** The hand tremor's radius (board radii) on a perfect throw: aiming at the bull's eye with FUERZA_IDEAL lands inside the
 * double bull about a quarter of the time ((0.0747 / 0.15)²), inside the bull nearly always. */
export const TEMBLOR = 0.15;
/** How far a throw drops per unit of strength under FUERZA_IDEAL, and climbs per unit over it (radii). */
export const CAIDA = 1.6, SUBIDA = 0.6;
/** Extra scatter per unit of strength over / under FUERZA_IDEAL (radii). */
export const ABRE_FUERTE = 0.5, ABRE_FLOJO = 0.15;
/** Two numbers in [0, 1) from integers, no state (a 32-bit integer hash; the same inputs always give the same pair). */
export function azarDe(...n: number[]): [number, number] {
  let h = 0x9e3779b9;
  for (const v of n) { h = Math.imul(h ^ (v | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  const a = (h >>> 0) / 4294967296;
  let g = Math.imul(h ^ 0x27d4eb2f, 0x165667b1); g ^= g >>> 15; g = Math.imul(g, 0x85ebca6b); g ^= g >>> 13;
  return [a, (g >>> 0) / 4294967296];
}
/** Where a dart aimed at (x, y) with strength `fuerza` lands; `u` = the tremor's two numbers (azarDe). Pure. */
export function aterrizaje(x: number, y: number, fuerza: number, u: [number, number]): { x: number; y: number } {
  const d = Math.max(0, Math.min(1, fuerza)) - FUERZA_IDEAL;
  const vertical = d < 0 ? d * CAIDA : d * SUBIDA;
  const abre = TEMBLOR + Math.max(0, d) * ABRE_FUERTE + Math.max(0, -d) * ABRE_FLOJO;
  const ang = u[0] * Math.PI * 2, mag = abre * Math.sqrt(u[1]); // uniform over the disc
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r3(Math.max(-3, Math.min(3, x + Math.cos(ang) * mag))), y: r3(Math.max(-3, Math.min(3, y + vertical + Math.sin(ang) * mag))) };
}
/** A board without its own rumbo faces the plaza's centre (the origin), so you throw from the square. Degrees. */
export const rumboHaciaElCentro = (x: number, z: number): number => (Math.hypot(x, z) < 1 ? 0 : Math.round((Math.atan2(-x, -z) * 180) / Math.PI * 10) / 10);

type Tirada = { sitio: string; dardos: number; puntos: number; ultimo: number; remoto: boolean };
type Marcador = { dardos: number; puntos: number; mejorDardo: number; mejorTirada: number; dianas: number };
/** A duel in progress (or waiting for its rival) on one board. jug[0] = host, jug[1] = guest (-1 until they join; entity 0 is a real player). */
type Partida = { sitio: string; jug: [number, number]; estado: "espera" | "juego"; turnos: number; puntos: [number, number]; ultimo: number; rondas: number };
const hashTexto = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i) | 0; return h; };
/** A person's name for a field declared `text`: control characters out, spaces collapsed, cut to `max` UTF-8 bytes. */
export function limpiarNombre(s: string, max = 40): string {
  const t = String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, " ").replace(/\s+/g, " ").trim();
  let out = "", bytes = 0;
  for (const ch of t) { const b = Buffer.byteLength(ch); if (bytes + b > max) break; out += ch; bytes += b; }
  return out;
}
/** Rounds of a board's duel: an integer in 1..RONDAS_MAX, RONDAS_DEFECTO when missing or not a number. */
export const rondasDe = (v: unknown): number => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.max(1, Math.min(RONDAS_MAX, Math.round(Number(v)))) : RONDAS_DEFECTO);

export const crearDardos = (opts: { sitios?: Sitio[] } = {}) => serverPart(dardos, (api: ServerApi) => {
  const tiradas = new Map<number, Tirada>();
  const sitios = new Map<string, Sitio>();
  const partidas = new Map<string, Partida>(); // board → its duel
  const enPartida = new Map<number, string>(); // player → the board of their duel

  // the boards: a world's dardos.json or the house default; one state entry each (a thing of the world, with a card)
  const lista = (opts.sitios ?? SITIOS_DEFECTO).filter((s) => /^[a-z0-9-]{1,16}$/.test(String(s.id)) && Number.isFinite(s.x) && Number.isFinite(s.z));
  for (const s of lista) {
    const rumbo = Number.isFinite(s.rumbo) ? Math.max(-180, Math.min(180, Number(s.rumbo))) : rumboHaciaElCentro(s.x, s.z);
    const v: Msg = { nombre: String(s.nombre || "Diana de dardos").slice(0, 60), x: s.x, y: s.y ?? 0, z: s.z, radio: s.radio ?? 3.5, rumbo, ocupado: false, duelo: s.duelo === true, remoto: s.remoto === true, rondas: rondasDe(s.rondas), espera: false, jugadores: 0 };
    if (api.state.set(s.id, v, { at: { x: s.x, z: s.z } })) sitios.set(s.id, s); else api.log(`dardos: la diana «${s.id}» no cabe en el esquema y no se pone`);
  }
  api.log(`dardos: ${sitios.size} diana(s)`);

  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: e }); };
  const poner = (id: string, cambio: Msg) => { const v = api.state.get(id); const s = sitios.get(id); if (v && s) api.state.set(id, { ...v, ...cambio }, { at: { x: s.x, z: s.z } }); };
  const ocupar = (id: string, si: boolean) => poner(id, { ocupado: si });
  /** Send an event to whoever is near the board and, directly, to each of `quienes` that is farther than CERCA_M
   * (a thrower on a real wall far away, the rival of a duel): nobody gets it twice. */
  const difundir = (ev: string, msg: Msg, s: Sitio, quienes: number[] = []): void => {
    api.emit(ev, msg, { near: { x: s.x, z: s.z }, radius: CERCA_M });
    for (const q of quienes) { const p = api.position(q); if (p && Math.hypot(p.x - s.x, p.z - s.z) > CERCA_M) api.emit(ev, msg, { to: q }); }
  };
  const jugadoresDe = (P: Partida): number[] => P.jug.filter((q) => q >= 0);
  const leerMarcador = (e: number): Marcador => {
    const w = api.who(e);
    const d = w ? (api.store.get(`d:${w.id}`) as Partial<Marcador> | undefined) : undefined;
    return { dardos: d?.dardos ?? 0, puntos: d?.puntos ?? 0, mejorDardo: d?.mejorDardo ?? 0, mejorTirada: d?.mejorTirada ?? 0, dianas: d?.dianas ?? 0 };
  };
  const marcador = (e: number) => { api.emit("marcador", leerMarcador(e), { to: e }); };
  const guardar = (e: number, f: (m: Marcador) => void): void => { const w = api.who(e); if (!w) return; const m = leerMarcador(e); f(m); api.store.set(`d:${w.id}`, m); };
  /** Close e's turn: the turn's best is kept, `fin` goes out. A single-player turn frees the board; a duel turn does not
   * (the match goes on) and its `fin` also reaches both players wherever they are. */
  const terminar = (e: number): void => {
    const t = tiradas.get(e); if (!t) return;
    tiradas.delete(e);
    const P = enPartida.has(e) ? partidas.get(t.sitio) : undefined;
    if (!P) ocupar(t.sitio, false);
    guardar(e, (m) => { m.mejorTirada = Math.max(m.mejorTirada, t.puntos); });
    const s = sitios.get(t.sitio)!;
    const fin = { quien: e, sitio: t.sitio, dardos: t.dardos, puntos: t.puntos };
    difundir("fin", fin, s, P ? jugadoresDe(P) : [e]); // the thrower who walked out of CERCA_M still hears how the turn ended
    marcador(e);
  };
  const nombreDe = (e: number): string => (e >= 0 ? limpiarNombre(api.who(e)?.nombre ?? "") : "");
  const pares = (P: Partida) => ({ a: P.jug[0], nombreA: nombreDe(P.jug[0]), puntosA: P.puntos[0], b: Math.max(0, P.jug[1]), nombreB: nombreDe(P.jug[1]), puntosB: P.puntos[1] });
  const turnoDeP = (P: Partida): number => (P.estado === "juego" ? P.jug[P.turnos % 2] : -1);
  const emitirDuelo = (P: Partida): void => {
    const s = sitios.get(P.sitio)!;
    difundir("duelo", { sitio: P.sitio, ronda: P.estado === "juego" ? Math.floor(P.turnos / 2) + 1 : 0, turnoDe: Math.max(0, turnoDeP(P)), ...pares(P) }, s, jugadoresDe(P));
  };
  /** Hand the dice to the next player: a fresh turn of three darts for them. */
  const empezarTurnoDuelo = (P: Partida): void => {
    const e = turnoDeP(P), tick = api.tick();
    P.ultimo = tick;
    tiradas.set(e, { sitio: P.sitio, dardos: 0, puntos: 0, ultimo: tick, remoto: true });
    api.emit("turno", { sitio: P.sitio }, { to: e });
    emitirDuelo(P);
  };
  /** Free the board and forget the duel. */
  const soltarPartida = (P: Partida): void => {
    for (const q of jugadoresDe(P)) { enPartida.delete(q); tiradas.delete(q); }
    partidas.delete(P.sitio);
    poner(P.sitio, { ocupado: false, espera: false, jugadores: 0 });
  };
  const terminarDuelo = (P: Partida, abandono: boolean, ganadorPorDefecto = -1): void => {
    const s = sitios.get(P.sitio)!;
    const [pa, pb] = P.puntos;
    const empate = !abandono && pa === pb;
    const ganador = abandono ? ganadorPorDefecto : empate ? -1 : pa > pb ? P.jug[0] : P.jug[1]; // -1 = nobody (entity 0 is a player)
    const datos = pares(P), jugs = jugadoresDe(P);
    const texto = limpiarNombre(empate ? `Empate ${pa}-${pb}` : abandono ? `${nombreDe(ganador)} gana: su rival se fue` : `Gana ${nombreDe(ganador)} ${Math.max(pa, pb)}-${Math.min(pa, pb)}`, 120);
    soltarPartida(P);
    difundir("finduelo", { sitio: P.sitio, ganador: Math.max(0, ganador), empate, abandono, ...datos, texto }, s, jugs);
  };
  /** e leaves a duel (salir, walked off, disconnected, idle). Waiting alone = the wait is cancelled; mid-match = the rival wins. */
  const dejarDuelo = (e: number): void => {
    const id = enPartida.get(e); const P = id ? partidas.get(id) : undefined; if (!P) { enPartida.delete(e); return; }
    if (P.estado === "espera") {
      const s = sitios.get(P.sitio)!; soltarPartida(P);
      difundir("fin", { quien: e, sitio: P.sitio, dardos: 0, puntos: 0 }, s, [e]);
      return;
    }
    if (tiradas.has(e)) terminar(e); // what the leaver threw this turn still counts for their scoreboard
    const otro = P.jug[0] === e ? P.jug[1] : P.jug[0];
    terminarDuelo(P, true, otro);
  };
  /** Join (or open) the duel of board `id`; the reason why not otherwise. */
  const unirse = (e: number, id: string, remoto: boolean): string | null => {
    const s = sitios.get(id)!;
    if (enPartida.get(e) === id) return null; // already in: nothing to do
    if (enPartida.has(e) || tiradas.has(e)) return "Ya estás tirando en otra diana: termina esa tirada antes.";
    if (!remoto && !api.within(e, id)) return `Acércate a la línea de tiro de ${s.nombre}.`;
    const P = partidas.get(id);
    if (!P) {
      const nueva: Partida = { sitio: id, jug: [e, -1], estado: "espera", turnos: 0, puntos: [0, 0], ultimo: api.tick(), rondas: rondasDe(s.rondas) };
      partidas.set(id, nueva); enPartida.set(e, id);
      poner(id, { espera: true, jugadores: 1 });
      emitirDuelo(nueva);
      return null;
    }
    if (P.estado !== "espera") return "Ya hay un duelo en marcha en esta diana.";
    P.jug[1] = e; P.estado = "juego"; enPartida.set(e, id);
    poner(id, { espera: false, jugadores: 2, ocupado: true });
    empezarTurnoDuelo(P);
    return null;
  };
  /** Start (or confirm) e's single-player turn at `id`; the reason why not otherwise. */
  const empezar = (e: number, id: string, remoto = false): Tirada | string => {
    const s = sitios.get(id);
    if (!s) return `No hay ninguna diana de dardos «${id}».`;
    const t = tiradas.get(e);
    if (t) return t.sitio === id ? t : "Ya estás tirando en otra diana: termina esa tirada antes.";
    if (enPartida.has(e)) return "Ya estás en un duelo: termínalo o sal antes.";
    if (s.duelo) return "Esta diana es de duelo: pulsa jugar y espera a tu rival.";
    if (!remoto && !api.within(e, id)) return `Acércate a la línea de tiro de ${s.nombre}.`;
    if (api.state.get(id)?.ocupado) return "Ahí ya tira alguien: espera a que termine su tirada.";
    const nueva: Tirada = { sitio: id, dardos: 0, puntos: 0, ultimo: api.tick(), remoto };
    tiradas.set(e, nueva);
    ocupar(id, true);
    api.emit("turno", { sitio: id }, { to: e });
    return nueva;
  };

  api.onIdentify((e) => marcador(e));
  api.onLeave((e) => { if (enPartida.has(e)) dejarDuelo(e); else terminar(e); });

  api.on("jugar", (e, m) => {
    const id = String(m.sitio), s = sitios.get(id), pared = m.desde === "pared";
    if (s && pared && !s.remoto) return rechazar(e, `${s.nombre} no admite jugar desde una pared: hay que estar en su línea de tiro.`);
    if (s?.duelo) { const r = unirse(e, id, pared); if (r) rechazar(e, r); return; }
    const t = empezar(e, id, pared); if (typeof t === "string") rechazar(e, t);
  });

  // a `lanzar` without a turn starts one (an agent or a page can simply throw); in a duel only on your turn
  api.on("lanzar", (e, m) => {
    const id = String(m.sitio);
    const idDuelo = enPartida.get(e);
    if (idDuelo) {
      const P = partidas.get(idDuelo)!;
      if (id !== idDuelo) return rechazar(e, "Ya estás en un duelo en otra diana: termínalo o sal antes.");
      if (P.estado === "espera") return rechazar(e, "Espera a tu rival: el duelo empieza cuando llegue.");
      if (turnoDeP(P) !== e) return rechazar(e, "No es tu turno.");
    }
    const t = tiradas.get(e) ?? empezar(e, id);
    if (typeof t === "string") return rechazar(e, t);
    const s = sitios.get(id)!;
    const tick = api.tick();
    const n = t.dardos + 1;
    const cae = aterrizaje(Number(m.x) || 0, Number(m.y) || 0, Number(m.fuerza) || 0, azarDe(tick, e, n, hashTexto(id)));
    const p = polar(cae.x, cae.y);
    const r = resolverTiro(p.angulo, p.radio);
    t.dardos = n; t.puntos += r.puntos; t.ultimo = tick;
    guardar(e, (mm) => { mm.dardos++; mm.puntos += r.puntos; mm.mejorDardo = Math.max(mm.mejorDardo, r.puntos); if (r.anillo === "dobleBull") mm.dianas++; });
    const P = idDuelo ? partidas.get(idDuelo) : undefined;
    if (P) { P.puntos[P.jug[0] === e ? 0 : 1] += r.puntos; P.ultimo = tick; }
    // the thrower always hears their own dart (a remote one is far from the board), and in a duel so does the rival
    difundir("dardo", { quien: e, sitio: id, numero: n, x: cae.x, y: cae.y, sector: r.sector, anillo: r.anillo, multiplicador: r.multiplicador, puntos: r.puntos, tirada: t.puntos, texto: textoDe(r) }, s, P ? jugadoresDe(P) : [e]);
    if (n >= DARDOS_TURNO) terminar(e);
    if (!P) return;
    if (n < DARDOS_TURNO) return emitirDuelo(P);
    P.turnos++;
    if (P.turnos >= 2 * P.rondas) terminarDuelo(P, false); else empezarTurnoDuelo(P);
  });

  api.on("salir", (e) => {
    if (enPartida.has(e)) return dejarDuelo(e);
    if (!tiradas.has(e)) return rechazar(e, "No estás tirando.");
    terminar(e);
  });

  api.onTick((tick) => {
    if (tick % 10 !== 0) return;
    for (const [e, t] of tiradas) {
      if (enPartida.has(e)) continue; // a duel turn is judged below
      if ((!t.remoto && !api.within(e, t.sitio)) || tick - t.ultimo > TURNO_INACTIVO_S * HZ) terminar(e); // walked away, or a minute idle
    }
    for (const P of [...partidas.values()]) {
      if (tick - P.ultimo <= TURNO_INACTIVO_S * HZ) continue;
      dejarDuelo(P.estado === "espera" ? P.jug[0] : turnoDeP(P)); // a host nobody joined, or the player who let the clock run
    }
  });
});

export default crearDardos();
