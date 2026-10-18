// J4: doors, buttons and things you pick up — headless (in-memory world, pages pumped by 20 Hz ticks). The server
// decides every state; the pages only ask and draw. Same verbs for a PC, a phone, VR and an agent (`features.use`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import type { PlacedObject } from "../packages/feature/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { puertas } from "../features/puertas/feature.ts";
import { crearPuertas, leerPuerta } from "../features/puertas/server.ts";
import { crearCliente as clientePuertas, hoja } from "../features/puertas/client.ts";
import { botones, LUZ_TICKS } from "../features/botones/feature.ts";
import { crearBotones, leerBoton } from "../features/botones/server.ts";
import { crearCliente as clienteBotones, tapa } from "../features/botones/client.ts";
import { cogibles, NADIE } from "../features/cogibles/feature.ts";
import { crearCogibles, leerCosa } from "../features/cogibles/server.ts";
import { crearCliente as clienteCogibles, MODELO_CAJA } from "../features/cogibles/client.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const PUERTA = { id: "norte", nombre: "Puerta norte", x: 6, z: 0, cierraEn: 1 };
const BOTON = { id: "rojo", nombre: "Botón rojo", x: 12, z: 0, puerta: "norte" };
const CAJA = { id: "caja", nombre: "Caja", x: -6, z: 0 };

function mundo(n: number) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearPuertas({ puertas: [PUERTA] }), crearBotones({ botones: [BOTON] }), crearCogibles({ cosas: [CAJA] })], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), p = clientePuertas(), b = clienteBotones(), c = clienteCogibles();
    const placed = new Map<string, PlacedObject | null>(), lleva = new Map<number, unknown>();
    const s = new ClientSession(t, { identity: keeper(), features: [...p.parts, ...b.parts, ...c.parts], view: { label() {}, bounce() {}, place: (k, o) => { placed.set(k, o); }, lleva: (e, x) => { lleva.set(e, x); } } });
    return { t, s, p: p.puertas, b: b.botones, c: c.cogibles, placed, lleva };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, place, log };
}
const eventos = (s: ClientSession, f: string, ev: string) => s.features.log.filter((l) => l.feature === f && l.event === ev);

test("J4: the three declarations meet the plug's rules and are in both lists", () => {
  for (const f of [puertas, botones, cogibles]) {
    assert.deepEqual(f.issues, [], f.id);
    assert.ok(funciones.some((x) => x.feature.id === f.id), `${f.id} in features/servidor.ts`);
    assert.ok(paginas.some((x) => x.feature.id === f.id), `${f.id} in features/cliente.ts`);
  }
  assert.equal(puertas.state?.card?.role, "puerta"); assert.equal(botones.state?.card?.role, "boton"); assert.equal(cogibles.state?.card?.role, "objeto");
});

test("J4: a world's lines are checked, with a reason when left out", () => {
  assert.equal(typeof leerPuerta({ id: "Norte!", x: 0, z: 0 }), "string");
  assert.equal(typeof leerPuerta({ id: "ok", x: "no", z: 0 }), "string");
  assert.deepEqual(leerPuerta({ id: "ok", x: 1, z: 2, cierraEn: 999, ancho: 40 }), { id: "ok", nombre: "Puerta", x: 1, z: 2, y: 0, ry: 0, ancho: 6, alto: 2.2, radio: 2.5, cierraEn: 120, abierta: false });
  assert.match(String(leerBoton({ id: "b", x: 0, z: 0, puerta: "La Puerta" })), /puerta/);
  assert.match(String(leerCosa({ id: "c", x: 0, z: 0, modelo: "abc" })), /sha256/);
  assert.equal((leerCosa({ id: "c", x: 0, z: 0 }) as { escala: number }).escala, 0.4);
});

test("J4: the drawings are pure — the slab swings on its hinge, the cap sinks while lit, the box sits on the floor", () => {
  const cerrada = hoja({ x: 6, y: 0, z: 0, ry: 0, ancho: 1, alto: 2, abierta: false }), abierta = hoja({ x: 6, y: 0, z: 0, ry: 0, ancho: 1, alto: 2, abierta: true });
  assert.deepEqual([cerrada.x, cerrada.z, cerrada.y, cerrada.ry, cerrada.sx, cerrada.sy], [6.5, 0, 1, 0, 1, 2]);
  assert.ok(Math.abs(abierta.x - 6) < 1e-9 && Math.abs(abierta.z + 0.5) < 1e-9 && abierta.ry === 90, "open: the free edge went through 90° around the hinge");
  assert.ok(tapa({ x: 0, y: 0, z: 0, pulsado: true }).y < tapa({ x: 0, y: 0, z: 0, pulsado: false }).y);
});

test("J4 door: the server flips it for whoever is near, refuses from afar, and it closes alone after cierraEn", () => {
  const { pages: [a, b, lejos], pump, place } = mundo(3);
  pump(3);
  place(a.s.entity, 7, 1); place(b.s.entity, 1, 0); place(lejos.s.entity, 6 + 100, 0); pump(4);
  assert.deepEqual(a.p.lista().map((p) => [p.id, p.abierta, p.aviso]), [["norte", false, "abrir"]]);
  assert.equal(a.s.features.reachable(7, 1)[0]?.prompt, "abrir Puerta norte", "the page offers «E: abrir Puerta norte»");
  assert.ok(b.p.usar("norte").ok); pump(3);
  assert.equal(b.p.lista()[0].abierta, false, "b is 5 m away (radius 2.5 + 1.5 slack): refused");
  assert.match(String(eventos(b.s, "puertas", "rechazado").at(-1)?.msg.motivo), /Acércate/);
  assert.ok(a.s.features.use("puertas", "norte").ok, "the same path an agent takes"); pump(3);
  assert.equal(a.p.lista()[0].abierta, true); assert.equal(a.p.lista()[0].aviso, "cerrar");
  assert.equal(b.p.lista()[0].abierta, true, "b sees it open too");
  assert.equal(eventos(b.s, "puertas", "cambio").length, 1, "b heard the door");
  assert.equal(eventos(lejos.s, "puertas", "cambio").length, 0, "100 m away hears nothing");
  assert.equal((a.placed.get("puertas:norte") as PlacedObject).ry, 90, "a's page draws it swung open");
  pump(25); // cierraEn 1 s = 20 ticks
  assert.equal(a.p.lista()[0].abierta, false, "closed alone");
  assert.equal(eventos(a.s, "puertas", "cambio").at(-1)?.msg.quien, 0, "nobody closed it");
  assert.equal(a.s.features.announcements.filter((x) => x.feature === "puertas").length >= 2, true, "announced (accessibility)");
});

test("J4 button: pressed from close by, lit LUZ_TICKS, counted, and its signal opens the door it names", () => {
  const { pages: [a, b], pump, place } = mundo(2);
  pump(3);
  place(a.s.entity, 12.5, 0.5); place(b.s.entity, 6, 2); pump(4);
  assert.equal(a.s.features.reachable(12.5, 0.5)[0]?.prompt, "pulsar Botón rojo");
  assert.ok(b.b.pulsar("rojo").ok); pump(3);
  assert.equal(b.b.lista()[0].pulsaciones, 0, "b is 6 m away: refused");
  assert.ok(a.b.pulsar("rojo").ok); pump(2);
  const bt = a.b.lista()[0];
  assert.equal(bt.pulsaciones, 1); assert.equal(bt.pulsado, true);
  assert.equal(eventos(b.s, "botones", "pulsado").length, 1, "b, near, hears the press");
  assert.equal(eventos(b.s, "botones", "senal").length, 0, "the signal never reaches a page");
  assert.equal(b.p.lista()[0].abierta, true, "the button opened the door");
  assert.equal(eventos(b.s, "puertas", "cambio").at(-1)?.msg.texto, "Botón rojo abre Puerta norte");
  pump(LUZ_TICKS + 2);
  assert.equal(a.b.lista()[0].pulsado, false, "light out");
});

test("J4 pick up: the server hands it, every page draws it in that hand, one per person, dropped where you stand or on leaving", () => {
  const { inst, pages: [a, b], pump, place } = mundo(2);
  pump(3);
  place(a.s.entity, -5, 1); place(b.s.entity, -4, 0); pump(4);
  assert.equal(a.s.features.reachable(-5, 1)[0]?.prompt, "coger Caja");
  assert.ok((a.placed.get("cogibles:caja") as PlacedObject).model === MODELO_CAJA, "on the floor: the house box");
  assert.ok(a.c.coger("caja").ok); pump(3);
  const c = a.c.lista()[0];
  assert.equal(c.portador, a.s.entity); assert.equal(c.radio, 0, "nobody is offered «coger» while carried");
  assert.deepEqual(a.c.mias(), ["caja"]);
  assert.equal(a.placed.get("cogibles:caja"), null, "gone from the floor");
  assert.deepEqual(b.lleva.get(a.s.entity), { model: MODELO_CAJA, donde: "mano", nombre: "Caja" }, "b's page draws it in a's hand");
  assert.ok(b.c.coger("caja").ok); pump(3);
  assert.match(String(eventos(b.s, "cogibles", "rechazado").at(-1)?.msg.motivo), /la lleva/);
  assert.equal(a.s.features.reachable(-5, 1).length, 0, "a's own page no longer offers it either");
  // drop where you stand
  place(a.s.entity, -1, 3); pump(2);
  assert.ok(a.c.soltar().ok); pump(3);
  const d = b.c.lista()[0];
  assert.equal(d.portador, NADIE); assert.ok(Math.abs(d.x + 1) < 0.05 && Math.abs(d.z - 3) < 0.05, `dropped at (-1, 3): ${d.x}, ${d.z}`);
  assert.equal(b.lleva.get(a.s.entity), null, "hand emptied on every page");
  assert.ok((b.placed.get("cogibles:caja") as PlacedObject).x < 0, "back on the floor");
  // leaving drops it
  place(b.s.entity, -1, 3); pump(2);
  assert.ok(b.c.coger("caja").ok); pump(3);
  assert.equal(a.c.lista()[0].portador, b.s.entity);
  inst.disconnect(b.s.entity); for (let i = 0; i < 3; i++) { a.t.flush(); inst.tick(); a.t.flush(); }
  assert.equal(a.c.lista()[0].portador, NADIE, "b left: the box is free");
});

test("J4: the simulation never hears of it (its fingerprint is the same with and without the three)", () => {
  const con = mundo(2), sin = (() => { const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer], identitySign: sign }); const ts = [inst.join(0), inst.join(1)]; return { inst, pump: (n = 2) => { for (let i = 0; i < n; i++) { for (const t of ts) t.flush(); inst.tick(); for (const t of ts) t.flush(); } }, place: (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); } }; })();
  con.pump(3); sin.pump(3);
  con.place(con.pages[0].s.entity, 7, 1); sin.place(con.pages[0].s.entity, 7, 1); con.pump(2); sin.pump(2);
  con.pages[0].p.usar("norte"); con.pump(10); sin.pump(10);
  assert.equal(con.inst.hash(), sin.inst.hash());
});

test("J4: conMundo reads interacciones.json and says when its shape is wrong", () => {
  const log: string[] = [];
  const partes = conMundo(funciones, (f) => (f === "interacciones.json" ? { puertas: [PUERTA], botones: "no", cosas: [CAJA] } : undefined), (l) => log.push(l));
  assert.equal(partes.length, funciones.length);
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: partes.filter((p) => ["puertas", "botones", "cogibles"].includes(p.feature.id)), log: (l) => log.push(l) });
  inst.tick();
  assert.ok(log.some((l) => /puertas: 1 puerta/.test(l)) && log.some((l) => /cogibles: 1 cosa/.test(l)), log.join("\n"));
  const log2: string[] = [];
  conMundo(funciones, (f) => (f === "interacciones.json" ? { nada: 1 } : undefined), (l) => log2.push(l));
  assert.ok(log2.some((l) => /interacciones\.json no tiene ninguna lista/.test(l)));
});
