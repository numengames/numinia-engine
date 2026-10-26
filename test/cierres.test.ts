// MIS-233 (t_3e18259a): HOW connections end — the counter that says how many go without goodbye (metrics `cierres`, and
// `numinia_connections_closed_total{motivo=…}` in /metrics.prom). Classified by close code; a page cut for silence is counted as such
// even though its socket ends as 1006 (it never answers our close frame).
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { encodeLatido, LATIDO_MS } from "../packages/net/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { MOTIVOS_CIERRE, motivoDeCierre, cierresVacios } from "../packages/server/src/metrics.ts";

test("motivoDeCierre: every code lands in one bucket; goodbye-less = sin_despedida + silencio", () => {
  const casos: [number, string][] = [[1000, "limpio"], [1001, "limpio"], [1005, "sin_codigo"], [1006, "sin_despedida"], [4005, "silencio"], [4003, "expulsado"],
    [1002, "protocolo"], [1009, "protocolo"], [1011, "protocolo"], [4004, "otro"], [3000, "otro"], [0, "otro"]];
  for (const [c, m] of casos) assert.equal(motivoDeCierre(c), m, String(c));
  assert.deepEqual(Object.keys(cierresVacios()), [...MOTIVOS_CIERRE]);
});

test("server (real WebSocket): a goodbye is «limpio», a dead socket is «sin_despedida», a frozen page cut by the server is «silencio»; the buckets add up to `cerradas`", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, silencioMs: 1200, motor: { build: "dev", commit: "0".repeat(40), imagen: "" } });
  const abre = () => new Promise<WebSocket>((ok, ko) => { const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`); ws.on("open", () => ok(ws)); ws.on("error", ko); });
  const cerrada = (ws: WebSocket) => new Promise<void>((ok) => ws.on("close", () => ok()));
  const espera = async (f: () => boolean, ms = 6000) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25)); };
  try {
    assert.deepEqual(srv.metrics().cierres, cierresVacios());
    const [a, b, c, d, e] = [await abre(), await abre(), await abre(), await abre(), await abre()];
    const vivo = setInterval(() => e.send(encodeLatido()), LATIDO_MS); // e keeps beating: it stays
    a.close(1000); b.close(1001); c.terminate();
    d.send(encodeLatido()); // d beats once and then goes quiet
    await Promise.all([cerrada(a), cerrada(b), cerrada(c)]);
    await espera(() => srv.metrics().cierres.silencio >= 1 && srv.metrics().conexiones.cerradas >= 4);
    clearInterval(vivo);
    const m = srv.metrics();
    assert.equal(m.cierres.limpio, 2, JSON.stringify(m.cierres));
    assert.equal(m.cierres.sin_despedida, 1, JSON.stringify(m.cierres));
    assert.equal(m.cierres.silencio, 1, JSON.stringify(m.cierres));
    assert.equal(Object.values(m.cierres).reduce((s, n) => s + n, 0), m.conexiones.cerradas);
    assert.equal(m.conectados, 1, "e stays");
    const prom = await (await fetch(`http://127.0.0.1:${srv.port}/metrics.prom`)).text();
    assert.match(prom, /numinia_connections_closed_total\{motivo="limpio"\} 2\n/);
    assert.match(prom, /numinia_connections_closed_total\{motivo="sin_despedida"\} 1\n/);
    assert.match(prom, /numinia_connections_closed_total\{motivo="silencio"\} 1\n/);
    e.close(); d.terminate();
  } finally { await srv.close(); }
});
