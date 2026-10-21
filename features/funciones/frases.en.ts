// frases.en — every word the «Funciones de este mundo» block of the Entorno panel says, in English (funciones/f3).
// Same keys as frases.es.ts (test/funciones-panel.test.ts checks it); keep every {parametro}.
export const FRASES_EN = {
  "grupo": "Features of this world",
  "funcion.normas": "Conditions of entry",
  "funcion.dardos": "Darts",
  "funcion.pesca": "Fishing",
  "titulo.normas": "Turn the conditions of entry (the bubble you accept on arrival) on or off for whoever arrives next. Saved in funciones.json. / Encender o apagar las normas de entrada para quien llegue después.",
  "titulo.dardos": "Turn darts on or off for everyone in this world. Off, nobody throws and the boards go. Saved in funciones.json. / Encender o apagar los dardos para todos.",
  "titulo.pesca": "Turn fishing on or off for everyone in this world. Off, nobody fishes and the ponds go. Saved in funciones.json. / Encender o apagar la pesca para todos.",
  "ayuda.normas": "When off, people enter without accepting any conditions. For demos.",
  "ayuda.fija": "Set by the server.",
  "estado.encendida": "on",
  "estado.apagada": "off",
  "accion.encendiendo": "Turning on: {funcion}…",
  "accion.apagando": "Turning off: {funcion}…",
  "hecho.encendida": "{funcion}: on.",
  "hecho.apagada": "{funcion}: off.",
  "no.fija": "{funcion}: set by the server, the switch does not change it.",
} as const;
