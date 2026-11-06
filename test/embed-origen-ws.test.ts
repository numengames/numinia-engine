// mundo-hermes M9: the Origin policy of embed mode on the WebSocket upgrade and on /status.
// Real servers, raw clients (so Origin can be forged). With embed off nothing changes (the old behaviour is pinned here too).
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startServer } from "../packages/server/src/server.ts";
import { origenAdmitido } from "../packages/server/src/embed-espejo.ts";

const arrancar = (activo: boolean) => startServer({ port: 0, host: "127.0.0.1", embed: { activo: () => activo, atender: () => false }, sesiones: null, version: "prueba", log: () => {}, statsMs: 60_000 } as never);
/** Opens a socket with the given Origin (undefined = none); says "abierto" or the HTTP status the upgrade was refused with. */
const abre = (port: number, origin: string | undefined, host?: string) => new Promise<string>((ok) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { ...(origin !== undefined ? { origin } : {}), ...(host ? { headers: { host } } : {}) });
  ws.on("open", () => { ok("abierto"); ws.terminate(); });
  ws.on("unexpected-response", (_q, res) => { ok(String(res.statusCode)); res.resume(); });
  ws.on("error", () => {}); setTimeout(() => ok("tiempo"), 3000);
});

test("origenAdmitido: absent, \"null\" and the own address are admitted; any other site, other port or https is not", () => {
  const h = "127.0.0.1:8790";
  for (const o of [undefined, "null", `http://${h}`]) assert.equal(origenAdmitido(o, h), true, String(o));
  for (const o of ["http://evil.example", "https://evil.example", "http://127.0.0.1:8791", `https://${h}`, "http://localhost:8790", ""]) assert.equal(origenAdmitido(o, h), false, o);
});

test("embed on, WebSocket: a foreign Origin is refused with 403 and never becomes a connection", async () => {
  const srv = await arrancar(true);
  try {
    for (const o of ["http://evil.example", "https://evil.example", "http://127.0.0.1:1", "http://localhost:" + srv.port]) assert.equal(await abre(srv.port, o), "403", o);
    assert.equal((await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json() as { conectados: number }).conectados, 0);
  } finally { await srv.close(); }
});

test("embed on, WebSocket: Origin absent, \"null\" (the sandboxed frame) and the world's own origin are admitted", async () => {
  const srv = await arrancar(true);
  try {
    assert.equal(await abre(srv.port, undefined), "abierto");
    assert.equal(await abre(srv.port, "null"), "abierto");
    assert.equal(await abre(srv.port, `http://127.0.0.1:${srv.port}`), "abierto");
  } finally { await srv.close(); }
});

test("embed off, WebSocket: unchanged, any Origin is admitted (a public world is public)", async () => {
  const srv = await arrancar(false);
  try { for (const o of [undefined, "null", "http://evil.example", "https://mundo.example"]) assert.equal(await abre(srv.port, o), "abierto", String(o)); } finally { await srv.close(); }
});

test("no embed option at all (a hosted world, no espejo.json): unchanged", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", sesiones: null, version: "prueba", log: () => {}, statsMs: 60_000 } as never);
  try { assert.equal(await abre(srv.port, "https://mundo.example"), "abierto");  } finally { await srv.close(); }
});
