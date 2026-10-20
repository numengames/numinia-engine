// dardos: the way in from afar. A board whose world turned `remoto` on (dardos.json) takes players who are NOT at its throwing
// line: from a real wall (AR) or from a flat screen. Until now the only way to such a board was the test hook; this is the
// real one: while the page knows a remote board (every `remoto` board is known to everybody, wherever they stand) a chip
// «Dardos: jugar en <diana>» with its state («Esperando rival 1/2», «Libre», «Partida en marcha») sits on the page; it opens the
// darts view in its lobby (apps/plaza/dardos.ts: «Jugar desde aquí» / «En tu pared (AR)»). The server still decides who may join.
// Pure part first (tests: test/dardos-unirse.test.ts), the little DOM piece after it.

export type SitioU = { id: string; nombre: string; x: number; z: number; radio: number; ocupado: boolean; duelo?: boolean; remoto?: boolean; espera?: boolean; jugadores?: number; equipos?: number };
export type Entrada = {
  id: string; nombre: string;
  /** «Dardos: jugar en Diana de la Torre» */ titulo: string;
  /** «Esperando rival · 1/2» */ estado: string;
  /** somebody can sit down now */ libre: boolean;
  /** somebody waits for a rival (listed first) */ espera: boolean;
};

/** You are «at» a board (its E prompt works) within its throwing radius plus this many metres: no chip then. */
export const CERCA_EXTRA_M = 1.5;
export const tituloEntrada = (nombre: string): string => `Dardos: jugar en ${nombre || "la diana"}`;

/** What a remote board offers right now, from its shared state. Pure. */
export function estadoEntrada(s: Pick<SitioU, "ocupado" | "duelo" | "espera" | "jugadores" | "equipos">): { texto: string; libre: boolean } {
  const n = s.jugadores ?? 0, max = s.equipos ?? 2;
  if (!s.duelo) return s.ocupado ? { texto: "Alguien está tirando", libre: false } : { texto: "Libre", libre: true };
  if (s.espera && n >= max) return { texto: "Completa · va a empezar", libre: false };
  if (s.espera) return { texto: n <= 1 && max === 2 ? "Esperando rival · 1/2" : `Esperando jugadores · ${n}/${max}`, libre: true };
  if (s.ocupado) return { texto: "Partida en marcha", libre: false };
  return { texto: max > 2 ? `Libre · hasta ${max} jugadores` : "Libre · sé el primero", libre: true };
}

/** The remote boards to offer to somebody standing at `yo` (null = unknown): the ones with somebody waiting first, then the free
 *  ones, then the busy ones; none for a board you stand at (its «E» prompt is already there). Pure. */
export function entradas(sitios: readonly SitioU[], yo: { x: number; z: number } | null): Entrada[] {
  const orden = (e: Entrada) => (e.espera ? 0 : e.libre ? 1 : 2);
  return sitios
    .filter((s) => s.remoto === true && !(yo && Math.hypot(yo.x - s.x, yo.z - s.z) <= s.radio + CERCA_EXTRA_M))
    .map((s): Entrada => { const e = estadoEntrada(s); return { id: s.id, nombre: s.nombre, titulo: tituloEntrada(s.nombre), estado: e.texto, libre: e.libre, espera: !!s.duelo && !!s.espera }; })
    .sort((a, b) => orden(a) - orden(b));
}

/** True when a board is farther than its throwing line (the camera must not turn to face it, and the join says `lejos`). */
export const estaLejos = (s: { x: number; z: number; radio: number }, yo: { x: number; z: number } | null): boolean => !yo || Math.hypot(yo.x - s.x, yo.z - s.z) > s.radio + CERCA_EXTRA_M;

const CSS = `
#dardos-unirse { position: fixed; left: 50%; top: 64px; transform: translateX(-50%); z-index: 29; display: grid; gap: 6px; width: min(92vw, 340px); font: 14px/1.3 system-ui, sans-serif; }
#dardos-unirse[hidden] { display: none; }
@media (max-width: 600px) { #dardos-unirse { left: 8px; transform: none; width: min(calc(100vw - 150px), 340px); } } /* the minimap sits top right on a phone */
#dardos-unirse button { display: grid; gap: 1px; justify-items: start; min-height: 48px; padding: 8px 14px; border: 0; border-radius: 14px; background: rgba(20, 24, 30, .94); color: #eef2f6; box-shadow: 0 4px 16px rgba(0,0,0,.4); text-align: left; cursor: pointer; font: inherit; }
#dardos-unirse button b { color: #ffd27a; font-weight: 800; }
#dardos-unirse button span { font-size: 12px; color: #c9d3dc; }
#dardos-unirse button.espera span { color: #9fe8a8; }
#dardos-unirse button[aria-disabled="true"] { opacity: .65; }
#dardos-unirse button:focus-visible { outline: 3px solid #fff; }`;

export type Ctl = { sitios(): SitioU[]; alCambiar(fn: (que: string) => void): () => void };

/** The chip(s) on the page. `ocupado()`: true while the darts view or a match or AR/VR already has the player (no chip then);
 *  `abrir(id)`: the click (opens the lobby of that board). `yo()`: where the player stands. */
export function montarEntrada(o: { dardos: Ctl; yo: () => { x: number; z: number } | null; ocupado: () => boolean; abrir: (id: string) => void }) {
  if (!document.getElementById("dardos-unirse-css")) { const st = document.createElement("style"); st.id = "dardos-unirse-css"; st.textContent = CSS; document.head.appendChild(st); }
  const caja = document.createElement("section"); caja.id = "dardos-unirse"; caja.hidden = true; caja.setAttribute("aria-label", "Dardos: jugar desde lejos");
  caja.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch, nor a camera drag
  document.body.appendChild(caja);
  let firma = "";
  const refrescar = (): Entrada[] => {
    const l = o.ocupado() ? [] : entradas(o.dardos.sitios(), o.yo());
    const f = JSON.stringify(l);
    if (f !== firma) { // repaint only when something changed
      firma = f; caja.textContent = "";
      for (const e of l) {
        const b = document.createElement("button"); b.type = "button"; b.dataset.sitio = e.id; if (e.espera) b.className = "espera";
        if (!e.libre) b.setAttribute("aria-disabled", "true");
        const t = document.createElement("b"), s = document.createElement("span"); t.textContent = e.titulo; s.textContent = e.estado; b.append(t, s);
        b.onclick = () => { if (e.libre) o.abrir(e.id); }; // a full or busy board: nothing to open
        caja.append(b);
      }
    }
    caja.hidden = l.length === 0;
    return l;
  };
  o.dardos.alCambiar(() => refrescar());
  const reloj = setInterval(refrescar, 1000); // the player's own steps (near a board = no chip), the HUD opening and AR ending change nothing in the controller
  refrescar();
  return { refrescar, lista: () => entradas(o.dardos.sitios(), o.yo()), caja, parar: () => clearInterval(reloj) };
}
