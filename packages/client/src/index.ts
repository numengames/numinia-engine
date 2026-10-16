// client: the browser-side netcode. No DOM and no renderer here, so it runs (and is tested) in Node.
// Own avatar: predicted with the SAME sim step the server runs, reconciled exactly on each snapshot.
// Others: drawn slightly in the past, interpolated between snapshots.
import { fxToFloat } from "../../core/src/index.ts";
import { createSim, spawnAvatar, step, getBody, setBody, sameBody, groundHeight, setSolids, solidsFrom, TICK_HZ } from "../../sim/src/index.ts";
import type { Body, SimState } from "../../sim/src/index.ts";
import { MSG, decodeSnapshot, decodeWelcome, decodeTime, encodeInput, encodePing, encodeReport, encodeIdentityRequest, decodeIdentity, seqNewer, codificarVozSubida, leerVozBajada } from "../../net/src/index.ts";
import type { Transport, Welcome } from "../../net/src/index.ts";
import { ClientRuntime } from "../../feature/src/index.ts";
import type { ClientPart, ViewHooks } from "../../feature/src/index.ts";

export const INTERP_TICKS = 3;   // draw others 150 ms in the past (1.5 snapshot intervals at 10 Hz)
export const FORGET_TICKS = 40;  // drop a remote not heard of for 2 s
const MAX_SAMPLES = 16;

type Sample = { tick: number; x: number; y: number; z: number };

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

/** I1: where the page keeps its guest token between visits (the browser passes localStorage; tests a variable). */
export type GuestKeeper = { load(): string | null; save(token: string): void };

export class ClientSession {
  readonly t: Transport;
  entity = -1;
  welcome: Welcome | null = null;
  private seq = 0;
  private pending: { seq: number; mx: number; mz: number; buttons: number }[] = [];
  private readonly local: SimState;         // a one-avatar sim used only for prediction
  private prev: Body = { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 }; // predicted state one client tick ago (fixed point)
  private cur: Body = this.prev;            // predicted state now (fixed point); J2: height and vertical state too
  private remotes = new Map<number, { samples: Sample[]; lastTick: number }>();
  private offset = 0;                       // server tick minus local tick clock
  private hasClock = false;
  stats = { snapshots: 0, corrections: 0, rttMs: -1, visible: 0, lastServerTick: 0 };
  /** Game features (J7): their client parts, the server's catalog, their recent events. */
  readonly features: ClientRuntime;
  private solidsVersion = -1; // U10: the solid boxes follow the shared state
  /** I1: who the server says you are (guest id + name); null until it answers, or when no keeper was given. */
  who: { id: string; nombre: string } | null = null;
  private readonly keeper?: GuestKeeper;

  constructor(t: Transport, opts: { features?: readonly ClientPart[]; view?: ViewHooks; identity?: GuestKeeper } = {}) {
    this.t = t;
    this.keeper = opts.identity;
    this.local = createSim(1, 0);
    spawnAvatar(this.local, 0);
    this.features = new ClientRuntime(opts.features ?? [], { send: (b) => this.t.send(b, true), self: () => this.entity, view: opts.view });
    t.onMessage((bytes) => this.handle(bytes, nowMs()));
  }

  /** One client tick (20 Hz): send the input and predict its effect immediately. `buttons`: BTN_JUMP (a press since
   * the previous tick: latch taps in the page so none is lost between two ticks) | BTN_RUN (held). */
  tick(mx: number, mz: number, buttons = 0): void {
    if (this.entity < 0) return;
    this.seq = (this.seq + 1) & 0xffff;
    this.t.send(encodeInput(this.seq, mx, mz, buttons), false);
    this.pending.push({ seq: this.seq, mx, mz, buttons });
    if (this.pending.length > 64) this.pending.shift();
    this.prev = this.cur;
    if (this.features.stateVersion !== this.solidsVersion) { this.solidsVersion = this.features.stateVersion; setSolids(this.local, solidsFrom(this.features.allState())); } // U10: the same walls as the server
    step(this.local, new Int32Array([0, mx, mz, buttons]));
    this.cur = getBody(this.local, 0);
  }

  ping(now = nowMs()): void { this.t.send(encodePing(now >>> 0), true); }

  /** T1: tell the server how this player entered / how it is going. false if not joined yet or too big. */
  report(r: Record<string, unknown>): boolean {
    if (this.entity < 0) return false;
    const bytes = encodeReport(r);
    if (!bytes) return false;
    this.t.send(bytes, true);
    return true;
  }

  /** U10: someone near spoke (a frame of their microphone). The page plays it (apps/plaza/voz.ts). */
  onVoice: ((v: { codec: number; seq: number; entidad: number; trama: Uint8Array }) => void) | null = null;
  private vozSeq = 0;
  /** U10: send one compressed frame of your microphone; the server passes it to who is near. false if not joined. */
  sendVoice(codec: number, trama: Uint8Array): boolean {
    if (this.entity < 0) return false;
    const b = codificarVozSubida(codec, (this.vozSeq = (this.vozSeq + 1) & 0xffff), trama);
    if (!b) return false;
    this.t.send(b, false);
    return true;
  }

  handle(bytes: Uint8Array, now: number): void {
    const type = bytes[0];
    if (type === MSG.VOICE) { const v = leerVozBajada(bytes); if (v) this.onVoice?.(v); return; }
    if (type === MSG.WELCOME) {
      const w = decodeWelcome(bytes);
      this.welcome = w; this.entity = w.entity;
      this.setLocal({ x: w.x, y: groundHeight(w.x, w.z), z: w.z, vy: 0, air: 0, buf: 0 }); this.prev = this.cur; // spawned standing
      this.syncClock(w.tick, now, true);
      if (this.keeper) { let kept: string | null = null; try { kept = this.keeper.load(); } catch { /* private mode */ } this.t.send(encodeIdentityRequest(kept ?? ""), true); }
    } else if (type === MSG.IDENTITY) {
      const i = decodeIdentity(bytes);
      if (i) { this.who = { id: i.id, nombre: i.nombre }; try { this.keeper?.save(i.token); } catch { /* private mode: a new guest next time */ } }
    } else if (type === MSG.SNAPSHOT) {
      const s = decodeSnapshot(bytes);
      if (!s) return;
      this.stats.snapshots++; this.stats.visible = s.others.length; this.stats.lastServerTick = s.tick;
      this.syncClock(s.tick, now, false);
      this.reconcile(s.self, s.ack);
      for (const o of s.others) {
        let r = this.remotes.get(o.id);
        if (!r) this.remotes.set(o.id, (r = { samples: [], lastTick: s.tick }));
        r.samples.push({ tick: s.tick, x: o.x, y: o.y, z: o.z });
        if (r.samples.length > MAX_SAMPLES) r.samples.shift();
        r.lastTick = s.tick;
      }
    } else if (type === MSG.PONG) {
      this.stats.rttMs = ((now >>> 0) - decodeTime(bytes)) >>> 0;
    } else this.features.receive(bytes); // CATALOG, FEATURE, STATE; anything else is ignored
  }

  /** Server says what our avatar was after input `ack` (height and vertical state included); replay what it has not
   * applied yet. Any difference from what we had predicted, in any field, is a correction. */
  private reconcile(server: Body, ack: number): void {
    const before = this.cur;
    this.pending = this.pending.filter((p) => seqNewer(p.seq, ack));
    this.setLocal(server);
    for (const p of this.pending) step(this.local, new Int32Array([0, p.mx, p.mz, p.buttons]));
    this.cur = getBody(this.local, 0);
    if (!sameBody(this.cur, before)) { this.stats.corrections++; this.prev = this.cur; }
  }

  private setLocal(b: Body): void {
    setBody(this.local, 0, b);
    this.cur = getBody(this.local, 0);
  }

  private syncClock(serverTick: number, now: number, force: boolean): void {
    const sample = serverTick - (now * TICK_HZ) / 1000;
    if (force || !this.hasClock || Math.abs(sample - this.offset) > 10) { this.offset = sample; this.hasClock = true; }
    else this.offset += (sample - this.offset) * 0.05; // smooth out network jitter
  }

  serverTickNow(now = nowMs()): number { return (now * TICK_HZ) / 1000 + this.offset; }

  /** Own avatar in metres, blended between the last two client ticks (alpha in [0,1]). J2: `y` is the height of the
   * feet, `speed` the horizontal speed in m/s (≈4 walking, ≈8 running), `grounded` false while in the air. */
  selfPosition(alpha: number): { x: number; y: number; z: number; speed: number; grounded: boolean } {
    const p = this.prev, c = this.cur;
    return {
      x: fxToFloat(p.x + (c.x - p.x) * alpha), y: fxToFloat(p.y + (c.y - p.y) * alpha), z: fxToFloat(p.z + (c.z - p.z) * alpha),
      speed: Math.hypot(fxToFloat(c.x - p.x), fxToFloat(c.z - p.z)) * TICK_HZ, grounded: c.y <= groundHeight(c.x, c.z),
    };
  }

  /** Everyone else in metres, interpolated INTERP_TICKS in the past. J2: `y` (height of the feet) and `speed`
   * (horizontal, m/s, over the snapshot interval being drawn). */
  remotePositions(now = nowMs()): { id: number; x: number; y: number; z: number; speed: number }[] {
    const est = this.serverTickNow(now), at = est - INTERP_TICKS, out = [];
    for (const [id, r] of this.remotes) {
      if (est - r.lastTick > FORGET_TICKS) { this.remotes.delete(id); continue; }
      const sm = r.samples;
      let a = sm[0], b = sm[sm.length - 1];
      for (let i = 0; i < sm.length - 1; i++) if (sm[i].tick <= at && at <= sm[i + 1].tick) { a = sm[i]; b = sm[i + 1]; break; }
      const span = b.tick - a.tick;
      const k = span > 0 ? Math.min(1, Math.max(0, (at - a.tick) / span)) : 1;
      const speed = span > 0 ? (Math.hypot(fxToFloat(b.x - a.x), fxToFloat(b.z - a.z)) * TICK_HZ) / span : 0;
      out.push({ id, x: fxToFloat(a.x + (b.x - a.x) * k), y: fxToFloat(a.y + (b.y - a.y) * k), z: fxToFloat(a.z + (b.z - a.z) * k), speed });
    }
    return out.sort((p, q) => p.id - q.id);
  }
}

const nowMs = (): number => performance.now();
