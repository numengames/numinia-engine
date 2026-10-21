// frases.es — every word the «Funciones de este mundo» block of the Entorno panel says, in Spanish (funciones/f3).
// One file per language, same keys in each (test/funciones-panel.test.ts checks it). Parameters go in {llaves}; panel.ts only picks
// a key and fills them. To add a language: copy this file, translate the values (keep every key and every {parametro}), register
// it in panel.ts. Pending: ja, ko, pt-br.
export const FRASES_ES = {
  "grupo": "Funciones de este mundo",
  "funcion.normas": "Normas de entrada",
  "funcion.dardos": "Dardos",
  "funcion.pesca": "Pesca",
  "titulo.normas": "Encender o apagar las normas de entrada (la burbuja que se acepta al llegar) para quien llegue después. Se guarda en funciones.json. / Turn the conditions of entry on or off for whoever arrives next.",
  "titulo.dardos": "Encender o apagar los dardos de este mundo para todos. Apagados, nadie tira y las dianas desaparecen. Se guarda en funciones.json. / Turn darts on or off for everyone; off, nobody throws and the boards go.",
  "titulo.pesca": "Encender o apagar la pesca de este mundo para todos. Apagada, nadie pesca y no se ve el agua de pesca. Se guarda en funciones.json. / Turn fishing on or off for everyone; off, nobody fishes and the ponds go.",
  "ayuda.normas": "Apagadas, se entra sin aceptar normas. Para demos.",
  "ayuda.fija": "Lo fija el servidor.",
  "estado.encendida": "encendida",
  "estado.apagada": "apagada",
  "accion.encendiendo": "Encendiendo: {funcion}…",
  "accion.apagando": "Apagando: {funcion}…",
  "hecho.encendida": "{funcion}: encendida.",
  "hecho.apagada": "{funcion}: apagada.",
  "no.fija": "{funcion}: la fija el servidor, el interruptor no la cambia.",
} as const;
