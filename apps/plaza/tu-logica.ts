// «Tú» (the player sheet, key I): the pure decisions behind its Personaje page and the HUD card's portrait — which house
// avatar you wear, where its pre-rendered portrait lives, your badges (earned and still to earn) and how long you have been
// here. No DOM: test/tu-logica.test.ts reads it. The portraits are real renders of each house VRM (tools/retratos.mjs →
// apps/plaza/public/retratos/<id>-busto|cuerpo|espalda.webp); an avatar with none (an upload) gets the house silhouette.
import catalogo from "../../activos/avatares/catalogo.json" with { type: "json" };
import { recompensasDe } from "./misiones.ts";
import { elegirAvatar } from "../../packages/render/src/avatares-politica.ts";
import type { Objeto } from "./bolsa-rejilla.ts";

export type TipoRetrato = "busto" | "cuerpo" | "espalda";
/** The house avatars that have portraits: every model of the catalogue (test/retratos.test.ts checks the files exist). */
export const CON_RETRATO: ReadonlySet<string> = new Set(catalogo.modelos.map((m) => m.id));

/** The URL of an avatar's portrait, or null (no id, or not a house avatar): the caller draws the silhouette instead. */
export function retratoDe(id: string | undefined | null, tipo: TipoRetrato): string | null {
  return id && CON_RETRATO.has(id) ? `/retratos/${id}-${tipo}.webp` : null;
}

/** The avatar you wear: your choice (H10 `eleccion("yo")`) or, before choosing, the same per-entity default the renderer
 * uses (packages/render/src/avatares.ts: `elegirAvatar(max(0, entity), n)`). null = no house catalogue on this page. */
export function avatarQueLlevas<M>(modelos: readonly M[] | undefined, eleccion: number | undefined, entidad: number): M | null {
  const n = modelos?.length ?? 0;
  if (!n) return null;
  const i = eleccion ?? elegirAvatar(Math.max(0, entidad), n);
  return modelos![i] ?? null;
}

export type Insignia = { nombre: string; mision: string; conseguida: boolean };
/** Your badges from the quest book (`misiones.libro()`): a done quest's badges are earned (its «Objeto «…»» rewards are goods,
 * not badges); an active quest's badges are the ones still to earn (shown locked). A quest you have not taken is unknown to the page, so it is not counted. Earned
 * first, each name once (a repeatable quest done twice is still one badge). */
export function insigniasDelLibro(libro: readonly { titulo: string; estado: string; recompensa: string }[]): Insignia[] {
  const vistas = new Map<string, Insignia>();
  for (const m of libro) {
    for (const { nombre } of recompensasDe(m.recompensa ?? "").filter((x) => x.tipo === "insignia")) {
      const ya = vistas.get(nombre), conseguida = m.estado === "hecha";
      if (!ya) vistas.set(nombre, { nombre, mision: m.titulo, conseguida });
      else if (conseguida && !ya.conseguida) vistas.set(nombre, { nombre, mision: m.titulo, conseguida });
    }
  }
  const todas = [...vistas.values()];
  return [...todas.filter((x) => x.conseguida), ...todas.filter((x) => !x.conseguida)];
}

/** «aquí desde hace 12 min» from the milliseconds since the server welcomed this page (≤ 0 = not yet: empty). */
export function desdeHace(ms: number): string {
  if (!(ms > 0)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "acabas de llegar";
  if (min < 60) return `aquí desde hace ${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return `aquí desde hace ${h} h${r ? ` ${r} min` : ""}`;
}

/** The line under your name: «Polybot · en la Plaza · aquí desde hace 12 min», leaving out what the page does not know. */
export function lineaDeTu(o: { avatar?: string | null; mundo?: string | null; ms: number }): string {
  return [o.avatar?.trim(), o.mundo?.trim() ? `en ${o.mundo.trim()}` : "", desdeHace(o.ms)].filter(Boolean).join(" · ");
}

/** What you carry (MIS-257): the one weapon and up to three relics that are `portado` in the Bolsa, in the order the equipment row
 * draws them. Anything else (tokens, catches, the Reserva) stays in the Bolsa. A list that is not an array gives an empty kit. */
export function equipoDeLaLista(lista: unknown): { arma: Objeto | null; reliquias: Objeto[] } {
  const l = (Array.isArray(lista) ? lista : []).filter((o): o is Objeto => !!o && typeof o === "object" && (o as Objeto).portado === true);
  return { arma: l.find((o) => o.tipo === "arma") ?? null, reliquias: l.filter((o) => o.tipo === "reliquia").slice(0, 3) };
}

export type Aventura = { id: string; titulo: string; paso: number; pasos: number; siguiente: string; seguida: boolean };
/** Your adventures under way (MIS-257), from the quest book: only the active ones, the one you follow first, then the book's
 * order. `siguiente` is the text of the step you are on («» when the book has no such step). A done quest is not here:
 * its badge lives in Insignias. */
export function aventurasEnCurso(libro: unknown): Aventura[] {
  const l = Array.isArray(libro) ? libro : [];
  const activas = l.filter((m) => m && m.estado === "activa" && typeof m.titulo === "string").map((m) => {
    const lista: { n: number; texto: string }[] = Array.isArray(m.lista) ? m.lista : [];
    return { id: String(m.id ?? m.titulo), titulo: String(m.titulo), paso: Number(m.paso) || 0, pasos: Number(m.pasos) || lista.length, siguiente: String(lista.find((x) => x.n === m.paso)?.texto ?? ""), seguida: m.seguida === true };
  });
  return [...activas.filter((a) => a.seguida), ...activas.filter((a) => !a.seguida)];
}
