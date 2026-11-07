// franjas — declaration (Y37). The world says which band of the day it is in (dawn, day, dusk, night) and announces each
// change, so other features can hook on to it without touching the simulation or the environment. A piece (pieza):
// the SERVER decides (R-1). It reads the zone's clock from `entorno` (read only: `api.estadoDe("entorno")`), turns the
// hour into a band with whole numbers (esquema.ts) and publishes one state entry, «zona» (the same key as entorno: one
// time per zone, shared by everybody in it). It announces ONLY when the band changes while the day cycle runs
// (`entorno.ciclo` > 0): never at start-up, never when someone joins (they read the card), never without a cycle.
// For another feature (Y38 and onwards) the hook is two reads and no import:
//   server: `api.listen("franjas", "franja", (m) => …)` for the change, `api.estadoDe("franjas").get("zona")?.franja` for now;
//   page:   `api.estadoDe("franjas")` the same way. Nobody writes this state but this feature.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** The zone's only state key (the same as entorno's; M16 will bring several zones per world). */
export const ZONA = "zona";
/** The server checks the clock once a second; the environment moves it every 5 s, so a change is seen within 1 s. */
export const MIRAR_TICKS = 20;
export const FRANJAS_IDS = ["amanecer", "dia", "ocaso", "noche"] as const;

const FRANJA = { kind: "enum", values: [...FRANJAS_IDS] } as const;
const TEXTO = { kind: "text", maxBytes: 120 } as const;

export const franjas = defineFeature({
  id: "franjas",
  version: 1,
  level: "base",
  describe: "Time of day for the zone: dawn, day, dusk or night, worked out by the server from the environment's clock. Announces each change once (text and sound) while the day cycle runs; never at start-up or on arrival. Other features listen to the `franja` event or read the state; none changes it.",
  state: {
    describe: "One entry, «zona»: franja = the band now (amanecer, dia, ocaso, noche); siguiente = the band after it; desde = the world hour (0-24) at which that next band starts; activa = the day cycle is running (without it the band stays where the clock was put and nothing is announced); texto = the sentence a card reads, in the world's language.",
    fields: {
      franja: FRANJA,
      siguiente: FRANJA,
      desde: { kind: "fixed", min: 0, max: 24, step: 0.05, default: 0 },
      activa: { kind: "bool", default: false },
      texto: TEXTO,
    },
    card: { role: "lugar", name: "Time of day", description: "{texto}", importance: 0, actions: ["consultar"] },
  },
  intents: {
    consultar: { describe: "Ask which band of the day it is and when the next one starts. The answer comes only to you; nothing moves and nothing is spent.", spoken: "ask the time of day", fields: {}, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    franja: {
      describe: "The band of the day changed (only while the day cycle runs). `franja` = the new band, `anterior` = the one before, `texto` = the notice in the world's language. Server features listen to it with `api.listen(\"franjas\", \"franja\", …)`.",
      fields: { franja: FRANJA, anterior: FRANJA, texto: TEXTO },
      announce: { text: "{texto}", sound: "suave", importance: 1 },
    },
    estado: {
      describe: "To you only: the answer to `consultar`, which band it is and when the next one starts.",
      fields: { texto: { kind: "text", maxBytes: 160 } },
      announce: { text: "{texto}", sound: "suave", importance: 1 },
    },
  },
});
