// i18n-ok-file: the Spanish tables of the settings menu (guarded by test/menu-idiomas.test.ts)
// ajustes-motor (N2): the engine's own settings, as data. The page attaches what each one does (apps/plaza/menu-ajustes.ts);
// features add theirs with `ajustes` in defineFeature, worlds with their JSON (docs/extender/anadir-un-ajuste.md).
// Defaults by tier follow limits.json and H12 (phones and headsets start cool: no shadows, no HDR, few particles);
// defaults by capability carry the system's preferences (V7): reduced motion, more contrast, save-data.
// i18n 3/5: every text here is written in English (the official language and the fallback) with Spanish as `es`.
// `nombre` and `describe` are `{ en, es }` (the registry resolves them, ajustes.ts). The names of the groups, of the options
// and the notes are plain strings in the declaration (the shared format, packages/feature, keeps them as strings): their
// English is the string, their Spanish lives in ES_GRUPOS / ES_OPCIONES / ES_NOTAS and `traducirVista` / `traducirGrupo`
// put it on what the menu reads. A Spanish text that is missing reads the English one, never an empty label.
import type { AjusteDeclI18n } from "./ajustes.ts"; // type only: erased at run time, so no import cycle
import { fijarIdioma, idiomaActivo, IDIOMAS } from "./idioma.ts";
import type { DocumentoIdioma, Idioma } from "./idioma.ts";

/** The engine's groups, in menu order. Features and worlds add one group each (their id). Names in English; Spanish in ES_GRUPOS. */
export const GRUPOS_MOTOR: readonly { id: string; nombre: string }[] = [
  { id: "graficos", nombre: "Graphics" },
  { id: "sonido", nombre: "Sound" },
  { id: "controles", nombre: "Controls" },
  { id: "accesibilidad", nombre: "Accessibility" },
  { id: "interfaz", nombre: "Interface" },
  { id: "privacidad", nombre: "Privacy" },
];

/** Spanish names of the engine's groups, by group id. */
export const ES_GRUPOS: Readonly<Record<string, string>> = {
  graficos: "Gráficos", sonido: "Sonido", controles: "Controles", accesibilidad: "Accesibilidad", interfaz: "Interfaz", privacidad: "Privacidad",
};

/** Spanish names of the options of the engine's «eleccion» settings: by `grupo.id`, then by option value. The English is in the declaration. */
export const ES_OPCIONES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "graficos.calidad": { auto: "Automática", baja: "Baja (fresca)", media: "Media", alta: "Alta" },
  "graficos.fpsMax": { auto: "Automático" },
  "controles.microfonoModo": { mantener: "Mantener para hablar", alternar: "Pulsar para abrir y cerrar" },
  "graficos.foveacionVR": { "100": "Máxima (como hasta ahora)", "50": "Media", "0": "Apagada" },
  "graficos.escalaVR": { "100": "100 % (como hasta ahora)", "80": "80 %" },
  "graficos.sombras": { no: "Sin sombras", baja: "Baja", media: "Media", alta: "Alta" },
  "graficos.agua": { simple: "Sencilla", reflejos: "Con destellos" },
  "graficos.particulas": { pocas: "Pocas", normal: "Normal", muchas: "Muchas" },
  "controles.modoMovimientoVR": { mirada: "Según la mirada", mando: "Según el mando", cuerpo: "De lado (según el cuerpo)" },
  "controles.gestoAndarVR": { apuntar: "Apuntar (como hasta ahora)", remar: "Remar (atrás acelera, adelante frena)" },
  "controles.vrManoMenu": { izq: "Izquierda", der: "Derecha" },
  "interfaz.densidad": { minimo: "Mínimo", normal: "Normal", completo: "Completo" },
  "interfaz.hora": { local: "Local", utc: "UTC" },
  "interfaz.aparato": { auto: "Automático", escritorio: "Escritorio", "movil-vertical": "Móvil vertical", "movil-horizontal": "Móvil horizontal", vr: "Visor VR" },
};

/** Spanish notes (the short line under a setting), by `grupo.id`. */
export const ES_NOTAS: Readonly<Record<string, string>> = {
  "sonido.general": "Llega con H5: todavía no suena nada en el mundo.",
  "sonido.musica": "Llega con H5: todavía no suena nada en el mundo.",
  "sonido.efectos": "Llega con H5: todavía no suena nada en el mundo.",
  "sonido.voz": "Llega con H5 y la voz por cercanía (M17).",
  "interfaz.aparato": "Recarga la página al cambiarlo. Solo en desarrollo o con ?\u2060debug.",
};

/** What `traducirVista` reads and keeps: the part of a setting's view that has no `{ en, es }` of its own. */
type VistaTraducible = { id: string; origen: string; opciones?: { valor: string; nombre: string }[]; nota?: string };
/** A setting's view with the engine's option names and note in `idioma` (default: the active one). Only the engine's own settings
 * are touched (a feature's or world's setting with the same id keeps what it declared); a Spanish text that is missing reads English. */
export function traducirVista<V extends VistaTraducible>(v: V, idioma: Idioma = idiomaActivo()): V {
  if (idioma !== "es" || v.origen !== "motor") return v;
  const ops = ES_OPCIONES[v.id], nota = ES_NOTAS[v.id];
  if (!ops && !nota) return v;
  return {
    ...v,
    ...(v.opciones && ops ? { opciones: v.opciones.map((o) => ({ ...o, nombre: ops[o.valor] || o.nombre })) } : {}),
    ...(v.nota && nota ? { nota } : {}),
  };
}
/** A group with its name (the engine's own groups only) and its settings in `idioma` (default: the active one). */
export function traducirGrupo<G extends { id: string; nombre: string; origen: string; ajustes: VistaTraducible[] }>(g: G, idioma: Idioma = idiomaActivo()): G {
  if (idioma !== "es") return g;
  return { ...g, nombre: g.origen === "motor" ? ES_GRUPOS[g.id] || g.nombre : g.nombre, ajustes: g.ajustes.map((v) => traducirVista(v, idioma)) as G["ajustes"] };
}

/** What `traducirDocumento` needs of the page: `document` (or a stand-in in Node tests). */
export interface ElementoTraducible { textContent: string | null; getAttribute(nombre: string): string | null; setAttribute(nombre: string, valor: string): void }
export interface RaizTraducible { querySelectorAll(selector: string): ArrayLike<ElementoTraducible> }
/** Attributes the fixed text of the page also lives in: `data-en-aria-label` / `data-es-aria-label`, and so on. */
export const ATRIBUTOS_TRADUCIBLES = ["aria-label", "title", "placeholder"] as const;
const SELECTOR_TRADUCIBLE = ["data-en", ...ATRIBUTOS_TRADUCIBLES.map((a) => `data-en-${a}`)].map((a) => `[${a}]`).join(",");
/** i18n 3/5: the fixed text of index.html. An element carries its text twice, `data-en="…" data-es="…"` (its content is the English one,
 * so the page reads in English before any script runs); for an attribute: `data-en-title` + `data-es-title`. This puts the text of `idioma`
 * (default: the active one) in place. A missing or empty Spanish text reads English. An element another module has already rewritten
 * (its text is neither of the two) is left alone: that text is theirs. Returns how many texts changed. */
export function traducirDocumento(raiz: RaizTraducible, idioma: Idioma = idiomaActivo()): number {
  let cambios = 0;
  for (const el of Array.from(raiz.querySelectorAll(SELECTOR_TRADUCIBLE))) {
    for (const campo of [null, ...ATRIBUTOS_TRADUCIBLES]) {
      const sufijo = campo ? `-${campo}` : "";
      const en = el.getAttribute(`data-en${sufijo}`), es = el.getAttribute(`data-es${sufijo}`);
      if (en === null) continue;
      const actual = campo ? el.getAttribute(campo) : el.textContent;
      if (actual !== en && actual !== es) continue;
      const nuevo = idioma === "es" && es !== null && es.trim() ? es : en;
      if (actual === nuevo) continue;
      if (campo) el.setAttribute(campo, nuevo); else el.textContent = nuevo;
      cambios++;
    }
  }
  return cambios;
}

/** i18n 2/5: «Language / Idioma», in the «interfaz» group. English is the official language and the default; Spanish is second.
 * The label carries both names on purpose, so it can be found from either language. Not in AJUSTES_MOTOR: the page declares it
 * (apps/plaza/menu-ajustes.ts) with the default its browser asks for. */
export const AJUSTE_IDIOMA: AjusteDeclI18n = {
  grupo: "interfaz", id: "idioma", tipo: "eleccion", nombre: "Language / Idioma",
  describe: {
    en: "The language of the menus and messages. It changes at once, without reloading the page.",
    es: "El idioma de los menús y los mensajes. Cambia al instante, sin recargar la página.",
  },
  // the options are written in their own language, always: whoever cannot read the current one still finds theirs
  opciones: [{ valor: "en", nombre: "English" }, { valor: "es", nombre: "Español" }],
  defecto: "en",
};
export const ID_IDIOMA = "interfaz.idioma";

/** Make the setting speak: choosing a language makes it the active one (and <html lang>) BEFORE the registry tells its
 * listeners, so the menu that hears the change already reads every label in the new language — no reload. */
export function enlazarIdioma(a: { alAplicar(id: string, fn: (valor: string | number | boolean) => void): void }, documento?: DocumentoIdioma): void {
  a.alAplicar(ID_IDIOMA, (v) => { fijarIdioma(typeof v === "string" && (IDIOMAS as readonly string[]).includes(v) ? v : undefined, documento); });
}

/** One text in both languages: English first (the source), Spanish second. */
const T = (en: string, es: string): { en: string; es: string } => ({ en, es });

const ENTORNO = { "graficos.sombras": null, "graficos.agua": null, "graficos.particulas": null, "graficos.hdr": null };
const H5 = "Arrives with H5: nothing sounds in the world yet."; // Spanish: ES_NOTAS

export const AJUSTES_MOTOR: AjusteDeclI18n[] = [
  // ---- Graphics (H12 parity: resolution, shadows, post-processing; power.ts does the drawing side) ----
  {
    grupo: "graficos", id: "calidad", tipo: "eleccion", nombre: T("Quality", "Calidad"),
    describe: T(
      "Maximum sharpness and smoothness. Automatic: the engine picks it for your device and lowers it by itself if it gets hot.",
      "Nitidez y fluidez máximas. Automática: la elige el motor según tu aparato y la baja sola si se calienta.",
    ),
    opciones: [{ valor: "auto", nombre: "Automatic" }, { valor: "baja", nombre: "Low (cool)" }, { valor: "media", nombre: "Medium" }, { valor: "alta", nombre: "High" }],
    defecto: "auto",
    // choosing a quality also sets the environment's four settings; «Automatic» gives them back to the device's defaults
    preajuste: {
      auto: ENTORNO,
      baja: { "graficos.sombras": "no", "graficos.agua": "simple", "graficos.particulas": "pocas", "graficos.hdr": false },
      media: { "graficos.sombras": "baja", "graficos.agua": "simple", "graficos.particulas": "normal", "graficos.hdr": false },
      alta: { "graficos.sombras": "alta", "graficos.agua": "reflejos", "graficos.particulas": "muchas", "graficos.hdr": true },
    },
  },
  {
    grupo: "graficos", id: "resolucion", tipo: "numero", min: 50, max: 100, paso: 5, unidad: "%", nombre: T("Resolution", "Resolución"),
    describe: T(
      "How much of the chosen quality's sharpness is drawn. Less: cooler and faster.",
      "Qué parte de la nitidez de la calidad elegida se dibuja. Menos: más fresco y más rápido.",
    ), defecto: 100,
  },
  {
    grupo: "graficos", id: "fpsMax", tipo: "eleccion", nombre: T("Frames per second, maximum", "Cuadros por segundo, máximo"),
    describe: T(
      "Cap while something moves. Automatic: set by the quality (60 on desktop, 30 on phones).",
      "Tope mientras algo se mueve. Automático: lo pone la calidad (60 en escritorio, 30 en móvil).",
    ),
    opciones: [{ valor: "auto", nombre: "Automatic" }, ...["24", "30", "45", "60", "72", "90", "120"].map((v) => ({ valor: v, nombre: v }))],
    defecto: "auto",
  },
  // MIS-200 (t_febc1fc2): «Headset performance» — defaults are what three does today; apps/plaza/menu-ajustes.ts → view.vr.rendimiento
  {
    grupo: "graficos", id: "foveacionVR", tipo: "eleccion", nombre: T("Headset: foveation", "Gafas: foveación"), requiere: ["xrVr"],
    describe: T(
      "The edges of the view are drawn with less detail to run smoother. More: faster, blurrier edges. It shows in panel text.",
      "Los bordes de la vista se dibujan con menos detalle para ir más fluido. Más: más rápido, bordes más borrosos. Se nota en el texto de los paneles.",
    ),
    opciones: [{ valor: "100", nombre: "Maximum (as until now)" }, { valor: "50", nombre: "Medium" }, { valor: "0", nombre: "Off" }], defecto: "100",
  },
  {
    grupo: "graficos", id: "escalaVR", tipo: "eleccion", nombre: T("Headset: resolution", "Gafas: resolución"), requiere: ["xrVr"],
    describe: T(
      "How many dots are drawn per eye. 80 %: smoother and a little less sharp. Applies the next time you enter VR.",
      "Cuántos puntos se dibujan por ojo. 80 %: más fluido y algo menos nítido. Vale en la próxima entrada en VR.",
    ),
    opciones: [{ valor: "100", nombre: "100 % (as until now)" }, { valor: "80", nombre: "80 %" }], defecto: "100",
  },
  {
    grupo: "graficos", id: "multiviewVR", tipo: "bool", nombre: T("Headset: multiview (experiment)", "Gafas: multiview (experimento)"), requiere: ["xrVr"],
    describe: T(
      "Draws both eyes in one pass if the headset allows it (fewer draw calls). If not, it does nothing. Applies the next time you enter VR.",
      "Dibuja los dos ojos en una sola pasada si las gafas lo permiten (menos llamadas de dibujo). Si no lo permiten, no hace nada. Vale en la próxima entrada en VR.",
    ), defecto: false,
  },
  {
    grupo: "graficos", id: "bateria", tipo: "bool", nombre: T("Battery mode", "Modo batería"),
    describe: T(
      "24 frames per second and contained resolution: uses less power and runs cooler.",
      "24 cuadros por segundo y resolución contenida: gasta y calienta menos.",
    ),
    defecto: { valor: false, si: [{ requiere: ["ahorroDatos"], valor: true }] },
  },
  {
    grupo: "graficos", id: "estadisticas", tipo: "bool", nombre: T("On-screen statistics", "Estadísticas en pantalla"),
    describe: T(
      "Drawing, frames per second, ping and fingerprint, top left. Off except on desktop with ?debug.",
      "Dibujo, cuadros por segundo, ping y huella, arriba a la izquierda. Apagadas salvo en escritorio con ?debug.",
    ),
    // U23: off for everyone (a phone never gets four lines over its icon bar); a desktop opened with ?debug starts with them on
    defecto: { valor: false, si: [{ requiere: ["debug", "!movil"], valor: true }] },
  },
  // the environment (H4, view.entorno.calidad): shown only where the environment exists and offers each one
  {
    grupo: "graficos", id: "sombras", tipo: "eleccion", nombre: T("Shadows", "Sombras"), requiere: ["entorno.sombras"],
    describe: T(
      "Shadows from the sun. On phones and headsets they start off so they do not heat up.",
      "Sombras del sol. En móvil y en visor empiezan apagadas para que no se calienten.",
    ),
    opciones: [{ valor: "no", nombre: "No shadows" }, { valor: "baja", nombre: "Low" }, { valor: "media", nombre: "Medium" }, { valor: "alta", nombre: "High" }],
    defecto: { valor: "no", nivel: { A: "media" } },
  },
  {
    grupo: "graficos", id: "agua", tipo: "eleccion", nombre: T("Water", "Agua"), requiere: ["entorno.agua"],
    describe: T(
      "Plain water or with sun glints (both are the engine's flat-colour water; they never draw the scene again).",
      "Agua sencilla o con destellos del sol (los dos son el agua de color plano del motor; nunca dibujan la escena otra vez).",
    ),
    opciones: [{ valor: "simple", nombre: "Plain" }, { valor: "reflejos", nombre: "With glints" }],
    defecto: { valor: "simple", nivel: { A: "reflejos" } },
  },
  {
    grupo: "graficos", id: "particulas", tipo: "eleccion", nombre: T("Particles", "Partículas"), requiere: ["entorno.particulas"],
    describe: T(
      "How many sparks, dust and small lights are drawn at once.",
      "Cuántas chispas, polvo y luces pequeñas se dibujan a la vez.",
    ),
    opciones: [{ valor: "pocas", nombre: "Few" }, { valor: "normal", nombre: "Normal" }, { valor: "muchas", nombre: "Many" }],
    defecto: { valor: "pocas", nivel: { A: "normal" } },
  },
  {
    grupo: "graficos", id: "hdr", tipo: "bool", nombre: T("HDR sky", "Cielo HDR"), requiere: ["entorno.hdr"],
    describe: T(
      "High-dynamic-range sky light: more realistic and heavier. Off on phones and headsets.",
      "Luz del cielo de alto rango: más realista y más pesada. Sin ella en móvil y en visor.",
    ),
    defecto: { valor: false, nivel: { A: true } },
  },
  // D-076: the sun follows the real one where you are. Off by default; it does nothing unless the WORLD offers it, and the browser asks you again.
  {
    grupo: "graficos", id: "solReal", tipo: "bool", nombre: T("Real sun", "Sol real"), requiere: ["entorno"],
    describe: T(
      "In worlds that allow it, the sun follows the real one where you are. The browser asks for your location; it is used only here, and only its approximate area.",
      "En los mundos que lo permiten, el sol sigue al de verdad donde estás. El navegador te pregunta tu ubicación; solo se usa aquí y solo su zona aproximada.",
    ),
    defecto: false,
  },
  // H12b: extra effects, level A only (entorno.efectos is true only on a desktop): off for everyone until a person turns them on
  {
    grupo: "graficos", id: "bloom", tipo: "bool", nombre: T("Glow (bloom)", "Brillo (bloom)"), requiere: ["entorno.efectos"],
    describe: T(
      "A soft halo around very bright things (fire, lights, sun). Desktop only. If the computer cannot hold 60 frames per second, it turns itself off.",
      "Un halo suave alrededor de lo muy brillante (fuego, luces, sol). Solo en escritorio. Si el ordenador no aguanta los 60 cuadros por segundo, se apaga solo.",
    ),
    defecto: false,
  },
  {
    grupo: "graficos", id: "ao", tipo: "bool", nombre: T("Contact shadows (AO)", "Sombras de contacto (AO)"), requiere: ["entorno.efectos"],
    describe: T(
      "Darkens corners and where things touch. Desktop only, heavier; if it cannot hold 60 frames per second, it turns itself off.",
      "Oscurece los rincones y donde las cosas se tocan. Solo en escritorio, más pesado; si no aguanta los 60 cuadros por segundo, se apaga solo.",
    ),
    defecto: false,
  },
  {
    grupo: "graficos", id: "sombraSuave", tipo: "bool", nombre: T("Soft shadows", "Sombras suaves"), requiere: ["entorno.efectos"],
    describe: T(
      "Blurred edges on the sun's shadows (needs shadows on). Desktop only.",
      "Bordes difusos en las sombras del sol (necesita las sombras encendidas). Solo en escritorio.",
    ),
    defecto: false,
  },
  // ---- Sound: the sliders are the VCAs of the audio graph (packages/render/src/audio/nucleo.ts); «Notices» and «mono» are V6 ----
  { grupo: "sonido", id: "general", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: T("Master volume", "Volumen general"), describe: T("The volume of everything that sounds in the world.", "El volumen de todo lo que suena en el mundo."), defecto: 80, nota: H5 },
  { grupo: "sonido", id: "musica", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: T("Music", "Música"), describe: T("The volume of the world's music.", "El volumen de la música del mundo."), defecto: 60, nota: H5 },
  { grupo: "sonido", id: "efectos", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: T("Effects", "Efectos"), describe: T("The volume of effects: steps, doors, world sounds.", "El volumen de los efectos: pasos, puertas, sonidos del mundo."), defecto: 80, nota: H5 },
  {
    grupo: "sonido", id: "avisos", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: T("Notices", "Avisos"),
    describe: T(
      "The volume of the house's notices (confirmations, errors, quests). Separate from effects; it never goes fully down so a notice can be heard.",
      "El volumen de los avisos de la casa (confirmaciones, errores, misiones). Aparte de los efectos; nunca baja del todo para que un aviso se oiga.",
    ), defecto: 100,
  },
  {
    grupo: "sonido", id: "mono", tipo: "bool", nombre: T("Mono sound", "Sonido mono"),
    describe: T(
      "Both ears hear the same. For those who hear with one ear or through a single speaker.",
      "Los dos oídos oyen lo mismo. Para quien oye por un solo oído o por un altavoz.",
    ), defecto: false,
  },
  {
    grupo: "sonido", id: "baliza", tipo: "bool", nombre: T("Sound beacon", "Baliza sonora"),
    describe: T(
      "When something marks a destination with a light, a beep also sounds there, more often the closer you are. You can hear which side it is on.",
      "Cuando algo te marca un destino con una luz, también suena un pitido allí, más seguido cuanto más cerca. Se oye de qué lado está.",
    ), defecto: false,
  },
  {
    grupo: "sonido", id: "voz", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: T("People's voices", "Voz de las personas"),
    describe: T("The volume of the people who speak near you.", "El volumen de la gente que habla cerca de ti."), defecto: 100, nota: "Arrives with H5 and proximity voice (M17).",
  },
  // ---- Controls: the camera applies them through view.cam.ajustar (N1); shown only where it can ----
  {
    grupo: "controles", id: "sensibilidad", tipo: "numero", min: 25, max: 300, paso: 5, unidad: "%", nombre: T("Camera sensitivity", "Sensibilidad de la cámara"),
    describe: T(
      "How fast the camera turns with the mouse, the finger or the gamepad.",
      "Lo rápido que gira la cámara con el ratón, el dedo o el mando.",
    ), defecto: 100, requiere: ["camara"],
  },
  {
    grupo: "controles", id: "invertirY", tipo: "bool", nombre: T("Invert the vertical axis", "Invertir el eje vertical"),
    describe: T(
      "Moving the mouse or the stick up looks down, as in an aircraft.",
      "Mover el ratón o la palanca hacia arriba mira hacia abajo, como en un avión.",
    ), defecto: false, requiere: ["camara"],
  },
  {
    grupo: "controles", id: "zonaMuerta", tipo: "numero", min: 0, max: 50, paso: 5, unidad: "%", nombre: T("Gamepad dead zone", "Zona muerta del mando"),
    describe: T(
      "How far a stick must move before it counts. More: ignores the tremor of worn sticks; less: finer response.",
      "Cuánto hay que mover una palanca antes de que cuente. Más: ignora el temblor de palancas gastadas; menos: respuesta más fina.",
    ), defecto: 15, requiere: ["camara", "mando"],
  },
  {
    grupo: "controles", id: "modoMovimientoVR", tipo: "eleccion", nombre: T("Walking direction in VR", "Dirección al andar en VR"),
    describe: T(
      "Where the headset's left stick pulls: your gaze, your controller, or your body (looking does not change the heading).",
      "Hacia dónde tira la palanca izquierda del visor: tu mirada, tu mando, o tu cuerpo (mirar no cambia el rumbo).",
    ),
    opciones: [{ valor: "mirada", nombre: "By gaze" }, { valor: "mando", nombre: "By controller" }, { valor: "cuerpo", nombre: "Sideways (by body)" }],
    defecto: "mirada", requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "gestoAndarVR", tipo: "eleccion", nombre: T("Walking with hands in VR", "Andar con las manos en VR"),
    describe: T(
      "With bare hands: Point = pinch and you walk where the hand points; Row = pinch and pull the hand back to go forward, forward to brake.",
      "Con las manos sin mandos: Apuntar = pellizca y andas hacia donde apunta la mano; Remar = pellizca y echa la mano atrás para avanzar, adelante para frenar.",
    ),
    opciones: [{ valor: "apuntar", nombre: "Point (as until now)" }, { valor: "remar", nombre: "Row (back speeds up, forward brakes)" }],
    defecto: "apuntar", requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "cuerpoVR", tipo: "bool", nombre: T("See your body in VR", "Ver tu cuerpo en VR"),
    describe: T(
      "Looking down in the headset you see your own body (your avatar's: torso and legs). Turn it off if you prefer not to see it.",
      "Al mirar abajo en el visor ves tu propio cuerpo (el de tu avatar: tronco y piernas). Apágalo si prefieres no verlo.",
    ), defecto: true, requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "pielManosVR", tipo: "bool", nombre: T("Hands with your avatar's skin", "Manos con la piel de tu avatar"),
    describe: T(
      "In VR your hands take the colour of your avatar's hands, with Numinia lights. Off: the plain skin as always.",
      "En VR tus manos llevan el color de las manos de tu avatar con luces de Numinia. Apagado: la piel sencilla de siempre.",
    ), defecto: true, requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "vrManoMenu", tipo: "eleccion", nombre: T("Wrist menu hand", "Mano del menú de muñeca"),
    describe: T(
      "On which wrist the menu watch appears inside VR. The other hand is the one that presses it.",
      "En qué muñeca sale el reloj del menú dentro de VR. La otra mano es la que lo pulsa.",
    ),
    opciones: [{ valor: "izq", nombre: "Left" }, { valor: "der", nombre: "Right" }],
    defecto: "izq", requiere: ["xrVr"],
  },
  // Redesign v2 (story E): the VR menu's «Settings» — the same rows on the computer and in the headset
  {
    grupo: "controles", id: "giroVR", tipo: "eleccion", nombre: T("Turn in VR", "Giro en VR"),
    describe: T(
      "How far the view turns with each push of the headset's right stick.",
      "Cuánto gira la vista con cada empujón de la palanca derecha del visor.",
    ),
    opciones: [{ valor: "15", nombre: "15°" }, { valor: "30", nombre: "30°" }, { valor: "45", nombre: "45°" }],
    defecto: "30", requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "velocidadVR", tipo: "numero", min: 40, max: 200, paso: 10, unidad: "%", nombre: T("Walking speed in VR", "Velocidad al andar en VR"),
    describe: T(
      "How fast the left stick takes you. 100 %: the usual pace; up to 200 % (3 m/s, the limits.json cap) without running. Less: more comfortable.",
      "Lo deprisa que te lleva la palanca izquierda. 100 %: el paso de siempre; hasta 200 % (3 m/s, tope de limits.json) sin correr. Menos: más cómodo.",
    ), defecto: 100, requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "confortVR", tipo: "numero", min: 0, max: 100, paso: 10, unidad: "%", nombre: T("Comfort vignette in VR", "Viñeta de confort en VR"),
    describe: T(
      "How much the edges of the view darken while you move or turn. 0: none.",
      "Cuánto se oscurecen los bordes de la vista mientras te mueves o giras. 0: nada.",
    ), defecto: 80, requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "alturaVR", tipo: "numero", min: -30, max: 60, paso: 10, unidad: "cm", nombre: T("Height in VR", "Altura en VR"),
    describe: T(
      "Raises or lowers your view in the headset; raise it if you play seated.",
      "Sube o baja tu vista en el visor; súbela si juegas sentado.",
    ), defecto: 0, requiere: ["xrVr"],
  },
  { grupo: "controles", id: "teclaAjustes", tipo: "tecla", soloVer: true, nombre: T("Open and close the settings", "Abrir y cerrar los ajustes"), describe: T("The key that opens this menu. Escape also closes it.", "La tecla que abre este menú. Escape también lo cierra."), defecto: "KeyO" },
  { grupo: "controles", id: "teclaDensidad", tipo: "tecla", soloVer: true, nombre: T("Change the interface density", "Cambiar la densidad de interfaz"), describe: T("The key that goes from Minimum to Normal, to Full and back.", "La tecla que pasa de Mínimo a Normal, a Completo y vuelta."), defecto: "KeyU" },
  { grupo: "controles", id: "microfonoModo", tipo: "eleccion", nombre: T("Microphone key", "Tecla del micrófono"), describe: T("Hold the microphone key to talk (default), or press it once to open the microphone and again to close it. It never opens by itself.", "Mantén pulsada la tecla del micrófono para hablar (por defecto), o púlsala una vez para abrirlo y otra para cerrarlo. Nunca se abre solo."), opciones: [{ valor: "mantener", nombre: "Hold to talk" }, { valor: "alternar", nombre: "Press to open and close" }], defecto: "mantener" },
  // ---- Accessibility (V7, V11, V1): the system's preferences are the first defaults ----
  {
    grupo: "accesibilidad", id: "menosMovimiento", tipo: "bool", nombre: T("Reduce motion", "Reducir movimiento"),
    describe: T(
      "Removes pauses, shakes and flashes on hit, and the little hops of the interface. Starts as your system has it.",
      "Quita pausas, sacudidas y destellos al golpear, y los saltitos de la interfaz. Empieza como lo tenga tu sistema.",
    ),
    defecto: { valor: false, si: [{ requiere: ["menosMovimiento"], valor: true }] },
  },
  {
    grupo: "accesibilidad", id: "textoGrande", tipo: "bool", nombre: T("Large text", "Texto grande"),
    describe: T(
      "Bigger letters in panels, buttons and notices (18 px instead of 13).",
      "Letra más grande en paneles, botones y avisos (18 px en vez de 13).",
    ), defecto: false,
  },
  {
    grupo: "accesibilidad", id: "subtitulosVoz", tipo: "bool", nombre: T("Voice captions", "Subtítulos de voz"),
    describe: T(
      "Shows what the people you hear say, with their name and where they speak from. Whoever speaks will see that someone reads their words.",
      "Muestra lo que dice la gente que oyes, con su nombre y desde dónde habla. Quien habla verá que alguien lee sus palabras.",
    ), defecto: false,
  },
  {
    grupo: "accesibilidad", id: "altoContraste", tipo: "bool", nombre: T("High contrast", "Alto contraste"),
    describe: T(
      "Black panels with white letters and marked borders. Starts as your system has it.",
      "Paneles negros con letra blanca y bordes marcados. Empieza como lo tenga tu sistema.",
    ),
    defecto: { valor: false, si: [{ requiere: ["masContraste"], valor: true }] },
  },
  {
    grupo: "accesibilidad", id: "anunciar", tipo: "bool", nombre: T("Announce what happens", "Anunciar lo que pasa"),
    describe: T(
      "Your screen reader reads what happens nearby (gestures, notices). Safety notices are always read.",
      "Tu lector de pantalla lee lo que pasa cerca (gestos, avisos). Los avisos de seguridad se leen siempre.",
    ), defecto: true,
  },
  // ---- Interface ----
  {
    grupo: "interfaz", id: "tamano", tipo: "numero", min: 75, max: 200, paso: 25, unidad: "%", nombre: T("Interface size", "Tamaño de la interfaz"),
    describe: T(
      "Scale of the buttons, panels and texts on the screen (not the world's).",
      "Escala de botones, paneles y textos de la pantalla (no la del mundo).",
    ), defecto: 100,
  },
  {
    // U26: a short tick when a finger presses a button of the screen (apps/plaza/pulsaciones.ts); only where it can vibrate
    grupo: "interfaz", id: "vibrar", tipo: "bool", nombre: T("Vibrate when tapping a button", "Vibrar al tocar un botón"), requiere: ["vibracion", "tactil"],
    describe: T(
      "A short buzz from the device when a finger presses a button on the screen.",
      "Un toque corto del aparato al pulsar un botón de la pantalla con el dedo.",
    ), defecto: true,
  },
  {
    grupo: "interfaz", id: "densidad", tipo: "eleccion", nombre: T("Interface density", "Densidad de interfaz"),
    describe: T(
      "How much shows while you play. Minimum: the current quest, the chat folded and the action of what you look at. Changes on the fly with U.",
      "Cuánto se ve mientras juegas. Mínimo: la misión de ahora, el chat plegado y la acción de lo que miras. Cambia al vuelo con U.",
    ),
    opciones: [{ valor: "minimo", nombre: "Minimum" }, { valor: "normal", nombre: "Normal" }, { valor: "completo", nombre: "Full" }],
    defecto: "normal",
  },
  {
    grupo: "interfaz", id: "hora", tipo: "eleccion", nombre: T("Clock time", "Hora del reloj"),
    describe: T(
      "The clock beside the minimap: your device's time or universal time (UTC), the same for everyone.",
      "El reloj junto al minimapa: la hora de tu aparato o la hora universal (UTC), la misma para todos.",
    ),
    opciones: [{ valor: "local", nombre: "Local" }, { valor: "utc", nombre: "UTC" }], defecto: "local",
  },
  // ux2-barra: was the «N» button under the minimap; a setting now (the minimap keeps no buttons)
  { grupo: "interfaz", id: "minimapaGira", tipo: "bool", nombre: T("The minimap turns with the camera", "El minimapa gira con la cámara"), describe: T("Off: north always up. On: what is in front of you stays up.", "Apagado: el norte siempre arriba. Encendido: lo que tienes delante queda arriba."), defecto: false },
  { grupo: "interfaz", id: "ayuda", tipo: "bool", nombre: T("Key help", "Ayuda de teclas"), describe: T("The line at the bottom that says which key does what.", "La línea de abajo que dice qué tecla hace qué."), defecto: true },
  // U25: the device profile, forced (development or ?debug only: `desarrollo`). The page decides it once before the
  // first frame (packages/client/src/aparato.ts), so a change reloads the page. ?aparato=… does the same for one load.
  {
    grupo: "interfaz", id: "aparato", tipo: "eleccion", nombre: T("Device (development)", "Aparato (desarrollo)"), requiere: ["desarrollo"],
    describe: T(
      "What device the interface is laid out for. Automatic: yours. A phone chosen on a desktop is drawn inside a 390×844 frame.",
      "Para qué aparato se dispone la interfaz. Automático: el tuyo. Un móvil elegido en un escritorio se dibuja dentro de un marco de 390×844.",
    ),
    opciones: [{ valor: "auto", nombre: "Automatic" }, { valor: "escritorio", nombre: "Desktop" }, { valor: "movil-vertical", nombre: "Phone, portrait" }, { valor: "movil-horizontal", nombre: "Phone, landscape" }, { valor: "vr", nombre: "VR headset" }],
    defecto: "auto", nota: "Reloads the page when changed. Only in development or with ?\u2060debug.",
  },
  // ---- Privacy (T1: Pablo records sessions to learn from real devices; the person can say no) ----
  {
    grupo: "privacidad", id: "informe", tipo: "bool", nombre: T("Send the session report", "Enviar el informe de la sesión"),
    describe: T(
      "Tells the server how you joined and how it is going (device, browser, frames per second), with no IP or personal data.",
      "Cuenta al servidor cómo entraste y cómo va (aparato, navegador, cuadros por segundo), sin IP ni datos personales.",
    ), defecto: true,
  },
];
