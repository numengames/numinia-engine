// frases — the page's logic (Y29), loaded the first time it is needed (client.ts is the light door the start bundle holds): the list as the server published it, `decir(id)` (checks the id and the pace before sending
// so the person hears «wait» at once; the server still decides), and the paint: a bubble over the speaker and a line for
// screen readers, both in THIS page's language. What arrives is an id; `texto(id)` translates at read time, so changing
// language changes what is already shown (`repintar()` redraws the bubbles still on screen, and the lines are read
// through `texto`). The bubble carries a mark that does not depend on colour: «« … »» around the phrase.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg } from "../../packages/feature/src/index.ts";
import { frases, BOCADILLO_MS, RITMO, idiomaDe } from "./feature.ts";

export const LINEAS_MAX = 20;
type Res = { ok: true } | { ok: false; why: string };
export type Frase = { id: string; grupo: string; orden: number; en: string; es: string };
export type Linea = { quien: number; nombre: string; id: string; tuyo: boolean };

/** One per page (tests make one per client). `idioma` says the page's language (default: the document's `lang`, else English). */
export function crearFrases(reloj: () => number = () => performance.now(), idioma: () => string = () => globalThis.document?.documentElement?.lang ?? "") {
  let api: ClientApi | null = null;
  let fichas: number = RITMO.burst, antes = -1;
  const lineas: Linea[] = [];
  const vivos = new Map<number, { id: string; hasta: number }>(); // speaker -> the bubble still on screen
  const oyentes: ((l: Linea) => void)[] = [];

  /** The phrases as the server sent them, in their fixed order (empty until the list arrives). */
  const lista = (): Frase[] => {
    const e = api?.state.keys() ?? [];
    return e.map((id) => { const v = api!.state.get(id)!; return { id, grupo: String(v.grupo), orden: Number(v.orden), en: String(v.en), es: String(v.es) }; }).sort((a, b) => a.orden - b.orden);
  };
  const texto = (id: string): string => { const f = lista().find((x) => x.id === id); return f ? f[idiomaDe(idioma())] : id; };
  const marca = (t: string): string => `« ${t} »`;

  const pagina = {
    lineas: lineas as readonly Linea[],
    /** The phrases in their fixed order (the groups' names: features/frases/frases.json, read by the panel). */
    lista,
    /** A phrase in this page's language (the id itself when unknown). */
    texto,
    /** Each line as it is read now, in this page's language. */
    leer: (): { quien: number; nombre: string; texto: string; tuyo: boolean }[] => lineas.map((l) => ({ quien: l.quien, nombre: l.nombre, texto: texto(l.id), tuyo: l.tuyo })),
    alLlegar(fn: (l: Linea) => void): void { oyentes.push(fn); },
    /** Say a fixed phrase. Refused, with the reason, when unknown, too fast or before the catalog arrives. */
    decir(id: string): Res {
      if (!lista().some((f) => f.id === id)) return { ok: false, why: `Unknown phrase «${id}»: pick one from the list.` };
      const t = reloj();
      if (antes >= 0) fichas = Math.min(RITMO.burst, fichas + ((t - antes) / 1000) * RITMO.perSecond);
      antes = t;
      if (fichas < 1) return { ok: false, why: "Too fast: wait a second." };
      const r = api?.send("frase", { id }) ?? { ok: false as const, why: "the page has not started yet" };
      if (r.ok) fichas -= 1;
      return r;
    },
    /** The language changed: redraw the bubbles still on screen in the new one (no resend). */
    repintar(): void {
      const ahora = reloj();
      for (const [quien, b] of vivos) { if (b.hasta <= ahora) { vivos.delete(quien); continue; } api?.view.bubble?.(quien, marca(texto(b.id)), b.hasta - ahora); }
    },
  };

  /** Connect to the page's session (the list and the view). */
  const conectar = (a: ClientApi) => { api = a; };
  /** Someone near (or you) said a phrase: paint it in this page's language (a bubble and a line for screen readers). */
  const dicha = (m: Msg) => {
    if (!api) return;
    const quien = Number(m.quien), id = String(m.frase), nombre = String(m.nombre ?? "");
    const l: Linea = { quien, nombre, id, tuyo: quien === api.self() };
    lineas.push(l); if (lineas.length > LINEAS_MAX) lineas.shift();
    vivos.set(quien, { id, hasta: reloj() + BOCADILLO_MS });
    api.view.bubble?.(quien, marca(texto(id)), BOCADILLO_MS);
    // the server's own announcement names the id; this one says it in the page's language (low priority: never interrupts)
    api.view.announce?.({ feature: "frases", event: "traducida", text: `${nombre}: ${texto(id)}`, sound: "suave", importance: 0, who: quien });
    for (const fn of oyentes) fn(l);
  };
  /** The complete part (tests and any host that does not need the light door): the same logic, registered at once. */
  const part = clientPart(frases, (a) => { conectar(a); a.on("dicha", dicha); });
  return { part, frases: pagina, conectar, dicha };
}

const pagina = crearFrases();
export const frasesDePagina = pagina.frases;
export const conectar = pagina.conectar;
export const dicha = pagina.dicha;
