// misiones — server part (J5 + the J4 core). People (pnj) and quest things (misiones) come from the adventure's files
// and are put in the world with `at` (only near players get them, J9). Dialogue and quest progress are decided here:
// distances (api.within), step conditions and positions (api.position) are checked by this file, so a page can never
// complete a step by asking. Progress is kept per guest (I1) in the store (S4) and reaches only its owner.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi, ServerPart } from "../../packages/feature/src/index.ts";
import { pnj as pnjDecl, misiones as misionesDecl } from "./feature.ts";
import { cargarAventura, corta, LIM } from "./formato.ts";
import type { Accion, Aventura, Fichero, Mision, Opcion, Pnj } from "./formato.ts";
import { abandonar, aceptar, esperaLlegada, leerProgreso, nodoInicial, nuevoProgreso, objetivo, opcionesDe, registrar, seguir } from "./maquina.ts";
import type { Hecho, Progreso } from "./maquina.ts";

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
export type OpcionesMisiones = { aventura?: { misiones: Fichero[]; pnj: Fichero[]; cosas: Fichero[] }; frasear?: Frasear };

/** One engine behind two features: [pnj, misiones]. `aventura` only for tests; the server reads AVENTURA_DIR. */
export function crearMisiones(o: OpcionesMisiones = {}): ServerPart[] {
  let A: Aventura = { misiones: new Map(), pnjs: new Map(), cosas: new Map(), dadores: new Map(), explicitos: new Map() };
  let P: ServerApi | null = null, M: ServerApi | null = null;
  let cargada = false;
  const progresos = new Map<string, Progreso>();      // "g:<guest>" (saved) or "e<entity>" (no identity: memory only)
  const claveDe = new Map<number, string>();          // entity -> its progress key (who() is gone by onLeave)
  const abiertos = new Map<number, { pnj: string; vistas: Opcion[] }>(); // open conversations
  const llegadas = new Set<number>();                 // players whose current step somewhere is llega_a

  const cargar = (api: ServerApi) => {
    if (cargada) return;
    cargada = true;
    const r = cargarAventura(o.aventura ?? { misiones: api.aventura("misiones"), pnj: api.aventura("pnj"), cosas: api.aventura("cosas") });
    for (const i of r.issues) api.log(`aventura: ${i.path}: ${i.message}`);
    A = r.aventura;
    if (A.misiones.size + A.pnjs.size + A.cosas.size) api.log(`aventura: ${A.misiones.size} misiones, ${A.pnjs.size} personas, ${A.cosas.size} cosas`);
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

  // ---- the book: sent whole on entering and after each change, only to its owner ----
  const recompensa = (m: Mision) => corta(m.recompensas.map((r) => `Insignia «${r.nombre}»`).join(", "), 120);
  const enviarMision = (to: number, p: Progreso, m: Mision) => {
    const act = p.activas[m.id], hecha = !act, ahora = hecha ? m.pasos.length : Math.min(act.paso, m.pasos.length - 1);
    M!.emit("mision", { id: m.id, titulo: m.titulo, descripcion: m.descripcion, estado: hecha ? "hecha" : "activa", paso: ahora, pasos: m.pasos.length, seguida: p.seguida === m.id, recompensa: recompensa(m) }, { to });
    m.pasos.forEach((s, n) => {
      const ob = objetivo(s, A);
      M!.emit("paso", { mision: m.id, n, texto: s.texto, tipo: s.tipo, hecho: hecha || n < ahora, x: ob.x, z: ob.z, donde: corta(ob.nombre, LIM.lugar), que: ob.que }, { to });
    });
  };
  const enviarLibro = (e: number, solo = false) => {
    if (!M) return;
    const p = prog(e);
    const activas = Object.keys(p.activas).map((id) => A.misiones.get(id)).filter((m): m is Mision => !!m);
    const hechas = p.hechas.map((id) => A.misiones.get(id)).filter((m): m is Mision => !!m).slice(-LIBRO_HECHAS);
    for (const x of solo ? [e] : suyos(e)) {
      M.emit("libro", { activas: activas.length, hechas: hechas.length }, { to: x });
      for (const m of [...activas, ...hechas]) enviarMision(x, p, m);
    }
  };
  /** After steps were completed: save, tell (announced), resend the book, re-arm the arrival checks. */
  const tras = (e: number, p: Progreso, hechos: Hecho[]) => {
    guardar(e, p);
    for (const h of hechos) {
      const m = A.misiones.get(h.mision)!;
      for (const x of suyos(e)) {
        M!.emit("avance", { mision: m.id, texto: m.pasos[h.paso].texto }, { to: x });
        if (h.completada) M!.emit("completada", { mision: m.id, titulo: m.titulo, texto: m.textos.completada, recompensa: recompensa(m) }, { to: x });
      }
    }
    enviarLibro(e);
    revisarLlegadas(e);
  };
  const tomar = (e: number, p: Progreso, m: Mision): { ok: true } | { ok: false; motivo: string } => {
    const r = aceptar(p, m, A);
    if (!r.ok) return r;
    guardar(e, p);
    for (const x of suyos(e)) M!.emit("aceptada", { mision: m.id, titulo: m.titulo, texto: m.textos.aceptada }, { to: x });
    enviarLibro(e);
    revisarLlegadas(e);
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
    const h = registrar(p, A, ac.tipo === "avanzar_paso" ? { tipo: "avanzar", pnj: n.id, mision: m.id } : { tipo: "entregar", pnj: n.id, mision: m.id });
    if (!h.length) return { ok: false, motivo: ac.tipo === "avanzar_paso" ? "Eso ahora no toca." : `No llevas lo que ${n.nombre} espera.` };
    tras(e, p, h);
    return { ok: true };
  };

  const pnjPart = serverPart(pnjDecl, (api) => {
    P = api;
    cargar(api);
    for (const n of A.pnjs.values()) {
      api.state.set(n.id, { nombre: n.nombre, descripcion: n.descripcion, x: n.posicion.x, z: n.posicion.z, giro: n.giro, radio: n.radio, modelo: n.apariencia.modelo, escala: n.apariencia.escala }, { at: n.posicion });
    }
    api.on("hablar", (e, msg) => {
      const n = A.pnjs.get(String(msg.pnj));
      if (!n) return rechazarP(e, "No hay nadie así por aquí.");
      if (!api.within(e, n.id)) return rechazarP(e, `Acércate a ${n.nombre} para hablar.`);
      const p = prog(e);
      const h = registrar(p, A, { tipo: "habla", pnj: n.id }); // steps that complete just by talking
      if (h.length) tras(e, p, h);
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
      api.state.set(c.id, { nombre: c.nombre, descripcion: c.descripcion, x: c.posicion.x, z: c.posicion.z, radio: c.radio, aviso: c.aviso, modelo: c.apariencia.modelo, escala: c.apariencia.escala }, { at: c.posicion });
    }
    api.onIdentify((e) => {
      const antes = claveDe.get(e);
      if (antes?.startsWith("e")) progresos.delete(antes); // what it did before saying who it is is not kept
      clave(e);
      enviarLibro(e, true);
      revisarLlegadas(e);
    });
    api.onLeave((e) => {
      const k = claveDe.get(e);
      claveDe.delete(e); llegadas.delete(e);
      if (k && ![...claveDe.values()].includes(k)) progresos.delete(k); // saved in the store already
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
      const p = prog(e);
      const h = registrar(p, A, { tipo: "usa", cosa: c.id });
      if (!h.length) return rechazarM(e, `Ahora no te hace falta ${c.nombre}.`);
      tras(e, p, h);
    });
    // cheap per tick: only players on a llega_a step, each one every LLEGADA_CADA ticks; open conversations likewise
    api.onTick((t) => {
      for (const e of llegadas) {
        if ((e + t) % LLEGADA_CADA !== 0) continue;
        const pos = api.position(e);
        if (!pos) continue;
        const p = prog(e), h = registrar(p, A, { tipo: "llega", x: pos.x, z: pos.z });
        if (h.length) tras(e, p, h);
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
