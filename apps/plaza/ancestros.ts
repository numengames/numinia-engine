// ancestros v1 — the page part: feeds the 3D hall (view.ancestros: walls, holograms, the two panels behind the
// hologram with the Three Laws and our AGW rules), keeps a name over each hologram that says it is a dramatization
// (clicking the name is «hablar», J4), and, when a hologram answers YOU, opens a panel with the law, our rule beside it
// and the notice (Esc or «Cerrar»). It only asks features/ancestros: the server decides what is said and to whom. The
// announcement line already reads the words to a screen reader, so the panel is aria-hidden to it.
import type { Holograma, Dicho, Que } from "../../features/ancestros/client.ts";
import { escribiendo } from "./interactuar.ts";

type Ancestros = {
  hologramas(): Holograma[]; muros(): { id: string; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }[];
  ultimo(): Dicho | null; textos: { leyes: readonly string[]; nuestras: readonly { id: string; texto: string }[]; lema: string; aviso: string };
  alCambiar(fn: (que: Que) => void): () => void;
};
type Vista = {
  ancestros: { muros(l: Ancestros extends { muros(): infer M } ? M : never): void; hologramas(l: Holograma[]): void; paneles(l: { id: string; titulo: string; lineas: string[]; x: number; y: number; z: number; rumbo: number; pie?: string }[]): void; dice(id: string, texto: string): void };
  tag(key: string, t: { text: string; x: number; y: number; z: number; sub?: string } | null): void;
};

/** How long the panel stays open on its own (ms); Esc or «Cerrar» close it before. */
export const PANEL_MS = 20000;
/** The second line under the hologram's name: what it is, said at first sight. */
export const SUBTITULO = "Holograma · dramatización";
/** Where the two panels go: behind the hologram (against the back wall), one each side, at reading height. */
export const PANEL_ATRAS_M = 3.4, PANEL_LADO_M = 1.45, PANEL_ALTO_M = 1.9;

const CSS = `
#ancestros-panel { position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%); width: min(620px, calc(100% - 20px)); max-height: calc(100% - 90px); overflow: auto; box-sizing: border-box; padding: 12px 14px; border-radius: 10px; background: rgba(12, 18, 26, .92); color: #eef2f6; border: 1px solid #7fd8ff; }
#ancestros-panel h2 { margin: 0 0 6px; font-size: 15px; color: #ffd27a; }
#ancestros-panel .ley { margin: 0 0 10px; font-size: 16px; line-height: 1.35; }
#ancestros-panel .lema { margin: 0 0 4px; color: #7fd8ff; font-size: 13px; }
#ancestros-panel .nuestra { margin: 0 0 10px; line-height: 1.35; }
#ancestros-panel .nuestra b { color: #7fd8ff; }
#ancestros-panel .aviso { margin: 0 0 8px; font-size: 12px; color: #a9b4c0; font-style: italic; }
#ancestros-panel button { padding: 7px 10px; border: 0; border-radius: 6px; background: transparent; color: #eef2f6; text-decoration: underline; font: inherit; }
#ancestros-panel button:focus-visible { outline: 3px solid #ffd27a; }
`;

export function montarAncestros(o: { ancestros: Ancestros; view: Vista }): { abierto(): boolean; cerrar(): void; paneles(): number } {
  const { ancestros: a, view } = o;
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const panel = document.createElement("section"); panel.id = "ancestros-panel"; panel.hidden = true; panel.setAttribute("aria-hidden", "true");
  const titulo = document.createElement("h2"), ley = document.createElement("p"), lema = document.createElement("p"), nuestra = document.createElement("p"), aviso = document.createElement("p"), cerrar = document.createElement("button");
  ley.className = "ley"; lema.className = "lema"; nuestra.className = "nuestra"; aviso.className = "aviso"; cerrar.type = "button"; cerrar.textContent = "Cerrar (Esc)";
  lema.textContent = a.textos.lema; aviso.textContent = a.textos.aviso;
  panel.append(titulo, ley, lema, nuestra, aviso, cerrar);
  panel.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // a tap here is not a joystick touch
  document.body.appendChild(panel);
  let cierra = 0;
  const cerrarPanel = () => { panel.hidden = true; clearTimeout(cierra); };
  cerrar.addEventListener("click", cerrarPanel);
  addEventListener("keydown", (e) => { if (e.code === "Escape" && !panel.hidden && !escribiendo(e)) { e.preventDefault(); cerrarPanel(); } });

  const nombres = new Set<string>();
  let panelesPuestos = 0;
  const cosas = () => {
    view.ancestros.muros(a.muros());
    const hs = a.hologramas();
    view.ancestros.hologramas(hs);
    const vivos = new Set(hs.map((h) => h.id));
    for (const k of nombres) if (!vivos.has(k)) { view.tag(`ancestros:${k}`, null); nombres.delete(k); }
    const paneles: Parameters<Vista["ancestros"]["paneles"]>[0] = [];
    for (const h of hs) {
      nombres.add(h.id);
      view.tag(`ancestros:${h.id}`, { text: h.nombre, sub: SUBTITULO, x: h.x, y: h.y + 2.0, z: h.z });
      const r = (h.rumbo * Math.PI) / 180, fx = Math.sin(r), fz = Math.cos(r); // where it faces when asleep; the panels go behind
      const bx = h.x - fx * PANEL_ATRAS_M, bz = h.z - fz * PANEL_ATRAS_M, lx = fz, lz = -fx;
      paneles.push({ id: `${h.id}-leyes`, titulo: "Las Tres Leyes de la Robótica · Asimov, 1942", lineas: [...a.textos.leyes], pie: a.textos.aviso.split(".")[0] + ".", x: bx - lx * PANEL_LADO_M, y: h.y + PANEL_ALTO_M, z: bz - lz * PANEL_LADO_M, rumbo: h.rumbo });
      paneles.push({ id: `${h.id}-nuestras`, titulo: "Las nuestras, 80 años después · AGW (STD-050)", lineas: a.textos.nuestras.map((n) => `${n.id} — ${n.texto}`), pie: "Cuatro de las catorce reglas de una IA en un mundo de Numinia.", x: bx + lx * PANEL_LADO_M, y: h.y + PANEL_ALTO_M, z: bz + lz * PANEL_LADO_M, rumbo: h.rumbo });
    }
    view.ancestros.paneles(paneles); panelesPuestos = paneles.length;
  };
  const dicho = () => {
    const d = a.ultimo(); if (!d) return;
    view.ancestros.dice(d.pnj, d.texto);
    if (!d.mia) return;
    const h = a.hologramas().find((x) => x.id === d.pnj);
    titulo.textContent = `${h?.nombre ?? "Holograma"} · Ley ${d.ley} de 3`;
    ley.textContent = d.texto;
    nuestra.replaceChildren(Object.assign(document.createElement("b"), { textContent: `${d.regla}: ` }), d.nuestra);
    panel.hidden = false;
    clearTimeout(cierra); cierra = window.setTimeout(cerrarPanel, PANEL_MS);
  };
  a.alCambiar((que) => { if (que === "cosas") cosas(); else if (que === "dice") dicho(); });
  cosas();
  return { abierto: () => !panel.hidden, cerrar: cerrarPanel, paneles: () => panelesPuestos };
}
