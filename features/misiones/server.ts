// misiones — server part (J5 + the J4 core). People (pnj) and quest things (misiones) come from the adventure's files
// and are put in the world with `at` (only near players get them, J9). Dialogue and quest progress are decided here:
// distances (api.within), step conditions and positions (api.position) are checked by this file, so a page can never
// complete a step by asking. Progress is kept per guest (I1) in the store (S4) and reaches only its owner.
import { adoptarClaves, alAlcanceEnAltura, INTERACT_SLACK_M, serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi, ServerPart } from "../../packages/feature/src/index.ts";
import { pnj as pnjDecl, misiones as misionesDecl } from "./feature.ts";
import { ACCIONES_PAGINA, cargarAventura, corta, LIM } from "./formato.ts";
import type { Accion, Aventura, Cosa, Dialogo, Fichero, Mision, Nodo, Opcion, Paso, Pnj } from "./formato.ts";
import { leerCatalogo } from "../inventario/objeto.ts"; // Y3: the objeto@1 a `coge` step may hand over
import type { ObjetoAventura } from "../inventario/objeto.ts";
import { abandonar, aceptar, asentar, bloqueados, callan, cogePendiente, cuentaDe, desmarcar, enTexto, esperaLlegada, HECHAS_MAX, leerProgreso, marcablesAhora, marcados as marcadosDe, marcar, marcas, lugarDe, nodoInicial, nuevoProgreso, objetivo, opcionesDe, pasoHecho, primerPendiente, registrar, seguir } from "./maquina.ts";
import type { Hecho, Progreso } from "./maquina.ts";
import { esperando, faltaEspera, pendiente, proximaEspera } from "./maquina.ts"; // U14 (5): steps that wait
import type { Suceso } from "./maquina.ts";
import { alSuelo, eventosDe } from "./secuencia.ts"; // U14 (5): a moment only its player sees
import { sueloDe } from "../objetos/server.ts"; // the ground people and things stand on (the espacio base, the nature, or flat)
import { claveConcesion, concesion } from "./concesion.ts"; // U14 (6): the reward granted, recorded once

/** Ticks between two «has it arrived?» checks of one player (4 = 0.2 s). Only players on a llega_a step are checked. */
export const LLEGADA_CADA = 4;
/** A conversation ends when the player walks this many metres beyond the person's radius. */
export const ALEJARSE_M = 4;
/** P3: the same notice of a step's `antes` is sent to a player at most once in this many ms. */
export const ANTES_CADA_MS = 5000;
/** P3: who can hold a conversation — a person, or a quest thing that carries a `dialogo` (inspecting it opens the same panel).
 * P4: or a `marcable` thing, which without `dialogo` opens a minimal card (its name and description) just to mark it. */
type Hablante = Pnj | Cosa;
/** P4: what a card option does besides the conversation: mark, unmark, or just close (desechar / dejar marcado). */
type Vista = Opcion & { marca?: "marcar" | "desmarcar" | "cerrar" };
/** P4: the minimal card of a marcable thing without `dialogo`. */
const tarjeta = (c: Cosa): Nodo => ({ texto: c.descripcion || c.nombre, opciones: [] });
/** Completed quests sent in the book (the newest); all of them stay saved. */
export const LIBRO_HECHAS = 20;

/** P5's seam. A line as the adventure wrote it → the line the person says. Today it is returned as written. One day an
 * LLM may PHRASE it (never decide: options, actions and conditions stay in the tree and in code) under numinia.org
 * STD-050: the system prompt holds only the person's role and the house rules; the player's name and anything a person
 * wrote go in one fenced <material> block, rebuilt each time; the answer is checked (length, no new options) and the
 * written line is the fallback. Called only when someone talks (event cadence), never per tick. */
export type Frasear = (l: { pnj: string; nodo: string; texto: string; jugador: string }) => string;
/** `reloj` (U14 (5)): the server's clock in ms (default Date.now) — steps that wait (`espera`) count with it and it is
 * saved with the progress, so it must survive restarts; tests pass their own. */
export type OpcionesMisiones = { aventura?: { misiones: Fichero[]; pnj: Fichero[]; cosas: Fichero[]; secuencias?: Fichero[]; objetos?: Fichero[] }; frasear?: Frasear; reloj?: () => number };

/** One engine behind two features: [pnj, misiones]. `aventura` only for tests; the server reads AVENTURA_DIR. */
export function crearMisiones(o: OpcionesMisiones = {}): ServerPart[] {
  let A: Aventura = { misiones: new Map(), pnjs: new Map(), cosas: new Map(), secuencias: new Map(), dadores: new Map(), explicitos: new Map() };
  let P: ServerApi | null = null, M: ServerApi | null = null;
  // Lote 5 (nobody buried in the plaza): `posicion.y` stays ABSOLUTE, as every world written so far assumes (a tower floor, a balcony). Where the
  // world has relieve the page draws a person at the `y` it is given, so one that would stand below the ground at its x,z (or gave no `y`) is
  // published ON the ground instead; only those follow the ground when it changes (`sueloAhora().clave`). One above the ground never moves.
  const sueloAhora = (api: ServerApi) => sueloDe(api.estadoDe("espacio-base").get("mundo"), api.estadoDe("naturaleza").get("mundo"));
  const sobreSuelo = (suelo: { altura: (x: number, z: number) => number }, o: { posicion: { x: number; z: number; y: number }; sinY?: true }) => alSuelo(suelo.altura(o.posicion.x, o.posicion.z), o.posicion.y, o.sinY === true);
  let cargada = false;
  const enviadoSitio = new Map<number, Map<string, string>>(); // P2: connection -> person -> the place last sent to it
  const progresos = new Map<string, Progreso>();      // "g:<guest>" (saved) or "e<entity>" (no identity: memory only)
  const claveDe = new Map<number, string>();          // entity -> its progress key (who() is gone by onLeave)
  const abiertos = new Map<number, { pnj: string; vistas: Vista[] }>(); // open conversations
  const llegadas = new Set<number>();                 // players whose current step somewhere is llega_a
  const esperas = new Map<number, number>();          // U14 (5): connection -> when its next wait ends (ms): then its book again, once
  const avisosAntes = new Map<number, Map<string, number>>(); // P3: connection -> «<quest>:<step>» -> when its `antes` notice was last sent (ms)
  const ahora = () => (o.reloj ? o.reloj() : Date.now());

  let objetos = new Map<string, ObjetoAventura>();      // Y3: the adventure's valid objeto@1 (a `coge` step may hand one over)
  const cargar = (api: ServerApi) => {
    if (cargada) return;
    cargada = true;
    objetos = leerCatalogo(o.aventura?.objetos ?? api.aventura("objetos")).objetos; // its own problems are said by inventario, once
    const r = cargarAventura(o.aventura ?? { misiones: api.aventura("misiones"), pnj: api.aventura("pnj"), cosas: api.aventura("cosas"), secuencias: api.aventura("secuencias") }, { modelo: (sha) => api.activo(sha, "glb"), objetos: new Set(objetos.keys()) });
    for (const i of r.issues) api.log(`aventura: ${i.path}: ${i.message}`);
    A = r.aventura;
    if (A.misiones.size + A.pnjs.size + A.cosas.size) api.log(`aventura: ${A.misiones.size} misiones, ${A.pnjs.size} personas, ${A.cosas.size} cosas${A.secuencias.size ? `, ${A.secuencias.size} secuencias` : ""}`);
  };

  // ---- whose progress: per guest (saved), or per connection for bots and agents without identity ----
  const clave = (e: number) => { const w = M?.who(e); const k = w ? `g:${w.id}` : `e${e}`; claveDe.set(e, k); return k; };
  const prog = (e: number): Progreso => {
    const k = clave(e);
    let p = progresos.get(k);
    if (!p) { p = k.startsWith("g:") ? leerProgreso(M?.store.get(`p:${k.slice(2)}`)) : nuevoProgreso(); progresos.set(k, p); }
    return p;
  };
  const guardar = (e: number, p: Progreso) => { const w = M?.who(e); if (w && M && !M.store.set(`p:${w.id}`, p)) M.log(`no pude guardar el progreso de ${w.id}`); };
  /** Every connection of the same guest (two tabs of one browser share the book); just this one without identity. */
  const suyos = (e: number): number[] => { const k = claveDe.get(e) ?? clave(e); return k.startsWith("g:") ? (M?.players() ?? []).filter((x) => claveDe.get(x) === k) : [e]; };
  /** P2: where this person stands for THIS player, as the world's ground puts it (`posiciones`, else its own place). */
  const sitioPara = (suelo: { altura: (x: number, z: number) => number }, n: Pnj, p: Progreso): { x: number; z: number; y: number; giro: number; propio: boolean } => {
    const l = n.posiciones.length ? lugarDe(n, p, A) : null;
    return l ? { x: l.posicion.x, z: l.posicion.z, y: sobreSuelo(suelo, l), giro: l.giro ?? n.giro, propio: false } : { x: n.posicion.x, z: n.posicion.z, y: sobreSuelo(suelo, n), giro: n.giro, propio: true };
  };
  /** P2: is this player within reach of this person, where THIS player finds it? A person without `posiciones` (or standing at its own
   * place for this player) is api.within, exactly as before; elsewhere the same rule runs on the place the player's quests give it. */
  const cerca = (api: ServerApi, e: number, n: Pnj): boolean => {
    if (!n.posiciones.length) return api.within(e, n.id);
    const s = sitioPara(sueloAhora(api), n, prog(e));
    if (s.propio) return api.within(e, n.id);
    const me = api.position(e);
    if (!me) return false;
    const r = n.radio + INTERACT_SLACK_M;
    return (s.x - me.x) ** 2 + (s.z - me.z) ** 2 <= r * r && alAlcanceEnAltura(me.y, s.y);
  };
  const revisarLlegadas = (e: number) => { const p = prog(e), espera = esperaLlegada(p, A); for (const x of suyos(e)) { if (espera) llegadas.add(x); else llegadas.delete(x); } };
  /** U14 (5): when this player's next wait ends, for each of its connections (the tick sends them the book then). */
  const revisarEsperas = (e: number) => { const vence = proximaEspera(prog(e), A, ahora()); for (const x of suyos(e)) { if (vence === null) esperas.delete(x); else esperas.set(x, vence); } };
  /** A finished grupo (mision@1 `grupo`) shows its counter complete for ~2 s (maquina.ts PAUSA_GRUPO_MS) and moves on at the
   * player's next deliberate action or at its time (`ahora`, the tick's check): save, re-arm the checks, send the book. */
  const asentarYa = (e: number, p: Progreso, porEvento: boolean): boolean => {
    if (!asentar(p, A, ahora(), porEvento)) return false;
    guardar(e, p); revisarLlegadas(e); revisarEsperas(e); enviarLibro(e);
    return true;
  };
  /** U14 (5): «Todavía no: faltan 7 s para «Abre el cofre…».» — when someone tries a step that still waits. */
  const todaviaNo = (w: { mision: string; paso: number; faltaMs: number }) => {
    const s = Math.max(1, Math.ceil(w.faltaMs / 1000)), texto = A.misiones.get(w.mision)?.pasos[w.paso]?.texto ?? "";
    return corta(`Todavía no: ${s === 1 ? "falta 1 s" : `faltan ${s} s`} para «${texto}».`, 160);
  };
  /** P3: «Recoja antes el cuaderno…» — tried a step that is still locked behind an earlier one and that has an `antes`: tell
   * this connection (the aviso event), at most once every ANTES_CADA_MS per step. True when it was sent now. */
  const avisarAntes = (e: number, ws: { mision: string; paso: number; antes: string }[]): boolean => {
    const t = ahora();
    let por = avisosAntes.get(e);
    for (const w of ws) {
      const k = `${w.mision}:${w.paso}`, ultimo = por?.get(k);
      if (ultimo !== undefined && t - ultimo < ANTES_CADA_MS) continue;
      if (!por) avisosAntes.set(e, (por = new Map()));
      por.set(k, t);
      M?.emit("aviso", { texto: corta(w.antes, 160) }, { to: e });
      return true;
    }
    return false;
  };
  /** U14 (5): the steps just done that name a sequence send it to this player's pages alone — once: a page that comes
   * back later never sees it again. Each sequence is turned into its events once. */
  const cifradas = new Map<string, ReturnType<typeof eventosDe>>();
  const reproducir = (e: number, hechos: Hecho[]) => {
    for (const h of hechos) {
      const id = A.misiones.get(h.mision)?.pasos[h.paso]?.secuencia, s = id ? A.secuencias.get(id) : undefined;
      if (!s || !M) continue;
      let evs = cifradas.get(s.id);
      if (!evs) cifradas.set(s.id, (evs = eventosDe(s, A.pnjs, M ? sueloAhora(M).altura : undefined)));
      for (const x of suyos(e)) for (const [ev, msg] of evs) M.emit(ev, msg, { to: x });
    }
  };

  // ---- the book: sent whole on entering and after each change, only to its owner ----
  const nombreSemilla = (r: { color: string; n: number }) => `Semilla ${r.color}${r.n > 1 ? ` ×${r.n}` : ""}`;
  /** Y1: what goes to the inventory (misiones never stores objects): one server-only `otorga` per Semilla reward; whoever listens (inventario) keeps it. */
  const otorgar = (e: number, m: Mision) => { for (const r of m.recompensas) if (r.tipo === "semilla") M!.emit("otorga", { quien: e, tipo: "token", clase: "semilla", nombre: `Semilla ${r.color}`, color: r.color, n: r.n }, "server"); };
  /** Y3: a `coge` step with `otorga` hands over that objeto@1 the moment it is done (the same door as a reward; inventario keeps it and tells the player). */
  const otorgarPaso = (e: number, s: Paso) => {
    if (s.tipo !== "coge" || !s.otorga || !M) return;
    const d = objetos.get(s.otorga);
    if (!d) { M.log(`misiones: el paso «${s.id}» otorga «${s.otorga}», que la aventura ya no define`); return; }
    M.emit("otorga", { quien: e, tipo: d.tipo, clase: corta(d.clase, 32), nombre: corta(d.nombre, 40), objeto: d.id }, "server");
  };
  const recompensa = (m: Mision) => corta(m.recompensas.map((r) => (r.tipo === "semilla" ? nombreSemilla(r) : `${r.tipo === "objeto" ? "Objeto" : "Insignia"} «${r.nombre}»`)).join(", "), 120); // N10: an «objeto» is a digital good of yours
  // `paso` = the first step still to do; inside a grupo the others of its block are to do too (each `paso` says its
  // grupo, and `hecho` is true for what is already done in the block); `espera` = the seconds a step to do still waits
  /** P4: a quest's counters as the `mision` event carries them. */
  const cuentaWire = (p: Progreso, id: string) => { const c = cuentaDe(p, id); return { marcas: c.marcas, erroneas: c.marcas_erroneas, desmarcados: c.desmarcados }; };
  const enviarMision = (to: number, p: Progreso, m: Mision, t: number) => {
    const act = p.activas[m.id], hecha = !act, ahora = hecha ? m.pasos.length : Math.min(primerPendiente(m, act), m.pasos.length - 1);
    const señala = m.pistas !== false; // P3: a quest with pistas:false sends its steps without a place (nothing to point at, nothing to read off the wire)
    M!.emit("mision", { id: m.id, titulo: m.titulo, descripcion: m.descripcion, estado: hecha ? "hecha" : "activa", paso: ahora, pasos: m.pasos.length, seguida: p.seguida === m.id, recompensa: recompensa(m), pistas: señala, ...(m.pasos.some((s) => s.tipo === "marca") ? cuentaWire(p, m.id) : {}) }, { to }); // P4: the counters only for a quest that marks
    m.pasos.forEach((s, n) => {
      const ob = señala ? objetivo(s, A, p) : { ...objetivo(s, A, p), x: 0, z: 0, nombre: "" }, espera = !hecha && pendiente(m, act, n) ? Math.ceil(faltaEspera(m, act, n, t) / 1000) : 0;
      M!.emit("paso", { mision: m.id, n, texto: s.texto, tipo: s.tipo, hecho: hecha || pasoHecho(m, act, n), x: ob.x, z: ob.z, donde: corta(ob.nombre, LIM.lugar), que: ob.que, grupo: s.grupo ?? "", espera, accion: s.tipo === "hace" ? s.accion : "", senala: s.senala ?? "" }, { to });
    });
  };
  const conMarcables = () => [...A.cosas.values()].some((c) => c.marcable);
  const enviarLibro = (e: number, solo = false) => {
    if (!M) return;
    const p = prog(e), t = ahora();
    const activas = Object.keys(p.activas).map((id) => A.misiones.get(id)).filter((m): m is Mision => !!m);
    const hechas = p.hechas.map((id) => A.misiones.get(id)).filter((m): m is Mision => !!m).slice(-LIBRO_HECHAS);
    const mk = marcas(p, A, t), lim = LIM.marcas; // U14 (4): «!» / «✓» over people and things, for this player only (U14 (5): not on a step that still waits)
    const marcasMsg = { tiene: enTexto(mk.tiene, lim), hecho: enTexto(mk.hecho, lim), cosas: enTexto(mk.cosas, lim), callan: enTexto(callan(p, A), lim) };
    for (const x of solo ? [e] : suyos(e)) {
      M.emit("libro", { activas: activas.length, hechas: hechas.length }, { to: x });
      for (const m of [...activas, ...hechas]) enviarMision(x, p, m, t);
      M.emit("marcas", marcasMsg, { to: x });
      if (conMarcables()) M.emit("marcados", { ids: enTexto(marcadosDe(p, A), lim) }, { to: x }); // P4: what is marked, in order (its place = its number); only in a world with marcable things
      enviarSitios(x, p);
    }
  };
  /** P2: the places THIS player's quests give the people who have `posiciones` — one `sitio` for each that differs from what this
   * connection last heard (the first time always: so the page knows a later change is a move to walk; a world without `posiciones` sends none). */
  const enviarSitios = (to: number, p: Progreso) => {
    if (!P || !M || !A.pnjs.size) return;
    let suelo: ReturnType<typeof sueloAhora> | null = null;
    for (const n of A.pnjs.values()) {
      if (!n.posiciones.length) continue;
      suelo ??= sueloAhora(M);
      const s = sitioPara(suelo, n, p), firma = `${s.x},${s.z},${s.y},${s.giro}`;
      let vistos = enviadoSitio.get(to);
      if (vistos?.get(n.id) === firma) continue;
      if (!vistos) enviadoSitio.set(to, (vistos = new Map()));
      vistos.set(n.id, firma);
      P.emit("sitio", { pnj: n.id, x: s.x, z: s.z, y: s.y, giro: s.giro }, { to });
    }
  };
  /** U14 (6): a quest with rewards completed by someone with identity: ONE grant record (concesion.ts), written only if
   * its key is absent — never over it. Without identity (I1) nothing is recorded, like its progress. */
  const conceder = (e: number, m: Mision) => {
    const w = M?.who(e);
    if (!M || !w || !m.recompensas.length) return;
    const k = claveConcesion(m.id, w.id);
    if (M.store.get(k) !== undefined) return; // granted before (another tab, a repeatable quest done again): the first stays
    const c = concesion(m, w, new Date().toISOString());
    if (!M.store.set(k, c)) { M.log(`no pude apuntar la concesión de «${m.id}» a ${w.id}`); return; }
    // N10: each «objeto» reward goes to the server's goods keeper (features/bienes), once — the grant above is the «once»
    for (const r of m.recompensas) if (r.tipo === "objeto") M.emit("concedido", { jugador: w.id, mision: m.id, objeto: r.id, nombre: r.nombre, descripcion: r.descripcion, modelo: r.modelo, licencia: r.licencia, instante: c.instante }, "server");
  };

  /** After steps were completed: save, tell (announced), resend the book, re-arm the arrival checks. A `recibe` step
   * says what you got («Has recibido: …»). */
  const tras = (e: number, p: Progreso, hechos: Hecho[]) => {
    guardar(e, p);
    let abrirLibro = false; // P3: a `coge` step with abreLibro was done
    for (const h of hechos) {
      const m = A.misiones.get(h.mision)!, s = m.pasos[h.paso];
      const texto = s.tipo === "recibe" ? corta(`Has recibido: ${A.cosas.get(s.cosa)?.nombre ?? s.cosa}`, LIM.textoPaso) : s.texto;
      if (s.tipo === "coge" && s.abreLibro) abrirLibro = true;
      otorgarPaso(e, s); // Y3: the thing you picked up brings its weapon or relic (before «completada»: it is in the Reserva when the page says it)
      M!.hecho("aventura.paso", { aventura: m.id, paso: String(h.paso) }); // MIS-248: the world's book, no person
      if (h.completada) { M!.hecho("aventura.terminada", { aventura: m.id, resultado: "completada" }); conceder(e, m); } // before anyone hears «completada»: the record exists when the page says it
      for (const x of suyos(e)) {
        M!.emit("avance", { mision: m.id, texto }, { to: x });
        if (h.completada) M!.emit("completada", { mision: m.id, titulo: m.titulo, texto: m.textos.completada, recompensa: recompensa(m) }, { to: x });
      }
      if (h.completada) otorgar(e, m);
    }
    enviarLibro(e);
    if (abrirLibro) for (const x of suyos(e)) M!.emit("abrirLibro", {}, { to: x }); // P3: after the book, so the page opens it whole
    revisarLlegadas(e);
    revisarEsperas(e); // U14 (5): a new block may start a wait
    reproducir(e, hechos); // U14 (5): a step that names a sequence plays it for this player
  };
  const tomar = (e: number, p: Progreso, m: Mision): { ok: true } | { ok: false; motivo: string } => {
    const r = aceptar(p, m, A, ahora());
    if (!r.ok) return r;
    guardar(e, p);
    M!.hecho("aventura.empezada", { aventura: m.id }); // MIS-248
    for (const x of suyos(e)) M!.emit("aceptada", { mision: m.id, titulo: m.titulo, texto: m.textos.aceptada }, { to: x });
    enviarLibro(e);
    revisarLlegadas(e);
    revisarEsperas(e);
    return r;
  };
  const rechazarP = (e: number, motivo: string) => { P?.emit("rechazado", { motivo: corta(motivo, 160) }, { to: e }); };
  const rechazarM = (e: number, motivo: string) => { M?.emit("rechazado", { motivo: corta(motivo, 160) }, { to: e }); };

  // ---- conversations: one open per connection, with the options it was shown ----
  const hablante = (id: string): Hablante | undefined => A.pnjs.get(id) ?? (A.cosas.get(id)?.dialogo || A.cosas.get(id)?.marcable ? A.cosas.get(id) : undefined);
  /** The node a speaker shows: the written one, or (P4, a marcable thing with nothing written to say now) its minimal card. */
  const nodoDe = (n: Hablante, nodo: string): Nodo => (n.dialogo ? n.dialogo.nodos[nodo] : undefined) ?? tarjeta(n as Cosa);
  const esPersona = (n: Hablante): n is Pnj => A.pnjs.get(n.id) === n;
  /** In reach of this speaker: a person through the pnj feature, a thing through the misiones one (each owns its entities). */
  const alAlcance = (e: number, n: Hablante): boolean => esPersona(n) ? !!P && cerca(P, e, n) : M?.within(e, n.id) === true; // P2: a person where THIS player finds it
  const decir = (e: number, n: Hablante, nodo: string): string => {
    const texto = nodoDe(n, nodo).texto;
    if (!esPersona(n)) return texto; // a thing's lines are never phrased by anyone else
    try { return corta(o.frasear?.({ pnj: n.id, nodo, texto, jugador: M?.who(e)?.nombre ?? "" }) || texto, LIM.linea); } catch { return texto; } // the written line is the fallback
  };
  const abrir = (e: number, n: Hablante, nodo: string) => {
    const p = prog(e), marcando = !esPersona(n) && n.marcable !== undefined && marcablesAhora(p, A, ahora()).includes(n.id);
    let vistas: Vista[] = opcionesDe(nodoDe(n, nodo), p, A);
    if (marcando) { // P4: the card of a marcable thing ends with its two buttons (the author's options are at most two: formato.ts checks it)
      const mc = (n as Cosa).marcable!, ya = marcadosDe(p, A).includes(n.id);
      vistas = [...vistas.slice(0, 2), { texto: ya ? mc.desmarcar : mc.marcar, si: [], marca: ya ? "desmarcar" : "marcar" }, { texto: ya ? mc.dejar : mc.desechar, si: [], marca: "cerrar" }];
    }
    abiertos.set(e, { pnj: n.id, vistas });
    P?.emit("dialogo", { pnj: n.id, nombre: n.nombre, texto: decir(e, n, nodo), o1: vistas[0]?.texto ?? "", o2: vistas[1]?.texto ?? "", o3: vistas[2]?.texto ?? "", o4: vistas[3]?.texto ?? "" }, { to: e });
  };
  const cerrar = (e: number, n: Hablante) => { abiertos.delete(e); P?.emit("fin", { pnj: n.id, nombre: n.nombre }, { to: e }); };
  const hacer = (e: number, n: Hablante, ac: Exclude<Accion, { tipo: "despedir" }>): { ok: true } | { ok: false; motivo: string } => {
    const m = A.misiones.get(ac.mision);
    if (!m) return { ok: false, motivo: "Esa misión ya no existe." };
    const p = prog(e);
    if (ac.tipo === "dar_mision") return tomar(e, p, m);
    const x: Suceso = !esPersona(n) ? { tipo: "usa", cosa: n.id, mision: m.id, ahora: ahora() } // P3: a thing's option counts the `usa` step that names it
      : ac.tipo === "avanzar_paso" ? { tipo: "avanzar", pnj: n.id, mision: m.id, ahora: ahora() } : { tipo: "entregar", pnj: n.id, mision: m.id, ahora: ahora() };
    asentarYa(e, p, true);
    const h = registrar(p, A, x);
    if (!h.length) {
      const w = esperando(p, A, x), antes = bloqueados(p, A, x)[0];
      return { ok: false, motivo: w ? todaviaNo(w) : antes ? antes.antes : ac.tipo === "avanzar_paso" ? "Eso ahora no toca." : `No llevas lo que ${n.nombre} espera.` }; // P3: a locked step says its `antes`
    }
    tras(e, p, h);
    return { ok: true };
  };

  /** P4: mark or unmark `n` (a marcable thing) for this player and let the steps that now hold complete — or not: a step asks for
   * EXACTLY a set, so 3 right and 1 wrong is not done, and unmarking the wrong one finishes it. */
  const alternar = (e: number, n: Hablante, que: "marcar" | "desmarcar"): { ok: true } | { ok: false; motivo: string } => {
    const p = prog(e);
    asentarYa(e, p, true);
    const r = que === "marcar" ? marcar(p, A, n.id, ahora()) : desmarcar(p, A, n.id, ahora());
    if (!r.ok) return r;
    const h = registrar(p, A, { tipo: "marca", marcados: marcadosDe(p, A), ahora: ahora() });
    if (h.length) tras(e, p, h);
    else { guardar(e, p); enviarLibro(e); }
    return { ok: true };
  };

  const pnjPart = serverPart(pnjDecl, (api) => {
    P = api;
    cargar(api);
    const ponerPnjs = (suelo: ReturnType<typeof sueloDe>) => {
      for (const n of A.pnjs.values()) {
        api.state.set(n.id, { nombre: n.nombre, descripcion: n.descripcion, x: n.posicion.x, z: n.posicion.z, y: sobreSuelo(suelo, n), giro: n.giro, radio: n.radio, modelo: n.apariencia.modelo, escala: n.apariencia.escala, oficio: n.oficio, voz: n.voz, reposo: n.reposo, mira: n.mira }, { at: { x: n.posicion.x, z: n.posicion.z } });
      }
    };
    let claveP = sueloAhora(api).clave;
    ponerPnjs(sueloAhora(api));
    api.onTick(() => { const su = sueloAhora(api); if (su.clave === claveP) return; claveP = su.clave; cifradas.clear(); ponerPnjs(su); enviadoSitio.clear(); for (const x of M?.players() ?? []) enviarSitios(x, prog(x)); }); // the ground changed: the ones standing on it stand on the new one
    api.on("hablar", (e, msg) => {
      const n = A.pnjs.get(String(msg.pnj));
      if (!n) return rechazarP(e, "No hay nadie así por aquí.");
      if (!cerca(api, e, n)) return rechazarP(e, `Acércate a ${n.nombre} para hablar.`);
      const p = prog(e), x: Suceso = { tipo: "habla", pnj: n.id, ahora: ahora() };
      asentarYa(e, p, true); // a finished grupo moves on before this talk (its dialogue reads the next block)
      const nodo = nodoInicial(n, p, A);
      if (nodo === null) return rechazarP(e, `${n.nombre} no tiene nada que decirle ahora.`); // P3: outside its phase it says nothing, and talking to it counts for nothing
      const h = registrar(p, A, x); // steps that complete just by talking
      if (h.length) tras(e, p, h);
      else { const w = esperando(p, A, x); if (w) M?.emit("aviso", { texto: todaviaNo(w) }, { to: e }); else avisarAntes(e, bloqueados(p, A, x)); } // U14 (5): it still waits; P3: or it comes later
      abrir(e, n, nodoInicial(n, p, A) ?? nodo); // what it says may have changed with the step just done
    });
    api.on("elegir", (e, msg) => {
      const d = abiertos.get(e), n = hablante(String(msg.pnj));
      if (!d || !n || d.pnj !== n.id) return rechazarP(e, "No estás hablando con esa persona.");
      if (!alAlcance(e, n)) { cerrar(e, n); return rechazarP(e, `Te has alejado de ${n.nombre}.`); }
      const op = d.vistas[Number(msg.opcion) - 1];
      if (!op) return rechazarP(e, "Esa respuesta no está.");
      if (op.marca) { // P4: mark / unmark / just close; whatever it was, the card closes
        if (op.marca !== "cerrar") { const r = alternar(e, n, op.marca); if (!r.ok) { cerrar(e, n); return rechazarP(e, r.motivo); } }
        return cerrar(e, n);
      }
      if (op.accion && op.accion.tipo !== "despedir") {
        const r = hacer(e, n, op.accion);
        if (!r.ok) return rechazarP(e, r.motivo); // the conversation stays where it was
      }
      if (op.accion?.tipo === "despedir" || !op.ir) return cerrar(e, n);
      abrir(e, n, op.ir);
    });
    api.on("adios", (e, msg) => { if (abiertos.get(e)?.pnj === String(msg.pnj)) abiertos.delete(e); });
    api.onLeave((e) => { abiertos.delete(e); });
  });

  const misionesPart = serverPart(misionesDecl, (api) => {
    M = api;
    cargar(api);
    const ponerCosas = (suelo: ReturnType<typeof sueloDe>) => {
      for (const c of A.cosas.values()) {
        api.state.set(c.id, { nombre: c.nombre, descripcion: c.descripcion, x: c.posicion.x, z: c.posicion.z, radio: c.radio, aviso: c.aviso, modelo: c.apariencia.modelo, escala: c.apariencia.escala, y: sobreSuelo(suelo, c), color: c.apariencia.color, modeloUsada: c.apariencia.usada?.modelo ?? "", escalaUsada: c.apariencia.usada?.escala ?? c.apariencia.escala, dialogo: !!c.dialogo, ...(c.marcable ? { marcable: true, mox: c.marcable.offset.x, moy: c.marcable.offset.y, moz: c.marcable.offset.z } : {}) }, { at: { x: c.posicion.x, z: c.posicion.z } }); // U14 (6): the used look travels with it; each page picks by its own book
      }
    };
    let claveC = sueloAhora(api).clave;
    ponerCosas(sueloAhora(api));
    api.onTick(() => { const su = sueloAhora(api); if (su.clave === claveC) return; claveC = su.clave; ponerCosas(su); });
    api.onAdoptar((invitado, sub) => { // identidad/i1: the generic move (paso: the more advanced; hechas: the union; grants once); the memory copy follows
      adoptarClaves(api.store, invitado, sub);
      progresos.delete(`g:${invitado}`); if (progresos.has(`g:${sub}`)) progresos.set(`g:${sub}`, leerProgreso(api.store.get(`p:${sub}`)));
    });
    api.onIdentify((e) => {
      const antes = claveDe.get(e);
      if (antes?.startsWith("e")) progresos.delete(antes); // what it did before saying who it is is not kept
      clave(e);
      enviarLibro(e, true);
      revisarLlegadas(e);
      revisarEsperas(e); // U14 (5): a wait saved with the progress keeps counting across a reconnection
    });
    api.onLeave((e) => {
      const k = claveDe.get(e);
      claveDe.delete(e); llegadas.delete(e); esperas.delete(e); avisosAntes.delete(e); enviadoSitio.delete(e);
      if (k && ![...claveDe.values()].includes(k)) progresos.delete(k); // saved in the store already
    });
    // T1: step `hace`. Nothing here runs per tick: a builder's action reaches us as an event another piece already emits
    // (objetos `hizo`, disparadores `hizo` and `senal`; only the author's entity counts) and is turned into a Suceso; the
    // three actions only the page sees come in as the intent `hace`. No permission to build = no `hace` counts.
    let hayHace: boolean | null = null;
    const conHace = () => (hayHace ??= [...A.misiones.values()].some((m) => m.pasos.some((s) => s.tipo === "hace")));
    const hizo = (e: number, ...hechos: { accion: string; modelo?: string; disparador?: string }[]) => {
      if (!conHace() || !api.puede(e, "construir")) return;
      const p = prog(e);
      asentarYa(e, p, true);
      for (const x of hechos) { // one action per event: the first the quest asks for (a drag that moves and scales completes one step, not two)
        const h = registrar(p, A, { tipo: "hace", ...x, ahora: ahora() });
        if (h.length) return void tras(e, p, h);
      }
    };
    api.listen("objetos", "hizo", (m) => {
      if (!conHace()) return;
      const e = Number(m.quien), accion = String(m.accion), id = String(m.id);
      if (accion === "colocar") return void hizo(e, { accion: "coloca", modelo: String(api.estadoDe("objetos").get(id)?.modelo ?? "") });
      if (accion === "mover") return void hizo(e, ...(["mueve", "gira", "escala"] as const).filter((k) => m[k] === true).map((k) => ({ accion: k })));
      if (accion === "girar") return void hizo(e, { accion: "gira" });
      if (accion === "ajustar" && m.oculto === true) return void hizo(e, { accion: "oculta" });
      if (accion === "borrar") return void hizo(e, { accion: "borra" });
    });
    api.listen("disparadores", "hizo", (m) => hizo(Number(m.quien), { accion: `${String(m.accion) === "creado" ? "crea" : String(m.accion) === "editado" ? "edita" : "borra"}_cable`, disparador: String(m.disparador) }));
    api.listen("disparadores", "senal", (m) => { if (m.persona === true) hizo(Number(m.quien), { accion: "dispara_cable", disparador: String(m.disparador) }); });
    api.on("hace", (e, msg) => {
      const accion = String(msg.accion);
      if (!(ACCIONES_PAGINA as readonly string[]).includes(accion)) return rechazarM(e, "Eso lo ve el servidor solo: no hace falta que me lo cuentes.");
      hizo(e, { accion });
    });
    // D-041 historia 4: the cable's receiver `da_paso` names a mission and a step and jumps straight there (taking the
    // quest first if `quien` did not have it), unlike the natural play path above: the world's own file asked for
    // it, so no door, no person and no distance are checked. Never goes backwards; a mission already done is left as is.
    api.listen("disparadores", "accion", (m) => {
      if (m.accion !== "da_paso") return false;
      const mis = A.misiones.get(String(m.mision));
      const e = Number(m.quien);
      if (!mis) { api.log(`[disparadores→misiones] el cable pide da_paso de «${String(m.mision).slice(0, 32)}» y no existe esa misión`); return true; }
      let p = prog(e);
      if (!p.activas[mis.id] && !p.hechas.includes(mis.id)) {
        const r = tomar(e, p, mis);
        if (!r.ok) { api.log(`[disparadores→misiones] el cable no pudo darle «${mis.id}» a e${e}: ${r.motivo}`); return true; }
        p = prog(e); // tomar saved it; re-read so `act` below sees the just-accepted quest
      }
      const act = p.activas[mis.id];
      if (!act) return true; // already finished: nothing to jump to
      const destino = Math.max(0, Math.min(Math.round(Number(m.paso)), mis.pasos.length));
      if (destino <= act.paso) return true; // the cable only moves a quest forward
      act.paso = destino; act.hechos = [];
      const completada = destino >= mis.pasos.length;
      if (completada) {
        delete p.activas[mis.id];
        if (!p.hechas.includes(mis.id)) p.hechas.push(mis.id);
        if (p.hechas.length > HECHAS_MAX) p.hechas.splice(0, p.hechas.length - HECHAS_MAX);
        if (p.seguida === mis.id) p.seguida = Object.keys(p.activas)[0] ?? "";
      }
      tras(e, p, [{ mision: mis.id, paso: destino - 1, completada }]);
      return true;
    });
    api.on("aceptar", (e, msg) => {
      const m = A.misiones.get(String(msg.mision));
      if (!m) return rechazarM(e, "No hay ninguna misión así.");
      const dadores = A.dadores.get(m.id) ?? [];
      if (!dadores.some((id) => { const n = A.pnjs.get(id); return !!P && !!n && cerca(P, e, n); })) return rechazarM(e, `Esa misión la da ${dadores.map((id) => A.pnjs.get(id)?.nombre ?? id).join(" o ") || "alguien que no está"}: acércate a hablar.`);
      const r = tomar(e, prog(e), m);
      if (!r.ok) rechazarM(e, r.motivo);
    });
    api.on("abandonar", (e, msg) => {
      const p = prog(e), id = String(msg.mision);
      if (!abandonar(p, id)) return rechazarM(e, "No tienes esa misión activa.");
      guardar(e, p);
      api.hecho("aventura.abandonada", { aventura: id }); // MIS-248
      for (const x of suyos(e)) api.emit("aviso", { texto: corta(`Has dejado «${A.misiones.get(id)?.titulo ?? id}».`, 160) }, { to: x });
      enviarLibro(e);
      revisarLlegadas(e);
      revisarEsperas(e);
    });
    api.on("seguir", (e, msg) => {
      const p = prog(e), id = String(msg.mision);
      if (!seguir(p, id)) return rechazarM(e, "Solo se puede seguir una misión activa.");
      guardar(e, p);
      enviarLibro(e);
    });
    api.on("usar", (e, msg) => {
      const c = A.cosas.get(String(msg.cosa));
      if (!c) return rechazarM(e, "No hay nada así por aquí.");
      if (!api.within(e, c.id)) return rechazarM(e, `Acércate más a ${c.nombre}.`);
      const p = prog(e), x: Suceso = { tipo: "usa", cosa: c.id, ahora: ahora() };
      asentarYa(e, p, true);
      const marcando = !!c.marcable && marcablesAhora(p, A, ahora()).includes(c.id); // P4: a marca step is to do: this thing opens its card to mark it
      if ((c.dialogo || marcando) && !cogePendiente(p, A, c.id)) { // P3: inspecting — a thing with a conversation opens it (picking it up, when a coge step asks, stays as it was)
        const nodo = c.dialogo ? nodoInicial({ dialogo: c.dialogo }, p, A) : null;
        if (nodo === null && !marcando) return rechazarM(e, `Ahora no hay nada que inspeccionar en ${c.nombre}.`);
        return abrir(e, c, nodo ?? "");
      }
      const h = registrar(p, A, x);
      if (!h.length) { // U14 (5): too early; P3: or it comes after an earlier step (its `antes`, once in a while)
        const w = esperando(p, A, x);
        if (w) return rechazarM(e, todaviaNo(w));
        const antes = bloqueados(p, A, x);
        if (antes.length) { avisarAntes(e, antes); return; }
        return rechazarM(e, `Ahora no te hace falta ${c.nombre}.`);
      }
      tras(e, p, h);
    });
    // cheap per tick: only players on a llega_a step, each one every LLEGADA_CADA ticks; open conversations likewise;
    // U14 (5): and the connections with a wait, whose book (with its marks) goes again once, when the wait ends
    api.onTick((t) => {
      for (const e of llegadas) {
        if ((e + t) % LLEGADA_CADA !== 0) continue;
        const pos = api.position(e);
        if (!pos) continue;
        const llega: Suceso = { tipo: "llega", x: pos.x, z: pos.z, y: pos.y, ahora: ahora() }; // y: a llega_a with a height asks for the right floor
        const p = prog(e), h = registrar(p, A, llega);
        if (h.length) tras(e, p, h);
        else avisarAntes(e, bloqueados(p, A, llega)); // P3: standing where a later step wants you, too early
      }
      if (esperas.size && t % LLEGADA_CADA === 0) {
        const ya = ahora();
        for (const [e, vence] of esperas) {
          if (ya < vence) continue;
          if (!asentarYa(e, prog(e), false)) enviarLibro(e, true); // a finished grupo moves on (the book goes to every tab); else this connection only: each of the player's tabs has its own entry
          const otra = proximaEspera(prog(e), A, ya);
          if (otra === null) esperas.delete(e); else esperas.set(e, otra);
        }
      }
      for (const [e, d] of abiertos) {
        if ((e + t) % LLEGADA_CADA !== 0) continue;
        const n = hablante(d.pnj), pos = api.position(e), st = n ? (esPersona(n) && n.posiciones.length ? sitioPara(sueloAhora(api), n, prog(e)) : n.posicion) : null; // P2: where this player finds it
        if (n && st && pos && (pos.x - st.x) ** 2 + (pos.z - st.z) ** 2 <= (n.radio + ALEJARSE_M) ** 2) continue;
        if (n) cerrar(e, n); else abiertos.delete(e);
      }
    });
  });

  return [pnjPart, misionesPart];
}

export default crearMisiones();
