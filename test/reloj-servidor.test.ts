// M18 · el reloj del servidor llega a la página: `ClientSession.relojServidorMs()` es `null` hasta el primer snapshot y
// después es el mismo número para todas las páginas conectadas al mismo servidor (sus ticks), aunque cada una cuente el
// tiempo desde un origen distinto. Es el reloj que `view.fijarRelojMundo` da a los vídeos.
import test from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { loopbackPair } from "../packages/net/src/index.ts";

test("relojServidorMs: null antes del primer snapshot; luego el reloj del servidor, igual en todas las páginas", () => {
  const inst = new Instance({ seed: 18, capacity: 4, k: 4, snapshotEvery: 2 });
  const [sa, ca] = loopbackPair(), [sb, cb] = loopbackPair();
  inst.connect(sa); inst.connect(sb);
  const a = new ClientSession(ca), b = new ClientSession(cb);
  assert.equal(a.relojServidorMs(0), null, "antes de oír al servidor no hay reloj");
  const tickea = () => { a.tick(0, 0, 0); b.tick(0, 0); inst.tick(); ca.flush(); cb.flush(); };
  for (let t = 0; t < 40; t++) tickea();
  // las dos páginas miden con el mismo reloj local aquí; la hora de cada una (su `now`) puede ser cualquier origen:
  // lo que se compara es el reloj del servidor que cada una deduce.
  const ahora = performance.now();
  const ra = a.relojServidorMs(ahora)!, rb = b.relojServidorMs(ahora)!;
  assert.equal(typeof ra, "number"); assert.equal(typeof rb, "number");
  assert.ok(Math.abs(ra - rb) < 1000 / TICK_HZ, `las dos páginas a menos de un tick (${Math.abs(ra - rb).toFixed(2)} ms)`);
  const servidorMs = (inst.sim.tick * 1000) / TICK_HZ;
  assert.ok(Math.abs(ra - servidorMs) < 600, `y cerca del reloj del servidor (${Math.abs(ra - servidorMs).toFixed(0)} ms, el vuelo del paquete incluido)`);
});
