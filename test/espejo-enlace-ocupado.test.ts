// mundo-hermes · M10: the link's port is busy (another Hermes link, or anything else): opening the link must fail with ONE clear, catchable error,
// never an uncaught 'error' event that takes the world down; the world goes on without the link.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { abrirEnlace } from "../packages/server/src/enlace-espejo.ts";

const CLAVE = "clave-del-enlace-de-prueba-0123456789";
const parte = { funciones: () => [], config: () => null, alta: () => ({}), cambio: () => ({}), baja: () => ({}), lote: () => ({}), conectada: () => {}, resultado: () => false, alPedir: () => {}, esperando: () => 0, alFunciones: () => {}, verificarEmbed: () => {} };

test("a busy port rejects with a clear message naming the port, and raises no uncaught error", async () => {
  const ocupante = createServer(); await new Promise<void>((ok) => ocupante.listen(0, "127.0.0.1", ok));
  const puerto = (ocupante.address() as { port: number }).port;
  const sin: Error[] = []; const oir = (e: Error) => sin.push(e); process.on("uncaughtException", oir);
  try {
    await assert.rejects(abrirEnlace({ enlace: parte as never, clave: CLAVE, puerto }), (e: Error) => e.message.includes(String(puerto)) && /ocupad/.test(e.message) && !/EADDRINUSE: /.test(e.message.split("\n")[1] ?? ""));
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(sin.map((e) => e.message), [], "nothing escaped");
  } finally { process.off("uncaughtException", oir); await new Promise((r) => ocupante.close(r)); }
});
