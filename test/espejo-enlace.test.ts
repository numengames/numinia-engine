// mundo-hermes · historia 5: the local WebSocket link. A fake source (a plain `ws` client) against the REAL link and the REAL espejo
// seam of a real Instance: connects with the key, fails with a wrong key / with an Origin / past the size and rate limits,
// reconnects and sends `lote`; `hola.funciones` says what is on; a request travels out and the answer comes back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearClienteChat } from "../features/chat/client.ts";
import { conEspejo } from "../features/espejo/server.ts";
import { ESQUEMA } from "../features/espejo/esquema.ts";
import { CIERRE, MENSAJE_MAX, RAFAGA, abrirEnlace, esLoopback, firmarReto } from "../packages/server/src/enlace-espejo.ts";
import { carpetaMundo, claveDeEnlace } from "../packages/server/src/mundo-carpeta.ts";
import { PARTES } from "../packages/server/src/mundo-zip.ts";

void chatServer;
const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const CLAVE = "clave-del-enlace-de-prueba-0123456789";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const ESPEJO = { schema: ESQUEMA, funciones: { cron: true, sesiones: false }, zonas: [{ id: "z7", nombre: "El reloj", centro: { x: 40, z: -10 }, ancho: 16, fondo: 16, alto: 6, tipos: ["cron"] }] };
const cron = (id: string, extra: Record<string, unknown> = {}) => ({ tipo: "cron", id, titulo: `Tarea ${id}`, estado: "programado", zona: "z7", acciones: ["cron.pausar"], ...extra });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function abrir(o: { reloj?: () => number; silencioMs?: number; pulsoMs?: number; retoMs?: number } = {}) {
  const archivos = new Map<string, unknown>([["espejo.json", ESPEJO]]);
  const log: string[] = [], reloj = { ms: Date.parse("2026-11-05T10:00:00Z") };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f) => archivos.get(f), (l) => log.push(l));
  const inst: Instance = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign, puede: (w, a) => roles.puede(w, a) });
  const parte = lista.find(conEspejo)!;
  const enlace = await abrirEnlace({ enlace: parte.enlace as never, clave: CLAVE, puerto: 0, log: (l) => log.push(l), ...o });
  const t = inst.join(0), c = crearClienteChat(() => reloj.ms);
  const s = new ClientSession(t, { features: [c.part], identity: keeper() });
  const pump = (k = 3) => { for (let i = 0; i < k; i++) { t.flush(); inst.tick(); t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  pump(2);
  return { inst, enlace, parte, log, pump, persona: { t, s, chat: c.chat }, poner: (x: number, z: number) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); }, cerrar: async () => { await enlace.close(); } };
}
type Fuente = { ws: WebSocket; recibidos: Record<string, unknown>[]; cierre: Promise<{ code: number; reason: string }>; espera: (t: string, ms?: number) => Promise<Record<string, unknown>>; mandar: (m: Record<string, unknown>) => void };
/** A fake source. `origen` adds an Origin header (what a web page would send). Resolves when the socket is open, or rejects with the HTTP status. */
function fuente(puerto: number, o: { origen?: string } = {}): Promise<Fuente> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${puerto}/`, o.origen ? { headers: { Origin: o.origen } } : {});
    const recibidos: Record<string, unknown>[] = [];
    const cierre = new Promise<{ code: number; reason: string }>((r) => ws.on("close", (code, reason) => r({ code, reason: reason.toString() })));
    ws.on("message", (d) => recibidos.push(JSON.parse(d.toString())));
    ws.on("error", reject);
    ws.on("open", () => resolve({
      ws, recibidos, cierre,
      mandar: (m) => ws.send(JSON.stringify({ v: 1, ...m })),
      espera: async (t, ms = 1500) => { const fin = Date.now() + ms; for (;;) { const i = recibidos.findIndex((x) => x.t === t); if (i >= 0) return recibidos.splice(i, 1)[0]; if (Date.now() > fin) throw new Error(`no llegó «${t}»; llegó ${JSON.stringify(recibidos)}`); await dormir(5); } },
    }));
  });
}
/** Connect and finish the handshake with the right (or a given) key. */
async function entrar(puerto: number, clave = CLAVE) {
  const f = await fuente(puerto);
  const reto = await f.espera("reto");
  f.mandar({ t: "hola", plugin: "prueba", hermes_version: "0.0-test", firma: firmarReto(clave, String(reto.nonce)) });
  return f;
}

test("enlace: only loopback is local; a challenge is signed with the key and never contains it", () => {
  assert.deepEqual(["127.0.0.1", "127.9.9.9", "::1", "::ffff:127.0.0.1"].map(esLoopback), [true, true, true, true]);
  assert.deepEqual(["192.168.1.5", "10.0.0.1", "::ffff:10.0.0.1", "", undefined, "127.0.0.1.evil.com"].map(esLoopback), [false, false, false, false, false, false]);
  const a = firmarReto(CLAVE, "n1"), b = firmarReto(CLAVE, "n2"), c = firmarReto("otra-clave-del-enlace-0123456789", "n1");
  assert.match(a, /^[0-9a-f]{64}$/); assert.notEqual(a, b); assert.notEqual(a, c); assert.equal(a.includes(CLAVE), false);
});

test("enlace: refuses to listen anywhere but 127.0.0.1, and to start without a real key", async () => {
  const parte = { funciones: () => [], config: () => null } as never;
  await assert.rejects(abrirEnlace({ enlace: parte, clave: CLAVE, puerto: 0, host: "0.0.0.0" }), /solo escucha en 127\.0\.0\.1/);
  await assert.rejects(abrirEnlace({ enlace: parte, clave: CLAVE, puerto: 0, host: "192.168.1.5" }), /solo escucha en 127\.0\.0\.1/);
  await assert.rejects(abrirEnlace({ enlace: parte, clave: "corta", puerto: 0 }), /al menos 16 caracteres/);
});

test("enlace: connects with the key; `hola` says what is ON (and only that); the world hears the source arrive", async () => {
  const W = await abrir();
  try {
    const f = await entrar(W.enlace.puerto);
    const hola = await f.espera("hola");
    assert.deepEqual(hola.funciones, ["cron"], "sesiones is off: the source is never told to publish it");
    assert.deepEqual(hola.zonas, [{ id: "z7", tipos: ["cron"] }]);
    assert.equal(hola.v, 1);
    await dormir(20); W.pump(3);
    assert.equal(W.enlace.conectado(), true);
    assert.ok(W.log.some((l) => /conectada la fuente «prueba»/.test(l)));
    assert.equal(JSON.stringify(f.recibidos).includes(CLAVE), false, "the key never travels");
    f.ws.close(); await f.cierre;
  } finally { await W.cerrar(); }
});

test("enlace: a WRONG key is closed with 4401 and the world never sees a source; so is silence to the challenge and a message before hola", async () => {
  const W = await abrir({ retoMs: 150 });
  try {
    const mala = await entrar(W.enlace.puerto, "otra-clave-del-enlace-0123456789");
    assert.equal((await mala.cierre).code, CIERRE.MALA_FIRMA);
    assert.equal(W.enlace.conectado(), false);
    const muda = await fuente(W.enlace.puerto); await muda.espera("reto");
    assert.equal((await muda.cierre).code, CIERRE.MALA_FIRMA, "no answer to the challenge in time");
    const salta = await fuente(W.enlace.puerto); await salta.espera("reto");
    salta.mandar({ t: "lote", objetos: [cron("a")] });
    assert.equal((await salta.cierre).code, CIERRE.PROTOCOLO, "anything before hola closes it");
    // a signature that was right for ANOTHER challenge is useless (one use per challenge)
    const a = await fuente(W.enlace.puerto), ra = await a.espera("reto");
    const b = await fuente(W.enlace.puerto), rb = await b.espera("reto");
    assert.notEqual(ra.nonce, rb.nonce);
    b.mandar({ t: "hola", plugin: "x", hermes_version: "x", firma: firmarReto(CLAVE, String(ra.nonce)) });
    assert.equal((await b.cierre).code, CIERRE.MALA_FIRMA);
    a.ws.close();
    assert.equal(W.parte.enlace.alta(cron("a")).ok, true, "the seam itself is untouched by failed handshakes");
  } finally { await W.cerrar(); }
});

test("enlace: an `Origin` header (a web page) is refused even with the right key", async () => {
  const W = await abrir();
  try {
    const f = await fuente(W.enlace.puerto, { origen: "https://mala.example" });
    const c = await f.cierre;
    assert.equal(c.code, CIERRE.ORIGEN); assert.match(c.reason, /origen web/);
    assert.equal(f.recibidos.some((x) => x.t === "reto"), false, "not even a challenge is given to a browser");
    assert.ok(W.log.some((l) => /tiene cabecera Origin/.test(l)));
    assert.equal(W.enlace.conectado(), false);
  } finally { await W.cerrar(); }
});

test("enlace: one source at a time; when it leaves the next one gets in (reconnection) and `lote` replaces what the first had", async () => {
  const W = await abrir();
  try {
    const uno = await entrar(W.enlace.puerto); await uno.espera("hola");
    uno.mandar({ t: "lote", objetos: [cron("viejo"), cron("a")] }); await dormir(30);
    assert.deepEqual(W.parte.enlace.alta(cron("b")).ok, true); // the seam is shared with the link
    const otro = await fuente(W.enlace.puerto);
    assert.equal((await otro.cierre).code, CIERRE.OCUPADO);
    uno.ws.close(); await uno.cierre; await dormir(30);
    assert.equal(W.enlace.conectado(), false);
    const dos = await entrar(W.enlace.puerto); await dos.espera("hola");
    dos.mandar({ t: "lote", objetos: [cron("a", { estado: "pausado" })] }); await dormir(30);
    W.persona.s.features.send("espejo", "usar", { objeto: "cron/a" }); // far from it, so refused: this only proves the world kept `a`
    const r = W.parte.enlace.baja({ tipo: "cron", id: "viejo" });
    assert.equal(r.ok, false, "«viejo» is gone: the new lote replaced everything");
    assert.equal(W.parte.enlace.baja({ tipo: "cron", id: "a" }).ok, true);
    dos.ws.close(); await dos.cierre;
  } finally { await W.cerrar(); }
});

test("enlace: a bad thing comes back as `error` with the path, the link stays up; a function that is off is refused", async () => {
  const W = await abrir();
  try {
    const f = await entrar(W.enlace.puerto); await f.espera("hola");
    f.mandar({ t: "alta", objeto: cron("a", { zona: "no-existe" }) });
    const e = await f.espera("error");
    assert.equal(e.en, "alta"); assert.match(String(e.motivo), /objeto\.zona/);
    f.mandar({ t: "alta", objeto: { tipo: "sesion", id: "s1", titulo: "Charla", zona: "z7" } });
    assert.match(String((await f.espera("error")).motivo), /objeto\.tipo|apagada/);
    f.mandar({ t: "lote", objetos: "no" });
    assert.equal((await f.espera("error")).en, "lote");
    f.mandar({ t: "lote", objetos: [cron("v"), cron("w", { zona: "no-existe" })] });
    const ack = await f.espera("ack");
    assert.deepEqual([ack.en, ack.puestas, ack.quitadas, ack.mas], ["lote", 1, 0, 0]);
    assert.deepEqual((ack.descartadas as { tipo: string; id: string }[]).map((d) => `${d.tipo}/${d.id}`), ["cron/w"]);
    f.mandar({ t: "inventado" });
    assert.match(String((await f.espera("error")).motivo), /mensaje desconocido/);
    f.mandar({ t: "alta", objeto: cron("ok") }); await dormir(30);
    assert.equal(f.ws.readyState, WebSocket.OPEN, "still connected");
    assert.equal(W.parte.enlace.baja({ tipo: "cron", id: "ok" }).ok, true);
    f.ws.close(); await f.cierre;
  } finally { await W.cerrar(); }
});

test("enlace: size and rate limits — over 16 KB is cut (1009), invalid JSON and wrong version close (4400), a flood closes (4429)", async () => {
  const W = await abrir();
  try {
    const grande = await entrar(W.enlace.puerto); await grande.espera("hola");
    grande.ws.send(JSON.stringify({ v: 1, t: "alta", objeto: cron("a", { subtitulo: "x".repeat(MENSAJE_MAX + 10) }) }));
    assert.equal((await grande.cierre).code, CIERRE.GRANDE);
    const roto = await entrar(W.enlace.puerto); await roto.espera("hola");
    roto.ws.send("{no es json"); assert.equal((await roto.cierre).code, CIERRE.PROTOCOLO);
    const vieja = await entrar(W.enlace.puerto); await vieja.espera("hola");
    vieja.ws.send(JSON.stringify({ v: 9, t: "pulso" })); assert.equal((await vieja.cierre).code, CIERRE.PROTOCOLO);
    const bin = await entrar(W.enlace.puerto); await bin.espera("hola");
    bin.ws.send(Buffer.from([1, 2, 3])); assert.equal((await bin.cierre).code, CIERRE.PROTOCOLO);
    const ruido = await entrar(W.enlace.puerto); await ruido.espera("hola");
    for (let i = 0; i < RAFAGA + 30; i++) ruido.mandar({ t: "pulso" });
    assert.equal((await ruido.cierre).code, CIERRE.RITMO);
    assert.equal(W.enlace.conectado(), false);
  } finally { await W.cerrar(); }
});

test("enlace: a request leaves through the link and the answer comes back: owner asks ⇒ `peticion` on the wire ⇒ `resultado` ⇒ the owner hears it", async () => {
  const W = await abrir();
  try {
    const f = await entrar(W.enlace.puerto); await f.espera("hola");
    f.mandar({ t: "alta", objeto: cron("8bc0") }); await dormir(30);
    const { persona } = W;
    persona.chat.decir(`/dueño ${ADMIN}`); W.pump(TICK_HZ + 2);
    W.poner(40, -8); W.pump(3);
    const dicho: Record<string, unknown>[] = [];
    persona.s.features.tap((feat, ev, m) => { if (feat === "espejo") dicho.push({ ev, ...(m as object) }); });
    persona.s.features.send("espejo", "pedir", { objeto: "cron/8bc0", verbo: "cron.pausar" }); await dormir(30); W.pump(3);
    const p = await f.espera("peticion");
    assert.deepEqual([p.objeto, p.verbo, p.seguridad], ["cron/8bc0", "cron.pausar", "aprobar"]);
    assert.ok(typeof p.id === "string" && typeof p.caduca === "number"); assert.ok((p.quien as { nombre: string }).nombre.length > 0);
    f.mandar({ t: "resultado", peticion: p.id, ok: true, texto: "Pausada." }); await dormir(30); W.pump(3);
    assert.deepEqual(dicho.filter((d) => d.ev === "resultado").map((d) => [d.ok, d.texto]), [[true, "Pausada."]]);
    f.mandar({ t: "resultado", peticion: p.id, ok: true, texto: "otra vez" });
    assert.match(String((await f.espera("error")).motivo), /nadie espera esa petición/);
    // the source drops with a request waiting: the owner is told it is not known whether it was done
    persona.s.features.send("espejo", "pedir", { objeto: "cron/8bc0", verbo: "cron.pausar" }); await dormir(30); W.pump(TICK_HZ + 2);
    await f.espera("peticion");
    f.ws.close(); await f.cierre; await dormir(30); W.pump(3);
    assert.match(String(dicho.filter((d) => d.ev === "resultado").at(-1)?.texto), /conexión con la fuente se cortó/);
    assert.ok(dicho.some((d) => d.ev === "aviso" && d.conectada === false));
  } finally { await W.cerrar(); }
});

test("enlace: a source that goes silent is dropped; pulsos keep it alive", async () => {
  const W = await abrir({ silencioMs: 120, pulsoMs: 40 });
  try {
    const viva = await entrar(W.enlace.puerto); await viva.espera("hola");
    const latir = setInterval(() => viva.mandar({ t: "pulso" }), 30);
    await viva.espera("pulso", 600); // the engine pulses too
    await dormir(250);
    assert.equal(viva.ws.readyState, WebSocket.OPEN, "alive thanks to its pulsos");
    clearInterval(latir);
    assert.equal((await viva.cierre).code, CIERRE.SILENCIO);
  } finally { await W.cerrar(); }
});

test("enlace: the key is made once in enlace.env (600), read back the same, never inside the zip's parts, and MOTOR_ENLACE_CLAVE wins", () => {
  const raiz = mkdtempSync(join(tmpdir(), "enlace-"));
  try {
    const c = carpetaMundo(raiz), log: string[] = [];
    const k1 = claveDeEnlace({}, c, (l) => log.push(l));
    assert.match(k1, /^[0-9a-f]{48}$/);
    assert.equal(statSync(join(raiz, "enlace.env")).mode & 0o777, 0o600);
    assert.equal(claveDeEnlace({}, c), k1, "made once: the next start reads the same");
    assert.equal(log.join("\n").includes(k1), false, "never printed");
    assert.equal(claveDeEnlace({ MOTOR_ENLACE_CLAVE: "x".repeat(20) }, c), "x".repeat(20));
    assert.equal(claveDeEnlace({ MOTOR_ENLACE_CLAVE: "corta" }, c), "", "a short key is not used");
    assert.equal(claveDeEnlace({}, null), "", "nowhere to keep it, no variable: no key (the link is not opened)");
    assert.ok(!(PARTES as readonly string[]).includes("enlace.env") && existsSync(join(raiz, "enlace.env")));
    assert.ok(readdirSync(raiz).includes("enlace.env") && readFileSync(join(raiz, "enlace.env"), "utf8").startsWith("# Clave del enlace"));
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});

test("enlace: a switch flipped from inside the world reaches the connected source as a `funciones` frame (the new full list), and stops after it disconnects", async () => {
  const W = await abrir();
  try {
    W.persona.chat.decir(`/dueño ${ADMIN}`); W.pump(TICK_HZ + 2);
    const f = await entrar(W.enlace.puerto);
    assert.deepEqual((await f.espera("hola")).funciones, ["cron"]);
    await dormir(20); W.pump(3);
    assert.equal(W.persona.s.features.send("espejo", "encender", { funcion: "sesiones", activa: true }).ok, true); W.pump(3);
    const a = await f.espera("funciones");
    assert.deepEqual(a.funciones, ["cron", "sesiones"]); assert.equal(a.v, 1);
    assert.equal(W.persona.s.features.send("espejo", "encender", { funcion: "cron", activa: false }).ok, true); W.pump(3);
    assert.deepEqual((await f.espera("funciones")).funciones, ["sesiones"], "what went off is no longer asked for");
    // a source that comes back is told the CURRENT list in hola, not the file's old one
    f.ws.close(); await f.cierre; await dormir(20);
    assert.equal(W.persona.s.features.send("espejo", "encender", { funcion: "cron", activa: true }).ok, true); W.pump(3);
    const g = await entrar(W.enlace.puerto);
    assert.deepEqual((await g.espera("hola")).funciones, ["cron", "sesiones"]);
    g.ws.close(); await g.cierre;
  } finally { await W.cerrar(); }
});
