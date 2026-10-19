// dardos duel in the plaza (AR-D4), the pure parts: what the sign above the 3D board says (the same text helpers as the
// wall board, dardos-duelo.ts: `panelDe`, `pintarPanel`), the «En su pared (AR)» tag, the invitation of a host waiting
// alone, and where/when a dart of the remote player flies in. No three, no DOM beyond a 2D context: unit tests run it
// without a screen (test/dardos-duelo-plaza.test.ts). The 3D side is dardos-duelo-plaza-3d.ts.
import { PINTADA, RADIO_M } from "./diana.ts";
import { panelDe, pintarPanel, salidaRival, PANEL_PX } from "./dardos-duelo.ts";
import type { DueloV, Panel, P3 } from "./dardos-duelo.ts";

/** Shown under the sign when the other player joined from a real wall. */
export const TAG_PARED = "En su pared (AR)";
/** The footer of the sign while a host waits alone: it tells a person walking by that the duel exists and how to join. */
export const INVITACION = "Esperando rival — ¿juegas desde tu pared (AR)?";
/** A dart of the remote player is flown in only if it landed this recently (ms): darts already there when you arrive just stick. */
export const RECIENTE_MS = 600;
/** Canvas of the plaza sign: the panel of the wall board (512×192) plus a strip for the tag. */
export const LETRERO_PX = { w: PANEL_PX.w, h: PANEL_PX.h + 40 } as const;

export type Letrero = { panel: Panel; /** the tag under the sign, or null */ etiqueta: string | null; /** the footer split in lines (2 when it is the invitation) */ pie: string[] };

/** What the sign of the board shows for `duelo()` (null = no match: hidden). `rondas` = rounds of that board. */
export function letreroDe(d: DueloV | null, rondas: number): Letrero {
  const panel = panelDe(d, rondas);
  if (panel.fase === "nada" || !d) return { panel, etiqueta: null, pie: [] };
  const pie = panel.fase === "espera" && panel.pie === "Esperando rival…" ? [INVITACION.split(" — ")[0] + " —", INVITACION.split(" — ")[1]] : [panel.pie];
  return { panel, etiqueta: d.a.pared || d.b?.pared ? TAG_PARED : null, pie };
}
/** A key that changes exactly when the sign must be repainted. */
export const claveLetrero = (l: Letrero): string => JSON.stringify([l.panel, l.etiqueta]);

/** Did this player (entity) join from a real wall? */
export const enPared = (d: DueloV | null, quien: number): boolean => !!d && ((d.a.entity === quien && !!d.a.pared) || (!!d.b && d.b.entity === quien && !!d.b.pared));
/** A dart flies in only in a live match, thrown by a player on a wall, and only if it just landed. */
export function debeVolar(d: DueloV | null, x: { quien: number; sitio: string; cuando?: number }, ahoraMs: number): boolean {
  return !!d && !d.fin && !d.esperando && d.sitio === x.sitio && enPared(d, x.quien) && x.cuando !== undefined && ahoraMs - x.cuando <= RECIENTE_MS;
}
/** Where the dart starts (board-local metres of a real board, as the stuck darts): always above-left of the board. */
export const salidaPlaza = (x: number, y: number): P3 => salidaRival(x, y, 1, RADIO_M);
/** Where it ends: the same spot the stuck dart takes (way off the board it falls under it). */
export function destinoPlaza(x: number, y: number): P3 {
  const fuera = Math.hypot(x, y) > PINTADA * 1.2;
  return { x: x * RADIO_M, y: fuera ? -RADIO_M * PINTADA * 1.3 : y * RADIO_M, z: 0.012 };
}

/** Paint the sign (plain canvas). Called only when `claveLetrero` changed. */
export function pintarLetrero(ctx: CanvasRenderingContext2D, l: Letrero): void {
  const { w, h } = LETRERO_PX;
  ctx.clearRect(0, 0, w, h);
  if (l.panel.fase === "nada") return;
  const espera = l.panel.fase === "espera" && l.pie.length === 2; // the invitation is two lines; «Pulsa Empezar» / «Esperando al anfitrión» are the panel's own footer
  pintarPanel(ctx, espera ? { ...l.panel, pie: "" } : l.panel); // the waiting footer is two lines: drawn here
  if (espera) {
    ctx.fillStyle = "#ffd27a"; ctx.font = "800 27px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    l.pie.forEach((t, i) => ctx.fillText(t, w / 2, 144 + i * 31));
  }
  if (l.etiqueta) {
    ctx.fillStyle = "rgba(20,24,30,.92)"; ctx.beginPath(); ctx.roundRect(w / 2 - 130, PANEL_PX.h + 6, 260, 32, 16); ctx.fill();
    ctx.fillStyle = "#9fd8ff"; ctx.font = "700 22px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(l.etiqueta, w / 2, PANEL_PX.h + 23);
  }
}
