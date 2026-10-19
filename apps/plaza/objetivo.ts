// M5: the «Objetivo» frame (#objetivo) and the skill bar (#habilidades).
// Objetivo shows the creature you could strike now (the one `interaccion` offers, feature «lucha») and, for 5 s after
// you walk away, the last one: its name and its Coherencia (coherencia / coherenciaMax, the real state of the lucha
// client). A creature has Coherencia, the player has no bar. Nothing is invented: «a N m» is the offered distance.
// Habilidades (#habilidades): drawn by combate.ts — the kit's three slots once the page hears of fighting, hidden before.
import { icono } from "./iconos.ts";
import type { Criatura } from "../../features/lucha/client.ts";

type Lucha = { criaturas(): Criatura[]; alCambiar(fn: () => void): () => void };
type Interaccion = { actual(): { feature: string; key: string; distance: number } | null };
export const GRACIA_MS = 5000;

/** Pure: the percentage (0–100) of Coherencia left; clamped, 0 when the maximum is unknown. */
export const porcentaje = (coherencia: number, max: number): number => (max > 0 ? Math.round(Math.max(0, Math.min(1, coherencia / max)) * 100) : 0);

export function montarObjetivo(o: { lucha: Lucha; interaccion: Interaccion }): { pintar(): void } {
  const caja = document.getElementById("objetivo");
  let ultima: { key: string; hasta: number; dist: number | null } | null = null, firma = "";
  const pintar = (): void => {
    if (!caja) return;
    const a = o.interaccion.actual(), ahora = Date.now();
    if (a?.feature === "lucha") ultima = { key: a.key, hasta: ahora + GRACIA_MS, dist: a.distance };
    else if (ultima && ahora > ultima.hasta) ultima = null;
    else if (ultima) ultima.dist = null;
    const c = ultima ? o.lucha.criaturas().find((x) => x.key === ultima!.key) : undefined;
    if (!ultima || !c || c.modo === "disuelta") { if (!caja.hidden) { caja.hidden = true; firma = ""; } return; }
    const d = ultima.dist, pct = porcentaje(c.coherencia, c.coherenciaMax);
    const f = `${c.key}|${c.nombre}|${c.coherencia}|${c.coherenciaMax}|${d === null ? "" : Math.round(d)}`;
    if (f === firma) return;
    firma = f;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
    caja.innerHTML = `<div class="fila"><b>${icono("target", 15)}<span>${esc(c.nombre)}</span></b>${d === null ? "" : `<span class="num">a ${Math.round(d)} m</span>`}</div>`
      + `<div class="etq" id="objetivo-etq">Coherencia</div>`
      + `<div class="barra" role="progressbar" aria-labelledby="objetivo-etq" aria-valuemin="0" aria-valuemax="${c.coherenciaMax}" aria-valuenow="${c.coherencia}" aria-valuetext="${c.coherencia} de ${c.coherenciaMax}"><i class="${pct > 60 ? "alta" : ""}" style="width:${pct}%"></i></div>`
      + `<div class="fila"><span class="num">${c.coherencia} / ${c.coherenciaMax}</span><span class="nota">Se disuelve a 0</span></div>`;
    caja.hidden = false;
  };
  o.lucha.alCambiar(pintar);
  setInterval(pintar, 250);
  return { pintar };
}
