// U20: the density dial on the page. The table of panels is packages/client/src/densidad.ts; here each panel gets its
// data-densidad / data-cuando (also the ones the page builds later), <html data-densidad-nivel> says the level, and tema.css
// does the hiding — no work per frame. Two small behaviours live here: the folded chat's pill («Chat · 2 nuevos · Intro»,
// Mínimo) and the chat's lines fading after 6 s in Normal (`al_cambiar`; «menos movimiento» keeps them fixed).
// Key U cycles the level (never while typing, never with a panel open). Not named «a…»: dev:lan proxies those paths.
import { MARCOS_PLAZA, NOMBRES_DENSIDAD, SEGUNDOS_AL_CAMBIAR, nivelDensidad, siguienteDensidad } from "../../packages/client/src/densidad.ts";
import type { Densidad } from "../../packages/client/src/densidad.ts";
import { escribiendo } from "./escribiendo.ts";
import { anunciar } from "./paneles.ts";
import { esTactil } from "./perfil-aparato.ts"; // U25: the page's one answer to «touch controls or not»

type Registro = { get(id: string): unknown; set(id: string, v: unknown): unknown; alAplicar(id: string, fn: (v: unknown) => void): void };

/** Stamp every panel of the table that is in the page now. Returns how many. */
export function marcarPaneles(raiz: ParentNode = document): number {
  let n = 0;
  for (const m of MARCOS_PLAZA) {
    for (const el of Array.from(raiz.querySelectorAll<HTMLElement>(m.selector))) {
      if (el.dataset.densidad === m.densidad && el.dataset.marco === m.id) continue;
      el.dataset.marco = m.id; el.dataset.densidad = m.densidad; el.dataset.cuando = m.cuando;
      if (m.solo) el.dataset.solo = m.solo.join(" "); else delete el.dataset.solo;
      if (m.fijoEn) el.dataset.fijoEn = m.fijoEn.join(" ");
      if (m.segundos) el.dataset.segundos = String(m.segundos);
      if (m.tecla) el.dataset.tecla = m.tecla;
      n++;
    }
  }
  return n;
}

export function montarDensidad(a: Registro): { nivel(): Densidad; poner(d: Densidad): void } {
  const html = document.documentElement;
  let nivel: Densidad = nivelDensidad(a.get("interfaz.densidad"));
  marcarPaneles();
  // panels the page builds after this runs (the minimap, a future clock or U3 frame): stamped when they join the body
  new MutationObserver(() => marcarPaneles()).observe(document.body, { childList: true });

  // ---- the folded chat: a pill with the count of new lines (Mínimo) ----
  const lista = document.getElementById("chat-lista"), boton = document.getElementById("chat-boton") as HTMLButtonElement | null, form = document.getElementById("chat-form");
  const tactil = esTactil();
  let nuevos = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const pastilla = () => {
    if (!boton) return;
    const min = nivel === "minimo";
    boton.hidden = !(min || tactil);
    boton.textContent = min ? (nuevos ? `Chat · ${nuevos} ${nuevos === 1 ? "nuevo" : "nuevos"} · Intro` : "Chat · Intro") : "Chat";
  };
  const reciente = () => { // al_cambiar: the list shows with each new line and fades after N s
    if (!lista) return;
    lista.classList.add("reciente"); clearTimeout(timer);
    timer = setTimeout(() => lista.classList.remove("reciente"), Number(lista.dataset.segundos || SEGUNDOS_AL_CAMBIAR) * 1000);
  };
  if (lista) new MutationObserver((muts) => {
    for (const mu of muts) for (const n of Array.from(mu.addedNodes)) {
      if (n instanceof HTMLElement && n.classList.contains("antes")) continue; // the zone's history arriving is not news
      if (nivel === "minimo" && !(form && !form.hidden)) nuevos++;
      reciente();
    }
    pastilla();
  }).observe(lista, { childList: true });
  if (form) new MutationObserver(() => { if (!form.hidden) { nuevos = 0; pastilla(); } }).observe(form, { attributes: true, attributeFilter: ["hidden"] });

  const poner = (d: Densidad) => {
    nivel = d;
    html.dataset.densidadNivel = d;
    if (d !== "minimo") nuevos = 0;
    pastilla();
  };
  a.alAplicar("interfaz.densidad", (v) => poner(nivelDensidad(v)));
  poner(nivel);

  // ---- key U: Mínimo → Normal → Completo ----
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyU" || e.repeat || e.ctrlKey || e.altKey || e.metaKey || escribiendo(e) || document.querySelector("dialog[open]")) return;
    const sig = siguienteDensidad(nivel);
    a.set("interfaz.densidad", sig);
    anunciar(`Densidad de interfaz: ${NOMBRES_DENSIDAD[sig]}.`);
  });
  return { nivel: () => nivel, poner: (d) => { a.set("interfaz.densidad", d); } };
}
