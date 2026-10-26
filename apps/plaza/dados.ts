// dados v1 — the page part: the dice card everyone near sees when someone rolls (each die as a face with its number,
// the total and who rolled), and, beside a dice tower, a row of dice buttons (d4 … d100, 2d6, «en secreto»). It only
// asks features/dados: the server rolls. The announcement line (and the screen reader) already says the roll in words,
// so the card is aria-hidden. In VR the HTML is not drawn: the label over the roller's head and /tirar in the chat are.
import type { Tirada, Torre } from "../../features/dados/client.ts";

type Dados = {
  ultima(): Tirada | null;
  torres(): Torre[];
  tirar(expresion?: string, sitio?: string, oculta?: boolean): { ok: boolean; why?: string };
  alCambiar(fn: (que: "tirada" | "torres" | "aviso") => void): () => void;
};

/** How long the dice card stays (ms). */
export const CARTA_MS = 7000;
/** The dice buttons beside a tower. */
export const BOTONES = ["1d6", "2d6", "3d6", "4d6", "5d6", "6d6", "1d20", "1d100"] as const; // the house system rolls pools of d6

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e;
};

/** The tray a tower's dice land in, in world metres (features/dados: the tower's own place plus its bandeja* fields; the defaults are a patch of ground). */
export function bandejaDe(t: Pick<Torre, "x" | "y" | "z" | "bandejaDx" | "bandejaDz" | "bandejaAlto" | "bandejaAncho" | "bandejaFondo">): { x: number; y: number; z: number; ancho: number; fondo: number } {
  const cm = (v: number) => Math.round(v * 100) / 100; // the wire's fixed point arrives as 0.4000000000000004: both pages work from the same clean numbers
  return { x: cm(t.x + (t.bandejaDx ?? 0)), y: cm(t.y + (t.bandejaAlto ?? 0)), z: cm(t.z + (t.bandejaDz ?? 0)), ancho: cm(t.bandejaAncho ?? 0.8), fondo: cm(t.bandejaFondo ?? 0.6) };
}
/** The face count of a roll's dice from its expression («3d6» → 6, «1d20» → 20). */
export const carasDe = (expresion: string): number => Number(/d(\d+)/i.exec(expresion)?.[1] ?? 0);

/** What the 3D view is told for a roll heard at a tower: null when there is nothing to draw (no tower named, a hidden roll without values). Pure. */
export function aTirada3D(t: Pick<Tirada, "n" | "sitio" | "dados" | "valores">, torres: readonly Torre[]): Parameters<VistaDados["tirar"]>[0] | null {
  const torre = t.sitio ? torres.find((x) => x.id === t.sitio) : undefined;
  if (!torre || !t.valores.length) return null;
  return { n: t.n, sitio: t.sitio, caras: carasDe(t.dados), valores: t.valores, bandeja: bandejaDe(torre) };
}

/** `vista`: the 3D dice (packages/render dados-vista): a roll heard at a tower falls into its tray. Absent = only the card, the label and the line. */
export type VistaDados = { tirar(t: { n: number; sitio: string; caras: number; valores: readonly number[]; bandeja: { x: number; y: number; z: number; ancho: number; fondo: number } }): boolean; /** Take away the dice lying on a tower's tray (a hidden roll replaces them: the others must not keep looking at the old roll as if it were the latest). */ quitar?(sitio: string): void };
export function montarDados(o: { dados: Dados; yo: () => { x: number; z: number } | null; vista?: VistaDados }): { cerca(): Torre | null } {
  const { dados, yo } = o;
  const carta = el("div", { id: "dados-carta" });
  carta.setAttribute("aria-hidden", "true"); // the announcement says it in words
  document.body.appendChild(carta);
  let quitar = 0;
  const pintarTirada = (t: Tirada) => {
    const caras = Number(/d(\d+)/.exec(t.dados)?.[1] ?? 6);
    const fila = el("div", { className: "fila" }, ...(t.valores.length ? t.valores : Array.from({ length: Number(/^(\d+)/.exec(t.dados)?.[1] ?? 1) }, () => NaN)).map((v) => {
      const d = el("span", { className: `dado d${caras}${Number.isNaN(v) ? " tapado" : ""}${(caras === 20 && v === 20) || (caras === 6 && v === 6) ? " critico" : ""}${v === 1 && (caras === 20 || caras === 6) ? " pifia" : ""}`, textContent: Number.isNaN(v) ? "?" : String(v) });
      return d;
    }));
    const lectura = / — (.+)$/.exec(t.texto)?.[1]; // a pool of d6: the house reading (éxito normal, fracaso…)
    const pie = t.oculta && !t.valores.length ? "en secreto" : lectura ? lectura[0].toUpperCase() + lectura.slice(1) : `${t.mod ? `${t.mod > 0 ? "+" : ""}${t.mod} · ` : ""}total ${t.total}`;
    carta.replaceChildren(el("p", { className: "quien", textContent: t.texto.split(" tira ")[0] + ` · ${t.dados} · tirada ${t.n}` }), fila, el("p", { className: "total", textContent: pie }));
    // the same roll, falling into the tower's tray (on a PC: d4–d100; a hidden roll reaches the others without values and draws nothing — only the roller sees the dice)
    const en3D = o.vista ? aTirada3D(t, dados.torres()) : null;
    if (o.vista && en3D) o.vista.tirar(en3D);
    else if (o.vista && t.oculta && t.sitio) o.vista.quitar?.(t.sitio); // someone rolled in secret: the old dice go, the new ones are theirs alone to see
    carta.classList.remove("visible"); void carta.offsetWidth; carta.classList.add("visible", "cae");
    clearTimeout(quitar);
    quitar = window.setTimeout(() => carta.classList.remove("visible", "cae"), CARTA_MS);
  };

  // the dice buttons: only within a tower's radius
  const barra = el("div", { id: "dados-torre" });
  barra.setAttribute("role", "group");
  barra.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  document.body.appendChild(barra);
  const secreto = el("input", { type: "checkbox", id: "dados-secreto" });
  let actual: Torre | null = null;
  const cerca = (): Torre | null => {
    const p = yo(); if (!p) return null;
    return dados.torres().find((t) => Math.hypot(t.x - p.x, t.z - p.z) <= t.radio + 0.5) ?? null;
  };
  const pintarBarra = () => {
    const t = cerca();
    if (t?.id === actual?.id && t?.ultima === actual?.ultima) return;
    actual = t;
    if (!t) { barra.replaceChildren(); barra.hidden = true; return; }
    barra.hidden = false;
    barra.setAttribute("aria-label", `${t.nombre}: elige los dados`);
    barra.replaceChildren(
      el("p", { className: "titulo", textContent: t.nombre }),
      el("div", { className: "botones" }, ...BOTONES.map((b) => { const x = el("button", { type: "button", textContent: b }); x.addEventListener("click", () => dados.tirar(b, t.id, secreto.checked)); return x; })),
      el("label", { className: "secreto" }, secreto, " en secreto"),
      el("p", { className: "ultima", textContent: t.ultima ? `Última: ${t.ultima}` : "Aún no ha tirado nadie." }),
    );
  };
  barra.hidden = true;
  dados.alCambiar((q) => { if (q === "tirada") { const t = dados.ultima(); if (t) pintarTirada(t); } pintarBarra(); });
  window.setInterval(pintarBarra, 400); // you walk up to a tower: the buttons follow
  return { cerca };
}
