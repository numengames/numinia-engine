// ia (ia-visible S3) — the public card of every AI in the world, decided by the server. An AI is a player with an identity
// «ia-…» (an organization's AI with a numinia.com pass, an outside agent, an inhabitant); this feature publishes, for each one
// connected now, what everybody may know about it: its state (activa|dormida), who answers for it (D-084: the community and the
// person's name or, without one, the short wallet `0x12…ab` — never more), what it may do here (builds or not, from its roles) and
// whether its brain is listening (`atenta`, false until the bridge reports it, S12). The page only reads and draws it (nameplate,
// ring on the floor, «Gente», the card: S4–S7); it never decides. R-1: any world has it, nothing to switch on. An AI whose pass
// carries no `ia` block still has an entry (state + abilities, nobody listed as answering): it is an AI, the mark must always show.
// The roles feature (packages/server) says what it knows through its server-only event «ia»; people never have an entry.
import { defineFeature } from "../../packages/feature/src/index.ts";

export const ESTADOS = ["activa", "dormida"] as const;
export type Estado = (typeof ESTADOS)[number];
/** Bytes of the community's and the person's name (pase.ts RESPONDE_MAX = 40 characters, up to 4 bytes each). */
export const RESPONDE_BYTES = 160;
/** `0x12…ab` is 9 bytes; room for a little more. */
export const CARTERA_BYTES = 12;

const CAMPOS = {
  estado: { kind: "enum", values: ESTADOS, default: "activa" },
  comunidad: { kind: "text", maxBytes: RESPONDE_BYTES, default: "" },
  nombre: { kind: "text", maxBytes: RESPONDE_BYTES, default: "" },
  cartera: { kind: "text", maxBytes: CARTERA_BYTES, default: "" },
  construye: { kind: "bool", default: false },
  atenta: { kind: "bool", default: false },
} as const;

export const ia = defineFeature({
  id: "ia",
  version: 1,
  describe: "La ficha pública de cada IA conectada ahora: su estado (activa o dormida), quién responde por ella (la comunidad y el nombre de la persona o su cartera abreviada), qué puede hacer aquí y si su cerebro está atento. La decide el servidor; las páginas solo la leen para dibujar su marca de IA. Las personas no tienen ficha.",
  state: {
    describe: "Por entidad de IA conectada (clave = su entidad; desaparece al desconectar). estado = activa|dormida; comunidad y nombre = quién responde por ella (vacíos si el pase no lo dice); cartera = su forma corta 0x12…ab; construye = si sus roles la dejan construir ahora; atenta = si su cerebro escucha (falso hasta que el puente lo diga).",
    fields: CAMPOS,
  },
});

/** What a page reads about one AI. `responde` only when the world knows who answers; `oye` is not here: the pass does not say it. */
export type IAPublica = {
  estado: Estado;
  responde?: { comunidad: string; nombre?: string; cartera?: string };
  puede: { construir: boolean };
  atenta: boolean;
};

/** Pure: the state entry as the page reads it. Anything odd falls back to the safest reading (asleep never claims to build). */
export function publica(v: Readonly<Record<string, unknown>>): IAPublica {
  const estado: Estado = v.estado === "dormida" ? "dormida" : "activa";
  const comunidad = typeof v.comunidad === "string" ? v.comunidad : "", nombre = typeof v.nombre === "string" ? v.nombre : "", cartera = typeof v.cartera === "string" ? v.cartera : "";
  return {
    estado,
    ...(comunidad ? { responde: { comunidad, ...(nombre ? { nombre } : {}), ...(cartera ? { cartera } : {}) } } : {}),
    puede: { construir: v.construye === true && estado === "activa" },
    atenta: v.atenta === true,
  };
}
