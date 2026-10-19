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
 * Abajo verdemar fresco tirando a verdín (la sombra BotW, nunca negra); arriba arena velada con un toque de verdemar (la sombra del suelo, templada). Mezclas de tokens, ningún hex nuevo.
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
 * R5.3 · Pilares de referencia del motor (index.ts, 24 cajas en anillos) vestidos de máquina mientras la naturaleza está encendida
 * (hitos.ts): postes de latón, verdín, cobre y ceniza en vez del amarillo/azul/rojo/verde de juguete. Mismo orden que la paleta del
 * motor, así el «pilar dorado» de la misión de ejemplo sigue siendo el de latón. Mezclas de tokens, ningún hex nuevo.
 * Oscurecidos con Bronce a propósito: son MeshStandardMaterial a plena luz de sol (no Lambert con colores por vértice como el resto
 * de la naturaleza) y en las fotos un verdín o una ceniza claros se quemaban hasta cian y blanco.
 */
export const HITOS = [
  mezcla(MAQUINA.laton, CASA.bronce, 0.4),   // was gold 0xd9a441
  mezcla(mezcla(VERDES.verdin, VERDES.musgo, 0.4), CASA.bronce, 0.3), // was blue 0x5b8cc0 (verdigris with moss: the sky ambient pushes it to teal)
  mezcla(MAQUINA.cobre, CASA.bronce, 0.4),   // was red 0xc0605b
  mezcla(CASA.ceniza, CASA.bronce, 0.4),     // was green 0x6ea86a
] as const;

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
