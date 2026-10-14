// client: the browser-side netcode. No DOM and no renderer here, so it runs (and is tested) in Node.
// Own avatar: predicted with the SAME sim step the server runs, reconciled exactly on each snapshot.
// Others: drawn slightly in the past, interpolated between snapshots.
import { fxToFloat } from "../../core/src/index.ts";
import { createSim, spawnAvatar, step, TICK_HZ } from "../../sim/src/index.ts";
import type { SimState } from "../../sim/src/index.ts";
import { MSG, decodeSnapshot, decodeWelcome, decodeTime, encodeInput, encodePing, seqNewer } from "../../net/src/index.ts";
import type { Transport, Welcome } from "../../net/src/index.ts";

export const INTERP_TICKS = 3;   // draw others 150 ms in the past (1.5 snapshot intervals at 10 Hz)
export const FORGET_TICKS = 40;  // drop a remote not heard of for 2 s
const MAX_SAMPLES = 16;

type Sample = { tick: number; x: number; z: number };

/** Port the instance server listens on when you run it locally (npm run server). */
export const DEV_SERVER_PORT = 8790;

/**
 * Where the page finds its instance server, given where the page was loaded from.
 * - `?server=ws://…` in the page address always wins.
 * - On this machine (localhost, 127.x, ::1) → `ws://<host>:8790` (the dev server, no proxy).
 * - Anywhere else → the same origin, path `/ws` (`wss://` when the page is https). This is how a
 *   deployed server works: Caddy serves the page and passes `/ws` to the instance (deploy/).
 */
export function serverUrl(loc: { protocol: string; hostname: string; host: string; search: string }): string {
  const forced = new URLSearchParams(loc.search).get("server");
  if (forced) return forced;
  const h = loc.hostname;
  if (h === "localhost" || h === "::1" || h === "[::1]" || h.startsWith("127.")) return `ws://${h}:${DEV_SERVER_PORT}`;
  return `${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/ws`;
}

export class ClientSession {
  readonly t: Transport;
  entity = -1;
  welcome: Welcome | null = null;
  private seq = 0;
  private pending: { seq: number; mx: number; mz: number }[] = [];
  private readonly local: SimState;         // a one-avatar sim used only for prediction
  private prev = { x: 0, z: 0 };            // predicted position one client tick ago (fixed point)
  private cur = { x: 0, z: 0 };             // predicted position now (fixed point)
  private remotes = new Map<number, { samples: Sample[]; lastTick: number }>();
  private offset = 0;                       // server tick minus local tick clock
  private hasClock = false;
  stats = { snapshots: 0, corrections: 0, rttMs: -1, visible: 0, lastServerTick: 0 };

  constructor(t: Transport) {
    this.t = t;
    this.local = createSim(1, 0);
    spawnAvatar(this.local, 0);
    t.onMessage((bytes) => this.handle(bytes, nowMs()));
  }

  /** One client tick (20 Hz): send the input and predict its effect immediately. */
  tick(mx: number, mz: number): void {
    if (this.entity < 0) return;
    this.seq = (this.seq + 1) & 0xffff;
    this.t.send(encodeInput(this.seq, mx, mz), false);
    this.pending.push({ seq: this.seq, mx, mz });
    if (this.pending.length > 64) this.pending.shift();
    this.prev = { ...this.cur };
    step(this.local, new Int32Array([0, mx, mz]));
    this.cur = { x: this.local.tf.cols.x[0], z: this.local.tf.cols.z[0] };
  }

  ping(now = nowMs()): void { this.t.send(encodePing(now >>> 0), true); }

  handle(bytes: Uint8Array, now: number): void {
    const type = bytes[0];
    if (type === MSG.WELCOME) {
      const w = decodeWelcome(bytes);
      this.welcome = w; this.entity = w.entity;
      this.setLocal(w.x, w.z); this.prev = { ...this.cur };
      this.syncClock(w.tick, now, true);
    } else if (type === MSG.SNAPSHOT) {
      const s = decodeSnapshot(bytes);
      if (!s) return;
      this.stats.snapshots++; this.stats.visible = s.others.length; this.stats.lastServerTick = s.tick;
      this.syncClock(s.tick, now, false);
      this.reconcile(s.self.x, s.self.z, s.ack);
      for (const o of s.others) {
        let r = this.remotes.get(o.id);
        if (!r) this.remotes.set(o.id, (r = { samples: [], lastTick: s.tick }));
        r.samples.push({ tick: s.tick, x: o.x, z: o.z });
        if (r.samples.length > MAX_SAMPLES) r.samples.shift();
        r.lastTick = s.tick;
      }
    } else if (type === MSG.PONG) {
      this.stats.rttMs = ((now >>> 0) - decodeTime(bytes)) >>> 0;
    }
  }

  /** Server says where we were after input `ack`; replay what it has not applied yet. */
  private reconcile(x: number, z: number, ack: number): void {
    const before = { ...this.cur };
    this.pending = this.pending.filter((p) => seqNewer(p.seq, ack));
    this.setLocal(x, z);
    for (const p of this.pending) step(this.local, new Int32Array([0, p.mx, p.mz]));
    this.cur = { x: this.local.tf.cols.x[0], z: this.local.tf.cols.z[0] };
    if (this.cur.x !== before.x || this.cur.z !== before.z) { this.stats.corrections++; this.prev = { ...this.cur }; }
  }

  private setLocal(x: number, z: number): void {
    this.local.tf.cols.x[0] = x; this.local.tf.cols.z[0] = z;
    this.cur = { x, z };
  }

  private syncClock(serverTick: number, now: number, force: boolean): void {
    const sample = serverTick - (now * TICK_HZ) / 1000;
    if (force || !this.hasClock || Math.abs(sample - this.offset) > 10) { this.offset = sample; this.hasClock = true; }
    else this.offset += (sample - this.offset) * 0.05; // smooth out network jitter
  }

  serverTickNow(now = nowMs()): number { return (now * TICK_HZ) / 1000 + this.offset; }

  /** Own avatar in metres, blended between the last two client ticks (alpha in [0,1]). */
  selfPosition(alpha: number): { x: number; z: number } {
    return { x: fxToFloat(this.prev.x + (this.cur.x - this.prev.x) * alpha), z: fxToFloat(this.prev.z + (this.cur.z - this.prev.z) * alpha) };
  }

  /** Everyone else in metres, interpolated INTERP_TICKS in the past. */
  remotePositions(now = nowMs()): { id: number; x: number; z: number }[] {
    const est = this.serverTickNow(now), at = est - INTERP_TICKS, out = [];
    for (const [id, r] of this.remotes) {
      if (est - r.lastTick > FORGET_TICKS) { this.remotes.delete(id); continue; }
      const sm = r.samples;
      let a = sm[0], b = sm[sm.length - 1];
      for (let i = 0; i < sm.length - 1; i++) if (sm[i].tick <= at && at <= sm[i + 1].tick) { a = sm[i]; b = sm[i + 1]; break; }
      const span = b.tick - a.tick;
      const k = span > 0 ? Math.min(1, Math.max(0, (at - a.tick) / span)) : 1;
      out.push({ id, x: fxToFloat(a.x + (b.x - a.x) * k), z: fxToFloat(a.z + (b.z - a.z) * k) });
    }
    return out.sort((p, q) => p.id - q.id);
  }
}

const nowMs = (): number => performance.now();
