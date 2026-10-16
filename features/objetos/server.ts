// objetos — server part (H1). The server decides everything: who may build (api.puede), that the model is in the
// library, the zone's limit, names for things that are not decoration, pinned things stay put. Every change is
// one state entry (no `at`: the whole zone gets it), saved as text (S4), and goes on the undo stack of whoever
// made it (by identity, I1; bots and agents without one by connection).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg } from "../../packages/feature/src/index.ts";
import { objetos, PASO, OBJETOS_MAX, DESHACER_MAX, TIPOS, EXTENSIONES } from "./feature.ts";
import type { Tipo } from "./feature.ts";
import biblioteca from "./biblioteca.json" with { type: "json" };

export type Modelo = { id: string; nombre: string; modelo: string; fichero: string; licencia: string };
type Autor = { autor: string | null; nombre: string | null; cuando: string };
type Cambio = { id: string; antes: Msg | null; autor?: Autor; tick: number; mover?: boolean };

/** Round to the wire's step and drop float noise, so what is saved is what every page receives. */
const q = (v: unknown, paso: number) => Number((Math.round(Number(v) / paso) * paso).toFixed(paso < 0.1 ? 2 : 1));
const girado = (g: number) => q(((((g + 180) % 360) + 360) % 360) - 180, PASO.grados);
const TICK_HZ = 20;
type Caja = [number, number, number, number, number, number]; // x0 y0 z0 x1 y1 z1

/** U10: the world box (axis-aligned) of a thing's own box after its scale, turn (YXZ, degrees) and position: what
 * `solido` collides with. Computed here once, so every page and the server's simulation get the same numbers. */
export function cajaEnMundo(o: Msg, c: Caja): Record<"bx0" | "by0" | "bz0" | "bx1" | "by1" | "bz1", number> {
  const R = Math.PI / 180, [ax, ay, az] = [Number(o.rx) * R, Number(o.ry) * R, Number(o.rz) * R];
  const [cx, sx_] = [Math.cos(ax), Math.sin(ax)], [cy, sy_] = [Math.cos(ay), Math.sin(ay)], [cz, sz_] = [Math.cos(az), Math.sin(az)];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    let x = (i & 1 ? c[3] : c[0]) * Number(o.sx), y = (i & 2 ? c[4] : c[1]) * Number(o.sy), z = (i & 4 ? c[5] : c[2]) * Number(o.sz);
    [x, y] = [x * cz - y * sz_, x * sz_ + y * cz];   // roll (z), then pitch (x), then yaw (y): three's "YXZ" order applied to a point
    [y, z] = [y * cx - z * sx_, y * sx_ + z * cx];
    [x, z] = [x * cy + z * sy_, -x * sy_ + z * cy];
    const p = [x + Number(o.x), y + Number(o.y), z + Number(o.z)];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }
  const r = (v: number) => q(Math.max(-2000, Math.min(2000, v)), PASO.pos);
  return { bx0: r(min[0]), by0: r(min[1]), bz0: r(min[2]), bx1: r(max[0]), by1: r(max[1]), bz1: r(max[2]) };
}

/** `modelos` only for tests; the real list is biblioteca.json. */
export const crearObjetos = (modelos: Modelo[] = biblioteca.modelos) => serverPart(objetos, (api) => {
  const enBiblioteca = new Map(modelos.map((m) => [m.modelo, m]));
  const pilas = new Map<string, Cambio[]>();
  const rehechos = new Map<string, Cambio[]>(); // M22: what each builder undid, ready to redo; a new change of theirs empties it
  const quien = (from: number) => api.who(from)?.id ?? `e${from}`;
  const rechazar = (from: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: from }); return false; };
  const hecho = (from: number, id: string, accion: string) => api.emit("hecho", { id, accion }, { to: from });
  const puede = (from: number) => api.puede(from, "construir") || rechazar(from, "No puedes construir aquí: el mundo está cerrado a construir (lo abre quien lo administra).");
  const objeto = (from: number, id: unknown) => {
    const o = api.state.get(String(id));
    if (!o) rechazar(from, `No hay ningún objeto «${String(id)}».`);
    return o;
  };
  const apuntar = (from: number, c: Omit<Cambio, "tick">) => {
    rehechos.delete(quien(from)); // M22: a new change ends what could be redone
    const pila = pilas.get(quien(from)) ?? [];
    const ultimo = pila[pila.length - 1], ahora = api.tick();
    // a drag sends many moves: within a second they are one change (undo goes back to before the drag)
    if (c.mover && ultimo?.mover && ultimo.id === c.id && ahora - ultimo.tick <= TICK_HZ) { ultimo.tick = ahora; return; }
    pila.push({ ...c, tick: ahora });
    if (pila.length > DESHACER_MAX) pila.shift();
    pilas.set(quien(from), pila);
  };
  const autorDe = (id: string) => api.store.get(`a:${id}`) as Autor | undefined;
  const firmar = (from: number, id: string) => {
    const w = api.who(from);
    api.store.set(`a:${id}`, { autor: w?.id ?? null, nombre: w?.nombre ?? null, cuando: new Date().toISOString() } satisfies Autor);
  };
  const nuevoId = () => {
    const n = Number(api.store.get("siguiente") ?? 1);
    api.store.set("siguiente", n + 1);
    return `o${n.toString(36)}`;
  };
  /** U10: a thing after a change of place, with its world box redone when it is solid (its own box is in the store). */
  const conCaja = (id: string, o: Msg): Msg => {
    const c = api.store.get(`c:${id}`) as Caja | undefined;
    return o.solido && c ? { ...o, ...cajaEnMundo(o, c) } : o;
  };
  const caben = (from: number) => api.state.keys().length < OBJETOS_MAX || rechazar(from, `Esta zona ya tiene ${OBJETOS_MAX} objetos: borra alguno antes.`);
  const sinNombre = (from: number, nombre: string, decorado: boolean) => !decorado && !nombre && !rechazar(from, "Si no es decorado, necesita un nombre: es lo que oye quien usa un lector de pantalla y lo que leen los agentes.");

  const avisar = (e: number) => { api.emit("permiso", { construir: api.puede(e, "construir") }, { to: e }); };
  api.onJoin(avisar);
  api.onIdentify((e) => avisar(e));
  api.listen("roles", "cambio", (m) => { avisar(Number(m.quien)); return true; }); // H3: a role given or taken

  api.on("colocar", (from, m) => {
    if (!puede(from) || !caben(from)) return;
    const modelo = String(m.modelo), nombre = String(m.nombre).trim(), decorado = m.decorado === true;
    const tipo = (TIPOS as readonly string[]).includes(String(m.tipo)) ? String(m.tipo) as Tipo : "modelo", ext = String(m.ext || "glb").toLowerCase();
    if (!EXTENSIONES[tipo].includes(ext)) return void rechazar(from, `Un ${tipo} es un fichero ${EXTENSIONES[tipo].map((e) => `.${e}`).join(", ")}; .${ext} no vale.`);
    if (!(tipo === "modelo" && enBiblioteca.has(modelo)) && !api.activo(modelo, ext)) return void rechazar(from, tipo === "modelo" ? "Ese modelo no está en la biblioteca ni se ha subido a este servidor." : `Ese fichero .${ext} no se ha subido a este servidor.`);
    if (sinNombre(from, nombre, decorado)) return;
    const id = nuevoId();
    api.state.set(id, {
      modelo, x: q(m.x, PASO.pos), y: q(m.y, PASO.pos), z: q(m.z, PASO.pos), rx: 0, ry: girado(Number(m.ry)), rz: 0,
      sx: tipo === "sonido" ? 3 : 1, sy: tipo === "sonido" ? 3 : 1, sz: tipo === "sonido" ? 3 : 1, nombre, decorado, fijado: false, animar: true,
      tipo, ext, oculto: false, volumen: 1, solido: false,
    });
    firmar(from, id);
    apuntar(from, { id, antes: null });
    hecho(from, id, "colocar");
  });

  api.on("mover", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (o.fijado) return void rechazar(from, "Está fijado: suéltalo antes de moverlo.");
    apuntar(from, { id, antes: o, mover: true });
    api.state.set(id, conCaja(id, {
      ...o, x: q(m.x, PASO.pos), y: q(m.y, PASO.pos), z: q(m.z, PASO.pos),
      rx: girado(Number(m.rx)), ry: girado(Number(m.ry)), rz: girado(Number(m.rz)),
      sx: q(m.sx, PASO.escala), sy: q(m.sy, PASO.escala), sz: q(m.sz, PASO.escala),
    }));
    hecho(from, id, "mover");
  });

  api.on("girar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (o.fijado) return void rechazar(from, "Está fijado: suéltalo antes de girarlo.");
    apuntar(from, { id, antes: o });
    api.state.set(id, conCaja(id, { ...o, ry: girado(Number(o.ry) + Number(m.grados)) }));
    hecho(from, id, "girar");
  });

  api.on("duplicar", (from, m) => {
    if (!puede(from) || !caben(from)) return;
    const o = objeto(from, m.id);
    if (!o) return;
    const id = nuevoId(), c = api.store.get(`c:${String(m.id)}`);
    if (c) api.store.set(`c:${id}`, c);
    api.state.set(id, conCaja(id, { ...o, x: q(Math.min(2000, Number(o.x) + 1), PASO.pos), fijado: false }));
    firmar(from, id);
    apuntar(from, { id, antes: null });
    hecho(from, id, "duplicar");
  });

  api.on("borrar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (o.fijado) return void rechazar(from, "Está fijado: suéltalo antes de borrarlo.");
    apuntar(from, { id, antes: o, autor: autorDe(id) });
    api.state.delete(id);
    api.store.delete(`a:${id}`);
    hecho(from, id, "borrar");
  });

  api.on("fijar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    apuntar(from, { id, antes: o });
    api.state.set(id, { ...o, fijado: m.fijado === true });
    hecho(from, id, "fijar");
  });

  api.on("nombrar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id), nombre = String(m.nombre).trim(), decorado = m.decorado === true;
    if (!o || sinNombre(from, nombre, decorado)) return;
    apuntar(from, { id, antes: o });
    api.state.set(id, { ...o, nombre, decorado });
    hecho(from, id, "nombrar");
  });

  // U10: hidden (spheres of sound), volume, and solid: the page measures the model's own box and sends it with solido
  api.on("ajustar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    const solido = m.solido === true;
    if (solido && o.tipo === "sonido") return void rechazar(from, "Una esfera de sonido no puede ser sólida: es una zona por la que se pasa.");
    if (solido) {
      const c: Caja = [m.bx0, m.by0, m.bz0, m.bx1, m.by1, m.bz1].map((v) => q(v, PASO.pos)) as Caja;
      if (c[3] - c[0] > 0.01 && c[4] - c[1] > 0.01 && c[5] - c[2] > 0.01) api.store.set(`c:${id}`, c);
      else if (!api.store.get(`c:${id}`)) return void rechazar(from, "Para que sea sólido hace falta su caja: espera a que el modelo se vea y vuelve a marcarlo.");
    }
    apuntar(from, { id, antes: o });
    const alcance = ["burbuja", "zona", "todos"].includes(String(m.alcance)) ? String(m.alcance) : "burbuja";
    const n = { ...o, oculto: m.oculto === true, volumen: q(Math.max(0, Math.min(1, Number(m.volumen))), 0.01), solido, alcance, radio: q(Math.max(0.5, Math.min(200, Number(m.radio) || 8)), 0.1) };
    api.state.set(id, solido ? conCaja(id, n) : { ...n, bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0 });
    hecho(from, id, "ajustar");
  });

  // M22: undo and redo put a thing back as it was (or take it away) and leave the opposite on the other stack.
  // A pinned thing stays put for them too, unless what is undone or redone is the pin itself (or its name).
  const DONDE_CAMPOS = ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"];
  const fijadoImpide = (ahora: Msg | undefined, destino: Msg | null) => !!ahora?.fijado && (destino === null || DONDE_CAMPOS.some((k) => ahora[k] !== destino[k]));
  const volver = (from: number, de: Map<string, Cambio[]>, a: Map<string, Cambio[]>, accion: "deshacer" | "rehacer") => {
    if (!puede(from)) return;
    const k = quien(from), pila = de.get(k), c = pila?.pop();
    if (!c) return void rechazar(from, `No hay nada tuyo que ${accion}.`);
    const ahora = api.state.get(c.id);
    if (fijadoImpide(ahora, c.antes)) { pila!.push(c); return void rechazar(from, `Está fijado: suéltalo antes de ${accion}.`); }
    const otra = a.get(k) ?? [];
    otra.push({ id: c.id, antes: ahora ?? null, autor: ahora ? autorDe(c.id) : undefined, tick: api.tick() });
    if (otra.length > DESHACER_MAX) otra.shift();
    a.set(k, otra);
    if (c.antes === null) { api.state.delete(c.id); api.store.delete(`a:${c.id}`); }
    else { api.state.set(c.id, c.antes); if (c.autor) api.store.set(`a:${c.id}`, c.autor); }
    hecho(from, c.id, accion);
  };
  api.on("deshacer", (from) => volver(from, pilas, rehechos, "deshacer"));
  api.on("rehacer", (from) => volver(from, rehechos, pilas, "rehacer"));
});

export default crearObjetos();
