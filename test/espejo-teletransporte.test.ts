// mundo-hermes · lane M3 story 2: a visitor jumps between zones with the EXISTING teleport piece (R-1: no new piece) — the destinations are the
// zones of espejo.json, each one a click on «Ir a <zone>» that calls `irAPunto` (teletransporte `punto`). Every zone's jump must land INSIDE its rectangle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { crearCliente as crearClienteEspejo, destinosDeZonas } from "../features/espejo/client.ts";
import { crearCliente as crearViaje } from "../features/teletransporte/client.ts";
import { DESMATERIALIZAR_TICKS } from "../features/teletransporte/feature.ts";
import { ESQUEMA, leerEspejo, vistaPublica } from "../features/espejo/esquema.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const ESPEJO = {
  schema: ESQUEMA, activa: true,
  zonas: [
    { id: "z0", nombre: "El umbral", centro: { x: 0, z: 0 }, ancho: 20, fondo: 14, alto: 4, tipos: ["salud"] },
    { id: "z7", nombre: "El reloj", cartel: "Sala del reloj", centro: { x: 60, z: -40 }, ancho: 12, fondo: 10, alto: 6, tipos: ["cron"] },
    { id: "z3", nombre: "Las sesiones", centro: { x: -70, z: 55 }, ancho: 9, fondo: 9, alto: 6, tipos: ["sesion"] },
  ],
};

function mundo(archivos: Record<string, unknown> = { "espejo.json": ESPEJO }) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: conMundo(funciones, (f) => archivos[f], (l) => log.push(l), () => {}), log: (l) => log.push(l), identitySign: sign });
  const t = inst.join(0), e = crearClienteEspejo(), v = crearViaje();
  const cfg = leerEspejo(ESPEJO); if (cfg.ok) e.espejo.configurar(vistaPublica(cfg.value));
  const s = new ClientSession(t, { features: [e.parts[0], ...e.parts.slice(1), v.part], identity: keeper() });
  const pump = (k: number) => { for (let i = 0; i < k; i++) { t.flush(); inst.tick(); t.flush(); } };
  const pos = () => ({ x: fxToFloat(inst.sim.tf.cols.x[s.entity]), z: fxToFloat(inst.sim.tf.cols.z[s.entity]) });
  const poner = (x: number, z: number) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); };
  return { inst, s, e, v, pump, pos, poner, log };
}
const dentro = (p: { x: number; z: number }, z: { x: number; z: number; ancho: number; fondo: number }) => Math.abs(p.x - z.x) <= z.ancho / 2 && Math.abs(p.z - z.z) <= z.fondo / 2;

test("zone teleport: the destinations are the zones (by name), and without espejo there are none", () => {
  const W = mundo();
  assert.deepEqual(W.e.espejo.destinos().map((d) => [d.id, d.nombre, d.x, d.z]), [["z0", "El umbral", 0, 0], ["z7", "El reloj", 60, -40], ["z3", "Las sesiones", -70, 55]]);
  assert.deepEqual(destinosDeZonas(null), []); assert.deepEqual(destinosDeZonas(undefined), []);
  assert.deepEqual(crearClienteEspejo().espejo.destinos(), [], "a page that was never configured offers nowhere to go");
});

test("zone teleport: jumping to each zone lands inside that zone's rectangle, from anywhere", () => {
  const W = mundo();
  W.pump(4);
  const zonas = vistaPublica((leerEspejo(ESPEJO) as { ok: true; value: Parameters<typeof vistaPublica>[0] }).value)!.zonas;
  const esperas = TICK_HZ * 12; // the cooldown between trips
  for (const z of [...zonas, zonas[1], zonas[0]]) {
    W.pump(esperas); W.poner(-5, 90);
    const d = W.e.espejo.destinos().find((x) => x.id === z.id)!;
    assert.deepEqual(W.v.irAPunto(d.x, d.z, d.nombre), { ok: true });
    W.pump(DESMATERIALIZAR_TICKS + 6);
    assert.equal(W.v.estado.viaje?.ok, true, `${z.id}: ${W.v.estado.viaje?.texto}`);
    assert.ok(dentro(W.pos(), z), `${z.id}: landed at ${JSON.stringify(W.pos())}, outside ${z.ancho}x${z.fondo} around ${z.x},${z.z}`);
    assert.match(W.v.estado.viaje!.texto, new RegExp(d.nombre));
  }
});

test("zone teleport (bad): one trip at a time, a destination outside the world is told, and a far-off destination is told", () => {
  const W = mundo();
  W.pump(4);
  const z7 = W.e.espejo.destinos()[1];
  assert.deepEqual(W.v.irAPunto(z7.x, z7.z, z7.nombre), { ok: true }); W.pump(DESMATERIALIZAR_TICKS + 6);
  W.v.irAPunto(0, 0, "El umbral"); W.pump(3);
  assert.match(W.v.estado.viaje!.texto, /Espera \d+ s/, "the cooldown is the piece's, not a new one");
  W.pump(TICK_HZ * 12);
  W.v.irAPunto(1e9, 1e9, "Lejos"); W.pump(3);
  assert.equal(W.v.estado.viaje?.ok, false);
});
