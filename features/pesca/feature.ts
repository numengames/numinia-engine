// pesca — declaration (v1). A fishing spot is a thing of the world (state entry WITH `at`, a card and `interact`, like a
// quest thing): you stand by it, cast (lanzar), wait, something nibbles, it bites, and you fight it with ONE button
// (recoger: holding raises tension and brings the fish in; letting go lowers tension and lets it swim). The SERVER
// decides when it bites, which fish, and whether you land it; the page only asks (lanzar / recoger / soltar) and
// animates what the server tells. Design: biblioteca-motores/ESTUDIO/pieza--pesca.md §D; recipe: docs/EXTENDER.md.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Who receives a fishing spot (m): a pond is seen from afar. */
export const ALCANCE_M = 120;
/** Who sees the float and hears a splash (m). */
export const CERCA_M = 40;
/** Wait before the bite (s), inclusive bounds; tideline uses 4-13, Stardew 0.6-30. */
export const ESPERA_S: [number, number] = [3, 12];
/** Chance (0-1) of one warning nibble, and when (fraction of the wait) it happens. */
export const MORDISQUEO_P = 0.65, MORDISQUEO_EN = 0.45;
/** Base hook window (s) after the bite; multiplied by the fish's rarity (rare fish give less time). */
export const VENTANA_S = 1.2;
/** The fight, per second of server time (bridge-mind/tideline config.js `reel`, MIT; same numbers). */
export const PELEA = {
  tensionInicial: 18, progresoInicial: 8,
  tensionSube: 26,      // tension %/s while reeling (× fuerza)
  tensionBaja: 21,      // tension %/s recovered while resting
  progresoSube: 13.5,   // progress %/s while reeling (÷ heft)
  progresoBaja: 5.5,    // progress %/s lost while resting (× fuerza)
  arrancadaRecoger: 3.4, arrancadaDescanso: 7, // a surge multiplies tension gain when reeling; adds tension even at rest
  aviso: 0.75,          // the surge is telegraphed this long before (s)
  arrancadaDura: [1.1, 1.9] as [number, number],
  cansadoFactor: 0.62,  // a tired fish pulls this much
  gracia: 2.5,          // progress 0 cannot lose the fish before this (s)
  maximo: 55,           // the fish outlasts you after this (s)
} as const;
export const RAREZAS = ["comun", "rara", "legendaria"] as const;
/** Hook-window factor per rarity (tideline: common 1.15, legendary 0.78; ours keep the common fish at exactly VENTANA_S). */
export const VENTANA_POR_RAREZA: Record<(typeof RAREZAS)[number], number> = { comun: 1, rara: 0.9, legendaria: 0.75 };
export const MOTIVOS = ["tarde", "rota", "escapa", "agotado", "lejos", "desconectado"] as const;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const PEZ = { kind: "text", maxBytes: 40 } as const;
const CM = { kind: "fixed", min: 0, max: 500, step: 0.1 } as const;
const PCT = { kind: "int", min: 0, max: 100 } as const;

export const pesca = defineFeature({
  id: "pesca",
  version: 2, // v2: `fin` carries the fish (pez, cm, rareza) so whoever is near sees it in the angler's hand
  level: "base",
  describe: "Pescar en un sitio de pesca: lanzas la caña, esperas, algo mordisquea, pica y peleas con el sedal con un solo botón (recoger sube la tensión y acerca el pez; soltar la baja). El servidor decide cuándo pica, qué pez sale y si lo sacas; lo pescado se guarda por invitado.",
  store: { describe: "Por invitado (`c:<id>`): cuántos peces de cada clase ha sacado y el mayor (cm). Nunca va a las páginas; a su dueño le llega como evento `cesta`." },
  state: {
    describe: "Un sitio de pesca por clave: nombre, dónde (x, z; y = altura del agua, m), a qué distancia se lanza (radio, m) y si alguien pesca ahí ahora (ocupado).",
    fields: { nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X, radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 3 }, ocupado: { kind: "bool", default: false } },
    card: { role: "lugar", name: "{nombre}", description: "Sitio de pesca", at: ["x", "z"], actions: ["lanzar"], interact: { intent: "lanzar", prompt: "pescar", radius: "radio", key: "sitio" } },
    radius: ALCANCE_M,
  },
  intents: {
    lanzar: { describe: "Lanzar la caña en un sitio de pesca que tienes al lado (su radio). Luego espera: el servidor avisa del mordisqueo y de la picada.", spoken: "lanzar la caña", fields: { sitio: ID }, rate: { perSecond: 2, burst: 4 } },
    recoger: { describe: "Recoger el sedal (activo = true mientras se mantiene el botón, false al soltarlo). En la picada, recoger a tiempo engancha el pez; en la pelea, recoger sube la tensión y el progreso; descansar los baja.", spoken: "recoger el sedal", fields: { activo: { kind: "bool" } }, rate: { perSecond: 10, burst: 20 } },
    soltar: { describe: "Dejar de pescar: recoger la caña sin nada (también suelta el pez si estabas peleando).", spoken: "soltar la caña", fields: {}, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    lanzado: { describe: "Alguien cercano (o tú) ha lanzado la caña en un sitio: el flotador cae en x, y, z.", fields: { quien: QUIEN, sitio: ID, x: X, y: Y, z: X }, announce: { text: "Caña lanzada.", sound: "suave", importance: 0, who: "quien" } },
    mordisqueo: { describe: "Algo mordisquea tu cebo (aviso: aún no pica). Solo a ti.", fields: { sitio: ID }, announce: { text: "Algo mordisquea el cebo…", sound: "suave", importance: 1 } },
    picada: { describe: "¡Pica! Tienes `ventana` segundos para recoger. Solo a ti.", fields: { sitio: ID, ventana: { kind: "fixed", min: 0.1, max: 5, step: 0.01 } }, announce: { text: "¡Pica! Recoge ahora.", sound: "aviso", importance: 2 } },
    pelea: { describe: "Enganchaste un pez: empieza la pelea (fuerza = cuánto tira, 0-3). Solo a ti.", fields: { pez: PEZ, fuerza: { kind: "fixed", min: 0, max: 3, step: 0.01 } }, announce: { text: "¡Un pez tira del sedal! Recoge sin pasar de tensión.", sound: "magia", importance: 2 } },
    tension: { describe: "Cómo va la pelea, 10 veces por segundo: tensión del sedal (100 = se rompe), progreso (100 = lo sacas) y si el pez está dando una arrancada (o va a darla). Solo a ti.", fields: { tension: PCT, progreso: PCT, arrancada: { kind: "enum", values: ["no", "aviso", "si"] } }, announce: "silent" },
    captura: { describe: "Has pescado un pez: cuál, cuánto mide, su rareza y cuántos llevas en total. Solo a ti.", fields: { pez: PEZ, cm: CM, rareza: { kind: "enum", values: RAREZAS }, total: { kind: "int", min: 0, max: 100000 } }, announce: { text: "Has pescado: {pez} de {cm} cm.", sound: "exito", importance: 2 } },
    escape: { describe: "El pez se fue, y por qué (tarde = no recogiste a tiempo; rota = tensión 100; escapa = el progreso bajó a 0; agotado = la pelea duró demasiado; lejos = te alejaste). Solo a ti.", fields: { motivo: { kind: "enum", values: MOTIVOS }, texto: { kind: "text", maxBytes: 120 } }, announce: { text: "{texto}", sound: "error", importance: 1 } },
    recogida: { describe: "Recogiste la caña sin nada. Solo a ti.", fields: {}, announce: { text: "Has recogido la caña.", sound: "suave", importance: 0 } },
    fin: { describe: "Alguien cercano (o tú) dejó de pescar en un sitio: el flotador se quita. resultado = captura | escape | suelto; si fue captura, qué pez y cuánto mide (para verlo en su mano).", fields: { quien: QUIEN, sitio: ID, resultado: { kind: "enum", values: ["captura", "escape", "suelto"] }, pez: { ...PEZ, default: "" }, cm: { ...CM, default: 0 }, rareza: { kind: "enum", values: RAREZAS, default: "comun" } }, announce: "silent" },
    cesta: { describe: "Tu cesta (al entrar y tras cada captura): cuántos peces llevas, de cuántas clases, y el mayor. Solo a ti.", fields: { peces: { kind: "int", min: 0, max: 100000 }, clases: { kind: "int", min: 0, max: 64 }, mejor: { kind: "text", maxBytes: 40, default: "" }, mejorCm: { ...CM, default: 0 } }, announce: "silent" },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
