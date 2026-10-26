// t_466efdb8: the «thinking» orb. The SERVER marks an AI `pensando` from what it sees — a call that reaches it (llamar's server-only event) — and
// clears it when that AI says a line in the chat or after PENSANDO_S; nothing a page or an agent sends can set it. Real roles, passes, chat, llamar
// and ia; a fake brain (a function that answers the call after some ticks) stands in for the model: no model is ever called. Then the pure parts of
// the render (tier D draws none, a phone draws fewer, reduced motion stands still, one mesh for all) and of the chat line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { clientPart, defineFeature, serverPart } from "../packages/feature/src/index.ts";
import type { ClientApi, Msg, ServerApi } from "../packages/feature/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import iaServer from "../features/ia/server.ts";
import { crearBurbuja } from "../features/burbuja/server.ts";
import { crearLlamar } from "../features/llamar/server.ts";
import { llamar, PAUSA_PERSONA_TICKS } from "../features/llamar/feature.ts";
import { ia, publica, PENSANDO_S, PENSANDO_TICKS } from "../features/ia/feature.ts";
import { ORBE_PUNTOS, ORBES_MOVIL, ORBES_PC, escalaOrbe, fotogramaOrbe, orbeDibuja, orbesMax, puntosOrbe, puntosPintados } from "../packages/render/src/orbe-ia-forma.ts";
import { CSS_PENSANDO, PENSANDO_CERCA_M, textoPensando } from "../apps/plaza/ia-pensando.ts";
import { textos } from "../apps/plaza/gente-ia.ts";

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

type Llam = { nombre: boolean; barra: boolean; boton: boolean; solo_dentro: boolean; frase?: string };
const llam = (o: Partial<Llam> = {}): Llam => ({ nombre: true, barra: true, boton: true, solo_dentro: true, ...o });

/** An AI's pass: `nombre` is its name, `llamada` its `ia.llamada` block (none = the house default), `estado` activa|dormida. */
function paseIA(nombre = "Ada", o: { c?: string; llamada?: Llam; estado?: string; burbuja?: Record<string, unknown>; t?: number } = {}): string {
  const s = Math.floor((o.t ?? T0) / 1000);
  const payload = { v: 1, iss: "numinia.com", aud: MUNDO, sub: sub(o.c ?? "ab"), org: "org-1", perm: ["enter-worlds"], height: 0, roles: [{ name: "Guía", color: "#112233" }], name: nombre, kind: "agent", state: o.estado ?? "activa", iat: s, exp: s + 600, ia: { responde: RESP, ...(o.llamada ? { llamada: o.llamada } : {}), ...(o.burbuja ? { burbuja: o.burbuja } : {}) } };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}

/** A page's spy on the feature: what the server told it (`llamada`, `aviso`) and a way to ask for a call like the button will. */
function espia() {
  const avisos: string[] = [], llamadas: Msg[] = [];
  let api: ClientApi | null = null;
  const part = clientPart(llamar, (a) => { api = a; a.on("aviso", (m) => avisos.push(String(m.texto))); a.on("llamada", (m) => llamadas.push({ ...m })); });
  return { part, avisos, llamadas, pedir: (ia: number, texto: string) => api!.send("llamar", { ia, texto }) };
}

/** A world with real roles, the chat, the bubble and `llamar`; a probe hears what `llamar` tells the server's listeners. */
function mundo(o: { sinIA?: boolean } = {}) {
  const log: string[] = [];
  const ms = { v: 0 };
  let ahora = T0;
  const L = crearLlamar();
  const sonda: Msg[] = [];
  const sondaPart = serverPart(defineFeature({ id: "sonda", version: 1, describe: "test probe: records what llamar tells the server's listeners" }), (api: ServerApi) => {
    for (const ev of ["llamada", "aviso"]) api.listen("llamar", ev, (m) => { sonda.push({ ev, ...m }); return true; });
  });
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: firma, pase: { clave: CLAVE, mundo: MUNDO, org: "org-1" }, cerrar: (e) => inst.disconnect(e), ahora: () => ahora, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 64, k: 50, snapshotEvery: 2, features: [chatServer, iaServer, crearBurbuja().part, L.part, sondaPart, roles.part], log: (l) => log.push(l), identitySign: firma, puede: (w, a) => roles.puede(w, a), credencial: roles.credencial, renovarPase: roles.renovar });
  const ias: ReturnType<Instance["join"]>[] = [];
  const sesionesIA = new Map<number, ClientSession>();
  const personas: { t: ReturnType<Instance["join"]>; s: ClientSession }[] = [];
  const fijos = new Map<number, [number, number, number]>();
  const poner = (e: number, x: number, z: number, y = 0): void => { fijos.set(e, [x, y, z]); inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.y[e] = fx(y); inst.sim.tf.cols.z[e] = fx(z); inst.sim.mo.cols.vy[e] = 0; };
  const pump = (n = 10): void => {
    for (let k = 0; k < n; k++) {
      for (const g of ias) g.flush();
      for (const p of personas) p.t.flush();
      for (const [e, [x, y, z]] of fijos) { if (!inst.sim.world.alive[e]) { fijos.delete(e); continue; } inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.y[e] = fx(y); inst.sim.tf.cols.z[e] = fx(z); inst.sim.mo.cols.vy[e] = 0; }
      inst.tick();
      ms.v += 50;
      for (const p of personas) { p.t.flush(); p.s.tick(0, 0); }
      for (const g of ias) g.flush();
      for (const s of sesionesIA.values()) s.tick(0, 0);
    }
  };
  /** A person with a chat and a spy, standing at (x, z) (far away unless said). `decir` types in the chat box; `pedir` is the button. */
  const persona = (x = 500, z = 500) => {
    const t = inst.join(personas.length + ias.length), c = crearCliente(() => ms.v), spy = espia();
    const s = new ClientSession(t, { features: [c.part, spy.part], identity: keeper() });
    personas.push({ t, s }); pump(2);
    const e = s.entity; poner(e, x, z); pump(1);
    return { t, s, e, chat: c.chat, spy, decir: (txt: string) => { const r = c.chat.decir(txt); pump(2); return r; }, pedir: (ia: number, txt = "") => { const r = spy.pedir(ia, txt); pump(2); return r; } };
  };
  /** An organization's AI at (x, z), with its page's spy. */
  const ia = (token: string, x = 0, z = 0, y = 0) => {
    const t = inst.join(personas.length + ias.length); ias.push(t);
    const e = inst.conns.at(-1)!.entity, spy = espia();
    const c = crearCliente(() => ms.v); // the AI's own chat: how a brain answers
    sesionesIA.set(e, new ClientSession(t, { features: [spy.part, c.part] }));
    pump(2); inst.identificar(e, "", token); pump(2); poner(e, x, z, y); pump(1);
    return { t, e, spy, decir: (txt: string) => { const r = c.chat.decir(txt); pump(2); return r; } };
  };
  const quienEs = (e: number) => inst.conns.find((c) => c.entity === e)!.who!;
  const lineas = (p: { chat: { lineas: readonly { tipo: string; texto: string }[] } }, tipo?: string) => p.chat.lineas.filter((l) => !tipo || l.tipo === tipo).map((l) => l.texto);
  const llamadas = () => sonda.filter((m) => m.ev === "llamada");
  return { reloj: (t: number) => { ahora = t; }, inst, L, log, poner, pump, persona, ia, quienEs, lineas, llamadas, sonda, roles, personas, sesionesIA };
}

const adaPase = (o: { llamada?: Llam; estado?: string } = {}) => paseIA("Ada", { llamada: llam({ solo_dentro: false }), ...o });
/** What a page reads about this AI (the real accessor over the real shared state). */
const ficha = (p: { s: ClientSession }, e: number) => { const v = p.s.features.stateOf("ia").get(String(e)); return v ? publica(v) : null; };

// ---------- the server publishes it ----------

test("pensando: a call reaches the AI → the card says it thinks; its fake brain answers in the chat → it stops, and nobody else's line does", () => {
  const W = mundo();
  const ana = W.persona(1, 0), ada = W.ia(adaPase(), 0, 0), luis = W.persona(2, 0);
  W.pump(4);
  assert.equal(ficha(ana, ada.e)?.pensando, undefined, "a quiet AI's card has no pensando at all");
  ana.decir("Ada, ¿me ayudas con la mesa?"); W.pump(4);
  assert.equal(W.llamadas().length, 1, "the call went out");
  assert.equal(ficha(ana, ada.e)?.pensando, true, "thinking from the moment the call reaches it");
  assert.equal(ficha(luis, ada.e)?.pensando, true, "everybody sees it, the server decided");
  luis.decir("qué bonito está esto"); W.pump(4);
  assert.equal(ficha(ana, ada.e)?.pensando, true, "someone else talking does not answer for it");
  // the fake brain: a model that takes ~2 s and then answers
  W.pump(40); ada.decir("Claro, ya te la pongo."); W.pump(4);
  assert.equal(ficha(ana, ada.e)?.pensando, undefined, "answered: the orb goes");
  assert.equal(ficha(ana, ada.e)?.estado, "activa");
});

test("pensando: a brain that never answers does not wear the orb for ever (PENSANDO_S), and a second call starts it again", () => {
  const W = mundo();
  const ana = W.persona(1, 0), ada = W.ia(adaPase(), 0, 0);
  ana.decir("Ada, ¿estás?"); W.pump(4);
  assert.equal(ficha(ana, ada.e)?.pensando, true);
  W.pump(PENSANDO_TICKS - 20);
  assert.equal(ficha(ana, ada.e)?.pensando, true, "still within the limit");
  W.pump(40);
  assert.equal(ficha(ana, ada.e)?.pensando, undefined, "past the limit it clears by itself");
  assert.equal(PENSANDO_S, 45);
  W.pump(PAUSA_PERSONA_TICKS); ana.decir("Ada, ¿ahora sí?"); W.pump(4);
  assert.equal(ficha(ana, ada.e)?.pensando, true);
});

test("pensando: nobody can set it — no intent for it, a person or the AI itself reporting changes nothing, a sleeping AI never thinks", () => {
  const W = mundo();
  const ana = W.persona(1, 0), ada = W.ia(adaPase(), 0, 0), dormi = W.ia(paseIA("Bea", { c: "cd", llamada: llam({ solo_dentro: false }), estado: "dormida" }), 0, 1);
  W.pump(4);
  assert.equal(Object.keys(ia.intents ?? {}).join(), "atenta", "the only intent of the card is still atenta: there is none for pensando");
  assert.equal(ana.s.features.send("ia", "pensando", { quien: ada.e }).ok, false);
  ana.s.features.send("ia", "atenta", {}); W.pump(4);
  assert.equal(ficha(ana, ada.e)?.pensando, undefined, "a person's report changes nothing");
  assert.equal(ficha(ana, ada.e)?.atenta, false);
  ana.decir("Bea, ¿duermes?"); W.pump(4);
  assert.equal(ficha(ana, dormi.e)?.estado, "dormida");
  assert.equal(ficha(ana, dormi.e)?.pensando, undefined, "a sleeping AI is called but does not think");
  // a person's own line never clears an AI's orb either, and a person has no card
  W.pump(PAUSA_PERSONA_TICKS); ana.decir("Ada, mira"); W.pump(4);
  assert.equal(ficha(ana, ada.e)?.pensando, true);
  assert.equal(ficha(ana, ana.e), null);
});

test("pensando: the card flips twice per answer (on, off) and not at all while the AI is quiet", () => {
  const W = mundo();
  const ana = W.persona(1, 0), ada = W.ia(adaPase(), 0, 0);
  W.pump(4);
  const banderas: boolean[] = [];
  const mirar = (n: number) => { for (let k = 0; k < n; k++) { W.pump(1); const b = ficha(ana, ada.e)?.pensando === true; if (banderas.at(-1) !== b) banderas.push(b); } };
  banderas.push(false); mirar(100);
  assert.deepEqual(banderas, [false], "no AI activity: the card never changes");
  ana.decir("Ada, hola"); mirar(10); ada.decir("Hola."); mirar(10);
  assert.deepEqual(banderas, [false, true, false], "on once, off once");
});

// ---------- the pure parts of the page ----------

test("pensando render: a phone draws fewer orbs, tier D none, reduced motion stands still, all orbs are one quad", () => {
  assert.ok(ORBES_MOVIL < ORBES_PC); assert.equal(orbesMax(true), ORBES_MOVIL); assert.equal(orbesMax(false), ORBES_PC);
  assert.deepEqual((["A", "B", "C", "D"] as const).map(orbeDibuja), [true, true, true, false], "tier D draws no orb");
  assert.deepEqual(fotogramaOrbe(1234, true, 2), { giro: 0, escala: 1 }, "still when the person asked for less movement");
  assert.notEqual(fotogramaOrbe(0, false).giro, fotogramaOrbe(500, false).giro, "it turns");
  const e = [0, 300, 700, 1100].map((ms) => fotogramaOrbe(ms, false).escala);
  assert.ok(Math.min(...e) >= 0.9 && Math.max(...e) <= 1.1, "it breathes a little, never jumps");
  assert.equal(escalaOrbe(1), 1); assert.equal(escalaOrbe(100), 2.5); assert.ok(escalaOrbe(10) > escalaOrbe(5));
  const pts = puntosOrbe(); assert.equal(pts.length, ORBE_PUNTOS);
  for (const p of pts) assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 1) < 1e-9, "on the unit sphere");
  const pintados = puntosPintados();
  assert.equal(pintados.length, ORBE_PUNTOS); assert.ok(pintados.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && p.luz > 0 && p.luz <= 1));
  assert.ok(pintados[0]!.luz < pintados.at(-1)!.luz, "far dots first and dim, near dots last and bright");
});

test("pensando chat line: names one or two, counts more, nothing when nobody thinks; names lose the «· IA» mark; only those near", () => {
  assert.equal(textoPensando([]), "");
  assert.equal(textoPensando(["Ada · IA"]), "Ada está pensando…");
  assert.equal(textoPensando(["Ada · IA", "Bea"]), "Ada y Bea están pensando…");
  assert.equal(textoPensando(["Ada", "Bea", "Cora"]), "3 IAs están pensando…");
  assert.equal(textoPensando(["Ada"], "pt-br"), "Ada está pensando…", "languages not written yet read in Spanish");
  assert.equal(PENSANDO_CERCA_M, 20, "the near chat's reach");
  assert.deepEqual(Object.keys(textos("es")).filter((k) => k.startsWith("pensando")).sort(), ["pensando", "pensandoIAs", "pensandoVarias", "pensandoY"]);
  assert.match(CSS_PENSANDO, /prefers-reduced-motion/); assert.match(CSS_PENSANDO, /menos-movimiento/);
});
