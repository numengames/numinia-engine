// instance: the authoritative server loop, wired to clients through the Transport interface.
// PP0 runs it in memory with loopback transports; PP1 swaps in WebSocket without touching this logic.
import { rngNext } from "../../core/src/index.ts";
import { createSim, spawnAvatar, step, stateHash } from "../../sim/src/index.ts";
import type { SimState } from "../../sim/src/index.ts";
import { buildGrid, selectVisible, encodeSnapshot, decodeSnapshot, encodeInput, decodeInput, loopbackPair } from "../../net/src/index.ts";
import type { Transport, Viewer } from "../../net/src/index.ts";

export type InstanceOptions = { seed: number; capacity: number; k: number; snapshotEvery: number };

type Conn = { entity: number; transport: Transport & { flush(): void }; viewer: Viewer; mx: number; mz: number };

export class Instance {
  readonly sim: SimState;
  readonly opts: InstanceOptions;
  readonly conns: Conn[] = []; // array, join order = deterministic order
  constructor(opts: InstanceOptions) { this.opts = opts; this.sim = createSim(opts.capacity, opts.seed); }

  /** A client joins: returns the client end of a loopback pair. */
  join(owner: number): Transport & { flush(): void } {
    const [server, client] = loopbackPair();
    const entity = spawnAvatar(this.sim, owner);
    const conn: Conn = { entity, transport: server, viewer: { entity, priority: new Float64Array(this.opts.capacity) }, mx: 0, mz: 0 };
    server.onMessage((bytes) => { const m = decodeInput(bytes); conn.mx = m.mx; conn.mz = m.mz; }); // last input wins this tick
    this.conns.push(conn);
    return client;
  }

  tick(): void {
    for (const c of this.conns) c.transport.flush();          // read inputs
    const inputs = new Int32Array(this.conns.length * 3);
    this.conns.forEach((c, i) => { inputs[i * 3] = c.entity; inputs[i * 3 + 1] = c.mx; inputs[i * 3 + 2] = c.mz; });
    step(this.sim, inputs);                                    // authority
    if (this.sim.tick % this.opts.snapshotEvery === 0) {       // 20 Hz sim, 10 Hz snapshots by default
      const grid = buildGrid(this.sim);
      for (const c of this.conns) {
        const visible = selectVisible(this.sim, grid, c.viewer, this.opts.k);
        c.transport.send(encodeSnapshot(this.sim, c.entity, visible), false);
      }
    }
  }

  hash(): number { return stateHash(this.sim); }
  sentBytes(): number { return this.conns.reduce((n, c) => n + c.transport.sentBytes, 0); }
}

/** A headless bot: speaks the real protocol, wanders with its own seeded RNG. */
export class Bot {
  readonly t: Transport & { flush(): void };
  readonly rng: Uint32Array;
  seq = 0; mx = 0; mz = 0; seen = 0; lastTick = 0;
  constructor(t: Transport & { flush(): void }, seed: number) {
    this.t = t; this.rng = new Uint32Array([seed >>> 0]);
    t.onMessage((bytes) => { const s = decodeSnapshot(bytes); this.seen = s.others.length; this.lastTick = s.tick; });
  }
  think(): void {
    this.t.flush();
    if (rngNext(this.rng) % 20 === 0) { // change direction about once a second
      this.mx = (rngNext(this.rng) % 255) - 127;
      this.mz = (rngNext(this.rng) % 255) - 127;
    }
    this.t.send(encodeInput(this.seq++, this.mx, this.mz), false);
  }
}
