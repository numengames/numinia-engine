// Modelo real: la Tabla de Prestigio del manual de Numinia (lore/game/manual/es/06-inventario-y-bestiario.md,
// «Semillas del Conocimiento», «Uso de las Semillas»; numinia-archive).
// Canon que se modela, tal cual está escrito:
//   - Cinco Semillas: verde 1, azul 2, plateada 3, dorada 4, roja 5 puntos de Prestigio. El DJ las concede
//     cuando hay un acto de conocimiento; no son automáticas.
//   - Cada Semilla sube el Prestigio total (que nunca baja) y queda disponible para gastarla.
//   - Tabla de Prestigio (coste en puntos de Semillas): subir una Competencia 50, una Aptitud Especial 100,
//     una Característica 200; aprender una Competencia nueva 500, una Aptitud Especial nueva 1000.
// Lo que el canon NO fija y aquí es parámetro: cuántas Semillas da el DJ por sesión y de qué color, y qué
// hace el jugador con ellas (la «persona»). Un tick = una sesión de juego (o un día en el MMO).
// Patrón (Dormans, apéndice B): «refuerzo del estilo de juego» con puntos de experiencia; fuente estática
// (la renta de Semillas no crece) y, con `escalada`, un «mecanismo de freno» (cada nivel cuesta más).
import type { Diagrama } from "../diagrama.ts";

export type Persona =
  /** gasta en cuanto puede, de lo caro a lo barato entre 50/100/200 (nunca ahorra para 500/1000) */
  | "gastador"
  /** solo compra Competencias y Aptitudes nuevas (500/1000): ahorra siempre */
  | "ahorrador";

export type ParametrosPrestigio = {
  /** Semillas por sesión: [mín, máx] uniforme; el manual no lo fija */
  semillasPorSesion?: [number, number];
  /** pesos de color verde/azul/plateada/dorada/roja (el manual sugiere que las raras son excepcionales) */
  pesos?: [number, number, number, number, number];
  persona?: Persona;
  /** si true, el coste de subir una Competencia crece 50 puntos por nivel ya comprado (mecanismo de freno; NO es canon) */
  escalada?: boolean;
};

export const COSTES = { competencia: 50, aptitud: 100, caracteristica: 200, competenciaNueva: 500, aptitudNueva: 1000 } as const;
export const VALOR_SEMILLA = { verde: 1, azul: 2, plateada: 3, dorada: 4, roja: 5 } as const;

export function diagramaPrestigio(p: ParametrosPrestigio = {}): Diagrama {
  const [a, b] = p.semillasPorSesion ?? [1, 3];
  const pesos = p.pesos ?? [40, 30, 15, 10, 5];
  const persona = p.persona ?? "gastador";
  const colores = ["verde", "azul", "plateada", "dorada", "roja"] as const;
  const d: Diagrama = {
    nombre: `Tabla de Prestigio (${persona}${p.escalada ? ", escalada" : ""})`,
    nodos: [
      { tipo: "almacen", id: "semillas" }, // puntos de Semilla disponibles para gastar
      { tipo: "almacen", id: "prestigio" }, // total acumulado: nunca baja
      { tipo: "almacen", id: "concedidas" }, // Semillas de esta sesión antes de saber su color
      { tipo: "almacen", id: "competencias" }, // niveles de Competencia comprados
      { tipo: "almacen", id: "aptitudes" },
      { tipo: "almacen", id: "caracteristicas" },
      { tipo: "almacen", id: "competencias_nuevas" },
      { tipo: "almacen", id: "aptitudes_nuevas" },
      // El DJ concede entre a y b Semillas por sesión (fuente estática).
      { tipo: "fuente", id: "dj", salidas: [{ a: "concedidas", tasa: { uniforme: [a, b] } }] },
      // Cada Semilla sale por un color; el color dispara la fuente que vale sus puntos (en semillas y en prestigio).
      { tipo: "puerta", id: "color", de: "concedidas", tasa: 99, salidas: colores.map((c, i) => ({ peso: pesos[i], dispara: `semilla_${c}` })) },
      ...colores.map((c) => ({ tipo: "fuente" as const, id: `semilla_${c}`, modo: "pasivo" as const, salidas: [{ a: "semillas", tasa: VALOR_SEMILLA[c] }, { a: "prestigio", tasa: VALOR_SEMILLA[c] }] })),
      // La Tabla de Prestigio: conversores todo-o-nada, de lo caro a lo barato (el orden decide quién gasta primero).
      { tipo: "conversor", id: "aptitud_nueva", entradas: [{ de: "semillas", tasa: COSTES.aptitudNueva }], salidas: [{ a: "aptitudes_nuevas" }], veces: 9 },
      { tipo: "conversor", id: "competencia_nueva", entradas: [{ de: "semillas", tasa: COSTES.competenciaNueva }], salidas: [{ a: "competencias_nuevas" }], veces: 9 },
      { tipo: "conversor", id: "subir_caracteristica", entradas: [{ de: "semillas", tasa: COSTES.caracteristica }], salidas: [{ a: "caracteristicas" }], veces: 9 },
      { tipo: "conversor", id: "subir_aptitud", entradas: [{ de: "semillas", tasa: COSTES.aptitud }], salidas: [{ a: "aptitudes" }], veces: 9 },
      { tipo: "conversor", id: "subir_competencia", entradas: [{ de: "semillas", tasa: p.escalada ? { lee: "competencias", por: COSTES.competencia, mas: COSTES.competencia } : COSTES.competencia }], salidas: [{ a: "competencias" }], veces: 9 },
    ],
    estados: [],
  };
  // La persona es un juego de activadores: qué compras existen para este jugador.
  const apaga = (id: string) => d.estados!.push({ tipo: "activador", si: "semillas", es: "<", que: 0, activa: id }); // nunca se cumple: apagado
  if (persona === "gastador") { apaga("aptitud_nueva"); apaga("competencia_nueva"); }
  if (persona === "ahorrador") { apaga("subir_caracteristica"); apaga("subir_aptitud"); apaga("subir_competencia"); }
  return d;
}
