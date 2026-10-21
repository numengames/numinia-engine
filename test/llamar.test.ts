// ia-llamar S10: `llamar` — people call an AI by name, `/name`, key phrase or button. Pure readings (names, phrases, `/name`), each way, the
// switches of the pass's `ia.llamada`, `solo_dentro` in and out, which AI when several qualify, Dormida, the limits, the privacy of `/name`
// (only the caller and the AI), the mailbox, and a world with no AI (no work, no state). Real roles feature and real passes; the bubble is the real S8.
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
import { BUZON_MAX, BUZON_TTL_TICKS, CERCA_M, DEFECTO, HORA_TICKS, MODOS, PAUSA_PERSONA_TICKS, POR_HORA_IA, TEXTO_MAX, aparece, leerLlamada, linea, llamar, nombreLimpio, palabras, trasNombre } from "../features/llamar/feature.ts";
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
    sesionesIA.set(e, new ClientSession(t, { features: [spy.part] }));
    pump(2); inst.identificar(e, "", token); pump(2); poner(e, x, z, y); pump(1);
    return { t, e, spy };
  };
  const quienEs = (e: number) => inst.conns.find((c) => c.entity === e)!.who!;
  const lineas = (p: { chat: { lineas: readonly { tipo: string; texto: string }[] } }, tipo?: string) => p.chat.lineas.filter((l) => !tipo || l.tipo === tipo).map((l) => l.texto);
  const llamadas = () => sonda.filter((m) => m.ev === "llamada");
  return { reloj: (t: number) => { ahora = t; }, inst, L, log, poner, pump, persona, ia, quienEs, lineas, llamadas, sonda, roles, personas, sesionesIA };
}

const adaPase = (o: { llamada?: Llam; estado?: string; burbuja?: Record<string, unknown> } = {}) => paseIA("Ada", o);

// ---------- pure readings ----------

test("llamar: declaration loads, is on the server's list (R-1: nothing to switch on), takes four modes and a call text of at most 190 bytes", () => {
  assert.deepEqual(llamar.issues, []);
  assert.ok(featuresServidor.some((p) => p.feature.id === "llamar"));
  assert.deepEqual(MODOS, ["nombre", "barra", "boton", "frase"]);
  assert.deepEqual([TEXTO_MAX, CERCA_M, PAUSA_PERSONA_TICKS, POR_HORA_IA, BUZON_MAX, BUZON_TTL_TICKS, HORA_TICKS], [190, 20, 200, 30, 20, 12000, 72000]);
});

test("llamar: a name or a phrase is found as whole words, in any case and with or without accents; «Adam» is not «Ada»", () => {
  assert.equal(palabras("¡Hola, ÍÑIGO! ¿Qué tal?"), "hola inigo que tal");
  assert.equal(aparece("Hola, ADA, ¿me ayudas?", "Ada"), true);
  assert.equal(aparece("oye Íñigo", "inigo"), true);
  assert.equal(aparece("oye inigo", "Íñigo"), true);
  assert.equal(aparece("hola Adam", "Ada"), false);
  assert.equal(aparece("la cada", "ada"), false, "not inside a word");
  assert.equal(aparece("Agente...  RESPONDE por favor", "agente, responde"), true);
  assert.equal(aparece("responde agente", "agente, responde"), false, "in order");
  assert.equal(aparece("lo que sea", ""), false, "an empty phrase calls nobody");
  assert.equal(aparece("lo que sea", "¡¡"), false);
  assert.equal(nombreLimpio("Ada · IA"), "Ada");
  assert.equal(nombreLimpio("Ada"), "Ada");
});

test("llamar: «/name message» — the name is the first word(s), whole, in any case and accent; what follows is the message", () => {
  assert.equal(trasNombre("ada ¿me ayudas?", "Ada"), "¿me ayudas?");
  assert.equal(trasNombre("ADA   hola", "Ada"), "hola");
  assert.equal(trasNombre("ada", "Ada"), "", "a bare /ada is a call with no words");
  assert.equal(trasNombre("ada, hola", "Ada"), "hola", "a comma after the name is not part of the message");
  assert.equal(trasNombre("inigo hola", "Íñigo"), "hola");
  assert.equal(trasNombre("Íñigo hola", "inigo"), "hola");
  assert.equal(trasNombre("adam hola", "Ada"), null, "/adam is not /ada");
  assert.equal(trasNombre("ad hola", "Ada"), null);
  assert.equal(trasNombre("hola ada", "Ada"), null, "the name comes first");
  assert.equal(trasNombre("ada lovelace hola", "Ada Lovelace"), "hola");
  assert.equal(trasNombre("ada hola", "Ada Lovelace"), null);
  assert.equal(trasNombre("ada hola", "¡¡"), null);
  assert.equal(trasNombre("", "Ada"), null);
});

test("llamar: an AI's `llamada` block as the world says it, the house default for anything missing; text is one clean line", () => {
  assert.deepEqual(DEFECTO, { nombre: true, barra: true, boton: true, soloDentro: true, frase: "" });
  assert.deepEqual(leerLlamada(null), DEFECTO);
  assert.deepEqual(leerLlamada({ nombre: false, barra: false, boton: false, soloDentro: false, frase: "  agente,\nresponde " }), { nombre: false, barra: false, boton: false, soloDentro: false, frase: "agente, responde" });
  assert.deepEqual(leerLlamada({ nombre: "no", frase: 7 }), DEFECTO, "anything odd falls back to the house default");
  assert.equal(linea("  hola\n\t\u202Eque \u0000tal ", 50), "hola que tal");
  assert.equal(linea("ñ".repeat(150), 190).length, 95, "190 bytes, never a character cut in two");
});

// ---------- in a world ----------

test("llamar: every AI publishes how it is called (house default: name, /name and button on, only from inside, no phrase); a person has no entry", () => {
  const W = mundo();
  const ana = W.persona(0, 50);
  const ada = W.ia(adaPase());
  const est = ana.s.features.stateOf("llamar");
  assert.deepEqual([...est.keys()], [String(ada.e)]);
  assert.deepEqual(est.get(String(ada.e)), { nombre: true, barra: true, boton: true, dentro: true, frase: "" });
  assert.deepEqual(W.L.llamadaDe(ada.e), DEFECTO);
  assert.equal(W.L.llamadaDe(ana.e), null);
  assert.deepEqual(W.L.llamadasDe(ana.e), []);
});

test("llamar: the pass's `ia.llamada` is how the AI is called; a fresh pass in mid-session changes it", () => {
  const W = mundo();
  const ana = W.persona(0, 50);
  const ada = W.ia(adaPase({ llamada: llam({ barra: false, solo_dentro: false, frase: "agente, responde" }) }));
  assert.deepEqual(ana.s.features.stateOf("llamar").get(String(ada.e)), { nombre: true, barra: false, boton: true, dentro: false, frase: "agente, responde" });
  assert.deepEqual(W.L.llamadaDe(ada.e), { nombre: true, barra: false, boton: true, soloDentro: false, frase: "agente, responde" });
  W.reloj(T0 + 60_000);
  assert.equal(W.roles.renovar(ada.e, paseIA("Ada", { t: T0 + 60_000, llamada: llam({ nombre: false }) })), null);
  W.pump(2);
  assert.deepEqual(W.L.llamadaDe(ada.e), { nombre: false, barra: true, boton: true, soloDentro: true, frase: "" }, "a fresh pass replaces the block");
  assert.deepEqual(ana.s.features.stateOf("llamar").get(String(ada.e)), { nombre: false, barra: true, boton: true, dentro: true, frase: "" });
});

test("llamar: by name — inside its bubble, «Ada, …» in the near chat reaches the AI alone, with a confirmation to the caller and a mailbox entry", () => {
  const W = mundo();
  const ana = W.persona(2, 0), luis = W.persona(3, 0), lejos = W.persona(15, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  assert.deepEqual(ana.decir("Hola Ada, ¿me ayudas?"), { ok: true });
  assert.equal(W.llamadas().length, 1);
  const [e] = ada.spy.llamadas;
  assert.deepEqual(e, { ia: ada.e, quien: ana.e, nombre: e.nombre, texto: "Hola Ada, ¿me ayudas?", modo: "nombre", t: e.t });
  assert.equal(typeof e.nombre, "string");
  assert.deepEqual(ana.spy.avisos, ["Has llamado a Ada."], "the confirmation uses the name people read, not the « · IA» tail");
  assert.deepEqual([luis.spy.llamadas, luis.spy.avisos, lejos.spy.llamadas, lejos.spy.avisos, ana.spy.llamadas], [[], [], [], [], []], "nobody else is told");
  assert.deepEqual(W.L.llamadasDe(ada.e), [{ ...e, n: 1 }]);
});

test("llamar: case and accents do not matter, and a name that is only a part of another word is not a call", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ini = W.ia(paseIA("Íñigo"), 0, 0);
  W.pump();
  ana.decir("oye INIGO, ¿estás ahí?");
  assert.equal(ini.spy.llamadas.length, 1);
  W.pump(PAUSA_PERSONA_TICKS);
  ana.decir("iniguito, ven");
  ana.decir("hola a todos");
  assert.equal(ini.spy.llamadas.length, 1, "«iniguito» is another word");
});

test("llamar: a name too short to look for in the chat (under 3 letters) is never found there, but /name and the button still call it", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const al = W.ia(paseIA("Al"), 0, 0);
  W.pump();
  ana.decir("hola Al, vamos a ver");
  assert.deepEqual(al.spy.llamadas, []);
  ana.decir("/al hola");
  assert.equal(al.spy.llamadas.length, 1);
  assert.equal(al.spy.llamadas[0].modo, "barra");
});

test("llamar: a call in the chat does not hide the chat line — it is published like any line; only the call is private", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(5, 0);
  W.ia(adaPase(), 0, 0);
  W.pump();
  ana.decir("Ada, ¿me ayudas?");
  assert.deepEqual(W.lineas(luis, "cerca"), ["Ada, ¿me ayudas?"]);
});

test("llamar: /name — only the caller and the AI see it: the chat does not publish the line, nobody else hears of the call, the chat does not say «nadie atiende»", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(3, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  ana.decir("/ada  esto es secreto");
  const [e] = ada.spy.llamadas;
  assert.deepEqual({ ...e, nombre: "", t: 0 }, { ia: ada.e, quien: ana.e, nombre: "", texto: "esto es secreto", modo: "barra", t: 0 });
  assert.deepEqual(ana.spy.avisos, ["Has llamado a Ada."]);
  assert.deepEqual(W.lineas(luis), [], "nothing reaches the neighbour's chat");
  assert.deepEqual(W.lineas(ana, "cerca"), [], "…and the caller's own chat shows no published line either");
  assert.deepEqual(W.lineas(ana, "aviso"), [], "the chat did not say «Nadie atiende»");
  assert.deepEqual([luis.spy.llamadas, luis.spy.avisos], [[], []]);
  assert.equal(JSON.stringify(luis.s.features.announcements).includes("secreto"), false);
  assert.equal(W.llamadas().length, 1, "only the server's listeners hear it besides the AI");
  assert.equal(W.L.llamadasDe(ada.e)[0].texto, "esto es secreto");
});

test("llamar: /name that is nobody's name is left to the chat (it answers «Nadie atiende»); a bare /ada is a call with no words", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  ana.decir("/adam hola");
  assert.deepEqual(ada.spy.llamadas, []);
  assert.match(W.lineas(ana, "aviso")[0] ?? "", /Nadie atiende «\/adam»/);
  W.pump(PAUSA_PERSONA_TICKS);
  ana.decir("/ada");
  assert.equal(ada.spy.llamadas.length, 1);
  assert.equal(ada.spy.llamadas[0].texto, "");
});

test("llamar: the key phrase calls it (mode «frase»), in any case; with no phrase set nothing happens; the name wins when both are said", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const sin = W.ia(paseIA("Bea", { c: "cd" }), 0, 2);
  const ada = W.ia(adaPase({ llamada: llam({ frase: "agente, responde" }) }), 0, -2);
  W.pump();
  ana.decir("AGENTE responde: ¿hay alguien?");
  assert.equal(ada.spy.llamadas.length, 1);
  assert.equal(ada.spy.llamadas[0].modo, "frase");
  assert.equal(ada.spy.llamadas[0].texto, "AGENTE responde: ¿hay alguien?");
  assert.deepEqual(sin.spy.llamadas, []);
  W.pump(PAUSA_PERSONA_TICKS);
  ana.decir("Ada, agente responde");
  assert.equal(ada.spy.llamadas.at(-1)?.modo, "nombre");
});

test("llamar: the button — the intent calls the AI with its words (or none); the confirmation goes to the caller", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(2, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  assert.deepEqual(ana.pedir(ada.e, "  ¿puedes venir?  "), { ok: true });
  assert.deepEqual(ada.spy.llamadas.map((m) => [m.modo, m.texto, m.quien]), [["boton", "¿puedes venir?", ana.e]]);
  assert.deepEqual(ana.spy.avisos, ["Has llamado a Ada."]);
  assert.deepEqual([luis.spy.avisos, luis.spy.llamadas], [[], []]);
  luis.pedir(ada.e);
  assert.equal(ada.spy.llamadas.at(-1)?.texto, "", "a call with no words is a call");
  assert.equal(ada.spy.llamadas.at(-1)?.quien, luis.e);
});

test("llamar: a button on something that is no AI, or in a world with no AI, says so and calls nobody", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(2, 0);
  ana.pedir(luis.e, "hola");
  assert.deepEqual(ana.spy.avisos, ["Aquí no hay ninguna IA."]);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  ana.pedir(luis.e, "hola");
  assert.equal(ana.spy.avisos.at(-1), "Esa persona no es una IA de este mundo.");
  ana.pedir(ada.e, "hola"); // the 'rejected' ones spent no pause
  assert.equal(ada.spy.llamadas.length, 1);
  assert.equal(W.llamadas().length, 1);
});

test("llamar: an AI cannot call an AI (a loop of two brains): no call and a notice", () => {
  const W = mundo();
  const ada = W.ia(adaPase(), 0, 0);
  const bea = W.ia(paseIA("Bea", { c: "cd" }), 1, 0);
  W.pump();
  // Bea's page asks for the button on Ada
  assert.deepEqual(bea.spy.pedir(ada.e, "hola"), { ok: true });
  W.pump(2);
  assert.deepEqual(ada.spy.llamadas, []);
  assert.deepEqual(bea.spy.avisos, ["Una IA no puede llamar a otra IA: solo las personas."]);
  assert.equal(W.llamadas().length, 0);
});

test("llamar: solo_dentro (the default) — outside the bubble a name in the chat is only a word, and /name and the button are refused with why", () => {
  const W = mundo();
  const ana = W.persona(10, 0); // the chat reaches (20 m), the 4 m bubble does not
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  ana.decir("Ada, ¿me oyes?");
  assert.deepEqual([ada.spy.llamadas, ana.spy.avisos], [[], []], "a mention from outside is silent");
  ana.decir("/ada hola");
  assert.deepEqual(ana.spy.avisos, ["Ada solo te oye desde dentro de su burbuja: acércate a ella."]);
  ana.pedir(ada.e, "hola");
  assert.equal(ana.spy.avisos.length, 2);
  assert.deepEqual(ada.spy.llamadas, []);
  W.poner(ana.e, 3, 0); W.pump(); // now inside
  ana.pedir(ada.e, "hola");
  assert.equal(ada.spy.llamadas.length, 1, "the refusals spent no pause: the first call inside goes out at once");
});

test("llamar: without solo_dentro it hears from up to 20 m — name, /name and button — and not beyond", () => {
  const W = mundo();
  const cerca = W.persona(18, 0), lejos = W.persona(25, 0);
  const ada = W.ia(adaPase({ llamada: llam({ solo_dentro: false }) }), 0, 0);
  W.pump();
  cerca.decir("Ada, aquí");
  assert.deepEqual(ada.spy.llamadas.map((m) => [m.quien, m.modo]), [[cerca.e, "nombre"]]);
  lejos.decir("/ada hola"); // the chat does not carry it
  lejos.pedir(ada.e, "hola");
  assert.equal(ada.spy.llamadas.length, 1);
  assert.equal(lejos.spy.avisos.length, 2);
  assert.match(lejos.spy.avisos[0], /^Ada está demasiado lejos: acércate a menos de 20 m\.$/);
  W.poner(lejos.e, 20, 0); W.pump();
  lejos.pedir(ada.e, "ya voy");
  assert.equal(ada.spy.llamadas.length, 2, "20 m exactly is still inside the reach");
});

test("llamar: the switches — name off, /name off, button off: each one stops its own way only, and says so when asked by name or button", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(1, 1), eva = W.persona(1, -1);
  const ada = W.ia(adaPase({ llamada: llam({ nombre: false }) }), 0, 0);
  const bea = W.ia(paseIA("Bea", { c: "cd", llamada: llam({ barra: false }) }), 0, 3);
  const cai = W.ia(paseIA("Cai", { c: "ef", llamada: llam({ boton: false }) }), 0, -3);
  W.pump();
  ana.decir("Ada, hola");
  assert.deepEqual(ada.spy.llamadas, [], "name off: a name in the chat calls nobody");
  assert.deepEqual(ana.spy.avisos, []);
  ana.decir("/ada hola");
  W.pump(PAUSA_PERSONA_TICKS);
  ana.pedir(ada.e, "hola");
  assert.equal(ada.spy.llamadas.length, 2, "…but /name and the button still do");
  luis.decir("/bea hola");
  assert.deepEqual(bea.spy.llamadas, []);
  assert.deepEqual(luis.spy.avisos, ["Bea no se deja llamar con «/Bea»."]);
  assert.deepEqual(W.lineas(luis, "aviso"), [], "the chat said nothing about «nadie atiende»");
  luis.decir("Bea, hola");
  W.pump(PAUSA_PERSONA_TICKS);
  luis.pedir(bea.e, "hola");
  assert.equal(bea.spy.llamadas.length, 2, "/name off, the other two ways work");
  eva.pedir(cai.e, "hola");
  assert.deepEqual(cai.spy.llamadas, []);
  assert.deepEqual(eva.spy.avisos, ["Cai no se deja llamar con el botón."]);
  eva.decir("Cai, hola");
  W.pump(PAUSA_PERSONA_TICKS);
  eva.decir("/cai hola");
  assert.equal(cai.spy.llamadas.length, 2, "button off, name and /name work");
});

test("llamar: several AIs with one name — the one whose bubble holds you wins over a nearer-by-number one; if two hold you, the nearest; /name is the same", () => {
  const W = mundo();
  const ana = W.persona(5, 0);
  // two AIs called Ada: A at the origin (bubble 4 m), B at x = 8 (bubble 4 m). Ana at x = 5: 5 m from A (outside), 3 m from B (inside).
  const a1 = W.ia(adaPase({ llamada: llam({ solo_dentro: false }) }), 0, 0);
  const a2 = W.ia(paseIA("Ada", { c: "cd", llamada: llam({ solo_dentro: false }) }), 8, 0);
  W.pump();
  ana.decir("Ada, hola");
  assert.deepEqual([a1.spy.llamadas.length, a2.spy.llamadas.length], [0, 1], "B holds her; A is only within 20 m");
  W.pump(PAUSA_PERSONA_TICKS);
  W.poner(ana.e, 3, 0); W.pump(); // 3 m from A, 5 m from B: now A holds her
  ana.decir("/ada hola");
  assert.deepEqual([a1.spy.llamadas.length, a2.spy.llamadas.length], [1, 1]);
  W.pump(PAUSA_PERSONA_TICKS);
  W.poner(ana.e, 4.5, 0); W.pump(); // 4.5 from A (outside), 3.5 from B (inside)
  ana.pedir(a1.e, "hola"); // the button names one AI: no ranking
  assert.deepEqual([a1.spy.llamadas.length, a2.spy.llamadas.length], [2, 1]);
  W.pump(PAUSA_PERSONA_TICKS);
  W.poner(ana.e, 4, 0); W.pump(); // 4 m from both: both hold her (edge inclusive); a tie goes to the lower entity
  ana.decir("Ada, otra vez");
  assert.equal(a1.spy.llamadas.length + a2.spy.llamadas.length, 4, "one message calls one AI");
});

test("llamar: several AIs, one message — /hermes is exact even if Ada is nearer; a name goes to the one named; a shared phrase to the nearest that holds you", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ada = W.ia(adaPase({ llamada: llam({ frase: "agente, responde" }) }), 0, 0);
  const her = W.ia(paseIA("Hermes", { c: "cd", llamada: llam({ frase: "agente, responde" }) }), 3, 0);
  W.pump();
  ana.decir("/hermes hola");
  assert.deepEqual([ada.spy.llamadas.length, her.spy.llamadas.length], [0, 1], "exact: Hermes, though Ada is nearer");
  W.pump(PAUSA_PERSONA_TICKS);
  ana.decir("Hermes, hola");
  assert.deepEqual([ada.spy.llamadas.length, her.spy.llamadas.length], [0, 2]);
  W.pump(PAUSA_PERSONA_TICKS);
  ana.decir("agente responde"); // both have the phrase: Ada is at 1 m, Hermes at 2 m, both bubbles hold her
  assert.deepEqual([ada.spy.llamadas.length, her.spy.llamadas.length], [1, 2], "the nearest");
  assert.equal(ada.spy.llamadas[0].modo, "frase");
});

test("llamar: a sleeping AI (dormida) is called in all four ways; being inside its bubble or chatting there is not a call", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(2, 0), eva = W.persona(0, 2), ugo = W.persona(0, -2);
  const ada = W.ia(adaPase({ estado: "dormida", llamada: llam({ frase: "agente, responde" }) }), 0, 0);
  W.pump();
  assert.equal(ana.s.features.stateOf("ia").get(String(ada.e))?.estado, "dormida");
  luis.decir("buenas tardes a todos"); luis.decir("¿alguien ha visto a Pepe?");
  assert.deepEqual([ada.spy.llamadas, W.L.llamadasDe(ada.e)], [[], []], "inside, talking: nothing reaches a sleeping AI");
  ana.decir("Ada, despierta");
  luis.decir("/ada hola");
  eva.pedir(ada.e, "hola");
  ugo.decir("agente, responde");
  assert.deepEqual(ada.spy.llamadas.map((m) => m.modo).sort(), ["barra", "boton", "frase", "nombre"]);
});

test("llamar: one call every 10 seconds per person — the second is refused with a notice, another person is not held back, and the pause is 10 s", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(2, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  ana.decir("Ada, uno");
  ana.pedir(ada.e, "dos");
  assert.equal(ada.spy.llamadas.length, 1);
  assert.deepEqual(ana.spy.avisos, ["Has llamado a Ada.", "Vas muy deprisa: puedes llamar a una IA una vez cada 10 segundos."]);
  luis.pedir(ada.e, "otro");
  assert.equal(ada.spy.llamadas.length, 2, "the limit is per person");
  W.pump(PAUSA_PERSONA_TICKS - 12);
  ana.pedir(ada.e, "tres");
  assert.equal(ada.spy.llamadas.length, 2, "still inside the 10 s");
  W.pump(10);
  ana.pedir(ada.e, "cuatro");
  assert.equal(ada.spy.llamadas.length, 3);
  assert.equal(ada.spy.llamadas.at(-1)?.texto, "cuatro", "a refused call is never delivered later");
});

test("llamar: 30 calls an hour per AI — the 31st is refused with a notice to the caller, a call to another AI is not, and an hour later it is open again", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ada = W.ia(adaPase(), 0, 0);
  const bea = W.ia(paseIA("Bea", { c: "cd" }), 0, 2);
  W.pump();
  for (let i = 0; i < POR_HORA_IA; i++) { ana.pedir(ada.e, `n.º ${i}`); W.pump(PAUSA_PERSONA_TICKS); }
  assert.equal(ada.spy.llamadas.length, POR_HORA_IA);
  ana.pedir(ada.e, "una más");
  assert.equal(ada.spy.llamadas.length, POR_HORA_IA);
  assert.equal(ana.spy.avisos.at(-1), "Ada ya ha recibido muchas llamadas esta hora. Vuelve a probar más tarde.");
  ana.pedir(bea.e, "y tú");
  assert.equal(bea.spy.llamadas.length, 1, "the count is per AI");
  W.pump(HORA_TICKS - POR_HORA_IA * PAUSA_PERSONA_TICKS + 1);
  ana.pedir(ada.e, "ya ha pasado la hora");
  assert.equal(ada.spy.llamadas.length, POR_HORA_IA + 1, "the first calls of the hour have aged out");
});

test("llamar: the mailbox keeps the last 20 calls for 10 minutes, oldest first, and reads «after n»; it never leaks to anyone else", () => {
  const W = mundo();
  const gente = Array.from({ length: BUZON_MAX + 1 }, (_, i) => W.persona(1 + (i % 3), -1 + (i % 3)));
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  gente.forEach((p, i) => p.pedir(ada.e, `llamada ${i}`));
  assert.equal(ada.spy.llamadas.length, BUZON_MAX + 1, "the AI's page got all of them");
  const buzon = W.L.llamadasDe(ada.e);
  assert.equal(buzon.length, BUZON_MAX);
  assert.deepEqual(buzon.map((x) => x.texto), Array.from({ length: BUZON_MAX }, (_, i) => `llamada ${i + 1}`), "the oldest went out");
  assert.deepEqual(buzon.map((x) => x.n), Array.from({ length: BUZON_MAX }, (_, i) => i + 2));
  assert.deepEqual(W.L.llamadasDe(ada.e, buzon[17].n).map((x) => x.texto), ["llamada 19", "llamada 20"], "only what came after n");
  assert.deepEqual(W.L.llamadasDe(ada.e, 999), []);
  buzon[0].texto = "tampoco"; // a copy: changing it changes nothing
  assert.equal(W.L.llamadasDe(ada.e)[0].texto, "llamada 1");
  W.pump(BUZON_TTL_TICKS - 100);
  assert.ok(W.L.llamadasDe(ada.e).length > 0, "still inside the 10 minutes");
  W.pump(120);
  assert.deepEqual(W.L.llamadasDe(ada.e), [], "older than 10 minutes: gone");
});

test("llamar: a silenced person calls nobody by /name or button; when they may speak again, they can", () => {
  const W = mundo();
  const ana = W.persona(1, 0), mod = W.persona(2, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  mod.decir("/dueño codigo-de-administracion-largo");
  mod.decir(`/silenciar ${W.quienEs(ana.e).nombre} 5`);
  W.pump(2);
  ana.pedir(ada.e, "hola");
  ana.decir("/ada hola");
  assert.deepEqual(ada.spy.llamadas, []);
  assert.deepEqual(ana.spy.avisos.filter((t) => t.startsWith("Estás")), ["Estás en silencio: ahora no puedes llamar a nadie.", "Estás en silencio: ahora no puedes llamar a nadie."]);
  mod.decir(`/hablar ${W.quienEs(ana.e).nombre}`);
  W.pump(2);
  ana.pedir(ada.e, "hola otra vez");
  assert.equal(ada.spy.llamadas.length, 1);
});

test("llamar: a name chosen with /nombre is what the caller is called in the call", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  ana.decir("/nombre Ana la Torre");
  W.pump(2);
  ana.pedir(ada.e, "hola");
  assert.equal(ada.spy.llamadas[0].nombre, "Ana la Torre");
});

test("llamar: an AI that goes away takes its calls and its entry with it; one that comes back starts clean", () => {
  const W = mundo();
  const ana = W.persona(1, 0);
  const ada = W.ia(adaPase(), 0, 0);
  W.pump();
  ana.pedir(ada.e, "hola");
  assert.equal(W.L.llamadasDe(ada.e).length, 1);
  W.inst.disconnect(ada.e); W.pump(4);
  assert.deepEqual(W.L.llamadasDe(ada.e), []);
  assert.equal(W.L.llamadaDe(ada.e), null);
  assert.deepEqual([...ana.s.features.stateOf("llamar").keys()], []);
  ana.pedir(ada.e, "¿sigues?");
  assert.ok(ana.spy.avisos.at(-1)?.startsWith("Aquí no hay ninguna IA"));
});

test("llamar: a world with no AI — no state, no events, nothing handled: /name is the chat's «nadie atiende» and a name is only a word", () => {
  const W = mundo();
  const ana = W.persona(1, 0), luis = W.persona(2, 0);
  ana.decir("Ada, ¿hay alguien?");
  ana.decir("/ada hola");
  assert.deepEqual([...ana.s.features.stateOf("llamar").keys()], []);
  assert.deepEqual(W.sonda, []);
  assert.match(W.lineas(ana, "aviso")[0] ?? "", /Nadie atiende «\/ada»/);
  assert.deepEqual([ana.spy.avisos, luis.spy.avisos, luis.spy.llamadas], [[], [], []]);
  assert.equal(W.log.some((l) => /llamar/.test(l)), false, "and nothing was logged about it");
});
