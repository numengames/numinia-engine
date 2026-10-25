// t_85ff48e0: `mirar` says which way the AI faces (rumbo in degrees + a front vector) so it can reason about «delante de mí».
// Pure helpers, then the real bridge over an in-memory world: after `ir_a` the heading matches the way it actually moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { MARCA_IA } from "../packages/instance/src/identidad.ts";
import { loopbackPair } from "../packages/net/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { PuenteMundo } from "../packages/agent/src/mcp-mundo.ts";
import { frenteDe, rumboDe } from "../packages/agent/src/index.ts";
import chatServer from "../features/chat/server.ts";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("rumboDe / frenteDe: 0° = +z, 90° = +x, 180° = −z, 270° = −x, and they invert each other", () => {
  assert.equal(rumboDe(0, 1), 0);
  assert.equal(rumboDe(1, 0), 90);
  assert.equal(rumboDe(0, -1), 180);
  assert.equal(rumboDe(-1, 0), 270);
  assert.equal(rumboDe(1, 1), 45);
  assert.equal(rumboDe(-1, -1), 225);
  assert.deepEqual(frenteDe(90), { x: 1, z: 0 });
  assert.deepEqual(frenteDe(180), { x: 0, z: -1 });
  for (const g of [0, 30, 135, 200, 359]) { const f = frenteDe(g); assert.ok(Math.abs(rumboDe(f.x, f.z) - g) <= 0.2, `${g}`); }
});

test("mirar gives the heading: a starting one before any step, then the way it walked after ir_a, coherent with its position", { timeout: 30_000 }, async () => {
  const PASE = `cabecera.${b64({ kind: "agent", state: "activa" })}.firma`;
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [chatServer], identitySign: signer("una-clave-de-invitados-larga"),
    credencial: (_e, pase) => (pase === PASE ? { id: "ia-a_" + "0f".repeat(16), nombre: `Ada${MARCA_IA}`, ia: true } : null) });
  const motor = setInterval(() => inst.tick(), 10);
  const abrir = () => {
    const [servidor, cliente] = loopbackPair();
    inst.connect(servidor, 0);
    const bombeo = setInterval(() => cliente.flush(), 10);
    let cerrar = (_: { code: number; reason: string }) => {};
    return { get sentBytes() { return cliente.sentBytes; }, send: (b: Uint8Array, r: boolean) => cliente.send(b, r), onMessage: (f: (b: Uint8Array) => void) => cliente.onMessage(f),
      opened: Promise.resolve(), closed: new Promise<{ code: number; reason: string }>((ok) => { cerrar = ok; }), close: () => { clearInterval(bombeo); cerrar({ code: 1000, reason: "" }); } };
  };
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ nombre: "La Torre" })) as typeof fetch;
  const puente = new PuenteMundo({ url: "wss://torre.numinia.world/ws", id: "ada", pedirPase: async () => ({ ok: true as const, pase: PASE, exp: Math.floor(Date.now() / 1000) + 600 }), mundo: "torre", abrir });
  puente.arrancar();
  try {
    const fin = Date.now() + 8000;
    while (!(puente.cuerpo?.nombre && puente.cuerpo.dentro()) && Date.now() < fin) await espera(20);
    assert.ok(puente.cuerpo?.dentro(), "the body is in the world");
    const ai = puente.cuerpo!.entidad;
    inst.sim.tf.cols.x[ai] = fx(0); inst.sim.tf.cols.z[ai] = fx(0);
    await espera(200);
    const herr = (n: string) => puente.herramientas().find((h) => h.name === n)!;
    const usar = async (n: string, a: Record<string, unknown> = {}) => String(await herr(n).ejecutar(a));
    assert.match(herr("mirar").description, /rumbo/);
    const lee = (t: string) => {
      const r = /Miras hacia el rumbo ([\d.]+)°.*vector de frente x (-?\d+(?:\.\d+)?) z (-?\d+(?:\.\d+)?)/.exec(t)!, p = /x (-?[\d.]+) y (-?[\d.]+) z (-?[\d.]+) \(metros/.exec(t)!;
      assert.ok(r && p, t);
      return { rumbo: Number(r[1]), fx: Number(r[2]), fz: Number(r[3]), x: Number(p[1]), z: Number(p[3]), sinAndar: /aún no has andado/.test(t) };
    };
    const antes = lee(await usar("mirar"));
    assert.deepEqual([antes.rumbo, antes.fx, antes.fz, antes.sinAndar], [0, 0, 1, true]);
    // walk towards +x: the heading becomes 90° and the position really moves along it
    assert.match(await usar("ir_a", { x: 6, z: 0 }), /Voy a x 6 z 0/);
    for (let i = 0; i < 100 && !puente.cuerpo!.llegado(); i++) await espera(50);
    assert.ok(puente.cuerpo!.llegado(), "it arrived");
    const despues = lee(await usar("mirar"));
    assert.equal(despues.sinAndar, false);
    assert.equal(despues.rumbo, 90);
    assert.deepEqual([despues.fx, despues.fz], [1, 0]);
    const real = rumboDe(despues.x - antes.x, despues.z - antes.z);
    assert.ok(Math.abs(real - despues.rumbo) <= 5, `moved at ${real}°, says ${despues.rumbo}°`);
    // a diagonal walk to the −z/−x side: the heading follows
    await usar("ir_a", { x: 2, z: -4 });
    for (let i = 0; i < 100 && !puente.cuerpo!.llegado(); i++) await espera(50);
    const fin2 = lee(await usar("mirar"));
    const esperado = rumboDe(2 - despues.x, -4 - despues.z);
    assert.ok(Math.abs(fin2.rumbo - esperado) <= 5, `expected about ${esperado}°, got ${fin2.rumbo}°`);
    assert.ok(Math.abs(Math.hypot(fin2.fx, fin2.fz) - 1) < 0.01, "the front vector is a unit vector");
  } finally { puente.parar(); clearInterval(motor); globalThis.fetch = fetchReal; }
});
