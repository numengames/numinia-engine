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
  /** t_5096d6f4: «Ojos: ◆ Medio» — the size of the model behind it (never its name); the sentence under it explains the eyes. */
  ojos: "Ojos", tamSinModelo: "Sin modelo", tamPequeno: "Modelo pequeño", tamMedio: "Modelo medio", tamGrande: "Modelo grande", tamDesconocido: "Tamaño sin determinar",
  /** The main button, and why it may do something else. */
  ir: "Ir hacia ella",
  irTitulo: "Te lleva junto a ella",
  irBaliza: "En este mundo no se puede ir junto a otros: pone una baliza donde está ahora",
  irAria: "Ir hacia",
  tarjeta: "Tarjeta de",
  /** Messages after «Ir hacia ella». */
  vasConBaliza: "Baliza puesta donde está",
  sinPosicion: "No sé dónde está desde aquí.",
  /** S11: calling it. The button, the E prompt («E: hablar con Ada»), the light on the card (S16's words) and the box. */
  hablar: "Hablar con ella",
  hablarTitulo: "Le escribes y su cerebro lo lee",
  hablarAria: "Hablar con",
  promptHablar: "hablar con",
  escuchando: "Escuchando ahora",
  noEscucha: "No escucha ahora",
  /** The notice before the first call (once per browser): who reads it and who sees the answer. */
  avisoPrevio: "Lo que le digas lo lee su cerebro (la empresa de esa IA) fuera del mundo, y su respuesta la ven quienes estén cerca.",
  aceptar: "Aceptar",
  cancelar: "Cancelar",
  enviar: "Enviar",
  cajaTitulo: "Hablar con",
  cajaEtiqueta: "Lo que le quieres decir",
  cajaAyuda: "Hasta 190 bytes. Solo lo lee ella; su respuesta la ven quienes estén cerca.",
  cajaVacia: "Escribe qué quieres decirle.",
  noSePuede: "Ahora no se puede hablar con ella desde aquí.",
} as const;
export type TextosIA = { readonly [K in keyof typeof es]: string };
