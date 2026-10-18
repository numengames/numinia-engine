// lucha — declaration (v1, L1). A creature is a thing of the world (state entry WITH `at`, a card and `interact`, like a
// fishing spot): it has coherence instead of hit points (in Numinia a creature is dissolved, not killed), a solid box the
// simulation already honours (`solido: true` + bx0…bz1, as objetos does), and you hit it with ONE verb (golpear). The
// SERVER decides reach, cooldown and damage with the engine's seeded PRNG; the page only asks and shows. The
// target is a creature, or (L8, off by default) a person `p:<entity>` whose Estado rises one rung (estados.ts). In this slice the creature neither moves nor
// strikes back. Design: mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md §1; recipe: docs/EXTENDER.md.
import { defineFeature } from "../../packages/feature/src/index.ts";
import { HABILIDADES, CARGA_MAX } from "./habilidades.ts";
import { ESCALERA } from "./estados.ts";

/** Melee reach (m) beyond the creature's own radius; the J4 slack is added by `within`. */
export const ALCANCE_GOLPE_M = 1.8;
/** Ticks between two blows of one player (12 = 0,6 s at 20 Hz, OSRS/Hyperscape pace: latency does not matter). */
export const ENFRIAMIENTO_TICKS = 12;
/** Damage of a blow: DANO_BASE + rng % DANO_VAR (3..5). */
export const DANO_BASE = 3, DANO_VAR = 3;
/** A dissolved creature is invoked again after this (s); a world may set 0 = never. */
export const REAPARICION_S = 20;
/** Who sees a blow, a dissolution and a return (m). */
export const VER_M = 40;
/** Reach (m, horizontal) between two people for a PVP blow: arm's length plus the J4 slack. */
export const ALCANCE_PVP_M = 2.5;
export const MODOS = ["quieta", "alerta", "disuelta"] as const;

const ID = { kind: "text", maxBytes: 32 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const COH = { kind: "int", min: 0, max: 200 } as const;
const DANO = { kind: "int", min: 0, max: 20 } as const;
const DANO_HAB = { kind: "int", min: 0, max: 250 } as const;
const CARGA = { kind: "int", min: 0, max: CARGA_MAX } as const;

export const lucha = defineFeature({
  id: "lucha",
  version: 1,
  level: "base",
  describe: "Pelear contra criaturas del bestiario: te acercas a una (su radio) y la golpeas (golpear). El servidor decide si alcanzas, el enfriamiento entre golpes (0,6 s) y el daño (3-5, azar con semilla); la coherencia de la criatura baja y, a 0, se disuelve y deja de ser sólida; vuelve a los 20 s. Las criaturas son cajas sólidas: chocas con ellas. Contra personas (`p:<entidad>`) solo si el mundo lo activa (pvp): un golpe que llega sube a esa persona un escalón de Estado (sin barra de vida).",
  state: {
    describe: "Una criatura por clave (`c:<id>`): nombre, especie (ficha del bestiario), dónde (x, y, z), su alcance (radio, m), coherencia actual y máxima, modo (quieta, alerta, disuelta), si es sólida y su caja (bx0 by0 bz0 bx1 by1 bz1, m) y su color.",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, especie: ID,
      x: X, y: Y, z: X, radio: { kind: "fixed", min: 0.5, max: 16, step: 0.1, default: 2.2 },
      coherencia: COH, coherenciaMax: COH,
      modo: { kind: "enum", values: MODOS },
      solido: { kind: "bool", default: true },
      bx0: X, by0: Y, bz0: X, bx1: X, by1: Y, bz1: X,
      color: { kind: "text", maxBytes: 7 },
    },
    card: { role: "criatura", name: "{nombre}", description: "Criatura del bestiario ({modo}, coherencia {coherencia}/{coherenciaMax})", at: ["x", "z"], actions: ["golpear"], interact: { intent: "golpear", prompt: "golpear a {nombre}", radius: "radio", key: "objetivo" } },
    radius: 120,
  },
  intents: {
    golpear: { describe: "Golpear a una criatura que tienes al alcance (su radio + 1,8 m). Un golpe cada 0,6 s; el servidor dice cuánto daño hizo (evento golpe) o que no llegaste (aire).", spoken: "golpear", fields: { objetivo: ID }, rate: { perSecond: 4, burst: 2 } },
    habilidad: { describe: "Usar una habilidad del kit Eclipse Mnémico contra una criatura al alcance: corte-breve (12, 1 s, +12 Carga), incision-semantica (30, 4 s, cuesta 30 Carga) o discontinuidad (55, 8 s, cuesta 55 Carga). El servidor comprueba alcance, enfriamiento propio de cada habilidad y Carga (0-100).", spoken: "habilidad", fields: { objetivo: ID, cual: { kind: "enum", values: HABILIDADES } }, rate: { perSecond: 6, burst: 3 } },
  },
  events: {
    golpe: { describe: "Alguien (de) ha golpeado a una criatura: cuánto daño y cuánta coherencia le queda. A quien está a 40 m.", fields: { objetivo: ID, de: QUIEN, dano: DANO, queda: COH }, announce: { text: "Golpe: −{dano}, le quedan {queda}.", sound: "paso", importance: 1, who: "de" } },
    habilidad: { describe: "Alguien (de) ha usado una habilidad sobre una criatura: cuál, cuánto daño y cuánta coherencia le queda. A quien está a 40 m.", fields: { objetivo: ID, de: QUIEN, cual: { kind: "enum", values: HABILIDADES }, dano: DANO_HAB, queda: COH }, announce: { text: "{cual}: −{dano}, le quedan {queda}.", sound: "paso", importance: 1, who: "de" } },
    carga: { describe: "Tu Carga (0-100) tras usar una habilidad o al entrar. Solo a ti.", fields: { valor: CARGA }, announce: "silent" },
    aire: { describe: "Tu golpe no llegó: la criatura está fuera de tu alcance (o ya no está). Solo a ti.", fields: { objetivo: ID }, announce: { text: "Demasiado lejos.", sound: "suave", importance: 0 } },
    disuelta: { describe: "La criatura se ha disuelto (coherencia 0): deja de ser sólida y desaparece un rato. A quien está a 40 m.", fields: { objetivo: ID, de: QUIEN }, announce: { text: "La criatura se disuelve.", sound: "magia", importance: 2 } },
    vuelve: { describe: "Una criatura disuelta vuelve, entera. A quien está a 40 m.", fields: { objetivo: ID }, announce: { text: "Algo vuelve a tomar forma.", sound: "aviso", importance: 1 } },
    estado: { describe: "El Estado de una persona ha subido un escalón por un golpe de otra (objetivo `p:<entidad>`; estado: ninguno, desestabilizado, confundido, colapsado, aletargado). A quien está a 40 m.", fields: { objetivo: ID, estado: { kind: "enum", values: ESCALERA }, de: QUIEN }, announce: { text: "Alguien queda {estado}.", sound: "aviso", importance: 1 } },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
