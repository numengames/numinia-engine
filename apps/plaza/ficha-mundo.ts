// ficha-mundo — the settings form of a world (H7): title, picture, everyone's default avatar and how many people fit.
// It lives inside the builder's «Entorno» drawer, below the switches, and shows ONLY to who the server says may (`estado.puede`:
// the administrator or an owner). It only asks (`ajustes.guardar`); the server checks who, validates, writes aventura/ficha.json and every
// page — this one too — gets the new state, so the title in the tab changes for everybody at once (`ponerTitulo`). No Three.js here.
import type { Ajustes } from "../../features/ficha-mundo/client.ts";

type Res = { ok: true } | { ok: false; why: string };
export type ControlAjustes = {
  estado: { puede: boolean; ultimoRechazo: string; cambios: number };
  actual(): Ajustes | null;
  guardar(c: { nombre: string; portada: string; avatar: string; aforo: number }): Res;
  alCambiar(fn: (a: Ajustes) => void): () => void;
};
export type OpcionesFichaMundo = {
  ajustes: ControlAjustes;
  padre: HTMLElement;
  /** The house avatars one can choose as everybody's default (id + name). */
  avatares: { id: string; nombre: string }[];
  /** The pictures this server has that can be the world's picture (sha256.ext); empty = type it. */
  imagenes?: () => string[];
};

const CSS = `
#ficha-mundo { font: 13px/1.45 "Geist", system-ui, sans-serif; margin-top: 12px; }
#ficha-mundo[hidden] { display: none; }
#ficha-mundo h3 { margin: 12px 0 4px; font-size: 14px; }
#ficha-mundo label { display: grid; gap: 2px; margin: 6px 0; }
#ficha-mundo input, #ficha-mundo select { padding: 6px 8px; border: 0; border-radius: 6px; background: #eef2f6; color: #23303b; font: inherit; }
#ficha-mundo button { padding: 6px 10px; border: 0; border-radius: 6px; background: #ffd27a; color: #23303b; font: inherit; }
#ficha-mundo input:focus-visible, #ficha-mundo select:focus-visible, #ficha-mundo button:focus-visible { outline: 3px solid #ffd27a; }
#ficha-mundo .estado { color: #ffd27a; min-height: 1.4em; }
#ficha-mundo .pista { opacity: .8; font-size: 12px; }
`;

/** The name goes in the tab (and nowhere else decides it); an empty name leaves the tab as it is. */
export const tituloDe = (nombre: string, actual: string): string => (nombre.trim() ? nombre.trim() : actual);

export function montarFichaMundo(o: OpcionesFichaMundo): { raiz: HTMLElement; refrescar(): void } {
  if (!document.getElementById("ficha-mundo-css")) { const st = document.createElement("style"); st.id = "ficha-mundo-css"; st.textContent = CSS; document.head.append(st); }
  const raiz = document.createElement("section");
  raiz.id = "ficha-mundo"; raiz.hidden = true; raiz.setAttribute("aria-labelledby", "ficha-mundo-h");
  const h = document.createElement("h3"); h.id = "ficha-mundo-h"; h.textContent = "Ajustes del mundo"; raiz.append(h);
  const campo = <T extends HTMLElement>(etiqueta: string, el: T, pista = ""): T => {
    const l = document.createElement("label"); l.append(document.createTextNode(etiqueta), el);
    if (pista) { const p = document.createElement("span"); p.className = "pista"; p.textContent = pista; l.append(p); }
    raiz.append(l); return el;
  };
  const nombre = campo("Título", Object.assign(document.createElement("input"), { type: "text", maxLength: 60, id: "ficha-nombre" }));
  const portada = campo("Imagen del mundo", Object.assign(document.createElement("input"), { type: "text", id: "ficha-portada", placeholder: "<sha256>.png" }), "Una imagen que ya está en este servidor; vacío = sin imagen.");
  const avatar = campo("Avatar por defecto", document.createElement("select"), "Lo llevan todos los que entran después, hasta que cada uno elija el suyo.");
  avatar.id = "ficha-avatar";
  avatar.append(Object.assign(document.createElement("option"), { value: "", textContent: "El de la casa" }));
  for (const a of o.avatares) avatar.append(Object.assign(document.createElement("option"), { value: a.id, textContent: a.nombre || a.id }));
  const aforo = campo("Límite de personas", Object.assign(document.createElement("input"), { type: "number", min: "0", max: "1000", step: "1", id: "ficha-aforo" }), "");
  const pistaAforo = aforo.parentElement!.querySelector(".pista") as HTMLElement | null ?? aforo.parentElement!.appendChild(Object.assign(document.createElement("span"), { className: "pista" }));
  const guardar = Object.assign(document.createElement("button"), { type: "button", id: "ficha-guardar", textContent: "Guardar ajustes" });
  const estado = Object.assign(document.createElement("p"), { className: "estado", id: "ficha-estado" }); estado.setAttribute("role", "status"); estado.setAttribute("aria-live", "polite");
  raiz.append(guardar, estado); o.padre.append(raiz);
  void o.imagenes;

  let editando = false;
  const rellenar = (a: Ajustes) => {
    if (!editando) { nombre.value = a.nombre; portada.value = a.portada; avatar.value = a.avatar; aforo.value = String(a.aforo); }
    aforo.max = String(a.capacidad);
    pistaAforo.textContent = `0 = sin límite propio (este motor admite ${a.capacidad}). Si ya hay más dentro, nadie sale: el siguiente en llegar encuentra la puerta cerrada.${a.guardado ? "" : " Este mundo no tiene carpeta donde guardar: el cambio dura hasta reiniciar."}`;
  };
  for (const el of [nombre, portada, avatar, aforo]) el.addEventListener("input", () => { editando = true; estado.textContent = ""; });
  const refrescar = () => { raiz.hidden = !(o.ajustes.estado.puede && o.ajustes.actual()); const a = o.ajustes.actual(); if (a) rellenar(a); };
  guardar.addEventListener("click", () => {
    const r = o.ajustes.guardar({ nombre: nombre.value.trim(), portada: portada.value.trim(), avatar: avatar.value, aforo: Math.max(0, Math.floor(Number(aforo.value) || 0)) });
    if (!r.ok) { estado.textContent = r.why; return; }
    const antes = o.ajustes.estado.cambios;
    estado.textContent = "Guardando…";
    const t = setInterval(() => {
      if (o.ajustes.estado.ultimoRechazo && o.ajustes.estado.cambios === antes) { estado.textContent = o.ajustes.estado.ultimoRechazo; o.ajustes.estado.ultimoRechazo = ""; clearInterval(t); }
      else if (o.ajustes.estado.cambios > antes) { estado.textContent = "Guardado."; editando = false; refrescar(); clearInterval(t); }
    }, 150);
    setTimeout(() => clearInterval(t), 5000);
  });
  o.ajustes.alCambiar(() => refrescar());
  const t0 = setInterval(refrescar, 1000); // «puede» arrives as an event, not as state: re-read it while the page is open
  if (typeof t0 === "object" && "unref" in t0) (t0 as { unref(): void }).unref();
  return { raiz, refrescar };
}
