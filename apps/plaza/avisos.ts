// U3: the notices' stack (#avisos-pila, top centre). What `anunciar` says to screen readers also shows here for 6 s, up to 3 at a time
// (Mínimo and Normal show only the newest by CSS; Completo the stack). It is the sighted twin of #avisos; urgent notices
// (#avisos-urgentes) stay where they are. «Menos movimiento»: no fade, they still leave after 6 s (a stale notice must not stay).
import { SEGUNDOS_AL_CAMBIAR, apilarAviso } from "../../packages/client/src/densidad.ts";
import type { Aviso } from "../../packages/client/src/densidad.ts";
import { alAnunciar, crearDialogo } from "./paneles.ts";
import { icono } from "./iconos.ts";
import { rotularBoton } from "./menu-secciones-ui.ts"; // v2 paridad: icon, name and tooltip from the one list of sections

export function montarAvisos(): void {
  const caja = document.getElementById("avisos-pila");
  if (!caja) return;
  let pila: Aviso[] = [];
  const nodos = new Map<Aviso, HTMLElement>();
  alAnunciar((texto) => {
    const ahora = Date.now(), antes = pila;
    pila = apilarAviso(pila, texto, ahora);
    for (const v of antes) if (!pila.includes(v)) { // left the stack: expired, pushed out, or renewed
      nodos.get(v)?.remove(); nodos.delete(v);
    }
    const nuevo = pila[pila.length - 1];
    if (!nodos.has(nuevo)) {
      const p = document.createElement("p"); p.textContent = nuevo.texto; nodos.set(nuevo, p); caja.appendChild(p);
      setTimeout(() => { p.classList.add("saliendo"); setTimeout(() => { p.remove(); if (nodos.get(nuevo) === p) nodos.delete(nuevo); pila = pila.filter((x) => x !== nuevo); }, 420); }, SEGUNDOS_AL_CAMBIAR * 1000);
    }
  });
  montarCentro();
}

// The notices' centre (key N): a bell in the top bar with an unread count, and a panel with the session's notices, filterable by kind.
type Tipo = "mision" | "gente" | "combate" | "sistema" | "novedades";
const FILTROS: Array<[string, Tipo | null]> = [["Todo", null], ["Misiones", "mision"], ["Gente", "gente"], ["Combate", "combate"], ["Sistema", "sistema"]];
const ICONO: Record<Tipo, string> = { mision: "scroll", gente: "users", combate: "target", sistema: "gear", novedades: "sparkle" };
type Entrada = { texto: string; tipo: Tipo; ts: number; leido: boolean; titulo?: string; lineas?: string[]; alLeer?: () => void };

// ux2-barra: a notice that goes straight into the history — no stack at the top, nothing over the world — and waits
// there unread (the bell counts it). The news of a new version (novedades.ts) arrives this way. Queued until the bell exists.
export type AvisoFijo = { titulo: string; lineas: string[]; texto: string; tipo?: Tipo; alLeer?: () => void };
let meterFijo: ((a: AvisoFijo) => void) | null = null;
const fijosEnEspera: AvisoFijo[] = [];
export function avisoFijo(a: AvisoFijo): void { if (meterFijo) meterFijo(a); else fijosEnEspera.push(a); }
/** Kind of a notice, from its words (the announcements are plain text; there is no kind in them yet). */
export function tipoDeAviso(t: string): Tipo {
  if (/misi[oó]n|insignia|objetivo|recompensa/i.test(t)) return "mision";
  if (/golpe|da[ñn]o|estado|derrot|criatura|combate|aturdi|confundi|colaps/i.test(t)) return "combate";
  if (/ha llegado|se ha ido|se une|conectad|grupo|saluda|gente|silenci/i.test(t)) return "gente";
  return "sistema";
}

function montarCentro(): void {
  const barra = document.getElementById("barra-arriba");
  const boton = document.createElement("button"); boton.type = "button"; boton.id = "avisos-abrir"; boton.className = "solo-icono";
  rotularBoton(boton, "avisos", { extra: `<span class="insignia-n" hidden></span>` }); // v2 paridad: icon, name and tooltip from the one list of sections
  (barra ?? document.body).appendChild(boton);
  const hist: Entrada[] = [];
  const leer = (h: Entrada) => { if (!h.leido) { h.leido = true; try { h.alLeer?.(); } catch { /* a reader never breaks the bell */ } } };
  let filtro: Tipo | null = null;
  const panel = crearDialogo({ id: "avisos-centro", titulo: "Avisos", tecla: "KeyN", boton, alAbrir: () => { for (const h of hist) leer(h); pintar(); } });
  const filtros = document.createElement("div"); filtros.className = "filtros"; filtros.setAttribute("role", "group"); filtros.setAttribute("aria-label", "Filtrar avisos");
  const lista = document.createElement("ul"); lista.className = "avisos-lista"; lista.setAttribute("aria-label", "Avisos de esta sesión");
  const marcar = document.createElement("button"); marcar.type = "button"; marcar.textContent = "Marcar leídos";
  marcar.addEventListener("click", () => { for (const h of hist) leer(h); pintar(); });
  for (const [nombre, t] of FILTROS) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = nombre; b.setAttribute("aria-pressed", String(t === filtro));
    b.addEventListener("click", () => { filtro = t; for (const x of filtros.children) x.setAttribute("aria-pressed", String(x === b)); pintar(); });
    filtros.appendChild(b);
  }
  panel.cuerpo.append(filtros, lista, marcar);
  const insignia = boton.querySelector(".insignia-n") as HTMLElement;
  function pintar(): void {
    const sin = hist.filter((h) => !h.leido).length;
    insignia.hidden = sin === 0; insignia.textContent = String(Math.min(sin, 99));
    boton.setAttribute("aria-label", sin ? `Avisos, ${sin} sin leer` : "Avisos");
    if (!panel.abierto) return;
    lista.replaceChildren();
    const vis = hist.filter((h) => !filtro || h.tipo === filtro || (filtro === "sistema" && h.tipo === "novedades")).slice().reverse();
    if (!vis.length) { const v = document.createElement("li"); v.className = "vacio"; v.textContent = "No hay avisos."; lista.appendChild(v); return; }
    for (const h of vis) {
      const li = document.createElement("li"); li.className = `aviso-${h.tipo}`;
      const ic = document.createElement("span"); ic.className = "ic"; ic.innerHTML = icono(ICONO[h.tipo], 18); // constants only
      const tx = document.createElement("span"); tx.className = "tx";
      if (h.titulo && h.lineas) { // a notice with a title and its lines (the news): all of it, as text
        const b = document.createElement("b"); b.textContent = h.titulo;
        const ul = document.createElement("ul"); for (const l of h.lineas) { const x = document.createElement("li"); x.textContent = l; ul.appendChild(x); }
        tx.append(b, ul);
      } else tx.textContent = h.texto;
      const hh = document.createElement("time"); hh.textContent = new Date(h.ts).toISOString().slice(11, 16) + " UTC"; // UTC everywhere
      li.append(ic, tx, hh); lista.appendChild(li);
    }
  }
  alAnunciar((texto) => { hist.push({ texto, tipo: tipoDeAviso(texto), ts: Date.now(), leido: panel.abierto }); if (hist.length > 100) hist.shift(); pintar(); });
  meterFijo = (f) => {
    const h: Entrada = { texto: f.texto, tipo: f.tipo ?? tipoDeAviso(f.texto), ts: Date.now(), leido: false, titulo: f.titulo, lineas: f.lineas, alLeer: f.alLeer };
    hist.push(h); if (hist.length > 100) hist.shift();
    if (panel.abierto) leer(h);
    pintar();
  };
  for (const f of fijosEnEspera.splice(0)) meterFijo(f);
  pintar();
}
