// idioma (i18n 1/5): the page's words in more than one language. Pure: no DOM, no localStorage of its own — the page passes
// them in (a Map and a fake document in tests, test/idioma.test.ts). English is the official language and the fallback;
// Spanish is second. Order of choice: stored choice > navigator language > English. A missing key in `es` reads the `en` text;
// a key missing in both reads as the key itself, never as an empty string.
// Proposal: work/propuestas/i18n-motor-en-es.md. Wiring into the menu comes in the next stories.

export type Idioma = "en" | "es";
export const IDIOMAS: readonly Idioma[] = ["en", "es"];
export const IDIOMA_DEFECTO: Idioma = "en";
/** Where the page keeps the chosen language (localStorage in the browser). */
export const CLAVE_IDIOMA = "numinia.idioma";

export type Catalogo = Readonly<Record<string, string>>;

/** English: the complete catalogue. Every key exists here first. Placeholders are written {name}. */
export const en: Catalogo = {
  "idioma.nombre": "Language",
  "idioma.describe": "The language of the menus and messages.",
  "idioma.en": "English",
  "idioma.es": "Spanish",
  "idioma.cambiado": "Language changed to {idioma}.",
  "menu.juego": "Game",
  "menu.interfaz": "Interface",
  "menu.controles": "Controls",
  "menu.graficos": "Graphics",
  "menu.sonido": "Sound and voice",
  "menu.accesibilidad": "Accessibility",
  "menu.cuenta": "Account and privacy",
  "menu.restablecerPagina": "Reset this page",
  "menu.restablecerSeccion": "Reset this section",
  "menu.paginaRestablecida": "Page reset: {pagina}.",
};

/** Spanish: may lack keys; those read the English text. */
export const es: Catalogo = {
  "idioma.nombre": "Idioma",
  "idioma.describe": "El idioma de los menús y los mensajes.",
  "idioma.en": "Inglés",
  "idioma.es": "Español",
  "idioma.cambiado": "Idioma cambiado a {idioma}.",
  "menu.juego": "Juego",
  "menu.interfaz": "Interfaz",
  "menu.controles": "Controles",
  "menu.graficos": "Gráficos",
  "menu.sonido": "Sonido y voz",
  "menu.accesibilidad": "Accesibilidad",
  "menu.cuenta": "Cuenta y privacidad",
  "menu.restablecerPagina": "Restablecer esta página",
  "menu.restablecerSeccion": "Restablecer esta sección",
  "menu.paginaRestablecida": "Página restablecida: {pagina}.",
};

export const CATALOGOS: Readonly<Record<Idioma, Catalogo>> = { en, es };

/** «es-ES», «ES_mx», «en» → the supported language; anything else (or not text) → null. */
export function normalizarIdioma(v: unknown): Idioma | null {
  if (typeof v !== "string") return null;
  const base = v.trim().toLowerCase().split(/[-_]/)[0];
  return (IDIOMAS as readonly string[]).includes(base) ? (base as Idioma) : null;
}

/** What detection reads from the browser: `navigator` (or a stand-in). */
export interface NavegadorIdioma { languages?: readonly string[]; language?: string }
/** Where the choice is stored: the same shape as `Guardado` in ajustes.ts. */
export interface GuardadoIdioma { leer(clave: string): string | null; escribir(clave: string, texto: string): void }
/** What setting <html lang> needs: `document` (or a stand-in). */
export interface DocumentoIdioma { documentElement: { lang: string } }

export interface EntornoIdioma {
  guardado?: Pick<GuardadoIdioma, "leer">;
  navegador?: NavegadorIdioma;
}

/** Stored choice > navigator languages (in the browser's order, first supported) > English. Never throws. */
export function detectarIdioma(entorno: EntornoIdioma = {}): Idioma {
  let guardado: string | null = null;
  try { guardado = entorno.guardado?.leer(CLAVE_IDIOMA) ?? null; } catch { guardado = null; }
  const elegido = normalizarIdioma(guardado);
  if (elegido) return elegido;
  const nav = entorno.navegador;
  const lista = [...(Array.isArray(nav?.languages) ? nav.languages : []), ...(nav?.language ? [nav.language] : [])];
  for (const l of lista) {
    const idioma = normalizarIdioma(l);
    if (idioma) return idioma;
  }
  return IDIOMA_DEFECTO;
}

let activo: Idioma = IDIOMA_DEFECTO;
/** The language `t` speaks when it is not told one. */
export const idiomaActivo = (): Idioma => activo;

/** Makes `idioma` the active one and writes it to <html lang>. Anything unsupported → English. Returns the language set. */
export function fijarIdioma(idioma: unknown, documento?: DocumentoIdioma): Idioma {
  activo = normalizarIdioma(idioma) ?? IDIOMA_DEFECTO;
  if (documento) documento.documentElement.lang = activo;
  return activo;
}

/** Page start: detect, make active, set <html lang>. Returns the language. */
export const iniciarIdioma = (entorno: EntornoIdioma & { documento?: DocumentoIdioma } = {}): Idioma =>
  fijarIdioma(detectarIdioma(entorno), entorno.documento);

/** The user's choice: store it, make it active, set <html lang>. A storage failure does not stop the change. */
export function cambiarIdioma(idioma: unknown, entorno: { guardado?: GuardadoIdioma; documento?: DocumentoIdioma } = {}): Idioma {
  const nuevo = fijarIdioma(idioma, entorno.documento);
  try { entorno.guardado?.escribir(CLAVE_IDIOMA, nuevo); } catch { /* storage full or blocked: the change still applies */ }
  return nuevo;
}

/** Translates `clave` into `idioma` (default: the active one). Missing in that language → English → the key itself.
 * `{name}` placeholders take `vars.name`; a placeholder with no value stays as written. */
export function t(clave: string, vars?: Readonly<Record<string, string | number>>, idioma: Idioma = activo): string {
  const texto = CATALOGOS[idioma]?.[clave] ?? en[clave] ?? clave;
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (marca, nombre: string) => (Object.hasOwn(vars, nombre) ? String(vars[nombre]) : marca));
}
