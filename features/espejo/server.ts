// espejo — server part (mundo-hermes, v1). The server owns the mirror: the outside source (through the seam `enlace`, which the local
// link of packages/server hangs its socket on) publishes alta / cambio / baja / lote; every thing is checked against the world's
// espejo.json (its zones, its function switches) and, if it passes, put in the world with `at` and its card. A thing of a function
// that is switched OFF is rejected and nothing is put. The same file decides what is on, so the link can tell the source
// (`hola.funciones`) what to publish and what not to even ask Hermes for. Without the file this part is inert.
// A package cannot import features/, so the seam is hung on the part itself (`enlace`, as `funciones` does) and the server finds it in the list of parts.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi, ServerPart } from "../../packages/feature/src/index.ts";
import { esIA } from "../avatar/feature.ts";
import { espejo as decl, ALCANCE_M, CADUCA_S, PETICIONES_MAX, PETICIONES_POR_PERSONA, RADIO_USO_M } from "./feature.ts";

const TICK_HZ = 20; // the sim's TICK_HZ (features import only core, schema, feature); the clock of the expiry is the server's tick, so a test runs it without waiting
import { FICHERO, FUNCIONES, LIMITES, SOLO_LEER, TIPOS, VERBOS, funcionesEncendidas, leerEspejo, leerObjeto, limpiar, tiposEncendidos } from "./esquema.ts";
import type { EntornoMundo } from "../interruptor.ts";
import type { Espejo, Estado, Funcion, Objeto, Seguridad, Tipo, Verbo } from "./esquema.ts";

/** The key of a thing in the shared state: «<tipo>/<id>» (≤ 11 + 1 + 32 bytes, inside the engine's 64). */
export const claveDe = (tipo: string, id: string): string => `${tipo}/${id}`;

/** What the outside source may do through the seam. Every method returns a result that says why (never throws); texts are untrusted. */
export type Resultado = { ok: true; puestas?: number; quitadas?: number } | { ok: false; motivo: string; problemas?: { path: string; message: string }[] };
/** A request on its way out: the server forwards it and the source answers with `resultado(id, …)` (or it expires). */
export type Peticion = { id: string; objeto: string; verbo: Verbo; seguridad: Seguridad; quien: { entidad: number; id: string; nombre: string }; caduca: number };
export type EnlaceEspejo = {
  /** The functions that are on, in F0 order: what the engine tells the source in `hola.funciones`. [] when the mirror is off. */
  funciones(): Funcion[];
  /** The mirror's own config (null = this world has no espejo.json or it is off). */
  config(): Espejo | null;
  alta(objeto: unknown): Resultado;
  cambio(objeto: unknown): Resultado;
  baja(ref: { tipo: string; id: string }): Resultado;
  /** The full list again (on connecting, and after a reconnection): replaces EVERYTHING the source had published. */
  lote(objetos: unknown[]): Resultado;
  /** The source came or went: told to every page; while it is away, requests are refused. */
  conectada(si: boolean): void;
  /** The source answers a request it was sent. `false` = nobody was waiting for it (unknown or expired id). */
  resultado(peticion: string, ok: boolean, texto: string): boolean;
  /** Where requests go: the link sets one function; none = no source, so every `pedir` is refused with a reason. */
  alPedir(fn: ((p: Peticion) => void) | null): void;
  /** For tests and the link's pulse: how many requests wait. */
  esperando(): number;
  /** Where a change of the switches goes (the link sets one function; none = no source): called with the functions that are ON after every flip. */
  alFunciones(fn: ((funciones: Funcion[]) => void) | null): void;
};
export type ParteConEspejo = ServerPart & { enlace: EnlaceEspejo };
export const conEspejo = (p: ServerPart): p is ParteConEspejo => p.feature.id === "espejo" && typeof (p as Partial<ParteConEspejo>).enlace?.alta === "function";

export type OpcionesEspejo = { espejo?: Espejo | null };

const TEXTO_ESTADO: Record<Estado, string> = { activo: "activo", programado: "programado", pausado: "en pausa", fallo: "con fallo", apagado: "apagado", desconocido: "sin estado conocido" };
const minuscula = (t: string): string => (t ? t[0].toLowerCase() + t.slice(1) : t);

export function crearEspejo(opts: OpcionesEspejo = {}, io?: EntornoMundo): ParteConEspejo {
  // a private copy of the switches: flipping one live must not change the object the caller parsed
  const cfg = opts.espejo && opts.espejo.activa ? { ...opts.espejo, funciones: { ...opts.espejo.funciones } } : null;
  const enlace: Partial<EnlaceEspejo> = {};
  const parte = serverPart(decl, (api: ServerApi) => {
    // ---- inert without a (valid, active) espejo.json: the seam still answers, saying why, so a source that connects anyway is told ----
    const apagado = (): Resultado => ({ ok: false, motivo: "este mundo no tiene el espejo encendido (entorno/espejo.json)" });
    if (!cfg) {
      Object.assign(enlace, { funciones: () => [], config: () => null, alta: apagado, cambio: apagado, baja: apagado, lote: apagado, conectada: () => {}, resultado: () => false, alPedir: () => {}, esperando: () => 0, alFunciones: () => {} } satisfies EnlaceEspejo);
      return;
    }
    let encendidos = new Set<string>(tiposEncendidos(cfg));
    const puestas = new Map<string, Objeto>(); // key → what the source published (the truth is outside; this is only what we put)
    const propias = new Set<string>(); // things the world itself puts (the switch panel): a source's `lote` never removes them
    const huecos = new Map<string, { zona: string; n: number }>(); // key → the grid slot of a thing that came WITHOUT x/z (the source does not know the map)
    const lugar = (o: Objeto) => ({ at: { x: o.x, z: o.z } });
    const valor = (o: Objeto): Msg => ({ titulo: o.titulo, subtitulo: o.subtitulo, estado: o.estado, zona: o.zona, x: o.x, z: o.z, luz: o.luz, acciones: o.acciones.join(" ") });
    const cercaDe = (o: Objeto) => ({ near: { x: o.x, z: o.z }, radius: ALCANCE_M });

    /** A thing that comes without x/z gets a slot on its zone's grid (4 m apart), filled outwards from the zone's centre (the first thing is AT the centre, then
     *  its neighbours, nearest first). It keeps its slot while it stays in that zone, so a `cambio` or a `lote` never moves it. Past the zone's size the grid goes on. */
    const ESPACIO_M = 4;
    const CELDAS = (() => { const c: { i: number; j: number }[] = []; for (let i = -15; i <= 15; i++) for (let j = -15; j <= 15; j++) c.push({ i, j }); return c.sort((p, q) => p.i * p.i + p.j * p.j - (q.i * q.i + q.j * q.j) || p.j - q.j || p.i - q.i); })();
    const casilla = (z: { x: number; z: number }, n: number) => { const c = CELDAS[Math.min(n, CELDAS.length - 1)]; return { x: z.x + c.i * ESPACIO_M, z: z.z + c.j * ESPACIO_M }; };
    const sitioLibre = (k: string, zona: string): number => {
      const ya = huecos.get(k); if (ya && ya.zona === zona) return ya.n;
      const usados = new Set([...huecos].filter(([otra, h]) => otra !== k && h.zona === zona).map(([, h]) => h.n));
      let n = 0; while (usados.has(n)) n++;
      return n;
    };
    const sinLugar = (crudo: unknown): boolean => typeof crudo === "object" && crudo !== null && (crudo as { x?: unknown }).x === undefined && (crudo as { z?: unknown }).z === undefined;
    const colocar = (o: Objeto, auto: boolean): Objeto => {
      const k = claveDe(o.tipo, o.id);
      if (!auto) { huecos.delete(k); return o; }
      const zona = cfg.zonas.find((z) => z.id === o.zona)!, n = sitioLibre(k, o.zona);
      huecos.set(k, { zona: o.zona, n });
      return { ...o, ...casilla(zona, n) };
    };

    /** Check one thing against the world's file AND its switch; return it or why not. Off-switch rejects: nothing is placed. */
    const admitir = (crudo: unknown, path = "objeto"): { ok: true; o: Objeto; auto: boolean } | { ok: false; r: Resultado } => {
      const l = leerObjeto(crudo, cfg, path);
      if (!l.ok) return { ok: false, r: { ok: false, motivo: `${l.issues[0].path}: ${l.issues[0].message}`, problemas: l.issues } };
      if (!encendidos.has(l.value.tipo)) return { ok: false, r: { ok: false, motivo: `la función de «${l.value.tipo}» está apagada en este mundo (entorno/espejo.json → funciones)`, problemas: [{ path: `${path}.tipo`, message: "función apagada" }] } };
      return { ok: true, o: l.value, auto: sinLugar(crudo) };
    };
    const poner = (o: Objeto): boolean => {
      const k = claveDe(o.tipo, o.id);
      if (!api.state.set(k, valor(o), lugar(o))) return false;
      puestas.set(k, o);
      return true;
    };
    const decirCambio = (antes: Objeto | undefined, o: Objeto) => {
      if (antes && antes.estado === o.estado && antes.titulo === o.titulo) return; // only a real change is spoken
      const texto = limpiar(`${antes ? "" : "Nuevo: "}${o.tipo === "cron" ? "Tarea" : minuscula(o.tipo)} «${o.titulo}»: ${TEXTO_ESTADO[o.estado]}`, 160);
      api.emit("cambiado", { objeto: claveDe(o.tipo, o.id), texto }, cercaDe(o));
    };
    const quitar = (k: string): boolean => {
      if (!puestas.delete(k)) return false;
      huecos.delete(k); propias.delete(k);
      api.state.delete(k);
      return true;
    };

    let salidaFunciones: ((f: Funcion[]) => void) | null = null;
    const e: EnlaceEspejo = {
      funciones: () => funcionesEncendidas(cfg),
      config: () => cfg,
      alta(crudo) {
        const a = admitir(crudo); if (!a.ok) return a.r;
        if (!puestas.has(claveDe(a.o.tipo, a.o.id)) && [...puestas.values()].filter((x) => x.zona === a.o.zona).length >= LIMITES.objetosPorZona) return { ok: false, motivo: `la zona «${a.o.zona}» ya tiene ${LIMITES.objetosPorZona} cosas (el tope): quite alguna o pagine en la fuente` };
        const antes = puestas.get(claveDe(a.o.tipo, a.o.id));
        if (antes && propias.has(claveDe(a.o.tipo, a.o.id))) return { ok: false, motivo: `«${claveDe(a.o.tipo, a.o.id)}» es de este mundo (el panel de interruptores): la fuente no puede cambiarla` };
        const o = colocar(a.o, a.auto);
        if (!poner(o)) { huecos.delete(claveDe(o.tipo, o.id)); return { ok: false, motivo: "el servidor no pudo poner la cosa (más en su registro)" }; }
        decirCambio(antes, o);
        return { ok: true, puestas: 1 };
      },
      cambio(crudo) {
        const a = admitir(crudo); if (!a.ok) return a.r;
        const k = claveDe(a.o.tipo, a.o.id), antes = puestas.get(k);
        if (!antes) return { ok: false, motivo: `no hay ninguna cosa «${k}» que cambiar (use alta o lote primero)` };
        if (propias.has(k)) return { ok: false, motivo: `«${k}» es de este mundo (el panel de interruptores): la fuente no puede cambiarla` };
        const o = colocar(a.o, a.auto);
        if (!poner(o)) return { ok: false, motivo: "el servidor no pudo poner la cosa (más en su registro)" };
        decirCambio(antes, o);
        return { ok: true, puestas: 1 };
      },
      baja(ref) {
        const t = String(ref?.tipo ?? ""), id = String(ref?.id ?? "");
        if (propias.has(claveDe(t, id))) return { ok: false, motivo: `«${claveDe(t, id)}» es de este mundo (el panel de interruptores): la fuente no puede quitarla` };
        if (!quitar(claveDe(t, id))) return { ok: false, motivo: `no hay ninguna cosa «${limpiar(claveDe(t, id), 48)}» que quitar` };
        return { ok: true, quitadas: 1 };
      },
      lote(objetos) {
        if (!Array.isArray(objetos)) return { ok: false, motivo: "un lote es una lista de cosas" };
        if (objetos.length > LIMITES.objetosPorLote) return { ok: false, motivo: `un lote lleva como mucho ${LIMITES.objetosPorLote} cosas (lleva ${objetos.length}); mande menos o pagine` };
        // all or nothing for the CHECK (one bad thing says which, and the world keeps what it had); then replace everything
        const nuevos: Objeto[] = [], autos = new Set<string>(), problemas: { path: string; message: string }[] = [], vistos = new Set<string>(), porZona = new Map<string, number>();
        objetos.forEach((c, i) => {
          const a = admitir(c, `lote[${i}]`);
          if (!a.ok) { problemas.push(...(a.r.ok ? [] : a.r.problemas ?? [{ path: `lote[${i}]`, message: a.r.motivo }])); return; }
          const k = claveDe(a.o.tipo, a.o.id);
          if (vistos.has(k)) { problemas.push({ path: `lote[${i}]`, message: `«${k}» está repetida en el lote` }); return; }
          if (propias.has(k)) { problemas.push({ path: `lote[${i}]`, message: `«${k}» es de este mundo (el panel de interruptores): la fuente no puede publicarla` }); return; }
          vistos.add(k); if (a.auto) autos.add(k);
          const n = (porZona.get(a.o.zona) ?? 0) + 1; porZona.set(a.o.zona, n);
          if (n > LIMITES.objetosPorZona) { problemas.push({ path: `lote[${i}]`, message: `la zona «${a.o.zona}» pasa de ${LIMITES.objetosPorZona} cosas` }); return; }
          nuevos.push(a.o);
        });
        if (problemas.length) return { ok: false, motivo: `${problemas[0].path}: ${problemas[0].message}${problemas.length > 1 ? ` (y ${problemas.length - 1} más)` : ""}`, problemas };
        let quitadas = 0;
        for (const k of [...puestas.keys()]) if (!vistos.has(k) && !propias.has(k)) { quitar(k); quitadas++; }
        let n = 0;
        for (const o0 of nuevos) { const k = claveDe(o0.tipo, o0.id), antes = puestas.get(k), o = colocar(o0, autos.has(k)); if (poner(o)) { n++; if (antes) decirCambio(antes, o); } }
        return { ok: true, puestas: n, quitadas };
      },
      conectada(si) {
        if (si === conectada) return;
        conectada = si;
        if (!si) for (const [id, p] of [...esperando]) cerrar(id, p, false, "La conexión con la fuente se cortó: no sé si se hizo.");
        api.emit("aviso", { conectada: si, texto: si ? "La fuente de fuera se ha conectado." : "La fuente de fuera se ha desconectado: las acciones esperan." }, "all");
      },
      resultado(id, ok, texto) {
        const p = esperando.get(String(id));
        if (!p) return false;
        cerrar(String(id), p, ok === true, limpiar(texto, 120) || (ok ? "Hecho." : "No se pudo."));
        return true;
      },
      alPedir(fn) { salida = fn; },
      esperando: () => esperando.size,
      alFunciones(fn) { salidaFunciones = fn; },
    };
    Object.assign(enlace, e);

    // ---- the world's own thing: the switch panel on the threshold (the zone that admits «salud»). Its lamps are the controls (`encender`, below);
    //      it says what is on and off and follows every flip. It stays even when «salud» itself is switched off, so the world can be switched back on from inside. ----
    const zonaPanel = cfg.zonas.find((z) => z.tipos.includes("salud"));
    const FUNCIONES_DE_ZONAS = [...new Set(cfg.zonas.flatMap((z) => z.tipos.map((t) => TIPOS[t])))] as Funcion[];
    const CLAVE_PANEL = claveDe("salud", "panel");
    const refrescarPanel = (): void => {
      if (!zonaPanel || (!encendidos.has("salud") && !propias.has(CLAVE_PANEL))) return;
      const sel = (on: boolean) => FUNCIONES_DE_ZONAS.filter((f) => cfg.funciones[f] === on);
      const lista = (xs: Funcion[]) => (xs.length ? xs.join(", ") : "ninguna");
      const panel: Objeto = { tipo: "salud", id: "panel", titulo: "Panel de interruptores", subtitulo: limpiar(`Encendido: ${lista(sel(true))}. Apagado: ${lista(sel(false))}.`, LIMITES.subtitulo), estado: "activo", zona: zonaPanel.id, x: zonaPanel.x, z: zonaPanel.z - zonaPanel.fondo / 2 + 2.5, luz: true, acciones: [] };
      if (poner(panel)) propias.add(CLAVE_PANEL);
    };
    refrescarPanel();

    // ---- story 4: usar / pedir. The page only ASKS; the server checks and forwards. It never runs anything. ----
    let conectada = false, salida: ((p: Peticion) => void) | null = null, n = 0;
    const esperando = new Map<string, Peticion & { texto: string }>();
    const rechazar = (from: number, motivo: string) => { api.emit("rechazado", { motivo: limpiar(motivo, 160) }, { to: from }); };
    const cerrar = (id: string, p: Peticion & { texto: string }, ok: boolean, texto: string) => {
      esperando.delete(id);
      api.emit("resultado", { objeto: p.objeto, verbo: p.verbo, ok, texto: limpiar(texto, 160) }, { to: p.quien.entidad });
    };
    /** Only a real, identified person who directs here (or rules the world) may ask. Never an AI inhabitant (no identity), never `@todos` without the role. */
    const puedePedir = (e: number): string => {
      const quien = api.who(e);
      if (!quien || esIA(quien.id)) return "Solo una persona identificada puede pedir acciones sobre lo de fuera; una IA o alguien sin identidad no puede.";
      if (!(api.puede(e, "dirigir") || api.puede(e, "mandar"))) return "Pedir acciones sobre lo de fuera es cosa de quien dirige aquí o de quien manda en el mundo.";
      return "";
    };
    const buscar = (from: number, clave: string): { k: string; o: Objeto } | null => {
      const k = String(clave ?? "");
      const o = puestas.get(k);
      if (!o) { rechazar(from, "Esa cosa ya no está en el mundo."); return null; }
      if (!api.within(from, k)) { rechazar(from, `Está demasiado lejos: acérquese a «${o.titulo}» (a menos de ${RADIO_USO_M} m).`); return null; }
      return { k, o };
    };

    api.on("usar", (from, msg) => {
      const b = buscar(from, String(msg.objeto)); if (!b) return;
      const ofrece = propias.has(b.k) ? (puedePedir(from) === "" ? " Usted puede encender o apagar cada función con su botón." : " Encender o apagar funciones es cosa de quien dirige o manda.")
        : b.o.acciones.length ? ` Se le puede pedir: ${b.o.acciones.join(", ")}.` : " No ofrece acciones.";
      api.emit("ficha", { objeto: b.k, texto: limpiar(`${b.o.titulo}: ${TEXTO_ESTADO[b.o.estado]}.${b.o.subtitulo ? ` ${b.o.subtitulo}.` : ""}${ofrece}`, 240) }, { to: from });
    });

    api.on("pedir", (from, msg) => {
      const verbo = String(msg.verbo ?? "");
      // order of the checks = cheapest and most revealing first: who, what, where, which verb, which switch, how many, is anyone there
      const no = puedePedir(from); if (no) return rechazar(from, no);
      const b = buscar(from, String(msg.objeto)); if (!b) return;
      if (!(verbo in VERBOS)) return rechazar(from, `«${limpiar(verbo, 24)}» no es una acción que conozca.`);
      if (!b.o.acciones.includes(verbo as Verbo)) return rechazar(from, `«${b.o.titulo}» no ofrece la acción «${verbo}».`);
      if (!encendidos.has(b.o.tipo)) return rechazar(from, "Esa función está apagada en este mundo.");
      if (!conectada || !salida) return rechazar(from, "La fuente de fuera no está conectada: ahora no puedo pedírselo.");
      const mias = [...esperando.values()].filter((p) => p.quien.entidad === from).length;
      if (mias >= PETICIONES_POR_PERSONA) return rechazar(from, `Ya tiene ${mias} peticiones esperando respuesta: espere a que lleguen.`);
      if (esperando.size >= PETICIONES_MAX) return rechazar(from, "Hay demasiadas peticiones esperando respuesta: inténtelo en un momento.");
      const quien = api.who(from)!;
      const id = `p${(++n).toString(36)}-${api.tick().toString(36)}`;
      const seguridad = cfg.acciones[verbo as Verbo];
      const p: Peticion & { texto: string } = { id, objeto: b.k, verbo: verbo as Verbo, seguridad, quien: { entidad: from, id: quien.id, nombre: limpiar(quien.nombre, 40) }, caduca: api.tick() + CADUCA_S * TICK_HZ, texto: b.o.titulo };
      esperando.set(id, p);
      try { salida(p); }
      catch (err) { esperando.delete(id); api.log(`espejo: la salida falló: ${(err as Error).message}`); return rechazar(from, "No he podido mandar la petición fuera."); }
      api.emit("pedido", { objeto: b.k, verbo, espera: CADUCA_S, texto: limpiar(`Pedido «${verbo}» sobre «${b.o.titulo}»; espero respuesta (hasta ${CADUCA_S} s).`, 160) }, { to: from });
    });

    // a request nobody answers expires: the person hears it, and a late answer is then ignored
    api.onTick((t) => {
      if (!esperando.size) return;
      for (const [id, p] of [...esperando]) if (t >= p.caduca) cerrar(id, p, false, "Hermes no ha respondido a tiempo: no sé si se hizo.");
    });
    // a person who leaves takes their waiting requests with them (the answer has nobody to tell)
    api.onLeave((e) => { for (const [id, p] of [...esperando]) if (p.quien.entidad === e) esperando.delete(id); });
    // ---- the switch panel's lamps are controls: `encender { funcion, activa }` flips `funciones.<funcion>` for the whole world, live ----
    const decirPermiso = (e: number): void => { api.emit("permiso", { encender: puedePedir(e) === "" }, { to: e }); };
    api.onJoin(decirPermiso); api.onIdentify(decirPermiso);
    api.listen("roles", "cambio", (m) => { decirPermiso(Number(m.quien)); return true; });

    /** Write `funciones.<f>` into entorno/espejo.json. "" = done (or there is no folder: it lasts until restart); else why not — and nothing was written.
     *  The file is read again, the one key changed, the WHOLE result checked with the schema, and only then written (temp file + rename in `escribir`):
     *  a file somebody broke by hand is never replaced, and a failed write leaves the good one as it was. */
    const guardarFuncion = (f: Funcion, activa: boolean): string => {
      if (!io?.escribir) return "";
      let crudo: unknown;
      try { crudo = io.leer?.(FICHERO); } catch { crudo = undefined; }
      if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return `${FICHERO} no se puede leer ahora o no es un objeto JSON: arréglelo a mano; no cambia nada.`;
      const actual = (crudo as Record<string, unknown>).funciones;
      if (actual !== undefined && (typeof actual !== "object" || actual === null || Array.isArray(actual))) return `${FICHERO}: «funciones» no es un objeto: arréglelo a mano; no cambia nada.`;
      const nuevo = { ...(crudo as Record<string, unknown>), funciones: { ...(actual as Record<string, unknown> | undefined), [f]: activa } };
      const l = leerEspejo(nuevo);
      if (!l.ok) return limpiar(`${FICHERO} tiene un error (${l.issues[0].path}: ${l.issues[0].message}): arréglelo a mano; no cambia nada.`, 160);
      try { io.escribir(FICHERO, nuevo); return ""; }
      catch (err) { api.log(`espejo: no pude escribir ${FICHERO}: ${(err as Error).message}`); return `No he podido guardar ${FICHERO} (${(err as NodeJS.ErrnoException).code ?? "error"}; más en el registro del servidor): no cambia.`; }
    };
    api.on("encender", (from, msg) => {
      const no = puedePedir(from); if (no) return rechazar(from, "Encender o apagar funciones es cosa de una persona identificada que dirige aquí o manda en el mundo.");
      const nombre = String(msg.funcion ?? ""), activa = msg.activa === true;
      if (!(FUNCIONES as readonly string[]).includes(nombre)) return rechazar(from, `«${limpiar(nombre, 24)}» no es una función que conozca (son: ${FUNCIONES.join(", ")}).`);
      const f = nombre as Funcion;
      if (cfg.funciones[f] === activa) return rechazar(from, `La función «${f}» ya está ${activa ? "encendida" : "apagada"}.`);
      const fallo = guardarFuncion(f, activa); if (fallo) return rechazar(from, fallo);
      cfg.funciones[f] = activa; encendidos = new Set<string>(tiposEncendidos(cfg));
      if (!activa) { // the things of a switched-off function leave the world (the source keeps the truth; the file keeps zones and verbs); what waited on them is closed
        for (const [k, o] of [...puestas]) if (TIPOS[o.tipo] === f && !propias.has(k)) quitar(k);
        for (const [id, p] of [...esperando]) if (TIPOS[p.objeto.split("/")[0] as Tipo] === f) cerrar(id, p, false, "La función se apagó mientras tanto: no se hizo.");
      }
      refrescarPanel();
      api.log(`espejo: ${api.who(from)?.nombre ?? from} ${activa ? "enciende" : "apaga"} la función «${f}»${io?.escribir ? "" : " (este mundo no tiene carpeta: dura hasta el reinicio)"}`);
      api.emit("funcion", { funcion: f, activa, texto: `Función «${f}» ${activa ? "encendida" : "apagada"}.` }, "all");
      try { salidaFunciones?.(funcionesEncendidas(cfg)); } catch (err) { api.log(`espejo: no pude contarle el cambio a la fuente: ${(err as Error).message}`); }
    });
    api.log(`espejo: encendido (${funcionesEncendidas(cfg).join(", ") || "ninguna función"}; ${cfg.zonas.length} zona(s))`);
  });
  return Object.assign(parte, { enlace: enlace as EnlaceEspejo });
}

/** Re-exports the tests and the link use. */
export { CADUCA_S, PETICIONES_MAX, PETICIONES_POR_PERSONA, RADIO_USO_M, SOLO_LEER, VERBOS };
export type { Tipo };
export default crearEspejo();
