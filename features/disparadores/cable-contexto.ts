// cable-contexto — what the blanks of a cable sentence may choose (D-041, historia C «cable sin JSON»). PURE: it turns
// the lists the page already holds (placed things, movers, the player's quest book, the sound table) into plain
// {valor, texto} options. It decides nothing about validity: the server does, on save. Kept apart from the page so an
// agent (historia D) can build the same options from the same lists.
import type { ContextoCable, Opcion } from "./cable-huecos.ts";

export type FuentesCable = {
  objetos: readonly { id: string; nombre?: unknown; oculto?: unknown }[];
  movedores: readonly { id: string; nombre?: unknown }[];
  misiones: readonly { id: string; titulo?: unknown }[];
  /** `GET /sonidos.json`: the seven house notices (name → id) and the ids with their bus. */
  sonidos: { casa?: Record<string, string>; sonidos?: Record<string, { bus?: string; bucle?: boolean }> } | null | undefined;
};

const sinRepetir = (l: Opcion[]): Opcion[] => { const vistos = new Set<string>(); return l.filter((o) => (vistos.has(o.valor) ? false : (vistos.add(o.valor), true))); };
const texto = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function contextoDelCable(f: FuentesCable): ContextoCable {
  // a thing is named by its name when it has one (what a file written by hand uses), else by its id; both work on the server
  const objetos = sinRepetir(f.objetos.map((o) => { const n = texto(o.nombre); return n ? { valor: n, texto: n } : { valor: o.id, texto: o.id }; })
    .filter((o) => o.valor.length > 0 && new TextEncoder().encode(o.valor).length <= 60).sort((a, b) => a.texto.localeCompare(b.texto)));
  const movedores = sinRepetir(f.movedores.map((m) => ({ valor: m.id, texto: texto(m.nombre) ? `${texto(m.nombre)} (${m.id})` : m.id })));
  const misiones = sinRepetir(f.misiones.map((m) => ({ valor: m.id, texto: texto(m.titulo) ? `${texto(m.titulo)} (${m.id})` : m.id })));
  const casa = Object.keys(f.sonidos?.casa ?? {}).map((n) => ({ valor: n, texto: n }));
  // looping beds are not for a button; footsteps and the like are the body's own — keep sounds a cable can sensibly play
  const ids = Object.entries(f.sonidos?.sonidos ?? {}).filter(([, s]) => s.bucle !== true && s.bus !== "pasos-propios" && s.bus !== "ambiente").map(([id]) => ({ valor: id, texto: id })).sort((a, b) => a.valor.localeCompare(b.valor));
  return { objetos, movedores, misiones, sonidos: sinRepetir([...casa, ...ids]) };
}
