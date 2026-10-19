// teletransporte — declaration (N16). «Ir con quien está conectado ahora» (Pablo, 17-10, camino A: presence of NOW, no
// account, no saved friends list — that waits for the identity decision) and, when the world allows it, appearing at
// the place a photo's link names (N13 `#foto=`). The server decides everything: same world (this instance), a free spot
// next to them with no solid in it (the instance's `sitioLibre`), at most one trip every ESPERA_S, and the world's owners
// and whoever directs (STD-052 manage-organization / manage-rituals) may switch it off. Each person may also not let
// themselves be found. The light that takes you and leaves you (three variants at random, the same for everyone who sees
// it) is the page's: packages/render/src/teletransporte.ts. Design: mmo-browser-study/RELOJ-CRISTAL-TELETRANSPORTE.md §4–5.
import { defineFeature } from "../../packages/feature/src/index.ts";
import { fnv1a, hex } from "../../packages/core/src/index.ts";

/** Seconds between two trips of the same person (a photo's arrival does not count). */
export const ESPERA_S = 10;
/** Ticks (20 per second) between the light taking you and you standing at the other side: 0.6 s, the effect's peak. */
export const DESMATERIALIZAR_TICKS = 12;
/** A photo's place is only for arriving: the page may ask it once, in the first seconds after entering. */
export const FOTO_VENTANA_S = 30;
/** Rings (metres) tried around the person you go to: never on top of them. */
export const JUNTO_M: readonly number[] = [1.2, 2, 3];
/** Rings tried around a photo's place (0 = the place itself). */
export const FOTO_M: readonly number[] = [0, 0.75, 1.5, 2.5];
/** How far under the photo's pivot (its camera's point, a little over the ground) a floor may be. */
export const FOTO_CAIDA_M = 3;
/** Most people one «Gente» answer lists (the rest are counted). */
export const GENTE_MAX = 100;
/** How many looks the light has (variante 0-2: collapses to the middle, a beam upward, digital blocks). */
export const VARIANTES = 3;
/** Reach of the light's events: whoever is this near sees someone leave or arrive. */
export const VER_M = 48;
export const NOMBRE_MAX = 64;
/** ux2-gente: a tag of someone's identity a page may keep (the friends list in the browser, apps/plaza/amigos.ts): the
 * same for the same person on every visit and in every world, and the identity itself cannot be read back from it
 * (two FNV-1a of it, 64 bits, 16 hex characters). Pure. */
export function huellaDe(id: string): string {
  const b = new TextEncoder().encode(id);
  return hex(fnv1a(b)) + hex(fnv1a(b, 0x9e3779b9));
}
export const HUELLA = { kind: "text", maxBytes: 16 } as const;
/** The state's only key: what this world allows. */
export const MUNDO = "mundo";

const quien = { kind: "int", min: 0, max: 65535 } as const;
const XZ = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -500, max: 500, step: 0.01 } as const;
const NOMBRE = { kind: "text", maxBytes: NOMBRE_MAX } as const;
const TEXTO = { kind: "text", maxBytes: 240 } as const;
const VARIANTE = { kind: "int", min: 0, max: VARIANTES - 1 } as const;

export const teletransporte = defineFeature({
  id: "teletransporte",
  version: 1,
  level: "base",
  describe: "Ir junto a alguien conectado ahora en este mundo (panel «Gente» o /ir <nombre>), ir a un sitio marcado en el mapa (elegirlo y pulsar «Ir») y, si el mundo lo deja, aparecer donde se hizo una foto al abrir su enlace. El servidor decide: mismo mundo, un sitio libre sin sólidos, como mucho un viaje cada 10 s. Los dueños y quien dirige pueden apagarlo (/teletransporte no); cada persona puede no dejarse encontrar (/encontrable no).",
  state: {
    describe: "Una entrada, «mundo»: si aquí se puede ir junto a otros (activo) y si el mundo deja aparecer en el sitio de una foto (foto: entorno.json `aparicionFoto`, apagado si no lo dice).",
    fields: { activo: { kind: "bool" }, foto: { kind: "bool" } },
  },
  intents: {
    ir: { describe: "Ir junto a alguien conectado ahora (su número, de la lista de «Gente»). Te lleva la luz y apareces a su lado.", spoken: "ir junto a alguien", fields: { quien }, rate: { perSecond: 1, burst: 2 } },
    gente: { describe: "Pedir la lista de quién está conectado ahora en este mundo (llega como «persona», una por mensaje).", spoken: "ver quién está conectado", fields: {}, rate: { perSecond: 0.5, burst: 3 } },
    encontrable: { describe: "Dejarte encontrar (sí) o no: si no, nadie puede ir junto a ti y no sales en su lista.", spoken: "dejarte encontrar o no", fields: { si: { kind: "bool" } }, rate: { perSecond: 1, burst: 3 } },
    foto: { describe: "Aparecer en el sitio de una foto al entrar por su enlace: solo si el mundo lo deja, una vez y en los primeros 30 s.", spoken: "aparecer donde se hizo la foto", fields: { x: XZ, y: Y, z: XZ }, rate: { perSecond: 0.2, burst: 1 } },
    punto: { describe: "Ir a un sitio marcado en el mapa (su x, z): te lleva la luz y apareces allí, en tu propia altura. Como mucho un viaje cada 10 s.", spoken: "ir a un sitio del mapa", fields: { x: XZ, z: XZ, nombre: NOMBRE }, rate: { perSecond: 0.5, burst: 3 } },
    permitir: { describe: "Encender o apagar el ir junto a otros en este mundo. Solo los dueños, la administración y quien dirige.", spoken: "permitir o no ir junto a otros", fields: { si: { kind: "bool" } }, rate: { perSecond: 1, burst: 3 } },
  },
  events: {
    persona: { describe: "Alguien conectado ahora (respuesta a «gente», una por mensaje, n desde 0 hasta total-1; total 0 = no hay nadie más). huella: una marca de su identidad, la misma en cada visita y en cada mundo, de la que no se saca la identidad (para la lista de amigos que la página guarda).", fields: { quien, nombre: NOMBRE, n: { kind: "int", min: 0, max: 255 }, total: { kind: "int", min: 0, max: 255 }, todos: { kind: "int", min: 0, max: 65535 }, huella: HUELLA }, announce: "silent" },
    sale: { describe: "Alguien se va en un haz de luz desde aquí (variante del efecto, la misma para todos los que miran).", fields: { quien, nombre: NOMBRE, x: XZ, y: Y, z: XZ, variante: VARIANTE }, announce: { text: "{nombre} se va en un haz de luz", sound: "magia", importance: 0 } },
    llega: { describe: "Alguien aparece aquí en un haz de luz (o vuelve a donde estaba si no pudo ir).", fields: { quien, nombre: NOMBRE, x: XZ, y: Y, z: XZ, variante: VARIANTE }, announce: { text: "{nombre} aparece en un haz de luz", sound: "magia", importance: 1 } },
    viaje: { describe: "Cómo fue tu viaje, o por qué no se hizo (solo para quien lo pidió).", fields: { ok: { kind: "bool" }, texto: TEXTO }, announce: { text: "{texto}", sound: "suave", importance: 1 } },
    permiso: { describe: "Si puedes encender o apagar el ir junto a otros aquí, y si te dejas encontrar (al entrar, al identificarte, al cambiar tus roles).", fields: { puede: { kind: "bool" }, encontrable: { kind: "bool" } }, announce: "silent" },
    // server-scope (never reaches a page): the chat answers an order typed there
    aviso: { describe: "Para el chat (solo en el servidor): la respuesta a /ir, /teletransporte o /encontrable, solo para quien la escribió.", fields: { quien: { kind: "int", min: 0, max: 1_000_000 }, texto: { kind: "text", maxBytes: 300 } }, announce: "silent" },
  },
  store: { describe: "Si el mundo deja ir junto a otros (lo cambian dueños y quien dirige) y quién no se deja encontrar (por su identidad)." },
});
