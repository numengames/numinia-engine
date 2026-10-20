// cable-frases.es — every word the sentence of a cable says, in Spanish (D-041, historia B «cable sin JSON»).
// One file per language, same keys in each (test/cable-frases.test.ts checks it). Parameters go in {llaves}; the code
// in cable-frase.ts only fills them in and picks a key, it never writes a word of its own. To add a language: copy
// this file, translate the values (keep every key and every {parametro}), register it in cable-frase.ts.
export const FRASES_ES = {
  // «when»: one per kind of trigger ({nombre} = its name, {senal} = the signal it listens to)
  "cuando.boton": "Cuando alguien pulse “{nombre}”,",
  "cuando.zona": "Cuando alguien entre en “{nombre}”,",
  "cuando.senal": "Cuando se oiga la señal “{senal}”,",
  "cuando.otro": "Cuando pase algo en “{nombre}”,",
  // «do»: one per action of a receiver
  "accion.muestra": "muestra “{objeto}”",
  "accion.oculta": "oculta “{objeto}”",
  "accion.mueve": "mueve “{objeto}”",
  "accion.teletransporta": "teletransporta a ({x}, {y}, {z})",
  "accion.da_paso": "da el paso {paso} de la misión “{mision}”",
  "accion.abre_enlace": "ofrece abrir “{enlace}”",
  "accion.suena": "hace sonar “{sonido}”",
  "accion.vuelve_a_seguro": "devuelve a un sitio seguro",
  "accion.desconocida": "hace algo que esta versión no sabe contar",
  // joining several receivers: 1 → just it; 2 → lista.dos; more → lista.sep between all but the last, then lista.ultimo
  "lista.dos": "{a} y {b}",
  "lista.sep": "{a}, {b}",
  "lista.ultimo": "{resto} y {ultimo}",
  // the whole sentence
  "frase.completa": "{cuando} {acciones}.",
  "frase.sinAcciones": "{cuando} todavía no hace nada.",
  "frase.vacia": "Este cable no se puede describir.",
  // extras, each its own sentence after the main one
  "extra.espera": "Espera {segundos} s.",
  "extra.unSoloUso": "Solo funciona una vez.",
} as const;
