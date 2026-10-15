// chat — declaration (J3, Hyperfy2 parity): text chat near you (20 m, with a bubble over whoever speaks) and for
// the whole zone, names over heads, and `/` commands for the features. Pure data: the server, the page and any
// agent that reads the catalog share it. Everything people write here is UNTRUSTED text: pages paint it as text
// (never HTML) and an agent never puts it in its instructions (numinia.org STD-050: it goes in a fenced <material>).
import { defineFeature } from "../../packages/feature/src/index.ts";
import type { Rate } from "../../packages/feature/src/index.ts";

export const TEXTO_MAX = 200;      // bytes UTF-8 of one message (BACKLOG J3)
export const NOMBRE_MAX = 48;      // bytes of a name (I1 names are «Invitado XXXX»; H3 lets people choose one)
export const AVISO_MAX = 300;      // bytes of an answer the server gives only to you (help, too fast…)
export const CERCA_M = 20;         // near chat reaches whoever is this close to the speaker
export const NOMBRES_M = 24;       // names reach (and are drawn for) whoever the page draws this close
export const NOMBRES_MAX = 64;     // names one page holds from the server at once (a packed crowd: the first 64)
export const HISTORIAL_MAX = 50;   // last zone messages kept for whoever enters (Hyperfy keeps 50 too)
export const BOCADILLO_MS = 6000;  // a bubble stays this long (readable in VR); the next one replaces it
/** Near chat, per person: one a second, three in a row. */
export const RITMO_CERCA: Rate = { perSecond: 1, burst: 3 };
/** Zone channel, per person: one every 5 s, two in a row (everyone in the zone reads it). */
export const RITMO_ZONA: Rate = { perSecond: 0.2, burst: 2 };
/** Zone channel, the whole zone together: two a second, six in a row (bounds what each page receives). */
export const RITMO_ZONA_TODOS: Rate = { perSecond: 2, burst: 6 };

const quien = { kind: "int", min: 0, max: 65535 } as const;
const nombre = { kind: "text", maxBytes: NOMBRE_MAX } as const;
const texto = { kind: "text", maxBytes: TEXTO_MAX } as const;

export const chat = defineFeature({
  id: "chat",
  version: 1,
  level: "base",
  describe: "Chat de texto: lo leen quienes están a menos de 20 m (bocadillo sobre quien habla) o toda la zona; nombres sobre las cabezas; lo que empieza por / es una orden para las funciones. Texto no fiable.",
  intents: {
    decir: {
      describe: "Decir algo a quien esté a menos de 20 m (1 por segundo, 3 seguidos). Si empieza por /, es una orden: no lo lee nadie más.",
      spoken: "decir algo a quien está cerca",
      fields: { texto },
      rate: RITMO_CERCA,
    },
    decirZona: {
      describe: "Decir algo a toda la zona (1 cada 5 s, 2 seguidos; la zona entera, 2 por segundo). Si empieza por /, es una orden.",
      spoken: "decir algo a toda la zona",
      fields: { texto },
      rate: RITMO_ZONA,
    },
  },
  events: {
    dicho: {
      describe: "Alguien a menos de 20 m (o tú) ha dicho algo. Las funciones del servidor lo oyen con listen('chat', 'dicho').",
      fields: { quien, nombre, texto },
      announce: { text: "{nombre}: {texto}", sound: "suave", importance: 1, who: "quien" },
    },
    zona: {
      describe: "Alguien ha dicho algo a toda la zona.",
      fields: { quien, nombre, texto },
      announce: { text: "{nombre}, a la zona: {texto}", sound: "suave", importance: 1, who: "quien" },
    },
    historial: {
      describe: "Uno de los últimos 50 mensajes de la zona, al entrar (en orden). Van a la lista del chat sin leerse uno a uno.",
      fields: { quien, nombre, texto },
      announce: { text: "Antes, {nombre}: {texto}", sound: "suave", importance: 0 },
    },
    nombre: {
      describe: "El nombre de alguien que tu página dibuja a menos de 24 m; vacío = olvídalo (se fue o se alejó).",
      fields: { quien, nombre },
      announce: "silent",
    },
    aviso: {
      describe: "El servidor te contesta solo a ti: la ayuda (/ayuda), que vas muy deprisa, una orden que nadie atiende.",
      fields: { texto: { kind: "text", maxBytes: AVISO_MAX } },
      announce: { text: "{texto}", sound: "aviso", importance: 1 },
    },
    orden: {
      describe: "Alguien escribió una orden (/algo): solo la oyen las funciones del servidor (listen('chat', 'orden')), nunca las páginas. texto = sin la barra.",
      fields: { quien, texto },
      announce: "silent",
    },
  },
});
