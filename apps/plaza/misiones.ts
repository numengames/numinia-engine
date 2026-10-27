// J5 on the page: the quest book (key J or the «Misiones» button): active quests with their steps, «Seguir» (a column
// of light over the target, and the map gets it from objetivos()), «Abandonar», and the completed ones with what they
// gave. Plus a small line with the tracked step at the top of the screen and a short note when something happens.
// Everything is real HTML (buttons, headings, lists): keyboards and screen readers use it as is.
// Steps of a grupo (U14) are done in any order: all the ones still to do of the current block show as «now», and the
// top line shows the block's counter («Piezas reunidas 1/3») and the nearest of them.
// U14 (3), the TRG26 spec's states: every step is done (a green check, dimmed), to do now (a marker in the world's
// emphasis colour, full strength) or locked (a lock, dimmed: it comes after the current block). The book opens by
// itself when you accept a quest, once the conversation has closed — never in VR (its panel lists the same states) and
// without taking the keyboard (you keep walking; J or «Cerrar» closes it). Getting a thing puts its icon in the note,
// and every step done plays a short positive sound.
// U14 (5): a step that still waits shows locked with its countdown («· en 7 s», in the book and the top line), and a
// sequence the server sent you (features/misiones/secuencia.ts) has its lines read aloud and its house sounds played.
import { escribiendo } from "./interactuar.ts";
import { icono } from "./iconos.ts";
import { anunciar } from "./paneles.ts";
import { esTactil, perfil } from "./perfil-aparato.ts"; // U25: touch controls or not, one answer for the whole page
import { cercaDeAlguien } from "../../packages/client/src/movil.ts"; // U24: no «pulsa E» on a phone
import { audio } from "../../packages/render/src/audio/nucleo.ts"; // S1: one audio graph for the whole engine

type Res = { ok: true } | { ok: false; why: string };
type Paso = { n: number; texto: string; hecho: boolean; donde: string; tipo?: string; espera?: number; listoEn?: number };
type Mision = { id: string; titulo: string; descripcion: string; estado: "activa" | "hecha"; paso: number; pasos: number; seguida: boolean; recompensa: string; lista: Paso[] };
type Objetivo = { mision: string; paso: number; nombre: string; texto: string; x: number; z: number; seguida: boolean };
type Grupo = { nombre: string; hechos: number; total: number };
type Ctl = {
  libro(): Mision[]; objetivos(): Objetivo[]; seguir(id: string): Res; abandonar(id: string): Res; estado: { nota: string };
  resumen(): { seguida: { mision: string; grupo: Grupo | null } | null };
  dialogo(): unknown;
  alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown;
  alSecuencia?(fn: (s: { tipo: string; texto?: string; sonido?: string }) => void): unknown; // U14 (5)
};
type Lugar = { beacon(x: number, z: number, text: string, ms: number): void; rayoDestello?(): void; vr?: { active: boolean } };
/** Hear every event the server sends this page (main.ts: session.features.tap): the book wants «aceptada» and «avance». */
type Oir = (fn: (feature: string, event: string, msg: Record<string, unknown>) => void) => void;

/** How long the column of light stays when you start following something (it costs drawing: phones stay cool). */
export const BALIZA_MS = 15_000;

/** A step's state in the book and in the VR panel (the TRG26 spec, §3: completado, disponible, pendiente/bloqueado). */
export type EstadoPaso = "hecho" | "ahora" | "bloqueado";
/** How each state reads: the word for screen readers (aria-label), the house icon on the page («ahora» is a dot drawn
 * by tema.css in the world's emphasis colour) and the mark on the VR panel (plain glyphs, no emoji font). */
export const ESTADOS: Record<EstadoPaso, { dice: string; icono: string; vr: string }> = {
  hecho: { dice: "Hecho", icono: "check", vr: "✓" },
  ahora: { dice: "Ahora", icono: "", vr: "→" },
  bloqueado: { dice: "Bloqueado", icono: "lock-key", vr: "□" },
};
/** «<quest>:<step>» of every step to do now — the controller's objetivos(): every step still to do of each active
 * quest's current block (a grupo: several at once). */
export const ahorasDe = (obs: readonly { mision: string; paso: number }[]): Set<string> => new Set(obs.map((x) => `${x.mision}:${x.paso}`));
/** Done (or the quest is complete: all its steps are done); to do now; otherwise locked: still to do, after the current
 * block (it opens when the block before it is done) or, U14 (5), in it but still waiting (`espera`: it opens by itself). */
export function estadoPaso(m: { id: string; estado: string }, s: { n: number; hecho: boolean }, ahoras: ReadonlySet<string>): EstadoPaso {
  if (s.hecho || m.estado === "hecha") return "hecho";
  return ahoras.has(`${m.id}:${s.n}`) ? "ahora" : "bloqueado";
}

/** When the book opens by itself (the spec: «aparece automáticamente al terminar el primer diálogo»): after a quest is
 * accepted, as soon as no conversation is open; in VR the acceptance is spent without opening (the VR panel lists the
 * steps). A page that loads with quests already in its book opens nothing: only an acceptance does. */
export function abrirSolo() {
  let pendiente = false;
  return {
    aceptada(): void { pendiente = true; },
    /** Whether to open it now (asking forgets the acceptance once it is answered). */
    toca(o: { dialogo: boolean; vr: boolean }): boolean {
      if (!pendiente || o.dialogo) return false;
      pendiente = false;
      return !o.vr;
    },
  };
}

/** Whether a step done means you got a thing (the note then shows the item icon): someone gave it to you (the server
 * says «Has recibido: …», U14) or you took it (a `coge` step: its note is the step's own text). */
export function esObjeto(texto: string, m: { lista: readonly Paso[] } | undefined): boolean {
  return /^Has recibido: /.test(texto) || !!m?.lista.some((s) => s.tipo === "coge" && s.texto === texto);
}

/** S6: the house sounds are FILES now (`features/sonido/catalogo.json`, all CC0), played on the audio core's
 * «interfaz» bus and WITHOUT a panner: a notice lives in the head, not in the world. These oscillator notes stay as
 * the **fallback** for when the catalogue is not there yet (the first seconds of the page, a browser with no Web
 * Audio, a world that does not serve `/sonidos.json`): per sound a wave and its notes [Hz, start s, length s]. Every
 * notice keeps its text in the announcement, catalogue or not (XAUR, WCAG 2.2): whoever does not hear, reads. */
export const NOTAS_CASA: Record<string, { onda: OscillatorType; notas: [number, number, number][] }> = {
  exito: { onda: "triangle", notas: [[523.25, 0, 0.1], [659.25, 0.08, 0.1], [783.99, 0.16, 0.24]] },
  magia: { onda: "sine", notas: [[783.99, 0, 0.14], [1046.5, 0.07, 0.14], [1318.51, 0.14, 0.16], [1567.98, 0.21, 0.4]] },
  campana: { onda: "sine", notas: [[880, 0, 1.1], [1760, 0, 0.5], [2637, 0, 0.25]] },
  suave: { onda: "sine", notas: [[659.25, 0, 0.22]] },
  aviso: { onda: "triangle", notas: [[880, 0, 0.12], [880, 0.18, 0.12]] },
  error: { onda: "triangle", notas: [[233.08, 0, 0.14], [196, 0.14, 0.26]] },
  paso: { onda: "triangle", notas: [[392, 0, 0.07]] },
};
/** The step-done notes (Hz, start s, length s): C5 E5 G5 rising. */
export const NOTAS_EXITO: readonly (readonly [number, number, number])[] = NOTAS_CASA.exito.notas;
/** U14 (6): «Misión completada» — a C major chord (C5 E5 G5 C6) held under a second, coming in just after the three
 * notes of the step that completed the quest (both arrive in the same moment): one short fanfare, no file to load. */
export const ACORDE_COMPLETADA: readonly (readonly [number, number, number])[] = [[523.25, 0.3, 0.9], [659.25, 0.3, 0.9], [783.99, 0.3, 0.9], [1046.5, 0.3, 0.9]];
/** S6: the catalogue of the house, as `sonarCasa` needs it. Injectable so a test can play without Web Audio. */
export type CatalogoCasa = { listo(): boolean; casa(nombre: string): string | null; suena(p: { id: string; donde?: null; texto?: string }): boolean; fila?(id: string): unknown };
/** S6: which catalogue `sonarCasa` asks first. The page sets it once (apps/plaza/main.ts); a test puts a fake one. */
let catalogoCasa: CatalogoCasa | null = null;
export function ponerCatalogoCasa(c: CatalogoCasa | null): void { catalogoCasa = c; }
export const catalogoDeCasa = (): CatalogoCasa | null => catalogoCasa;

/** Play one house sound at the settings' general × effects volume (0 = silent). Returns whether it sounded.
 *  `salida` (S1) is the audio core's «interfaz» bus: when it is there, the person's volume lives in the graph's VCA
 *  (packages/render/src/audio/nucleo.ts) and is not applied twice here.
 *  S6: the FILE first (the catalogue's `ui-*`, on the «interfaz» bus and with no panner: a notice is in your head);
 *  the oscillator notes only when the catalogue cannot (no table yet, no audio, an id it does not know). */
export function sonarCasa(ctx: () => AudioContext | null, ajuste: (id: string) => unknown, sonido = "exito", salida?: (c: AudioContext) => AudioNode | null): boolean {
  if (sonarDelCatalogo(sonido)) return true;
  const s = NOTAS_CASA[sonido];
  return !!s && sonar(ctx, ajuste, s.onda, s.notas, 0.2, salida);
}
export function sonarCompletada(ctx: () => AudioContext | null, ajuste: (id: string) => unknown, salida?: (c: AudioContext) => AudioNode | null): boolean {
  return sonarAviso("completada", ctx, ajuste, salida);
}

/** t_d7411a07: the three quest notices that have a sound of their own — the quest is received (accepted), a delivery step is
 * done, the quest is completed. The world picks the sound of each from the catalogue (`ficha.json` → `audio.avisos`); a silent
 * one is `""`. Step-by-step progress stays silent (it is frequent): Pablo's rule «suena el mundo, no la interfaz». */
export const AVISOS_MISION = ["recibida", "entregada", "completada"] as const;
export type AvisoMision = (typeof AVISOS_MISION)[number];
export type AvisosMundo = Partial<Record<AvisoMision, string>>;
/** The house default of each notice (ids of `features/sonido/catalogo.json`), when the world says nothing. */
export const SONIDO_AVISO_DEF: Readonly<Record<AvisoMision, string>> = { recibida: "ui-confirmar", entregada: "coger-soltar", completada: "ui-logro" };
/** The oscillator notes of each notice, only for when the catalogue is not there (see NOTAS_CASA). */
const NOTAS_AVISO: Record<AvisoMision, { onda: OscillatorType; notas: readonly (readonly [number, number, number])[]; fuerza: number }> = {
  recibida: { ...NOTAS_CASA.magia, fuerza: 0.2 }, entregada: { ...NOTAS_CASA.exito, fuerza: 0.2 }, completada: { onda: "triangle", notas: ACORDE_COMPLETADA, fuerza: 0.07 },
};
/** Which notice an event of the server is, if any: «aceptada» = recibida; «avance» of a step of type `entrega` = entregada;
 * «completada» = completada. Every other step is silent. `libro` is the page's book (the step is found by its own text). */
export function avisoDeEvento(event: string, msg: Record<string, unknown>, libro: readonly { id: string; lista: readonly { texto: string; tipo?: string }[] }[]): AvisoMision | null {
  if (event === "aceptada") return "recibida";
  if (event === "completada") return "completada";
  if (event !== "avance") return null;
  const texto = String(msg.texto ?? "");
  return libro.find((m) => m.id === String(msg.mision))?.lista.some((x) => x.texto === texto && x.tipo === "entrega") ? "entregada" : null;
}
let avisosMundo: AvisosMundo = {};
/** The page sets the world's choices once, from /status (`audio.avisos`); anything that is not a notice name or a text is left out. */
export function ponerAvisosMundo(a: unknown): void {
  avisosMundo = {};
  if (!a || typeof a !== "object" || Array.isArray(a)) return;
  for (const n of AVISOS_MISION) { const v = (a as Record<string, unknown>)[n]; if (typeof v === "string") avisosMundo[n] = v; }
}
/** Which catalogue id a notice plays: the world's choice, else the house default; null = silent (the world said `""`). */
export function sonidoDeAviso(aviso: AvisoMision, mundo: AvisosMundo = avisosMundo, catalogo: CatalogoCasa | null = catalogoCasa): string | null {
  const v = mundo[aviso];
  if (v === "") return null;
  if (v) return v;
  return (aviso === "completada" ? catalogo?.casa("completada") : null) ?? SONIDO_AVISO_DEF[aviso];
}
/** Play a quest notice: the world's catalogue sound (or the house default) in the head on the «interfaz» bus; the oscillator
 * notes only when the catalogue cannot (no table yet, no audio, an id it does not know or one with no file). Returns whether it sounded. */
export function sonarAviso(aviso: AvisoMision, ctx: () => AudioContext | null, ajuste: (id: string) => unknown, salida?: (c: AudioContext) => AudioNode | null): boolean {
  const id = sonidoDeAviso(aviso);
  if (id === null) return false; // the world silenced it; the text still reaches the notices region
  const c = catalogoCasa;
  if (c?.listo()) {
    const fila = c.fila ? (c.fila(id) as { fuente?: string } | null) : { fuente: "fichero" };
    if (fila?.fuente === "fichero") { try { return c.suena({ id, donde: null }); } catch { /* the notes below */ } } // a file: it sounded, or its cooldown cut it — the notes never stack on it
  }
  const n = NOTAS_AVISO[aviso];
  return sonar(ctx, ajuste, n.onda, n.notas, n.fuerza, salida);
}
/** S6: try the house catalogue for this notice name. `donde: null` = no panner, in the head. */
function sonarDelCatalogo(nombre: string): boolean {
  const c = catalogoCasa;
  if (!c?.listo()) return false;
  const id = c.casa(nombre);
  if (!id) return false;
  try { return c.suena({ id, donde: null }); } catch { return false; }
}
function sonar(ctx: () => AudioContext | null, ajuste: (id: string) => unknown, onda: OscillatorType, notas: readonly (readonly [number, number, number])[], fuerza: number, salida?: (c: AudioContext) => AudioNode | null): boolean {
  try {
    const c = ctx();
    if (!c) return false;
    const destino = salida?.(c) ?? null;
    // the ids carry their group («sonido.general», not «general»): the settings registry indexes them as
    // `${grupo}.${nombre}` (packages/client/src/ajustes.ts), so a bare name read undefined and nothing ever moved
    const vol = destino ? fuerza : (Number(ajuste("sonido.general") ?? 80) / 100) * (Number(ajuste("sonido.efectos") ?? 80) / 100) * fuerza;
    if (!(vol > 0)) return false;
    if (c.state === "suspended") void c.resume().catch(() => {});
    const t = c.currentTime;
    for (const [f, t0, dur] of notas) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = onda; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + t0); g.gain.linearRampToValueAtTime(vol, t + t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + t0 + dur);
      o.connect(g).connect(destino ?? c.destination); o.start(t + t0); o.stop(t + t0 + dur + 0.05);
    }
    return true;
  } catch { return false; } // no audio here: the note and the screen reader still say it
}
/** U14 (5): how many seconds a step still waits on this page's clock — 0 = none; at least 1 until the server sends the
 * book that opens it. */
export const segundosDe = (s: { espera?: number; listoEn?: number }, ahora = performance.now()): number =>
  (s.espera ? Math.max(1, Math.ceil(((s.listoEn ?? 0) - ahora) / 1000)) : 0);

/** U14 (6), the TRG26 spec §6/§12: how long the «Misión completada» banner stays (it never takes the keyboard). */
export const BANNER_MS = 4000;
/** The names of the rewards inside a `completada` event's `recompensa` («Insignia «Sello del Artífice · TRG26»» → that
 * name); the text itself when it names none that way. */
export function insigniasDe(recompensa: string): string[] {
  const nombres = [...recompensa.matchAll(/«([^«»]+)»/g)].map((m) => m[1].trim()).filter(Boolean);
  return nombres.length ? nombres : recompensa.trim() ? [recompensa.trim()] : [];
}

/** N10: each reward in a `completada` text with its kind («Objeto «Brújula»» → objeto; «Insignia «…»» or a bare name → insignia). */
export function recompensasDe(recompensa: string): { tipo: "insignia" | "objeto"; nombre: string }[] {
  const xs = [...recompensa.matchAll(/(Objeto|Insignia)?\s*«([^«»]+)»/g)].map((m) => ({ tipo: m[1] === "Objeto" ? "objeto" as const : "insignia" as const, nombre: m[2].trim() })).filter((x) => x.nombre);
  return xs.length ? xs : insigniasDe(recompensa).map((nombre) => ({ tipo: "insignia" as const, nombre }));
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, texto = "", clase = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (texto) e.textContent = texto;
  if (clase) e.className = clase;
  return e;
};
/** «a 12 m al norte» (−z is north, the way the camera looks when you arrive). */
export function rumbo(dx: number, dz: number): string {
  const d = Math.hypot(dx, dz);
  if (d < 2) return "aquí";
  const lado = Math.abs(dx) > Math.abs(dz) * 2 ? (dx > 0 ? "este" : "oeste") : Math.abs(dz) > Math.abs(dx) * 2 ? (dz > 0 ? "sur" : "norte") : `${dz > 0 ? "sur" : "nor"}${dx > 0 ? "este" : "oeste"}`;
  return `a ${Math.round(d)} m al ${lado}`;
}

/** One row of the book: the mark (an icon or the «now» dot, hidden from screen readers), the state in words for them,
 * the step and, while it is to do now, where; while it waits (U14 (5)), in how long it opens. */
function filaPaso(s: Paso, e: EstadoPaso): HTMLLIElement {
  const d = ESTADOS[e], donde = e === "ahora" ? s.donde : "", falta = e === "bloqueado" ? segundosDe(s) : 0;
  const li = el("li", "", `paso ${e}`);
  li.dataset.estado = e;
  li.setAttribute("aria-label", `${d.dice}: ${s.texto}${donde ? ` (${donde})` : ""}${falta ? ` (se abre en ${falta} s)` : ""}`);
  const marca = el("span", "", "marca");
  marca.setAttribute("aria-hidden", "true");
  if (d.icono) marca.innerHTML = icono(d.icono, 16); // a fixed house glyph, never text from the wire
  li.append(marca, el("span", `${d.dice}: `, "solo-lector"), el("span", s.texto, "texto"));
  if (donde) { const lugar = el("span", "", "donde"); lugar.append(el("span", " (", "solo-lector"), donde, el("span", ")", "solo-lector")); li.append(lugar); }
  if (falta) li.append(el("span", ` · en ${falta} s`, "donde espera"));
  return li;
}

export function montarLibro(c: Ctl, o: {
  boton: HTMLButtonElement; panel: HTMLElement; linea: HTMLElement; nota: HTMLElement; view: Lugar; here: () => { x: number; z: number } | null;
  oir?: Oir; ajuste?: (id: string) => unknown;
  /** U14 (6): the «Misión completada» banner (a polite live region, always in the page, empty when idle). */
  banner?: HTMLElement;
}) {
  const balizar = (ob: Objetivo | undefined) => { if (ob) o.view.beacon(ob.x, ob.z, ob.nombre, BALIZA_MS); };
  const tactil = esTactil();
  // the head stays (its close button keeps its focus across repaints); the body is drawn again on every change
  const titulo = el("h2", "Misiones"), cerrar = el("button", tactil ? "Cerrar" : "Cerrar (J)", "cerrar"), cuerpo = el("div", "", "cuerpo");
  const cabeza = el("header", "", "cabeza");
  titulo.tabIndex = -1;
  cerrar.type = "button"; cerrar.setAttribute("aria-keyshortcuts", "J");
  cabeza.append(titulo, cerrar);
  o.panel.replaceChildren(cabeza, cuerpo);
  const pintar = () => {
    if (o.panel.hidden) return;
    const libro = c.libro(), activas = libro.filter((m) => m.estado === "activa"), hechas = libro.filter((m) => m.estado === "hecha");
    const ahoras = ahorasDe(c.objetivos()); // every step to do now (a grupo: several)
    const partes: HTMLElement[] = [];
    if (!libro.length) partes.push(el("p", `Aún no tienes misiones. Habla con la gente de la plaza: ${cercaDeAlguien(perfil().clase)}.`));
    for (const m of activas) {
      const art = el("article", "", m.seguida ? "mision seguida" : "mision");
      art.append(el("h3", m.titulo), el("p", m.descripcion, "descripcion"));
      const ol = el("ol", "", "pasos");
      for (const s of m.lista) ol.append(filaPaso(s, estadoPaso(m, s, ahoras)));
      const seguir = el("button", m.seguida ? "Dejar de seguir" : "Seguir");
      seguir.type = "button";
      seguir.addEventListener("click", () => { c.seguir(m.seguida ? "" : m.id); if (!m.seguida) balizar(c.objetivos().find((x) => x.mision === m.id)); });
      const dejar = el("button", "Abandonar");
      dejar.type = "button";
      dejar.addEventListener("click", () => c.abandonar(m.id));
      const fila = el("div", "", "fila");
      fila.append(seguir, dejar);
      art.append(ol, fila);
      if (m.recompensa) art.append(el("p", `Recompensa: ${m.recompensa}`, "recompensa"));
      partes.push(art);
    }
    if (hechas.length) { // a completed quest: all its steps are done, so one row with the check
      partes.push(el("h3", `Hechas (${hechas.length})`));
      const ul = el("ul", "", "hechas");
      for (const m of hechas) { const li = filaPaso({ n: 0, texto: `${m.titulo}${m.recompensa ? ` · ${m.recompensa}` : ""}`, hecho: true, donde: "" }, "hecho"); li.dataset.mision = m.id; ul.append(li); }
      partes.push(ul);
    }
    cuerpo.replaceChildren(...partes);
  };
  /** Open or close it. Opened by hand (J, the button), the focus goes to its title; opened by itself, it stays where it
   * was (the keys keep walking). Closing, a focus left inside lets go. */
  const abrir = (si: boolean, foco = true) => {
    if (!si && o.panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    o.panel.hidden = !si;
    o.boton.setAttribute("aria-expanded", String(si));
    if (si) { pintar(); if (foco) titulo.focus({ preventScroll: true }); }
  };
  o.boton.addEventListener("click", () => abrir(o.panel.hidden));
  cerrar.addEventListener("click", () => abrir(false));
  for (const x of [o.boton, o.panel]) x.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // not a joystick touch
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyJ" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e)) return;
    abrir(o.panel.hidden);
  });

  // it opens by itself on accepting a quest, when the conversation that gave it has closed (and never in VR)
  const solo = abrirSolo();
  const quizasAbrir = () => {
    if (!solo.toca({ dialogo: !!c.dialogo(), vr: !!o.view.vr?.active }) || !o.panel.hidden) return;
    abrir(true, false);
    anunciar(tactil ? "El libro de misiones se ha abierto." : "El libro de misiones se ha abierto: J lo cierra."); // it took no focus: say it
  };

  // the column of light follows the tracked objective: a new step or a new tracked quest lights it again (the book
  // arrives in several messages, so an empty moment in between does not count as a change)
  let marcado = "";
  const revisarBaliza = () => {
    const ob = c.objetivos().find((x) => x.seguida), firma = ob ? `${ob.mision}:${ob.paso}` : "";
    if (firma && firma !== marcado) { balizar(ob); marcado = firma; }
  };
  let notaHasta = 0;
  /** The short note in the middle of the screen; when you got a thing, with the item icon in place of the «✓». */
  const mostrarNota = (texto: string, objeto = false) => {
    if (objeto) { const i = el("span", "", "objeto"); i.innerHTML = icono("package", 18); o.nota.replaceChildren(i, texto.replace(/^✓ /, "")); }
    else o.nota.textContent = texto;
    o.nota.hidden = false; notaHasta = performance.now() + 4000;
  };
  // the tracked step in one line (on each change of the book and 4 times a second for the distance, only when the text
  // changes; not a live region: the distance changes too often to be read aloud — the book and the announcements carry
  // it for screen readers). Inside a grupo: «★ Título · Piezas reunidas 1/3 · Bianca, a 12 m al norte» (the nearest of
  // its steps to do, by the short name: «Bianca, la tejedora» → «Bianca», so the line stays short).
  const linea = () => {
    const obs = c.objetivos().filter((x) => x.seguida), m = obs[0] && c.libro().find((x) => x.id === obs[0].mision), yo = o.here();
    const g = m && c.resumen().seguida?.grupo;
    let t = "";
    if (m && g) {
      const cerca = yo ? obs.reduce((a, b) => (Math.hypot(b.x - yo.x, b.z - yo.z) < Math.hypot(a.x - yo.x, a.z - yo.z) ? b : a)) : null;
      t = `★ ${m.titulo} · ${g.nombre} ${g.hechos}/${g.total}${cerca && yo ? ` · ${cerca.nombre.split(",")[0]}, ${rumbo(cerca.x - yo.x, cerca.z - yo.z)}` : ""}`;
    } else if (m) t = `★ ${m.titulo} (${obs[0].paso + 1}/${m.pasos}): ${obs[0].texto}${yo ? ` · ${rumbo(obs[0].x - yo.x, obs[0].z - yo.z)}` : ""}`;
    else { // U14 (5): the tracked quest's next step still waits: how long
      const seg = c.libro().find((x) => x.seguida && x.estado === "activa"), s = seg?.lista.find((x) => x.n === seg.paso), falta = s ? segundosDe(s) : 0;
      const gr = seg ? c.resumen().seguida?.grupo : null;
      if (seg && gr && gr.total > 0 && gr.hechos === gr.total) t = `★ ${seg.titulo} · ${gr.nombre} ${gr.hechos}/${gr.total}`; // the grupo is complete and the server holds it a moment (~2 s) before the next step: nothing is left to point at, the counter stays
      else if (seg && s && falta) t = `★ ${seg.titulo} (${s.n + 1}/${seg.pasos}): ${s.texto} · en ${falta} s`;
    }
    if (o.linea.textContent !== t) o.linea.textContent = t;
    o.linea.hidden = !t;
  };
  c.alCambiar((que) => {
    if (que === "libro") { pintar(); revisarBaliza(); linea(); }
    if (que === "dialogo") quizasAbrir();
    if (que === "nota" && c.estado.nota) mostrarNota(c.estado.nota);
  });
  // the server's events after the controller has taken them (listeners run before taps): its note is already set
  // S1: the house avisos go out through the audio core's «interfaz» bus — one graph, one context, never their own
  const contexto = () => audio().ctx();
  const salida = () => audio().bus("interfaz");
  // U14 (6): «Misión completada» — the banner: what you finished and what you got, in the world's look (tema.css); it
  // takes neither the keyboard nor a click, it is read once by screen readers (main.ts leaves this event out of the
  // general announcements) and the small note that says the same steps aside while it shows
  let bannerHasta = 0;
  const mostrarCompletada = (msg: Record<string, unknown>) => {
    const b = o.banner;
    if (!b) return;
    const partes: HTMLElement[] = [el("p", "Misión completada", "rotulo"), el("p", String(msg.titulo ?? ""), "titulo")];
    for (const r of recompensasDe(String(msg.recompensa ?? ""))) { const p = el("p", "", r.tipo === "objeto" ? "insignia objeto" : "insignia"); p.append(el("span", r.tipo === "objeto" ? "Objeto, ya es tuyo: " : "Insignia: ", "solo-lector"), r.nombre); partes.push(p); }
    if (msg.texto) partes.push(el("p", String(msg.texto), "solo-lector"));
    b.replaceChildren(...partes);
    b.classList.add("visible");
    o.view.rayoDestello?.(); // MIS-229: the beam still standing swells once
    o.nota.hidden = true;
    bannerHasta = performance.now() + BANNER_MS;
  };
  o.oir?.((feature, event, msg) => {
    if (feature !== "misiones") return;
    const aviso = avisoDeEvento(event, msg, c.libro());
    if (aviso && o.ajuste) sonarAviso(aviso, contexto, o.ajuste, salida); // t_d7411a07: recibida / entregada / completada, each its own house sound
    if (event === "aceptada") { solo.aceptada(); quizasAbrir(); }
    if (event === "avance") {
      if (esObjeto(String(msg.texto ?? ""), c.libro().find((m) => m.id === String(msg.mision)))) mostrarNota(c.estado.nota, true);
      // a step done is silent (it is frequent): only the milestones sound (received, delivered, completed: avisoDeEvento)
    }
    if (event === "completada") mostrarCompletada(msg);
  });
  // U14 (5): a sequence's lines are read aloud (the note itself is hidden from screen readers) and its sounds play
  c.alSecuencia?.((s) => {
    if (s.tipo === "texto" && s.texto) anunciar(s.texto);
    if (s.tipo === "sonido" && s.sonido && o.ajuste) sonarCasa(contexto, o.ajuste, s.sonido, salida);
  });
  let esperas = ""; // U14 (5): the countdowns shown in the open book
  setInterval(() => {
    if (!o.nota.hidden && performance.now() > notaHasta) o.nota.hidden = true;
    if (bannerHasta && performance.now() > bannerHasta && o.banner) { // it fades out, then it is emptied (nothing left to read)
      bannerHasta = 0; o.banner.classList.remove("visible");
      const b = o.banner;
      setTimeout(() => { if (!bannerHasta) b.replaceChildren(); }, 400);
    }
    linea();
    if (!o.panel.hidden) {
      const f = c.libro().flatMap((m) => m.lista.map((s) => segundosDe(s))).join(",");
      if (f !== esperas) { esperas = f; if (/[1-9]/.test(f)) pintar(); }
    }
  }, 250);
  return { abrir, pintar };
}
