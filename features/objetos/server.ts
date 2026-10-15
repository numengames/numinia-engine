// objetos — server part (H1). The server decides everything: who may build (api.puede), that the model is in the
// library, the zone's limit, names for things that are not decoration, pinned things stay put. Every change is
// one state entry (no `at`: the whole zone gets it), saved as text (S4), and goes on the undo stack of whoever
// made it (by identity, I1; bots and agents without one by connection).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg } from "../../packages/feature/src/index.ts";
import { objetos, PASO, OBJETOS_MAX, DESHACER_MAX } from "./feature.ts";
import biblioteca from "./biblioteca.json" with { type: "json" };

export type Modelo = { id: string; nombre: string; modelo: string; fichero: string; licencia: string };
type Autor = { autor: string | null; nombre: string | null; cuando: string };
type Cambio = { id: string; antes: Msg | null; autor?: Autor; tick: number; mover?: boolean };

/** Round to the wire's step and drop float noise, so what is saved is what every page receives. */
const q = (v: unknown, paso: number) => Number((Math.round(Number(v) / paso) * paso).toFixed(paso < 0.1 ? 2 : 1));
const girado = (g: number) => q(((((g + 180) % 360) + 360) % 360) - 180, PASO.grados);
const TICK_HZ = 20;

/** `modelos` only for tests; the real list is biblioteca.json. */
export const crearObjetos = (modelos: Modelo[] = biblioteca.modelos) => serverPart(objetos, (api) => {
  const enBiblioteca = new Map(modelos.map((m) => [m.modelo, m]));
  const pilas = new Map<string, Cambio[]>();
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
  const caben = (from: number) => api.state.keys().length < OBJETOS_MAX || rechazar(from, `Esta zona ya tiene ${OBJETOS_MAX} objetos: borra alguno antes.`);
  const sinNombre = (from: number, nombre: string, decorado: boolean) => !decorado && !nombre && !rechazar(from, "Si no es decorado, necesita un nombre: es lo que oye quien usa un lector de pantalla y lo que leen los agentes.");

  const avisar = (e: number) => { api.emit("permiso", { construir: api.puede(e, "construir") }, { to: e }); };
  api.onJoin(avisar);
  api.onIdentify((e) => avisar(e));

  api.on("colocar", (from, m) => {
    if (!puede(from) || !caben(from)) return;
    const modelo = String(m.modelo), nombre = String(m.nombre).trim(), decorado = m.decorado === true;
    if (!enBiblioteca.has(modelo)) return void rechazar(from, "Ese modelo no está en la biblioteca.");
    if (sinNombre(from, nombre, decorado)) return;
    const id = nuevoId();
    api.state.set(id, {
      modelo, x: q(m.x, PASO.pos), y: q(m.y, PASO.pos), z: q(m.z, PASO.pos), rx: 0, ry: girado(Number(m.ry)), rz: 0,
      sx: 1, sy: 1, sz: 1, nombre, decorado, fijado: false, animar: true,
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
    api.state.set(id, {
      ...o, x: q(m.x, PASO.pos), y: q(m.y, PASO.pos), z: q(m.z, PASO.pos),
      rx: girado(Number(m.rx)), ry: girado(Number(m.ry)), rz: girado(Number(m.rz)),
      sx: q(m.sx, PASO.escala), sy: q(m.sy, PASO.escala), sz: q(m.sz, PASO.escala),
    });
    hecho(from, id, "mover");
  });

  api.on("girar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (o.fijado) return void rechazar(from, "Está fijado: suéltalo antes de girarlo.");
    apuntar(from, { id, antes: o });
    api.state.set(id, { ...o, ry: girado(Number(o.ry) + Number(m.grados)) });
    hecho(from, id, "girar");
  });

  api.on("duplicar", (from, m) => {
    if (!puede(from) || !caben(from)) return;
    const o = objeto(from, m.id);
    if (!o) return;
    const id = nuevoId();
    api.state.set(id, { ...o, x: q(Math.min(2000, Number(o.x) + 1), PASO.pos), fijado: false });
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

  api.on("deshacer", (from) => {
    if (!puede(from)) return;
    const c = pilas.get(quien(from))?.pop();
    if (!c) return void rechazar(from, "No hay nada tuyo que deshacer.");
    if (c.antes === null) { api.state.delete(c.id); api.store.delete(`a:${c.id}`); }
    else { api.state.set(c.id, c.antes); if (c.autor) api.store.set(`a:${c.id}`, c.autor); }
    hecho(from, c.id, "deshacer");
  });
});

export default crearObjetos();
