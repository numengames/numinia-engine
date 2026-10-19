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

// R6.7
/**
 * R6.7 · Fauna biomecánica en el idioma de la casa (las láminas de Pablo): ojos = dos lentes turquesa con aro de latón (las gafas de los
 * personajes); alas de mariposa con marco de latón/cobre y relleno hondo (ámbar, grana, turquesa profundo, verdemar, latón), nunca pastel;
 * luciérnagas = lágrimas de cristal con alma de color (Lágrimas Errantes). El tinte épico sale de la Épica de la escala de rareza, lejos del coral.
 */
export const FAUNA_R67 = {
  /** Lente del ojo y su brillo central; el aro es latón. */
  ojoLente: CASA.turquesa, ojoBrillo: CASA.verdemar, ojoAro: MAQUINA.laton,
  /** Cáscara de la lágrima de cristal: verdemar del cristal templado con arena (se suma a la noche, nunca blanco puro). */
  cristal: mezcla(MAQUINA.cristal, CASA.arena, 0.25),
  /** Nervios de latón de la lágrima (épicas y legendarias). */
  nervio: mezcla(MAQUINA.laton, CASA.ambar, 0.35),
  /** Oro de las legendarias (cuerpo y marco). */
  oro: mezcla(MAQUINA.laton, CASA.ambar, 0.6),
  /** Épica de fauna: la Épica tirando a grana (orquídea), bien lejos del coral y de la Épica pura. */
  epicaOrquidea: mezcla(RAREZA.epica, CASA.grana, 0.4),
} as const;

type ColoresBicho = { cuerpo: number; ala: number; luz: number; circuito: number };
const cuerpoDe = { comun: CASA.bronce, comunHierro: MAQUINA.hierro, comunCeniza: CASA.ceniza, rara: MAQUINA.laton, epica: MAQUINA.cobre, legendaria: FAUNA_R67.oro } as const;
/** Cáscara (ala) y filamento (circuito) de las luciérnagas por rareza: no se dibujan, pero la tabla los guarda (sonido, fichas). */
const cascara = { comun: mezcla(CASA.bronce, CASA.ceniza, 0.35), rara: mezcla(RAREZA.rara, CASA.bronce, 0.55), epica: mezcla(MAQUINA.cobre, RAREZA.epica, 0.3), legendaria: mezcla(CASA.arena, CASA.ambar, 0.4) } as const;
/**
 * R6.7 · Colores de las 12 mariposas y las 12 luciérnagas de la casa. `features/naturaleza/fauna.json` los copia en hex (un JSON no
 * importa TS); el test `naturaleza-r6-7` exige que coincidan, así ningún color de esas dos familias es un hex suelto.
 */
export const COLORES_FAUNA: Record<string, ColoresBicho> = {
  // mariposas · comunes (cuerpo oscuro): relleno hondo
  "mariposa-rele": { cuerpo: cuerpoDe.comun, ala: CASA.turquesaProfundo, luz: mezcla(CASA.turquesa, CASA.verdemar, 0.2), circuito: VERDES.verdin },
  "mariposa-bobina": { cuerpo: cuerpoDe.comun, ala: mezcla(MAQUINA.cobre, CASA.grana, 0.3), luz: CASA.ambar, circuito: MAQUINA.cobre },
  "mariposa-laton": { cuerpo: cuerpoDe.comunHierro, ala: MAQUINA.laton, luz: mezcla(CASA.ambar, CASA.arena, 0.25), circuito: CASA.ambarTostado },
  "mariposa-lente": { cuerpo: cuerpoDe.comunCeniza, ala: mezcla(CASA.verdemar, CASA.turquesaProfundo, 0.4), luz: CASA.verdemar, circuito: CASA.turquesa },
  "mariposa-engranaje": { cuerpo: cuerpoDe.comunHierro, ala: mezcla(CASA.grana, CASA.bronce, 0.3), luz: CASA.coral, circuito: CASA.grana },
  // raras (cuerpo latón)
  "mariposa-valvula": { cuerpo: cuerpoDe.rara, ala: mezcla(RAREZA.rara, CASA.turquesaProfundo, 0.35), luz: mezcla(RAREZA.rara, CASA.arena, 0.3), circuito: CASA.turquesaProfundo },
  "mariposa-verdin": { cuerpo: cuerpoDe.rara, ala: mezcla(VERDES.verdin, CASA.verdemar, 0.3), luz: mezcla(CASA.verdemar, VERDES.verdin, 0.3), circuito: VERDES.verdin },
  "mariposa-filamento": { cuerpo: cuerpoDe.rara, ala: CASA.ambar, luz: mezcla(CASA.ambar, CASA.coral, 0.25), circuito: mezcla(CASA.ambar, MAQUINA.cobre, 0.4) },
  // épicas (cuerpo cobre): la Épica de la escala
  "mariposa-condensador": { cuerpo: cuerpoDe.epica, ala: FAUNA_R67.epicaOrquidea, luz: RAREZA.epica, circuito: mezcla(RAREZA.epica, CASA.bronce, 0.4) },
  "mariposa-cuarzo": { cuerpo: cuerpoDe.epica, ala: RAREZA.epica, luz: mezcla(RAREZA.epica, CASA.arena, 0.45), circuito: mezcla(RAREZA.epica, MAQUINA.cobre, 0.3) },
  // legendarias (cuerpo de oro)
  "mariposa-aurora": { cuerpo: cuerpoDe.legendaria, ala: mezcla(CASA.ambar, CASA.grana, 0.3), luz: mezcla(CASA.ambar, CASA.arena, 0.45), circuito: CASA.ambar },
  "mariposa-gnomon": { cuerpo: cuerpoDe.legendaria, ala: mezcla(CASA.turquesaProfundo, CASA.noche, 0.35), luz: mezcla(CASA.ambar, CASA.arena, 0.45), circuito: CASA.ambar },
  // luciérnagas: la luz es el alma de la lágrima
  "luciernaga-ambar": { cuerpo: cuerpoDe.comun, ala: cascara.comun, luz: CASA.ambar, circuito: mezcla(CASA.ambar, CASA.bronce, 0.4) },
  "luciernaga-arena": { cuerpo: cuerpoDe.comun, ala: cascara.comun, luz: mezcla(CASA.arena, CASA.ambar, 0.2), circuito: mezcla(CASA.arena, CASA.bronce, 0.4) },
  "luciernaga-verde": { cuerpo: cuerpoDe.comun, ala: cascara.comun, luz: CASA.verde, circuito: mezcla(CASA.verde, CASA.bronce, 0.4) },
  "luciernaga-verdemar": { cuerpo: cuerpoDe.comun, ala: cascara.comun, luz: CASA.verdemar, circuito: mezcla(CASA.verdemar, CASA.bronce, 0.4) },
  "luciernaga-cristal": { cuerpo: cuerpoDe.rara, ala: cascara.rara, luz: RAREZA.rara, circuito: mezcla(RAREZA.rara, CASA.bronce, 0.4) },
  "luciernaga-turquesa": { cuerpo: cuerpoDe.rara, ala: cascara.rara, luz: mezcla(CASA.turquesa, CASA.verdemar, 0.1), circuito: mezcla(CASA.turquesa, CASA.bronce, 0.3) },
  "luciernaga-coral": { cuerpo: cuerpoDe.rara, ala: cascara.rara, luz: CASA.coral, circuito: mezcla(CASA.coral, CASA.bronce, 0.4) },
  "luciernaga-verdin": { cuerpo: cuerpoDe.rara, ala: cascara.rara, luz: mezcla(VERDES.verdin, CASA.verde, 0.5), circuito: mezcla(VERDES.verdin, CASA.bronce, 0.3) },
  "luciernaga-amatista": { cuerpo: cuerpoDe.epica, ala: cascara.epica, luz: RAREZA.epica, circuito: mezcla(RAREZA.epica, CASA.bronce, 0.4) },
  "luciernaga-rele": { cuerpo: cuerpoDe.epica, ala: cascara.epica, luz: FAUNA_R67.epicaOrquidea, circuito: mezcla(FAUNA_R67.epicaOrquidea, CASA.bronce, 0.4) },
  "luciernaga-brasa": { cuerpo: cuerpoDe.legendaria, ala: cascara.legendaria, luz: mezcla(CASA.ambar, CASA.coral, 0.4), circuito: CASA.ambar },
  "luciernaga-prisma": { cuerpo: cuerpoDe.legendaria, ala: cascara.legendaria, luz: mezcla(CASA.ambar, CASA.arena, 0.45), circuito: CASA.ambar },
};

// R6.6
/**
 * R6.6 · Pátina de los Residuos (residuos.ts): latón vivo en lo que sobresale, cuerpo de latón viejo (o cobre), verdín claro en lo que
 * mira al cielo y en las juntas, oscuro en lo enterrado. Mezclas de tokens, ningún hex nuevo.
 */
export const PATINA = {
  latonVivo: mezcla(MAQUINA.laton, CASA.ambar, 0.3),
  cuerpo: mezcla(MAQUINA.laton, MAQUINA.latonSombra, 0.4),
  cobre: mezcla(MAQUINA.cobre, CASA.ambar, 0.15),
  verdin: mezcla(VERDES.verdin, CASA.verdemar, 0.45),
  enterrado: mezcla(CASA.bronceOscuro, VERDES.monteSombra, 0.35),
} as const;

// R6.5
/**
 * R6.5 · Flora menor del lore (flora.ts): cactus fósil del páramo de antracita (piedra clara petrificada con velo salvia, surcos ceniza, anillos de latón),
 * espinas vítreas (verdemar/cristal, alma turquesa profunda abajo, punta clara), brezo de luto (verde monte casi negro, copa y espigas grana empolvada),
 * matas de azafrán seco (ámbar sobre ámbar tostado) y cardos (tallo ceniza-salvia, cabeza grana empolvada, púas arena velada). Solo mezclas de tokens.
 */
export const FLORA = {
  cactus: mezcla(CASA.arenaVelada, VERDES.hierbaLuz, 0.35),
  cactusSurco: mezcla(CASA.ceniza, VERDES.hierbaSombra, 0.4),
  cactusLuz: mezcla(CASA.arena, VERDES.hierbaLuz, 0.25),
  espina: MAQUINA.cristal,
  espinaHondo: mezcla(CASA.verdemar, CASA.turquesaProfundo, 0.35),
  espinaPunta: mezcla(CASA.verdemar, CASA.arena, 0.55),
  brezo: mezcla(VERDES.monteSombra, CASA.noche, 0.3),
  brezoLuz: mezcla(mezcla(CASA.grana, CASA.ceniza, 0.45), CASA.arena, 0.15),
  azafran: mezcla(CASA.ambar, CASA.ambarTostado, 0.2),
  azafranSeco: mezcla(CASA.ambarTostado, CASA.bronce, 0.25),
  cardoTallo: mezcla(CASA.ceniza, VERDES.hierbaSombra, 0.35),
  cardoFlor: mezcla(CASA.grana, CASA.ceniza, 0.3),
  cardoPua: CASA.arenaVelada,
} as const;

// R7.1
/**
 * R7.1 · Cielo y niebla de la naturaleza (entorno.ts `atmosfera`): un cielo de cuatro paradas (cenit, alto, horizonte, suelo) que la
 * niebla COMPARTE, así lo lejano se funde con el cielo que tiene detrás (rampa de Firewatch, Alisavakis; capas de Sable). De día: cenit
 * azul verdoso apagado (Rara con Turquesa profundo, velado de Ceniza), alto verdemar, horizonte de pergamino (Arena con Arena velada y un
 * soplo de Verdemar), y por debajo del horizonte la bruma de arena y ceniza. Velo = la niebla a media distancia (pergamino tostado: dorado
 * en el páramo, claro en el jardín). Bruma = la niebla de altura en las hondonadas y junto al agua (verdemar con verdín y musgo). Ocaso =
 * la banda cálida del horizonte con el sol bajo; sol = su halo. Noche: jardín cálido (negros pardos, un hilo de turquesa profundo arriba).
 * Solo mezclas de tokens, ningún hex nuevo.
 */
export const ATMOSFERA = {
  dia: {
    cenit: mezcla(mezcla(RAREZA.rara, CASA.turquesaProfundo, 0.35), CASA.ceniza, 0.22),
    alto: mezcla(mezcla(mezcla(RAREZA.rara, CASA.turquesaProfundo, 0.35), CASA.verdemar, 0.55), CASA.arena, 0.15),
    horizonte: mezcla(mezcla(CASA.arena, CASA.arenaVelada, 0.35), CASA.verdemar, 0.2),
    suelo: mezcla(CASA.arenaVelada, CASA.ceniza, 0.35),
  },
  noche: {
    cenit: mezcla(CASA.noche, CASA.turquesaProfundo, 0.1),
    alto: mezcla(CASA.noche, CASA.turquesaProfundo, 0.18),
    horizonte: mezcla(NOCHE.sombra, CASA.ceniza, 0.25),
    suelo: NOCHE.sombra,
  },
  velo: mezcla(mezcla(CASA.arenaVelada, CASA.arena, 0.5), CASA.ambar, 0.12),
  bruma: mezcla(mezcla(CASA.verdemar, VERDES.verdin, 0.35), VERDES.musgo, 0.25),
  ocaso: mezcla(CASA.ambar, CASA.arena, 0.45),
  sol: mezcla(CASA.arena, CASA.ambar, 0.3),
} as const;

// R7.2
/**
 * R7.2 · Suelo sin facetas (terreno.ts `nodoSuelo`): los tonos hacia los que el ruido macro (manchas secas / manchas sanas) y la
 * pendiente (roca y tierra al aire) llevan el color de cada zona. Cada par tiene su versión de páramo (oscuro y dorado) y su versión
 * clara (jardín de pergamino y franja del agua); el shader elige por la luminancia del color base. Solo mezclas de tokens.
 */
export const SUELO_R72 = {
  /** Mancha seca: paja del jardín; en el páramo, costra dorada. */
  seco: FRANJAS.jardin.paja, secoParamo: FRANJAS.paramo.costra,
  /** Mancha sana / húmeda: sombra de olivo; en el páramo, grieta de basalto. */
  sano: mezcla(FRANJAS.jardin.olivo, VERDES.hierbaSombra, 0.45), sanoParamo: FRANJAS.paramo.grieta,
  /** Roca y tierra al aire en las caras empinadas: ceniza cálida con bronce; en el páramo, basalto. */
  roca: mezcla(mezcla(CASA.ceniza, CASA.bronce, 0.3), CASA.ambarTostado, 0.12), rocaParamo: FRANJAS.paramo.basalto,
} as const;

// E04
/**
 * E04 · Cielo analítico (cielo-analitico.ts; AC3 + AC9). Encargo: especificación «Entornos naturales» v0.1.0 §Cielo — amplio, claro y
 * luminoso; azules que se deslizan a turquesa pálido, marfil cálido y nácar; horizonte con gradación limpia; fantasía medida (halo prismático,
 * constelaciones apenas perceptibles de día); amanecer/día/crepúsculo/noche legibles. Las paradas `dia`/`noche` sustituyen a las de
 * ATMOSFERA SOLO con el cielo analítico (entorno.ts las mezcla por la hora y la niebla lejana toma el mismo color). La noche sigue siendo
 * jardín cálido (DIRECCION-ARTE), con el cénit un punto más azul para que se lean estrellas y luna. Solo mezclas de tokens, ningún hex nuevo.
 */
export const CIELO_E04 = {
  dia: {
    /** Cénit: azul claro de la Rara llevado a turquesa y aclarado con Verdemar (luminoso, no el azul físico saturado). */
    cenit: mezcla(mezcla(RAREZA.rara, CASA.turquesa, 0.25), CASA.verdemar, 0.3),
    /** Cielo alto: turquesa pálido. */
    alto: mezcla(mezcla(CASA.verdemar, RAREZA.rara, 0.2), CASA.arena, 0.12),
    /** Horizonte: marfil cálido con un velo de Verdemar (nácar). */
    horizonte: mezcla(mezcla(CASA.arena, CASA.verdemar, 0.16), CASA.arenaVelada, 0.12),
    /** Bajo el horizonte: la bruma del suelo, arena velada fresca. */
    suelo: mezcla(CASA.arenaVelada, CASA.verdemar, 0.2),
  },
  noche: {
    cenit: mezcla(CASA.noche, mezcla(RAREZA.rara, CASA.turquesaProfundo, 0.5), 0.13),
    alto: mezcla(CASA.noche, CASA.turquesaProfundo, 0.2),
    horizonte: mezcla(mezcla(NOCHE.sombra, CASA.turquesaProfundo, 0.12), CASA.ceniza, 0.22),
    suelo: NOCHE.sombra,
  },
  /** La banda de nácar del horizonte: fría (lejos del sol: perla con un punto de Épica y Verdemar) y cálida (hacia el sol: marfil). */
  nacarFrio: mezcla(mezcla(CASA.arena, RAREZA.epica, 0.14), CASA.verdemar, 0.2),
  marfilCalido: mezcla(CASA.arena, CASA.ambar, 0.14),
  /** Amanecer y ocaso: ámbar con un punto de coral, templado con arena. */
  ocaso: mezcla(mezcla(CASA.ambar, CASA.coral, 0.25), CASA.arena, 0.35),
  /** Sol (disco y resplandor). */
  sol: mezcla(CASA.arena, CASA.ambar, 0.25),
  /** Halo prismático de 22°: por dentro coral-ámbar, en medio verdemar, por fuera la Épica (orden de colores de un halo real). */
  haloDentro: mezcla(CASA.coral, CASA.ambar, 0.55), haloMedio: CASA.verdemar, haloFuera: RAREZA.epica,
  /** Estrellas (arena con verdemar) y luna (la luna de NOCHE aclarada con arena). */
  estrella: mezcla(CASA.arena, CASA.verdemar, 0.25),
  luna: mezcla(NOCHE.luna, CASA.arena, 0.6),
} as const;
