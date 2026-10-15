// instance: the authoritative server loop, wired to clients through the Transport interface.
// The same code runs over in-memory loopback (tests, headless runs) and over WebSocket (server).
import { rngNext, fxToFloat } from "../../core/src/index.ts";
import { createSim, spawnAvatar, step, stateHash } from "../../sim/src/index.ts";
import type { SimState } from "../../sim/src/index.ts";
import {
  MSG, buildGrid, selectVisible, encodeSnapshot, decodeSnapshot, encodeInput, decodeInput,
  encodePong, decodeTime, encodeWelcome, decodeWelcome, loopbackPair, decodeReport,
  decodeIdentityRequest, encodeIdentity,
} from "../../net/src/index.ts";
import { emitir, nombreDe, nuevoId, today, verificar } from "./identidad.ts";
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
};

/** Inputs wait in a queue; the server applies exactly ONE per tick (none = stand still). */
export const MAX_QUEUE = 8;

type Conn = {
  entity: number; transport: Transport; viewer: Viewer;
  queue: { seq: number; mx: number; mz: number }[]; ack: number; dropped: number; bad: number;
  who?: Who; // I1: set once the page shows (or asks for) its guest token
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
      position: (e) => (this.sim.world.alive[e] && tf.has[e] ? { x: fxToFloat(tf.cols.x[e]), z: fxToFloat(tf.cols.z[e]) } : null),
      send: (e, bytes) => this.byEntity[e]?.transport.send(bytes, true),
      tick: () => this.sim.tick,
      log: opts.log ?? (() => {}),
      sign: opts.sign,
      storage: opts.storage,
      who: (e) => this.byEntity[e]?.who ?? null,
    });
  }

  /** A client arrives over any transport: spawn its avatar, say welcome, listen. */
  connect(t: Transport, owner = this.conns.length): number {
    const entity = spawnAvatar(this.sim, owner);
    const conn: Conn = { entity, transport: t, viewer: { entity, priority: new Float32Array(this.opts.capacity) }, queue: [], ack: 0, dropped: 0, bad: 0 };
    t.onMessage((bytes) => {
      if (bytes[0] === MSG.INPUT && bytes.length === 5) {
        conn.queue.push(decodeInput(bytes));
        if (conn.queue.length > MAX_QUEUE) { conn.queue.shift(); conn.dropped++; } // faster-than-tick senders lose inputs
      } else if (bytes[0] === MSG.PING && bytes.length === 5) {
        t.send(encodePong(decodeTime(bytes)), true);
      } else if (bytes[0] === MSG.FEATURE && this.features.active) {
        if (!this.features.receive(entity, bytes)) conn.bad++;
      } else if (bytes[0] === MSG.IDENTITY && this.opts.identitySign) {
        const token = conn.who ? null : decodeIdentityRequest(bytes); // once per connection
        if (token === null) { conn.bad++; return; }
        const sign = this.opts.identitySign, day = today(this.opts.now?.());
        const ok = token ? verificar(sign, token, day) : null;
        const id = ok?.id ?? nuevoId(this.opts.random ?? Math.random);
        conn.who = { id, nombre: nombreDe(id) };
        t.send(encodeIdentity({ token: ok && !ok.renovar ? token : emitir(sign, id, day), ...conn.who }), true);
        this.features.identify(entity);
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

  disconnect(entity: number): void {
    const i = this.conns.findIndex((c) => c.entity === entity);
    if (i < 0) return;
    this.conns.splice(i, 1);
    this.byEntity[entity] = undefined;
    this.features.leave(entity); // still has a position here; no longer among the players
    this.sim.world.despawn(entity);
  }

  /** Convenience for headless runs: a loopback pair whose client end is returned. */
  join(owner: number): Transport & { flush(): void } {
    const [server, client] = loopbackPair();
    this.connect(server, owner);
    return client;
  }

  tick(): void {
    for (const c of this.conns) c.transport.flush?.();
    const inputs = new Int32Array(this.conns.length * 3);
    this.conns.forEach((c, i) => {
      const m = c.queue.shift();
      inputs[i * 3] = c.entity;
      if (m) { inputs[i * 3 + 1] = m.mx; inputs[i * 3 + 2] = m.mz; c.ack = m.seq; }
    });
    step(this.sim, inputs); // authority
    this.features.tick();   // game features: queued intents, then their tick hooks (no effect on the sim)
    if (this.sim.tick % this.opts.snapshotEvery === 0) { // 20 Hz sim, 10 Hz snapshots by default
      const grid = buildGrid(this.sim);
      for (const c of this.conns) {
        const visible = selectVisible(this.sim, grid, c.viewer, this.opts.k);
        c.transport.send(encodeSnapshot(this.sim, c.entity, c.ack, visible), false);
      }
    }
  }

  /** I1: the guest behind a connected entity (null for bots and before the page showed its token). */
  who(entity: number): Who | null { return this.byEntity[entity]?.who ?? null; }

  hash(): number { return stateHash(this.sim); }
  sentBytes(): number { return this.conns.reduce((n, c) => n + c.transport.sentBytes, 0); }
}

/** A headless bot: speaks the real protocol over any transport, wanders with its own seeded RNG
 * and drifts back towards the centre of the plaza when it strays beyond ~20 m. */
export class Bot {
  readonly t: Transport;
  readonly rng: Uint32Array;
  entity = -1; seq = 0; mx = 0; mz = 0; seen = 0; lastTick = 0; x = 0; z = 0;
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
      const far = 20 * 65536;              // 20 m in Q16.16
      if (this.x > far) this.mx = -Math.abs(this.mx); else if (this.x < -far) this.mx = Math.abs(this.mx);
      if (this.z > far) this.mz = -Math.abs(this.mz); else if (this.z < -far) this.mz = Math.abs(this.mz);
    }
    this.seq = (this.seq + 1) & 0xffff;
    this.t.send(encodeInput(this.seq, this.mx, this.mz), false);
  }
}
