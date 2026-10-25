// gemelos (H6): the HTML twin of what is drawn in the world as a picture. Every image placed in the world (an `imagen` thing) that has a
// name is also, for the screen reader and for an AI, a real list item — «Imagen «Cartel de la plaza», a 5 m, delante a la izquierda» — nearest
// first, with a real button when the picture carries a link (the same confirm and the same https-only open as the click: enlaces.ts).
// Pictures marked as decoration (`decorado`, the alt="" of the world) are left out on purpose. The list is invisible to sight
// (`.solo-lector`), is rewritten only when what it says changes (phones stay cool), and never moves focus: rows are updated in place.
import { distancia, lado } from "../../packages/client/src/mapa.ts";

type Obj = Record<string, unknown> & { id: string };
export type Gemelo = { id: string; nombre: string; distancia: number; lado: string; texto: string; enlace: string | null };
export const GEMELOS_MAX = 30;

/** The twins of the pictures around `yo` (x, z) for someone facing `yaw`: named, visible pictures, nearest first, at most `max`.
 * `abrible` says which links may open (enlaces.ts `enlaceAbrible`): a link that cannot open is not offered as a button. */
export function gemelosDe(objetos: readonly Obj[], yo: { x: number; z: number }, yaw: number, abrible: (url: string) => boolean = () => true, max = GEMELOS_MAX): Gemelo[] {
  const out: Gemelo[] = [];
  for (const o of objetos) {
    if (o.tipo !== "imagen" || o.oculto === true) continue;
    const nombre = String(o.nombre ?? "").trim();
    if (!nombre || o.decorado === true) continue; // decoration says nothing, as alt=""
    const dx = Number(o.x) - yo.x, dz = Number(o.z) - yo.z;
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) continue;
    const d = Math.hypot(dx, dz), l = d < 1 ? "aquí mismo" : lado(dx, dz, yaw);
    const url = String(o.enlace ?? "").trim();
    out.push({ id: o.id, nombre, distancia: d, lado: l, texto: `Imagen «${nombre}», ${distancia(d)}${d < 1 ? "" : `, ${l}`}`, enlace: url && abrible(url) ? url : null });
  }
  return out.sort((a, b) => a.distancia - b.distancia || a.id.localeCompare(b.id)).slice(0, max);
}
/** What the list says, as one string: when it is the same, nothing is rewritten. */
export const firmaGemelos = (g: readonly Gemelo[]): string => g.map((x) => `${x.id}|${x.texto}|${x.enlace ?? ""}`).join("\n");

export type OpcionesGemelos = {
  constructor: { lista(): Obj[] };
  session: { entity: number; selfPosition(alpha: number): { x: number; z: number } };
  view: { cam?: { yaw?(): number } };
  /** The click's own door (enlaces.ts): confirms, then opens in a new tab. */
  enlaces?: { pinchar(key: string): boolean };
  abrible?: (url: string) => boolean;
  /** Where the list goes (default: the end of <body>). */
  padre?: HTMLElement;
};

export function montarGemelos(o: OpcionesGemelos) {
  const raiz = document.createElement("section");
  raiz.id = "gemelos-mundo"; raiz.className = "solo-lector"; raiz.setAttribute("aria-labelledby", "gemelos-mundo-h");
  const h = document.createElement("h2"); h.id = "gemelos-mundo-h"; h.textContent = "Imágenes del mundo";
  const ul = document.createElement("ul"); ul.setAttribute("aria-label", "Imágenes del mundo, de la más cercana a la más lejana");
  raiz.append(h, ul); (o.padre ?? document.body).append(raiz);
  let ultima: Gemelo[] = [], firma = "";
  const filas = new Map<string, HTMLLIElement>();

  function calcular(): Gemelo[] {
    if (o.session.entity < 0) return [];
    const p = o.session.selfPosition(1), yaw = o.view.cam?.yaw?.();
    return gemelosDe(o.constructor.lista(), p, typeof yaw === "number" && Number.isFinite(yaw) ? yaw : 0, o.abrible);
  }
  function pintar(): void {
    const g = calcular(), f = firmaGemelos(g);
    ultima = g;
    if (f === firma) return;
    firma = f;
    const vivos = new Set(g.map((x) => x.id));
    for (const [id, li] of filas) if (!vivos.has(id)) { li.remove(); filas.delete(id); }
    for (const x of g) {
      let li = filas.get(x.id);
      if (!li) {
        li = document.createElement("li"); li.dataset.id = x.id;
        li.append(document.createElement("span"));
        filas.set(x.id, li);
      }
      (li.firstChild as HTMLElement).textContent = x.texto;
      const b = li.querySelector("button");
      if (x.enlace && !b) {
        const btn = document.createElement("button"); btn.type = "button";
        btn.addEventListener("click", () => { o.enlaces?.pinchar(x.id); });
        li.append(btn);
      } else if (!x.enlace && b) b.remove();
      const btn = li.querySelector("button");
      if (btn) { btn.textContent = `Abrir el enlace de ${x.nombre}`; btn.dataset.id = x.id; }
    }
    if (!ul.contains(document.activeElement)) for (const x of g) ul.appendChild(filas.get(x.id)!); // nearest first; rows move only when focus is elsewhere
  }
  const t = setInterval(pintar, 1000);
  if (typeof t === "object" && "unref" in t) (t as { unref(): void }).unref();
  pintar();
  return { raiz, pintar, lista: (): Gemelo[] => ultima, parar: () => clearInterval(t) };
}
