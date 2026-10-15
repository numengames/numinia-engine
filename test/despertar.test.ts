// R1: the "despertar" feature end to end. Headless clients over the in-memory transport for the event,
// a real server on a free port for the signed URL, and a timed scan→effect on real WebSockets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { leerPuntos, firmar, verificar } from "../features/despertar/tokens.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearDespertar } from "../features/despertar/server.ts";
import despertarClient from "../features/despertar/client.ts";
import enlaces from "../features/despertar/enlaces.json" with { type: "json" };

const SECRET = "0123456789abcdef0123";
const S = signer(SECRET), OTRO = signer("otro-secreto-distinto");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PUNTOS = [{ id: "fuente", nombre: "la fuente", x: 5, z: -3.5, texto: "¡Despierta!", ms: 1000 }];

test("despertar: tokens — valid ones verify, forged / truncated / other-secret ones do not", () => {
  const t = firmar(S, "fuente");
  assert.equal(verificar(S, t), "fuente");
  assert.equal(verificar(S, t.slice(0, -1) + (t.endsWith("0") ? "1" : "0")), null);
  assert.equal(verificar(S, "fuente.aaaa"), null);
  assert.equal(verificar(S, "fuente"), null);
  assert.equal(verificar(OTRO, t), null);
});

test("despertar: enlaces.json is valid and the checker names what is wrong", () => {
  assert.ok(leerPuntos(enlaces).ok);
  const bad = leerPuntos({ schema: "x", puntos: [{ id: "A b", nombre: "", texto: "", x: 5000, z: 0, ms: 3 }] });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(bad.problemas.map((p) => p.split(":")[0]), ["schema", "puntos[0].id", "puntos[0].nombre", "puntos[0].texto", "puntos[0].x", "puntos[0].ms"]);
});

test("despertar: a scan wakes the point for everyone; forged and repeated scans do nothing", async () => {
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, features: [crearDespertar(PUNTOS)], secret: SECRET, log: (l) => log.push(l) });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const seen: string[] = [];
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}/ws`);
    const s = new ClientSession(t, { features: [despertarClient], view: { label() {}, bounce() {}, beacon: (x, z, text, ms) => seen.push(`${x},${z},${text},${ms}`) } });
    await t.opened;
    const t0 = performance.now();
    while (!s.features.catalog && performance.now() - t0 < 5000) { s.tick(0, 0); await sleep(25); }
    assert.ok(s.features.catalog, "no catalog");

    assert.equal((await fetch(`${base}/e/fuente.000000000000000000000000`)).status, 404);   // forged
    assert.equal((await fetch(`${base}/e/${firmar(OTRO, "fuente")}`)).status, 404);
    await sleep(150);
    assert.deepEqual(seen, []);

    const url = `${base}/e/${firmar(S, "fuente")}`;
    const ts = performance.now();
    const ok = await fetch(url);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /Has despertado la fuente/);
    while (seen.length === 0 && performance.now() - ts < 3000) { s.tick(0, 0); await sleep(5); }
    const ms = performance.now() - ts;
    assert.deepEqual(seen, ["5,-3.5,¡Despierta!,1000"]);
    console.log(`  medido: escaneo → efecto en la página: ${ms.toFixed(0)} ms (WebSocket local)`);
    assert.ok(ms < 500, `tarda ${ms} ms`);

    assert.match(await (await fetch(url)).text(), /Ya está despierto/);                      // repeated while awake
    await sleep(200); assert.equal(seen.length, 1);
    await sleep(1000);                                                                         // effect over: it can wake again
    await fetch(url);
    for (let i = 0; i < 40 && seen.length < 2; i++) { s.tick(0, 0); await sleep(25); }
    assert.equal(seen.length, 2);
    t.close();
  } finally { await srv.close(); }
});

test("despertar: without a secret no QR is valid and the log says how to fix it", async () => {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [crearDespertar(PUNTOS)], log: (l) => log.push(l) });
  assert.ok(log.some((l) => l.includes("MOTOR_SECRET")));
  assert.equal(inst.features.http("GET", "/e/fuente.abc", {}, "")?.status, 404);
});
