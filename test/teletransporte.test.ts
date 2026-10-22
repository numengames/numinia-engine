// N16: teletransporte — go next to someone connected now («ir con quien está conectado ahora», no account), a photo's
// place when the world allows it, and the light that takes you and leaves you (variants decided by the server).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ, createSim, sitioLibre, setSolids, setMesh, PISO_SIN_SUELO, BOUND } from "../packages/sim/src/index.ts";
import { terrenoMalla } from "../packages/sim/src/terreno-malla.ts";
import { alturaBase } from "../packages/relieve/src/espacio-base.ts";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { crearTeletransporte, rumboHacia, siNo, normal } from "../features/teletransporte/server.ts";
import { crearCliente as crearViaje } from "../features/teletransporte/client.ts";
import type { Destello } from "../features/teletransporte/client.ts";
import { teletransporte, huellaDe, ESPERA_S, DESMATERIALIZAR_TICKS, FOTO_VENTANA_S } from "../features/teletransporte/feature.ts";
import { leerAparicionFoto } from "../features/entorno/esquema.ts";
import { conMundo } from "../features/mundo.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

/** A headless world with chat, roles and teletransporte: n people with identities. */
function mundo(n: number, o: { foto?: boolean } = {}) {
  const log: string[] = [];
  const reloj = { ms: Date.parse("2026-10-18T22:00:00Z") };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearTeletransporte(o), roles.part], log: (l) => log.push(l), identitySign: sign, puede: (who, accion) => roles.puede(who, accion) });
  const entrar = (i: number) => {
    const t = inst.join(i), c = crearChat(() => reloj.ms), v = crearViaje();
    const luces: Destello[] = [];
    v.alDestello((d) => luces.push(d));
    const s = new ClientSession(t, { features: [c.part, v.part], identity: keeper() });
    return { t, s, chat: c.chat, v, luces };
  };
  const gente = Array.from({ length: n }, (_, i) => entrar(i));
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const nombre = (p: { s: ClientSession }) => inst.who(p.s.entity)!.nombre;
  const avisos = (p: (typeof gente)[number]) => p.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto);
  const ultimo = (p: (typeof gente)[number]) => avisos(p).at(-1) ?? "";
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  const pos = (p: { s: ClientSession }) => { const e = p.s.entity; return { x: fxToFloat(inst.sim.tf.cols.x[e]), y: fxToFloat(inst.sim.tf.cols.y[e]), z: fxToFloat(inst.sim.tf.cols.z[e]) }; };
  const poner = (p: { s: ClientSession }, x: number, z: number) => { const e = p.s.entity; inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, gente, pump, nombre, ultimo, decir, pos, poner, log };
}
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test("teletransporte: declared for people and agents; helpers", () => {
  assert.deepEqual(teletransporte.issues, []);
  assert.ok(teletransporte.describe.includes("conectado"));
  assert.equal(siNo("Sí"), true); assert.equal(siNo("off"), false); assert.equal(siNo("quizá"), null);
  assert.equal(normal("  Ána  María "), "ana maria");
  assert.equal(rumboHacia(0, 0, 0, 5), 0); assert.equal(rumboHacia(0, 0, 5, 0), 2); assert.equal(rumboHacia(0, 0, -5, -5), 5);
  // entorno.json aparicionFoto: off when absent, a wrong value says how to fix it
  assert.deepEqual(leerAparicionFoto({}), { ok: true, value: false });
  assert.deepEqual(leerAparicionFoto({ aparicionFoto: true }), { ok: true, value: true });
  const ko = leerAparicionFoto({ aparicionFoto: "sí" });
  assert.ok(!ko.ok && ko.issues[0].path === "entorno.aparicionFoto");
});

test("sitioLibre: the point, else rings from the heading you came from; never inside a solid nor off a ledge", () => {
  const s = createSim(1, 4);
  assert.deepEqual(sitioLibre(s, fx(3), 0, fx(4), [0]), { x: fx(3), y: 0, z: fx(4) });
  // a 2×2 m box on the point: the ring's first heading (+x, rumbo 2) is free
  setSolids(s, new Int32Array([fx(2), 0, fx(3), fx(4), fx(2), fx(5)]));
  const p = sitioLibre(s, fx(3), 0, fx(4), [0, 1.5], 2)!;
  assert.ok(p && fxToFloat(p.x) > 4 && p.y === 0, "beside the box, on the ground");
  // a person standing ON the box (y = 2): the ring around them on the box top is a 2 m drop off; caida 1 refuses it, 3 accepts
  const encima = sitioLibre(s, fx(3), fx(2), fx(4), [0.6], 0, 1);
  assert.ok(encima && encima.y === fx(2), "on the box top beside them");
  assert.equal(sitioLibre(s, fx(3), fx(2), fx(4), [5], 0, 1), null, "5 m away is the ground, 2 m down: not with caida 1");
  assert.ok(sitioLibre(s, fx(3), fx(2), fx(4), [5], 0, 3));
  assert.equal(sitioLibre(s, BOUND, 0, 0, [0]), null, "the world's edge");
});

test("teletransporte: Gente lists who is here now; ir puts you next to them, never on top, after the light", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(4);
  W.poner(A, 0, 0); W.poner(B, 30, -40); W.poner(C, -50, 10);
  W.pump(2);
  assert.deepEqual(A.v.pedirGente(), { ok: true });
  W.pump(3);
  assert.deepEqual(A.v.estado.gente.map((g) => g.nombre).sort(), [W.nombre(B), W.nombre(C)].sort(), "everyone but you");
  assert.equal(A.v.estado.todos, 2);
  // ux2-gente: each one comes with a tag of their identity (16 hex), the page's key for a friend; never the id itself
  const huellas = A.v.estado.gente.map((g) => g.huella);
  assert.ok(huellas.every((h) => /^[0-9a-f]{16}$/.test(h)) && huellas[0] !== huellas[1], JSON.stringify(huellas));
  assert.deepEqual(new Set(huellas), new Set([B, C].map((p) => huellaDe(W.inst.who(p.s.entity)!.id))));
  assert.ok(!A.v.estado.gente.some((g) => g.huella.includes(W.inst.who(B.s.entity)!.id)));
  assert.equal(huellaDe("abcdefghijkl"), huellaDe("abcdefghijkl"), "the same identity, the same tag");
  assert.ok(A.v.activo());
  assert.equal(A.v.foto(), false, "a photo's place is off unless the world says so");
  const antes = W.pos(A);
  assert.deepEqual(A.v.ir(B.s.entity), { ok: true });
  W.pump(2);
  const sale = A.luces.find((d) => d.tipo === "sale")!;
  assert.ok(sale && sale.quien === A.s.entity && dist(sale, antes) < 0.1, "the light takes you where you stand");
  assert.ok(sale.variante >= 0 && sale.variante <= 2);
  assert.ok(dist(W.pos(A), antes) < 0.5, "you have not moved yet");
  W.pump(DESMATERIALIZAR_TICKS + 2);
  const b = W.pos(B), a = W.pos(A), d = dist(a, b);
  assert.ok(d >= 1 && d <= 3.2, `next to them (${d.toFixed(2)} m)`);
  assert.ok(a.x < b.x && a.z > b.z, "on the side you came from");
  const llega = B.luces.find((l) => l.tipo === "llega" && l.quien === A.s.entity)!;
  assert.ok(llega && llega.variante === sale.variante, "who is there sees you arrive, with the same look");
  assert.ok(!C.luces.some((l) => l.tipo === "llega"), "far away, nobody sees it");
  assert.equal(A.v.estado.viaje?.ok, true);
  assert.match(A.v.estado.viaje!.texto, /Estás junto a/);
  // A's own page follows its body (snapshot + reconcile)
  W.pump(6);
  assert.ok(dist(A.s.selfPosition(1), b) < 3.5, "the page shows you there");
  // again at once: wait
  assert.deepEqual(A.v.ir(C.s.entity), { ok: true });
  W.pump(3);
  assert.match(A.v.estado.viaje!.texto, /Espera \d+ s/);
  W.pump(ESPERA_S * TICK_HZ);
  A.v.ir(C.s.entity);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(W.pos(A), W.pos(C)) <= 3.2, "after the wait you may go again");
});

test("teletransporte: no room next to them, or they left: you come back where you were; solids are never entered", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(4);
  W.poner(A, 0, 0); W.poner(B, 40, 40); W.poner(C, -40, 40);
  W.pump(2);
  // B stands in a pit of walls: a 14×14 m block with B's cell carved by height (B on the ground, the block 3 m high around)
  const pared = (x0: number, z0: number, x1: number, z1: number) => [fx(x0), 0, fx(z0), fx(x1), fx(3), fx(z1)];
  setSolids(W.inst.sim, new Int32Array([...pared(33, 33, 47, 39.6), ...pared(33, 40.4, 47, 47), ...pared(33, 39.6, 39.6, 40.4), ...pared(40.4, 39.6, 47, 40.4)]));
  const antes = W.pos(A);
  A.v.ir(B.s.entity);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(W.pos(A), antes) < 0.5, "nothing moved");
  assert.equal(A.v.estado.viaje?.ok, false);
  assert.match(A.v.estado.viaje!.texto, /No hay sitio libre junto a/);
  assert.ok(A.luces.some((l) => l.tipo === "llega" && dist(l, antes) < 0.5), "the light leaves you where you were");
  // C leaves while A's light holds them
  W.pump(ESPERA_S * TICK_HZ);
  A.v.ir(C.s.entity);
  W.pump(2);
  W.inst.disconnect(C.s.entity);
  W.gente.splice(2, 1);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(W.pos(A), antes) < 0.5);
  assert.match(A.v.estado.viaje!.texto, /se ha ido/);
  // asking for someone who is not here, or yourself
  A.v.ir(9999); W.pump(3);
  assert.match(A.v.estado.viaje!.texto, /ya no está conectada/);
  A.v.ir(A.s.entity); W.pump(3);
  assert.match(A.v.estado.viaje!.texto, /contigo/);
});

test("teletransporte: /ir <nombre> from the chat; who will not be found is neither listed nor reachable", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(4);
  W.poner(A, 0, 0); W.poner(B, 20, 0); W.poner(C, -20, 0);
  W.decir(A, "/ir");
  assert.match(W.ultimo(A), /Conectados ahora \(2\)/);
  W.decir(C, "/encontrable no");
  assert.match(W.ultimo(C), /Nadie puede ir junto a ti/);
  assert.equal(C.v.estado.encontrable, false);
  W.decir(A, "/ir");
  assert.match(W.ultimo(A), /Conectados ahora \(1\)/);
  W.decir(A, `/ir ${W.nombre(C)}`);
  assert.match(W.ultimo(A), /No hay nadie conectado que se llame/);
  A.v.ir(C.s.entity); W.pump(3);
  assert.match(A.v.estado.viaje!.texto, /no se deja encontrar/);
  W.decir(A, `/ir ${W.nombre(B).toUpperCase()}`);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.match(W.ultimo(A), /Estás junto a/);
  assert.ok(dist(W.pos(A), W.pos(B)) <= 3.2);
  assert.ok(A.chat.lineas.every((l) => l.tipo !== "aviso" || !/Estás junto/.test(l.texto)) === false);
  assert.ok(B.chat.lineas.every((l) => l.tipo !== "aviso" || !/Estás junto/.test(l.texto)), "answers only to who typed");
  // the help mentions it
  W.decir(B, "/ayuda");
  assert.match(W.ultimo(B), /\/ir <nombre>/);
});

test("teletransporte: owners and who directs switch it off; a visitor cannot", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(4);
  assert.equal(A.v.estado.puede, false);
  W.decir(B, "/teletransporte no");
  assert.match(W.ultimo(B), /dueños, la administración y quien dirige/);
  assert.ok(C.v.activo());
  W.decir(A, `/dueño ${ADMIN}`);
  W.pump(3);
  assert.equal(A.v.estado.puede, true);
  W.decir(A, "/teletransporte no");
  assert.match(W.ultimo(A), /apagado en este mundo/);
  assert.equal(C.v.activo(), false, "everyone's page knows");
  C.v.ir(B.s.entity); W.pump(3);
  assert.equal(C.v.estado.viaje?.ok, false);
  assert.match(C.v.estado.viaje!.texto, /lo han apagado/);
  // whoever directs (Moderación: manage-rituals) may switch it back
  W.decir(A, `/dar ${W.nombre(B)} Moderación`);
  W.pump(3);
  assert.equal(B.v.estado.puede, true);
  assert.deepEqual(B.v.permitir(true), { ok: true });
  W.pump(3);
  assert.ok(C.v.activo());
  W.decir(C, "/teletransporte");
  assert.match(W.ultimo(C), /está encendido/);
});

test("teletransporte: a photo's place only when the world allows it, once, on arrival, on a free spot", () => {
  const no = mundo(1);
  no.pump(4);
  const [P] = no.gente;
  const antes = no.pos(P);
  P.v.aparecerEnFoto(12, 0.5, -7);
  no.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(no.pos(P), antes) < 0.5, "a world that does not say so: you stay at the spawn");
  assert.match(P.v.estado.viaje!.texto, /no deja aparecer/);

  const W = mundo(2, { foto: true });
  W.pump(4);
  const [A, B] = W.gente;
  assert.ok(A.v.foto());
  A.v.aparecerEnFoto(12, 0.5, -7);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(W.pos(A), { x: 12, z: -7 }) < 0.2, "at the photo's place");
  assert.match(A.v.estado.viaje!.texto, /donde se hizo la foto/);
  A.v.aparecerEnFoto(-30, 0.5, 30);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(W.pos(A), { x: 12, z: -7 }) < 0.2, "only once");
  // a photo's place does not count as a trip: you may go to someone right away
  A.v.ir(B.s.entity);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(W.pos(A), W.pos(B)) <= 3.2);
  // late: only in the first seconds
  W.pump(FOTO_VENTANA_S * TICK_HZ + 2);
  B.v.aparecerEnFoto(5, 0.5, 5);
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.match(B.v.estado.viaje!.texto, /solo vale al entrar/);
});

test("teletransporte: the world folder's entorno.json turns the photo's place on (off when absent or wrong)", () => {
  const estado = (entorno: unknown) => {
    const log: string[] = [];
    const fs = conMundo([crearTeletransporte()], (f) => (f === "entorno.json" ? entorno : undefined), (l) => log.push(l));
    const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: fs, log: () => {} });
    return { foto: [...inst.features.allState()].find(([k]) => k === "teletransporte:mundo")?.[1].foto, log };
  };
  assert.equal(estado({ schema: "numinia-engine/entorno@1", aparicionFoto: true }).foto, true);
  assert.equal(estado({ schema: "numinia-engine/entorno@1" }).foto, false);
  assert.equal(estado(undefined).foto, false);
  const mal = estado({ schema: "numinia-engine/entorno@1", aparicionFoto: 1 });
  assert.equal(mal.foto, false);
  assert.match(mal.log.join("\n"), /aparicionFoto/);
});

test("teletransporte: MVL1 — a marked site of the map; your own height, a free spot nearby, no name repeated", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(4);
  W.poner(A, 0, 0);
  const antes = W.pos(A);
  assert.deepEqual(A.v.irAPunto(20, -15, "La fuente"), { ok: true });
  W.pump(2);
  const sale = A.luces.find((d) => d.tipo === "sale")!;
  assert.ok(sale && dist(sale, antes) < 0.1, "the light takes you where you stand, like going to someone");
  W.pump(DESMATERIALIZAR_TICKS + 4);
  assert.ok(dist(W.pos(A), { x: 20, z: -15 }) < 0.2, "you stand at the site");
  assert.equal(W.pos(A).y, antes.y, "your own height, not the site's (the map has no y)");
  assert.equal(A.v.estado.viaje?.ok, true);
  assert.match(A.v.estado.viaje!.texto, /Has llegado en La fuente\./);
  // the same cooldown as going to someone (one trip every ESPERA_S)
  A.v.irAPunto(5, 5, "Otro sitio");
  W.pump(3);
  assert.match(A.v.estado.viaje!.texto, /Espera \d+ s/);
  // off: no one may go to a site either
  W.pump(ESPERA_S * TICK_HZ);
  W.decir(B, `/dueño ${ADMIN}`);
  W.decir(B, "/teletransporte no");
  A.v.irAPunto(1, 1, ""); W.pump(3);
  assert.equal(A.v.estado.viaje?.ok, false);
  assert.match(A.v.estado.viaje!.texto, /lo han apagado/);
});

test("teletransporte: v8 — a map site on the espacio base's relief (a hill above, a cleft below) is reached; the failure is told", () => {
  // Pablo, Quest 3S: «el teletransporte no funciona». «Ir a su lado» worked everywhere; «Ir» to a map site tried the ground only within a
  // step of the TRAVELLER's height, so on the base's relief most sites answered «No hay sitio libre» (and the headset showed nothing).
  const W = mundo(1);
  const [A] = W.gente;
  setMesh(W.inst.sim, terrenoMalla({ semilla: 42, tamano: 200, plaza: 12, estanque: false, base: true }).bvh, PISO_SIN_SUELO);
  W.pump(4);
  W.poner(A, 0, 0);
  const sitios: { x: number; z: number; h: number }[] = [];
  for (const [x, z] of [[60, 30], [-50, 70], [20, -80], [-70, -40], [80, -10], [-30, 60], [10, 90], [-85, 20]]) sitios.push({ x, z, h: alturaBase(42, x, z) });
  assert.ok(sitios.some((s) => s.h > 3) && sitios.some((s) => s.h < -1), `the sample has a hill and a cleft: ${sitios.map((s) => s.h.toFixed(1))}`);
  for (const s of sitios) {
    W.pump(ESPERA_S * TICK_HZ + 4);
    W.poner(A, 0, 0); W.inst.sim.tf.cols.y[A.s.entity] = 0;
    assert.deepEqual(A.v.irAPunto(s.x, s.z, "Sitio"), { ok: true });
    W.pump(DESMATERIALIZAR_TICKS + 4);
    assert.equal(A.v.estado.viaje?.ok, true, `site (${s.x}, ${s.z}) at ${s.h.toFixed(1)} m: ${A.v.estado.viaje?.texto}`);
    const p = W.pos(A);
    assert.ok(dist(p, s) < 2.1, `you stand at the site (${s.x}, ${s.z}): ${dist(p, s).toFixed(2)} m`);
    assert.ok(Math.abs(p.y - alturaBase(42, p.x, p.z)) < 0.5, `on the ground there (${p.y.toFixed(2)} vs ${alturaBase(42, p.x, p.z).toFixed(2)})`);
  }
});

test("the light: three masks, the body hidden between the cuts, no lights on tier D, few on Quest", async () => {
  const P = await import("../packages/render/src/teletransporte-politica.ts");
  // leaving: whole at the start, gone at the end; arriving: the reverse
  assert.equal(P.umbral(0, "sale"), 0); assert.equal(P.umbral(1, "sale"), 1);
  assert.equal(P.umbral(0, "llega"), 1); assert.equal(P.umbral(1, "llega"), 0);
  const cuenta = (v: number, s: number) => { let n = 0; for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) if (P.visible(v, (i + 0.5) / 40, (j + 0.5) / 40, s)) n++; return n / 1600; };
  for (const v of [0, 1, 2]) {
    assert.ok(cuenta(v, 0) > 0.97, `look ${v}: whole at 0`);
    assert.ok(cuenta(v, 1) < 0.03, `look ${v}: gone at 1`);
    assert.ok(Math.abs(cuenta(v, 0.5) - 0.5) < 0.12, `look ${v}: about half at 0.5`);
  }
  // their shapes: 0 keeps the middle, 1 keeps the top, 2 is scattered
  assert.ok(P.visible(0, 0.5, 0.5, 0.8) && !P.visible(0, 0.5, 0.05, 0.8) && !P.visible(0, 0.5, 0.95, 0.8));
  assert.ok(P.visible(1, 0.5, 0.95, 0.8) && !P.visible(1, 0.5, 0.5, 0.8));
  assert.ok(P.cuerpoVisible(0.2, "sale") && !P.cuerpoVisible(0.7, "sale") && !P.cuerpoVisible(0.2, "llega") && P.cuerpoVisible(0.7, "llega"));
  assert.equal(P.LUCES_MAX.D, 0); assert.equal(P.CHISPAS.D, 0);
  assert.ok(P.LUCES_MAX.B <= 3 && P.CHISPAS.B < P.CHISPAS.A, "Quest: fewer lights and sparks");
  assert.ok(P.DURACION_S >= 1.3 && P.DURACION_S <= 1.5);
  assert.equal(P.brillo(0), 0); assert.equal(P.brillo(1), 0); assert.ok(P.brillo(0.5) > 0.9);
  assert.equal(P.varianteDe(7), 0); assert.equal(P.varianteDe("2"), 2);
});
