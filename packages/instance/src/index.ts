// instance: the authoritative server loop, wired to clients through the Transport interface.
// The same code runs over in-memory loopback (tests, headless runs) and over WebSocket (server).
import { rngNext, fxToFloat, fx, FX_ONE } from "../../core/src/index.ts";
import { createSim, spawnAvatar, step, stateHash, setSolids, solidsFrom, sitioLibre, onFloor, rayBvh, setMesh, BTN_JUMP, BTN_RUN, INPUT_STRIDE, ORDER_STRIDE, ORDER_PONER, ORDER_QUIETO, ORDER_EMPUJAR, ORDER_SENTAR, ORDER_VOLAR, QUIETO_MAX } from "../../sim/src/index.ts";
import type { SimState, SpawnArea, Bvh } from "../../sim/src/index.ts";
import {
  MSG, buildGrid, selectVisible, encodeSnapshot, decodeSnapshot, encodeInput, decodeInput,
  encodePong, decodeTime, encodeWelcome, decodeWelcome, loopbackPair, decodeReport,
  decodeIdentityRequest, decodePase, encodeIdentity, leerVozSubida, codificarVozBajada, elegirVoces, VOZ_RADIO_M, VOZ_TRAMAS_S, VOZ_TOPE,
} from "../../net/src/index.ts";
import { agenteDe, emitir, nombreDe, nuevoId, today, verificar, verificarAgente } from "./identidad.ts";
import type { Who } from "./identidad.ts";
export type { Who } from "./identidad.ts";
import type { Transport, Viewer, Welcome } from "../../net/src/index.ts";
import { ServerRuntime } from "../../feature/src/index.ts";
import type { BienFirmable, FeatureStorage, ReciboLeido, ServerPart, RayHit, Orden } from "../../feature/src/index.ts";

export type InstanceOptions = {
  seed: number; capacity: number; k: number; snapshotEvery: number;
  reference?: Welcome["ref"]; // determinism probe sent to every client on join
  features?: readonly ServerPart[]; // game features (J7); none = the wire is exactly the pre-J7 one
  log?: (line: string) => void;
  sign?: (text: string) => string; // HMAC with the server's secret, for features (api.sign)
  onReport?: (entity: number, report: Record<string, unknown>) => void; // T1: how a player entered (server/sesiones.ts)
  storage?: FeatureStorage; // S4: where the features' saved state and stores live (server/datos.ts); none = memory only
  identitySign?: (text: string) => string; // I1: signs guest tokens; none = no identities (bots, bare tests)
  random?: () => number;                   // I1: randomness for new guest ids (the server passes crypto); default Math.random
  now?: () => number;                      // I1: the clock for token days; default Date.now
  puede?: (who: Who | null, accion: string, entity: number) => boolean; // H1: permissions for features (api.puede); none = nobody may
  /** H3b: a world pass came with the identity. Returns the person it names (the world checked it), or null = stay a guest
   * (the world has already told the person why). None = passes are ignored. */
  credencial?: (entity: number, pase: string, invitado: Who) => Who | null;
  /** ia-organizacion: a PASE that arrives AFTER identity, on the connection of an AI that entered with a pass (an organization's
   * AI lives only while its pass is valid; the bridge sends a fresh one before it ends). Returns null = renewed, or why not
   * (counted, logged, the connection kept until its own pass ends). None = a late PASE is refused as always. */
  renovarPase?: (entity: number, pase: string) => string | null;
  activo?: (sha256: string, ext: string) => boolean; // H9: is /a/<sha256>.<ext> on this server (library or uploaded)? (api.activo)
  medidas?: (sha256: string, ext: string) => { ancho: number; alto: number } | null; // U12: a picture's pixels (api.medidas)
  sinVoz?: boolean | (() => boolean); // U10: true = voice frames are not relayed; a function is asked at every frame (the world's /voz)
  oye?: (de: number, a: number) => boolean; // F1: may entity `a` hear entity `de`? Asked per listener and frame (a muted speaker, a personal block); none = yes
  /** M17: is this entity on stage (moderation's /escenario)? Asked per frame. Its voice goes to EVERY connected page with the
   * VOZ_ESCENARIO flag, whatever the distance. None = nobody is ever on stage. */
  escenario?: (entity: number) => boolean;
  aventura?: (carpeta: string) => { fichero: string; texto: string }[]; // J5: the adventure's text files (server/aventura.ts); none = no adventure
  // P4: AI inhabitants. `sign` checks agent tickets (a secret apart from the guests'); `nombre` = the name the world
  // declares for that inhabitant id (its habitante@1 file), null = this world has no such inhabitant. None = no agents.
  agentes?: { sign: (text: string) => string; nombre: (id: string) => string | null };
  /** ADR-080: outside agents (a2 tickets, Ed25519, listed in the world's aventura/agentes/). `verificar` gets the ticket
   * and the host the connection asked for (the WebSocket's Host header; none over loopback) and answers the agent's
   * id and the name the world gives it (without « · IA»), or null. It logs its own refusals (never the ticket). */
  externos?: { verificar: (ticket: string, anfitrion: string | undefined) => { id: string; nombre: string } | null };
  /** Where new avatars appear (metres; the world's entorno@1 `aparicion`); none = the house square of 40 m around the origin. */
  aparicion?: SpawnArea | null;
  /** N10: the world's receipts for digital goods (server/recibos.ts crearRecibos); none = features get "" and refusals. */
  recibos?: { emisor: string; firmar(d: BienFirmable): string; verificar(token: string): ReciboLeido };
  /** D-045 («suelo de la muerte»): the world's `sueloMinimo` (metres; entorno.json): under it you have fallen into the void
   * and the server puts you back on your last safe spot (the one it keeps every SEGURO_CADA ticks while you stand on a
   * floor at or over that height), or on `vuelta` (a fixed point; `siempre` = always there). None = no void: nobody is
   * ever moved on their own (the reference fingerprint stands). */
  suelo?: Suelo | null;
  /** H2 historia 5/8: who may fly by default — "nadie" (default, nothing written), "constructores" (puede(e,
   * "build-in-worlds")) or "todos". A feature can still grant it to one avatar (`concederVuelo`) whatever this says. */
  vuelo?: "nadie" | "constructores" | "todos";
  /** M6 h8: builds (or refreshes) the world's collision mesh from the shared state's `malla` things, off the sim
   * tick (fetching and parsing a .glb is not a 20 Hz operation): called again whenever the shared state version
   * changes, never twice at once. Returns null when there is nothing to build (no `malla` thing, or none readable).
   * None = the world never gets a mesh (`sim.mesh` stays null, same as before M6: darts, fishing and walking into a
   * `malla` wall all answer as if there is nothing there). packages/server/src/colision-mundo.ts builds the real one. */
  construirMalla?: (objetos: Iterable<[string, Record<string, unknown>]>) => Promise<Bvh | null>;
};
export type Suelo = { minimo: number; vuelta?: { x: number; y: number; z: number; siempre?: boolean } | null };
/** B2: the phases of Instance.tick(), in order (Instance.fasesMs): inputs in, solid boxes rebuilt (only when a feature's
 * shared state changed), the simulation step, the safe-spot pass, the features (server/metrics.ts splits it by feature),
 * the snapshots out. */
export const FASES_TICK = ["entradas", "solidos", "simulacion", "seguro", "piezas", "instantaneas"] as const;
/** D-045: how often (ticks) the last safe spot is kept: 10 = every half second. */
export const SEGURO_CADA = 10;
/** D-045: a return the instance made (the feature `suelo` tells the page). `motivo`: caida = under the floor, pedido = asked. */
export type Vuelta = { entity: number; x: number; y: number; z: number; motivo: "caida" | "pedido" };

/** Inputs wait in a queue; the server applies exactly ONE per tick (none = that avatar does not advance: J2). */
export const MAX_QUEUE = 8;
/** H2 historia 5: at most this many orders (api.ordenar, D-045's own volverASeguro included) go into one step; the
 * rest wait their turn, in order, next tick (1,280 orders/s: 1,000 avatars frozen at once take 16 ticks, 0.8 s). */
export const ORDENES_TICK_MAX = 64;
/** M6 h12: a ray starts this high over the feet — between standing (BODY_HEIGHT 1.7 m) and a stooped look. */
const EYE_HEIGHT = fx(1.6);

type Conn = {
  entity: number; transport: Transport; viewer: Viewer;
  queue: { seq: number; mx: number; mz: number; buttons: number }[]; ack: number; dropped: number; bad: number;
  who?: Who; // I1: set once the page shows (or asks for) its guest token
  invitado?: string; // H3b: the guest id behind a numinia.com person (the page's guest token still names it: uploads)
  pase?: string; // H3b: the world pass the page sent (PASE), held until its IDENTITY arrives, then handed to identificar and forgotten
  visible?: number[]; // J3: who its last snapshot carried (features ask with api.visible: names over heads)
  voz?: { desde: number; n: number }; // U10: voice frames this second (rate cap)
  vozUltima?: number; // M17: tick of its last accepted voice frame ("speaking now" = within the last 20 ticks)
  vozOidas?: { tick: number; considerados: Set<number>; elegidas: Set<number> }; // M17: which speakers this listener hears, recomputed at most every 10 ticks
  anfitrion?: string; // ADR-080: the host this connection asked for (an outside agent signs the world's name)
};

export class Instance {
  readonly sim: SimState;
  readonly opts: InstanceOptions;
  readonly conns: Conn[] = []; // array: join order is the deterministic order
  readonly features: ServerRuntime; // game features: outside the simulation, never in the fingerprint
  private readonly byEntity: (Conn | undefined)[];
  constructor(opts: InstanceOptions) {
    this.opts = opts; this.sim = createSim(opts.capacity, opts.seed);
    this.byEntity = new Array(opts.capacity);
    const tf = this.sim.tf;
    this.features = new ServerRuntime(opts.features ?? [], {
      players: () => this.conns.map((c) => c.entity),
      position: (e) => (this.sim.world.alive[e] && tf.has[e] ? { x: fxToFloat(tf.cols.x[e]), y: fxToFloat(tf.cols.y[e]), z: fxToFloat(tf.cols.z[e]) } : null),
      send: (e, bytes) => this.byEntity[e]?.transport.send(bytes, true),
      tick: () => this.sim.tick,
      log: opts.log ?? (() => {}),
      sign: opts.sign,
      storage: opts.storage,
      who: (e) => this.byEntity[e]?.who ?? null,
      puede: (e, accion) => !!this.byEntity[e] && (opts.puede?.(this.byEntity[e]?.who ?? null, accion, e) ?? false),
      activo: opts.activo,
      medidas: opts.medidas,
      visible: (e) => this.byEntity[e]?.visible ?? [],
      aventura: opts.aventura,
      recibo: opts.recibos ? (d) => opts.recibos!.firmar(d) : undefined,
      emisor: opts.recibos ? () => opts.recibos!.emisor : undefined,
      verificarRecibo: opts.recibos ? (t) => { const l = opts.recibos!.verificar(t); return l.ok ? { ...l, nuestro: l.nuestro === true } : l; } : undefined,
      teletransportar: (e, cerca, o) => this.teletransportar(e, cerca, o),
      volverASeguro: (e) => this.volverASeguro(e, "pedido"),
      vueltas: () => this.vueltas.splice(0),
      rayo: (e, dir, max) => this.rayo(e, dir, max),
      ordenar: (e, orden) => this.ordenar(e, orden),
    });
    this.seguro = new Int32Array(opts.capacity * 3); this.tieneSeguro = new Uint8Array(opts.capacity);
  }

  // ---- D-045: the last safe spot of each avatar, the orders waiting for the next step, the returns made ----
  private readonly seguro: Int32Array; private readonly tieneSeguro: Uint8Array;
  private ordenes: number[] = []; // [entity, tipo, a, b, c, d] Q16.16, applied by the next step (recorded: part of the replay)
  private readonly pendiente = new Set<number>();
  private readonly vueltas: Vuelta[] = [];
  private avisado = false;
  /** H2 historia 5: avatars a feature has granted flight to, whatever entorno.json's `vuelo` says (forgotten on leave). */
  private readonly concedidosVuelo = new Set<number>();
  /** Keep where this avatar stands as its safe spot, if it stands on a floor at or over the world's minimum. */
  private guardarSeguro(e: number): void {
    const s = this.sim;
    if (!onFloor(s, e)) return;
    const y = s.tf.cols.y[e];
    if (this.opts.suelo && y < fx(this.opts.suelo.minimo)) return;
    this.seguro[e * 3] = s.tf.cols.x[e]; this.seguro[e * 3 + 1] = y; this.seguro[e * 3 + 2] = s.tf.cols.z[e]; this.tieneSeguro[e] = 1;
  }
  /** Where a return would put this avatar (Q16.16), or null: the world's fixed point when it says `siempre` or when no
   * safe spot is known yet; else the last safe spot. A point under the world's minimum is never used (no loop). */
  private destinoSeguro(e: number): { x: number; y: number; z: number } | null {
    const v = this.opts.suelo?.vuelta, min = this.opts.suelo ? fx(this.opts.suelo.minimo) : -Infinity;
    const fijo = v && [v.x, v.y, v.z].every(Number.isFinite) && fx(v.y) >= min ? { x: fx(v.x), y: fx(v.y), z: fx(v.z) } : null;
    if (fijo && (v!.siempre || !this.tieneSeguro[e])) return fijo;
    if (this.tieneSeguro[e]) return { x: this.seguro[e * 3], y: this.seguro[e * 3 + 1], z: this.seguro[e * 3 + 2] };
    return fijo;
  }
  /** D-045: queue the order that puts a connected avatar back on its safe spot at the next step (recorded in the replay).
   * Returns false when it is gone, already on its way, or there is nowhere safe to go (said once in the log). */
  volverASeguro(entity: number, motivo: Vuelta["motivo"] = "pedido"): boolean {
    const s = this.sim;
    if (!this.byEntity[entity] || !s.world.alive[entity] || !s.tf.has[entity] || this.pendiente.has(entity)) return false;
    const d = this.destinoSeguro(entity);
    if (!d) { if (!this.avisado) { this.avisado = true; this.opts.log?.("[suelo] no hay sitio seguro al que volver (ni última posición ni «vuelta» en entorno.json)"); } return false; }
    this.ordenes.push(entity, ORDER_PONER, d.x, d.y, d.z, 0); this.pendiente.add(entity);
    this.vueltas.push({ entity, x: fxToFloat(d.x), y: fxToFloat(d.y), z: fxToFloat(d.z), motivo });
    return true;
  }

  /** H2 historia 5: may this avatar fly — the world's `vuelo` (none = "nadie") or a feature's grant (`concederVuelo`),
   * whichever says yes. "constructores" reuses STD-052's `build-in-worlds` permission (no new role). */
  puedeVolar(entity: number): boolean {
    if (this.concedidosVuelo.has(entity)) return true;
    const vuelo = this.opts.vuelo ?? "nadie";
    if (vuelo === "todos") return true;
    if (vuelo === "constructores") return this.opts.puede?.(this.byEntity[entity]?.who ?? null, "build-in-worlds", entity) ?? false;
    return false;
  }
  /** H2 historia 5: a feature grants (or takes back) flight for one avatar, regardless of the world's `vuelo`
   * (a potion, a rank…). Forgotten when the avatar leaves. */
  concederVuelo(entity: number, concede = true): void {
    if (concede) this.concedidosVuelo.add(entity); else this.concedidosVuelo.delete(entity);
  }
  /** H2 historia 5: `api.ordenar` — make a connected avatar do something on purpose (QUIETO/EMPUJAR/SENTAR/VOLAR, or
   * PONER/the near spot of `teletransportar`). Queues for the next step (recorded, replayable); the queue itself is
   * capped per tick (ORDENES_TICK_MAX, the rest wait their turn). Returns false when the avatar is gone, a number is
   * out of range, or (`volar: true`) it has no permission (said once in the log); never throws. */
  ordenar(entity: number, orden: Orden): boolean {
    const s = this.sim;
    if (!this.byEntity[entity] || !s.world.alive[entity] || !s.tf.has[entity]) return false;
    const finite = (...ns: number[]) => ns.every((n) => Number.isFinite(n));
    if ("poner" in orden) {
      const { x, y, z } = orden.poner;
      if (!finite(x, y, z)) return false;
      this.ordenes.push(entity, ORDER_PONER, fx(x), fx(y), fx(z), 0);
      return true;
    }
    if ("cerca" in orden) {
      return this.teletransportar(entity, orden.cerca, { radios: orden.radios, rumbo: orden.rumbo, caida: orden.caida }) !== null;
    }
    if ("quieto" in orden) {
      if (!finite(orden.quieto) || orden.quieto <= 0) return false;
      const ticks = Math.min(QUIETO_MAX, Math.round(orden.quieto * 20)); // TICK_HZ
      this.ordenes.push(entity, ORDER_QUIETO, ticks, 0, 0, 0);
      return true;
    }
    if ("empujar" in orden) {
      const { vx, vy, vz } = orden.empujar;
      if (!finite(vx, vy, vz)) return false;
      this.ordenes.push(entity, ORDER_EMPUJAR, fx(vx), fx(vy), fx(vz), 0);
      return true;
    }
    if ("sentar" in orden) {
      const { x, y, z, rumbo = 0 } = orden.sentar;
      if (!finite(x, y, z, rumbo)) return false;
      this.ordenes.push(entity, ORDER_SENTAR, fx(x), fx(y), fx(z), Math.round(rumbo * 64) | 0);
      return true;
    }
    if ("volar" in orden) {
      if (orden.volar && !this.puedeVolar(entity)) {
        this.opts.log?.(`[ordenes] VOLAR rechazado (sin permiso): entidad ${entity}`);
        return false;
      }
      this.ordenes.push(entity, ORDER_VOLAR, orden.volar ? 1 : 0, 0, 0, 0);
      return true;
    }
    return false;
  }

  /** A client arrives over any transport: spawn its avatar (in the world's spawn area, if it has one), say welcome, listen. */
  connect(t: Transport, owner = this.conns.length, anfitrion?: string): number {
    const entity = spawnAvatar(this.sim, owner, this.opts.aparicion);
    const conn: Conn = { entity, transport: t, viewer: { entity, priority: new Float32Array(this.opts.capacity) }, queue: [], ack: 0, dropped: 0, bad: 0, anfitrion };
    t.onMessage((bytes) => {
      if (bytes[0] === MSG.INPUT && (bytes.length === 6 || bytes.length === 5)) { // 5 = from before J2 (no buttons)
        conn.queue.push(decodeInput(bytes));
        if (conn.queue.length > MAX_QUEUE) { conn.queue.shift(); conn.dropped++; } // faster-than-tick senders lose inputs
      } else if (bytes[0] === MSG.PING && bytes.length === 5) {
        t.send(encodePong(decodeTime(bytes)), true);
      } else if (bytes[0] === MSG.FEATURE && this.features.active) {
        if (!this.features.receive(entity, bytes)) conn.bad++;
      } else if (bytes[0] === MSG.IDENTITY && this.opts.identitySign) {
        const token = conn.who ? null : decodeIdentityRequest(bytes); // once per connection
        if (token === null) { conn.bad++; return; }
        const pase = conn.pase; conn.pase = undefined; // the pass (if the page sent one first) is used once, here
        this.identificar(entity, token, pase);
      } else if (bytes[0] === MSG.PASE && conn.who?.ia && this.opts.renovarPase) { // an AI renews its pass in mid-session
        const nuevo = decodePase(bytes), why = nuevo === null ? "mal formado" : this.opts.renovarPase(entity, nuevo);
        if (why !== null) { conn.bad++; this.opts.log?.(`[pase] renovación rechazada para ${conn.who.id}: ${why}`); }
      } else if (bytes[0] === MSG.PASE) { // H3b: before IDENTITY, once. Refused (counted, never thrown, connection kept) when late, repeated or malformed
        const pase = conn.who || conn.pase !== undefined ? null : decodePase(bytes);
        if (pase === null) conn.bad++;
        else if (this.opts.identitySign && this.opts.credencial) conn.pase = pase; // a world that takes no passes ignores it (the person enters as a guest)
      } else if (bytes[0] === MSG.VOICE) {
        const sinVoz = typeof this.opts.sinVoz === "function" ? this.opts.sinVoz() : this.opts.sinVoz;
        if (!sinVoz) this.relayVoice(conn, bytes);
      } else if (bytes[0] === MSG.REPORT) {
        const r = decodeReport(bytes);
        if (!r) conn.bad++; else this.opts.onReport?.(entity, r); // no listener (tests, bots): ignored
      } else conn.bad++; // unknown or malformed: counted, never thrown
    });
    this.conns.push(conn);
    this.byEntity[entity] = conn;
    this.tieneSeguro[entity] = 0; this.guardarSeguro(entity); // D-045: where you appear is safe (if it is over the world's minimum)
    const ref = this.opts.reference ?? { seed: 0, ticks: 0, n: 0, hash: 0 };
    t.send(encodeWelcome({ entity, tick: this.sim.tick, x: this.sim.tf.cols.x[entity], z: this.sim.tf.cols.z[entity], ref }), true);
    this.features.join(entity); // catalog + shared state, only if this instance runs features
    return entity;
  }

  /** I1/P4/H3b: who a connection is, once. `token` = the guest token it kept ("" = none) or an agent ticket; `pase` = the
   * numinia.com world pass it brought, if any (H3b). With a pass the world's `credencial` may name the person (their
   * numinia.com id, name and roles) instead of the guest; the guest token is still answered, so the browser keeps it.
   * The wire carries it in PASE (net, type 12), sent before IDENTITY; the message handler above hands it over here. */
  identificar(entity: number, token: string, pase?: string): void {
    const conn = this.byEntity[entity];
    if (!conn || conn.who || !this.opts.identitySign) return;
    const sign = this.opts.identitySign, day = today(this.opts.now?.());
    if (token.startsWith("a1.")) { // P4: an AI inhabitant; its name comes from the world and always says « · IA»
      const ag = this.opts.agentes, id = ag ? verificarAgente(ag.sign, token, day) : null, nombre = id ? ag!.nombre(id) : null;
      if (!id || !nombre) { conn.bad++; this.opts.log?.(`[agentes] billete de agente rechazado (${id ? `«${id}» no es habitante de este mundo` : "firma o fecha"})`); return; }
      conn.who = agenteDe(id, nombre);
      conn.transport.send(encodeIdentity({ token, id: conn.who.id, nombre: conn.who.nombre }), true);
      this.features.identify(entity);
      return;
    }
    if (token.startsWith("a2.")) { // ADR-080: an outside agent signs with its own key; the world lists the public one
      const r = this.opts.externos?.verificar(token, conn.anfitrion) ?? null;
      if (!r) { conn.bad++; if (!this.opts.externos) this.opts.log?.("[agentes] billete de agente de fuera rechazado (este servidor no tiene puerta para agentes)"); return; }
      conn.who = agenteDe(r.id, r.nombre);
      conn.transport.send(encodeIdentity({ token: "", id: conn.who.id, nombre: conn.who.nombre }), true); // the ticket is never echoed
      this.features.identify(entity);
      return;
    }
    const ok = token ? verificar(sign, token, day) : null;
    const id = ok?.id ?? nuevoId(this.opts.random ?? Math.random);
    const invitado: Who = { id, nombre: nombreDe(id) };
    // a pass the world accepts replaces the guest (same person on two devices = one person); one it refuses leaves the guest
    const persona = pase !== undefined && this.opts.credencial ? this.opts.credencial(entity, pase, invitado) : null;
    conn.who = persona ?? invitado;
    if (persona) conn.invitado = id;
    conn.transport.send(encodeIdentity({ token: ok && !ok.renovar ? token : emitir(sign, id, day), ...conn.who }), true);
    this.features.identify(entity);
  }

  disconnect(entity: number): void {
    const i = this.conns.findIndex((c) => c.entity === entity);
    if (i < 0) return;
    this.conns.splice(i, 1);
    this.byEntity[entity] = undefined;
    this.features.leave(entity); // still has a position here; no longer among the players
    this.sim.world.despawn(entity);
    this.tieneSeguro[entity] = 0; this.pendiente.delete(entity);
  }

  /** Convenience for headless runs: a loopback pair whose client end is returned. */
  join(owner: number, anfitrion?: string): Transport & { flush(): void } {
    const [server, client] = loopbackPair();
    this.connect(server, owner, anfitrion);
    return client;
  }

  /** B2: what each phase of the LAST tick cost, in ms (wall clock), in the order of FASES_TICK. The server copies it into
   * its windows right after tick() (server/metrics.ts); nothing here keeps history and nothing here touches the sim. */
  readonly fasesMs = new Float64Array(FASES_TICK.length);

  tick(): void {
    const f = this.fasesMs;
    let a = performance.now(), b = a;
    for (const c of this.conns) c.transport.flush?.();
    // only avatars whose input arrived advance this tick (gravity too): one input = one step of the owner's clock,
    // so the owner's prediction stays exact when an input comes late (J2)
    const inputs = new Int32Array(this.conns.length * INPUT_STRIDE);
    let n = 0;
    for (const c of this.conns) {
      const m = c.queue.shift();
      if (!m) continue;
      const o = n++ * INPUT_STRIDE;
      inputs[o] = c.entity; inputs[o + 1] = m.mx; inputs[o + 2] = m.mz; inputs[o + 3] = m.buttons; c.ack = m.seq;
    }
    b = performance.now(); f[0] = b - a; a = b; // entradas
    if (this.features.stateVersion !== this.solidsVersion) { this.solidsVersion = this.features.stateVersion; setSolids(this.sim, solidsFrom(this.features.allState())); } // U10
    if (this.opts.construirMalla && !this.mallaBuilding && this.features.stateVersion !== this.mallaVersion) this.reconstruirMalla();
    b = performance.now(); f[1] = b - a; a = b; // solidos
    // H2 historia 5: at most ORDENES_TICK_MAX orders go into this step; the rest stay queued, in order, for the next one.
    const capInts = ORDENES_TICK_MAX * ORDER_STRIDE;
    const take = this.ordenes.slice(0, capInts); this.ordenes = this.ordenes.slice(capInts);
    const ordenes = take.length ? Int32Array.from(take) : undefined; this.pendiente.clear();
    if (ordenes) this.opts.log?.(`[suelo] tick ${this.sim.tick}: ${ordenes.length / ORDER_STRIDE} orden(es) aplicada(s)${this.ordenes.length ? `, ${this.ordenes.length / ORDER_STRIDE} esperando` : ""}`);
    step(this.sim, inputs.subarray(0, n * INPUT_STRIDE), ordenes); // authority (D-045/H2: orders first, recorded with the inputs)
    b = performance.now(); f[2] = b - a; a = b; // simulacion
    if (this.sim.tick % SEGURO_CADA === 0) { // D-045: every half second, keep the safe spot; under the floor, order the return
      const s = this.sim, min = this.opts.suelo ? fx(this.opts.suelo.minimo) : null;
      for (const c of this.conns) {
        if (min !== null && s.tf.cols.y[c.entity] < min) this.volverASeguro(c.entity, "caida");
        else this.guardarSeguro(c.entity);
      }
    }
    b = performance.now(); f[3] = b - a; a = b; // seguro
    this.features.tick();   // game features: queued intents, then their tick hooks (no effect on the sim)
    b = performance.now(); f[4] = b - a; a = b; // piezas
    if (this.sim.tick % this.opts.snapshotEvery === 0) { // 20 Hz sim, 10 Hz snapshots by default
      const grid = buildGrid(this.sim);
      for (const c of this.conns) {
        const visible = selectVisible(this.sim, grid, c.viewer, this.opts.k);
        c.visible = visible;
        c.transport.send(encodeSnapshot(this.sim, c.entity, c.ack, visible), false);
      }
    }
    f[5] = performance.now() - a; // instantaneas
  }

  /** N16: move a connected avatar on purpose (a feature asked: «ir con», a photo's place) to the first free spot near
   * `cerca` (metres; `radios` rings, heading `rumbo` 0-7, at most `caida` m under `cerca.y`: sim `sitioLibre`), standing
   * still on its floor. Returns where it stands (metres) or null (gone, or no free spot: nothing moved). The owner's page
   * gets its new body in the next snapshot and replays its pending inputs from there (client reconcile). Outside `step`
   * and the reference recording: the fingerprint never sees it. */
  teletransportar(entity: number, cerca: { x: number; y: number; z: number }, o: { radios?: readonly number[]; rumbo?: number; caida?: number } = {}): { x: number; y: number; z: number } | null {
    const s = this.sim;
    if (!this.byEntity[entity] || !s.world.alive[entity] || !s.tf.has[entity]) return null;
    if (![cerca.x, cerca.y, cerca.z].every(Number.isFinite)) return null;
    const p = sitioLibre(s, fx(cerca.x), fx(cerca.y), fx(cerca.z), o.radios ?? [0], o.rumbo ?? 0, o.caida ?? 1);
    if (!p) return null;
    s.tf.cols.x[entity] = p.x; s.tf.cols.y[entity] = p.y; s.tf.cols.z[entity] = p.z;
    s.mo.cols.vy[entity] = 0; s.mo.cols.air[entity] = 0; s.mo.cols.buf[entity] = 0;
    return { x: fxToFloat(p.x), y: fxToFloat(p.y), z: fxToFloat(p.z) };
  }

  /** I1: the guest behind a connected entity (null for bots and before the page showed its token). */
  who(entity: number): Who | null { return this.byEntity[entity]?.who ?? null; }

  /** M6 h12: a ray from this player's eyes (EYE_HEIGHT_M over its feet) in direction `dir`, against the world's
   * collision mesh (`sim.mesh`, set by M6's server wiring; none yet = always null — darts and fishing get a clean
   * "nothing there" until a world has a `malla` thing). `dir` need not be unit length; a zero vector is a miss. */
  rayo(entity: number, dir: { x: number; y: number; z: number }, max: number): RayHit | null {
    const s = this.sim;
    if (!this.byEntity[entity] || !s.world.alive[entity] || !s.tf.has[entity] || !s.mesh) return null;
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (!(len > 0) || !(max > 0)) return null;
    const ox = s.tf.cols.x[entity], oy = s.tf.cols.y[entity] + EYE_HEIGHT, oz = s.tf.cols.z[entity];
    const dx = fx(dir.x / len), dy = fx(dir.y / len), dz = fx(dir.z / len);
    const hit = rayBvh(s.mesh, ox, oy, oz, dx, dy, dz, fx(max));
    if (!hit) return null;
    return { x: fxToFloat(hit.x), y: fxToFloat(hit.y), z: fxToFloat(hit.z), nx: fxToFloat(hit.nx), ny: fxToFloat(hit.ny), nz: fxToFloat(hit.nz), distancia: fxToFloat(hit.t) };
  }

  private solidsVersion = -1;
  private mallaVersion = -1;
  private mallaBuilding = false;
  /** M6 h8: rebuilds the world's collision mesh off the tick (async: fetching and parsing .glb files is not a 20 Hz
   * job). Captures the state version before starting; if the state moved on again while building, the next tick's
   * check (`stateVersion !== mallaVersion`) sees it and starts over — never two builds in flight at once. Not part
   * of the fingerprint: `setMesh` is the same no-op-on-replay side door `setSolids` already uses for U10's boxes. */
  private reconstruirMalla(): void {
    const version = this.features.stateVersion, snapshot = [...this.features.allState()];
    this.mallaVersion = version; this.mallaBuilding = true;
    this.opts.construirMalla!(snapshot)
      .then((mesh) => { setMesh(this.sim, mesh); })
      .catch((e) => { this.opts.log?.(`[malla] no se pudo construir la malla del mundo: ${String((e as Error)?.message ?? e)}`); })
      .finally(() => { this.mallaBuilding = false; });
  }
  /** U10: who hears a voice frame — players that have the speaker in their area of interest and within VOZ_RADIO_M.
   * Never everyone, never stored, never decoded. Over VOZ_TRAMAS_S frames a second the rest are dropped.
   * M17 trozo 1: a listener hears at most VOZ_TOPE voices at once — the nearest speakers that spoke in the last second
   * (`elegirVoces`, pure, in net/voz.ts). The chosen set is cached per listener and recomputed when a speaker it has not
   * considered starts, or every 10 ticks (half a second): cost O(listeners × speakers), small, never per frame.
   * Stage (`escenario`): the DOCUMENTED EXCEPTION to AGENTS rule 4 («never broadcast to everyone»). A speaker whom
   * moderation put on stage (/escenario, roles-mundo.ts) is heard by every connected page, whatever its area of interest
   * or distance, with the VOZ_ESCENARIO flag so the page plays it unpanned: one or two voices for all — the same fan-out
   * as the zone chat, only for whoever moderation chose, never for the crowd. Stage voices do not count against the cap. */
  readonly vozStats = { recibidas: 0, enviadas: 0, descartadas: 0, escenario: 0 };
  private relayVoice(from: Conn, bytes: Uint8Array): void {
    const v = leerVozSubida(bytes);
    if (!v) { from.bad++; return; }
    const now = this.sim.tick, w = (from.voz ??= { desde: now, n: 0 });
    if (now - w.desde >= 20) { w.desde = now; w.n = 0; } // 20 ticks = 1 s
    if (++w.n > VOZ_TRAMAS_S) { this.vozStats.descartadas++; return; }
    this.vozStats.recibidas++;
    from.vozUltima = now;
    const e = from.entity;
    if (this.opts.escenario?.(e)) { // stage: everyone connected, unpanned (see above)
      const out = codificarVozBajada(bytes, e, true);
      for (const c of this.conns) { if (c === from) continue; c.transport.send(out, false); this.vozStats.enviadas++; }
      this.vozStats.escenario++;
      return;
    }
    const X = this.sim.tf.cols.x, Z = this.sim.tf.cols.z, r2 = (VOZ_RADIO_M * FX_ONE) ** 2;
    let out: Uint8Array | null = null;
    for (const c of this.conns) {
      if (c === from || !c.visible?.includes(e)) continue;
      const dx = X[c.entity] - X[e], dz = Z[c.entity] - Z[e];
      if (dx * dx + dz * dz > r2) continue;
      if (this.opts.oye && !this.opts.oye(e, c.entity)) continue; // F1: silenced by the world's roles, or blocked by this listener
      if (!this.elegida(c, e, now)) continue;
      out ??= codificarVozBajada(bytes, e);
      c.transport.send(out, false); this.vozStats.enviadas++;
    }
  }
  /** M17: does listener `c` hear speaker `e` now? Among the VOZ_TOPE nearest of those speaking in the last second. */
  private elegida(c: Conn, e: number, now: number): boolean {
    let o = c.vozOidas;
    if (!o || now - o.tick >= 10 || !o.considerados.has(e)) {
      const X = this.sim.tf.cols.x, Z = this.sim.tf.cols.z, visible = c.visible ?? [];
      const hablantes: { id: number; x: number; z: number; escenario: boolean; visible: boolean }[] = [];
      for (const h of this.conns) {
        if (h === c || h.vozUltima === undefined || now - h.vozUltima >= 20) continue;
        hablantes.push({ id: h.entity, x: fxToFloat(X[h.entity]), z: fxToFloat(Z[h.entity]), escenario: this.opts.escenario?.(h.entity) ?? false, visible: visible.includes(h.entity) });
      }
      const oyente = { x: fxToFloat(X[c.entity]), z: fxToFloat(Z[c.entity]) };
      o = c.vozOidas = { tick: now, considerados: new Set(hablantes.map((h) => h.id)), elegidas: new Set(elegirVoces(oyente, hablantes, VOZ_TOPE, VOZ_RADIO_M)) };
    }
    return o.elegidas.has(e);
  }
  hash(): number { return stateHash(this.sim); }
  sentBytes(): number { return this.conns.reduce((n, c) => n + c.transport.sentBytes, 0); }
}

/** A headless bot: speaks the real protocol over any transport, wanders with its own seeded RNG
 * and drifts back towards the centre of the plaza when it strays beyond ~20 m. J2: it runs on some
 * stretches (one in four) and hops now and then (about every 8 s), so the plaza shows both. */
export class Bot {
  readonly t: Transport;
  readonly rng: Uint32Array;
  entity = -1; seq = 0; mx = 0; mz = 0; run = false; seen = 0; lastTick = 0; x = 0; z = 0;
  constructor(t: Transport, seed: number) {
    this.t = t; this.rng = new Uint32Array([seed >>> 0]);
    t.onMessage((bytes) => {
      if (bytes[0] === MSG.WELCOME) { const w = decodeWelcome(bytes); this.entity = w.entity; this.x = w.x; this.z = w.z; }
      else if (bytes[0] === MSG.SNAPSHOT) { const s = decodeSnapshot(bytes); if (s) { this.seen = s.others.length; this.lastTick = s.tick; this.x = s.self.x; this.z = s.self.z; } }
    });
  }
  think(): void {
    this.t.flush?.();
    if (rngNext(this.rng) % 20 === 0) { // change direction about once a second
      this.mx = (rngNext(this.rng) % 255) - 127;
      this.mz = (rngNext(this.rng) % 255) - 127;
      this.run = rngNext(this.rng) % 4 === 0;
      const far = 20 * 65536;              // 20 m in Q16.16
      if (this.x > far) this.mx = -Math.abs(this.mx); else if (this.x < -far) this.mx = Math.abs(this.mx);
      if (this.z > far) this.mz = -Math.abs(this.mz); else if (this.z < -far) this.mz = Math.abs(this.mz);
    }
    const hop = rngNext(this.rng) % 160 === 0;
    this.seq = (this.seq + 1) & 0xffff;
    this.t.send(encodeInput(this.seq, this.mx, this.mz, (hop ? BTN_JUMP : 0) | (this.run ? BTN_RUN : 0)), false);
  }
}
