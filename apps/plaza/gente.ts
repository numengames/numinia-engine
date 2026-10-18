// gente (N16): «Gente» — who is connected now in this world, and «Ir» to go next to them (Pablo, 17-10, camino A:
// presence of now, no account; a saved friends list waits for the identity decision). The panel only asks
// (features/teletransporte): the server checks the world allows it, finds a free spot beside them and moves you; the
// light is the view's (packages/render/src/teletransporte.ts). Also here: «Dejarme encontrar» and, for owners and
// whoever directs, «Permitir en este mundo». L or the people button opens it. In VR the HTML panel is not drawn:
// the chat's /ir <nombre> does the same from a headset.
import type { Cambio, Persona } from "../../features/teletransporte/client.ts";
import { crearDialogo, anunciar } from "./paneles.ts";
import { icono } from "./iconos.ts";

type Viajar = {
  estado: { gente: Persona[]; todos: number; puede: boolean; encontrable: boolean; viaje: { ok: boolean; texto: string } | null };
  activo(): boolean; foto(): boolean;
  pedirGente(): { ok: boolean; why?: string };
  ir(quien: number): { ok: boolean; why?: string };
  encontrable(si: boolean): { ok: boolean; why?: string };
  permitir(si: boolean): { ok: boolean; why?: string };
  alCambiar(f: (q: Cambio) => void): () => void;
};

/** While open, the list is asked again this often (people come and go). */
export const REFRESCO_MS = 5000;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e;
};

export function montarGente(o: { viajar: Viajar; barra: HTMLElement | null }) {
  const { viajar } = o;
  const boton = el("button", { type: "button", id: "gente-abrir", className: "solo-icono", title: "Gente conectada (L)" });
  boton.innerHTML = `${icono("users")}<span class="solo-lector">Gente conectada</span>`; // constants only
  const foto = document.getElementById("foto-abrir");
  if (o.barra && foto?.parentElement === o.barra) foto.before(boton); else (o.barra ?? document.body).appendChild(boton);

  let reloj = 0;
  const panel = crearDialogo({ id: "gente", titulo: "Gente conectada", tecla: "KeyL", boton,
    alAbrir: () => { pintar(); pedir(); reloj = window.setInterval(pedir, REFRESCO_MS); },
    alCerrar: () => { clearInterval(reloj); } });
  const nota = el("p", { className: "nota" });
  const lista = el("ul", { className: "gente-lista" });
  lista.setAttribute("aria-label", "Conectados ahora");
  const estadoP = el("p", { className: "estado" });
  estadoP.setAttribute("role", "status"); estadoP.setAttribute("aria-live", "polite");
  const encontrable = el("input", { type: "checkbox", id: "gente-encontrable" });
  const permitir = el("input", { type: "checkbox", id: "gente-permitir" });
  const filaPermitir = el("label", { className: "opcion" }, permitir, " Permitir ir junto a otros en este mundo");
  filaPermitir.htmlFor = "gente-permitir";
  const filaEncontrable = el("label", { className: "opcion" }, encontrable, " Dejarme encontrar (salir en esta lista)");
  filaEncontrable.htmlFor = "gente-encontrable";
  panel.cuerpo.append(nota, lista, estadoP, filaEncontrable, filaPermitir);

  const pedir = () => { const r = viajar.pedirGente(); if (!r.ok && r.why) estadoP.textContent = r.why; };
  function pintar(): void {
    const activo = viajar.activo();
    nota.textContent = activo ? "Quien está ahora en este mundo. «Ir» te lleva a su lado." : "En este mundo ahora no se puede ir junto a otros: lo han apagado.";
    const g = viajar.estado.gente;
    lista.replaceChildren(...(g.length ? g.map((p) => {
      const b = el("button", { type: "button", textContent: "Ir" });
      b.setAttribute("aria-label", `Ir junto a ${p.nombre}`);
      b.disabled = !activo;
      b.addEventListener("click", () => { const r = viajar.ir(p.quien); if (!r.ok) { estadoP.textContent = r.why ?? "No se pudo."; return; } estadoP.textContent = `Vas con ${p.nombre}…`; panel.cerrar(); });
      const li = el("li", {}, el("span", { className: "nombre", textContent: p.nombre }), b);
      li.dataset.quien = String(p.quien);
      return li;
    }) : [el("li", { className: "vacio", textContent: "No hay nadie más conectado ahora en este mundo." })]));
    if (viajar.estado.todos > g.length) lista.append(el("li", { className: "vacio", textContent: `Y ${viajar.estado.todos - g.length} más.` }));
    encontrable.checked = viajar.estado.encontrable;
    filaPermitir.hidden = !viajar.estado.puede;
    permitir.checked = activo;
  }
  encontrable.addEventListener("change", () => { viajar.encontrable(encontrable.checked); });
  permitir.addEventListener("change", () => { viajar.permitir(permitir.checked); });
  viajar.alCambiar((q) => {
    if (q === "viaje" && viajar.estado.viaje) { estadoP.textContent = viajar.estado.viaje.texto; if (!panel.abierto && !viajar.estado.viaje.ok) anunciar(viajar.estado.viaje.texto); }
    if (panel.abierto) pintar();
  });
  return { abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), get abierto() { return panel.abierto; } };
}
