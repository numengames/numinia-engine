// t_45ef2f70: the house faces (Geist, Geist Mono: 115 kB between both, 16 % of the bytes until playable) used to be
// declared in tema.css, so the browser fetched them before the first frame and they shared the 4G link with the code.
// Declared here instead and added after the first frame (main.ts: alPrimerCuadro); `font-display: swap` was already the
// rule, so the page shows the system face for the first seconds and then swaps. Same files, same urls.
export const CSS_FUENTES =
  '@font-face { font-family: "Geist"; src: url("/fuentes/Geist-Variable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }\n' +
  '@font-face { font-family: "Geist Mono"; src: url("/fuentes/GeistMono-Variable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }';

export function ponerFuentes(doc: Document = document): void {
  if (doc.getElementById("fuentes-casa")) return;
  const s = doc.createElement("style");
  s.id = "fuentes-casa";
  s.textContent = CSS_FUENTES;
  doc.head.appendChild(s);
}
