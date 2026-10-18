// Modelo real: cuándo cae una Reliquia. Canon (lore/game/manual/es/06-inventario-y-bestiario.md, «Reliquias»):
// un PJ no porta más de tres Reliquias a la vez; cada una tiene una Propiedad ligada a una Competencia y un
// Factor de Riesgo. El manual NO fija una tasa de aparición: en mesa las da el DJ. En el MMO hará falta una
// y este modelo responde a la pregunta de diseño: «con X ‰ por encuentro, ¿cuántos encuentros tarda un
// jugador en ver su primera Reliquia, y el desafortunado (p95)?» — y qué cambia con un seguro contra rachas
// («piedad»: cada fallo sube un poco la probabilidad; al caer una, el contador vuelve a cero).
// Un tick = un encuentro (una misión, un cofre, un combate). Patrón: puerta de azar con memoria (registro
// que lee el almacén de fallos): retroalimentación negativa sobre la mala suerte, como en los diagramas
// públicos «pity mechanics» de la comunidad (ver MAQUINACIONES-APRENDIZAJE.md).
import type { Diagrama } from "../diagrama.ts";

export type ParametrosReliquias = {
  /** probabilidad base por encuentro, en tanto por mil (50 = 5 %) */
  base?: number;
  /** cuánto sube la probabilidad (‰) por cada fallo seguido; 0 = sin piedad */
  piedad?: number;
  /** tope de la probabilidad (‰) */
  tope?: number;
};

export function diagramaReliquias(p: ParametrosReliquias = {}): Diagrama {
  const base = p.base ?? 50, piedad = p.piedad ?? 0, tope = p.tope ?? 1000;
  return {
    nombre: `Reliquias (base ${base}‰, piedad +${piedad}‰/fallo)`,
    nodos: [
      { tipo: "almacen", id: "botin" }, // lo que un encuentro deja antes de saber qué es
      { tipo: "almacen", id: "reliquias" }, // Reliquias conseguidas (portadas: hasta 3; el resto, en reserva)
      { tipo: "almacen", id: "fallos" }, // encuentros seguidos sin Reliquia
      { tipo: "almacen", id: "encuentros" },
      { tipo: "registro", id: "probabilidad", valor: { lee: "fallos", por: piedad, mas: base, max: tope } },
      { tipo: "registro", id: "resto", valor: { lee: "probabilidad", por: -1, mas: 1000, min: 0 } },
      { tipo: "fuente", id: "encuentro", salidas: [{ a: "botin" }, { a: "encuentros" }] },
      {
        tipo: "puerta", id: "suerte", de: "botin", tasa: 1,
        salidas: [
          { a: "reliquias", peso: { lee: "probabilidad" }, dispara: "olvidar_fallos" },
          { a: "fallos", peso: { lee: "resto" } },
        ],
      },
      { tipo: "sumidero", id: "olvidar_fallos", modo: "pasivo", de: "fallos", tasa: 1_000_000 },
    ],
  };
}
