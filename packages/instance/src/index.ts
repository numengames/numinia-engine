// instance: the authoritative server loop, wired to clients through the Transport interface.
// The same code runs over in-memory loopback (tests, headless runs) and over WebSocket (server).
import { rngNext, fxToFloat, FX_ONE } from "../../core/src/index.ts";
import { createSim, spawnAvatar, step, stateHash, setSolids, solidsFrom, BTN_JUMP, BTN_RUN, INPUT_STRIDE } from "../../sim/src/index.ts";
import type { SimState, SpawnArea } from "../../sim/src/index.ts";
import {
  MSG, buildGrid, selectVisible, encodeSnapshot, decodeSnapshot, encodeInput, decodeInput,
  encodePong, decodeTime, encodeWelcome, decodeWelcome, loopbackPair, decodeReport,
  decodeIdentityRequest, decodePase, encodeIdentity, leerVozSubida, codificarVozBajada, VOZ_RADIO_M, VOZ_TRAMAS_S,
} from "../../net/src/index.ts";
import { agenteDe, emitir, nombreDe, nuevoId, today, verificar, verificarAgente } from "./identidad.ts";
import type { Who } from "./identidad.ts";
export type { Who } from "./identidad.ts";
import type { Transport, Viewer, Welcome } from "../../net/src/index.ts";
import { ServerRuntime } from "../../feature/src/index.ts";
import type { FeatureStorage, ServerPart } from "../../feature/src/index.ts";

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
  sinVoz?: boolean | (() => boolean); // U10: true = voice frames are not relayed; a function is asked at every frame (the world's /voz)
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
};

/** Inputs wait in a queue; the server applies exactly ONE per tick (none = that avatar does not advance: J2). */
export const MAX_QUEUE = 8;

type Conn = {
  entity: number; transport: Transport; viewer: Viewer;
  queue: { seq: number; mx: number; mz: number; buttons: number }[]; ack: number; dropped: number; bad: number;
  who?: Who; // I1: set once the page shows (or asks for) its guest token
  invitado?: string; // H3b: the guest id behind a numinia.com person (the page's guest token still names it: uploads)
  pase?: string; // H3b: the world pass the page sent (PASE), held until its IDENTITY arrives, then handed to identificar and forgotten
  visible?: number[]; // J3: who its last snapshot carried (features ask with api.visible: names over heads)
  voz?: { desde: number; n: number }; // U10: voice frames this second (rate cap)
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
      visible: (e) => this.byEntity[e]?.visible ?? [],
      aventura: opts.aventura,
    });
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
  }

  /** Convenience for headless runs: a loopback pair whose client end is returned. */
  join(owner: number, anfitrion?: string): Transport & { flush(): void } {
    const [server, client] = loopbackPair();
    this.connect(server, owner, anfitrion);
    return client;
  }

  tick(): void {
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
    if (this.features.stateVersion !== this.solidsVersion) { this.solidsVersion = this.features.stateVersion; setSolids(this.sim, solidsFrom(this.features.allState())); } // U10
    step(this.sim, inputs.subarray(0, n * INPUT_STRIDE)); // authority
    this.features.tick();   // game features: queued intents, then their tick hooks (no effect on the sim)
    if (this.sim.tick % this.opts.snapshotEvery === 0) { // 20 Hz sim, 10 Hz snapshots by default
      const grid = buildGrid(this.sim);
      for (const c of this.conns) {
        const visible = selectVisible(this.sim, grid, c.viewer, this.opts.k);
        c.visible = visible;
        c.transport.send(encodeSnapshot(this.sim, c.entity, c.ack, visible), false);
      }
    }
  }

  /** I1: the guest behind a connected entity (null for bots and before the page showed its token). */
  who(entity: number): Who | null { return this.byEntity[entity]?.who ?? null; }

  private solidsVersion = -1;
  /** U10: who hears a voice frame — players that have the speaker in their area of interest and within VOZ_RADIO_M.
   * Never everyone, never stored, never decoded. Over VOZ_TRAMAS_S frames a second the rest are dropped. */
  readonly vozStats = { recibidas: 0, enviadas: 0, descartadas: 0 };
  private relayVoice(from: Conn, bytes: Uint8Array): void {
    const v = leerVozSubida(bytes);
    if (!v) { from.bad++; return; }
    const now = this.sim.tick, w = (from.voz ??= { desde: now, n: 0 });
    if (now - w.desde >= 20) { w.desde = now; w.n = 0; } // 20 ticks = 1 s
    if (++w.n > VOZ_TRAMAS_S) { this.vozStats.descartadas++; return; }
    this.vozStats.recibidas++;
    const X = this.sim.tf.cols.x, Z = this.sim.tf.cols.z, e = from.entity, r2 = (VOZ_RADIO_M * FX_ONE) ** 2;
    let out: Uint8Array | null = null;
    for (const c of this.conns) {
      if (c === from || !c.visible?.includes(e)) continue;
      const dx = X[c.entity] - X[e], dz = Z[c.entity] - Z[e];
      if (dx * dx + dz * dz > r2) continue;
      out ??= codificarVozBajada(bytes, e);
      c.transport.send(out, false); this.vozStats.enviadas++;
    }
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
