// gente-ia-es (ia-visible S6/S7): the words of the AI section of «Gente» and of the AI card, in Spanish. One file per language with
// the SAME keys (test/gente-ia.test.ts compares them); a language without a file falls back to Spanish (gente-ia.ts).
export const es = {
  /** Section title in the «Aquí ahora» list. */
  seccionIA: "IAs",
  /** «3 personas» / «1 persona»; «2 IAs» / «1 IA». */
  personaUna: "persona", personaVarias: "personas", iaUna: "IA", iaVarias: "IAs",
  /** The chip beside an AI's name. */
  marca: "IA",
  activa: "Activa", dormida: "Dormida",
  /** «Responde por ella: La Torre · Ana». */
  responde: "Responde por ella",
  sinResponsable: "no consta",
  construye: "Puede construir", noConstruye: "No puede construir",
  /** The main button, and why it may do something else. */
  ir: "Ir hacia ella",
  irTitulo: "Te lleva junto a ella",
  irBaliza: "En este mundo no se puede ir junto a otros: pone una baliza donde está ahora",
  irAria: "Ir hacia",
  tarjeta: "Tarjeta de",
  /** Messages after «Ir hacia ella». */
  vasConBaliza: "Baliza puesta donde está",
  sinPosicion: "No sé dónde está desde aquí.",
} as const;
export type TextosIA = { readonly [K in keyof typeof es]: string };
