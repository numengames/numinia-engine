// gente-ia-en (ia-visible S6/S7): the words of the AI section of «People» and of the AI card, in English. The SAME keys as
// gente-ia-es.ts (test/gente-ia.test.ts compares them); gente-ia.ts picks the file by the page's language.
import type { TextosIA } from "./gente-ia-es.ts";

export const en: TextosIA = {
  /** Section title in the «Here now» list. */
  seccionIA: "AIs",
  /** «3 people» / «1 person»; «2 AIs» / «1 AI». */
  personaUna: "person", personaVarias: "people", iaUna: "AI", iaVarias: "AIs",
  /** The chip beside an AI's name. */
  marca: "AI",
  activa: "Active", dormida: "Asleep",
  /** «Answers for it: La Torre · Ana». */
  responde: "Answers for it",
  sinResponsable: "not stated",
  construye: "Can build", noConstruye: "Cannot build",
  /** «Eyes: ◆ Medium» — the size of the model behind it (never its name); the sentence under it explains the eyes. */
  ojos: "Eyes", tamSinModelo: "No model", tamPequeno: "Small model", tamMedio: "Medium model", tamGrande: "Large model", tamDesconocido: "Size unknown",
  /** The main button, and why it may do something else. */
  ir: "Go to it",
  irTitulo: "Takes you next to it",
  irBaliza: "Going next to others is off in this world: it drops a beacon where it is now",
  irAria: "Go to",
  tarjeta: "Card of",
  /** Messages after «Go to it». */
  vasConBaliza: "Beacon placed where it is",
  sinPosicion: "I can't tell where it is from here.",
  /** S11: calling it. The button, the E prompt («E: talk to Ada»), the light on the card and the box. */
  hablar: "Talk to it",
  hablarTitulo: "You write to it and its brain reads it",
  hablarAria: "Talk to",
  promptHablar: "talk to",
  escuchando: "Listening now",
  noEscucha: "Not listening now",
  /** The notice before the first call (once per browser): who reads it and who sees the answer. */
  avisoPrevio: "What you say is read by its brain (that AI's company) outside the world, and its answer is seen by whoever is nearby.",
  aceptar: "Accept",
  cancelar: "Cancel",
  enviar: "Send",
  cajaTitulo: "Talk to",
  cajaEtiqueta: "What you want to tell it",
  cajaAyuda: "Up to 190 bytes. Only it reads this; its answer is seen by whoever is nearby.",
  cajaVacia: "Write what you want to tell it.",
  noSePuede: "You can't talk to it from here right now.",
  /** The chat line under the list while an AI that was called has not answered («Ada is thinking…»). */
  pensando: "is thinking…",
  pensandoVarias: "are thinking…",
  pensandoY: "and",
  pensandoIAs: "AIs",
};
