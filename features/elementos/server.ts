// elementos — server part (H4/H8). The server decides who may place (api.puede "construir"), the zone's limit and the
// default names (a pond or a fire is named so screen readers say it; dust is decoration). Each element is a state
// entry with `at` (J9: only who is near gets it), saved (S4). A world may ship its elements (MUNDO_DIR/elementos.json,
// `numinia-engine/elementos@1`): they are placed once, when the zone has nothing saved yet.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg } from "../../packages/feature/src/index.ts";
import { elementos, ELEMENTOS_MAX, NOMBRES, TIPOS } from "./feature.ts";

type Tipo = (typeof TIPOS)[number];
const q = (v: unknown, paso: number) => Number((Math.round(Number(v) / paso) * paso).toFixed(2));
/** Round what the wire would round, so what is saved is what every page receives. */
const limpio = (m: Msg, tipo: Tipo): Msg => {
  const nombre = String(m.nombre ?? "").trim();
  return {
    tipo, x: q(m.x, 0.01), y: q(m.y, 0.01), z: q(m.z, 0.01), ancho: q(m.ancho, 0.1), largo: q(m.largo, 0.1), alto: q(m.alto, 0.1),
    tamano: q(m.tamano, 0.05), giro: q(m.giro, 0.1), color: Number(m.color), intensidad: q(m.intensidad, 0.01),
    nombre: nombre || NOMBRES[tipo],
  };
};

/** `mundo`: the world's elementos@1 ({ elementos: [...] }); placed only when the zone has nothing saved yet. */
export const crearElementos = (mundo?: unknown) => serverPart(elementos, (api) => {
  const rechazar = (from: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: from }); return false; };
  const puede = (from: number) => api.puede(from, "construir") || rechazar(from, "No puedes poner elementos: el mundo está cerrado a construir (lo abre quien lo administra).");
  const hecho = (from: number, id: string, accion: string) => api.emit("hecho", { id, accion }, { to: from });
  const nuevoId = () => { const n = Number(api.store.get("siguiente") ?? 1); api.store.set("siguiente", n + 1); return `e${n.toString(36)}`; };
  const poner = (id: string, v: Msg) => api.state.set(id, v, { at: { x: Number(v.x), z: Number(v.z) } });

  // the world's own elements, once (nothing saved and never numbered: a fresh zone)
  const lista = (mundo as { elementos?: unknown } | undefined)?.elementos;
  if (Array.isArray(lista) && api.state.keys().length === 0 && api.store.get("siguiente") === undefined) {
    let puestos = 0;
    for (const e of lista.slice(0, ELEMENTOS_MAX)) {
      const tipo = (e as Msg)?.tipo as Tipo;
      if (!TIPOS.includes(tipo)) { api.log(`elementos.json del mundo: tipo «${String(tipo)}» desconocido (hay: ${TIPOS.join(", ")})`); continue; }
      if (poner(nuevoId(), limpio({ ...defaults(), ...(e as Msg) }, tipo))) puestos++;
    }
    api.log(`elementos del mundo: ${puestos} puestos`);
  }

  const avisar = (e: number) => { api.emit("permiso", { construir: api.puede(e, "construir") }, { to: e }); };
  api.onJoin(avisar);
  api.onIdentify((e) => avisar(e));

  api.on("poner", (from, m) => {
    if (!puede(from)) return;
    if (api.state.keys().length >= ELEMENTOS_MAX) return void rechazar(from, `Esta zona ya tiene ${ELEMENTOS_MAX} elementos: quita alguno antes.`);
    const id = nuevoId();
    if (!poner(id, limpio(m, m.tipo as Tipo))) return void rechazar(from, "Ese elemento no cabe en el esquema (mira los rangos en el catálogo).");
    const w = api.who(from);
    api.store.set(`a:${id}`, { autor: w?.id ?? null, nombre: w?.nombre ?? null, cuando: new Date().toISOString() });
    hecho(from, id, "poner");
  });
  api.on("cambiar", (from, m) => {
    if (!puede(from)) return;
    const id = String(m.id), o = api.state.get(id);
    if (!o) return void rechazar(from, `No hay ningún elemento «${id}».`);
    poner(id, limpio({ ...m, nombre: m.nombre === undefined ? o.nombre : m.nombre }, o.tipo as Tipo));
    hecho(from, id, "cambiar");
  });
  api.on("quitar", (from, m) => {
    if (!puede(from)) return;
    const id = String(m.id);
    if (!api.state.get(id)) return void rechazar(from, `No hay ningún elemento «${id}».`);
    api.state.delete(id);
    api.store.delete(`a:${id}`);
    hecho(from, id, "quitar");
  });
});

/** Field defaults (what a world's file may leave out). */
export function defaults(): Msg {
  const out: Msg = {};
  for (const [k, f] of Object.entries(elementos.state!.fields)) if ((f as { default?: unknown }).default !== undefined) out[k] = (f as { default?: unknown }).default;
  return out;
}

export default crearElementos();
