// ia-llamar S8: the action bubble of every AI, decided by the server. Pure geometry (4 shapes, edges), the record of who is inside
// (entries, exits, disconnects), the events for the AI and the notice for the person (once per entry, rate-limited), the public
// shape, the query for S10/S12, the safety valve and the zero cost of a world with no AI. The AI's pass comes from a real roles feature.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";
import { encodePase } from "../packages/net/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import chatServer from "../features/chat/server.ts";
import iaServer from "../features/ia/server.ts";
import { crearBurbuja, AVISO_RESPIRO_TICKS, EVENTOS_POR_BARRIDO } from "../features/burbuja/server.ts";
import { ALTO_M, CADA_TICKS, DEFECTO, FORMAS, RADIO_MAX_M, RADIO_MIN_M, SUELO_TOL_M, burbuja, dentro, leerBurbuja } from "../features/burbuja/feature.ts";
import type { Forma } from "../features/burbuja/feature.ts";
import featuresServidor from "../features/servidor.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const T0 = Date.parse("2026-10-16T10:00:00Z");
const RESP = { comunidad: "La Torre", nombre: "Ana" };
const sub = (c: string) => `a_${c.repeat(16)}`;
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

function paseIA(t: number, o: Record<string, unknown> = {}): string {
  const s = Math.floor(t / 1000);
  const payload = { v: 1, iss: "numinia.com", aud: MUNDO, sub: sub("ab"), org: "org-1", perm: ["enter-worlds"], height: 0, roles: [{ name: "Guía", color: "#112233" }], name: "Ada", kind: "agent", state: "activa", iat: s, exp: s + 600, ...o };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}

type Evento = { ev: string; m: Record<string, unknown> };

/** A world with the roles feature (real passes), the bubble, and a probe that hears the bubble's server-side events the way S10 will. */
function mundo(o: { capacity?: number; burbuja?: ReturnType<typeof crearBurbuja> } = {}) {
  let ahora = T0;
  const log: string[] = [];
  const b = o.burbuja ?? crearBurbuja();
  const eventos: Evento[] = [];
  const sonda = serverPart(defineFeature({ id: "sonda", version: 1, describe: "test probe: records the bubble's server-side events" }), (api: ServerApi) => {
    for (const ev of ["entraEnBurbuja", "saleDeBurbuja", "entras", "sales"]) api.listen("burbuja", ev, (m) => { eventos.push({ ev, m: { ...m } }); return true; });
  });
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: firma, pase: { clave: CLAVE, mundo: MUNDO, org: "org-1" }, cerrar: (e) => inst.disconnect(e), ahora: () => ahora, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: o.capacity ?? 32, k: 50, snapshotEvery: 2, features: [chatServer, iaServer, b.part, sonda, roles.part], log: (l) => log.push(l), identitySign: firma, puede: (w, a) => roles.puede(w, a), credencial: roles.credencial, renovarPase: roles.renovar });
  const ias: ReturnType<Instance["join"]>[] = [];
  const sesionesIA = new Map<number, ClientSession>(); // an AI's page, only when a test asks for it (`ia(…, { pagina: true })`)
  const personas: { t: ReturnType<Instance["join"]>; s: ClientSession }[] = [];
  const fijos = new Map<number, [number, number, number]>();
  const poner = (e: number, x: number, z: number, y = 0): void => { fijos.set(e, [x, y, z]); inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.y[e] = fx(y); inst.sim.tf.cols.z[e] = fx(z); inst.sim.mo.cols.vy[e] = 0; };
  const pump = (n = CADA_TICKS): void => {
    for (let k = 0; k < n; k++) {
      for (const g of ias) g.flush();
      for (const p of personas) p.t.flush();
      for (const [e, [x, y, z]] of fijos) { if (!inst.sim.world.alive[e]) { fijos.delete(e); continue; } inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.y[e] = fx(y); inst.sim.tf.cols.z[e] = fx(z); inst.sim.mo.cols.vy[e] = 0; }
      inst.tick();
      for (const p of personas) { p.t.flush(); p.s.tick(0, 0); }
      for (const g of ias) g.flush();
      for (const sIA of sesionesIA.values()) sIA.tick(0, 0);
    }
  };
  /** A person (a page with its own session). Far away from everything until placed. */
  const persona = (x = 500, z = 500) => {
    const t = inst.join(personas.length + ias.length), s = new ClientSession(t, { features: [], identity: keeper() });
    personas.push({ t, s }); pump(2);
    const e = s.entity; poner(e, x, z); pump(1);
    return { t, s, e };
  };
  /** An organization's AI with a pass (the bubble comes from its `ia` block, or is the house one). */
  const ia = (token: string, x = 0, z = 0, y = 0, pagina = false) => {
    const t = inst.join(personas.length + ias.length); ias.push(t);
    const e = inst.conns.at(-1)!.entity;
    if (pagina) sesionesIA.set(e, new ClientSession(t, { features: [] }));
    pump(2);
    inst.identificar(e, "", token); pump(2);
    poner(e, x, z, y); pump(1);
    return { t, e };
  };
  const notas = (p: { s: ClientSession }): string[] => p.s.features.announcements.map((a) => a.text);
  const de = (ev: string, quien?: number) => eventos.filter((x) => x.ev === ev && (quien === undefined || x.m.quien === quien));
  const estado = () => personas[0]?.s.features.stateOf("burbuja") ?? new Map();
  return { inst, roles, b, eventos, log, poner, pump, persona, ia, notas, de, estado, sesionesIA, reloj: (ms: number) => { ahora = ms; }, enviarPase: (t: ReturnType<Instance["join"]>, token: string) => { t.send(encodePase(token)!, true); pump(2); } };
}

// ---------- pure geometry ----------

const A = { x: 10, y: 3, z: -4 };
const en = (forma: Forma, radio: number, dx: number, dy: number, dz: number) => dentro(forma, radio, A, { x: A.x + dx, y: A.y + dy, z: A.z + dz });

test("burbuja: declaration loads, is accessible, is on the server's list (R-1: nothing to switch on) and costs the page no code", () => {
  assert.deepEqual(burbuja.issues, []);
  assert.ok(featuresServidor.some((p) => p.feature.id === "burbuja"));
  assert.deepEqual(FORMAS, ["esfera", "cupula", "cilindro", "caja"]);
  assert.deepEqual([RADIO_MIN_M, RADIO_MAX_M, DEFECTO.radio, DEFECTO.forma, DEFECTO.visible], [2, 12, 4, "esfera", "al-acercarte"]);
});

test("burbuja: sphere — centred 1 m over the feet, edge inclusive; it follows an AI floating in the air; round, not square", () => {
  assert.equal(en("esfera", 4, 4, 0, 0), true, "on the edge");
  assert.equal(en("esfera", 4, 4.001, 0, 0), false);
  assert.equal(en("esfera", 4, 0, 0, -4), true);
  assert.equal(en("esfera", 4, 0, 4, 0), true, "four metres up: still on the edge, the sphere goes up too");
  assert.equal(en("esfera", 4, 0, 4.001, 0), false);
  assert.equal(en("esfera", 4, 0, -4, 0), true, "and four metres down (a person on the floor under a floating AI)");
  assert.equal(en("esfera", 4, 3, 0, 3), false, "the corner of the bounding square (4.24 m) is outside a round shape");
  assert.equal(en("esfera", 4, 2.8, 2.8, 0), true, "3.96 m diagonal");
  assert.equal(en("esfera", 2, 0, 0, 0), true);
  assert.equal(en("esfera", 12, 12, 0, 0), true);
  assert.equal(en("esfera", 12, 12.01, 0, 0), false);
});

test("burbuja: dome — the upper half-sphere on the floor; nothing under the floor, only a step's tolerance", () => {
  assert.equal(en("cupula", 4, 4, 0, 0), true, "edge on the floor");
  assert.equal(en("cupula", 4, 4.001, 0, 0), false);
  assert.equal(en("cupula", 4, 0, 4, 0), true, "the top of the dome");
  assert.equal(en("cupula", 4, 0, 4.001, 0), false);
  assert.equal(en("cupula", 4, 3, 2, 0), true, "3.6 m from the base centre, above ground");
  assert.equal(en("cupula", 4, 3, 3, 0), false, "4.24 m: past the curve");
  assert.equal(en("cupula", 4, 1, -SUELO_TOL_M, 0), true, "half a metre under: a step");
  assert.equal(en("cupula", 4, 1, -SUELO_TOL_M - 0.01, 0), false);
  assert.equal(en("cupula", 4, 0, -3, 0), false, "the sphere would hold a person on the floor below; the dome does not");
});

test("burbuja: cylinder — round on the floor, the whole height (6 m), the floor below and above out", () => {
  assert.equal(en("cilindro", 4, 4, 0, 0), true);
  assert.equal(en("cilindro", 4, 4.001, 0, 0), false);
  assert.equal(en("cilindro", 4, 2.8, 0, 2.8), true, "3.96 m diagonal");
  assert.equal(en("cilindro", 4, 3, 0, 3), false, "4.24 m: round, not square");
  assert.equal(en("cilindro", 4, 0, ALTO_M, 0), true, "top edge");
  assert.equal(en("cilindro", 4, 0, ALTO_M + 0.01, 0), false);
  assert.equal(en("cilindro", 4, 0, 5, 3.99), true, "five metres up, at the rim: the whole height counts");
  assert.equal(en("cilindro", 4, 0, -SUELO_TOL_M, 0), true);
  assert.equal(en("cilindro", 4, 0, -3, 0), false, "one floor down is another place");
});

test("burbuja: box — a square of side 2R aligned with the world axes (corners IN), same height as the cylinder", () => {
  assert.equal(en("caja", 4, 4, 0, 4), true, "the corner");
  assert.equal(en("caja", 4, -4, 0, -4), true);
  assert.equal(en("caja", 4, 4.001, 0, 0), false);
  assert.equal(en("caja", 4, 0, 0, -4.001), false);
  assert.equal(en("caja", 4, 3.99, 5, -3.99), true);
  assert.equal(en("caja", 4, 0, ALTO_M + 0.01, 0), false);
  assert.equal(en("caja", 4, 0, -3, 0), false);
  assert.equal(en("caja", 2, 2, 0, 2), true);
  assert.equal(en("caja", 2, 2, 0, 2.01), false);
});

test("burbuja: an unknown shape holds nobody; leerBurbuja falls back to the house bubble for anything odd", () => {
  assert.equal(dentro("rombo" as Forma, 4, A, A), false);
  assert.deepEqual(leerBurbuja(null), DEFECTO);
  assert.deepEqual(leerBurbuja({}), DEFECTO);
  assert.deepEqual(leerBurbuja({ forma: "caja", radio: 7, visible: "siempre" }), { forma: "caja", radio: 7, visible: "siempre" });
  assert.deepEqual(leerBurbuja({ forma: "triangulo", radio: 99, visible: "a-veces" }), DEFECTO);
  assert.deepEqual(leerBurbuja({ forma: "cupula", radio: 2.5 }), { forma: "cupula", radio: 4, visible: "al-acercarte" });
});

// ---------- in a world ----------

test("burbuja: an AI whose pass has no bubble gets the house one (sphere, 4 m, al-acercarte), published for the pages to draw; a person gets none", () => {
  const W = mundo();
  const p = W.persona(0, 50);
  const ada = W.ia(paseIA(T0));
  assert.deepEqual(W.b.burbujaDe(ada.e), DEFECTO);
  assert.deepEqual([...W.estado().keys()], [String(ada.e)]);
  assert.deepEqual(W.estado().get(String(ada.e)), { forma: "esfera", radio: 4, visible: "al-acercarte" });
  assert.equal(W.b.burbujaDe(p.e), null);
  assert.deepEqual(W.b.dentroDeBurbuja(p.e), []);
});

test("burbuja: the pass's bubble is the AI's bubble; a fresh pass in mid-session reshapes it and the people inside are reviewed", () => {
  const W = mundo();
  const ana = W.persona(0, 3);
  const ada = W.ia(paseIA(T0, { ia: { responde: RESP, burbuja: { forma: "caja", radio: 7, visible: "siempre" } } }));
  assert.deepEqual(W.estado().get(String(ada.e)), { forma: "caja", radio: 7, visible: "siempre" });
  W.pump();
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [ana.e]);
  W.reloj(T0 + 60_000);
  W.enviarPase(ada.t, paseIA(T0 + 60_000, { ia: { responde: RESP, burbuja: { forma: "esfera", radio: 2, visible: "nunca" } } }));
  assert.deepEqual(W.estado().get(String(ada.e)), { forma: "esfera", radio: 2, visible: "nunca" });
  assert.deepEqual(W.b.burbujaDe(ada.e), { forma: "esfera", radio: 2, visible: "nunca" });
  W.pump();
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [], "3 m is outside the new 2 m sphere");
  assert.equal(W.de("saleDeBurbuja", ana.e).length, 1);
  W.reloj(T0 + 120_000);
  W.enviarPase(ada.t, paseIA(T0 + 120_000));
  assert.deepEqual(W.estado().get(String(ada.e)), { forma: "esfera", radio: 4, visible: "al-acercarte" }, "a pass that drops its bubble goes back to the house one");
});

test("burbuja: entering sends «entraEnBurbuja» to the AI and the listeners, and the notice only to who entered; staying says nothing more", () => {
  const W = mundo();
  const ana = W.persona(0, 30), luis = W.persona(0, 40);
  const ada = W.ia(paseIA(T0), 0, 0);
  W.pump(30);
  assert.deepEqual(W.eventos, []);
  assert.deepEqual(W.notas(ana), []);
  W.poner(ana.e, 2, 0); // 2 m away
  W.pump();
  const e = W.de("entraEnBurbuja");
  assert.equal(e.length, 1);
  assert.deepEqual(e[0].m, { ia: ada.e, quien: ana.e, nombre: e[0].m.nombre, distanciaDm: 20, esIA: false });
  assert.equal(typeof e[0].m.nombre, "string");
  assert.equal(W.notas(ana).length, 1);
  assert.match(W.notas(ana)[0], /^Entras en la burbuja de .*Ada.* \(IA\)\.$/);
  assert.deepEqual(W.notas(luis), [], "only the person who entered is told");
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [ana.e]);
  assert.equal(W.b.estaEnBurbuja(ada.e, ana.e), true);
  assert.equal(W.b.estaEnBurbuja(ada.e, luis.e), false);
  W.pump(60);
  assert.equal(W.de("entraEnBurbuja").length, 1, "still inside: no new entry");
  assert.equal(W.notas(ana).length, 1);
});

test("burbuja: leaving sends «saleDeBurbuja» and the exit notice; a person who walks through twice far apart is told each time", () => {
  const W = mundo();
  const ana = W.persona(0, 30);
  const ada = W.ia(paseIA(T0), 0, 0);
  W.poner(ana.e, 3, 0); W.pump();
  W.poner(ana.e, 9, 0); W.pump();
  assert.equal(W.de("saleDeBurbuja", ana.e).length, 1);
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), []);
  assert.equal(W.notas(ana).length, 2);
  assert.match(W.notas(ana)[1], /^Sales de la burbuja de .*Ada.* \(IA\)\.$/);
  W.pump(AVISO_RESPIRO_TICKS);
  W.poner(ana.e, 1, 0); W.pump();
  assert.equal(W.de("entraEnBurbuja").length, 2);
  assert.equal(W.notas(ana).length, 3, "after the pause the entry is announced again");
});

test("burbuja: an edge that blinks is quiet — events every time, the on-screen notice once per pause, and no exit notice without an entry notice", () => {
  const W = mundo();
  const ana = W.persona(0, 30);
  const ada = W.ia(paseIA(T0), 0, 0);
  for (let i = 0; i < 4; i++) { W.poner(ana.e, 3.9, 0); W.pump(); W.poner(ana.e, 4.1, 0); W.pump(); }
  assert.equal(W.de("entraEnBurbuja").length, 4, "the AI is told every crossing");
  assert.equal(W.de("saleDeBurbuja").length, 4);
  assert.equal(W.de("entras").length, 1, "one notice sent in all (the probe hears it too)");
  assert.equal(W.notas(ana).filter((t) => t.startsWith("Entras")).length, 1, "one entry notice inside the pause");
  assert.equal(W.notas(ana).filter((t) => t.startsWith("Sales")).length, 1, "and only the exit that follows a noticed entry");
  void ada;
});

test("burbuja: people and AIs are told apart; an AI inside another's bubble is announced to it (esIA) but gets no on-screen notice", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ada = W.ia(paseIA(T0), 0, 0);
  const bea = W.ia(paseIA(T0, { sub: sub("cd"), name: "Bea" }), 2, 0);
  W.pump();
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [ana.e, bea.e].sort((x, y) => x - y));
  assert.deepEqual(W.b.dentroDeBurbuja(bea.e), [ana.e, ada.e].sort((x, y) => x - y));
  const deBea = W.de("entraEnBurbuja", bea.e).find((x) => x.m.ia === ada.e);
  assert.equal(deBea?.m.esIA, true);
  assert.equal(W.de("entraEnBurbuja", ana.e).every((x) => x.m.esIA === false), true);
  assert.equal(W.notas(ana).length, 2, "Ana is told once per bubble she is in");
});

test("burbuja: a floating AI's sphere is in the air; the person on the floor under it is outside it, a dome on the floor holds only what stands on it", () => {
  const W = mundo();
  const ana = W.persona(0, 30);
  const ada = W.ia(paseIA(T0, { ia: { responde: RESP, burbuja: { forma: "esfera", radio: 3, visible: "siempre" } } }), 0, 0, 6);
  W.poner(ana.e, 0, 0, 0); W.pump();
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [], "six metres under it");
  W.poner(ana.e, 0, 0, 4.5); W.pump();
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [ana.e], "1.5 m under its feet");
});

test("burbuja: a person who disconnects leaves the record (and the AI hears it); an entity reused later is a new arrival", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ada = W.ia(paseIA(T0), 0, 0);
  W.pump();
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [ana.e]);
  W.inst.disconnect(ana.e); W.pump(2);
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), []);
  assert.equal(W.de("saleDeBurbuja", ana.e).length, 1);
  const otra = W.persona(1, 0);
  W.pump();
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), [otra.e]);
  assert.equal(W.de("entraEnBurbuja", otra.e).length >= 1, true);
});

test("burbuja: when the AI disconnects its public state goes, everybody inside is announced as gone, and the query answers []", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(0, 2);
  const ada = W.ia(paseIA(T0), 0, 0);
  W.pump();
  assert.equal(W.b.dentroDeBurbuja(ada.e).length, 2);
  W.inst.disconnect(ada.e); W.pump(2);
  assert.deepEqual([...W.estado().keys()], []);
  assert.deepEqual(W.b.dentroDeBurbuja(ada.e), []);
  assert.equal(W.b.burbujaDe(ada.e), null);
  assert.deepEqual(W.de("saleDeBurbuja").map((x) => x.m.quien).sort(), [ana.e, luis.e].sort());
});

test("burbuja: safety valve — a crowd walking in at once is announced EVENTOS_POR_BARRIDO at a time, the rest at the next review, nobody lost", () => {
  const W = mundo({ capacity: 200 });
  const ada = W.ia(paseIA(T0), 0, 0);
  const gente = Array.from({ length: EVENTOS_POR_BARRIDO + 30 }, () => W.persona(500, 500));
  W.pump();
  W.eventos.length = 0;
  for (const g of gente) W.poner(g.e, 1, 1);
  for (let i = 0; i < CADA_TICKS && W.de("entraEnBurbuja").length === 0; i++) W.pump(1); // up to the first review that sees them
  assert.equal(W.de("entraEnBurbuja").length, EVENTOS_POR_BARRIDO, "only the valve's worth in this review");
  assert.equal(W.b.dentroDeBurbuja(ada.e).length, EVENTOS_POR_BARRIDO);
  W.pump();
  assert.equal(W.de("entraEnBurbuja").length, EVENTOS_POR_BARRIDO + 30);
  assert.equal(W.b.dentroDeBurbuja(ada.e).length, EVENTOS_POR_BARRIDO + 30);
});

// ---------- cost ----------

test("burbuja: with no AI connected it does no work at all — no position lookup, no player list, no emit, no state — for a hundred reviews", () => {
  const b = crearBurbuja();
  const llamadas: string[] = [];
  let onTick: (t: number) => void = () => {};
  const tonta = (n: string) => (): never => { llamadas.push(n); throw new Error(n); };
  const api = {
    id: "burbuja", log: () => {}, onIdentify: () => {}, onLeave: () => {}, listen: () => {}, onTick: (f: (t: number) => void) => { onTick = f; },
    players: tonta("players"), position: tonta("position"), emit: tonta("emit"), who: tonta("who"), tick: tonta("tick"),
    state: { get: tonta("state.get"), set: tonta("state.set"), delete: tonta("state.delete"), keys: tonta("state.keys") },
  } as unknown as ServerApi;
  b.part.setup(api);
  for (let t = 0; t < 1000; t++) onTick(t);
  assert.deepEqual(llamadas, []);
  assert.deepEqual(b.dentroDeBurbuja(7), []);
  assert.equal(b.burbujaDe(7), null);
});

test("burbuja: a world with people and no AI publishes nothing and tells nobody anything", () => {
  const W = mundo();
  const ana = W.persona(0, 0), luis = W.persona(1, 1);
  W.pump(60);
  assert.deepEqual([...W.estado().keys()], []);
  assert.deepEqual(W.eventos, []);
  assert.deepEqual(W.notas(ana), []);
  assert.deepEqual(W.notas(luis), []);
  assert.deepEqual(W.b.dentroDeBurbuja(ana.e), []);
});

test("burbuja: the AI's own page receives the entry and the exit (its mailbox for the bridge, S12); the person's page gets only the notice", () => {
  const W = mundo();
  const ana = W.persona(0, 30);
  const ada = W.ia(paseIA(T0), 0, 0, 0, true);
  W.poner(ana.e, 2, 0); W.pump();
  const suyos = () => W.sesionesIA.get(ada.e)!.features.log.map((x) => `${x.feature}.${x.event}`);
  assert.deepEqual(suyos().filter((x) => x.startsWith("burbuja.")), ["burbuja.entraEnBurbuja"]);
  const entrada = W.sesionesIA.get(ada.e)!.features.log.find((x) => x.event === "entraEnBurbuja")!;
  assert.equal(entrada.msg.quien, ana.e); assert.equal(entrada.msg.distanciaDm, 20); assert.equal(entrada.msg.esIA, false);
  assert.deepEqual(ana.s.features.log.filter((x) => x.feature === "burbuja").map((x) => x.event), ["entras"], "Ana's page hears her own notice, not the AI's mailbox");
  W.poner(ana.e, 9, 0); W.pump();
  assert.deepEqual(suyos().filter((x) => x.startsWith("burbuja.")), ["burbuja.entraEnBurbuja", "burbuja.saleDeBurbuja"]);
  assert.deepEqual(ana.s.features.log.filter((x) => x.feature === "burbuja").map((x) => x.event), ["entras", "sales"]);
});
