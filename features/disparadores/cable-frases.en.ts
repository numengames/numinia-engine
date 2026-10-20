// cable-frases.en — the same sentences as cable-frases.es.ts, in English. Same keys, same {parameters}.
import type { FRASES_ES } from "./cable-frases.es.ts";

export const FRASES_EN: Record<keyof typeof FRASES_ES, string> = {
  "cuando.boton": "When someone presses “{nombre}”,",
  "cuando.zona": "When someone enters “{nombre}”,",
  "cuando.senal": "When the signal “{senal}” is heard,",
  "cuando.otro": "When something happens at “{nombre}”,",
  "accion.muestra": "it shows “{objeto}”",
  "accion.oculta": "it hides “{objeto}”",
  "accion.mueve": "it moves “{objeto}”",
  "accion.teletransporta": "it teleports them to ({x}, {y}, {z})",
  "accion.da_paso": "it gives step {paso} of the quest “{mision}”",
  "accion.abre_enlace": "it offers to open “{enlace}”",
  "accion.suena": "it plays the sound “{sonido}”",
  "accion.vuelve_a_seguro": "it sends them back to a safe place",
  "accion.desconocida": "it does something this version cannot describe",
  "lista.dos": "{a} and {b}",
  "lista.sep": "{a}, {b}",
  "lista.ultimo": "{resto}, and {ultimo}",
  "frase.completa": "{cuando} {acciones}.",
  "frase.sinAcciones": "{cuando} it does nothing yet.",
  "frase.vacia": "This cable cannot be described.",
  "extra.espera": "Waits {segundos} s.",
  "extra.unSoloUso": "It only works once.",
};
