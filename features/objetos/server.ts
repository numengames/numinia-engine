// objetos — server part (H1). The server decides everything: who may build (api.puede), that the model is in the
// library, the zone's limit, names for things that are not decoration, pinned things stay put. Every change is
// one state entry (no `at`: the whole zone gets it), saved as text (S4), and goes on the undo stack of whoever
// made it (by identity, I1; bots and agents without one by connection).
// U12: holes (huecos). `hueco` makes a picture a frame that waits for a work (and keeps that picture as the card it
// goes back to), `rellenar` puts an uploaded image in it — the server measures its pixels (api.medidas, from the file,
// never from the page) and fits it whole, centred, never distorted — and `vaciar` brings the card back. They work on
// a pinned hole too: it stays where it is, only its picture changes.
import { serverPart, transformarPuntos } from "../../packages/feature/src/index.ts";
import type { Msg } from "../../packages/feature/src/index.ts";
import { objetos, PASO, OBJETOS_MAX, DESHACER_MAX, TIPOS, EXTENSIONES, HUECO_MIN_M, HUECO_PX_MAX, ESCALA_MIN, encajar, colisionDe, motivoEnlace } from "./feature.ts";
import type { Tipo, Colision } from "./feature.ts";
import biblioteca from "./biblioteca.json" with { type: "json" };
import { alturaEn } from "../../packages/relieve/src/relieve.ts";
import { alturaBase, SEMILLA_BASE_DEFECTO } from "../../packages/relieve/src/espacio-base.ts";

export type Modelo = { id: string; nombre: string; modelo: string; fichero: string; licencia: string };
type Autor = { autor: string | null; nombre: string | null; cuando: string };
/** M22c: one object's half of a change (what it was before, and who had touched it when it is a delete). */
type Item = { id: string; antes: Msg | null; autor?: Autor };
/** M22: a step on the undo stack. M22c: `items` can hold more than one object — a group action (move several,
 * delete several) tagged with the same `lote` folds into ONE entry, so deshacer/rehacer treats it as one step. */
type Cambio = { items: Item[]; tick: number; mover?: boolean; lote?: string };
/** U12: what a hole shows when it is empty (its card), kept when it became a hole. */
type Cartel = { modelo: string; ext: string; sx: number; sy: number; sz: number; nombre: string; decorado: boolean };
const esHueco = (o: Msg | undefined | null) => Number(o?.huecoAncho) > 0 && Number(o?.huecoAlto) > 0;

/** Round to the wire's step and drop float noise, so what is saved is what every page receives. */
const q = (v: unknown, paso: number) => Number((Math.round(Number(v) / paso) * paso).toFixed(paso < 0.1 ? 2 : 1));
const girado = (g: number) => q(((((g + 180) % 360) + 360) % 360) - 180, PASO.grados);
const TICK_HZ = 20;
type Caja = [number, number, number, number, number, number]; // x0 y0 z0 x1 y1 z1

/** U10: the world box (axis-aligned) of a thing's own box after its scale, turn (YXZ, degrees) and position: what
 * `solido` collides with. Computed here once, so every page and the server's simulation get the same numbers.
 * M6 h8: the rotation itself is `transformarPuntos` (packages/feature), shared with the server wiring that turns a
 * `malla` thing's .glb triangles into world space (R-1: one piece of maths, not two). */
export function cajaEnMundo(o: Msg, c: Caja): Record<"bx0" | "by0" | "bz0" | "bx1" | "by1" | "bz1", number> {
  const esquinas = new Float64Array(24);
  for (let i = 0; i < 8; i++) { esquinas[i * 3] = i & 1 ? c[3] : c[0]; esquinas[i * 3 + 1] = i & 2 ? c[4] : c[1]; esquinas[i * 3 + 2] = i & 4 ? c[5] : c[2]; }
  const p = transformarPuntos(esquinas, o);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i * 3 + k]); max[k] = Math.max(max[k], p[i * 3 + k]); }
  const r = (v: number) => q(Math.max(-2000, Math.min(2000, v)), PASO.pos);
  return { bx0: r(min[0]), by0: r(min[1]), bz0: r(min[2]), bx1: r(max[0]), by1: r(max[1]), bz1: r(max[2]) };
}

/** H5: a thing the world is born with (planted once, see `sembrar`). Same fields `colocar` would give it; `modelo` is a library id. */
export type Sembrado = { modelo: string; nombre: string; x: number; y: number; z: number; ry?: number; escala?: number; forma?: readonly [number, number, number] };

/** B4: the ground the shared states ask for, as the sim reads it (`terrenoDelEstado`, sim/terreno-malla.ts): the espacio base first (B1: it is the
 * ground of everything, the nature is paint over it), else the nature's own relief, else flat 0. `clave` changes exactly when the sim's terrain key does. */
type Suelo = { clave: string; altura: (x: number, z: number) => number };
const entero = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : def);
export function sueloDe(base: Msg | undefined, nat: Msg | undefined): Suelo {
  if (base && base.activa !== false) {
    const s = entero(base.semilla, 0, 2147483647, SEMILLA_BASE_DEFECTO);
    return { clave: `b${s}`, altura: (x, z) => alturaBase(s, x, z) };
  }
  if (nat && nat.activa !== false) {
    const s = entero(nat.semilla, 0, 2147483647, 1234), tamano = entero(nat.tamano, 100, 400, 200), plaza = entero(nat.plaza, 4, 40, 12), estanque = nat.estanque !== false;
    return { clave: `n${s}|${tamano}|${plaza}|${estanque ? 1 : 0}`, altura: (x, z) => alturaEn(s, x, z, { tamano, plaza, sinEstanque: !estanque }) };
  }
  return { clave: "plano", altura: () => 0 };
}

/** `modelos` only for tests; the real list is biblioteca.json. `sembrar` (H5, R-1: any world piece may ask for it): things planted ONCE, the first
 * time this world's objects start empty; after that the mark `sembrado` (in the store) says it was done, so a world that already had things of
 * its own, or whose builder deleted the planted one, never gets it back. They are ordinary things (move, delete, undo, rename all work). */
export const crearObjetos = (modelos: Modelo[] = biblioteca.modelos, sembrar: readonly Sembrado[] = [], alRestaurar: readonly Sembrado[] = []) => serverPart(objetos, (api) => {
  const enBiblioteca = new Map(modelos.map((m) => [m.modelo, m]));
  const pilas = new Map<string, Cambio[]>();
  const rehechos = new Map<string, Cambio[]>(); // M22: what each builder undid, ready to redo; a new change of theirs empties it
  // B4: each thing remembers its height ABOVE the ground (`s:<id>` in the store, never sent to pages), so when the ground changes it keeps that
  // height over the new one instead of its absolute y (floating or buried). A thing saved before this has none: it reads as 0 = sits on the ground.
  const sueloAhora = () => sueloDe(api.estadoDe("espacio-base").get("mundo"), api.estadoDe("naturaleza").get("mundo"));
  /** Save a thing's entry and how high it stands over the ground it is on now. */
  const guardar = (id: string, o: Msg) => {
    api.state.set(id, o);
    api.store.set(`s:${id}`, q(Number(o.y) - sueloAhora().altura(Number(o.x), Number(o.z)), PASO.pos));
  };
  const quien = (from: number) => api.who(from)?.id ?? `e${from}`;
  const rechazar = (from: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: from }); return false; };
  // T1: besides telling the author (`hecho`, to its page), say who did what to the server's own listeners (`hizo`, scope «server»:
  // features/misiones counts a builder's steps with it). `mueve`/`gira`/`escala` say what a `mover` really changed, `oculto` what an `ajustar` left.
  const hecho = (from: number, id: string, accion: string, extra: { mueve?: boolean; gira?: boolean; escala?: boolean; oculto?: boolean } = {}) => {
    api.emit("hecho", { id, accion }, { to: from });
    api.emit("hizo", { quien: from, id, accion, mueve: extra.mueve === true, gira: extra.gira === true, escala: extra.escala === true, oculto: extra.oculto === true }, "server");
  };
  const puede = (from: number) => api.puede(from, "construir") || rechazar(from, "No puedes construir aquí: el mundo está cerrado a construir (lo abre quien lo administra).");
  const objeto = (from: number, id: unknown) => {
    const o = api.state.get(String(id));
    if (!o) rechazar(from, `No hay ningún objeto «${String(id)}».`);
    return o;
  };
  const apuntar = (from: number, item: Item, opts: { mover?: boolean; lote?: string } = {}) => {
    rehechos.delete(quien(from)); // M22: a new change ends what could be redone
    const pila = pilas.get(quien(from)) ?? [];
    const ultimo = pila[pila.length - 1], ahora = api.tick();
    // M22c: a group action (move/delete/pin several at once) tags every message with the same `lote`; while the
    // tag is fresh (within a second) they all land on the one entry that started it, so undo takes them back together.
    if (opts.lote && ultimo?.lote === opts.lote && ahora - ultimo.tick <= TICK_HZ && !ultimo.items.some((it) => it.id === item.id)) {
      ultimo.items.push(item); ultimo.tick = ahora; return;
    }
    // a drag sends many moves: within a second they are one change (undo goes back to before the drag)
    if (opts.mover && !opts.lote && ultimo?.mover && !ultimo.lote && ultimo.items.length === 1 && ultimo.items[0].id === item.id && ahora - ultimo.tick <= TICK_HZ) { ultimo.tick = ahora; return; }
    pila.push({ items: [item], tick: ahora, mover: opts.mover, lote: opts.lote });
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

  // M6 (objetos v6): a thing saved before `colision` existed reads as `caja` when it was solid; written once so what
  // is saved says it too (the page and the simulation keep reading `solido`).
  for (const k of api.state.keys()) {
    const o = api.state.get(k);
    if (o && o.solido === true && colisionDe(o) !== String(o.colision)) api.state.set(k, { ...o, colision: colisionDe(o) });
  }

  /** Plant things as ordinary objects (H5 at birth, H8 `restaurar`). */
  const plantar = (lista: readonly Sembrado[]) => {
    for (const t of lista) {
      const m = modelos.find((x) => x.id === t.modelo);
      if (!m) { api.log(`[objetos] sembrar: «${t.modelo}» no está en la biblioteca (no pongo nada)`); continue; }
      const s = q(t.escala ?? 1, PASO.escala), f = t.forma ?? [1, 1, 1], id = nuevoId();
      guardar(id, {
        modelo: m.modelo, x: q(t.x, PASO.pos), y: q(t.y, PASO.pos), z: q(t.z, PASO.pos), rx: 0, ry: girado(t.ry ?? 0), rz: 0, sx: q(s * f[0], PASO.escala), sy: q(s * f[1], PASO.escala), sz: q(s * f[2], PASO.escala),
        nombre: t.nombre, decorado: false, fijado: false, animar: true, tipo: "modelo", ext: "glb", oculto: false, volumen: 1, solido: false, colision: "ninguna",
      });
      api.log(`[objetos] sembrado «${t.nombre}» (${id})`);
    }
  };
  if (sembrar.length > 0 && !api.store.get("sembrado")) {
    api.store.set("sembrado", true);
    if (api.state.keys().length === 0) plantar(sembrar);
  }

  const avisar = (e: number) => { api.emit("permiso", { construir: api.puede(e, "construir") }, { to: e }); };
  api.onJoin(avisar);
  api.onIdentify((e) => avisar(e));
  api.listen("roles", "cambio", (m) => { avisar(Number(m.quien)); return true; }); // H3: a role given or taken
  // D-041 (the cable): a receiver `muestra` / `oculta` names one of our things by id or by exact name; the world's own
  // file asked for it, so no builder permission is checked. `oculto` = not drawn while playing (seen while building).
  api.listen("disparadores", "accion", (m) => {
    if (m.accion !== "muestra" && m.accion !== "oculta") return false;
    const ref = String(m.objeto ?? ""), id = api.state.get(ref) ? ref : api.state.keys().find((k) => String(api.state.get(k)?.nombre ?? "") === ref);
    const o = id ? api.state.get(id) : undefined;
    if (!id || !o) { api.log(`[objetos] el cable pide ${m.accion} «${ref.slice(0, 60)}» y no hay tal objeto`); return true; }
    const oculto = m.accion === "oculta";
    if (o.oculto !== oculto) api.state.set(id, { ...o, oculto });
    return true;
  });

  api.on("colocar", (from, m) => {
    if (!puede(from) || !caben(from)) return;
    const modelo = String(m.modelo), nombre = String(m.nombre).trim(), decorado = m.decorado === true;
    const tipo = (TIPOS as readonly string[]).includes(String(m.tipo)) ? String(m.tipo) as Tipo : "modelo", ext = String(m.ext || "glb").toLowerCase();
    if (!EXTENSIONES[tipo].includes(ext)) return void rechazar(from, `Un ${tipo} es un fichero ${EXTENSIONES[tipo].map((e) => `.${e}`).join(", ")}; .${ext} no vale.`);
    if (!(tipo === "modelo" && enBiblioteca.has(modelo)) && !api.activo(modelo, ext)) return void rechazar(from, tipo === "modelo" ? "Ese modelo no está en la biblioteca ni se ha subido a este servidor." : `Ese fichero .${ext} no se ha subido a este servidor.`);
    if (sinNombre(from, nombre, decorado)) return;
    const id = nuevoId();
    guardar(id, {
      modelo, x: q(m.x, PASO.pos), y: q(m.y, PASO.pos), z: q(m.z, PASO.pos), rx: 0, ry: girado(Number(m.ry)), rz: 0,
      sx: tipo === "sonido" ? 3 : 1, sy: tipo === "sonido" ? 3 : 1, sz: tipo === "sonido" ? 3 : 1, nombre, decorado, fijado: false, animar: true,
      tipo, ext, oculto: false, volumen: 1, solido: false, colision: "ninguna",
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
    apuntar(from, { id, antes: o }, { mover: true, lote: String(m.lote || "") });
    const nuevo = conCaja(id, {
      ...o, x: q(m.x, PASO.pos), y: q(m.y, PASO.pos), z: q(m.z, PASO.pos),
      rx: girado(Number(m.rx)), ry: girado(Number(m.ry)), rz: girado(Number(m.rz)),
      sx: q(m.sx, PASO.escala), sy: q(m.sy, PASO.escala), sz: q(m.sz, PASO.escala),
    });
    guardar(id, nuevo);
    const cambia = (...k: string[]) => k.some((c) => Number(o[c]) !== Number(nuevo[c]));
    hecho(from, id, "mover", { mueve: cambia("x", "y", "z"), gira: cambia("rx", "ry", "rz"), escala: cambia("sx", "sy", "sz") });
  });

  api.on("girar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (o.fijado) return void rechazar(from, "Está fijado: suéltalo antes de girarlo.");
    apuntar(from, { id, antes: o });
    api.state.set(id, conCaja(id, { ...o, ry: girado(Number(o.ry) + Number(m.grados)) }));
    hecho(from, id, "girar", { gira: true });
  });

  api.on("duplicar", (from, m) => {
    if (!puede(from) || !caben(from)) return;
    const o = objeto(from, m.id);
    if (!o) return;
    const id = nuevoId(), c = api.store.get(`c:${String(m.id)}`), v = api.store.get(`v:${String(m.id)}`);
    if (c) api.store.set(`c:${id}`, c);
    if (v) api.store.set(`v:${id}`, v); // U12: a copied hole keeps its card
    guardar(id, conCaja(id, { ...o, x: q(Math.min(2000, Number(o.x) + 1), PASO.pos), fijado: false }));
    firmar(from, id);
    apuntar(from, { id, antes: null });
    hecho(from, id, "duplicar");
  });

  // H8 (R-1): «restaurar el mundo» — everything built goes, and what the world is born with (`alRestaurar`: the espacio base's logo and moñoni) is planted again.
  // Whoever may build; nothing is kept (not even what is «fijado»), and nobody can undo it (the undo piles are emptied: they would bring the old things back).
  api.on("reiniciar", (from) => {
    if (!puede(from)) return;
    const n = api.state.keys().length;
    for (const k of [...api.state.keys()]) { api.state.delete(k); api.store.delete(`a:${k}`); api.store.delete(`c:${k}`); api.store.delete(`s:${k}`); api.store.delete(`v:${k}`); }
    pilas.clear(); rehechos.clear();
    api.store.set("sembrado", true);
    plantar(alRestaurar);
    api.log(`[objetos] restaurado por la entidad ${from}: ${n} quitados, ${alRestaurar.length} sembrados`);
    hecho(from, "", "reiniciar");
  });

  api.on("borrar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (o.fijado) return void rechazar(from, "Está fijado: suéltalo antes de borrarlo.");
    apuntar(from, { id, antes: o, autor: autorDe(id) }, { lote: String(m.lote || "") });
    api.state.delete(id);
    api.store.delete(`a:${id}`); api.store.delete(`s:${id}`);
    hecho(from, id, "borrar");
  });

  api.on("fijar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    apuntar(from, { id, antes: o }, { lote: String(m.lote || "") });
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

  // U10: hidden (spheres of sound), volume, and solid: the page measures the model's own box and sends it with solido.
  // M6: `colision` says how (ninguna, caja, malla); a page from before sends only `solido: true`, which is `caja`.
  api.on("ajustar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    const colision: Colision = m.colision === "malla" ? "malla" : m.colision === "caja" || m.solido === true ? "caja" : "ninguna";
    const solido = colision !== "ninguna";
    if (solido && o.tipo === "sonido") return void rechazar(from, "Una esfera de sonido no puede ser sólida: es una zona por la que se pasa.");
    if (colision === "malla" && o.tipo !== "modelo") return void rechazar(from, "Solo un modelo 3D (.glb) choca con su malla: una imagen, un vídeo o un sonido pueden ser caja o nada.");
    if (solido) {
      const c: Caja = [m.bx0, m.by0, m.bz0, m.bx1, m.by1, m.bz1].map((v) => q(v, PASO.pos)) as Caja;
      if (c[3] - c[0] > 0.01 && c[4] - c[1] > 0.01 && c[5] - c[2] > 0.01) api.store.set(`c:${id}`, c);
      else if (!api.store.get(`c:${id}`)) return void rechazar(from, "Para que sea sólido hace falta su caja: espera a que el modelo se vea y vuelve a marcarlo.");
    }
    const enlace = String(m.enlace ?? "").trim(), motivo = motivoEnlace(enlace);
    if (motivo) return void rechazar(from, motivo);
    apuntar(from, { id, antes: o });
    const alcance = ["burbuja", "zona", "todos"].includes(String(m.alcance)) ? String(m.alcance) : "burbuja";
    const grupo = ["musica", "efectos", "ambiente"].includes(String(m.grupo)) ? String(m.grupo) : "auto"; // H5: a page from before sends none = auto
    const n = { ...o, oculto: m.oculto === true, volumen: q(Math.max(0, Math.min(1, Number(m.volumen))), 0.01), solido, colision, alcance, grupo, radio: q(Math.max(0.5, Math.min(200, Number(m.radio) || 8)), 0.1), enlace };
    api.state.set(id, solido ? conCaja(id, n) : { ...n, bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0 });
    hecho(from, id, "ajustar", { oculto: n.oculto });
  });

  // ---- U12: holes ----
  const noEsHueco = (from: number, o: Msg, id: string) => rechazar(from, `«${String(o.nombre || id)}» no es un hueco: un hueco es la imagen de un marco que espera su obra (la marca quien construye).`);
  api.on("hueco", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (o.fijado) return void rechazar(from, "Está fijado: suéltalo antes de hacerle un hueco.");
    const ancho = q(m.ancho, PASO.pos), alto = q(m.alto, PASO.pos);
    if (ancho === 0 && alto === 0) { // no longer a hole: it keeps the picture it shows now
      if (!esHueco(o)) return void noEsHueco(from, o, id);
      apuntar(from, { id, antes: o });
      api.state.set(id, { ...o, huecoAncho: 0, huecoAlto: 0, huecoLleno: false });
      api.store.delete(`v:${id}`);
      return void hecho(from, id, "hueco");
    }
    if (o.tipo !== "imagen") return void rechazar(from, "Un hueco es una imagen (el cartel que espera la obra): coloca una imagen y haz de ella el hueco.");
    if (ancho < HUECO_MIN_M || alto < HUECO_MIN_M) return void rechazar(from, `Un hueco mide al menos ${String(HUECO_MIN_M).replace(".", ",")} m por lado.`);
    // the picture it shows now is its card, unless it is already a hole (then the card stays the one it had)
    if (!esHueco(o) || !api.store.get(`v:${id}`)) api.store.set(`v:${id}`, { modelo: String(o.modelo), ext: String(o.ext), sx: Number(o.sx), sy: Number(o.sy), sz: Number(o.sz), nombre: String(o.nombre), decorado: o.decorado === true } satisfies Cartel);
    apuntar(from, { id, antes: o });
    api.state.set(id, { ...o, huecoAncho: ancho, huecoAlto: alto, huecoLleno: esHueco(o) && o.huecoLleno === true });
    hecho(from, id, "hueco");
  });

  api.on("rellenar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    if (!esHueco(o)) return void noEsHueco(from, o, id);
    const modelo = String(m.modelo), ext = String(m.ext).toLowerCase(), nombre = String(m.nombre ?? "").trim();
    if (!EXTENSIONES.imagen.includes(ext)) return void rechazar(from, `En un hueco va una imagen ${EXTENSIONES.imagen.map((e) => `.${e}`).join(", ")}; .${ext} no vale.`);
    if (!api.activo(modelo, ext)) return void rechazar(from, `Esa imagen .${ext} no se ha subido a este servidor.`);
    const px = api.medidas(modelo, ext);
    if (!px) return void rechazar(from, "No sé leer cuántos píxeles mide esa imagen: vuelve a guardarla como .png o .jpg.");
    if (px.ancho > HUECO_PX_MAX || px.alto > HUECO_PX_MAX) return void rechazar(from, `La imagen mide ${px.ancho} × ${px.alto} px; en un hueco caben hasta ${HUECO_PX_MAX} px por lado.`);
    const s = encajar(Number(o.huecoAncho), Number(o.huecoAlto), px.ancho, px.alto);
    if (s < ESCALA_MIN) return void rechazar(from, `La imagen (${px.ancho} × ${px.alto} px) es demasiado alargada para este marco: quedaría de menos de ${Math.round(ESCALA_MIN * 100)} cm.`);
    apuntar(from, { id, antes: o });
    api.state.set(id, conCaja(id, { ...o, modelo, ext, sx: s, sy: s, sz: s, huecoLleno: true, ...(nombre ? { nombre, decorado: false } : {}) }));
    hecho(from, id, "rellenar");
  });

  api.on("vaciar", (from, m) => {
    if (!puede(from)) return;
    const o = objeto(from, m.id), id = String(m.id);
    if (!o) return;
    const v = api.store.get(`v:${id}`) as Cartel | undefined;
    if (!esHueco(o) || !v) return void noEsHueco(from, o, id);
    if (o.huecoLleno !== true) return void rechazar(from, "Ese hueco ya está vacío.");
    apuntar(from, { id, antes: o });
    api.state.set(id, conCaja(id, { ...o, modelo: v.modelo, ext: v.ext, sx: v.sx, sy: v.sy, sz: v.sz, nombre: v.nombre, decorado: v.decorado, huecoLleno: false }));
    hecho(from, id, "vaciar");
  });

  // B4: put every thing back on the ground that is there now, at the height over it it keeps (`s:<id>`, 0 if it has none). Pinned things too: the
  // ground moved under them. Returns how many moved. The `antes` of the undo stacks are left alone (undo re-reads the height over the ground then).
  const asentarTodo = () => {
    const suelo = sueloAhora();
    let n = 0;
    for (const id of api.state.keys()) {
      const o = api.state.get(id);
      if (!o) continue;
      const sobre = Number(api.store.get(`s:${id}`) ?? 0), y = q(suelo.altura(Number(o.x), Number(o.z)) + (Number.isFinite(sobre) ? sobre : 0), PASO.pos);
      if (y === o.y) continue;
      api.state.set(id, conCaja(id, { ...o, y }));
      n++;
    }
    return n;
  };
  api.on("asentar", (from) => {
    if (!puede(from)) return;
    const n = asentarTodo();
    api.log(`[objetos] asentados por la entidad ${from}: ${n} movidos`);
    hecho(from, "", "asentar");
  });
  // ... and by itself when the ground changes (the base switched on or off, another seed, the nature on or off). The key is kept in the store, so a
  // world whose files changed while the server was down settles at start too; with no key saved yet (first run, older store) it only records it.
  api.onTick(() => {
    const clave = sueloAhora().clave, antes = api.store.get("suelo");
    if (clave === antes) return;
    api.store.set("suelo", clave);
    if (antes === undefined) return;
    const n = asentarTodo();
    api.log(`[objetos] el suelo cambió (${String(antes)} → ${clave}): ${n} objeto(s) asentados`);
  });

  // M22: undo and redo put a thing back as it was (or take it away) and leave the opposite on the other stack.
  // A pinned thing stays put for them too, unless what is undone or redone is the pin itself (or its name). A pinned
  // hole's scale is its picture's fit, not a move: undoing a fill or an emptying is allowed (U12).
  const DONDE_CAMPOS = ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"], SITIO = DONDE_CAMPOS.slice(0, 6);
  const fijadoImpide = (ahora: Msg | undefined, destino: Msg | null) => !!ahora?.fijado && (destino === null || (esHueco(ahora) && esHueco(destino) ? SITIO : DONDE_CAMPOS).some((k) => ahora[k] !== destino[k]));
  const volver = (from: number, de: Map<string, Cambio[]>, a: Map<string, Cambio[]>, accion: "deshacer" | "rehacer") => {
    if (!puede(from)) return;
    const k = quien(from), pila = de.get(k), c = pila?.pop();
    if (!c) return void rechazar(from, `No hay nada tuyo que ${accion}.`);
    const ahoras = c.items.map((it) => api.state.get(it.id));
    for (let i = 0; i < c.items.length; i++) {
      if (fijadoImpide(ahoras[i], c.items[i].antes)) { pila!.push(c); return void rechazar(from, `Está fijado: suéltalo antes de ${accion}.`); }
    }
    const otra = a.get(k) ?? [];
    // M22c: whole group goes back on the other stack as ONE entry too, so redo/undo keeps moving them together
    otra.push({ items: c.items.map((it, i) => ({ id: it.id, antes: ahoras[i] ?? null, autor: ahoras[i] ? autorDe(it.id) : undefined })), tick: api.tick(), lote: c.lote });
    if (otra.length > DESHACER_MAX) otra.shift();
    a.set(k, otra);
    for (const it of c.items) {
      if (it.antes === null) { api.state.delete(it.id); api.store.delete(`a:${it.id}`); }
      else { guardar(it.id, it.antes); if (it.autor) api.store.set(`a:${it.id}`, it.autor); }
      hecho(from, it.id, accion);
    }
  };
  api.on("deshacer", (from) => volver(from, pilas, rehechos, "deshacer"));
  api.on("rehacer", (from) => volver(from, rehechos, pilas, "rehacer"));
});

export default crearObjetos();
