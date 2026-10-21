// burbujas v1: the voice bubble. The SERVER's relay decides who hears whom; these tests send real voice frames through a real Instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { setBody } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { VOZ_MULAW } from "../packages/net/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { burbujas as decl, BURBUJAS_MAX, FUERA } from "../features/burbujas/feature.ts";
import { burbujaEn, leerBurbujas } from "../features/burbujas/server.ts";
import { crearCliente } from "../features/burbujas/client.ts";
import { textoCartel } from "../apps/plaza/burbuja.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const MESA = { x: 20, y: 0, z: 0, radio: 3.5, etiqueta: "La mesa" };

function mundo(n: number, o: { archivos?: Map<string, unknown>; sin?: boolean } = {}) {
  const archivos = o.archivos ?? new Map<string, unknown>(o.sin ? [] : [["burbujas.json", { burbujas: [MESA] }]]);
  const log: string[] = [];
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => Date.parse("2026-10-21T22:00:00Z"), log: (l) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f) => archivos.get(f), (l) => log.push(l), (f, d) => { archivos.set(f, d); });
  const inst: Instance = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign, puede: (w, a) => roles.puede(w, a) });
  const gente = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearCliente(), s = new ClientSession(t, { features: [c.parts[0]], identity: keeper() });
    const oido: number[] = []; s.onVoice = (v) => oido.push(v.entidad);
    const avisos: string[] = [];
    s.features.tap((f, e, m) => { if (f === "burbujas" && e === "dentro") avisos.push(String(m.aviso)); });
    return { t, s, oido, avisos, b: c.burbujas };
  });
  const pump = (k = 3) => { for (let i = 0; i < k; i++) { for (const p of gente) p.t.flush(); inst.tick(); for (const p of gente) p.t.flush(); } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => setBody(inst.sim, p.s.entity, { x: fx(x), y: 0, z: fx(z), vy: 0, air: 0, buf: 0 });
  const habla = (p: (typeof gente)[number]) => { for (const q of gente) q.oido.length = 0; assert.ok(p.s.sendVoice(VOZ_MULAW, new Uint8Array(160).fill(0x55))); pump(1); };
  pump(2); // the welcome: each page knows its entity
  return { inst, gente, pump, poner, habla, archivos, log, roles };
}

test("burbujas: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(decl.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "burbujas"));
  assert.ok(paginas.some((f) => f.feature.id === "burbujas"));
});

test("burbujas: burbujaEn — inside the radius (and one radius of height), the nearest centre when two overlap, FUERA otherwise", () => {
  const L = [{ id: "a", x: 0, y: 0, z: 0, radio: 3, modo: "aislada" as const, etiqueta: "A" }, { id: "b", x: 4, y: 0, z: 0, radio: 3, modo: "aislada" as const, etiqueta: "B" }];
  assert.equal(burbujaEn(L, 0.5, 0, 0), 0);
  assert.equal(burbujaEn(L, 3.5, 0, 0), 1, "in both: the nearest centre");
  assert.equal(burbujaEn(L, 10, 0, 0), FUERA);
  assert.equal(burbujaEn(L, 0, 4, 0), FUERA, "a floor above is not inside");
  assert.equal(burbujaEn([], 0, 0, 0), FUERA);
});

test("burbujas: leerBurbujas leaves a wrong bubble out and says why; no file = no bubbles", () => {
  assert.equal(leerBurbujas(undefined), null);
  const r = leerBurbujas({ burbujas: [{ x: 1, z: 2 }, { x: "a" }, { x: 1, z: 1, radio: 99 }, { id: "mal id", x: 0, z: 0 }, { id: "q", x: 0, z: 0, modo: "otra" }, ...Array.from({ length: BURBUJAS_MAX + 2 }, (_, i) => ({ id: `z${i}`, x: i, z: 0 }))] })!;
  assert.equal(r.valor.burbujas!.length, BURBUJAS_MAX);
  assert.ok(r.problemas.some((p) => /burbujas\[1\]/.test(p)) && r.problemas.some((p) => /radio entre/.test(p)) && r.problemas.some((p) => /no vale/.test(p)) && r.problemas.some((p) => /como mucho/.test(p)));
  assert.equal(r.valor.burbujas!.find((b) => b.id === "q")!.modo, "aislada");
});

test("burbujas: inside hear each other (even beyond 30 m of nothing), inside↔outside hear nobody both ways, outside↔outside as always", () => {
  const W = mundo(5);
  const [a, b, c, d, e] = W.gente;
  W.poner(a, 20, 0); W.poner(b, 21, 1); W.poner(c, 22, 0); // the table (3 inside)
  W.poner(d, 23.2, 3); W.poner(e, 26, 3);                   // near it but outside (d is 3.9 m from the centre; e too) — and near each other
  W.pump(6);
  W.habla(a);
  assert.deepEqual([b.oido.length, c.oido.length, d.oido.length, e.oido.length], [1, 1, 0, 0], "the table hears A; the near people outside do not");
  W.habla(d);
  assert.deepEqual([a.oido.length, b.oido.length, c.oido.length, e.oido.length], [0, 0, 0, 1], "outside speaks: the table does not hear; the other outside does");
  assert.equal(W.inst.vozStats.burbuja > 0, true);
});

test("burbujas: leaving the bubble gives the old voice back, and the notice reaches only that person", () => {
  const W = mundo(3);
  const [a, b, c] = W.gente;
  W.poner(a, 20, 0); W.poner(b, 21, 0); W.poner(c, 22, 2);
  W.pump(6);
  assert.match(a.avisos.join("|"), /En La mesa: solo te oyen los de la mesa/);
  assert.equal(c.b.mia()?.etiqueta, "La mesa");
  assert.equal(b.b.de(a.s.entity)?.etiqueta, "La mesa", "the page knows who else is inside (the icon in «Gente»)");
  W.poner(c, 40, 0); W.pump(6);
  assert.match(c.avisos.at(-1) ?? "", /Has salido de La mesa/);
  assert.equal(a.avisos.length, 1, "the others heard nothing about it");
  assert.equal(c.b.mia(), null);
  W.poner(b, 40, 1); W.pump(6);
  W.habla(b);
  assert.equal(c.oido.length, 1, "both outside: nearness as before");
  assert.equal(a.oido.length, 0);
});

test("burbujas: two different bubbles do not hear each other; an «abierta» one only widens", () => {
  const W = mundo(4, { archivos: new Map([["burbujas.json", { burbujas: [{ id: "m1", ...MESA }, { id: "m2", x: 26, y: 0, z: 0, radio: 2, etiqueta: "Otra mesa" }] }]]) });
  const [a, b, c] = W.gente;
  W.poner(a, 20, 0); W.poner(b, 26, 0); W.poner(c, 22, 2); W.poner(W.gente[3], 40, 40);
  W.pump(6);
  W.habla(a);
  assert.deepEqual([b.oido.length, c.oido.length], [0, 1]);
  const A = mundo(3, { archivos: new Map([["burbujas.json", { burbujas: [{ ...MESA, modo: "abierta" }] }]]) });
  A.poner(A.gente[0], 20, 0); A.poner(A.gente[1], 23.2, 3); A.poner(A.gente[2], 21, 0);
  A.pump(6);
  A.habla(A.gente[0]);
  assert.deepEqual([A.gente[1].oido.length, A.gente[2].oido.length], [1, 1], "open: the near outside hear in");
  A.habla(A.gente[1]);
  assert.deepEqual([A.gente[0].oido.length, A.gente[2].oido.length], [1, 1], "and the inside hear the near outside");
});

test("burbujas (interruptor): only who directs or rules switches it; first time with no places makes one where they stand and writes burbujas.json; off gives the voice back", () => {
  const W = mundo(3, { sin: true });
  const [a, b, c] = W.gente;
  W.poner(a, 20, 0); W.poner(b, 21, 0); W.poner(c, 24, 0);
  W.pump(4);
  W.habla(a); assert.equal(b.oido.length, 1, "no file: the voice is as always");
  assert.equal(b.b.interruptor.activa(), false);
  b.b.interruptor.poner(true); W.pump(3);
  assert.equal(W.archivos.size, 0, "refused, nothing written");
  assert.match(b.b.interruptor.estado.ultimoRechazo, /Encender o apagar una pieza/);
  W.roles.part; // roles are the world's
  a.s.features.send("chat", "decir", { texto: `/dueño ${ADMIN}` }); W.pump(30);
  assert.deepEqual(a.b.interruptor.poner(true), { ok: true }); W.pump(4);
  const f = W.archivos.get("burbujas.json") as { schema: string; activa: boolean; burbujas: { x: number; z: number; radio: number }[] };
  assert.deepEqual([f.schema, f.activa, f.burbujas.length, f.burbujas[0].x, f.burbujas[0].radio], ["numinia-engine/burbujas@1", true, 1, 20, 3.5]);
  assert.equal(c.b.interruptor.activa(), true);
  W.habla(a); assert.deepEqual([b.oido.length, c.oido.length], [1, 0], "c, 4 m away, is outside now");
  assert.deepEqual(a.b.interruptor.poner(false), { ok: true }); W.pump(4);
  assert.equal((W.archivos.get("burbujas.json") as { activa: boolean }).activa, false);
  assert.equal(a.b.mia(), null);
  W.habla(a); assert.deepEqual([b.oido.length, c.oido.length], [1, 1], "voice back as always");
  assert.match(W.log.join("\n"), /apaga las burbujas de voz/);
  // and a restart keeps it off
  const R = mundo(2, { archivos: W.archivos });
  R.poner(R.gente[0], 20, 0); R.poner(R.gente[1], 30, 0); R.pump(6);
  assert.equal(R.gente[0].b.interruptor.activa(), false);
});

test("burbujas: the cartel's text; a world without the file keeps the fingerprint", () => {
  assert.equal(textoCartel({ etiqueta: "La mesa", modo: "aislada" }), "En La mesa: solo te oyen los de la mesa");
  const huella = (con: boolean) => {
    const lista = conMundo(con ? funciones : funciones.filter((f) => f.feature.id !== "burbujas"), () => undefined, () => {});
    const inst = new Instance({ seed: 9, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: () => {}, identitySign: sign });
    const t = inst.join(0), s = new ClientSession(t, { identity: keeper(), features: paginas });
    for (let i = 0; i < 40; i++) { t.flush(); inst.tick(); t.flush(); }
    void s; return inst.hash();
  };
  assert.equal(huella(true), huella(false));
});

test("acciones: «Soltar el báculo», «Pasar el báculo» y «Levantarte» solo están disponibles cuando la acción es posible", async () => {
  const W = mundo(1, { sin: true });
  const [a] = W.gente;
  const t = W.inst.join(9), s = new ClientSession(t, { features: paginas, identity: keeper() });
  for (let i = 0; i < 6; i++) { for (const p of W.gente) p.t.flush(); t.flush(); W.inst.tick(); t.flush(); }
  const acts = s.features.actions(), de = (id: string) => acts.find((x) => x.id === id)!;
  for (const id of ["soltar", "pasar", "levantar"]) assert.equal(typeof de(id).disponible, "function", id);
  assert.deepEqual(["soltar", "pasar", "levantar"].map((id) => de(id).disponible!()), [false, false, false], "no staff, not seated: none is possible");
  void a;
});
