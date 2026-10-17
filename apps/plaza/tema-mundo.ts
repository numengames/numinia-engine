// The world's look (ficha@1 `tema`, served by GET /status): an event brings its own colours and title face — the TRG26
// its pink, cyan and condensed titles — without touching the engine. It only sets CSS variables that tema.css already
// reads, so a world without a tema looks exactly like the house (Nocturno, STD-023). The server checked the values
// (packages/server/src/aventura.ts leerTema); the page checks them again, because the wire is not trusted.
type Raiz = { style: { setProperty(k: string, v: string): void }; dataset: Record<string, string | undefined> };

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v: unknown): string | null => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null);
/** ficha@1 colour → the tema.css variables it sets (superficie and accion are handled apart: alpha, ink). */
export const VARIABLES: Record<string, string[]> = {
  fondo: ["--n-fondo"], elevado: ["--n-elev"], texto: ["--n-texto"], texto2: ["--n-texto2"], linea: ["--n-linea"],
  foco: ["--n-turquesa"], accion: ["--n-accion", "--n-accion-h"], enfasis: ["--n-ambar"], etiqueta: ["--n-verdemar"],
};
/** The title faces the engine ships (public/fuentes, SIL OFL 1.1). A condensed face reads small: it grows a little. */
export const LETRAS: Record<string, { familia: string; peso: string; espacio: string; escala: string }> = {
  "geist": { familia: "\"Geist\", system-ui, sans-serif", peso: "600", espacio: "-.01em", escala: "1" },
  "geist-mono": { familia: "\"Geist Mono\", ui-monospace, monospace", peso: "600", espacio: "0", escala: "1" },
  "bebas-neue": { familia: "\"Bebas Neue\", \"Geist\", system-ui, sans-serif", peso: "400", espacio: ".03em", escala: "1.45" },
};
const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** The ink for text on a colour: dark on a light colour, white on a dark one (WCAG relative luminance). */
export function tinta(fondo: string, oscura = "#14110f"): string {
  const [r, g, b] = rgb(fondo).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? oscura : "#ffffff";
}

/** Put a world's tema on the page; returns how many variables it set (0 = the house look, untouched). */
export function aplicarTema(t: unknown, raiz: Raiz): number {
  if (!t || typeof t !== "object" || Array.isArray(t)) return 0;
  const o = t as Record<string, unknown>;
  let n = 0;
  const pon = (k: string, v: string) => { raiz.style.setProperty(k, v); n++; };
  for (const [clave, vars] of Object.entries(VARIABLES)) { const c = color(o[clave]); if (c) for (const x of vars) pon(x, c); }
  const sup = color(o.superficie);
  if (sup) {
    const [r, g, b] = rgb(sup); pon("--n-sup", `rgba(${r}, ${g}, ${b}, .92)`);
    if (tinta(sup) !== "#ffffff") pon("--n-hecho", "#1f6b5f"); // a light surface: the book's done check in the house's dark success green
  }
  const accion = color(o.accion);
  if (accion) pon("--n-accion-tinta", tinta(accion, color(o.fondo) ?? "#14110f"));
  const enfasis = color(o.enfasis);
  if (enfasis) pon("--n-enfasis-tinta", tinta(enfasis, color(o.fondo) ?? "#14110f"));
  const letra = typeof o.titulos === "string" ? LETRAS[o.titulos] : undefined;
  if (letra) {
    pon("--n-titulos", letra.familia); pon("--n-titulos-peso", letra.peso); pon("--n-titulos-espacio", letra.espacio); pon("--n-titulos-escala", letra.escala);
    raiz.dataset.temaTitulos = String(o.titulos);
  }
  const sombra = color(o.sombra);
  if (sombra) pon("--n-titulos-sombra", `-3px 3px 0 color-mix(in srgb, ${sombra} 55%, transparent)`);
  if (o.mayusculas === true) pon("--n-titulos-mayus", "uppercase");
  if (o.forma === "pildora") pon("--n-r-control", "999px");
  if (n) raiz.dataset.tema = "mundo";
  return n;
}
