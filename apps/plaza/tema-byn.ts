// Black-and-white HUD theme (mundo-hermes, entorno.json `tema: "black-and-white"`). Loaded by main.ts ONLY when /status says so: a world without the flag
// never fetches or runs this file, so its page is the one it always was. Pure black and white, flat: no greys, no translucency, no shadows;
// state is told by outline, fill and shape (never by colour alone). The minimap's canvas takes its palette from mapa.ts (`temaMapa`).
export const CLASE = "tema-byn";

/** The rules: every panel black with a white outline, buttons inverted on hover/focus/pressed, the minimap framed. Specific on purpose (`html.tema-byn`), `!important` only where the house CSS uses inline-ish rules. */
export const CSS = `
html.tema-byn #hud, html.tema-byn #ajustes, html.tema-byn #panel-construir, html.tema-byn #help, html.tema-byn .panel-j5, html.tema-byn #acciones button, html.tema-byn #ajustes-abrir,
html.tema-byn #minimapa button, html.tema-byn .panel-j5 button { background: #000 !important; color: #fff !important; border: 2px solid #fff !important; border-radius: 0 !important; box-shadow: none !important; text-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; opacity: 1 !important; }
html.tema-byn #hud b, html.tema-byn .panel-j5 h2, html.tema-byn .panel-j5 h3, html.tema-byn .panel-j5 dt, html.tema-byn #ajustes .estado, html.tema-byn .panel-j5 li.bien .nombre { color: #fff !important; font-weight: 700 !important; }
html.tema-byn #minimapa button[aria-pressed="true"], html.tema-byn .panel-j5 button:hover, html.tema-byn #acciones button:hover, html.tema-byn #minimapa button:hover { background: #fff !important; color: #000 !important; }
html.tema-byn :focus-visible { outline: 3px solid #fff !important; outline-offset: 2px !important; }
html.tema-byn #minimapa canvas { border-radius: 0 !important; border: 2px solid #fff; box-shadow: none !important; }
html.tema-byn .panel-j5::backdrop { background: #000; opacity: .6; }
html.tema-byn [data-novedad]::after { background: #fff !important; box-shadow: none !important; border: 2px solid #000; }
html.tema-byn .panel-j5 li.bien, html.tema-byn .panel-j5 li.bien.ajeno, html.tema-byn #mapa-grande .detalle { background: #000 !important; border: 1px solid #fff !important; color: #fff !important; }
`;

/** Dress the page. Idempotent. Returns undo (tests, a world swap). */
export function aplicarTemaByn(doc: Document = document): () => void {
  const html = doc.documentElement;
  if (doc.getElementById("tema-byn-css")) { html.classList.add(CLASE); return () => {}; }
  const st = doc.createElement("style"); st.id = "tema-byn-css"; st.textContent = CSS; doc.head.appendChild(st);
  html.classList.add(CLASE);
  return () => { html.classList.remove(CLASE); st.remove(); };
}
