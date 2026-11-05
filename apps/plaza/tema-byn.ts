// Black-and-white HUD theme (mundo-hermes, entorno.json `tema: "black-and-white"`). Loaded by main.ts ONLY when /status says so: a world without the flag
// never fetches or runs this file, so its page is the one it always was. Pure black and white, flat: no greys, no translucency, no shadows;
// state is told by outline, fill and shape (never by colour alone). The minimap's canvas takes its palette from mapa.ts (`temaMapa`).
export const CLASE = "tema-byn";
/** The ONE accent of the theme (everything else is #000 or #fff): unread marks and the compass needle. A yellow nothing else in the house uses, so it never reads as a grey or an orange. */
export const ACENTO = "#FFD400";

/** The rules: every panel black with a white outline, buttons inverted on hover/focus/pressed, the minimap framed. Specific on purpose (`html.tema-byn`), `!important` only where the house CSS uses inline-ish rules. */
export const CSS = `
html.tema-byn { --n-fondo: #000; --n-sup: #000; --n-elev: #000; --n-texto: #fff; --n-texto2: #fff; --n-linea: #fff; --n-turquesa: #fff; --n-accion: #fff; --n-accion-h: #fff; --n-ambar: ${ACENTO}; --n-verdemar: #fff; --n-grana: #fff; --n-grana-h: #fff; --n-hecho: #fff; --n-accion-tinta: #000; --n-titulos-sombra: none; --n-r-control: 0px; }
html.tema-byn, html.tema-byn[data-aparato] { --cr: #000; --cr-fuerte: #000; --cr-borde: #fff; --cr-blur: none; }
html.tema-byn[data-densidad-nivel] body :is(#mision-seguida, #avisos-pila, #interactuar, #chat-lista, #reloj, #hud-personaje, #misiones, #objetivo, #habilidades, #acciones, #help):not(:empty) { background: #000 !important; border: 2px solid #fff !important; border-radius: 0 !important; color: #fff !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
html.tema-byn body :is(dialog, .menu-barra, [role="dialog"], [role="menu"], .panel-j5, #ajustes, #menu-lista) { background: #000 !important; background-image: none !important; color: #fff !important; border: 2px solid #fff !important; border-radius: 0 !important; }
html.tema-byn body :not(canvas):not(script):not(style) { border-color: #fff !important; }
html.tema-byn body :is(.describe, [class*="describe"], .ajuste, .ajuste *) { opacity: 1 !important; color: #fff !important; }
html.tema-byn:not([data-sin-cristal]):not(.alto-contraste):not([data-aparato^="movil"]) :is(#ajustes[open], .panel-j5[open]), html.tema-byn:not([data-sin-cristal]):not(.alto-contraste):not([data-aparato^="movil"]) #barra-arriba > .menu-barra:not([hidden]) { background: #000 !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border-color: #fff !important; }
html.tema-byn #hud-personaje #hud-personaje-abrir { background: transparent !important; border: 0 !important; } /* the card's invisible click-catcher lies over its content: it must stay see-through */
html.tema-byn .hp-retrato { background: #000 !important; border: 2px solid #fff !important; }
html.tema-byn body > *:not(canvas):not(script):not(style), html.tema-byn body > *:not(canvas):not(script):not(style) * { box-shadow: none !important; text-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; filter: none !important; }
html.tema-byn #barra-arriba button, html.tema-byn #hud-personaje, html.tema-byn #chat, html.tema-byn #chat-boton, html.tema-byn #chat-texto, html.tema-byn #chat-canal, html.tema-byn #misiones, html.tema-byn #mision-seguida, html.tema-byn #reloj, html.tema-byn #avisos-pila > *, html.tema-byn #avisos > *, html.tema-byn #interactuar, html.tema-byn #acciones, html.tema-byn #dialogo, html.tema-byn #libro, html.tema-byn #inventario-abrir, html.tema-byn #foto-abrir, html.tema-byn #volver-ciudad { background: #000 !important; background-image: none !important; color: #fff !important; border-color: #fff !important; border-radius: 0 !important; }
html.tema-byn #carga, html.tema-byn #carga .c-texto, html.tema-byn #carga .c-piezas, html.tema-byn .insignia-n { background: #000 !important; color: #fff !important; }
html.tema-byn .insignia-n { background: ${ACENTO} !important; color: #000 !important; }
html.tema-byn #hud-personaje img, html.tema-byn #hud-personaje canvas { filter: grayscale(1) contrast(1.4) !important; }
html.tema-byn #barra-arriba button svg, html.tema-byn #chat-boton svg, html.tema-byn #reloj svg { stroke: #fff !important; color: #fff !important; }
html.tema-byn #barra-arriba button .insignia, html.tema-byn #barra-arriba button [data-contador], html.tema-byn #chat-boton .insignia { background: ${ACENTO} !important; color: #000 !important; border: 2px solid #000 !important; }
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
