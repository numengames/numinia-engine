// cli: `node packages/cli/src/replay.ts <recording.json> [--expect <hex>]` or `--reference [--ticks N]` (M23).
// Replays a recording of inputs (seed + per-tick inputs) through the simulation and checks the fingerprint: against `--expect`,
// else against the file's own `fingerprint`. Exit 1 on a mismatch, naming the first tick if the file carries per-tick hashes.
import { readFileSync, writeFileSync } from "node:fs";
import { hex, fnv1a } from "../../core/src/index.ts";
import { replay, referenceRecording, REFERENCE, type Recording } from "../../sim/src/index.ts";

/** The JSON form of a Recording: Int32Arrays become plain number arrays. `hashes` (hex, one per tick) is optional. */
export type RecordingFile = { schema: "numinia-engine/recording@1"; seed: number; capacity: number; spawns: number[]; ticks: number[][]; orders?: (number[] | null)[]; fingerprint?: string; hashes?: string[] };
export type ReplayResult = { schema: "numinia-engine/replay@1"; ticks: number; fingerprint: string; expected: string | null; ok: boolean; firstBadTick: number | null };

const ints = (a: ArrayLike<number>) => Int32Array.from(a);
export function toRecording(f: RecordingFile): Recording {
  if (f?.schema !== "numinia-engine/recording@1") throw new Error(`schema must be "numinia-engine/recording@1"`);
  for (const k of ["seed", "capacity"] as const) if (!Number.isInteger(f[k])) throw new Error(`${k} must be an integer`);
  if (!Array.isArray(f.spawns) || !Array.isArray(f.ticks)) throw new Error("spawns and ticks must be arrays");
  return { seed: f.seed, capacity: f.capacity, spawns: f.spawns, ticks: f.ticks.map(ints), orders: f.orders?.map((o) => (o ? ints(o) : undefined)) };
}
export function toFile(r: Recording, withHashes = true): RecordingFile {
  const h = replay(r);
  return { schema: "numinia-engine/recording@1", seed: r.seed, capacity: r.capacity, spawns: r.spawns, ticks: r.ticks.map((t) => Array.from(t)),
    ...(r.orders ? { orders: r.orders.map((o) => (o ? Array.from(o) : null)) } : {}),
    fingerprint: hex(fnv1a(new Uint8Array(new Uint32Array(h).buffer))), ...(withHashes ? { hashes: h.map(hex) } : {}) };
}

export function replayFile(f: RecordingFile, expect?: string): ReplayResult {
  const raw = replay(toRecording(f)), hashes = raw.map(hex);
  const fingerprint = hex(fnv1a(new Uint8Array(new Uint32Array(raw).buffer)));
  const want = expect ?? f.fingerprint ?? null;
  const ok = want === null ? true : want === fingerprint;
  const bad = f.hashes ? hashes.findIndex((x, i) => x !== f.hashes![i]) : -1;
  const firstBadTick = bad >= 0 ? bad : null;
  return { schema: "numinia-engine/replay@1", ticks: hashes.length, fingerprint, expected: want, ok: ok && firstBadTick === null, firstBadTick };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const av = process.argv.slice(2);
  const opt = (n: string) => { const i = av.indexOf(`--${n}`); return i >= 0 ? av[i + 1] : undefined; };
  const write = opt("write");
  let file: RecordingFile;
  if (av.includes("--reference")) file = toFile(referenceRecording(REFERENCE.seed, Number(opt("ticks") ?? REFERENCE.ticks), REFERENCE.n), false);
  else if (av[0] && !av[0].startsWith("--")) file = JSON.parse(readFileSync(av[0], "utf8"));
  else { console.error("usage: replay.ts <recording.json> [--expect <hex>] | --reference [--ticks N] [--write out.json]"); process.exit(2); }
  if (write) writeFileSync(write, JSON.stringify(av.includes("--reference") ? toFile(toRecording(file), true) : file));
  const r = replayFile(file, opt("expect"));
  console.log(JSON.stringify(r));
  if (!r.ok) console.error(`fingerprint mismatch: got ${r.fingerprint}, expected ${r.expected}${r.firstBadTick !== null ? `; first differing tick ${r.firstBadTick}` : ""}`);
  process.exit(r.ok ? 0 : 1);
}
