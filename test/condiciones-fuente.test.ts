// condiciones/w4: the community's norms reach the world by themselves. A local HTTP server plays numinia.com (the JSON of w3,
// community-terms-public@1); the engine pulls it, checks it with C1's reader, writes aventura/condiciones-comunidad.json (the world's own
// copy, file over app) and offers it to whoever arrives next. Network down → the copy; bad JSON → log + copy/house; new version → new offer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { fxToFloat } from "../packages/core/src/index.ts";
import { CONDICIONES_CASA } from "../packages/server/src/condiciones.ts";
import type { Condiciones } from "../packages/server/src/condiciones.ts";
import {
  COPIA_FICHERO, INTERVALO_MIN_MS, INTERVALO_POR_DEFECTO_MS, RESPUESTA_FORMATO, RESPUESTA_MAX, capaDeRespuesta, elegirFuente, fuenteDelFichero, fuenteValida,
  iniciarFuente, intervaloDeEntorno, leerCopia,
} from "../packages/server/src/condiciones-fuente.ts";
import { startServer } from "../packages/server/src/server.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const carpeta = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "fuente-"));
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const punto = (id: string, extra: Record<string, unknown> = {}) => ({ id, titulo: `Titulo ${id}`, texto: `Texto de ${id}`, obligatorio: true, tipo: "norma", ...extra });
/** What numinia.com answers for a community (w3): `current` is a condiciones@1 layer plus when it was published. */
const respuesta = (version: string, puntos = [punto("respeto")], publishedAt = "2026-10-20T10:00:00.000Z", id = "numen-games") => ({
  schema: RESPUESTA_FORMATO, ok: true, communityId: id, page: `/es/communities/${id}/normas/`, numinia: { terms: "/es/legal/terms/", version: "2.0" },
  current: { capa: "comunidad", version, puntos, publishedAt }, history: [{ version, publishedAt }],
});

/** A numinia.com of pocket size: serves what `cuerpo` holds at /api/community-terms. */
async function falsaNuminia() {
  const estado: { cuerpo: unknown; status: number; crudo?: string; cuelga?: boolean; pedidos: string[] } = { cuerpo: respuesta("1"), status: 200, pedidos: [] };
  const srv: Server = createServer((req, res) => {
    estado.pedidos.push(req.url ?? "");
    if (estado.cuelga) return; // never answers
    res.writeHead(estado.status, { "content-type": "application/json" });
    res.end(estado.crudo ?? JSON.stringify(estado.cuerpo));
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const port = (srv.address() as { port: number }).port;
  return {
    estado, url: `http://127.0.0.1:${port}/api/community-terms?comunidad=numen-games`, puerto: port,
    cerrar: () => new Promise<void>((ok) => { srv.closeAllConnections(); srv.close(() => ok()); }),
  };
}

const casa = (): Condiciones => ({ ...CONDICIONES_CASA, capas: [CONDICIONES_CASA.capas[0]] });

// ---------- pure pieces ----------
test("fuenteValida: https always, http only on this machine, no credentials", () => {
  assert.equal(fuenteValida("https://numinia.com/api/community-terms?comunidad=a").ok, true);
  assert.equal(fuenteValida("http://127.0.0.1:8080/x").ok, true);
  assert.equal(fuenteValida("http://localhost/x").ok, true);
  for (const mal of ["http://numinia.com/api", "ftp://numinia.com/x", "numinia.com/api", "", "   ", 7, null, "https://u:p@numinia.com/x"]) assert.equal(fuenteValida(mal).ok, false, String(mal));
});

test("intervaloDeEntorno: default 15 minutes, never under 5", () => {
  assert.equal(intervaloDeEntorno(undefined), INTERVALO_POR_DEFECTO_MS);
  assert.equal(intervaloDeEntorno("nonsense"), INTERVALO_POR_DEFECTO_MS);
  assert.equal(intervaloDeEntorno("0"), INTERVALO_POR_DEFECTO_MS);
  assert.equal(intervaloDeEntorno("1"), INTERVALO_MIN_MS);
  assert.equal(intervaloDeEntorno("30"), 30 * 60_000);
});

test("capaDeRespuesta: w3's answer becomes a comunidad layer; anything else says why not", () => {
  const ok = capaDeRespuesta(respuesta("7"), casa(), "https://numinia.com/api/community-terms?comunidad=numen-games");
  assert.ok(ok.ok && ok.capa); if (ok.ok && ok.capa) { assert.equal(ok.capa.capa, "comunidad"); assert.equal(ok.capa.version, "7"); assert.equal(ok.capa.puntos[0].tipo, "norma"); assert.equal("publishedAt" in ok.capa, false); assert.equal(ok.publicadoEn, "2026-10-20T10:00:00.000Z"); }
  const vacia = capaDeRespuesta({ ...respuesta("1"), current: null, history: [] }, casa());
  assert.ok(vacia.ok && vacia.capa === null, "a community that published nothing is not an error");
  const otra = capaDeRespuesta(respuesta("1", [punto("a")], undefined, "otra"), casa(), "https://numinia.com/api/community-terms?comunidad=numen-games");
  assert.ok(!otra.ok && /otra comunidad/.test(otra.motivo));
  assert.ok(!capaDeRespuesta({ ...respuesta("1"), schema: "otra@9" }, casa()).ok);
  assert.ok(!capaDeRespuesta({ ...respuesta("1"), ok: false }, casa()).ok);
  assert.ok(!capaDeRespuesta("hola", casa()).ok);
  // the law: a data point can never be mandatory, wherever it comes from
  const datosObligatorios = capaDeRespuesta(respuesta("1", [punto("ia", { tipo: "datos", obligatorio: true })]), casa());
  assert.ok(!datosObligatorios.ok && /nunca puede ser obligatorio/.test(datosObligatorios.motivo));
  assert.ok(!capaDeRespuesta(respuesta("1", []), casa()).ok, "no points");
  assert.ok(!capaDeRespuesta({ ...respuesta("1"), current: { ...respuesta("1").current, capa: "casa" } }, casa()).ok, "only the comunidad layer");
});

test("fuenteDelFichero / elegirFuente: the file says it, the option wins, «no» switches it off", () => {
  const d = carpeta(), log: string[] = [];
  assert.deepEqual(fuenteDelFichero(d), {}); assert.deepEqual(fuenteDelFichero(null), {});
  writeFileSync(join(d, "condiciones.json"), JSON.stringify({ formato: "condiciones@1", comunidad: { fuente: "https://numinia.com/api/community-terms?comunidad=x" }, capas: [] }));
  assert.equal(fuenteDelFichero(d).fuente, "https://numinia.com/api/community-terms?comunidad=x");
  assert.equal(elegirFuente(undefined, d, (l) => log.push(l)), "https://numinia.com/api/community-terms?comunidad=x");
  assert.equal(elegirFuente("https://otra.example/x", d, (l) => log.push(l)), "https://otra.example/x");
  assert.equal(elegirFuente("no", d, (l) => log.push(l)), undefined);
  writeFileSync(join(d, "condiciones.json"), JSON.stringify({ comunidad: "mal" }));
  assert.ok(fuenteDelFichero(d).problema);
  writeFileSync(join(d, "condiciones.json"), "{roto");
  assert.deepEqual(fuenteDelFichero(d), {});
});

// ---------- the puller ----------
test("iniciarFuente: downloads, writes the copy, hands over the layer; same text = nothing new; new version = new", async () => {
  const n = await falsaNuminia(), d = carpeta(), log: string[] = [], puestas: { c: Condiciones; m: string }[] = [];
  try {
    const f = iniciarFuente({ dir: d, base: casa(), fuente: n.url, log: (l) => log.push(l), poner: (c, m) => puestas.push({ c, m }), intervaloMs: 3_600_000 });
    assert.equal(f.activa, true); assert.equal(f.conCopia, false); assert.equal(puestas.length, 0, "nothing before the first answer");
    assert.equal(await f.actualizar(), "nueva");
    assert.deepEqual(puestas[0].c.capas.map((c) => `${c.capa}:${c.version}`), ["casa:ejemplo-1", "comunidad:1"]);
    assert.equal(puestas[0].m, "nueva");
    const copia = JSON.parse(readFileSync(join(d, COPIA_FICHERO), "utf8"));
    assert.equal(copia.formato, "condiciones-comunidad@1"); assert.equal(copia.fuente, n.url); assert.equal(copia.capa.version, "1"); assert.equal(copia.publicadoEn, "2026-10-20T10:00:00.000Z");
    assert.ok(log.some((l) => l.includes("normas de la comunidad 1 (1 puntos)")));
    assert.equal(await f.actualizar(), "igual"); assert.equal(puestas.length, 1, "the same text is not handed over again");
    n.estado.cuerpo = respuesta("2", [punto("respeto"), punto("ia", { obligatorio: false, tipo: "datos" })], "2026-10-21T10:00:00.000Z");
    assert.equal(await f.actualizar(), "nueva");
    assert.equal(puestas.length, 2); assert.equal(puestas[1].c.capas[1].version, "2"); assert.equal(puestas[1].c.capas[1].puntos.length, 2);
    assert.equal(JSON.parse(readFileSync(join(d, COPIA_FICHERO), "utf8")).capa.version, "2");
    assert.ok(log.some((l) => l.includes("1 → 2")));
    assert.equal(existsSync(join(d, COPIA_FICHERO + ".tmp-" + process.pid)), false, "no temp file left");
    f.parar();
  } finally { await n.cerrar(); }
});

test("iniciarFuente: network down → the copy; no copy → only the house; the world never throws", async () => {
  const n = await falsaNuminia(), d = carpeta(), log: string[] = [];
  const puestas: Condiciones[] = [];
  const f1 = iniciarFuente({ dir: d, base: casa(), fuente: n.url, log: (l) => log.push(l), poner: (c) => puestas.push(c), intervaloMs: 3_600_000 });
  assert.equal(await f1.actualizar(), "nueva"); f1.parar();
  await n.cerrar(); // numinia.com falls
  // a restart: the copy is in force at once, before any answer
  const puestas2: { c: Condiciones; m: string }[] = [];
  const f2 = iniciarFuente({ dir: d, base: casa(), fuente: n.url, log: (l) => log.push(l), poner: (c, m) => puestas2.push({ c, m }), intervaloMs: 3_600_000 });
  assert.equal(f2.conCopia, true); assert.equal(puestas2.length, 1); assert.equal(puestas2[0].m, "copia"); assert.equal(puestas2[0].c.capas[1].version, "1");
  assert.equal(await f2.actualizar(), "fallo"); assert.equal(puestas2.length, 1, "a failed download changes nothing");
  assert.ok(log.some((l) => l.includes("no he podido leer la fuente") && l.includes("sigue la 1 de la copia")));
  f2.parar();
  // no copy, no network: the house alone (nothing handed over)
  const sinCopia: Condiciones[] = [];
  const f3 = iniciarFuente({ dir: carpeta(), base: casa(), fuente: n.url, log: (l) => log.push(l), poner: (c) => sinCopia.push(c), intervaloMs: 3_600_000 });
  assert.equal(f3.conCopia, false); assert.equal(await f3.actualizar(), "fallo"); assert.equal(sinCopia.length, 0);
  assert.ok(log.some((l) => l.includes("sigue la casa")));
  f3.parar();
});

test("iniciarFuente: a copy of another source, a broken copy and an invalid source are not used", async () => {
  const n = await falsaNuminia(), d = carpeta(), log: string[] = [], puestas: Condiciones[] = [];
  try {
    const f1 = iniciarFuente({ dir: d, base: casa(), fuente: n.url, log: (l) => log.push(l), poner: () => {}, intervaloMs: 3_600_000 });
    await f1.actualizar(); f1.parar();
    // same folder, another community: the copy is not ours
    const otra = n.url.replace("numen-games", "otra");
    const f2 = iniciarFuente({ dir: d, base: casa(), fuente: otra, log: (l) => log.push(l), poner: (c) => puestas.push(c), intervaloMs: 3_600_000 });
    assert.equal(f2.conCopia, false); assert.equal(puestas.length, 0); assert.ok(log.some((l) => l.includes("es de otra fuente"))); f2.parar();
    // a broken copy
    writeFileSync(join(d, COPIA_FICHERO), "{roto");
    assert.equal(leerCopia(d, casa(), n.url).copia, null); assert.match(leerCopia(d, casa(), n.url).problema ?? "", /JSON roto/);
    // a copy that breaks the law is not used either
    writeFileSync(join(d, COPIA_FICHERO), JSON.stringify({ formato: "condiciones-comunidad@1", fuente: n.url, capa: { capa: "comunidad", version: "9", puntos: [punto("ia", { tipo: "datos" })] } }));
    assert.equal(leerCopia(d, casa(), n.url).copia, null);
    // invalid sources do nothing and say so
    for (const mala of ["http://numinia.com/api/community-terms?comunidad=x", "no es una url", ""]) {
      const f = iniciarFuente({ dir: d, base: casa(), fuente: mala, log: (l) => log.push(l), poner: (c) => puestas.push(c) });
      assert.equal(f.activa, false); assert.equal(await f.actualizar(), "fallo");
    }
    assert.ok(log.some((l) => l.includes("fuente de la comunidad no válida")));
    // none at all: inert, silent
    assert.equal(iniciarFuente({ dir: d, base: casa(), poner: () => {} }).activa, false);
  } finally { await n.cerrar(); }
});

test("iniciarFuente: bad JSON, HTTP errors, a wrong community, an old publication, a huge or hanging answer — said in the log, nothing changes", async () => {
  const n = await falsaNuminia(), d = carpeta(), log: string[] = [], puestas: Condiciones[] = [];
  try {
    const f = iniciarFuente({ dir: d, base: casa(), fuente: n.url, log: (l) => log.push(l), poner: (c) => puestas.push(c), intervaloMs: 3_600_000 });
    assert.equal(await f.actualizar(), "nueva"); assert.equal(puestas.length, 1);
    const antes = readFileSync(join(d, COPIA_FICHERO), "utf8");
    n.estado.crudo = "{esto no es json"; assert.equal(await f.actualizar(), "fallo");
    n.estado.crudo = undefined; n.estado.status = 500; assert.equal(await f.actualizar(), "fallo"); assert.ok(log.some((l) => l.includes("HTTP 500")));
    n.estado.status = 404; assert.equal(await f.actualizar(), "fallo");
    n.estado.status = 200; n.estado.cuerpo = respuesta("3", [punto("a")], undefined, "otra"); assert.equal(await f.actualizar(), "fallo"); assert.ok(log.some((l) => l.includes("otra comunidad")));
    n.estado.cuerpo = respuesta("3", [punto("ia", { tipo: "datos", obligatorio: true })]); assert.equal(await f.actualizar(), "fallo"); assert.ok(log.some((l) => l.includes("nunca puede ser obligatorio")));
    n.estado.cuerpo = respuesta("0", [punto("a")], "2026-10-01T00:00:00.000Z"); assert.equal(await f.actualizar(), "igual"); assert.ok(log.some((l) => l.includes("más vieja")));
    n.estado.cuerpo = { ...respuesta("1"), current: null, history: [] }; assert.equal(await f.actualizar(), "vacia");
    n.estado.cuerpo = respuesta("big", [punto("a", { texto: "x".repeat(RESPUESTA_MAX) })]); assert.equal(await f.actualizar(), "fallo"); assert.ok(log.some((l) => /pesa/.test(l)));
    n.estado.cuerpo = respuesta("1"); n.estado.cuelga = true; assert.equal(await f.actualizar(150), "fallo"); // time-out
    assert.equal(readFileSync(join(d, COPIA_FICHERO), "utf8"), antes, "the copy was never touched");
    assert.equal(puestas.length, 1);
    f.parar();
  } finally { await n.cerrar(); }
});

test("iniciarFuente: it asks again by itself every interval until stopped", async () => {
  const n = await falsaNuminia(), puestas: Condiciones[] = [];
  try {
    const f = iniciarFuente({ dir: carpeta(), base: casa(), fuente: n.url, poner: (c) => puestas.push(c), intervaloMs: 40 });
    await sleep(150);
    assert.ok(n.estado.pedidos.length >= 2, `asked ${n.estado.pedidos.length} times`); assert.equal(puestas.length, 1);
    n.estado.cuerpo = respuesta("2"); await sleep(150); assert.equal(puestas.length, 2);
    f.parar(); const k = n.estado.pedidos.length; await sleep(120); assert.equal(n.estado.pedidos.length, k, "stopped");
  } finally { await n.cerrar(); }
});

// ---------- the server, over a real WebSocket ----------
test("server: the community's norms arrive, are copied into the world, change for the next arrival, and survive numinia.com falling", async () => {
  const n = await falsaNuminia(), logs: string[] = [];
  const d = carpeta();
  writeFileSync(join(d, "condiciones.json"), JSON.stringify({
    formato: "condiciones@1", puerta: true, comunidad: { fuente: n.url },
    capas: [{ capa: "casa", nombre: "La casa", version: "c1", puntos: [punto("uso", { titulo: "Uso" })] }],
  }));
  const abrir = (o: { condicionesFuente?: string; condicionesFuenteMs?: number } = {}) => startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", aventura: d, ...o });
  const espera = async (f: () => boolean) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < 5000) await sleep(10); return f(); };
  const llegar = async (srv: Awaited<ReturnType<typeof abrir>>) => {
    const t = webSocketClient(`ws://127.0.0.1:${srv.port}/ws`), s = new ClientSession(t, { identity: keeper() });
    await t.opened; assert.ok(await espera(() => s.who !== null && s.condiciones?.capas !== undefined), "identified and offered");
    return { t, s };
  };
  const capas = (c: { s: ClientSession }) => c.s.condiciones!.capas!.map((x) => `${x.capa}:${x.version}`);
  const andar = async (c: { s: ClientSession }, srv: Awaited<ReturnType<typeof abrir>>) => {
    const x0 = fxToFloat(srv.inst.sim.tf.cols.x[c.s.entity]);
    for (let k = 0; k < 20; k++) { c.s.tick(127, 0); await sleep(55); }
    return fxToFloat(srv.inst.sim.tf.cols.x[c.s.entity]) - x0;
  };

  // 1) first start: no copy, so listening waits for the first answer; the file's `comunidad.fuente` is enough
  const srv = await abrir({ condicionesFuenteMs: 60 });
  let viejo: Awaited<ReturnType<typeof llegar>> | null = null;
  try {
    assert.ok(existsSync(join(d, COPIA_FICHERO)), "the copy was written before the first person could arrive");
    assert.ok(logs.some((l) => l.includes("normas de la comunidad 1")));
    const a = await llegar(srv);
    assert.deepEqual(capas(a), ["casa:c1", "comunidad:1"]);
    assert.equal(a.s.condiciones!.abierta, false);
    assert.ok(await andar(a, srv) < 0.01, "held until it accepts");
    // a reads the first text, and while it is inside the bubble the community publishes version 2
    n.estado.cuerpo = respuesta("2", [punto("respeto"), punto("nuevo")], "2026-10-21T09:00:00.000Z");
    assert.ok(await espera(() => capas(a).includes("comunidad:2")), "the bubble is offered the new text again");
    assert.equal(a.s.condiciones!.capas![1].puntos.length, 2);
    // it accepts the new one and walks
    assert.ok(a.s.aceptar({ casa: "c1", comunidad: "2" }, []));
    assert.ok(await espera(() => a.s.condiciones!.abierta === true));
    assert.ok(await andar(a, srv) > 1, "walks after accepting the new text");
    // version 3 is published: whoever is inside keeps walking; the one who arrives next is offered it
    n.estado.cuerpo = respuesta("3", [punto("respeto")], "2026-10-22T09:00:00.000Z");
    assert.ok(await espera(() => logs.some((l) => l.includes("2 → 3"))));
    assert.ok(await andar(a, srv) > 1, "already inside: not held again");
    viejo = a;
    const b = await llegar(srv);
    assert.deepEqual(capas(b), ["casa:c1", "comunidad:3"]); assert.equal(b.s.condiciones!.abierta, false);
    assert.ok(b.s.aceptar({ casa: "c1", comunidad: "3" }, [])); assert.ok(await espera(() => b.s.condiciones!.abierta === true));
    b.t.close();
    // the copy in the folder is the newest, and a person can read it
    assert.equal(JSON.parse(readFileSync(join(d, COPIA_FICHERO), "utf8")).capa.version, "3");
    // the house does not change: the casa layer still comes from the file
    assert.equal(a.s.condiciones!.capas![0].nombre, "La casa");
  } finally { viejo?.t.close(); await srv.close(); }

  // 2) numinia.com is down: the world starts with the copy and works
  await n.cerrar();
  logs.length = 0;
  const t0 = Date.now();
  const sinRed = await abrir();
  try {
    assert.ok(Date.now() - t0 < 4000, "does not wait for a dead network");
    assert.ok(logs.some((l) => l.includes("comunidad 3 de la copia del mundo")));
    const c = await llegar(sinRed);
    assert.deepEqual(capas(c), ["casa:c1", "comunidad:3"]);
    c.t.close();
  } finally { await sinRed.close(); }

  // 3) the operator switches it off: only the file's own layers, the copy is not used
  const apagado = await abrir({ condicionesFuente: "no" });
  try {
    const c = await llegar(apagado);
    assert.deepEqual(capas(c), ["casa:c1"]); c.t.close();
  } finally { await apagado.close(); }
});

test("server: no source = nothing changes; no copy and no network = the file/house layers, and the server starts", async () => {
  const logs: string[] = [], d = carpeta();
  writeFileSync(join(d, "condiciones.json"), JSON.stringify({ formato: "condiciones@1", puerta: true, capas: [{ capa: "casa", version: "c1", puntos: [punto("uso")] }] }));
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", aventura: d });
  try {
    assert.equal(logs.some((l) => l.includes("comunidad")), false, "silent without a source");
    assert.equal(existsSync(join(d, COPIA_FICHERO)), false);
  } finally { await srv.close(); }
  const sin = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60000, log: (l) => logs.push(l), secret: "una-clave-de-prueba-larga", aventura: d, condicionesFuente: "http://127.0.0.1:1/api/community-terms?comunidad=x" });
  try {
    assert.ok(logs.some((l) => l.includes("no he podido leer la fuente") && l.includes("sigue la casa")));
    assert.equal(existsSync(join(d, COPIA_FICHERO)), false);
  } finally { await sin.close(); }
});
