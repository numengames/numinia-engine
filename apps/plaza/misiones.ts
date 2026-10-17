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
import { escribiendo } from "./interactuar.ts";
import { icono } from "./iconos.ts";
import { anunciar } from "./paneles.ts";

type Res = { ok: true } | { ok: false; why: string };
type Paso = { n: number; texto: string; hecho: boolean; donde: string; tipo?: string };
type Mision = { id: string; titulo: string; descripcion: string; estado: "activa" | "hecha"; paso: number; pasos: number; seguida: boolean; recompensa: string; lista: Paso[] };
type Objetivo = { mision: string; paso: number; nombre: string; texto: string; x: number; z: number; seguida: boolean };
type Grupo = { nombre: string; hechos: number; total: number };
type Ctl = {
  libro(): Mision[]; objetivos(): Objetivo[]; seguir(id: string): Res; abandonar(id: string): Res; estado: { nota: string };
  resumen(): { seguida: { mision: string; grupo: Grupo | null } | null };
  dialogo(): unknown;
  alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown;
};
type Lugar = { beacon(x: number, z: number, text: string, ms: number): void; vr?: { active: boolean } };
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
 * block (it opens when the block before it is done). */
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

/** The short positive sound of a step done (its `avance` announcement declares «exito»; until V6 gives every
 * announcement its own sound, the book plays this one): three rising notes made here with the Web Audio API, at the
 * settings' general × effects volume (0 = silent). Returns whether it sounded. */
export function sonarExito(ctx: () => AudioContext | null, ajuste: (id: string) => unknown): boolean {
  try {
    const vol = (Number(ajuste("general") ?? 80) / 100) * (Number(ajuste("efectos") ?? 80) / 100) * 0.2;
    if (!(vol > 0)) return false;
    const c = ctx();
    if (!c) return false;
    if (c.state === "suspended") void c.resume().catch(() => {});
    const t = c.currentTime;
    for (const [f, t0, dur] of [[523.25, 0, 0.1], [659.25, 0.08, 0.1], [783.99, 0.16, 0.24]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + t0); g.gain.linearRampToValueAtTime(vol, t + t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + t0 + dur);
      o.connect(g).connect(c.destination); o.start(t + t0); o.stop(t + t0 + dur + 0.05);
    }
    return true;
  } catch { return false; } // no audio here: the note and the screen reader still say it
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
 * the step and, while it is to do now, where. */
function filaPaso(s: Paso, e: EstadoPaso): HTMLLIElement {
  const d = ESTADOS[e], donde = e === "ahora" ? s.donde : "";
  const li = el("li", "", `paso ${e}`);
  li.dataset.estado = e;
  li.setAttribute("aria-label", `${d.dice}: ${s.texto}${donde ? ` (${donde})` : ""}`);
  const marca = el("span", "", "marca");
  marca.setAttribute("aria-hidden", "true");
  if (d.icono) marca.innerHTML = icono(d.icono, 16); // a fixed house glyph, never text from the wire
  li.append(marca, el("span", `${d.dice}: `, "solo-lector"), el("span", s.texto, "texto"));
  if (donde) { const lugar = el("span", "", "donde"); lugar.append(el("span", " (", "solo-lector"), donde, el("span", ")", "solo-lector")); li.append(lugar); }
  return li;
}

export function montarLibro(c: Ctl, o: {
  boton: HTMLButtonElement; panel: HTMLElement; linea: HTMLElement; nota: HTMLElement; view: Lugar; here: () => { x: number; z: number } | null;
  oir?: Oir; ajuste?: (id: string) => unknown;
}) {
  const balizar = (ob: Objetivo | undefined) => { if (ob) o.view.beacon(ob.x, ob.z, ob.nombre, BALIZA_MS); };
  const tactil = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
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
    if (!libro.length) partes.push(el("p", "Aún no tienes misiones. Habla con la gente de la plaza: acércate y pulsa E."));
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
    if (o.linea.textContent !== t) o.linea.textContent = t;
    o.linea.hidden = !t;
  };
  c.alCambiar((que) => {
    if (que === "libro") { pintar(); revisarBaliza(); linea(); }
    if (que === "dialogo") quizasAbrir();
    if (que === "nota" && c.estado.nota) mostrarNota(c.estado.nota);
  });
  // the server's events after the controller has taken them (listeners run before taps): its note is already set
  let audio: AudioContext | null = null;
  const contexto = () => { try { return (audio ??= new AudioContext()); } catch { return null; } };
  o.oir?.((feature, event, msg) => {
    if (feature !== "misiones") return;
    if (event === "aceptada") { solo.aceptada(); quizasAbrir(); }
    if (event === "avance") {
      if (esObjeto(String(msg.texto ?? ""), c.libro().find((m) => m.id === String(msg.mision)))) mostrarNota(c.estado.nota, true);
      if (o.ajuste) sonarExito(contexto, o.ajuste);
    }
  });
  setInterval(() => {
    if (!o.nota.hidden && performance.now() > notaHasta) o.nota.hidden = true;
    linea();
  }, 250);
  return { abrir, pintar };
}
