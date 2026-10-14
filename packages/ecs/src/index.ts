// ecs: entities + components stored in columns (one Int32Array per field). Iteration order is
// always ascending entity id: never iterate a Map/Set to decide anything.
import type { Schema } from "../../schema/src/index.ts";
import { fx } from "../../core/src/index.ts";

export type Column = Int32Array;
export type Store = { schema: Schema; has: Uint8Array; cols: Record<string, Column> };

export class World {
  readonly capacity: number;
  readonly alive: Uint8Array;
  readonly generation: Uint16Array;
  readonly stores = new Map<string, Store>(); // lookup only; never iterated in decisions
  private free: number[] = [];
  private next = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.alive = new Uint8Array(capacity);
    this.generation = new Uint16Array(capacity);
  }

  register(schema: Schema): Store {
    const cols: Record<string, Column> = {};
    for (const k of Object.keys(schema.fields)) cols[k] = new Int32Array(this.capacity);
    const store = { schema, has: new Uint8Array(this.capacity), cols };
    this.stores.set(schema.name, store);
    return store;
  }

  spawn(): number {
    // reuse the lowest free id so allocation is deterministic
    let id: number;
    if (this.free.length) { this.free.sort((a, b) => a - b); id = this.free.shift()!; }
    else { if (this.next >= this.capacity) throw new Error("world full"); id = this.next++; }
    this.alive[id] = 1;
    return id;
  }

  despawn(id: number): void {
    if (!this.alive[id]) return;
    this.alive[id] = 0;
    this.generation[id]++;
    for (const s of this.stores.values()) s.has[id] = 0; // order-independent
    this.free.push(id);
  }

  add(store: Store, id: number, values: Record<string, number | boolean> = {}): void {
    store.has[id] = 1;
    for (const [k, f] of Object.entries(store.schema.fields)) {
      const v = values[k] ?? f.default ?? 0;
      store.cols[k][id] = f.kind === "fixed" ? fx(v as number) : Number(v) | 0;
    }
  }

  /** Entities that have every given store, ascending id. */
  query(...stores: Store[]): number[] {
    const out: number[] = [];
    for (let id = 0; id < this.next; id++) {
      if (!this.alive[id]) continue;
      let ok = true;
      for (const s of stores) if (!s.has[id]) { ok = false; break; }
      if (ok) out.push(id);
    }
    return out;
  }

  get highWater(): number { return this.next; }
}
