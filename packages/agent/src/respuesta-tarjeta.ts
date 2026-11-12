// respuesta-tarjeta — the read-only answer to «/ursa <text>» (any `/<agent> <text>`): the words come from the agent's own card
// (numinia-archive agents/<id>/OPERATOR.md), never from a model and never from a write. Pure: no I/O, no Node import (it bundles
// into the Worker with mcp-mundo.ts). The bridge hands in the card's text; this picks the part of it that answers best and cuts it
// to what one chat line carries (190 bytes, the `decir` limit). The card is English, so is the answer.
// The asker's words only choose WHICH part of the card is read (they are matched against its headings and bullets); they are never
// copied into the answer and never an order (STD-050).
export const RESPUESTA_MAX = 190;

const enc = new TextEncoder();
const bytes = (s: string): number => enc.encode(s).length;
function cortar(s: string, max: number): string {
  if (bytes(s) <= max) return s;
  let out = "", n = 0;
  for (const c of s) { const b = bytes(c); if (n + b > max - 1) break; out += c; n += b; }
  return `${out.trimEnd()}…`;
}
const plegar = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const PARES = /[^\p{L}\p{N}]+/u;
const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "is", "are", "you", "your", "me", "can", "do", "what", "how", "who", "i", "it", "for", "with", "on", "please", "tell", "about", "hello", "hi", "hey", "hola"]);
/** A word without its commonest English ending, so «delete» finds «deleting» and «branch» finds «branches». */
const raiz = (w: string): string => (w.length > 5 ? w.replace(/(ing|ed|es|s)$/, "") : w.replace(/s$/, "")).replace(/e$/, "");
const palabras = (s: string): string[] => plegar(s).split(PARES).filter((w) => w.length > 2 && !STOP.has(w)).map(raiz);
/** A line cut into its sentences (a bullet is one). */
const frases = (l: string): string[] => l.split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);

type Seccion = { titulo: string; lineas: string[] };

/** Pure: the card without its front matter, HTML comments, links' targets and Markdown marks, cut into «## » sections (the intro, before the first one, has the title). */
export function leerTarjeta(md: string): { titulo: string; secciones: Seccion[] } {
  let sinFm = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  // Repeat until stable so nested pieces like «<!<!---->--» cannot leave a comment opener behind; then drop any unterminated opener.
  for (let antes = ""; antes !== sinFm; ) { antes = sinFm; sinFm = sinFm.replace(/<!--[\s\S]*?-->/g, ""); }
  sinFm = sinFm.replace(/<!--/g, "");
  let titulo = "";
  const secciones: Seccion[] = [{ titulo: "", lineas: [] }];
  const limpia = (l: string): string => l.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").replace(/^[-+]\s+/, "").replace(/\s+/g, " ").trim();
  for (const crudo of sinFm.split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.*)$/.exec(crudo);
    if (h) {
      if (h[1].length === 1 && !titulo) titulo = limpia(h[2]);
      else secciones.push({ titulo: limpia(h[2]), lineas: [] });
      continue;
    }
    const l = limpia(crudo);
    if (l) secciones[secciones.length - 1].lineas.push(l);
  }
  return { titulo, secciones: secciones.filter((s) => s.lineas.length > 0) };
}

/** Pure: the short answer to `texto` from the card `md` of the agent called `nombre` (no « · IA» tail). Never empty; never starts with «/». */
export function responderDeTarjeta(md: string, texto: string, nombre: string): string {
  const quien = nombre.trim() || "this agent";
  const { secciones } = leerTarjeta(md);
  if (secciones.length === 0) return cortar(`I'm ${quien}. My card has nothing I can read out right now.`, RESPUESTA_MAX);
  const q = new Set(palabras(texto));
  let mejor: { s: Seccion; linea: string; puntos: number } | null = null;
  if (q.size > 0) {
    for (const s of secciones) {
      const tit = new Set(palabras(s.titulo));
      for (const l of s.lineas.flatMap(frases)) {
        const lw = new Set(palabras(l));
        let p = 0;
        for (const w of q) { if (tit.has(w)) p += 1; if (lw.has(w)) p += 3; }
        if (p > 0 && (!mejor || p > mejor.puntos || (p === mejor.puntos && l.length < mejor.linea.length))) mejor = { s, linea: l, puntos: p };
      }
    }
  }
  if (mejor) return cortar(`${quien}, from my card — ${mejor.s.titulo ? `${mejor.s.titulo}: ` : ""}${mejor.linea}`, RESPUESTA_MAX);
  // nothing matched (or just «hello»): who I am, and how to ask for more
  const intro = secciones.find((s) => s.titulo === "")?.lineas.find((l) => !/^who authorises/i.test(l)) ?? "";
  const temas = secciones.filter((s) => s.titulo).map((s) => s.titulo).slice(0, 3).join(" / ");
  return cortar(`I'm ${quien}. ${intro ? `${intro} ` : ""}My card covers: ${temas || "nothing yet"}. Ask me about one of them.`, RESPUESTA_MAX);
}
