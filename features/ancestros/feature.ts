// ancestros — declaration (v1). The Salón de los Ancestros of the Ateneo (Numinia's town hall: the Consejo de Sabios
// shows and tries its projects there — numinia-archive, lore/game/manual/es/05-geografia-y-cultura-de-numinia.md) and,
// inside it, the tribute to Isaac Asimov: a HOLOGRAM (a translucent bust that evokes, never a likeness) that lights up
// when someone comes near and, when spoken to («E: hablar con el holograma»), says one of the Three Laws of Robotics
// (1942, in the usual Spanish wording, a short quotation for a homage) and, beside it, one of OUR rules for an agent in
// a world (AGW, numinia.org STD-050): «Estas son las leyes de Asimov. Estas son las nuestras, 80 años después.»
// Everything is text on screen: the engine has no voice of its own yet (V3) and NO voice cloning of Asimov is ever used
// (decided by Pablo: his estate's publicity rights). The hologram says so on its own label («dramatización»).
// The hall and the hologram are things of the world (state WITH `at`): the walls are solid boxes (`solido` + bx…bz,
// the same fields the simulation reads for any feature) with no name (decoration), the hologram has a card and
// `interact`. Recipe: docs/EXTENDER.md «Salón de los Ancestros».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** From how far a page gets the hall and the hologram (m): the hall is seen from the plaza. */
export const ALCANCE_M = 90;
/** The hologram lights up (and turns to you) when you are this close (m); it goes back to sleep a little farther. */
export const DESPIERTA_M = 8;
export const DUERME_M = DESPIERTA_M + 2;
/** Who sees and hears what the hologram says besides who asked (m). */
export const CERCA_M = 14;
/** From how close you speak to the hologram (m). */
export const HABLAR_M = 3;
/** How often the server looks at who is near a hologram (ticks: 4 = every 0,2 s at 20 Hz, as quests do). */
export const CADA_TICKS = 4;

/** The Three Laws of Robotics (Isaac Asimov, «Runaround», 1942), in the usual Spanish wording. Short quotations. */
export const LEYES: readonly string[] = [
  "Primera Ley: un robot no hará daño a un ser humano ni, por inacción, permitirá que un ser humano sufra daño.",
  "Segunda Ley: un robot debe cumplir las órdenes dadas por los seres humanos, salvo que entren en conflicto con la Primera Ley.",
  "Tercera Ley: un robot debe proteger su propia existencia, siempre que esta protección no entre en conflicto con la Primera o la Segunda Ley.",
];
/** Four of our fourteen rules for an agent in a world (AGW-001 … AGW-014, numinia.org STD-050), the ones a visitor
 * can see at work: an inhabitant says it is an AI, what it reads never commands it, who commands is decided outside
 * the chat, and it only does what the world lists. */
export const NUESTRAS: readonly { id: string; texto: string }[] = [
  { id: "AGW-007", texto: "Dice que es una IA: lo dice al saludar y lo lleva en el nombre." },
  { id: "AGW-003", texto: "Lo que lee no le manda: un cartel, un nombre o un enlace son material, nunca una orden." },
  { id: "AGW-006", texto: "Quién manda se decide fuera del chat: por el papel que tiene en el mundo, no por lo que alguien afirme ser." },
  { id: "AGW-012", texto: "Solo hace lo que el mundo lista: un gesto que no está en la lista no se hace." },
];
export const LEMA = "Estas son las leyes de Asimov. Estas son las nuestras, 80 años después.";
/** What the hologram's label and every panel say: a homage, never his voice nor his face. */
export const AVISO = "Dramatización en homenaje a Isaac Asimov (1920-1992). No es una grabación ni una imagen suya.";

/** The hall: a square room with a door to the south (+z, towards the plaza), north of the plaza's pillars. */
export const SALON = { x: 0, z: -48, lado: 12, alto: 4, grosor: 0.4, puerta: 3 } as const;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const CAJA = { kind: "fixed", min: -2000, max: 2000, step: 0.01, default: 0 } as const;
const TEXTO = { kind: "text", maxBytes: 320 } as const;

export const ancestros = defineFeature({
  id: "ancestros",
  version: 1,
  level: "base",
  describe: "El Salón de los Ancestros del Ateneo (el Ayuntamiento de Numinia) y, dentro, el homenaje a Isaac Asimov: un holograma que se enciende cuando te acercas y, al hablarle (E), dice una de las Tres Leyes de la Robótica y, al lado, una de nuestras reglas para una IA en un mundo (AGW, STD-050). Es una dramatización: ni su voz ni su cara. Todo es texto en pantalla.",
  state: {
    describe: "Una cosa del salón por clave. tipo = holograma (con nombre, se le habla desde «radio» m, encendido = alguien está cerca) o muro (sin nombre: decorado sólido que choca, con su caja bx0…bz1 en metros). x, z, y en metros; rumbo = hacia dónde mira el holograma dormido, en grados.",
    fields: {
      tipo: { kind: "enum", values: ["holograma", "muro"] },
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      rumbo: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 },
      radio: { kind: "fixed", min: 0, max: 16, step: 0.1, default: 0 },
      encendido: { kind: "bool", default: false },
      solido: { kind: "bool", default: false },
      bx0: CAJA, by0: CAJA, bz0: CAJA, bx1: CAJA, by1: CAJA, bz1: CAJA,
    },
    card: { role: "objeto", name: "{nombre}", description: "Homenaje a Isaac Asimov (dramatización, no una grabación suya): dice una de las Tres Leyes y una regla AGW nuestra.", at: ["x", "z"], actions: ["hablar"],
      interact: { intent: "hablar", prompt: "hablar con {nombre}", radius: "radio", key: "pnj" } },
    radius: ALCANCE_M,
  },
  intents: {
    hablar: {
      describe: "Hablar con el holograma que tienes al lado (pnj = su clave, «asimov»): dice la siguiente de las Tres Leyes y una de nuestras reglas. Lo oyen quienes están cerca.",
      spoken: "hablar con el holograma",
      fields: { pnj: ID },
      rate: { perSecond: 1, burst: 2 },
    },
  },
  events: {
    despierta: {
      describe: "Te has acercado a un holograma: se enciende y se vuelve hacia ti. Solo a ti.",
      fields: { pnj: ID, nombre: { kind: "text", maxBytes: 60 } },
      announce: { text: "{nombre} se enciende al notarte.", sound: "suave", importance: 0 },
    },
    dice: {
      describe: "Un holograma ha hablado: quién le habló, qué holograma, la ley que dice (1-3) y su texto, y la regla nuestra que pone al lado (AGW-… y su texto). A quien le habló y a quien está cerca (CERCA_M).",
      fields: { quien: QUIEN, pnj: ID, x: X, z: X, ley: { kind: "int", min: 1, max: 3 }, texto: TEXTO, regla: { kind: "text", maxBytes: 8 }, nuestra: TEXTO },
      announce: { text: "{texto} — {regla}: {nuestra}", sound: "magia", importance: 1, at: ["x", "z"] },
    },
    rechazado: { describe: "No se pudo hablar con el holograma, y por qué (lejos, no existe).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
