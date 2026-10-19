// misiones — client part (J5): draws the people (pnj) and the quest things, keeps THIS player's quest book (built from
// events that reach only them) and offers one small controller that the page (apps/plaza: dialogue box, book, prompt)
// and agents use. It only asks: the server decides every step.
// U14 (5): it also plays the sequences the server sends this player alone (secuencia.ts) and counts down a step's wait.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { pnj as pnjDecl, misiones as misionesDecl } from "./feature.ts";
import biblioteca from "../objetos/biblioteca.json" with { type: "json" };
import type { Escenario, Pose, SecuenciaVista, SucesoSecuencia } from "./secuencia.ts"; // U14 (5): a moment only you see (loaded when one comes)

const modelo = (id: string) => biblioteca.modelos.find((m) => m.id === id)?.modelo ?? "";
const ROBOT = modelo("robot"), BLOQUE = modelo("bloque");
/** The house robot is ~4.6 m tall as it comes; people of the world stand ~1.8 m. */
export const ESCALA_ROBOT = 0.4;
/** Where a person's name floats: above the head of a 1.8 m figure, scaled with it. */
export const ALTO_NOMBRE = 2.25;

/** How a person of the world looks TODAY: a library model at its place (the house robot by default) and at its height
 * (`y`: the floor it stands on; 0 = the ground), still (no idle animation: phones stay cool). The avatar branch (VRM)
 * replaces this one function. U14 (4): its label carries the trade (`oficio`) as a second line and the mark the server
 * decided for you («!» / «✓», above the name). */
export function aspectoPnj(v: Msg, marca: Marca = ""): { cuerpo: PlacedObject; nombre: { text: string; sub?: string; mark?: Marca; x: number; y: number; z: number } } {
  const propio = String(v.modelo ?? ""), e = Number(v.escala) * (propio ? 1 : ESCALA_ROBOT), y = Number(v.y) || 0, oficio = String(v.oficio ?? "");
  return {
    cuerpo: { model: propio || ROBOT, x: Number(v.x), y, z: Number(v.z), rx: 0, ry: Number(v.giro), rz: 0, sx: e, sy: e, sz: e, animate: false },
    nombre: { text: String(v.nombre), ...(oficio ? { sub: oficio } : {}), ...(marca ? { mark: marca } : {}), x: Number(v.x), y: y + ALTO_NOMBRE * Number(v.escala), z: Number(v.z) },
  };
}
/** How a quest thing looks: its model, or the house block (a small crate); at its height (y) and in its colour. U14 (6):
 * `usada` = this player has used it (usadasDe): then its used look (cosa@1 apariencia.usada — the chest open), if any. */
export const aspectoCosa = (v: Msg, usada = false): PlacedObject & { color?: string } => {
  const otro = usada ? String(v.modeloUsada ?? "") : "", e = Number(otro ? v.escalaUsada : v.escala), color = String(v.color ?? "");
  return { model: otro || String(v.modelo ?? "") || BLOQUE, x: Number(v.x), y: Number(v.y) || 0, z: Number(v.z), rx: 0, ry: 0, rz: 0, sx: e, sy: e, sz: e, animate: false, ...(color ? { color } : {}) };
};

// ---- U14 (4): marks the server decides for each player: «!» = has something for you now, «✓» = you are done with them ----
export type Marca = "!" | "✓" | "";
/** As the `marcas` event brings them: tiene = people with «!», hecho = people with «✓», cosas = things with «!» (ids). */
export type Marcas = { tiene: string[]; hecho: string[]; cosas: string[] };
/** A quest thing's label, only while it carries a mark: its name and the «!» over its top (the house block stands 1 m
 * tall at escala 1; a model of its own, about as tall as its escala). */
export const etiquetaCosa = (v: Msg): { text: string; mark: Marca; x: number; y: number; z: number } =>
  ({ text: String(v.nombre), mark: "!", x: Number(v.x), y: (Number(v.y) || 0) + Number(v.escala) + 0.5, z: Number(v.z) });

/** `espera` (U14 (5)): the seconds this step still waited when the book came (0 = it may be done); `listoEn` = when it
 * opens on this page's clock (ms; 0 = no wait). The server sends the book again when it opens. */
export type PasoVista = { n: number; texto: string; tipo: string; hecho: boolean; x: number; z: number; donde: string; que: string; grupo: string; espera: number; listoEn: number };
export type MisionVista = { id: string; titulo: string; descripcion: string; estado: "activa" | "hecha"; paso: number; pasos: number; seguida: boolean; recompensa: string; lista: PasoVista[] };
export type Objetivo = { mision: string; paso: number; nombre: string; texto: string; x: number; z: number; seguida: boolean };
export type Dialogo = { pnj: string; nombre: string; oficio: string; texto: string; opciones: string[] };
type Res = { ok: true } | { ok: false; why: string };

/** The current block of a quest: the step at `paso` (the first still to do) and, when it has a grupo, the consecutive
 * steps around it with the same grupo, done or not (U14: those are done in any order). */
export function bloqueDe(m: MisionVista): PasoVista[] {
  const i = m.lista.findIndex((s) => s.n === m.paso), g = m.lista[i]?.grupo;
  if (i < 0) return [];
  if (!g) return [m.lista[i]];
  let a = i, b = i + 1;
  while (a > 0 && m.lista[a - 1].grupo === g && m.lista[a - 1].n === m.lista[a].n - 1) a--;
  while (b < m.lista.length && m.lista[b].grupo === g && m.lista[b].n === m.lista[b - 1].n + 1) b++;
  return m.lista.slice(a, b);
}
/** What is to do now in an active quest: every step of its current block not done yet (outside a grupo, just one) and
 * not waiting (U14 (5): a step with `espera` left is locked until the server says it opened). */
export const ahoraDe = (m: MisionVista): PasoVista[] => porHacer(m).filter((s) => !(s.espera > 0));
/** U14 (5): the steps of the current block not done yet, waiting or not: what the page lets you try (one that still
 * waits answers «Todavía no: …», so pressing E on the chest during the flight says why). */
export const porHacer = (m: MisionVista): PasoVista[] => (m.estado === "activa" ? bloqueDe(m).filter((s) => !s.hecho) : []);

/** U14 (6): the quest things THIS player has used — a `usa` or `coge` step done in a quest of their book (active or
 * completed), by the thing's id. Pure: from the player's own book, so two players on one server see a thing differently. */
export function usadasDe(libro: Iterable<MisionVista>): Set<string> {
  const out = new Set<string>();
  for (const m of libro) for (const s of m.lista) if ((s.tipo === "usa" || s.tipo === "coge") && s.que && (s.hecho || m.estado === "hecha")) out.add(s.que);
  return out;
}

/** One per page (tests make one per client). `misiones` is what the page's panels and an agent call. `reloj` (U14 (5),
 * ms): the page's clock, for the countdowns and the sequences (tests pass their own). */
export function crearCliente(o: { reloj?: () => number } = {}) {
  const reloj = o.reloj ?? (() => performance.now());
  let P: ClientApi | null = null, M: ClientApi | null = null;
  const libro = new Map<string, MisionVista>();
  let dialogo: Dialogo | null = null;
  const estado = { ultimoRechazo: "", ultimoAviso: "", nota: "" }; // nota: the last thing worth showing on screen (the page's toast)
  const oyentes = new Set<(que: "libro" | "dialogo" | "nota") => void>();
  const avisar = (que: "libro" | "dialogo" | "nota") => { for (const f of oyentes) { try { f(que); } catch { /* a panel's problem is its own */ } } };
  const nota = (t: string) => { estado.nota = t; avisar("nota"); };
  const sin = (why: string): Res => ({ ok: false, why });

  // ---- U14 (5): a sequence only this player sees (secuencia.ts): the people it moves are drawn on this page alone and
  // stand again where the server says when it ends; its extra models; its lines go to the note and, with its sounds, to
  // whoever listens (the page reads the lines aloud and plays the sounds). The player is its own chunk, loaded when the
  // first sequence arrives (a page that never sees one never fetches it); what arrives meanwhile waits, in order. ----
  const oyentesSec = new Set<(s: SucesoSecuencia) => void>();
  const conPose = (v: Msg, pose: Pose | null): Msg => (pose ? { ...v, x: pose.x, y: pose.y, z: pose.z, giro: pose.giro } : v);
  const escenario: Escenario = {
    reloj,
    persona: (pnj) => { const v = P?.state.get(pnj); return v ? { x: Number(v.x), y: Number(v.y) || 0, z: Number(v.z), giro: Number(v.giro) || 0, escala: Number(v.escala) || 1 } : null; },
    moverPersona: (pnj, pose) => {
      const v = P?.state.get(pnj);
      if (!v || !P) return; // not drawn on this page (any more): nothing to move, nothing to put back
      const look = aspectoPnj(conPose(v, pose), marcaDe("pnj", pnj));
      P.view.place?.(`pnj:${pnj}`, look.cuerpo);
      P.view.tag?.(`pnj:${pnj}`, look.nombre);
    },
    colocar: (key, x) => (M ?? P)?.view.place?.(key, x),
    oir: (s) => {
      if (s.tipo === "texto") nota(s.texto);
      for (const f of oyentesSec) { try { f(s); } catch { /* a listener's problem is its own */ } }
    },
  };
  let rep: ReturnType<typeof import("./secuencia.ts").crearReproductor> | null = null;
  let piezas: ReturnType<typeof import("./secuencia.ts").montador> | null = null;
  let cargando: Promise<unknown> | null = null;
  const esperan: [string, Msg][] = [];
  const recibirSec = (ev: string, m: Msg): void => {
    if (rep && piezas) { const s = piezas.recibir(ev, m); if (s) rep.poner(s); return; }
    esperan.push([ev, m]);
    cargando ??= import("./secuencia.ts").then((x) => {
      piezas = x.montador(); rep = x.crearReproductor(escenario);
      for (const [e, msg] of esperan.splice(0)) recibirSec(e, msg);
    }).catch((e) => { cargando = null; esperan.length = 0; console.warn(`[misiones] no se pudo cargar la secuencia: ${(e as Error)?.message ?? e}`); });
  };

  // U14 (4): the marks the server decided for THIS player. `marcas` is a new frozen object only when they change (a map
  // can tell by identity); a label is drawn again only for whoever's mark changed, and a quest thing has one only while
  // it is marked
  let marcas: Readonly<Marcas> = Object.freeze({ tiene: [], hecho: [], cosas: [] }), marcasFirma = "||";
  let marcaP = new Map<string, Marca>(), marcaC = new Set<string>();
  const conRotulo = new Set<string>(); // the quest things that have a label now
  const marcaDe = (feature: string, key: string): Marca => (feature === "pnj" ? marcaP.get(key) ?? "" : feature === "misiones" && marcaC.has(key) ? "!" : "");
  const rotularPnj = (key: string) => { const v = P?.state.get(key); if (v) P!.view.tag?.(`pnj:${key}`, aspectoPnj(conPose(v, rep?.poseDe(key) ?? null), marcaDe("pnj", key)).nombre); }; // U14 (5): where a sequence has it
  const rotularCosa = (key: string) => {
    const v = M?.state.get(key), si = !!v && marcaC.has(key);
    if (si) { conRotulo.add(key); M!.view.tag?.(`misiones:${key}`, etiquetaCosa(v!)); }
    else if (conRotulo.delete(key)) M?.view.tag?.(`misiones:${key}`, null);
  };
  const recibirMarcas = (m: Msg) => {
    const firma = `${String(m.tiene ?? "")}|${String(m.hecho ?? "")}|${String(m.cosas ?? "")}`;
    if (firma === marcasFirma) return; // the same as before (every book brings them): nothing to draw
    const ids = (s: unknown) => String(s ?? "").split(",").filter(Boolean);
    marcasFirma = firma;
    marcas = Object.freeze({ tiene: ids(m.tiene), hecho: ids(m.hecho), cosas: ids(m.cosas) });
    const antesP = marcaP, antesC = marcaC;
    marcaP = new Map([...marcas.hecho.map((k) => [k, "✓"] as const), ...marcas.tiene.map((k) => [k, "!"] as const)]); // «!» wins
    marcaC = new Set(marcas.cosas);
    for (const k of new Set([...antesP.keys(), ...marcaP.keys()])) if (antesP.get(k) !== marcaP.get(k)) rotularPnj(k);
    for (const k of new Set([...antesC, ...marcaC])) if (antesC.has(k) !== marcaC.has(k)) rotularCosa(k);
  };

  // U14 (6): the quest things you used look «used» for you (cosa@1 apariencia.usada: the chest open); the others' pages
  // decide from their own books. Worked out again only once a book has arrived WHOLE (`libro` says how many quests come,
  // each `mision` how many steps), so a thing never flips back and forth while a book arrives; a thing is drawn again
  // only when its look changes, and only if it has a used look at all. Quests are counted as they come, not by id: a
  // repeatable quest done and taken again comes twice under one id
  let usadas: ReadonlySet<string> = new Set(), esperadas = -1, llegadas = 0;
  const libroEntero = () => esperadas >= 0 && llegadas >= esperadas && [...libro.values()].every((m) => m.lista.length === m.pasos);
  const revisarUsadas = () => {
    if (!libroEntero()) return;
    const antes = usadas, ahora = usadasDe(libro.values());
    usadas = ahora;
    for (const k of new Set([...antes, ...ahora])) {
      const v = M?.state.get(k);
      if (antes.has(k) !== ahora.has(k) && v && String(v.modeloUsada ?? "")) M!.view.place?.(`misiones:${k}`, aspectoCosa(v, ahora.has(k)));
    }
  };

  const actual = (m: MisionVista): PasoVista | undefined => m.lista.find((s) => s.n === m.paso);
  const misiones = {
    estado,
    /** The book as it arrived: active quests first, then the completed ones. */
    libro: (): MisionVista[] => [...libro.values()],
    /** Where each active quest's steps to do now point — every one of its current block (for the map: mapa reads this). */
    objetivos: (): Objetivo[] => [...libro.values()].flatMap((m) => ahoraDe(m).map((s) => ({ mision: m.id, paso: s.n, nombre: s.donde, texto: s.texto, x: s.x, z: s.z, seguida: m.seguida }))),
    /** For the player sheet: how many, the badges, and what is being followed (with its grupo's counter, if any). */
    resumen: () => {
      const todas = [...libro.values()], seg = todas.find((m) => m.seguida && m.estado === "activa"), s = seg && actual(seg), b = seg ? bloqueDe(seg) : [];
      return {
        activas: todas.filter((m) => m.estado === "activa").length,
        hechas: todas.filter((m) => m.estado === "hecha").length,
        insignias: todas.filter((m) => m.estado === "hecha" && m.recompensa).map((m) => m.recompensa),
        seguida: seg ? {
          mision: seg.id, titulo: seg.titulo, paso: seg.paso + 1, pasos: seg.pasos, texto: s?.texto ?? "", donde: s?.donde ?? "",
          grupo: b[0]?.grupo ? { nombre: b[0].grupo, hechos: b.filter((x) => x.hecho).length, total: b.length } : null,
        } : null,
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
    /** Whether the page should offer «E: …» for a thing: quest things only while a step to do now needs them (U14 (5):
     * also while that step still waits — trying it says how long is left). */
    ofrece: (feature: string, key: string): boolean => feature !== "misiones" || [...libro.values()].some((m) => porHacer(m).some((s) => s.que === key && (s.tipo === "coge" || s.tipo === "usa"))),
    /** U14 (5): the sequence playing now (id, second, length, the people it moves, the extra models shown, its last line,
     * how many wait behind it), or null. */
    secuencia: (): SecuenciaVista | null => rep?.ahora() ?? null,
    /** U14 (5): advance the sequence to now. The page calls it every frame and keeps drawing while it answers true; with
     * none playing it answers false at once and does nothing. It never touches the camera. */
    cuadro: (): boolean => rep?.cuadro() ?? false,
    /** U14 (5): hear a sequence start, say a line, ask for a house sound and end; returns how to stop. */
    alSecuencia: (fn: (s: SucesoSecuencia) => void) => { oyentesSec.add(fn); return () => oyentesSec.delete(fn); },

    /** U14 (4): your marks as the server decided them — tiene = people with «!», hecho = people with «✓», cosas = things
     * with «!» (ids). The same object until they change. */
    marcas: (): Readonly<Marcas> => marcas,
    /** The mark over a person (`pnj`) or a quest thing (`misiones`) for you: "!", "✓" or "" (the map draws it). */
    marcaDe,
    /** U14 (6): the quest things you have used (they show their used look for you, if they have one), by id. */
    usadas: (): string[] => [...usadas],
    /** A person's trade («Carpintero»; "" = none, or not near enough to be known), for the map's list. */
    oficioDe: (pnj: string): string => String(P?.state.get(pnj)?.oficio ?? ""),
    /** pnj@1 `voz` of a person ("" = none said: the page picks one from its id, always the same). */
    vozDe: (pnj: string): string => String(P?.state.get(pnj)?.voz ?? ""),
    /** Where a person stands now (a sequence playing moves it: its pose wins), or null if this page does not draw it. */
    personaDe: (pnj: string): { x: number; y: number; z: number; escala: number } | null => {
      const v = escenario.persona(pnj);
      if (!v) return null;
      const pose = rep?.poseDe(pnj) ?? null;
      return pose ? { x: pose.x, y: pose.y, z: pose.z, escala: v.escala } : { x: v.x, y: v.y, z: v.z, escala: v.escala };
    },
    /** Call `fn` when the book, the conversation or the on-screen note changes; returns how to stop. */
    alCambiar: (fn: (que: "libro" | "dialogo" | "nota") => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const pnjPart = clientPart(pnjDecl, (a) => {
    P = a;
    a.state.onChange((key, v) => {
      if (!v) { a.view.place?.(`pnj:${key}`, null); a.view.tag?.(`pnj:${key}`, null); return; }
      const look = aspectoPnj(conPose(v, rep?.poseDe(key) ?? null), marcaDe("pnj", key)); // U14 (5): a sequence playing keeps it where it has it
      a.view.place?.(`pnj:${key}`, look.cuerpo);
      a.view.tag?.(`pnj:${key}`, look.nombre);
    });
    a.on("dialogo", (m) => {
      dialogo = { pnj: String(m.pnj), nombre: String(m.nombre), oficio: String(a.state.get(String(m.pnj))?.oficio ?? ""), texto: String(m.texto), opciones: [m.o1, m.o2, m.o3, m.o4].map(String).filter(Boolean) };
      avisar("dialogo");
    });
    a.on("fin", (m) => { if (dialogo?.pnj === String(m.pnj)) { dialogo = null; avisar("dialogo"); } });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); avisar("dialogo"); nota(String(m.motivo)); });
  });

  const misionesPart = clientPart(misionesDecl, (a) => {
    M = a;
    for (const ev of ["secuencia", "pista", "clave"]) a.on(ev, (m) => recibirSec(ev, m)); // U14 (5)
    a.state.onChange((key, v) => {
      a.view.place?.(`misiones:${key}`, v ? aspectoCosa(v, usadas.has(key)) : null); // J4: <feature>:<key>, so a click is understood; U14 (6): your look of it
      rotularCosa(key); // U14 (4): a label only while the server marks it for you
    });
    a.on("libro", (m) => { libro.clear(); esperadas = Number(m.activas) + Number(m.hechas); llegadas = 0; avisar("libro"); revisarUsadas(); });
    a.on("mision", (m) => {
      llegadas++;
      libro.set(String(m.id), { id: String(m.id), titulo: String(m.titulo), descripcion: String(m.descripcion), estado: m.estado === "hecha" ? "hecha" : "activa", paso: Number(m.paso), pasos: Number(m.pasos), seguida: m.seguida === true, recompensa: String(m.recompensa ?? ""), lista: [] });
      avisar("libro");
    });
    a.on("paso", (m) => {
      const mv = libro.get(String(m.mision));
      if (!mv) return;
      const espera = Math.max(0, Number(m.espera ?? 0) || 0); // U14 (5): seconds left; counted down here, the server resends the book when it opens
      const s: PasoVista = { n: Number(m.n), texto: String(m.texto), tipo: String(m.tipo), hecho: m.hecho === true, x: Number(m.x), z: Number(m.z), donde: String(m.donde), que: String(m.que ?? ""), grupo: String(m.grupo ?? ""), espera, listoEn: espera ? reloj() + espera * 1000 : 0 };
      mv.lista = [...mv.lista.filter((x) => x.n !== s.n), s].sort((p, q) => p.n - q.n);
      avisar("libro");
      revisarUsadas(); // U14 (6): the book's last step has arrived → the used looks
    });
    a.on("aceptada", (m) => nota(`Misión nueva: ${String(m.titulo)}`));
    a.on("avance", (m) => nota(`✓ ${String(m.texto)}`));
    a.on("completada", (m) => nota(`¡Misión completada! ${String(m.titulo)}${m.recompensa ? ` · ${String(m.recompensa)}` : ""}`));
    a.on("aviso", (m) => { estado.ultimoAviso = String(m.texto); nota(String(m.texto)); });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); nota(String(m.motivo)); });
    a.on("marcas", recibirMarcas); // U14 (4)
  });

  const parts: ClientPart[] = [pnjPart, misionesPart];
  return { parts, misiones };
}

const pagina = crearCliente();
/** The page's controller (apps/plaza mounts the dialogue box, the book and the prompt on it; agents call it too). */
export const misiones = pagina.misiones;
export default pagina.parts;
