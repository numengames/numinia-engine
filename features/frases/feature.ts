// frases — declaration (Y29). A closed list of ~20 fixed phrases («hello», «thank you», «help», «follow me», «over here»…)
// that anyone picks with one touch; each reader sees them in THEIR language. No typing, no shared language needed: it
// serves phones, screen readers and agents. The server decides: it checks the id exists, applies the pace and sends the
// ID, never text (so there is no untrusted text and no impersonation); every page translates when it paints. Reach is
// the near chat's (20 m, area of interest): never to everyone. The list is state (one entry per phrase) so agents read
// it as cards. The chat's constants are copied on purpose: a feature imports only the plug (tools/layers.json).
import { defineFeature } from "../../packages/feature/src/index.ts";
import type { Rate } from "../../packages/feature/src/index.ts";

// Light constants live HERE, not in frases.ts: the page's start bundle (limits.json first_load_br_bytes) imports this file and the
// client, never the reader and the JSON (those are the server's and the lazy panel's). test/frases.test.ts keeps them equal to the file's.
export const ID_BYTES = 24;           // bytes of an id on the wire
export const TEXTO_FRASE_MAX = 60;    // characters of one phrase in one language
export const GRUPOS_IDS = ["saludo", "ayuda", "direccion", "respuesta"] as const;
export const IDIOMAS = ["en", "es"] as const;
export type Idioma = (typeof IDIOMAS)[number];
/** «es-ES», «ES», undefined… → a language we have; anything else is English (the default). */
export const idiomaDe = (x: unknown): Idioma => {
  const base = String(x ?? "").toLowerCase().split(/[-_]/)[0];
  return (IDIOMAS as readonly string[]).includes(base) ? (base as Idioma) : "en";
};

export const CERCA_M = 20;            // as the near chat (features/chat/feature.ts)
export const BOCADILLO_MS = 6000;     // as the chat's bubble
export const NOMBRE_MAX = 48;
export const RITMO: Rate = { perSecond: 1, burst: 3 }; // as the near chat: one a second, three in a row (the server's own bucket answers «too fast» with the reason)
const ANTIRRIADA: Rate = { perSecond: 4, burst: 8 };    // the engine's blunt flood guard in front of it: past this, silence

const quien = { kind: "int", min: 0, max: 65535 } as const;
const id = { kind: "text", maxBytes: ID_BYTES } as const;

export const frases = defineFeature({
  id: "frases",
  version: 1,
  level: "base",
  describe: "Fixed phrases: a short closed list (hello, thank you, help, follow me…) anyone picks with a tap or a key; people within 20 m read it in their own language. The server sends the id, never text. Verb `frase` with the id; the list is in the cards.",
  state: {
    describe: "One entry per phrase, by its stable id: its order, its group and its text in every language (en, es). Everyone gets the list once; it is what the panel and the agents read.",
    fields: {
      orden: { kind: "int", min: 0, max: 255 },
      grupo: { kind: "enum", values: [...GRUPOS_IDS] },
      en: { kind: "text", maxBytes: TEXTO_FRASE_MAX * 2 },
      es: { kind: "text", maxBytes: TEXTO_FRASE_MAX * 2 },
    },
    card: { role: "cartel", name: "{en}", description: "Fixed phrase «{en}» (es: «{es}»), group {grupo}. Say it with the verb `frase`, id {key}.", importance: 0, actions: ["frase"] },
  },
  intents: {
    frase: {
      describe: "Say a fixed phrase by its id (see the cards: hello, thanks, help, follow-me…). People within 20 m read it in their language. One a second, three in a row. An unknown id is refused with the reason.",
      spoken: "say a fixed phrase",
      fields: { id },
      rate: ANTIRRIADA,
    },
  },
  events: {
    dicha: {
      describe: "Someone within 20 m (or you) said a fixed phrase: who, their name and the phrase's id (never text; each page translates it).",
      fields: { quien, nombre: { kind: "text", maxBytes: NOMBRE_MAX }, frase: id },
      announce: { text: "{nombre} says: {frase}", sound: "suave", importance: 0, who: "quien" },
    },
    rechazado: {
      describe: "A phrase was not said, and why (unknown id, too fast, silenced).",
      fields: { motivo: { kind: "text", maxBytes: 160 } },
      announce: { text: "{motivo}", sound: "aviso", importance: 1 },
    },
  },
});
