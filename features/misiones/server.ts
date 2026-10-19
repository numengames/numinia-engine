// misiones — server part (J5 + the J4 core). People (pnj) and quest things (misiones) come from the adventure's files
// and are put in the world with `at` (only near players get them, J9). Dialogue and quest progress are decided here:
// distances (api.within), step conditions and positions (api.position) are checked by this file, so a page can never
// complete a step by asking. Progress is kept per guest (I1) in the store (S4) and reaches only its owner.
import { adoptarClaves, serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi, ServerPart } from "../../packages/feature/src/index.ts";
import { pnj as pnjDecl, misiones as misionesDecl } from "./feature.ts";
import { cargarAventura, corta, LIM } from "./formato.ts";
import type { Accion, Aventura, Fichero, Mision, Opcion, Pnj } from "./formato.ts";
import { abandonar, aceptar, enTexto, esperaLlegada, HECHAS_MAX, leerProgreso, marcas, nodoInicial, nuevoProgreso, objetivo, opcionesDe, pasoHecho, primerPendiente, registrar, seguir } from "./maquina.ts";
import type { Hecho, Progreso } from "./maquina.ts";
import { esperando, faltaEspera, pendiente, proximaEspera } from "./maquina.ts"; // U14 (5): steps that wait
import type { Suceso } from "./maquina.ts";
import { eventosDe } from "./secuencia.ts"; // U14 (5): a moment only its player sees
import { claveConcesion, concesion } from "./concesion.ts"; // U14 (6): the reward granted, recorded once

/** Ticks between two «has it arrived?» checks of one player (4 = 0.2 s). Only players on a llega_a step are checked. */
export const LLEGADA_CADA = 4;
/** A conversation ends when the player walks this many metres beyond the person's radius. */
export const ALEJARSE_M = 4;
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
export type OpcionesMisiones = { aventura?: { misiones: Fichero[]; pnj: Fichero[]; cosas: Fichero[]; secuencias?: Fichero[] }; frasear?: Frasear; reloj?: () => number };

/** One engine behind two features: [pnj, misiones]. `aventura` only for tests; the server reads AVENTURA_DIR. */
export function crearMisiones(o: OpcionesMisiones = {}): ServerPart[] {
  let A: Aventura = { misiones: new Map(), pnjs: new Map(), cosas: new Map(), secuencias: new Map(), dadores: new Map(), explicitos: new Map() };
  let P: ServerApi | null = null, M: ServerApi | null = null;
  let cargada = false;
  const progresos = new Map<string, Progreso>();      // "g:<guest>" (saved) or "e<entity>" (no identity: memory only)
  const claveDe = new Map<number, string>();          // entity -> its progress key (who() is gone by onLeave)
  const abiertos = new Map<number, { pnj: string; vistas: Opcion[] }>(); // open conversations
  const llegadas = new Set<number>();                 // players whose current step somewhere is llega_a
  const esperas = new Map<number, number>();          // U14 (5): connection -> when its next wait ends (ms): then its book again, once
  const ahora = () => (o.reloj ? o.reloj() : Date.now());

  const cargar = (api: ServerApi) => {
    if (cargada) return;
    cargada = true;
    const r = cargarAventura(o.aventura ?? { misiones: api.aventura("misiones"), pnj: api.aventura("pnj"), cosas: api.aventura("cosas"), secuencias: api.aventura("secuencias") }, { modelo: (sha) => api.activo(sha, "glb") });
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
  const revisarLlegadas = (e: number) => { const p = prog(e), espera = esperaLlegada(p, A); for (const x of suyos(e)) { if (espera) llegadas.add(x); else llegadas.delete(x); } };
  /** U14 (5): when this player's next wait ends, for each of its connections (the tick sends them the book then). */
  const revisarEsperas = (e: number) => { const vence = proximaEspera(prog(e), A, ahora()); for (const x of suyos(e)) { if (vence === null) esperas.delete(x); else esperas.set(x, vence); } };
  /** U14 (5): «Todavía no: faltan 7 s para «Abre el cofre…».» — when someone tries a step that still waits. */
  const todaviaNo = (w: { mision: string; paso: number; faltaMs: number }) => {
    const s = Math.max(1, Math.ceil(w.faltaMs / 1000)), texto = A.misiones.get(w.mision)?.pasos[w.paso]?.texto ?? "";
    return corta(`Todavía no: ${s === 1 ? "falta 1 s" : `faltan ${s} s`} para «${texto}».`, 160);
  };
  /** U14 (5): the steps just done that name a sequence send it to this player's pages alone — once: a page that comes
   * back later never sees it again. Each sequence is turned into its events once. */
  const cifradas = new Map<string, ReturnType<typeof eventosDe>>();
  const reproducir = (e: number, hechos: Hecho[]) => {
    for (const h of hechos) {
      const id = A.misiones.get(h.mision)?.pasos[h.paso]?.secuencia, s = id ? A.secuencias.get(id) : undefined;
      if (!s || !M) continue;
      let evs = cifradas.get(s.id);
      if (!evs) cifradas.set(s.id, (evs = eventosDe(s, A.pnjs)));
      for (const x of suyos(e)) for (const [ev, msg] of evs) M.emit(ev, msg, { to: x });
    }
  };

  // ---- the book: sent whole on entering and after each change, only to its owner ----
  const nombreSemilla = (r: { color: string; n: number }) => `Semilla ${r.color}${r.n > 1 ? ` ×${r.n}` : ""}`;
  /** Y1: what goes to the inventory (misiones never stores objects): one server-only `otorga` per Semilla reward; whoever listens (inventario) keeps it. */
  const otorgar = (e: number, m: Mision) => { for (const r of m.recompensas) if (r.tipo === "semilla") M!.emit("otorga", { quien: e, tipo: "token", clase: "semilla", nombre: `Semilla ${r.color}`, color: r.color, n: r.n }, "server"); };
  const recompensa = (m: Mision) => corta(m.recompensas.map((r) => (r.tipo === "semilla" ? nombreSemilla(r) : `${r.tipo === "objeto" ? "Objeto" : "Insignia"} «${r.nombre}»`)).join(", "), 120); // N10: an «objeto» is a digital good of yours
  // `paso` = the first step still to do; inside a grupo the others of its block are to do too (each `paso` says its
  // grupo, and `hecho` is true for what is already done in the block); `espera` = the seconds a step to do still waits
  const enviarMision = (to: number, p: Progreso, m: Mision, t: number) => {
    const act = p.activas[m.id], hecha = !act, ahora = hecha ? m.pasos.length : Math.min(primerPendiente(m, act), m.pasos.length - 1);
    M!.emit("mision", { id: m.id, titulo: m.titulo, descripcion: m.descripcion, estado: hecha ? "hecha" : "activa", paso: ahora, pasos: m.pasos.length, seguida: p.seguida === m.id, recompensa: recompensa(m) }, { to });
    m.pasos.forEach((s, n) => {
      const ob = objetivo(s, A), espera = !hecha && pendiente(m, act, n) ? Math.ceil(faltaEspera(m, act, n, t) / 1000) : 0;
      M!.emit("paso", { mision: m.id, n, texto: s.texto, tipo: s.tipo, hecho: hecha || pasoHecho(m, act, n), x: ob.x, z: ob.z, donde: corta(ob.nombre, LIM.lugar), que: ob.que, grupo: s.grupo ?? "", espera }, { to });
    });
  };
  const enviarLibro = (e: number, solo = false) => {
    if (!M) return;
    const p = prog(e), t = ahora();
    const activas = Object.keys(p.activas).map((id) => A.misiones.get(id)).filter((m): m is Mision => !!m);
    const hechas = p.hechas.map((id) => A.misiones.get(id)).filter((m): m is Mision => !!m).slice(-LIBRO_HECHAS);
    const mk = marcas(p, A, t), lim = LIM.marcas; // U14 (4): «!» / «✓» over people and things, for this player only (U14 (5): not on a step that still waits)
    const marcasMsg = { tiene: enTexto(mk.tiene, lim), hecho: enTexto(mk.hecho, lim), cosas: enTexto(mk.cosas, lim) };
    for (const x of solo ? [e] : suyos(e)) {
      M.emit("libro", { activas: activas.length, hechas: hechas.length }, { to: x });
      for (const m of [...activas, ...hechas]) enviarMision(x, p, m, t);
      M.emit("marcas", marcasMsg, { to: x });
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
    for (const h of hechos) {
      const m = A.misiones.get(h.mision)!, s = m.pasos[h.paso];
      const texto = s.tipo === "recibe" ? corta(`Has recibido: ${A.cosas.get(s.cosa)?.nombre ?? s.cosa}`, LIM.textoPaso) : s.texto;
      if (h.completada) conceder(e, m); // before anyone hears «completada»: the record exists when the page says it
      for (const x of suyos(e)) {
        M!.emit("avance", { mision: m.id, texto }, { to: x });
        if (h.completada) M!.emit("completada", { mision: m.id, titulo: m.titulo, texto: m.textos.completada, recompensa: recompensa(m) }, { to: x });
      }
      if (h.completada) otorgar(e, m);
    }
    enviarLibro(e);
    revisarLlegadas(e);
    revisarEsperas(e); // U14 (5): a new block may start a wait
    reproducir(e, hechos); // U14 (5): a step that names a sequence plays it for this player
  };
  const tomar = (e: number, p: Progreso, m: Mision): { ok: true } | { ok: false; motivo: string } => {
    const r = aceptar(p, m, A, ahora());
    if (!r.ok) return r;
    guardar(e, p);
    for (const x of suyos(e)) M!.emit("aceptada", { mision: m.id, titulo: m.titulo, texto: m.textos.aceptada }, { to: x });
    enviarLibro(e);
    revisarLlegadas(e);
    revisarEsperas(e);
    return r;
  };
  const rechazarP = (e: number, motivo: string) => { P?.emit("rechazado", { motivo: corta(motivo, 160) }, { to: e }); };
  const rechazarM = (e: number, motivo: string) => { M?.emit("rechazado", { motivo: corta(motivo, 160) }, { to: e }); };

  // ---- conversations: one open per connection, with the options it was shown ----
  const decir = (e: number, n: Pnj, nodo: string): string => {
    const texto = n.dialogo.nodos[nodo].texto;
    try { return corta(o.frasear?.({ pnj: n.id, nodo, texto, jugador: M?.who(e)?.nombre ?? "" }) || texto, LIM.linea); } catch { return texto; } // the written line is the fallback
  };
  const abrir = (e: number, n: Pnj, nodo: string) => {
    const vistas = opcionesDe(n.dialogo.nodos[nodo], prog(e), A);
    abiertos.set(e, { pnj: n.id, vistas });
    P?.emit("dialogo", { pnj: n.id, nombre: n.nombre, texto: decir(e, n, nodo), o1: vistas[0]?.texto ?? "", o2: vistas[1]?.texto ?? "", o3: vistas[2]?.texto ?? "", o4: vistas[3]?.texto ?? "" }, { to: e });
  };
  const cerrar = (e: number, n: Pnj) => { abiertos.delete(e); P?.emit("fin", { pnj: n.id, nombre: n.nombre }, { to: e }); };
  const hacer = (e: number, n: Pnj, ac: Exclude<Accion, { tipo: "despedir" }>): { ok: true } | { ok: false; motivo: string } => {
    const m = A.misiones.get(ac.mision);
    if (!m) return { ok: false, motivo: "Esa misión ya no existe." };
    const p = prog(e);
    if (ac.tipo === "dar_mision") return tomar(e, p, m);
    const x: Suceso = ac.tipo === "avanzar_paso" ? { tipo: "avanzar", pnj: n.id, mision: m.id, ahora: ahora() } : { tipo: "entregar", pnj: n.id, mision: m.id, ahora: ahora() };
    const h = registrar(p, A, x);
    if (!h.length) { const w = esperando(p, A, x); return { ok: false, motivo: w ? todaviaNo(w) : ac.tipo === "avanzar_paso" ? "Eso ahora no toca." : `No llevas lo que ${n.nombre} espera.` }; }
    tras(e, p, h);
    return { ok: true };
  };

  const pnjPart = serverPart(pnjDecl, (api) => {
    P = api;
    cargar(api);
    for (const n of A.pnjs.values()) {
      api.state.set(n.id, { nombre: n.nombre, descripcion: n.descripcion, x: n.posicion.x, z: n.posicion.z, y: n.posicion.y, giro: n.giro, radio: n.radio, modelo: n.apariencia.modelo, escala: n.apariencia.escala, oficio: n.oficio }, { at: { x: n.posicion.x, z: n.posicion.z } });
    }
    api.on("hablar", (e, msg) => {
      const n = A.pnjs.get(String(msg.pnj));
      if (!n) return rechazarP(e, "No hay nadie así por aquí.");
      if (!api.within(e, n.id)) return rechazarP(e, `Acércate a ${n.nombre} para hablar.`);
      const p = prog(e), x: Suceso = { tipo: "habla", pnj: n.id, ahora: ahora() };
      const h = registrar(p, A, x); // steps that complete just by talking
      if (h.length) tras(e, p, h);
      else { const w = esperando(p, A, x); if (w) M?.emit("aviso", { texto: todaviaNo(w) }, { to: e }); } // U14 (5): it still waits
      abrir(e, n, nodoInicial(n, p, A));
    });
    api.on("elegir", (e, msg) => {
      const d = abiertos.get(e), n = A.pnjs.get(String(msg.pnj));
      if (!d || !n || d.pnj !== n.id) return rechazarP(e, "No estás hablando con esa persona.");
      if (!api.within(e, n.id)) { cerrar(e, n); return rechazarP(e, `Te has alejado de ${n.nombre}.`); }
      const op = d.vistas[Number(msg.opcion) - 1];
      if (!op) return rechazarP(e, "Esa respuesta no está.");
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
    for (const c of A.cosas.values()) {
      api.state.set(c.id, { nombre: c.nombre, descripcion: c.descripcion, x: c.posicion.x, z: c.posicion.z, radio: c.radio, aviso: c.aviso, modelo: c.apariencia.modelo, escala: c.apariencia.escala, y: c.posicion.y, color: c.apariencia.color, modeloUsada: c.apariencia.usada?.modelo ?? "", escalaUsada: c.apariencia.usada?.escala ?? c.apariencia.escala }, { at: { x: c.posicion.x, z: c.posicion.z } }); // U14 (6): the used look travels with it; each page picks by its own book
    }
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
      claveDe.delete(e); llegadas.delete(e); esperas.delete(e);
      if (k && ![...claveDe.values()].includes(k)) progresos.delete(k); // saved in the store already
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
      if (!dadores.some((id) => P?.within(e, id))) return rechazarM(e, `Esa misión la da ${dadores.map((id) => A.pnjs.get(id)?.nombre ?? id).join(" o ") || "alguien que no está"}: acércate a hablar.`);
      const r = tomar(e, prog(e), m);
      if (!r.ok) rechazarM(e, r.motivo);
    });
    api.on("abandonar", (e, msg) => {
      const p = prog(e), id = String(msg.mision);
      if (!abandonar(p, id)) return rechazarM(e, "No tienes esa misión activa.");
      guardar(e, p);
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
      const h = registrar(p, A, x);
      if (!h.length) { const w = esperando(p, A, x); return rechazarM(e, w ? todaviaNo(w) : `Ahora no te hace falta ${c.nombre}.`); } // U14 (5): too early
      tras(e, p, h);
    });
    // cheap per tick: only players on a llega_a step, each one every LLEGADA_CADA ticks; open conversations likewise;
    // U14 (5): and the connections with a wait, whose book (with its marks) goes again once, when the wait ends
    api.onTick((t) => {
      for (const e of llegadas) {
        if ((e + t) % LLEGADA_CADA !== 0) continue;
        const pos = api.position(e);
        if (!pos) continue;
        const p = prog(e), h = registrar(p, A, { tipo: "llega", x: pos.x, z: pos.z, y: pos.y, ahora: ahora() }); // y: a llega_a with a height asks for the right floor
        if (h.length) tras(e, p, h);
      }
      if (esperas.size && t % LLEGADA_CADA === 0) {
        const ya = ahora();
        for (const [e, vence] of esperas) {
          if (ya < vence) continue;
          enviarLibro(e, true); // this connection only: each of the player's tabs has its own entry
          const otra = proximaEspera(prog(e), A, ya);
          if (otra === null) esperas.delete(e); else esperas.set(e, otra);
        }
      }
      for (const [e, d] of abiertos) {
        if ((e + t) % LLEGADA_CADA !== 0) continue;
        const n = A.pnjs.get(d.pnj), pos = api.position(e);
        if (n && pos && (pos.x - n.posicion.x) ** 2 + (pos.z - n.posicion.z) ** 2 <= (n.radio + ALEJARSE_M) ** 2) continue;
        if (n) cerrar(e, n); else abiertos.delete(e);
      }
    });
  });

  return [pnjPart, misionesPart];
}

export default crearMisiones();
