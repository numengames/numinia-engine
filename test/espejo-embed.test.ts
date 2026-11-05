// mundo-hermes · M7: the embed mode. (1) the credential, (2) the `POST /espejo/embed` route over a real HTTP server (off = 404, no credential = 401,
// Origin null alone is NOT enough, size, JSON, rate), (3) the postMessage bridge (pure), (4) the `embed` intent on a real Instance (credential binds the
// page as the source and as the «dueño local»; no credential / embed off = refused), (5) the safe storage adapter and the schema key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { fx } from "../packages/core/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { conEspejo } from "../features/espejo/server.ts";
import type { EnlaceEspejo, Peticion } from "../features/espejo/server.ts";
import { ESQUEMA, leerEspejo, vistaPublica } from "../features/espejo/esquema.ts";
import { acunarCredencial, crearEmbedHttp, verificarCredencial } from "../packages/server/src/embed-espejo.ts";
import { RAFAGA } from "../features/espejo/puente.ts";
import { crearPuente, MAX_MENSAJE } from "../features/espejo/puente.ts";
import { instalarAlmacenSeguro } from "../apps/plaza/almacen-seguro.ts";

const CLAVE = "una-clave-de-enlace-bien-larga-0123456789", ZONAS = [{ id: "z7", nombre: "El reloj", centro: { x: 40, z: -10 }, ancho: 16, fondo: 16, alto: 6, tipos: ["cron"] }];
const cron = (id: string) => ({ tipo: "cron", id, titulo: `Tarea ${id}`, estado: "programado", zona: "z7", x: 40, z: -10, acciones: ["cron.pausar"] });

// ---- 1. credential ----
test("credential: genuine passes; expired, forged, other key, too long-lived, junk do not", () => {
  const t0 = 1_800_000_000_000, c = acunarCredencial(CLAVE, { ahora: t0, ttlMs: 3600_000 });
  assert.equal(verificarCredencial(CLAVE, c, t0 + 1000), true);
  assert.equal(verificarCredencial(CLAVE, c, t0 + 3600_000 + 1), false, "expired");
  assert.equal(verificarCredencial("otra-clave-de-enlace-bien-larga-999999", c, t0 + 1000), false, "other key");
  assert.equal(verificarCredencial(CLAVE, c.replace(/.$/, c.endsWith("0") ? "1" : "0"), t0 + 1000), false, "forged tag");
  assert.equal(verificarCredencial(CLAVE, acunarCredencial(CLAVE, { ahora: t0, ttlMs: 10 * 24 * 3600_000 }), t0), true, "ttl is capped to 24 h, not refused");
  const largo = `e1.${t0 + 30 * 24 * 3600_000}.AAAAAAAAAAAAAAAA.${"a".repeat(64)}`;
  for (const x of [largo, "", "e1.x", 42, null, undefined, "e1." + "a".repeat(400)]) assert.equal(verificarCredencial(CLAVE, x, t0), false);
  assert.equal(verificarCredencial("", c, t0 + 1000), false, "no key = no embed");
});

// ---- 2. the HTTP route ----
async function ruta(activo = true) {
  const recibido: unknown[] = [], reloj = { ms: Date.now() };
  const enlace = { lote: (o: unknown) => (recibido.push(["lote", o]), { ok: true, puestas: Array.isArray(o) ? o.length : 0, quitadas: 0, descartadas: [] }), alta: (o: unknown) => (recibido.push(["alta", o]), { ok: true, puestas: 1 }), cambio: () => ({ ok: true }), baja: () => ({ ok: true }), resultado: (p: string) => p === "p1" } as unknown as EnlaceEspejo;
  const h = crearEmbedHttp({ enlace, clave: () => CLAVE, activo: () => activo, reloj: () => reloj.ms });
  const srv: Server = createServer((req, res) => { if (!h.atender(req.method ?? "", new URL(req.url ?? "/", "http://x").pathname, req, res)) { res.writeHead(404); res.end("no"); } });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/espejo/embed`;
  const post = (cuerpo: string, cabeceras: Record<string, string> = {}, metodo = "POST") => fetch(url, { method: metodo, headers: { "content-type": "application/json", ...cabeceras }, body: metodo === "POST" ? cuerpo : undefined });
  return { post, url, recibido, reloj, cerrar: () => srv.close() };
}
test("route: embed off ⇒ 404 even with a valid credential; Origin null alone ⇒ 401", async () => {
  const off = await ruta(false), on = await ruta(true);
  try {
    assert.equal((await off.post("{}", { authorization: `Bearer ${acunarCredencial(CLAVE)}` })).status, 404);
    const sin = await on.post(JSON.stringify({ v: 1, t: "pulso" }), { origin: "null" });
    assert.equal(sin.status, 401, "Origin: null proves nothing");
    assert.equal((await on.post("{}", { origin: "null", authorization: "Bearer e1.junk" })).status, 401);
    assert.equal((await on.post("{}", { authorization: `Bearer ${acunarCredencial("otra-clave-de-enlace-bien-larga-999999")}` })).status, 401);
  } finally { off.cerrar(); on.cerrar(); }
});
test("route: valid credential ⇒ lote/alta reach the link; CORS preflight answers; proxy header, bad JSON, bad version, >16 KB, unknown type are refused", async () => {
  const R = await ruta(), A = { authorization: `Bearer ${acunarCredencial(CLAVE)}`, origin: "null" };
  try {
    const pre = await R.post("", { origin: "null" }, "OPTIONS");
    assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "*"); assert.match(pre.headers.get("access-control-allow-headers") ?? "", /authorization/);
    const r = await R.post(JSON.stringify({ v: 1, t: "lote", objetos: [cron("a"), cron("b")] }), A);
    assert.equal(r.status, 200); const j = (await r.json()) as { ok: boolean; puestas: number }; assert.equal(j.ok, true); assert.equal(j.puestas, 2);
    assert.equal(((await (await R.post(JSON.stringify({ v: 1, t: "alta", objeto: cron("c") }), A)).json()) as { ok: boolean }).ok, true);
    assert.deepEqual(R.recibido.map((x) => (x as string[])[0]), ["lote", "alta"]);
    assert.equal((await R.post(JSON.stringify({ v: 1, t: "pulso" }), { ...A, "x-forwarded-for": "8.8.8.8" })).status, 403, "behind a proxy = not this machine");
    assert.equal((await R.post("{no", A)).status, 400);
    assert.equal((await R.post(JSON.stringify({ v: 2, t: "pulso" }), A)).status, 400);
    assert.equal((await R.post(JSON.stringify({ v: 1, t: "lote", objetos: [], x: "a".repeat(20000) }), A)).status, 413);
    const d = (await (await R.post(JSON.stringify({ v: 1, t: "rm-rf" }), A)).json()) as { ok: boolean; motivo: string }; assert.equal(d.ok, false); assert.match(d.motivo, /desconocido/);
    assert.equal((await (await R.post(JSON.stringify({ v: 1, t: "resultado", peticion: "p1", ok: true, texto: "hecho" }), A)).json() as { ok: boolean }).ok, true);
    assert.equal(((await (await R.post(JSON.stringify({ v: 1, t: "resultado", peticion: "zz", ok: true }), A)).json()) as { ok: boolean }).ok, false);
    assert.equal((await R.post("", A, "PUT")).status, 405);
  } finally { R.cerrar(); }
});
test("route: a flood is answered 429", async () => {
  const R = await ruta(), A = { authorization: `Bearer ${acunarCredencial(CLAVE)}` };
  try { const s: number[] = []; for (let i = 0; i < 80; i++) s.push((await R.post(JSON.stringify({ v: 1, t: "pulso" }), A)).status); assert.ok(s.includes(429), "rate limit hit"); assert.ok(s.filter((x) => x === 200).length >= 1); } finally { R.cerrar(); }
});

// ---- 3. the bridge ----
function puente(reloj = { ms: 0 }) {
  const padre = { enviados: [] as Record<string, unknown>[], postMessage(m: unknown) { this.enviados.push(m as Record<string, unknown>); } }, otro = {}, tramas: Record<string, unknown>[] = [];
  const p = crearPuente({ padre, fuente: padre, enviar: async (t) => { tramas.push(t); return { ok: true }; }, reloj: () => reloj.ms });
  const dec = (data: unknown, source: unknown = padre) => p.alMensaje({ source, data });
  return { p, padre, otro, tramas, dec, reloj, tick: () => new Promise((r) => setImmediate(r)) };
}
test("bridge: snapshot / event from the parent become link frames (same names as the local link)", async () => {
  const B = puente();
  B.dec({ v: 1, kind: "snapshot", objetos: [cron("a")] }); B.dec({ v: 1, kind: "event", evento: "alta", objeto: cron("b") }); B.dec({ v: 1, kind: "event", evento: "resultado", peticion: "p9", ok: false, texto: "no" });
  assert.deepEqual(B.tramas.map((t) => t.t), ["lote", "alta", "resultado"]); assert.equal(B.tramas[2].texto, "no"); assert.equal(B.p.stats.aceptados, 3);
});
test("bridge: a message from any window but the parent is dropped in silence (no answer, nothing sent)", () => {
  const B = puente();
  B.dec({ v: 1, kind: "snapshot", objetos: [] }, B.otro); B.dec({ v: 1, kind: "snapshot", objetos: [] }, null); B.p.alMensaje({ source: undefined, data: { v: 1, kind: "snapshot", objetos: [] } });
  assert.equal(B.tramas.length, 0); assert.equal(B.padre.enviados.length, 0); assert.equal(B.p.stats.descartados, 3);
});
test("bridge: bad shape, version, kind, event, oversized ⇒ `error` to the parent and nothing sent", () => {
  const B = puente();
  const malos: unknown[] = ["texto", 5, null, [1], { kind: "snapshot" }, { v: 2, kind: "snapshot", objetos: [] }, { v: 1, kind: "snapshot" }, { v: 1, kind: "snapshot", objetos: "x" }, { v: 1, kind: "snapshot", objetos: new Array(201).fill({}) },
    { v: 1, kind: "event", evento: "borrar-todo", objeto: {} }, { v: 1, kind: "event", evento: "alta" }, { v: 1, kind: "event", evento: "resultado", peticion: 5, ok: true }, { v: 1, kind: "funciones", funciones: "cron" },
    { v: 1, kind: "teletransporte" }, { v: 1, kind: "snapshot", objetos: [{ x: "a".repeat(MAX_MENSAJE) }] }];
  for (const m of malos) { B.reloj.ms += 1000; B.dec(m); }
  assert.equal(B.tramas.length, 0); assert.equal(B.padre.enviados.length, malos.length); assert.ok(B.padre.enviados.every((e) => e.kind === "error" && e.v === 1 && typeof e.motivo === "string"));
  assert.match(String(B.padre.enviados.at(-1)?.motivo), /16 KB/);
});
test("bridge: a flood is cut by the rate limit, and recovers with time", () => {
  const B = puente(); for (let i = 0; i < RAFAGA + 30; i++) B.dec({ v: 1, kind: "snapshot", objetos: [] });
  assert.equal(B.tramas.length, RAFAGA); assert.ok(B.padre.enviados.some((e) => /rápido/.test(String(e.motivo))));
  B.reloj.ms += 2000; B.dec({ v: 1, kind: "snapshot", objetos: [] }); assert.equal(B.tramas.length, RAFAGA + 1);
});
test("bridge: `funciones` never switches anything; naming one the world has off is answered with `ack.ignoradas`", () => {
  const B = puente(); B.dec({ v: 1, kind: "funciones", funciones: ["cron"] }); assert.equal(B.padre.enviados.length, 0, "unknown yet: nothing to compare");
  B.p.deMundo("hola", { funciones: "cron", confirmar: "cron.pausar", aprobar: "cron.borrar" }); assert.deepEqual(B.padre.enviados.at(-1), { v: 1, kind: "hola", funciones: ["cron"], acciones: { "cron.borrar": "aprobar", "cron.pausar": "confirmar" } });
  B.dec({ v: 1, kind: "funciones", funciones: ["cron", "sesiones", "memoria"] }); assert.deepEqual(B.padre.enviados.at(-1), { v: 1, kind: "ack", en: "funciones", ignoradas: ["sesiones", "memoria"] });
  assert.equal(B.tramas.length, 0, "no frame goes to the server: the switches are the world's");
  B.p.deMundo("lista", { funciones: "" }); assert.deepEqual(B.padre.enviados.at(-1), { v: 1, kind: "funciones", funciones: [] });
});
test("bridge: a request from the world goes out as `peticion` with who and when it expires", () => {
  const B = puente(); B.p.deMundo("peticion", { id: "q1", objeto: "cron/a", verbo: "cron.pausar", seguridad: "confirmar", quienId: "g-1", quienNombre: "dueño local", caduca: 1234 });
  assert.deepEqual(B.padre.enviados.at(-1), { v: 1, kind: "peticion", id: "q1", objeto: "cron/a", verbo: "cron.pausar", seguridad: "confirmar", quien: { id: "g-1", nombre: "dueño local" }, caduca: 1234 });
});

// ---- 4. the `embed` intent on a real Instance ----
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
function mundo(embed: boolean) {
  const sign = signer("una-clave-de-prueba-larga"), archivos = new Map<string, unknown>([["espejo.json", { schema: ESQUEMA, activa: true, funciones: { cron: true }, acciones: { "cron.pausar": "confirmar" }, zonas: ZONAS, ...(embed ? { embed: { activa: true } } : {}) }]]);
  const log: string[] = [], roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => 0, log: (l) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f) => archivos.get(f), (l) => log.push(l));
  const inst: Instance = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l: string) => log.push(l), identitySign: sign, puede: (w: never, a: never) => roles.puede(w, a) } as never);
  const enlace = lista.find(conEspejo)!.enlace as EnlaceEspejo; enlace.verificarEmbed((c) => verificarCredencial(CLAVE, c));
  const t = inst.join(0), s = new ClientSession(t, { features: [], identity: keeper() }), vistos: { ev: string; m: Record<string, unknown> }[] = [];
  s.features.tap((f, e, m) => { if (f === "espejo") vistos.push({ ev: e, m: m as Record<string, unknown> }); });
  const pump = (k = 3) => { for (let i = 0; i < k; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump(2); return { inst, enlace, s, vistos, pump, log, ultimo: (ev: string) => vistos.filter((v) => v.ev === ev).at(-1)?.m };
}
test("embed intent: valid credential binds the page: `hola`, `permiso`, and a request goes out as «dueño local» without any role", () => {
  const W = mundo(true), sal: Peticion[] = [];
  W.enlace.alta(cron("8bc0")); W.inst.sim.tf.cols.x[W.s.entity] = fx(40); W.inst.sim.tf.cols.z[W.s.entity] = fx(-8); W.pump(3);
  W.s.features.send("espejo", "embed", { credencial: acunarCredencial(CLAVE) }); W.pump(3);
  assert.ok(W.ultimo("hola"), "hola"); assert.match(String(W.ultimo("hola")?.funciones), /cron/); assert.equal(W.ultimo("permiso")?.encender, true);
  W.s.features.send("espejo", "usar", { objeto: "cron/8bc0" }); W.pump(3);
  W.s.features.send("espejo", "pedir", { objeto: "cron/8bc0", verbo: "cron.pausar" }); W.pump(3);
  const p = W.ultimo("peticion"); assert.ok(p, `peticion reaches the page (rechazado: ${JSON.stringify(W.ultimo("rechazado"))})`); assert.equal(p?.quienNombre, "dueño local"); assert.equal(p?.verbo, "cron.pausar");
  void sal;
});
test("embed intent: no / wrong credential, or embed off in the world ⇒ refused with a reason, nothing bound", () => {
  const W = mundo(true);
  W.s.features.send("espejo", "embed", { credencial: "e1.nada" }); W.pump(3);
  assert.ok(W.ultimo("rechazado")); assert.equal(W.ultimo("hola"), undefined);
  const X = mundo(false); X.s.features.send("espejo", "embed", { credencial: acunarCredencial(CLAVE) }); X.pump(3);
  assert.match(String(X.ultimo("rechazado")?.motivo ?? X.ultimo("rechazado")?.texto ?? JSON.stringify(X.ultimo("rechazado"))), /embebido/); assert.equal(X.ultimo("hola"), undefined);
  X.s.features.send("espejo", "pedir", { objeto: "cron/zz", verbo: "cron.pausar" }); X.pump(3);
  assert.equal(X.ultimo("peticion"), undefined, "without the credential a normal guest has no owner powers");
});

// ---- 5. storage adapter and schema ----
test("storage adapter: replaces only what throws; working storage is left alone", () => {
  const roto = {}; for (const k of ["localStorage", "sessionStorage", "caches"]) Object.defineProperty(roto, k, { get() { throw new Error("SecurityError"); }, configurable: true });
  const doc = {} as Record<string, unknown>; Object.defineProperty(doc, "cookie", { get() { throw new Error("SecurityError"); }, set() { throw new Error("SecurityError"); }, configurable: true });
  assert.deepEqual(instalarAlmacenSeguro(roto, doc).sort(), ["caches", "cookie", "localStorage", "sessionStorage"]);
  const ls = (roto as { localStorage: Storage }).localStorage; ls.setItem("a", "1"); assert.equal(ls.getItem("a"), "1"); assert.equal(ls.getItem("b"), null); ls.removeItem("a"); assert.equal(ls.length, 0);
  assert.equal((doc as { cookie: string }).cookie, ""); assert.equal((roto as { caches: unknown }).caches, undefined);
  const bueno = { localStorage: { x: 1 } }; assert.deepEqual(instalarAlmacenSeguro(bueno, {}), []); assert.deepEqual(bueno.localStorage, { x: 1 });
});
test("schema: `embed` is off by default and absent from the public view; `embed.activa: true` shows `embed: true`; junk is reported", () => {
  const base = { schema: ESQUEMA, activa: true, zonas: ZONAS }, v = (j: unknown) => { const r = leerEspejo(j); assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.issues)); return r.ok ? r.value : (undefined as never); };
  const a = v(base); assert.equal(a.embed.activa, false); assert.equal("embed" in (vistaPublica(a) ?? {}), false);
  assert.equal(vistaPublica(v({ ...base, embed: { activa: true } }))?.embed, true);
  for (const mal of [{ activa: "si" }, { origenes: ["null"] }, "si"]) { const r = leerEspejo({ ...base, embed: mal }); assert.equal(r.ok, false, JSON.stringify(mal)); }
});
