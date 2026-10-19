// Paleta de la naturaleza de Numinia: ÚNICA fuente de color de terreno, árboles, hierba, residuos y fauna.
// Todo sale de los tokens de la casa (numinia-archive STD-023 §colores, §escala de rareza) y de sus derivados;
// ningún hex nuevo sin pasar por aquí. Dirección de arte: work/naturaleza/DIRECCION-ARTE.md
// (solarpunk 40 % luz · steampunk 40 % bronce y máquina · cyberpunk 20 % solo señales pequeñas).

/** Tokens de la casa (hex enteros). */
export const CASA = {
  noche: 0x14110f, basalto: 0x1e1a17, bronceOscuro: 0x292420, bronce: 0x3a332d,
  ceniza: 0x8a7d72, arenaVelada: 0xc4b5a6, arena: 0xf9ebdc,
  verdemar: 0xa6dad5, turquesa: 0x018ea1, turquesaProfundo: 0x016e7d,
  ambar: 0xefa517, ambarTostado: 0x7a5100,
  coral: 0xf35059, grana: 0xd33440,
  verde: 0x8fc46b,
} as const;

/** Escala de rareza (STD-023). */
export const RAREZA = {
  pobre: 0xf9ebdc, comun: 0x8a7d72, pococomun: 0x8fc46b, rara: 0x5d9bd6, epica: 0xa98be0, legendaria: 0xefa517,
} as const;

/** Derivados naturales: verdes de monte mediterráneo, apagados (≈60 % de la saturación del Verde de la casa). */
export const VERDES = {
  hierbaLuz: 0xb9b878, hierba: 0x8ba86a, hierbaSombra: 0x5e7f4a,
  monte: 0x3f5b38, monteSombra: 0x2b3f2a,
  musgo: 0x6f8a4e, verdin: 0x1f6b5f,
} as const;

/** Materiales de la máquina: cobre, latón, bronce, verdín. */
export const MAQUINA = {
  laton: 0xb98a2e, latonSombra: 0x7a5100, cobre: 0xa8643a, cobreOxidado: 0x016e7d,
  bronce: 0x3a332d, hierro: 0x292420, cristal: 0xa6dad5,
} as const;

/** Acentos de señal (cyber): solo luces pequeñas, nunca superficies grandes. */
export const SENAL = { turquesa: 0x018ea1, coral: 0xf35059, ambar: 0xefa517 } as const;

/** Noche: jardín cálido, negros marrones y arena a la luz de luna; nunca neón. */
export const NOCHE = { fondo: 0x14110f, sombra: 0x1e1a17, luna: 0xc4b5a6 } as const;

/**
 * R5.1 · Relleno de sombra (relleno.ts): el color que toma la cara a la que no llega el sol, como un hemisferio horneado.
 * Abajo verdemar fresco tirando a verdín (sombra fresca, nunca negra); arriba arena velada con un toque de verdemar (la sombra del suelo, templada). Mezclas de tokens, ningún hex nuevo.
 */
export const RELLENO = {
  abajo: mezcla(CASA.verdemar, VERDES.verdin, 0.15),
  arriba: mezcla(CASA.arenaVelada, CASA.verdemar, 0.3),
} as const;

/**
 * R5.2 · Color del estanque (el cuerpo del agua: agua-estilo.ts lo oscurece en lo hondo y lo aclara hacia Verdemar en la orilla).
 * Turquesa profundo aclarado con Verdemar y apagado con Ceniza: un turquesa verdoso hondo y mate, nunca el azul saturado de antes.
 */
export const COLOR_ESTANQUE = mezcla(mezcla(CASA.turquesaProfundo, CASA.verdemar, 0.35), CASA.ceniza, 0.2);

/**
 * R6.2 · Las tres franjas del suelo (DISENO-LORE.md): agua (musgo vivo y verdín junto al estanque, el cauce seco como banda
 * clara de guijarros de sílice), jardín de colonia (pergamino claro: arena cálida, verdes secos de olivo, manchas de paja) y
 * páramo de antracita (oscuro y dorado: basalto y ceniza con costra ocre y grietas). Solo mezclas de tokens.
 */
export const FRANJAS = {
  agua: {
    suelo: mezcla(mezcla(VERDES.hierba, VERDES.musgo, 0.4), CASA.ceniza, 0.08), fresco: mezcla(VERDES.hierba, CASA.verde, 0.15),
    verdin: mezcla(mezcla(VERDES.musgo, VERDES.verdin, 0.45), CASA.ceniza, 0.12),
  },
  lecho: { claro: mezcla(CASA.arena, CASA.verdemar, 0.14), guijarro: mezcla(mezcla(CASA.arenaVelada, CASA.ceniza, 0.45), CASA.verdemar, 0.12) },
  jardin: {
    arena: mezcla(CASA.arenaVelada, CASA.arena, 0.22), tierra: mezcla(CASA.arenaVelada, CASA.ambar, 0.16),
    olivo: mezcla(VERDES.hierbaLuz, VERDES.musgo, 0.4), paja: mezcla(mezcla(CASA.arenaVelada, CASA.ambar, 0.26), CASA.arena, 0.2),
    hierba: mezcla(mezcla(VERDES.hierbaLuz, CASA.ambar, 0.18), CASA.arenaVelada, 0.25),
  },
  paramo: {
    ceniza: mezcla(CASA.ceniza, CASA.basalto, 0.5), basalto: mezcla(CASA.basalto, CASA.ceniza, 0.22),
    costra: mezcla(mezcla(CASA.ambarTostado, CASA.ambar, 0.35), CASA.ceniza, 0.25), grieta: mezcla(CASA.basalto, CASA.noche, 0.5),
    hierba: mezcla(mezcla(MAQUINA.laton, CASA.ambarTostado, 0.35), CASA.ceniza, 0.15),
  },
} as const;

/** Paletas de estación: qué verde/hoja/flor usa cada una. Todo dentro de las tablas de arriba. */
export const ESTACIONES = {
  verano: { hierba: VERDES.hierba, hierbaLuz: VERDES.hierbaLuz, hoja: VERDES.monte, hojaLuz: VERDES.musgo, flor: CASA.arena },
  otono: { hierba: 0xb09a58, hierbaLuz: 0xc79a3e, hoja: CASA.ambarTostado, hojaLuz: CASA.ambar, flor: CASA.ambar },
  primavera: { hierba: 0x9fbc78, hierbaLuz: CASA.verde, hoja: VERDES.hierba, hojaLuz: VERDES.hierbaLuz, flor: CASA.verdemar },
} as const;
export type Estacion = keyof typeof ESTACIONES;

/** Mezcla lineal de dos hex enteros (para degradados por vértice y variación por instancia). */
export function mezcla(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
}
