// bench-chat (D4): what the chat's per-tick hook costs with nobody talking, on the real Instance (snapshots pick who
// each page draws, so api.visible is the real one) and with the instance's real api.position.
//   node tools/bench-chat.ts [--personas 0,1000] [--ticks 600] [--warmup 100] [--rondas 3] [--servidor features/chat/otro.ts]
// Prints, per crowd size, the chat onTick µs per tick (median of the rounds' medians and means) and a hash of
// everything the chat emitted (event, payload, scope): two builds with the same hash behave the same.
import { createHash } from "node:crypto";
import { Instance, Bot } from "../packages/instance/src/index.ts";
import type { ServerApi, ServerPart } from "../packages/feature/src/index.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const personas = arg("personas", "0,1000").split(",").map(Number);
const chatServer: ServerPart = (await import(new URL(`../${arg("servidor", "features/chat/server.ts")}`, import.meta.url).href)).default;
const ticks = Number(arg("ticks", "600")), warmup = Number(arg("warmup", "100")), nRondas = Number(arg("rondas", "3"));

function ronda(n: number) {
  const tiempos: number[] = [];
  const h = createHash("sha256");
  let emitidos = 0;
  const medido: ServerPart = {
    ...chatServer,
    setup: (api: ServerApi) => { const cache = new Map<string | symbol, unknown>(); chatServer.setup(new Proxy(api, {
      get(t, k) {
        if (cache.has(k)) return cache.get(k);
        if (k === "onTick") return (fn: (tick: number) => void) => t.onTick((tk) => { const a = performance.now(); fn(tk); tiempos.push(performance.now() - a); });
        if (k === "emit") return (ev: string, m: unknown, scope: unknown) => { emitidos++; h.update(`${t.tick()}|${ev}|${JSON.stringify(m)}|${JSON.stringify(scope)}\n`); return (t.emit as (...a: unknown[]) => number)(ev, m, scope); };
        const v = (t as Record<string | symbol, unknown>)[k];
        const r = typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
        if (typeof v === "function") cache.set(k, r); // bound once: the proxy's own cost stays out of the hook's time
        return r;
      },
    })); },
  };
  const inst = new Instance({ seed: 7, capacity: n + 8, k: 50, snapshotEvery: 2, features: [medido] });
  const bots: Bot[] = [];
  for (let i = 0; i < n; i++) bots.push(new Bot(inst.join(i), (7 ^ (i * 0x9e3779b1)) >>> 0));
  for (let t = 0; t < ticks; t++) { for (const b of bots) b.think(); inst.tick(); }
  const s = tiempos.slice(warmup).sort((a, b) => a - b);
  const media = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { p50: s[s.length >> 1] * 1000, media: media * 1000, p99: s[Math.floor(s.length * 0.99)] * 1000, emitidos, hash: h.digest("hex").slice(0, 16) };
}

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
for (const n of personas) {
  const rs = Array.from({ length: nRondas }, () => ronda(n));
  const hashes = new Set(rs.map((r) => r.hash));
  console.log(`chat onTick · ${n} personas sin hablar · ${nRondas}×${ticks - warmup} ticks: p50 ${med(rs.map((r) => r.p50)).toFixed(1)} µs, media ${med(rs.map((r) => r.media)).toFixed(1)} µs, p99 ${med(rs.map((r) => r.p99)).toFixed(1)} µs · ${rs[0].emitidos} emisiones, huella ${[...hashes].join(",")}`);
}
