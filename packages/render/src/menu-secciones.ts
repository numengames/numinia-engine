// menu-secciones (v2 paridad): THE one list of the world's menu sections — what the top bar on a computer, the «…» menu
// on a phone and the menu / wrist watch in VR all name. Each has ONE id, ONE icon (Phosphor name, apps/plaza/iconos.ts),
// ONE name per language, ONE order, and a statement of where it exists (pc, movil, vr). The bar (main.ts, movil.ts,
// gente.ts, avisos.ts…) and the VR menu (menu-vr.ts → xr-menu.ts) read icon, name and order from here; test/menu-paridad.test.ts
// fails when a section of the computer or the phone is missing in VR without a written reason (`sinVR`). That list of
// reasons is the pending work: `debe: true` = VR still owes it; `debe: false` = it makes no sense inside a headset.
// Pure data: no DOM, no three.js (it lives in render because render must not import apps/, and apps may import render).

export type Aparato = "pc" | "movil" | "vr";
export type Idioma = "es" | "en";
/** Where VR draws it: a row of the menu panel, a button of the wrist watch (its id in menu-vr.ts BOTONES_RELOJ). */
export type DondeVR = { panel: true } | { reloj: "menu" | "micro" | "camara" | "avisos" | "ciudad" };
export type SeccionMundo = {
  id: string;
  /** Phosphor icon name. */
  icono: string;
  es: string;
  en: string;
  /** Left to right on the bar, top to bottom in the VR list. The first seven are the computer's menu; the VR list then adds «Chat» (v7), which keeps its place in the bar (18). */
  orden: number;
  /** Key on the computer (KeyboardEvent.code without «Key»), for the tooltip «Nombre (L)». */
  tecla?: string;
  /** Element ids that realise it on the computer / phone (the first is its button). */
  botones: readonly string[];
  aparatos: readonly Aparato[];
  /** Present when `aparatos` has «vr». */
  vr?: DondeVR;
  /** Present when it is on the computer or the phone and NOT in VR: why, and whether VR still owes it. */
  sinVR?: { motivo: string; debe: boolean };
};

export const SECCIONES_MUNDO: readonly SeccionMundo[] = [
  { id: "tu", icono: "user", es: "Tú", en: "You", orden: 1, tecla: "I", botones: ["hud-personaje-abrir"], aparatos: ["pc", "movil", "vr"], vr: { panel: true } },
  { id: "gente", icono: "users", es: "Gente", en: "People", orden: 2, tecla: "L", botones: ["gente-abrir"], aparatos: ["pc", "movil", "vr"], vr: { panel: true } },
  { id: "bolsa", icono: "package", es: "Bolsa", en: "Bag", orden: 3, tecla: "R", botones: ["inventario-abrir"], aparatos: ["pc", "movil", "vr"], vr: { panel: true } },
  { id: "misiones", icono: "scroll", es: "Misiones", en: "Quests", orden: 4, tecla: "J", botones: ["misiones"], aparatos: ["pc", "movil", "vr"], vr: { panel: true } },
  { id: "mapa", icono: "map-trifold", es: "Mapa", en: "Map", orden: 5, tecla: "M", botones: ["minimapa-abrir"], aparatos: ["pc", "movil", "vr"], vr: { panel: true } },
  { id: "construir", icono: "crane-tower", es: "Construir", en: "Build", orden: 6, tecla: "C", botones: ["construir"], aparatos: ["pc", "vr"], vr: { panel: true } }, // not on a phone: a phone walks and talks (Pablo, 2026-10-22)
  { id: "ajustes", icono: "gear", es: "Ajustes", en: "Settings", orden: 7, tecla: "O", botones: ["ajustes-abrir"], aparatos: ["pc", "movil", "vr"], vr: { panel: true } },
  // the rest of the bar
  { id: "micro", icono: "microphone", es: "Micrófono", en: "Microphone", orden: 8, tecla: "Q", botones: ["microfono"], aparatos: ["pc", "movil", "vr"], vr: { reloj: "micro" } },
  { id: "foto", icono: "camera", es: "Foto", en: "Photo", orden: 9, tecla: "P", botones: ["foto-abrir"], aparatos: ["pc", "movil", "vr"], vr: { reloj: "camara" } },
  { id: "camara", icono: "camera", es: "Cámara", en: "Camera", orden: 10, tecla: "P", botones: ["camara-abrir"], aparatos: ["pc"],
    sinVR: { motivo: "en VR la cámara es el botón «Foto» del reloj (la Cámara de la barra solo reúne foto, grabar y compartir pantalla)", debe: false } },
  { id: "grabar", icono: "record", es: "Grabar", en: "Record", orden: 11, tecla: "K", botones: ["graboso"], aparatos: ["pc"],
    sinVR: { motivo: "grabar un clip del mundo todavía no se puede hacer desde el reloj de VR", debe: true } },
  { id: "compartir", icono: "screencast", es: "Compartir pantalla", en: "Share screen", orden: 12, botones: ["compartir-pantalla"], aparatos: ["pc"],
    sinVR: { motivo: "el navegador no comparte la pantalla del ordenador dentro de una sesión VR", debe: false } },
  { id: "avisos", icono: "bell", es: "Avisos", en: "Notices", orden: 13, tecla: "N", botones: ["avisos-abrir"], aparatos: ["pc", "vr"], vr: { reloj: "avisos" } },
  { id: "menu", icono: "list", es: "Menú", en: "Menu", orden: 14, tecla: "O", botones: ["menu-abrir"], aparatos: ["pc", "vr"], vr: { reloj: "menu" } },
  { id: "ciudad", icono: "map-pin", es: "Volver a la ciudad", en: "Back to the city", orden: 15, botones: ["volver-ciudad"], aparatos: ["pc", "movil", "vr"], vr: { reloj: "ciudad" } },
  { id: "pantalla", icono: "corners-out", es: "Pantalla completa", en: "Full screen", orden: 16, botones: ["pantalla"], aparatos: ["pc", "movil"],
    sinVR: { motivo: "dentro del visor ya ocupas todo el campo de visión", debe: false } },
  { id: "teclas", icono: "keyboard", es: "Teclas y ayuda", en: "Keys and help", orden: 17, tecla: "F1", botones: ["teclas-abrir"], aparatos: ["pc"],
    sinVR: { motivo: "los mandos de VR no usan teclas; falta una página de ayuda de los mandos en el menú", debe: true } },
  { id: "chat", icono: "chat-circle", es: "Chat", en: "Chat", orden: 18, botones: ["chat-boton"], aparatos: ["pc", "movil", "vr"],
    vr: { panel: true } }, // v7: in VR it lists the last lines and sends quick phrases; typing needs a virtual keyboard that is not there yet
  { id: "interactuar", icono: "hand-pointing", es: "Interactuar", en: "Interact", orden: 19, tecla: "E", botones: ["interactuar"], aparatos: ["pc", "movil"],
    sinVR: { motivo: "en VR se interactúa apuntando con el rayo y apretando el gatillo", debe: false } },
  { id: "ar", icono: "eye", es: "Entrar en AR", en: "Enter AR", orden: 20, botones: ["ar"], aparatos: ["pc", "movil"],
    sinVR: { motivo: "ya estás en una sesión de VR; AR es otra sesión", debe: false } },
  { id: "vr", icono: "eye", es: "Entrar en VR", en: "Enter VR", orden: 21, botones: ["vr"], aparatos: ["pc", "movil"],
    sinVR: { motivo: "ya estás en VR (aquí se sale con «Salir de VR»)", debe: false } },
];

const porId = new Map(SECCIONES_MUNDO.map((s) => [s.id, s]));

/** The section `id` (throws on a typo: ids are constants of the code). */
export function seccion(id: string): SeccionMundo {
  const s = porId.get(id);
  if (!s) throw new Error(`menu-secciones: no hay sección «${id}»`);
  return s;
}
/** The name of a section in a language (unknown language → es). */
export const nombreDe = (id: string, idioma: Idioma = "es"): string => { const s = seccion(id); return idioma === "en" ? s.en : s.es; };
export const iconoDe = (id: string): string => seccion(id).icono;
/** «Nombre (L)» as the computer's tooltips write it; no key → just the name. */
export const tituloDe = (id: string, idioma: Idioma = "es"): string => { const s = seccion(id); return s.tecla ? `${nombreDe(id, idioma)} (${s.tecla})` : nombreDe(id, idioma); };
/** The sections that exist on a device, in order. */
export const seccionesEn = (aparato: Aparato): SeccionMundo[] => SECCIONES_MUNDO.filter((s) => s.aparatos.includes(aparato)).sort((a, b) => a.orden - b.orden);
/** The ids of the sections that are rows of the VR menu panel, in order. */
export const idsPanelVR = (): string[] => seccionesEn("vr").filter((s) => "panel" in (s.vr ?? {})).map((s) => s.id);
/** The section a wrist-watch button stands for. */
export const seccionDeReloj = (b: "menu" | "micro" | "camara" | "avisos" | "ciudad"): SeccionMundo => {
  const s = SECCIONES_MUNDO.find((x) => x.vr && "reloj" in x.vr && x.vr.reloj === b);
  if (!s) throw new Error(`menu-secciones: ningún botón del reloj «${b}»`);
  return s;
};
/** What a computer or phone section lacks in VR: the written reasons (the test's list of exceptions; `debe` = still owed). */
export const excepcionesVR = (): { id: string; motivo: string; debe: boolean }[] =>
  SECCIONES_MUNDO.filter((s) => (s.aparatos.includes("pc") || s.aparatos.includes("movil")) && !s.aparatos.includes("vr")).map((s) => ({ id: s.id, motivo: s.sinVR?.motivo ?? "", debe: s.sinVR?.debe ?? true }));
