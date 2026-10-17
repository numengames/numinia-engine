// J5 on the page: the quest book (key J or the «Misiones» button): active quests with their steps (✓ done, → now),
// «Seguir» (a column of light over the target, and the map gets it from objetivos()), «Abandonar», and the completed
// ones with what they gave. Plus a small line with the tracked step at the top of the screen and a short note when
// something happens. Everything is real HTML (buttons, headings, lists): keyboards and screen readers use it as is.
// Steps of a grupo (U14) are done in any order: all the ones still to do of the current block show as «now», and the
// top line shows the block's counter («Piezas reunidas 1/3») and the nearest of them.
import { escribiendo } from "./interactuar.ts";

type Res = { ok: true } | { ok: false; why: string };
type Paso = { n: number; texto: string; hecho: boolean; donde: string };
type Mision = { id: string; titulo: string; descripcion: string; estado: "activa" | "hecha"; paso: number; pasos: number; seguida: boolean; recompensa: string; lista: Paso[] };
type Objetivo = { mision: string; paso: number; nombre: string; texto: string; x: number; z: number; seguida: boolean };
type Grupo = { nombre: string; hechos: number; total: number };
type Ctl = {
  libro(): Mision[]; objetivos(): Objetivo[]; seguir(id: string): Res; abandonar(id: string): Res; estado: { nota: string };
  resumen(): { seguida: { mision: string; grupo: Grupo | null } | null };
  alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown;
};
type Lugar = { beacon(x: number, z: number, text: string, ms: number): void };

/** How long the column of light stays when you start following something (it costs drawing: phones stay cool). */
export const BALIZA_MS = 15_000;

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

export function montarLibro(c: Ctl, o: { boton: HTMLButtonElement; panel: HTMLElement; linea: HTMLElement; nota: HTMLElement; view: Lugar; here: () => { x: number; z: number } | null }) {
  const balizar = (ob: Objetivo | undefined) => { if (ob) o.view.beacon(ob.x, ob.z, ob.nombre, BALIZA_MS); };
  const pintar = () => {
    if (o.panel.hidden) return;
    const libro = c.libro(), activas = libro.filter((m) => m.estado === "activa"), hechas = libro.filter((m) => m.estado === "hecha");
    const ahoras = new Set(c.objetivos().map((x) => `${x.mision}:${x.paso}`)); // every step to do now (a grupo: several)
    const partes: HTMLElement[] = [el("h2", "Misiones")];
    if (!libro.length) partes.push(el("p", "Aún no tienes misiones. Habla con la gente de la plaza: acércate y pulsa E."));
    for (const m of activas) {
      const art = el("article", "", m.seguida ? "mision seguida" : "mision");
      art.append(el("h3", m.titulo), el("p", m.descripcion, "descripcion"));
      const ol = el("ol");
      for (const s of m.lista) {
        const ahora = !s.hecho && ahoras.has(`${m.id}:${s.n}`);
        const li = el("li", `${s.hecho ? "✓" : ahora ? "→" : "·"} ${s.texto}${ahora && s.donde ? ` (${s.donde})` : ""}`, s.hecho ? "hecho" : ahora ? "ahora" : "despues");
        li.setAttribute("aria-label", `${s.hecho ? "Hecho" : ahora ? "Ahora" : "Después"}: ${s.texto}`);
        ol.append(li);
      }
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
    if (hechas.length) {
      partes.push(el("h3", `Hechas (${hechas.length})`));
      const ul = el("ul", "", "hechas");
      for (const m of hechas) { const li = el("li", `✓ ${m.titulo}${m.recompensa ? ` · ${m.recompensa}` : ""}`); li.dataset.mision = m.id; ul.append(li); }
      partes.push(ul);
    }
    o.panel.replaceChildren(...partes);
  };
  const abrir = (si: boolean) => {
    o.panel.hidden = !si;
    o.boton.setAttribute("aria-expanded", String(si));
    if (si) { pintar(); (o.panel.querySelector("h2") as HTMLElement | null)?.setAttribute("tabindex", "-1"); (o.panel.querySelector("h2") as HTMLElement | null)?.focus({ preventScroll: true }); }
  };
  o.boton.addEventListener("click", () => abrir(o.panel.hidden));
  for (const x of [o.boton, o.panel]) x.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // not a joystick touch
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyJ" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e)) return;
    abrir(o.panel.hidden);
  });

  // the column of light follows the tracked objective: a new step or a new tracked quest lights it again (the book
  // arrives in several messages, so an empty moment in between does not count as a change)
  let marcado = "";
  const revisarBaliza = () => {
    const ob = c.objetivos().find((x) => x.seguida), firma = ob ? `${ob.mision}:${ob.paso}` : "";
    if (firma && firma !== marcado) { balizar(ob); marcado = firma; }
  };
  let notaHasta = 0;
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
    if (que === "nota" && c.estado.nota) { o.nota.textContent = c.estado.nota; o.nota.hidden = false; notaHasta = performance.now() + 4000; }
  });
  setInterval(() => {
    if (!o.nota.hidden && performance.now() > notaHasta) o.nota.hidden = true;
    linea();
  }, 250);
  return { abrir, pintar };
}
