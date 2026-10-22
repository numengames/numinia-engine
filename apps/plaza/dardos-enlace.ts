// dardos enlazados (E1): the page's second, light connection to ANOTHER world's server — today the Alchemist Tower's — used ONLY to play
// that world's remote darts board from this page's AR wall, «stitched» to the people playing there. It is its own chunk: nothing here
// is downloaded until something asks (`import("./dardos-enlace.ts")`), and nothing is opened until `conectar()`.
//   · Wire: the same engine protocol over `…/ws?enlace=dardos` (packages/net/src/enlace.ts): the server makes it a VISIT — no avatar for
//     anybody, no snapshots, only the `dardos` feature in both directions. Identity, the conditions-of-entry gate and the rate limits
//     are the ordinary ones, so the gate is real: until the person accepts that world's mandatory norms its darts messages are ignored.
//   · Client: the ordinary ClientSession with ONLY the darts part registered (features/dardos/client.ts `crearCliente()`: its own
//     controller, not the page's `dardos` one) — it never ticks, so it sends no input.
//   · Identity: its own guest token per server host (`numinia.invitado@<host>`), and the name the person has in THIS world on the sign.
//   · AR: the wall view is the page's own (dardos-duelo.ts + dardos-duelo-ar.ts + view.dardosAR), fed by the linked controller.
// The pure part (`estadoEnlace`) is tested in Node (test/dardos-enlace.test.ts); the rest needs the page.
import { webSocketClient, direccionDeEnlace } from "../../packages/net/src/index.ts";
import type { CondicionesMensaje, Transport } from "../../packages/net/src/index.ts";
import { ClientSession } from "../../packages/client/src/index.ts";
import { crearCliente } from "../../features/dardos/client.ts";
import { ZONA_FUERZA } from "../../features/dardos/feature.ts";
import { anfitrionDe, claveInvitado, direccionDeEstado, limpiarNombreMundo, nombreDelEnlace } from "../../features/dardos/enlace.ts";
import type { EnlaceDardos } from "../../features/dardos/enlace.ts";
import { montarDuelo } from "./dardos-duelo.ts";
import type { DianaAR } from "../../packages/render/src/index.ts";

/** What the link is doing, in one word:
 *  - `cerrado`: nothing opened (or it was closed); - `conectando`: the socket or the identity is not there yet;
 *  - `puerta`: connected, but the world's gate is shut: the person has to accept its norms first (E2 draws that);
 *  - `listo`: connected and allowed: the wall can be hung; - `jugando`: the wall is hung and the board is mine;
 *  - `error`: could not connect / the server went away (`motivo` says why). */
export type EstadoEnlaceDardos = "cerrado" | "conectando" | "puerta" | "listo" | "jugando" | "error";

export type Hechos = {
  fase: "nada" | "abriendo" | "abierta" | "cerrada" | "fallo";
  /** the server said who I am (IDENTITY) */
  identificado: boolean;
  /** the last CONDICIONES the server sent (answered at any time, gate on or off); null = not yet */
  condiciones: Pick<CondicionesMensaje, "puerta" | "abierta"> | null;
  /** the wall is hung on this link and the board is mine */
  enPared: boolean;
};

/** The pure state machine: the facts → the word. */
export function estadoEnlace(h: Hechos): EstadoEnlaceDardos {
  if (h.fase === "nada" || h.fase === "cerrada") return "cerrado";
  if (h.fase === "fallo") return "error";
  if (h.fase === "abriendo" || !h.identificado || h.condiciones === null) return "conectando";
  if (h.condiciones.puerta && !h.condiciones.abierta) return "puerta";
  return h.enPared ? "jugando" : "listo";
}

type Res = { ok: true } | { ok: false; why: string };
type Almacen = { getItem(k: string): string | null; setItem(k: string, v: string): void };
type Abierto = Transport & { opened?: Promise<void>; closed?: Promise<{ code: number; reason: string }>; close(): void };

export type OpcionesEnlace = {
  enlace: EnlaceDardos;
  /** the person's name in THIS world and the world's name: shown on the Tower's sign («Ana · en su pared (AR) · desde <mundo>») */
  nombre: () => string;
  mundo: () => string;
  /** the AR side of the page's view (createView): needed only by `jugarEnPared` */
  view?: { dardosAR(o: { alLanzar: (x: number, y: number, f: number) => void; alColocar?: (pared: boolean) => void; zona?: number; envolver?: (j: DianaAR) => DianaAR }): Promise<DianaAR | null>; ar: { state?: string; jugando: boolean; exit(): Promise<void> } };
  almacen?: Almacen;
  /** tests: open the transport some other way than a WebSocket */
  abrir?: (url: string) => Abierto;
  /** ms to wait for the server to say who I am (default 10 s) */
  esperaMs?: number;
  avisar?: (texto: string) => void;
  /** how to read the linked server's /status (`{ nombre }`): default `fetch` (that route answers with CORS `*`); with `abrir` given and no `estadoDelServidor` the name is not asked for */
  estadoDelServidor?: (url: string) => Promise<unknown>;
};

export function crearEnlaceDardos(o: OpcionesEnlace) {
  const { dardos, parts } = crearCliente(); // its OWN controller: the page's one (features/dardos/client.ts `dardos`) stays the world's
  const almacen: Almacen | undefined = o.almacen ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  const llave = claveInvitado(o.enlace.servidor);
  const oyentes = new Set<(que: "estado" | "darts") => void>();
  const dec = (que: "estado" | "darts"): void => { for (const f of oyentes) { try { f(que); } catch { /* a listener must not break the link */ } } };
  let transport: Abierto | null = null, session: ClientSession | null = null, fase: Hechos["fase"] = "nada", motivo = "", aviso = "";
  let timer: ReturnType<typeof setTimeout> | null = null, enPared = false, arJuego: DianaAR | null = null, duelo: ReturnType<typeof montarDuelo> | null = null;
  let cond: CondicionesMensaje | null = null, identificado = false;
  let nombreServidor = ""; // the name the linked world's own server gives itself in /status (dardos enlazados: «Dardos de <nombre> en tu pared»)
  const oyentesCond = new Set<(m: CondicionesMensaje) => void>(); // E2: the norms panel of the flat page listens to what the linked world says

  const estado = (): EstadoEnlaceDardos => estadoEnlace({ fase, identificado, condiciones: cond, enPared });
  const decir = (t: string): void => { aviso = t; o.avisar?.(t); dec("estado"); };
  /** Only the linked board is visible to the AR glue: this link is for ONE board of the other world, not for whatever else it has. */
  const ctl = {
    sitios: () => dardos.sitios().filter((s) => s.id === o.enlace.diana), duelo: () => dardos.duelo(),
    jugar: (_s?: string, desde?: "sitio" | "pared"): Res => dardos.jugar(o.enlace.diana, desde === "pared" ? "pared" : "lejos", o.mundo(), o.nombre()),
    lanzar: (x: number, y: number, f: number, s?: string, via?: "ar"): Res => dardos.lanzar(x, y, f, s, via),
    salir: (): Res => dardos.salir(), clavados: (s?: string) => dardos.clavados(s), cambiar: (): Res => dardos.cambiar(), empezar: (): Res => dardos.empezar(),
    alCambiar: (fn: (que: string) => void) => dardos.alCambiar(fn as never),
  };

  // the controller's changes feed the AR wall (when hung) and whoever listens (one listener for the life of the link object)
  dardos.alCambiar((que) => {
    if (que === "sitios") duelo?.sitiosCambiaron();
    if (que === "duelo") duelo?.cambio();
    if (que === "clavados") { arJuego?.clavados(dardos.clavados(o.enlace.diana)); dec("darts"); }
    dec("estado");
  });

  function cerrarTodo(nuevaFase: "cerrada" | "fallo", por = ""): void {
    if (timer) { clearTimeout(timer); timer = null; }
    const t = transport; transport = null; session = null; identificado = false; cond = null; enPared = false; arJuego = null;
    fase = nuevaFase; motivo = por;
    try { t?.close(); } catch { /* already closed */ }
    dec("estado");
  }

  /** Ask the linked server who it says it is (its /status `nombre`): once per link object, in the background; a failure is silent (the setting's name, then the host, stay). */
  let pedidoNombre = false;
  function pedirNombre(): void {
    if (pedidoNombre) return;
    const leer = o.estadoDelServidor ?? (o.abrir || typeof fetch !== "function" ? null : (u: string) => fetch(u, { cache: "no-store", signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)));
    const url = direccionDeEstado(o.enlace.servidor);
    if (!leer || !url) return;
    pedidoNombre = true;
    void Promise.resolve().then(() => leer(url)).then((j) => {
      const n = limpiarNombreMundo((j as { nombre?: unknown } | null)?.nombre);
      if (n && n !== nombreServidor) { nombreServidor = n; dec("estado"); }
    }).catch(() => { /* the name is a nicety: no /status, no CORS, no problem */ });
  }

  /** Open the link (once): resolves with the state it reached — `puerta` or `listo` when connected and identified, `error` if not. */
  async function conectar(): Promise<EstadoEnlaceDardos> {
    if (fase === "abriendo" || fase === "abierta") return espera();
    fase = "abriendo"; motivo = ""; aviso = ""; identificado = false; cond = null; enPared = false;
    pedirNombre();
    dec("estado");
    const url = direccionDeEnlace(o.enlace.servidor);
    let t: Abierto;
    try { t = o.abrir ? o.abrir(url) : webSocketClient(url); } catch (e) { cerrarTodo("fallo", `no se pudo abrir ${anfitrionDe(o.enlace.servidor)}: ${(e as Error).message}`); return "error"; }
    transport = t;
    const S = new ClientSession(t, {
      features: parts,
      identity: { load: () => { try { return almacen?.getItem(llave) ?? null; } catch { return null; } }, save: (tk) => { try { almacen?.setItem(llave, tk); } catch { /* private mode: a new guest next time */ } } },
    });
    session = S;
    S.onCondiciones = (m) => { cond = m; dec("estado"); for (const f of [...oyentesCond]) { try { f(m); } catch { /* a listener must not break the link */ } } };
    void t.closed?.then((c) => { if (transport === t) cerrarTodo(fase === "abriendo" ? "fallo" : "cerrada", c.code === 4004 ? "el mundo enlazado está lleno" : c.code === 4003 ? "el mundo enlazado no te deja entrar" : `conexión cerrada (${c.code})`); });
    try { await t.opened; } catch (e) { if (transport === t) cerrarTodo("fallo", `no se pudo llegar a ${anfitrionDe(o.enlace.servidor)}`); return "error"; }
    if (transport !== t) return estado();
    fase = "abierta"; dec("estado");
    timer = setTimeout(() => { if (transport === t && (!identificado || cond === null)) cerrarTodo("fallo", "el mundo enlazado no responde"); }, o.esperaMs ?? 10_000);
    // identified → ask for the conditions (answered whether the gate is on or off): `listo` / `puerta` are only said once we know
    const vigila = setInterval(() => {
      if (transport !== t || !session) { clearInterval(vigila); return; }
      if (!identificado && session.who) { identificado = true; session.pedirCondiciones(); dec("estado"); }
      if (identificado && cond !== null) { clearInterval(vigila); if (timer) { clearTimeout(timer); timer = null; } dec("estado"); }
    }, 25);
    return espera();
  }
  /** Wait until the link is `puerta`, `listo`, `jugando`, `error` or `cerrado`. */
  function espera(ms = (o.esperaMs ?? 10_000) + 2000): Promise<EstadoEnlaceDardos> {
    return new Promise((ok) => {
      const ya = (): boolean => { const e = estado(); if (e !== "conectando") { quitar(); clearTimeout(corte); ok(e); return true; } return false; };
      const quitar = (): void => { oyentes.delete(ya); };
      const corte = setTimeout(() => { quitar(); ok(estado()); }, ms);
      if (!ya()) oyentes.add(ya);
    });
  }

  /** The person says yes to the norms of the linked world (what the bubble sends: ACEPTAR with the version of each layer read). */
  function aceptar(versiones: Record<string, string>, datos: string[] = []): boolean { return session?.aceptar(versiones, datos) ?? false; }

  /** Hang the wall: start the AR session and, when the board is hung, join the linked board `desde pared`. */
  async function jugarEnPared(): Promise<Res> {
    if (estado() === "jugando") return { ok: true };
    if (estado() === "cerrado" || estado() === "error") await conectar();
    const e = estado();
    if (e === "puerta") return { ok: false, why: `Primero hay que aceptar las normas de ${nombreDelEnlace(o.enlace, nombreServidor)}.` };
    if (e !== "listo") return { ok: false, why: motivo || "El mundo enlazado no está disponible ahora." };
    const v = o.view; if (!v) return { ok: false, why: "Esta página no puede abrir AR." };
    if (v.ar.state !== undefined && v.ar.state !== "off") return { ok: false, why: "Ya estás en una sesión de AR." };
    if (!ctl.sitios().length) return { ok: false, why: "La diana del mundo enlazado no está disponible." };
    duelo ??= montarDuelo({ dardos: ctl, entity: () => session?.entity ?? -1, hud: document.createElement("div"), fijarSitio: () => {}, avisar: decir, alTerminar: () => {} });
    duelo.preferir(o.enlace.diana);
    const base = duelo.opcionesAR({ alLanzar: () => { /* no board of the link to throw at: nothing to send */ } });
    const envolver = (j: DianaAR): DianaAR => { const w = base.envolver(j); return { ...w, fin() { w.fin(); arJuego = null; enPared = false; ctl.salir(); dec("estado"); } }; };
    arJuego = await v.dardosAR({ ...base, envolver, zona: ZONA_FUERZA.ar });
    if (!arJuego) return { ok: false, why: "No se pudo abrir la sesión de AR." };
    enPared = true; arJuego.clavados(dardos.clavados(o.enlace.diana)); dec("estado");
    return { ok: true };
  }

  /** Leave the match and the AR wall; the connection stays open (a new `jugarEnPared` reuses it). */
  async function salir(): Promise<void> {
    if (!session) return;
    ctl.salir(); enPared = false;
    if (o.view?.ar.jugando) await o.view.ar.exit();
    arJuego = null; dec("estado");
  }
  /** Leave and close the connection: nothing of the link stays open. */
  async function cerrar(): Promise<void> { await salir(); if (fase !== "nada") cerrarTodo("cerrada"); }

  return {
    conectar, jugarEnPared, salir, cerrar, aceptar,
    estado,
    /** Everything the page / the e2e / E2's UI reads. */
    vista: () => ({
      estado: estado(), fase, motivo, aviso, servidor: o.enlace.servidor, diana: o.enlace.diana,
      /** the name the linked server tells ("" = not known); `nombre` = what people read: that, else the setting's, else the host */
      nombreServidor, nombre: nombreDelEnlace(o.enlace, nombreServidor),
      entity: session?.entity ?? -1, yo: session?.who ?? null,
      /** the gate of the linked world: puerta = it has one; abierta = I may play; faltan = the layers still to accept; capas = the text (the offer) */
      condiciones: cond && { puerta: cond.puerta, abierta: cond.abierta, faltan: cond.faltan, capas: cond.capas ?? null },
      duelo: dardos.duelo(), sitio: dardos.sitios().find((s) => s.id === o.enlace.diana) ?? null, arduelo: duelo?.vista().panelAR ?? null,
    }),
    /** The linked controller (features/dardos/client.ts): sitios / duelo / clavados / jugar / lanzar / salir, for the e2e and E2. */
    dardos, sesion: () => session,
    /** E2: the linked world's norms as the server sent them (a `CondicionesMensaje`), what the page's bubble draws; null = not yet */
    condicionesMensaje: (): CondicionesMensaje | null => cond,
    /** E2: be told whenever the linked world sends its norms again (accepting included); returns the way to stop */
    alCondiciones: (fn: (m: CondicionesMensaje) => void): (() => void) => { oyentesCond.add(fn); return () => { oyentesCond.delete(fn); }; },
    /** E2: ask the linked world for its norms again */
    pedirCondiciones: (): boolean => session?.pedirCondiciones() ?? false,
    /** The AR wall's own state (fase, pared, lanzados, clavados, ultimo): null while no wall is hung. */
    ar: () => arJuego?.estado() ?? null,
    alCambiar: (fn: (que: "estado" | "darts") => void): (() => void) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; },
  };
}
export type EnlaceDardosPagina = ReturnType<typeof crearEnlaceDardos>;
