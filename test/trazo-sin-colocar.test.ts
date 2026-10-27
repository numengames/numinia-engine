// J18b story 6, gap of #283: a refused paint stroke leaves no file in /a/. Two halves:
//   · the PAGE (apps/plaza/pintar.ts) asks the server «does it fit?» (objetos `cupo`) before it uploads, and uploads nothing when the answer is no;
//   · the SERVER (packages/server/src/subidas.ts) removes stroke files that were uploaded and never placed, after a while (limits.json `stroke_unplaced_minutes`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRAZO_SCHEMA } from "../packages/net/src/ficheros.ts";
import { TRAZOS } from "../features/objetos/feature.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { ClientPart } from "../packages/feature/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { TRAZO_SIN_COLOCAR_MIN } from "../packages/server/src/subidas.ts";
import { signer } from "../packages/server/src/secret.ts";
import { emitir, today } from "../packages/instance/src/identidad.ts";
import { montarPintar } from "../apps/plaza/pintar.ts";

const sha = (c: string) => c.repeat(64), CORTO = sha("a"), LARGO = sha("b");
const SECRETO = "una-clave-de-prueba-larga", BILLETE = emitir(signer(SECRETO), "abcdefgh2345", today());
const trazoBytes = (n: number, color = 1) => new TextEncoder().encode(JSON.stringify({ schema: TRAZO_SCHEMA, pincel: "tubo", color, grosor: 0.02, puntos: Array.from({ length: n }, (_, i) => [Math.round(i * 0.5) / 1000, 0.001, -0.001, 0.5]) }));
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

test("objetos `cupo`: answers `cabe` while there is room and `rechazado` with the same words as `colocar` when there is not; places nothing", () => {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos()], log: () => {}, puede: (_w, a) => a === "construir",
    activo: (h, e) => e === "trazo" && (h === CORTO || h === LARGO), trazoPuntos: (h) => (h === CORTO ? 10 : h === LARGO ? 600 : null) });
  const tr = inst.join(0), cli = crearCliente(), drawn = new Map<string, unknown>();
  (inst as unknown as { byEntity: { who?: { id: string; nombre: string } }[] }).byEntity[0].who = { id: "ana", nombre: "ana" };
  const s = new ClientSession(tr, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place: (k, o) => { if (o) drawn.set(k, o); else drawn.delete(k); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
  const pump = (n = 6) => { for (let k = 0; k < n; k++) { tr.flush(); inst.tick(); tr.flush(); } };
  const eventos = () => s.features.log.filter((x) => x.feature === "objetos").map((x) => x.event);
  pump(3);
  s.features.send("objetos", "cupo", { puntos: 50 }); pump();
  assert.ok(eventos().includes("cabe"), `eventos: ${eventos().join(",")}`);
  for (let i = 0; i < TRAZOS.porConstructor; i++) { s.features.send("objetos", "colocar", { modelo: CORTO, x: 1, y: 1, z: 1, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "trazo" }); pump(); }
  assert.equal(drawn.size, 40);
  const antes = s.features.stats.events; // the log is a window: count with the event counter, like the page does
  s.features.send("objetos", "cupo", { puntos: 50 }); pump();
  const nuevos = s.features.log.slice(-(s.features.stats.events - antes)).filter((x) => x.feature === "objetos");
  assert.deepEqual(nuevos.map((x) => x.event), ["rechazado"]); assert.match(String(nuevos[0].msg.motivo), /Tienes 40 trazos: borra o deshaz alguno/);
  assert.equal(drawn.size, 40, "asking does not place anything");
});

test("page: a stroke the server says does not fit is not uploaded (no HEAD, no PUT, no colocar); a server that does not answer the question does not block painting", async () => {
  const llamadas: string[] = [], enviados: string[] = [], log: { feature: string; event: string; msg: Record<string, unknown> }[] = [], stats = { events: 0 };
  let modo: "lleno" | "cabe" | "mudo" = "lleno";
  const responder = (event: string, msg: Record<string, unknown>) => setTimeout(() => { stats.events++; log.push({ feature: "objetos", event, msg }); }, 3);
  const session = { features: { log, stats, send(_f: string, intent: string) {
    enviados.push(intent);
    if (intent === "cupo") { if (modo === "lleno") responder("rechazado", { motivo: "Tienes 40 trazos: borra o deshaz alguno." }); else if (modo === "cabe") responder("cabe", { puntos: 5 }); }
    else responder("hecho", { accion: "colocar", id: 1 });
    return { ok: true as const };
  } } };
  const falso = (async (url: string, init?: RequestInit) => { llamadas.push(`${init?.method} ${String(url).slice(-6)}`); return new Response(null, { status: init?.method === "HEAD" ? 404 : 201 }); }) as unknown as typeof fetch;
  const pintar = montarPintar({ session, puede: () => true, origen: "http://m", billete: () => "B", fetch: falso });
  const linea = (y: number) => { pintar.empezar({ color: 0, grosor: 0.01 }); for (let i = 0; i < 40; i++) pintar.punto({ x: i * 0.01, y, z: 0, presion: 0.5 }); };

  linea(1); const r = await pintar.soltar();
  assert.equal(r.ok, false); assert.match((r as { why: string }).why, /Tienes 40 trazos/);
  assert.deepEqual(llamadas, [], "nothing went to /a/"); assert.deepEqual(enviados, ["cupo"], "and no colocar either");
  assert.equal(pintar.estado().rechazados, 1);

  modo = "cabe"; enviados.length = 0; linea(2);
  assert.deepEqual(await pintar.soltar(), { ok: true });
  assert.deepEqual(enviados, ["cupo", "colocar"]); assert.deepEqual(llamadas, ["HEAD .trazo", "PUT .trazo"]);

  modo = "mudo"; enviados.length = 0; llamadas.length = 0; linea(3);
  assert.deepEqual(await pintar.soltar(), { ok: true }, "an older server never answers `cupo`: the page goes on and `colocar` decides");
  assert.deepEqual(enviados, ["cupo", "colocar"]);
});

test("server: an uploaded stroke that is never placed is removed after the wait; a placed one stays; asking for it (HEAD) renews the wait", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "trazos-gc-"));
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, secret: SECRETO, construir: "todos", subidas: dir, features: [crearObjetos()], log: () => {}, subir: { trazoSinColocarMs: 400, barridoTrazosMs: 50 } });
  const url = (h: string) => `http://127.0.0.1:${srv.port}/a/${h}.trazo`;
  const subir = (b: Uint8Array) => fetch(url(hash(b)), { method: "PUT", body: b as unknown as BodyInit, headers: { authorization: `Bearer ${BILLETE}`, "x-nombre-fichero": "trazo.trazo" } });
  try {
    assert.equal(TRAZO_SIN_COLOCAR_MIN, 10);
    const huerfano = trazoBytes(20, 1), colocado = trazoBytes(21, 2), renovado = trazoBytes(22, 3);
    for (const b of [huerfano, colocado, renovado]) assert.equal((await subir(b)).status, 201);
    // place the second one the way the world does (an `objetos` entry of kind «trazo» pointing at it)
    (srv.inst.features as unknown as { allState(): Map<string, unknown> }).allState = () => new Map<string, unknown>([["objetos:1", { tipo: "trazo", modelo: hash(colocado) }]]);
    await esperar(250);
    assert.equal((await fetch(url(hash(renovado)), { method: "HEAD" })).status, 200); // renews the wait of the third
    await esperar(300);                                           // 550 ms since the uploads: the first is past its 400 ms, the third was renewed at ~250
    assert.equal(existsSync(join(dir, `${hash(huerfano)}.trazo`)), false, "never placed: removed");
    assert.equal(existsSync(join(dir, `${hash(colocado)}.trazo`)), true, "placed: stays");
    assert.equal(existsSync(join(dir, `${hash(renovado)}.trazo`)), true, "asked for a moment ago: still waits");
    assert.equal((await fetch(url(hash(huerfano)), { method: "HEAD" })).status, 404);
    await esperar(600);
    assert.equal(existsSync(join(dir, `${hash(renovado)}.trazo`)), false, "and it goes too when nobody places it");
    assert.equal(existsSync(join(dir, `${hash(colocado)}.trazo`)), true, "the placed one never goes");
    assert.equal((await subir(huerfano)).status, 201, "the same stroke can be uploaded again after its file was removed");
    assert.ok(readFileSync(join(dir, `${hash(huerfano)}.trazo`)).length > 0);
  } finally { await srv.close(); }
});
