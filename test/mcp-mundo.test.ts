// ADR-080 (M26 first slice): the MCP bridge of an outside agent, end to end — a real server on a free port, the
// key made by tools/agente.ts, the bridge spawned as a child process (stdin/stdout pipes, JSON-RPC lines), and the
// world's objetos state checked on the server: place → move (merging scale) → delete; then the owner removes the agent
// from the world's chat and the bridge is closed with 4003 for good. No model anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../packages/server/src/server.ts";
import { webSocketClient } from "../packages/net/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { comprobar, ServidorMcp } from "../packages/agent/src/mcp.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import { crearObjetos } from "../features/objetos/server.ts";

const ADMIN = "codigo-de-administracion-largo";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

test("MCP by hand: initialize echoes a version it speaks, tools/list, ping, unknown method and tool, bad arguments as isError", async () => {
  const mcp = new ServidorMcp({ nombre: "prueba", version: "0", herramientas: () => [{ name: "eco", description: "eco", inputSchema: { type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 3 } }, required: ["n"], additionalProperties: false }, ejecutar: (a) => `n=${a.n}` }] });
  const r = (m: unknown) => mcp.atender(m) as Promise<Record<string, any>>;
  assert.equal((await r({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).result.protocolVersion, "2025-03-26");
  assert.equal((await r({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } })).result.protocolVersion, "2025-06-18");
  assert.equal(await mcp.atender({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.deepEqual((await r({ jsonrpc: "2.0", id: 2, method: "ping" })).result, {});
  assert.equal((await r({ jsonrpc: "2.0", id: 3, method: "nada" })).error.code, -32601);
  assert.equal((await r({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "otra" } })).error.code, -32602);
  assert.deepEqual((await r({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "eco", arguments: { n: 2 } } })).result, { content: [{ type: "text", text: "n=2" }] });
  const mal = (await r({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "eco", arguments: { n: 9 } } })).result;
  assert.equal(mal.isError, true);
  assert.match(mal.content[0].text, /va hasta 3/);
  assert.match(comprobar({ type: "object", properties: {}, additionalProperties: false }, { x: 1 }) ?? "", /no es un argumento/);
});

test("the bridge over a real world: key from tools/agente.ts, initialize → tools/list → mirar → colocar → mover → borrar on the server's state; /agente quitar closes it with 4003 for good", { timeout: 60_000 }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "mcp-mundo-")), claves = join(raiz, "claves"), aventura = join(raiz, "aventura");
  // 1. the key, where the agent lives
  const nuevo = spawnSync(process.execPath, ["tools/agente.ts", "nuevo", "hermes", "--carpeta", claves, "--nombre", "Hermes"], { encoding: "utf8" });
  assert.equal(nuevo.status, 0, nuevo.stderr);
  const publica = /Clave pública: (ed25519:\S+)/.exec(nuevo.stdout)![1];
  assert.match(nuevo.stdout, new RegExp(`/agente añadir hermes Hermes ${publica}`));
  assert.equal(statSync(join(claves, "hermes.clave")).mode & 0o777, 0o600);
  assert.notEqual(spawnSync(process.execPath, ["tools/agente.ts", "nuevo", "hermes", "--carpeta", claves], { encoding: "utf8" }).status, 0, "never overwrites a key");
  // 2. the world lists it (the order does the same: test/puerta.test.ts); a role that builds
  mkdirSync(join(aventura, "agentes"), { recursive: true });
  writeFileSync(join(aventura, "agentes", "hermes.json"), JSON.stringify({ formato: "agente@1", id: "hermes", nombre: "Hermes", responsable: "Pablo", clave: publica, rol: "administracion" }));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, features: [chatServer, crearObjetos()], aventura, admin: ADMIN, secret: "una-clave-de-prueba-larga", log: (l) => log.push(l), version: "prueba" });
  const url = `ws://127.0.0.1:${srv.port}/ws`;
  // 3. the bridge, as Hermes would start it
  const hijo = spawn(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...process.env, MUNDO_URL: url, AGENTE_ID: "hermes", AGENTE_CLAVE: join(claves, "hermes.clave") }, stdio: ["pipe", "pipe", "pipe"] });
  let errores = "", resto = "", n = 0;
  const pendientes = new Map<number, (r: Record<string, any>) => void>();
  hijo.stderr.setEncoding("utf8").on("data", (t: string) => { errores += t; });
  hijo.stdout.setEncoding("utf8").on("data", (t: string) => {
    resto += t;
    for (let i; (i = resto.indexOf("\n")) >= 0;) { const m = JSON.parse(resto.slice(0, i)); resto = resto.slice(i + 1); pendientes.get(m.id)?.(m); pendientes.delete(m.id); }
  });
  const pedir = (method: string, params?: unknown) => new Promise<Record<string, any>>((ok) => { const id = ++n; pendientes.set(id, ok); hijo.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const usar = async (name: string, args: Record<string, unknown> = {}) => { const r = (await pedir("tools/call", { name, arguments: args })).result; return { texto: String(r.content[0].text), error: r.isError === true }; };
  const objetos = () => new Map([...srv.inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).map(([k, v]) => [k.slice(8), v]));
  const r2 = (v: unknown) => Math.round(Number(v) * 100) / 100;
  try {
    const ini = await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "prueba", version: "0" } });
    assert.equal(ini.result.protocolVersion, "2025-06-18");
    assert.deepEqual(ini.result.capabilities, { tools: {} });
    hijo.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const lista = await pedir("tools/list");
    assert.deepEqual(lista.result.tools.map((t: { name: string }) => t.name), ["mirar", "decir", "ir_a", "colocar", "mover", "borrar", "deshacer", "oir"]);
    let mira = await usar("mirar");
    for (let i = 0; i < 5 && mira.error; i++) { await espera(500); mira = await usar("mirar"); } // still connecting
    assert.equal(mira.error, false, `${mira.texto}\n${errores}`);
    assert.match(mira.texto, /Eres «Hermes · IA»/);
    assert.match(mira.texto, /Construir: sí/);
    assert.match(mira.texto, /bloque \(cubo/);
    assert.match(mira.texto, /<material fiable="no">[\s\S]*<\/material>/);
    const yo = srv.inst.conns.find((c) => c.who?.id === "ia-hermes")!;
    assert.ok(yo, "the server knows it as ia-hermes");
    const x0 = srv.inst.sim.tf.cols.x[yo.entity] / 65536, z0 = srv.inst.sim.tf.cols.z[yo.entity] / 65536;
    // place with a scale (colocar, then mover: like the gizmo), move only x (scale kept), delete
    const puesto = await usar("colocar", { modelo: "bloque", x: Math.round(x0) + 2, z: Math.round(z0), escala: 2, nombre: "mesa" });
    assert.equal(puesto.error, false, puesto.texto);
    const id = /objeto (o[0-9a-z]+)/.exec(puesto.texto)![1];
    let v = objetos().get(id)!;
    assert.deepEqual([r2(v.x), r2(v.sx), r2(v.sy), r2(v.sz), v.nombre], [Math.round(x0) + 2, 2, 2, 2, "mesa"]);
    const movido = await usar("mover", { id, x: Math.round(x0) + 3, giro: 45 });
    assert.equal(movido.error, false, movido.texto);
    v = objetos().get(id)!;
    assert.deepEqual([r2(v.x), r2(v.ry), r2(v.sx), r2(v.sz)], [Math.round(x0) + 3, 45, 2, 2], "mover merges: the scale stays");
    assert.equal((await usar("colocar", { modelo: "bloque", x: x0 + 100, z: z0 })).error, true, "farther than 40 m");
    assert.match((await usar("colocar", { modelo: "nave", x: x0, z: z0 })).texto, /uno de: bloque, farolillo, baculo, robot/);
    assert.equal((await pedir("tools/call", { name: "volar" })).error.code, -32602);
    const borrado = await usar("borrar", { id });
    assert.equal(borrado.error, false, borrado.texto);
    assert.equal(objetos().has(id), false);
    assert.deepEqual((await pedir("ping")).result, {});
    // 4. the owner removes it from inside the world: told (oir), closed with 4003, and it stays out
    const t = webSocketClient(url), chat = crearCliente();
    const s = new ClientSession(t, { features: [chat.part], identity: keeper(), view: { label() {}, bounce() {} } });
    await t.opened;
    for (let i = 0; i < 40 && !s.who; i++) await espera(50);
    assert.deepEqual(chat.chat.decir(`/dueño ${ADMIN}`), { ok: true }); await espera(1200);
    assert.deepEqual(chat.chat.decir("/agente quitar hermes"), { ok: true });
    let oido = await usar("oir", { desde: 0 });
    for (let i = 0; i < 30 && !/4003/.test(oido.texto); i++) { await espera(100); oido = await usar("oir", { desde: 0 }); }
    assert.match(oido.texto, /ya no deja entrar a este agente/);
    assert.match(oido.texto, /código 4003/);
    assert.match((await usar("mirar")).texto, /No estoy en el mundo: el mundo me ha sacado/);
    await espera(1500);
    assert.equal(srv.inst.conns.some((c) => c.who?.id === "ia-hermes"), false, "it does not come back");
    assert.ok(!log.some((l) => /a2\.hermes\./.test(l)), "no ticket in the server's log");
    assert.ok(!/a2\.hermes\./.test(errores), "nor in the bridge's");
    t.close();
  } finally {
    hijo.stdin.end();
    await new Promise((r) => hijo.once("exit", r));
    await srv.close();
  }
});
