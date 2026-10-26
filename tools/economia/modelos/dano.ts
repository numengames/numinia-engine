// Modelo de diseño: daño en combate con D6 por Éxitos (tarjeta t_5fe4d800; plantilla de la comunidad
// «Souls-like Balancing»). NO es canon del manual: es el candidato a medir antes de programarlo.
// Regla que se modela: en cada ronda el atacante tira `dados` D6; cada dado que saca `umbral` o más es un Éxito,
// cada 1 es una pifia. Cada Éxito hace `danoPorExito` de daño a la criatura; las pifias no hacen nada aquí
// (se cuentan para decidir después si cuestan Aguante). La criatura tiene `vida`; pasa de sana a herida
// (daño ≥ mitad) y a caída (daño ≥ vida). Un tick = una ronda de combate.
// Diagrama: dados → [puerta del D6] → Éxitos → (dispara) daño por Éxito → daño acumulado → estado de la criatura.
//                                   → pifias
import type { Diagrama } from "../diagrama.ts";

export type ParametrosDano = {
  /** dados tirados por ronda (la reserva del atacante) */
  dados?: number;
  /** cara mínima que cuenta como Éxito (2..6); 5 = un tercio de los dados */
  umbral?: number;
  /** daño que hace cada Éxito */
  danoPorExito?: number;
  /** vida de la criatura */
  vida?: number;
};

/** probabilidad de Éxito por dado, en sextos (6 - umbral + 1) */
export const sextosExito = (umbral: number): number => 7 - umbral;

export function diagramaDano(p: ParametrosDano = {}): Diagrama {
  const dados = p.dados ?? 4, umbral = p.umbral ?? 5, dano = p.danoPorExito ?? 3, vida = p.vida ?? 30; // la vida solo nombra el diagrama: el estado se lee con estadoCriatura
  const exito = sextosExito(umbral), pifia = 1, resto = 6 - exito - pifia;
  return {
    nombre: `Daño D6 por Éxitos (${dados}d6, Éxito ${umbral}+, ${dano}/Éxito, vida ${vida})`,
    nodos: [
      { tipo: "almacen", id: "reserva" }, // dados de la ronda, antes de saber su cara
      { tipo: "almacen", id: "exitos" },
      { tipo: "almacen", id: "pifias" },
      { tipo: "almacen", id: "dano" }, // daño acumulado sobre la criatura
      { tipo: "almacen", id: "rondas" },
      { tipo: "fuente", id: "tirada", salidas: [{ a: "reserva", tasa: dados }, { a: "rondas" }] },
      {
        tipo: "puerta", id: "d6", de: "reserva", tasa: 99,
        salidas: [
          { a: "exitos", peso: exito, dispara: "golpe" },
          { a: "pifias", peso: pifia },
          { peso: resto }, // ni éxito ni pifia: se pierde
        ],
      },
      { tipo: "fuente", id: "golpe", modo: "pasivo", salidas: [{ a: "dano", tasa: dano }] },
    ],
    // Estado de la criatura: se lee del daño acumulado (herida a la mitad, caída a la vida). Ver `estadoCriatura`.
    estados: [],
  };
}

export type EstadoCriatura = "sana" | "herida" | "caida";
export const estadoCriatura = (dano: number, vida: number): EstadoCriatura => (dano >= vida ? "caida" : dano * 2 >= vida ? "herida" : "sana");
