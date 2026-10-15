// datos (S4): what the game features keep across restarts, as plain files an agent can read.
// Per feature: <dir>/<feature>.json (snapshot) + <dir>/<feature>.jsonl (changes since the snapshot, one per line).
// Loading = snapshot, then replay the journal (a torn last line from a crash is skipped). Changes are buffered
// and appended once a second (the server's sampler) and on close: a crash loses at most ~1 s. When a journal
// passes COMPACT_AT lines it is folded into a new snapshot (written to .tmp and renamed, so it is never half
// written; replaying an old journal over a new snapshot is harmless because set/delete are idempotent).
// The simulation is never saved: avatars are ephemeral; only the features' state and store live here.
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { appendFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FeatureStorage, Saved, StorageOp } from "../../feature/src/index.ts";

export const COMPACT_AT = 1000;
type Mirror = { version: number; state: Map<string, { value: Record<string, unknown>; at?: { x: number; z: number } }>; store: Map<string, unknown>; lines: number };

export class FileStorage implements FeatureStorage {
  readonly dir: string;
  readonly stats = { cargadas: 0, lineasRotas: 0, escritas: 0, compactadas: 0, fallos: 0 };
  private readonly log: (l: string) => void;
  private readonly mirrors = new Map<string, Mirror>();
  private readonly pending = new Map<string, string[]>();
  private writing: Promise<void> = Promise.resolve();

  constructor(dir: string, log: (l: string) => void = () => {}) { this.dir = dir; this.log = log; }

  private file(feature: string, ext: "json" | "jsonl") { return join(this.dir, `${feature}.${ext}`); }

  /** Called once per feature at startup (synchronous: before anyone joins). */
  load(feature: string): Saved | null {
    const m: Mirror = { version: 0, state: new Map(), store: new Map(), lines: 0 };
    this.mirrors.set(feature, m);
    try { mkdirSync(this.dir, { recursive: true }); } catch (e) { this.fail(`no puedo crear ${this.dir}`, e); return null; }
    const snap = this.file(feature, "json");
    if (existsSync(snap)) {
      try {
        const s = JSON.parse(readFileSync(snap, "utf8"));
        m.version = Number(s.version) || 0;
        for (const [k, v] of s.state ?? []) m.state.set(k, v);
        for (const [k, v] of s.store ?? []) m.store.set(k, v);
      } catch (e) {
        const aside = `${snap}.roto-${Date.now()}`;
        try { renameSync(snap, aside); } catch { /* keep going */ }
        this.fail(`la foto de '${feature}' no se lee (la aparto en ${aside})`, e);
      }
    }
    const journal = this.file(feature, "jsonl");
    if (existsSync(journal)) {
      for (const line of readFileSync(journal, "utf8").split("\n")) {
        if (!line.trim()) continue;
        let op: StorageOp & { v?: number };
        try { op = JSON.parse(line); } catch { this.stats.lineasRotas++; continue; } // a crash mid-line
        if (op.v) m.version = op.v;
        this.apply(m, op); m.lines++;
      }
    }
    if (!existsSync(snap) && !existsSync(journal)) return null;
    this.stats.cargadas++;
    return { version: m.version, state: [...m.state], store: [...m.store] };
  }

  private apply(m: Mirror, op: StorageOp): void {
    if (op.op === "s") m.state.set(op.key, op.at ? { value: op.value, at: op.at } : { value: op.value });
    else if (op.op === "sd") m.state.delete(op.key);
    else if (op.op === "k") m.store.set(op.key, op.value);
    else if (op.op === "kd") m.store.delete(op.key);
  }

  /** A change, kept in memory until the next flush. */
  record(feature: string, version: number, op: StorageOp): void {
    let m = this.mirrors.get(feature);
    if (!m) this.mirrors.set(feature, (m = { version, state: new Map(), store: new Map(), lines: 0 }));
    m.version = version;
    this.apply(m, op);
    const lines = this.pending.get(feature) ?? [];
    lines.push(JSON.stringify({ t: new Date().toISOString(), v: version, ...op }));
    this.pending.set(feature, lines);
  }

  /** Append what is waiting; fold long journals into a snapshot. Never throws. */
  flush(): Promise<void> {
    if (this.pending.size === 0) return this.writing;
    const batch = [...this.pending]; this.pending.clear();
    this.writing = this.writing.then(async () => {
      for (const [feature, lines] of batch) {
        try {
          await appendFile(this.file(feature, "jsonl"), lines.join("\n") + "\n");
          this.stats.escritas += lines.length;
          const m = this.mirrors.get(feature)!;
          m.lines += lines.length;
          if (m.lines >= COMPACT_AT) await this.compact(feature, m);
        } catch (e) { this.fail(`no puedo guardar '${feature}' en ${this.dir}`, e); }
      }
    });
    return this.writing;
  }

  private async compact(feature: string, m: Mirror): Promise<void> {
    const snap = this.file(feature, "json"), tmp = `${snap}.tmp`;
    await writeFile(tmp, JSON.stringify({ schema: "numinia-engine/datos@1", feature, version: m.version, savedAt: new Date().toISOString(), state: [...m.state], store: [...m.store] }));
    await rename(tmp, snap);
    await writeFile(this.file(feature, "jsonl"), "");
    m.lines = 0; this.stats.compactadas++;
  }

  private fail(what: string, e: unknown): void {
    this.stats.fallos++;
    this.log(`[datos] ${what}: ${String((e as Error)?.message ?? e)}`);
  }
}
