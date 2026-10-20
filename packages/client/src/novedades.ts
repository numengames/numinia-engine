// «Qué hay de nuevo» (t_bdc2c2db): a new version must be felt on screen, not just in the number (Pablo, 2026-10-18:
// «que lo nuevo SE NOTE en la interfaz»). Pure, testable logic: picking the last diary entries from docs/RUNLOG.md
// (a changelog reads the same way) and deciding whether this is a version nobody on this browser has seen yet.
// Showing the card (a <dialog>, once, remembered in localStorage) is apps/plaza/novedades.ts; the three lines it
// shows for THIS build are baked in at build time into apps/plaza/novedades-datos.ts by tools/novedades-generar.mjs
// (run before `npm run dev`/`npm run build`, hooked as "predev"/"prebuild": no diary text ships to the browser).

const ENCABEZADO = /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2} · .+ · (hecho|bloqueada|en curso)\s*$/;
const QUE = /^-\s*Qué:\s*(.+)$/;

/** Cut `texto` to its first sentence, UTF-8-bounded to `maxBytes` (the house's rule for any text shown in the world). */
export function primeraFrase(texto: string, maxBytes = 160): string {
  const limpio = texto.replace(/`/g, "").trim();
  const corte = limpio.search(/\.\s|\.$/);
  let frase = corte > 0 ? limpio.slice(0, corte + 1) : limpio;
  const enc = new TextEncoder();
  if (enc.encode(frase).length <= maxBytes) return frase.trim();
  const presupuesto = maxBytes - enc.encode("…").length;
  while (enc.encode(frase).length > presupuesto) frase = frase.slice(0, -1);
  return `${frase.trim()}…`;
}

/** The `n` most recent diary entries' «Qué» line (first sentence each), newest first. Fed the file's text, not a
 * path, so it needs no filesystem to test. Entries without a «Qué» line (malformed or mid-write) are skipped. */
export function novedadesDeRunlog(texto: string, n = 3): string[] {
  const entradas: string[] = [];
  let enEntrada = false, que: string | null = null;
  const cerrar = () => { if (que) entradas.push(que); enEntrada = false; que = null; };
  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (ENCABEZADO.test(l)) { cerrar(); enEntrada = true; continue; }
    if (!enEntrada) continue;
    const q = QUE.exec(l);
    if (q && !que) que = q[1];
  }
  cerrar();
  return entradas.slice(-n).reverse().map((t) => primeraFrase(t));
}

/** ux2-barra: the news as a notice of the bell's history — a title and the lines, plus the one sentence a screen reader
 * hears (and the history's filters read). No lines, no notice. */
export function avisoDeNovedades(version: string, lineas: readonly string[]): { titulo: string; lineas: string[]; texto: string } | null {
  const l = lineas.map((x) => x.trim()).filter(Boolean);
  if (!l.length) return null;
  const titulo = `Novedades en v${version}`;
  return { titulo, lineas: l, texto: `${titulo}: ${l.join(" ")}` };
}

/** Has this browser already seen `actual` (the engine's semantic version)? `null` = never opened the card before. */
export function debeMostrarNovedades(actual: string, vista: string | null): boolean {
  return actual.length > 0 && actual !== vista;
}
