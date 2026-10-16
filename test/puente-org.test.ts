// ia-organizacion, end to end without the real numinia.com: a FAKE numinia.com (node:http) that checks the agent's request
// (POST /api/agents/pass, Ed25519 over `numinia-agent-pass:<org>:<agent>:<aud>:<t>`) and signs passes with a test key; a real
// engine server that trusts that key; the real bridge (PuenteMundo in organization mode) over a real WebSocket. Short passes
// (3 s) so the renewals happen within the test: activa → dormida (no building, speaks only if called) → apagada (leaves).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../packages/server/src/server.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import { PuenteMundo } from "../packages/agent/src/mcp-mundo.ts";
import { mensajePase, pedirPaseHttp, estadoDelPase } from "../packages/agent/src/pase-org.ts";
import { clavePrivada, nuevaPareja } from "../packages/agent/src/llave.ts";
import { ErrorHerramienta } from "../packages/agent/src/mcp.ts";
import chatServer from "../features/chat/server.ts";
import { crearObjetos } from "../features/objetos/server.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MUNDO = "agora-plaza", ORG = "org-1", AGENTE = "ada", VIDA_S = 3;
const llaveNuminia = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(llaveNuminia.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const SUB = `a_${"0f".repeat(16)}`;

type Falso = { url: string; llamadas: { aud: string; t: number }[]; estado: "activa" | "dormida"; encendida: boolean; caido: boolean; cerrar(): Promise<void> };
/** A fake numinia.com: knows one agent (its public key), signs 3-second passes. */
async function numiniaFalso(publica: string): Promise<Falso> {
  const f: Falso = { url: "", llamadas: [], estado: "activa", encendida: true, caido: false, cerrar: async () => {} };
  const claveAgente = (await import("../packages/agent/src/llave.ts")).clavePublica(publica)!;
  const srv: Server = createServer((req, res) => {
    const responder = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    let txt = ""; req.setEncoding("utf8"); req.on("data", (c: string) => { txt += c; });
    req.on("end", () => {
      if (req.method !== "POST" || req.url !== "/api/agents/pass") return responder(404, { error: "ruta", texto: "no existe" });
      if (f.caido) return responder(503, { error: "caido", texto: "numinia.com no está disponible" });
      let b: Record<string, unknown>; try { b = JSON.parse(txt); } catch { return responder(400, { error: "json", texto: "no es JSON" }); }
      const { org, agent, aud, t, sig } = b as { org: string; agent: string; aud: string; t: number; sig: string };
      if (org !== ORG || agent !== AGENTE) return responder(404, { error: "no-existe", texto: "Esa IA no existe en la organización." });
      if (typeof t !== "number" || Math.abs(Date.now() / 1000 - t) > 60) return responder(401, { error: "hora", texto: "Tu reloj va desfasado." });
      if (!verify(null, Buffer.from(mensajePase(org, agent, aud, t), "ascii"), claveAgente, Buffer.from(String(sig), "base64url"))) return responder(401, { error: "firma", texto: "La firma no es de esta IA." });
      if (aud !== MUNDO) return responder(403, { error: "mundo", texto: "Ese mundo no es de la organización." });
      if (!f.encendida) return responder(403, { error: "apagada", texto: "Esta IA está apagada en la organización." });
      f.llamadas.push({ aud, t });
      const s = Math.floor(Date.now() / 1000);
      const perm = f.estado === "dormida" ? ["enter-worlds"] : ["enter-worlds", "build-in-worlds"];
      const payload = { v: 1, iss: "numinia.com", aud, sub: SUB, org: ORG, perm, height: 0, roles: [{ name: "Constructora", color: "#112233" }], name: "Ada", kind: "agent", state: f.estado, iat: s, exp: s + VIDA_S };
      const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
      responder(200, { pass: `${firmado}.${b64(sign(null, Buffer.from(firmado), llaveNuminia.privateKey))}`, exp: s + VIDA_S });
    });
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  f.url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  f.cerrar = () => new Promise<void>((ok) => { srv.close(() => ok()); srv.closeAllConnections(); });
  return f;
}

/** A person's pass (a manager), to ask the world's GET /agentes. */
function paseGestor(): string {
  const t = Math.floor(Date.now() / 1000);
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify({ v: 1, iss: "numinia.com", aud: MUNDO, sub: `p_${"1".repeat(32)}`, org: ORG, perm: ["enter-worlds", "manage-organization"], height: 1, roles: [], iat: t, exp: t + 60 }))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), llaveNuminia.privateKey))}`;
}

async function montar(o: { mundo?: boolean } = {}) {
  const par = nuevaPareja(), privada = clavePrivada(par.privadaPem);
  const falso = await numiniaFalso(par.publica);
  const log: string[] = [], lineasPuente: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, features: [chatServer, crearObjetos()], admin: "codigo-de-administracion-largo", secret: "una-clave-de-prueba-larga", pase: { clave: CLAVE, mundo: MUNDO, org: ORG }, log: (l) => log.push(l), version: "prueba" });
  const biblioteca = (JSON.parse(readFileSync("features/objetos/biblioteca.json", "utf8")) as { modelos: { id: string; nombre: string; modelo: string }[] }).modelos.map(({ id, nombre, modelo }) => ({ id, nombre, modelo }));
  const puente = new PuenteMundo({
    url: `ws://127.0.0.1:${srv.port}/ws`, id: AGENTE, privada, biblioteca, log: (l) => lineasPuente.push(l),
    pedirPase: pedirPaseHttp({ numiniaUrl: falso.url, org: ORG, agente: AGENTE, privada }), ...(o.mundo ? { mundo: MUNDO } : {}),
  });
  const herr = (n: string) => puente.herramientas().find((h) => h.name === n)!;
  const usar = async (n: string, a: Record<string, unknown> = {}): Promise<{ texto: string; error: boolean }> => {
    try { return { texto: String(await herr(n).ejecutar(a)), error: false }; } catch (e) { assert.ok(e instanceof ErrorHerramienta, String(e)); return { texto: (e as Error).message, error: true }; }
  };
  const hasta = async (cond: () => boolean | Promise<boolean>, ms = 8000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await cond()) return true; await espera(100); } return false; };
  const cerrar = async () => { puente.parar(); await srv.close(); await falso.cerrar(); };
  return { srv, falso, puente, usar, hasta, log, lineasPuente, cerrar };
}

test("bridge in organization mode: pass from the (fake) numinia.com, enters as «Ada · IA», renews, goes to sleep, is switched off", { timeout: 60_000 }, async () => {
  const W = await montar(); // no AGENTE_MUNDO: the world id is read from the world's /status (mundoPase)
  try {
    W.puente.arrancar();
    assert.ok(await W.hasta(() => !!W.puente.cuerpo?.nombre && W.puente.puedeConstruir), `no entró: ${W.lineasPuente.join(" | ")}`);
    assert.equal(W.puente.cuerpo!.nombre, "Ada · IA");
    assert.equal(W.falso.llamadas[0].aud, MUNDO, "asked for the world's id from /status");
    const yo = W.srv.inst.conns.find((c) => c.who?.id === `ia-${SUB}`);
    assert.ok(yo, "the server knows it by its pass's sub");
    let mira = await W.usar("mirar");
    assert.match(mira.texto, /Estado: activa/);
    assert.match(mira.texto, /Construir: sí/);
    const puesto = await W.usar("colocar", { modelo: "bloque", x: 1, z: 1 });
    assert.equal(puesto.error, false, puesto.texto);
    const cuantos = () => [...W.srv.inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).length;
    const crudo = { modelo: W.puente.biblioteca.find((m) => m.id === "bloque")!.modelo, x: 2, y: 0, z: 2, ry: 0, nombre: "", decorado: true };
    const n0 = cuantos();
    W.puente.cuerpo!.hacer("objetos", "colocar", crudo);
    assert.ok(await W.hasta(() => cuantos() === n0 + 1, 2000), "positive control: awake, a raw build intent works");
    const lista = await (await fetch(`http://127.0.0.1:${W.srv.port}/agentes`, { headers: { authorization: `Bearer ${paseGestor()}` } })).json() as { agentes: Record<string, unknown>[] };
    assert.deepEqual(lista.agentes, [{ id: SUB, nombre: "Ada", rol: "Constructora", permisos: ["build-in-worlds", "enter-worlds"], presente: true, organizacion: true, estado: "activa" }], "GET /agentes lists the connected organization AI");
    // numinia.com puts it to sleep: the next renewal (≤ 3 s) brings a pass without build-in-worlds
    W.falso.estado = "dormida";
    assert.ok(await W.hasta(() => W.puente.dormida), "renewed as dormida");
    assert.ok(W.falso.llamadas.length >= 2);
    assert.equal(W.puente.conectado, true, "the renewal kept the connection (no 4003 at the first pass's end)");
    mira = await W.usar("mirar");
    assert.match(mira.texto, /Estado: dormida/);
    assert.match(mira.texto, /Construir: no \(estás dormida\)/);
    for (const [n, a] of [["colocar", { modelo: "bloque", x: 1, z: 1 }], ["mover", { id: "x", x: 2 }], ["borrar", { id: "x" }]] as const) {
      const r = await W.usar(n, a);
      assert.equal(r.error, true); assert.match(r.texto, /Estoy dormida/, n);
    }
    assert.match((await W.usar("decir", { texto: "hola" })).texto, /solo hablo si me llaman por mi nombre/);
    (W.puente as unknown as { oir(n: string, t: string, c: string): void }).oir("Lía", "¿Estás por ahí, ADA?", "cerca");
    assert.equal((await W.usar("decir", { texto: "aquí estoy" })).error, false, "called by its name (any case, with accents folded): may answer");
    // the SERVER enforces it too, not only the tool: a raw build intent from this very body is refused
    const antes = cuantos();
    W.puente.cuerpo!.hacer("objetos", "colocar", crudo);
    await espera(400);
    assert.equal(cuantos(), antes, "asleep: the server refuses the build (pass without build-in-worlds)");
    // woken again, then switched off: the bridge leaves and says so on stderr
    W.falso.estado = "activa";
    assert.ok(await W.hasta(() => !W.puente.dormida), "renewed as activa");
    W.falso.encendida = false;
    assert.ok(await W.hasta(() => W.puente.final !== null), "switched off: final");
    assert.match(W.puente.final!, /apagado/);
    assert.ok(W.lineasPuente.some((l) => /me ha apagado/.test(l)), "says it on its log (stderr)");
    assert.ok(await W.hasta(() => !W.srv.inst.conns.some((c) => c.who?.id === `ia-${SUB}`)), "and it is out of the world");
    assert.match((await W.usar("mirar")).texto, /No estoy en el mundo/);
  } finally { await W.cerrar(); }
});

test("bridge in organization mode: numinia.com stops answering → the world closes the AI when its pass ends (≤ 3 s), nothing keeps it in", { timeout: 60_000 }, async () => {
  const W = await montar({ mundo: true });
  try {
    W.puente.arrancar();
    assert.ok(await W.hasta(() => !!W.puente.cuerpo?.nombre), "entered");
    W.falso.caido = true;
    assert.ok(await W.hasta(() => !W.srv.inst.conns.some((c) => c.who?.id === `ia-${SUB}`), VIDA_S * 1000 + 2500), "closed by the world at the pass's end");
    assert.ok(W.log.some((l) => l.includes("caducó sin renovar")), "the world says why");
    assert.ok(await W.hasta(() => W.lineasPuente.some((l) => /no me da pase|cerró la conexión/.test(l)), 3000));
    assert.equal(W.puente.final, null, "an expired pass is not final: it will try again");
  } finally { await W.cerrar(); }
});

test("pedirPaseHttp: answers are mapped (apagada, rechazado, red); the request is signed over the ASCII line; garbage never throws", async () => {
  const par = nuevaPareja(), privada = clavePrivada(par.privadaPem), falso = await numiniaFalso(par.publica);
  try {
    const bien = await pedirPaseHttp({ numiniaUrl: falso.url + "/", org: ORG, agente: AGENTE, privada })(MUNDO);
    assert.ok(bien.ok && estadoDelPase(bien.pase) === "activa" && bien.exp > Date.now() / 1000);
    falso.encendida = false;
    const ap = await pedirPaseHttp({ numiniaUrl: falso.url, org: ORG, agente: AGENTE, privada })(MUNDO);
    assert.ok(!ap.ok && ap.motivo === "apagada" && /apagada/.test(ap.texto));
    const otra = await pedirPaseHttp({ numiniaUrl: falso.url, org: ORG, agente: AGENTE, privada: clavePrivada(nuevaPareja().privadaPem) })(MUNDO);
    assert.ok(!otra.ok && otra.motivo === "rechazado" && /firma/.test(otra.texto), "a key that is not the agent's");
    const reloj = await pedirPaseHttp({ numiniaUrl: falso.url, org: ORG, agente: AGENTE, privada, ahora: () => Date.now() - 5 * 60_000 })(MUNDO);
    assert.ok(!reloj.ok && /reloj/.test(reloj.texto), "t outside ± 60 s");
    const nadie = await pedirPaseHttp({ numiniaUrl: falso.url, org: ORG, agente: "otra", privada })(MUNDO);
    assert.ok(!nadie.ok && nadie.motivo === "rechazado");
    const html = await pedirPaseHttp({ numiniaUrl: falso.url, org: ORG, agente: AGENTE, privada, fetcher: async () => new Response("<html>", { status: 502 }) })(MUNDO);
    assert.ok(!html.ok && html.motivo === "rechazado" && /502/.test(html.texto));
    const nada = await pedirPaseHttp({ numiniaUrl: "http://127.0.0.1:1", org: ORG, agente: AGENTE, privada })(MUNDO);
    assert.ok(!nada.ok && nada.motivo === "red");
    assert.equal(estadoDelPase("basura"), null);
  } finally { await falso.cerrar(); }
});

test("tools/mcp-mundo.ts in organization mode: needs both NUMINIA_URL and AGENTE_ORG; switched off → says so on stderr and answers «no estoy en el mundo»", { timeout: 30_000 }, async () => {
  const par = nuevaPareja(), falso = await numiniaFalso(par.publica);
  const carpeta = mkdtempSync(join(tmpdir(), "puente-org-")), clave = join(carpeta, "ada.clave");
  writeFileSync(clave, par.privadaPem, { mode: 0o600 });
  try {
    const base = { ...process.env, MUNDO_URL: "ws://127.0.0.1:9", AGENTE_ID: AGENTE, AGENTE_CLAVE: clave };
    const mal = spawnSync(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...base, NUMINIA_URL: falso.url }, encoding: "utf8" });
    assert.equal(mal.status, 2);
    assert.match(mal.stderr, /NUMINIA_URL.*AGENTE_ORG/);
    falso.encendida = false;
    const hijo = spawn(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...base, NUMINIA_URL: falso.url, AGENTE_ORG: ORG, AGENTE_MUNDO: MUNDO }, stdio: ["pipe", "pipe", "pipe"] });
    let errores = "", salida = "";
    hijo.stderr.setEncoding("utf8").on("data", (t: string) => { errores += t; });
    hijo.stdout.setEncoding("utf8").on("data", (t: string) => { salida += t; });
    try {
      for (let i = 0; i < 60 && !/me ha apagado/.test(errores); i++) await espera(100);
      assert.match(errores, /IA de la organización «org-1»/);
      assert.match(errores, /numinia\.com me ha apagado/);
      hijo.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "mirar", arguments: {} } }) + "\n");
      for (let i = 0; i < 80 && !salida.includes("\n"); i++) await espera(100);
      assert.match(salida, /No estoy en el mundo/);
    } finally { hijo.kill(); }
  } finally { await falso.cerrar(); }
});
