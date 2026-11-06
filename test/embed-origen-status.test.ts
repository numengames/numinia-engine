// mundo-hermes M9: the Origin policy of embed mode on /status.
// Real servers, raw clients (so Origin can be forged). With embed off nothing changes (the old behaviour is pinned here too).
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../packages/server/src/server.ts";

const arrancar = (activo: boolean) => startServer({ port: 0, host: "127.0.0.1", embed: { activo: () => activo, atender: () => false }, sesiones: null, version: "prueba", log: () => {}, statsMs: 60_000 } as never);
const cors = async (port: number, origin?: string) => (await fetch(`http://127.0.0.1:${port}/status`, origin === undefined ? {} : { headers: { origin } })).headers.get("access-control-allow-origin");

test("embed on, /status: CORS * only for Origin absent or \"null\" (and the own origin); a foreign page gets no header but the body is still served", async () => {
  const srv = await arrancar(true);
  try {
    assert.equal(await cors(srv.port), "*"); assert.equal(await cors(srv.port, "null"), "*");
    for (const o of ["http://evil.example", "https://evil.example", "http://localhost:" + srv.port]) assert.equal(await cors(srv.port, o), null, o);
    const r = await fetch(`http://127.0.0.1:${srv.port}/status`, { headers: { origin: "http://evil.example" } });
    assert.equal(r.status, 200); assert.equal(typeof (await r.json() as { uptime: number }).uptime, "number", "same-origin readers (no CORS needed) still get the answer");
  } finally { await srv.close(); }
});

test("embed off, /status: CORS * for every Origin, as before", async () => {
  const srv = await arrancar(false);
  try { for (const o of [undefined, "null", "http://evil.example"]) assert.equal(await cors(srv.port, o), "*", String(o)); } finally { await srv.close(); }
});

test("no embed option at all (a hosted world, no espejo.json): /status keeps CORS * for every Origin", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", sesiones: null, version: "prueba", log: () => {}, statsMs: 60_000 } as never);
  try { for (const o of [undefined, "null", "https://mundo.example"]) assert.equal(await cors(srv.port, o), "*", String(o)); } finally { await srv.close(); }
});
