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
import { mensajePase, pedirPaseHttp, pedirPaseToken, estadoDelPase } from "../packages/agent/src/pase-org.ts";
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

type Falso = { url: string; llamadas: { aud: string; t: number; ms: number }[]; bearers: (string | undefined)[]; estado: "activa" | "dormida"; encendida: boolean; caido: boolean; hashToken: string; cerrar(): Promise<void> };
const TOKEN = `ntk_${"aB3-_".repeat(9).slice(0, 43)}`; // 4 + 43
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex"); // numinia.com keeps only this
/** A fake numinia.com: knows one agent, signs 3-second passes. Key mode (publica) checks the Ed25519 signature and refuses a bearer;
 *  token mode (publica = null) compares SHA-256(bearer) with the stored hash and refuses a signed request. 401 is generic. */
async function numiniaFalso(publica: string | null): Promise<Falso> {
  const f: Falso = { url: "", llamadas: [], bearers: [], estado: "activa", encendida: true, caido: false, hashToken: TOKEN_HASH, cerrar: async () => {} };
  const claveAgente = publica ? (await import("../packages/agent/src/llave.ts")).clavePublica(publica)! : null;
  const srv: Server = createServer((req, res) => {
    const responder = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    let txt = ""; req.setEncoding("utf8"); req.on("data", (c: string) => { txt += c; });
    req.on("end", () => {
      if (req.method !== "POST" || req.url !== "/api/agents/pass") return responder(404, { error: "ruta", texto: "no existe" });
      if (f.caido) return responder(503, { error: "caido", texto: "numinia.com no está disponible" });
      let b: Record<string, unknown>; try { b = JSON.parse(txt); } catch { return responder(400, { error: "json", texto: "no es JSON" }); }
      const { org, agent, aud, t, sig } = b as { org: string; agent: string; aud: string; t: number; sig: string };
      const auth = req.headers.authorization; f.bearers.push(auth);
      if (org !== ORG || agent !== AGENTE) return responder(auth ? 401 : 404, auth ? { error: "token", texto: "Token no válido." } : { error: "no-existe", texto: "Esa IA no existe en la organización." });
      if (!claveAgente) { // token agent: only a bearer whose hash matches (it never accepts a signature); the answer echoes the token on purpose, to test the scrubbing
        const dado = /^Bearer (.+)$/.exec(auth ?? "")?.[1] ?? "";
        if (!auth || t !== undefined || sig !== undefined || createHash("sha256").update(dado).digest("hex") !== f.hashToken) return responder(401, { error: "token", texto: `Token no válido (${dado}).` });
      } else {
        if (auth) return responder(401, { error: "token", texto: "Esta IA entra con llave, no con token." });
        if (typeof t !== "number" || Math.abs(Date.now() / 1000 - t) > 60) return responder(401, { error: "hora", texto: "Tu reloj va desfasado." });
        if (!verify(null, Buffer.from(mensajePase(org, agent, aud, t), "ascii"), claveAgente, Buffer.from(String(sig), "base64url"))) return responder(401, { error: "firma", texto: "La firma no es de esta IA." });
      }
      if (aud !== MUNDO) return responder(403, { error: "mundo", texto: "Ese mundo no es de la organización." });
      if (!f.encendida) return responder(403, { error: "apagada", texto: "Esta IA está apagada en la organización." });
      f.llamadas.push({ aud, t: t as number, ms: Date.now() });
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

async function montar(o: { mundo?: boolean; token?: string } = {}) {
  const par = nuevaPareja(), privada = clavePrivada(par.privadaPem);
  const falso = await numiniaFalso(o.token ? null : par.publica);
  const log: string[] = [], lineasPuente: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, features: [chatServer, crearObjetos()], admin: "codigo-de-administracion-largo", secret: "una-clave-de-prueba-larga", pase: { clave: CLAVE, mundo: MUNDO, org: ORG }, log: (l) => log.push(l), version: "prueba" });
  const biblioteca = (JSON.parse(readFileSync("features/objetos/biblioteca.json", "utf8")) as { modelos: { id: string; nombre: string; modelo: string }[] }).modelos.map(({ id, nombre, modelo }) => ({ id, nombre, modelo }));
  const puente = new PuenteMundo({
    url: `ws://127.0.0.1:${srv.port}/ws`, id: AGENTE, ...(o.token ? {} : { privada }), biblioteca, log: (l) => lineasPuente.push(l),
    pedirPase: o.token ? pedirPaseToken({ numiniaUrl: falso.url, org: ORG, agente: AGENTE, token: o.token }) : pedirPaseHttp({ numiniaUrl: falso.url, org: ORG, agente: AGENTE, privada }), ...(o.mundo ? { mundo: MUNDO } : {}),
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

// ---- TOKEN WAY (corte 2): Authorization: Bearer ntk_…, body {org, agent, aud}, no t, no sig ----------------------------------------

test("token way: bridge enters with a bearer pass, builds, renews at ~80 % of what is left, is switched off → leaves; the token is nowhere in its log", { timeout: 60_000 }, async () => {
  const W = await montar({ token: TOKEN });
  try {
    W.puente.arrancar();
    assert.ok(await W.hasta(() => !!W.puente.cuerpo?.nombre && W.puente.puedeConstruir), `no entró: ${W.lineasPuente.join(" | ")}`);
    assert.equal(W.puente.cuerpo!.nombre, "Ada · IA");
    assert.deepEqual(W.falso.bearers.slice(0, 1), [`Bearer ${TOKEN}`], "the request carried the bearer");
    const puesto = await W.usar("colocar", { modelo: "bloque", x: 1, z: 1 });
    assert.equal(puesto.error, false, puesto.texto);
    const construidos = () => [...W.srv.inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).length;
    assert.equal(construidos(), 1, "a built block");
    assert.match((await W.usar("mirar")).texto, /Estado: activa/);
    // renewal: 3 s pass → asked again after ~80 % of the life left (≈ 2–2.4 s), not at 8 min and not at the very end
    assert.ok(await W.hasta(() => W.falso.llamadas.length >= 2, 5000), "renewed with the token");
    const dt = W.falso.llamadas[1].ms - W.falso.llamadas[0].ms;
    assert.ok(dt >= 1500 && dt <= 2900, `renewal after ${dt} ms`);
    assert.equal(W.puente.conectado, true);
    for (const t of W.falso.bearers) assert.equal(t, `Bearer ${TOKEN}`);
    W.falso.encendida = false; // apagada keeps its meaning (403)
    assert.ok(await W.hasta(() => W.puente.final !== null), "switched off: final");
    assert.match(W.puente.final!, /apagado/);
    assert.ok(await W.hasta(() => !W.srv.inst.conns.some((c) => c.who?.id === `ia-${SUB}`)), "out of the world");
    assert.ok(!W.lineasPuente.join("\n").includes(TOKEN) && !W.lineasPuente.join("\n").includes(TOKEN.slice(4)), "the token is not in the bridge's log");
    assert.ok(!(await W.usar("mirar")).texto.includes(TOKEN));
  } finally { await W.cerrar(); }
});

test("token way: a wrong (or renewed) token = 401 = FINAL: says it plainly, stops asking, never prints either token", { timeout: 30_000 }, async () => {
  const MALO = `ntk_${"Z9".repeat(22).slice(0, 43)}`;
  const W = await montar({ token: MALO });
  try {
    W.puente.arrancar();
    assert.ok(await W.hasta(() => W.puente.final !== null, 5000), "final");
    assert.match(W.puente.final!, /no acepta mi token/);
    assert.ok(W.lineasPuente.some((l) => /no acepta mi token/.test(l)), "on its log (stderr)");
    const n = W.falso.bearers.length;
    await espera(1500);
    assert.equal(W.falso.bearers.length, n, "it does not retry");
    assert.equal(W.puente.cuerpo, null, "never in the world");
    const todo = W.lineasPuente.join("\n") + W.puente.final + (await W.usar("mirar")).texto;
    assert.ok(!todo.includes(MALO) && !todo.includes(MALO.slice(4)), "the (echoed) token is scrubbed from what numinia.com said");
    assert.match(todo, /«token»/);
  } finally { await W.cerrar(); }
});

test("token way: a token that was valid and gets renewed (401 mid-session) ends the bridge for good", { timeout: 30_000 }, async () => {
  const W = await montar({ token: TOKEN });
  try {
    W.puente.arrancar();
    assert.ok(await W.hasta(() => !!W.puente.cuerpo?.nombre), "entered");
    W.falso.hashToken = createHash("sha256").update("otro").digest("hex"); // the panel renewed the token
    assert.ok(await W.hasta(() => W.puente.final !== null, 6000), "final at the next renewal");
    assert.match(W.puente.final!, /renovado|no acepta/);
    assert.ok(await W.hasta(() => !W.srv.inst.conns.some((c) => c.who?.id === `ia-${SUB}`)), "and out of the world");
    const n = W.falso.bearers.length; await espera(1200);
    assert.equal(W.falso.bearers.length, n);
  } finally { await W.cerrar(); }
});

test("pedirPaseToken: shape checked before any network call; a key agent refuses a bearer (and a token agent a signature); the answers are mapped", async () => {
  let llamadas = 0;
  const fetcher = (async () => { llamadas++; return new Response("{}"); }) as typeof fetch;
  for (const malo of ["", "ntk_corto", `ntk_${"a".repeat(44)}`, `xxx_${"a".repeat(43)}`, `ntk_${"a".repeat(42)}!`]) {
    assert.throws(() => pedirPaseToken({ numiniaUrl: "http://x", org: ORG, agente: AGENTE, token: malo, fetcher }), (e: Error) => !e.message.includes(malo) || malo === "", malo);
  }
  assert.equal(llamadas, 0, "no network call");
  const par = nuevaPareja(), clave = await numiniaFalso(par.publica), tok = await numiniaFalso(null);
  try {
    const aKey = await pedirPaseToken({ numiniaUrl: clave.url, org: ORG, agente: AGENTE, token: TOKEN })(MUNDO);
    assert.ok(!aKey.ok && aKey.motivo === "token", "a key agent refuses bearer (401)");
    const aTok = await pedirPaseHttp({ numiniaUrl: tok.url, org: ORG, agente: AGENTE, privada: clavePrivada(par.privadaPem) })(MUNDO);
    assert.ok(!aTok.ok && aTok.motivo === "rechazado", "a token agent refuses a signed request");
    const bien = await pedirPaseToken({ numiniaUrl: tok.url + "/", org: ORG, agente: AGENTE, token: TOKEN })(MUNDO);
    assert.ok(bien.ok && estadoDelPase(bien.pase) === "activa" && bien.exp > Date.now() / 1000);
    tok.encendida = false;
    const ap = await pedirPaseToken({ numiniaUrl: tok.url, org: ORG, agente: AGENTE, token: TOKEN })(MUNDO);
    assert.ok(!ap.ok && ap.motivo === "apagada", "403 apagada keeps its meaning");
    tok.caido = true;
    const caido = await pedirPaseToken({ numiniaUrl: tok.url, org: ORG, agente: AGENTE, token: TOKEN })(MUNDO);
    assert.ok(!caido.ok && caido.motivo === "rechazado", "503 is not final");
    const nada = await pedirPaseToken({ numiniaUrl: "http://127.0.0.1:1", org: ORG, agente: AGENTE, token: TOKEN })(MUNDO);
    assert.ok(!nada.ok && nada.motivo === "red");
    const eco = await pedirPaseToken({ numiniaUrl: "http://x", org: ORG, agente: AGENTE, token: TOKEN, fetcher: async () => new Response(JSON.stringify({ error: "x", texto: `eco ${TOKEN}` }), { status: 500 }) })(MUNDO);
    assert.ok(!eco.ok && !eco.texto.includes(TOKEN));
    const pase = (await pedirPaseToken({ numiniaUrl: tok.url, org: ORG, agente: AGENTE, token: TOKEN, fetcher: async () => { throw new Error(`boom ${TOKEN}`); } })(MUNDO));
    assert.ok(!pase.ok && !pase.texto.includes(TOKEN), "network error text is scrubbed too");
  } finally { await clave.cerrar(); await tok.cerrar(); }
});

test("tools/mcp-mundo.ts with a token: both AGENTE_TOKEN and AGENTE_CLAVE = clear error; malformed token = error before any network; the token never reaches stderr/stdout", { timeout: 30_000 }, async () => {
  const tok = await numiniaFalso(null);
  const carpeta = mkdtempSync(join(tmpdir(), "puente-tok-")), clave = join(carpeta, "ada.clave");
  writeFileSync(clave, nuevaPareja().privadaPem, { mode: 0o600 });
  try {
    const base: NodeJS.ProcessEnv = { ...process.env, MUNDO_URL: "ws://127.0.0.1:9", AGENTE_ID: AGENTE, NUMINIA_URL: tok.url, AGENTE_ORG: ORG, AGENTE_MUNDO: MUNDO };
    delete base.AGENTE_CLAVE;
    const ambos = spawnSync(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...base, AGENTE_TOKEN: TOKEN, AGENTE_CLAVE: clave }, encoding: "utf8" });
    assert.equal(ambos.status, 2); assert.match(ambos.stderr, /AGENTE_TOKEN y AGENTE_CLAVE a la vez/);
    for (const malo of ["ntk_corto", `ntk_${"a".repeat(44)}`, "no-es-un-token"]) {
      const r = spawnSync(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...base, AGENTE_TOKEN: malo }, encoding: "utf8" });
      assert.equal(r.status, 2, malo); assert.match(r.stderr, /no tiene la forma de un token/); assert.ok(!r.stderr.includes(malo) && !r.stdout.includes(malo));
    }
    const sinOrg = spawnSync(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...base, AGENTE_TOKEN: TOKEN, NUMINIA_URL: "", AGENTE_ORG: "" }, encoding: "utf8" });
    assert.equal(sinOrg.status, 2); assert.match(sinOrg.stderr, /organización/);
    assert.equal(tok.bearers.length, 0, "none of the above touched the network");
    // wrong token as a real child (flag form too): final line on stderr, the token itself nowhere
    const MALO = `ntk_${"Q7".repeat(22).slice(0, 43)}`;
    for (const como of ["env", "flag"] as const) {
      const hijo = spawn(process.execPath, ["tools/mcp-mundo.ts", ...(como === "flag" ? ["--token", MALO] : [])], { env: { ...base, ...(como === "env" ? { AGENTE_TOKEN: MALO } : {}) }, stdio: ["pipe", "pipe", "pipe"] });
      let errores = "", salida = "";
      hijo.stderr.setEncoding("utf8").on("data", (t: string) => { errores += t; });
      hijo.stdout.setEncoding("utf8").on("data", (t: string) => { salida += t; });
      try {
        for (let i = 0; i < 60 && !/no acepta mi token/.test(errores); i++) await espera(100);
        assert.match(errores, /con token/); assert.match(errores, /numinia\.com no acepta mi token/);
        hijo.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "mirar", arguments: {} } }) + "\n");
        for (let i = 0; i < 80 && !salida.includes("\n"); i++) await espera(100);
        assert.match(salida, /No estoy en el mundo/);
        assert.ok(!(errores + salida).includes(MALO.slice(4)), `${como}: the token appears nowhere`);
      } finally { hijo.kill(); }
    }
    // the good token as a child: enters nothing (no world at :9) but asks with the bearer and prints nothing secret
    const hijo = spawn(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...base, AGENTE_TOKEN: TOKEN }, stdio: ["pipe", "pipe", "pipe"] });
    let errores = "", salida = "";
    hijo.stderr.setEncoding("utf8").on("data", (t: string) => { errores += t; });
    hijo.stdout.setEncoding("utf8").on("data", (t: string) => { salida += t; });
    try {
      for (let i = 0; i < 60 && tok.llamadas.length === 0; i++) await espera(100);
      assert.ok(tok.llamadas.length >= 1, "asked numinia.com with the token");
      hijo.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "mirar", arguments: {} } }) + "\n");
      for (let i = 0; i < 80 && !salida.includes("\n"); i++) await espera(100);
      assert.ok(!(errores + salida).includes(TOKEN.slice(4)), "the good token is not printed either");
    } finally { hijo.kill(); }
  } finally { await tok.cerrar(); }
});
