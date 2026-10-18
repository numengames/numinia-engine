// lucha — declaration (v1, L1 + L2 trozo 1). A creature is a thing of the world (state entry WITH `at`, a card and
// `interact`, like a fishing spot): it has coherence instead of hit points (in Numinia a creature is dissolved, not
// killed), a solid box the simulation already honours (`solido: true` + bx0…bz1, as objetos does), and you hit it
// with ONE verb (golpear). The SERVER decides reach, cooldown and damage with the engine's seeded PRNG; the page
// only asks and shows. PVE only: the target is always a creature (PVP is Pablo's decision, not this file's). In
// this slice the creature neither moves nor chases (L3) — but every blow you land, it strikes back: your own life
// (server memory only, L2 trozo 1) goes down the same way, and at 0 you fall (`caido`) until you come back whole.
// Design: mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md §1; recipe: docs/EXTENDER.md.
import { defineFeature } from "../../packages/feature/src/index.ts";

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
export const MODOS = ["quieta", "alerta", "disuelta"] as const;

/** L2 trozo 1: the player's own life, in server memory only (not shared state yet — that is the HUD story). Every
 * blow a player lands, the creature strikes back for the same DANO_BASE..DANO_BASE+DANO_VAR-1 roll (same seeded
 * PRNG stream: replayable). At 0 the player falls (`caido`): no more `golpear` until REAPARICION_JUGADOR_TICKS pass,
 * then they come back whole. */
export const VIDA_JUGADOR_MAX = 50;
/** Ticks a fallen player waits before coming back whole (5 s at HZ=20). */
export const REAPARICION_JUGADOR_TICKS = 100;

const ID = { kind: "text", maxBytes: 32 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const COH = { kind: "int", min: 0, max: 200 } as const;
const DANO = { kind: "int", min: 0, max: 20 } as const;
const VIDA = { kind: "int", min: 0, max: VIDA_JUGADOR_MAX } as const;

export const lucha = defineFeature({
  id: "lucha",
  version: 1,
  level: "base",
  describe: "Pelear contra criaturas del bestiario: te acercas a una (su radio) y la golpeas (golpear). El servidor decide si alcanzas, el enfriamiento entre golpes (0,6 s) y el daño (3-5, azar con semilla); la coherencia de la criatura baja y, a 0, se disuelve y deja de ser sólida; vuelve a los 20 s. Las criaturas son cajas sólidas: chocas con ellas. Solo contra criaturas (PVE).",
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
  },
  events: {
    golpe: { describe: "Alguien (de) ha golpeado a una criatura: cuánto daño y cuánta coherencia le queda. A quien está a 40 m.", fields: { objetivo: ID, de: QUIEN, dano: DANO, queda: COH }, announce: { text: "Golpe: −{dano}, le quedan {queda}.", sound: "paso", importance: 1, who: "de" } },
    aire: { describe: "Tu golpe no llegó: la criatura está fuera de tu alcance (o ya no está). Solo a ti.", fields: { objetivo: ID }, announce: { text: "Demasiado lejos.", sound: "suave", importance: 0 } },
    disuelta: { describe: "La criatura se ha disuelto (coherencia 0): deja de ser sólida y desaparece un rato. A quien está a 40 m.", fields: { objetivo: ID, de: QUIEN }, announce: { text: "La criatura se disuelve.", sound: "magia", importance: 2 } },
    vuelve: { describe: "Una criatura disuelta vuelve, entera. A quien está a 40 m.", fields: { objetivo: ID }, announce: { text: "Algo vuelve a tomar forma.", sound: "aviso", importance: 1 } },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    jugadorHerido: { describe: "L2 trozo 1: la criatura te golpea de vuelta cuando la golpeas: cuánto daño y cuánta vida te queda (en memoria del servidor, sin HUD aún). Solo a ti.", fields: { dano: DANO, vida: VIDA }, announce: { text: "Te golpean: −{dano}, te quedan {vida}.", sound: "paso", importance: 1 } },
    jugadorCaido: { describe: "Tu vida llega a 0: caes. No puedes golpear hasta que te recuperes. Solo a ti.", fields: {}, announce: { text: "Caes.", sound: "error", importance: 2 } },
    jugadorVuelve: { describe: "Te recuperas del todo tras caer. Solo a ti.", fields: {}, announce: { text: "Te recuperas.", sound: "aviso", importance: 1 } },
  },
});
