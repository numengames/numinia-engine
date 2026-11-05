// mundo-hermes M8b: the embed route read as an ATTACKER, one test per case (good and bad). Real HTTP server, raw requests (so Host / Origin can be forged),
// and a real startServer for the CORS-on-files / no-CORS-on-the-socket cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request, createServer } from "node:http";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import { WebSocket } from "ws";
import { acunarCredencial, crearEmbedHttp, verificarCredencial, TTL_MAX_MS } from "../packages/server/src/embed-espejo.ts";
import { esLoopback } from "../packages/server/src/enlace-espejo.ts";
import { startServer } from "../packages/server/src/server.ts";
import type { EnlaceEspejo } from "../features/espejo/server.ts";

const CLAVE = "una-clave-de-enlace-bien-larga-0123456789", OTRA = "otra-clave-de-enlace-bien-larga-999999", T0 = 1_800_000_000_000;
const PULSO = JSON.stringify({ v: 1, t: "pulso" });
type R = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

async function ruta(o: { activo?: boolean; clave?: () => string } = {}) {
  const reloj = { ms: T0 }, enlace = { lote: () => ({ ok: true }), alta: () => ({ ok: true }), cambio: () => ({ ok: true }), baja: () => ({ ok: true }), resultado: () => false } as unknown as EnlaceEspejo;
  const h = crearEmbedHttp({ enlace, clave: o.clave ?? (() => CLAVE), activo: () => o.activo ?? true, reloj: () => reloj.ms });
  const srv: Server = createServer((req, res) => { if (!h.atender(req.method ?? "", (req.url ?? "/").split("?")[0], req, res)) { res.writeHead(404); res.end("no"); } });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as { port: number }).port;
  /** a raw request: headers exactly as given (Host included), path with its query string */
  const pide = (method: string, cabeceras: Record<string, string>, cuerpo?: string | Buffer, path = "/espejo/embed") => new Promise<R>((ok, ko) => {
    const q = request({ host: "127.0.0.1", port, method, path, headers: cabeceras, setHost: false }, (res) => { let b = ""; res.setEncoding("utf8"); res.on("data", (c: string) => (b += c)); res.on("end", () => ok({ status: res.statusCode ?? 0, headers: res.headers, body: b })); });
    q.on("error", ko); if (cuerpo !== undefined) q.write(cuerpo); q.end();
  });
  const bueno = (extra: Record<string, string> = {}, cred = acunarCredencial(CLAVE, { ahora: T0 })) => ({ host: `127.0.0.1:${port}`, authorization: `Bearer ${cred}`, "content-type": "application/json", ...extra });
  return { pide, bueno, reloj, port, cerrar: () => srv.close() };
}
const con = async (f: (x: Awaited<ReturnType<typeof ruta>>) => Promise<void>, o?: Parameters<typeof ruta>[0]) => { const x = await ruta(o); try { await f(x); } finally { x.cerrar(); } };

// ---- credential: time ----
test("good: a fresh credential is answered 200", () => con(async (x) => assert.equal((await x.pide("POST", x.bueno(), PULSO)).status, 200)));
test("bad: replay after expiry ⇒ 401", () => con(async (x) => {
  const c = acunarCredencial(CLAVE, { ahora: T0, ttlMs: 3600_000 });
  assert.equal((await x.pide("POST", x.bueno({}, c), PULSO)).status, 200);
  x.reloj.ms = T0 + 3600_000 + 1; assert.equal((await x.pide("POST", x.bueno({}, c), PULSO)).status, 401);
}));
test("bad: exp beyond the 24 h cap, signed with the right key ⇒ refused (a stolen key's long-lived minting is not honoured)", () => {
  const cuerpo = `${T0 + 48 * 3600_000}.AAAAAAAAAAAAAAAA`; // forge by hand with the real key
  return import("node:crypto").then(({ createHmac }) => {
    const c = `e1.${cuerpo}.${createHmac("sha256", CLAVE).update(`numinia-embed@1\n${cuerpo}`).digest("hex")}`;
    assert.equal(verificarCredencial(CLAVE, c, T0), false);
    assert.equal(verificarCredencial(CLAVE, acunarCredencial(CLAVE, { ahora: T0, ttlMs: 99 * TTL_MAX_MS }), T0), true, "the plugin's own minting is capped, not refused");
    assert.ok(verificarCredencial(CLAVE, acunarCredencial(CLAVE, { ahora: T0, ttlMs: 99 * TTL_MAX_MS }), T0 + TTL_MAX_MS + 61_000) === false);
  });
});
test("bad: tampered hmac (last char, first char, truncated, extended, uppercase) ⇒ 401", () => con(async (x) => {
  const c = acunarCredencial(CLAVE, { ahora: T0 }), cambia = (s: string, i: number) => s.slice(0, i) + (s[i] === "0" ? "1" : "0") + s.slice(i + 1);
  for (const m of [cambia(c, c.length - 1), cambia(c, c.lastIndexOf(".") + 1), c.slice(0, -1), c + "0", c.slice(0, c.lastIndexOf(".") + 1) + c.slice(c.lastIndexOf(".") + 1).toUpperCase()])
    assert.equal((await x.pide("POST", x.bueno({}, m), PULSO)).status, 401, m);
}));
test("bad: tampered exp (extended by an hour) or nonce ⇒ 401", () => con(async (x) => {
  const [e1, exp, nonce, tag] = acunarCredencial(CLAVE, { ahora: T0 }).split(".");
  for (const m of [`${e1}.${Number(exp) + 3600_000}.${nonce}.${tag}`, `${e1}.${exp}.${nonce.slice(0, -1)}${nonce.endsWith("A") ? "B" : "A"}.${tag}`, `${e1}.${exp}.${nonce}`, `e2.${exp}.${nonce}.${tag}`])
    assert.equal((await x.pide("POST", x.bueno({}, m), PULSO)).status, 401, m);
}));
test("bad: credential made with another key ⇒ 401; key rotated after minting ⇒ 401, minted after rotation ⇒ 200", async () => {
  let clave = CLAVE; const v1 = acunarCredencial(CLAVE, { ahora: T0 });
  await con(async (x) => {
    assert.equal((await x.pide("POST", x.bueno({}, acunarCredencial(OTRA, { ahora: T0 })), PULSO)).status, 401, "wrong key");
    assert.equal((await x.pide("POST", x.bueno({}, v1), PULSO)).status, 200);
    clave = OTRA; assert.equal((await x.pide("POST", x.bueno({}, v1), PULSO)).status, 401, "rotated");
    assert.equal((await x.pide("POST", x.bueno({}, acunarCredencial(OTRA, { ahora: T0 })), PULSO)).status, 200);
    clave = ""; assert.equal((await x.pide("POST", x.bueno({}, v1), PULSO)).status, 401, "no key = no embed");
  }, { clave: () => clave });
});

// ---- credential: where it travels ----
test("bad: no credential with Origin null ⇒ 401 (Origin proves nothing)", () => con(async (x) => {
  const h = x.bueno({ origin: "null" }); delete (h as Record<string, string>).authorization;
  assert.equal((await x.pide("POST", h, PULSO)).status, 401);
}));
test("bad: credential in the query string (or the path), not the header ⇒ 401: it is never read from there", () => con(async (x) => {
  const c = acunarCredencial(CLAVE, { ahora: T0 }), h = x.bueno({ origin: "null" }); delete (h as Record<string, string>).authorization;
  for (const q of [`?embed=${c}`, `?credencial=${c}`, `?authorization=Bearer%20${c}`, `?access_token=${c}`]) assert.equal((await x.pide("POST", h, PULSO, `/espejo/embed${q}`)).status, 401, q);
  assert.notEqual((await x.pide("POST", h, PULSO, `/espejo/embed#embed=${c}`)).status, 200, "a fragment is never part of a request");
  assert.equal((await x.pide("POST", { ...h, authorization: `Basic ${c}` }, PULSO)).status, 401, "wrong scheme");
}));

// ---- who may ask ----
test("bad: proxy headers (X-Forwarded-For / Forwarded / X-Real-IP / Via / CF-Connecting-IP / X-Forwarded-Host) ⇒ 403 even with a valid credential", () => con(async (x) => {
  for (const k of ["x-forwarded-for", "forwarded", "x-real-ip", "via", "cf-connecting-ip", "true-client-ip", "x-client-ip", "x-forwarded-host", "x-forwarded-proto"])
    assert.equal((await x.pide("POST", x.bueno({ [k]: "8.8.8.8" }), PULSO)).status, 403, k);
}));
test("good/bad: the source address — loopback forms are in, every other form is out", () => {
  for (const ip of ["127.0.0.1", "127.255.255.254", "::1", "::ffff:127.0.0.1", "::FFFF:127.0.0.1", "::ffff:7f00:1"]) assert.equal(esLoopback(ip), true, ip);
  for (const ip of ["::ffff:10.0.0.1", "::ffff:192.168.1.5", "::ffff:a00:1", "10.0.0.1", "192.168.0.2", "8.8.8.8", "::", "fe80::1", "2001:db8::1", "127.0.0.256", "127.0.0.1.evil", "0127.0.0.1", "::ffff:::1", "localhost", "", undefined]) assert.equal(esLoopback(ip), false, String(ip));
});
test("bad: a request whose socket is not loopback ⇒ 403 (answered before anything else, no CORS, no preflight)", () => {
  const h = crearEmbedHttp({ enlace: {} as EnlaceEspejo, clave: () => CLAVE, activo: () => true, reloj: () => T0 });
  for (const ip of ["10.0.0.1", "::ffff:10.0.0.1", "203.0.113.9", "2001:db8::1", undefined]) for (const metodo of ["POST", "OPTIONS"]) {
    let code = 0, hd: Record<string, string> = {};
    const res = { writeHead(c: number, x: Record<string, string>) { code = c; hd = x; }, end() {} } as unknown as ServerResponse;
    const req = { socket: { remoteAddress: ip }, headers: { host: "127.0.0.1:1", authorization: `Bearer ${acunarCredencial(CLAVE, { ahora: T0 })}`, "content-type": "application/json", origin: "null" } } as unknown as IncomingMessage;
    assert.equal(h.atender(metodo, "/espejo/embed", req, res), true); assert.equal(code, 403, `${ip} ${metodo}`);
  }
});
test("bad: DNS rebinding — Host: evil.example (resolving to 127.0.0.1) ⇒ 403; localhost / 127.0.0.1 / [::1] ⇒ fine", () => con(async (x) => {
  for (const host of ["evil.example", "evil.example:80", "127.0.0.1.evil.example", "localhost.evil.example", "10.0.0.1", "[::ffff:10.0.0.1]", "localhost:abc"]) {
    const h = x.bueno({ host });
    assert.equal((await x.pide("POST", h, PULSO)).status, 403, `Host «${host}»`);
    assert.equal((await x.pide("OPTIONS", { ...h, origin: "null" })).status, 403, `preflight Host «${host}»`);
  }
  for (const host of ["localhost", `localhost:${x.port}`, `127.0.0.1:${x.port}`, `[::1]:${x.port}`, "LOCALHOST:1234"]) assert.equal((await x.pide("POST", x.bueno({ host }), PULSO)).status, 200, host);
}));
test("bad: a web page of another site (Origin: https://evil.example) ⇒ 403 and no CORS to read the answer; Origin null and the world's own address are fine", () => con(async (x) => {
  const r = await x.pide("POST", x.bueno({ origin: "https://evil.example" }), PULSO);
  assert.equal(r.status, 403); assert.equal(r.headers["access-control-allow-origin"], undefined);
  const p = await x.pide("OPTIONS", x.bueno({ origin: "https://evil.example" })); assert.equal(p.status, 403); assert.equal(p.headers["access-control-allow-origin"], undefined);
  const n = await x.pide("POST", x.bueno({ origin: "null" }), PULSO); assert.equal(n.status, 200); assert.equal(n.headers["access-control-allow-origin"], "*");
  assert.equal((await x.pide("POST", x.bueno({ origin: `http://127.0.0.1:${x.port}` }), PULSO)).status, 200);
}));

// ---- body ----
test("bad: oversized body ⇒ 413 and the route still answers afterwards (content-length known, chunked, and a huge one)", () => con(async (x) => {
  assert.equal((await x.pide("POST", { ...x.bueno(), "content-length": "20000" }, "a".repeat(20000))).status, 413, "declared");
  assert.equal((await x.pide("POST", { ...x.bueno(), "transfer-encoding": "chunked" }, Buffer.from(JSON.stringify({ v: 1, t: "lote", x: "a".repeat(40000) })))).status, 413, "chunked");
  assert.equal((await x.pide("POST", { ...x.bueno() }, "b".repeat(3_000_000))).status, 413, "3 MB");
  assert.equal((await x.pide("POST", x.bueno(), PULSO)).status, 200, "alive");
}));
test("bad: content-type confusion (text/plain, form, multipart, missing, json-lookalike) ⇒ 415; application/json with charset is fine", () => con(async (x) => {
  for (const ct of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonx", "text/json", "application/xml"]) assert.equal((await x.pide("POST", x.bueno({ "content-type": ct }), PULSO)).status, 415, ct);
  const sin = x.bueno(); delete (sin as Record<string, string>)["content-type"]; assert.equal((await x.pide("POST", sin, PULSO)).status, 415, "missing");
  assert.equal((await x.pide("POST", x.bueno({ "content-type": "application/json; charset=utf-8" }), PULSO)).status, 200);
}));
test("bad: method confusion — GET / PUT / DELETE / PATCH / HEAD ⇒ 405 and no CORS; OPTIONS preflight answers 204 without a credential, for Origin null", () => con(async (x) => {
  for (const m of ["GET", "PUT", "DELETE", "PATCH", "HEAD"]) { const r = await x.pide(m, x.bueno({ origin: "https://evil.example" })); assert.equal(r.status, 403, `${m} from another site`); const s = await x.pide(m, x.bueno()); assert.equal(s.status, 405, m); }
  const pre = await x.pide("OPTIONS", { host: `127.0.0.1:${x.port}`, origin: "null", "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type" });
  assert.equal(pre.status, 204); assert.equal(pre.headers["access-control-allow-origin"], "*"); assert.equal(pre.headers["access-control-allow-methods"], "POST, OPTIONS"); assert.equal(pre.headers["access-control-allow-credentials"], undefined);
}));
test("good: embed off ⇒ 404 on every method with a valid credential, and no CORS header at all", () => con(async (x) => {
  for (const m of ["POST", "OPTIONS", "GET", "PUT"]) { const r = await x.pide(m, x.bueno({ origin: "null" }), m === "POST" ? PULSO : undefined); assert.equal(r.status, 404, m); assert.equal(Object.keys(r.headers).filter((k) => k.startsWith("access-control")).length, 0, m); }
}, { activo: false }));

// ---- rate ----
test("bad: brute force of the tag ⇒ 401 for a while, then 429; a valid credential is NEVER locked out by the guessing (a sandboxed frame of any site could otherwise lock the owner out)", () => con(async (x) => {
  const bueno = acunarCredencial(CLAVE, { ahora: T0 }), malo = bueno.slice(0, -1) + (bueno.endsWith("0") ? "1" : "0"), s: number[] = [];
  for (let i = 0; i < 80; i++) s.push((await x.pide("POST", x.bueno({}, malo), PULSO)).status);
  assert.equal(s[0], 401); assert.ok(s.includes(429), "limit hit"); assert.ok(!s.some((c) => c !== 401 && c !== 429));
  assert.equal((await x.pide("POST", x.bueno({}, bueno), PULSO)).status, 200, "the owner still gets in");
  x.reloj.ms += 5000; assert.equal((await x.pide("POST", x.bueno({}, malo), PULSO)).status, 401, "recovers with time");
}));

// ---- constant time ----
test("hmac compare is constant-time: crypto.timingSafeEqual behind an equal-length guard, and no `===` on the tag", () => {
  const src = readFileSync(new URL("../packages/server/src/embed-espejo.ts", import.meta.url), "utf8");
  assert.match(src, /x\.length === y\.length && timingSafeEqual\(x, y\)/);
  assert.ok(!/m\[3\]\s*===|===\s*firma\(|firma\([^)]*\)\s*===/.test(src), "no plain comparison of the tag");
  assert.equal(verificarCredencial(CLAVE, `e1.${T0 + 1000}.AAAAAAAAAAAAAAAA.${"a".repeat(63)}`, T0), false, "short tag never reaches timingSafeEqual (it would throw)");
});

// ---- reuse across connections (decision: bound to the first identity that proves it; see features/espejo/server.ts «atadas») ----
test("decision: a credential is reusable until exp only by the identity that proved it first; a second identity replaying it is refused", async () => {
  const { Instance } = await import("../packages/instance/src/index.ts"), { ClientSession } = await import("../packages/client/src/index.ts");
  const { signer } = await import("../packages/server/src/secret.ts"), { crearRoles } = await import("../packages/server/src/roles-mundo.ts");
  const { conMundo } = await import("../features/mundo.ts"), funciones = (await import("../features/servidor.ts")).default, { conEspejo } = await import("../features/espejo/server.ts");
  const { ESQUEMA } = await import("../features/espejo/esquema.ts");
  const sign = signer("una-clave-de-prueba-larga"), log: string[] = [];
  const archivos = new Map<string, unknown>([["espejo.json", { schema: ESQUEMA, activa: true, funciones: { cron: true }, acciones: {}, zonas: [], embed: { activa: true } }]]);
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: sign, cerrar: (e: number) => inst.disconnect(e), ahora: () => 0, log: (l: string) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f: string) => archivos.get(f), (l: string) => log.push(l));
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l: string) => log.push(l), identitySign: sign, puede: (w: never, a: never) => roles.puede(w, a) } as never);
  (lista.find(conEspejo)!.enlace as EnlaceEspejo).verificarEmbed((c) => verificarCredencial(CLAVE, c));
  const gente = [0, 1].map(() => { const t = inst.join(0); let k: string | null = null; const s = new ClientSession(t, { features: [], identity: { load: () => k, save: (v: string) => { k = v; } } }); const vistos: string[] = []; s.features.tap((f: string, e: string) => { if (f === "espejo") vistos.push(e); }); return { t, s, vistos }; });
  const pump = () => { for (let i = 0; i < 3; i++) for (const g of gente) { g.t.flush(); inst.tick(); g.t.flush(); } };
  pump(); const cred = acunarCredencial(CLAVE, { ahora: Date.now() });
  gente[0].s.features.send("espejo", "embed", { credencial: cred }); pump(); assert.ok(gente[0].vistos.includes("hola"), "first identity binds");
  gente[0].vistos.length = 0; gente[0].s.features.send("espejo", "embed", { credencial: cred }); pump(); assert.ok(gente[0].vistos.includes("hola"), "the same page may reconnect with it");
  gente[1].s.features.send("espejo", "embed", { credencial: cred }); pump(); assert.ok(gente[1].vistos.includes("rechazado") && !gente[1].vistos.includes("hola"), "a second identity is refused");
  gente[1].vistos.length = 0; gente[1].s.features.send("espejo", "embed", { credencial: acunarCredencial(CLAVE, { ahora: Date.now() }) }); pump(); assert.ok(gente[1].vistos.includes("hola"), "its own fresh credential works");
});

// ---- CORS scope: files yes (only when on), /espejo/* and the socket never ----
test("CORS `*`: page files carry it only while embed is on; no other /espejo/* route and not the socket upgrade ever do; off = none on files or the route", async () => {
  const www = mkdtempSync(join(tmpdir(), "embed-seg-")); mkdirSync(join(www, "assets")); writeFileSync(join(www, "index.html"), "<!doctype html><title>t</title>"); writeFileSync(join(www, "assets", "a.js"), "export const x = 1;\n");
  for (const activo of [false, true]) {
    const embed = { activo: () => activo, atender: crearEmbedHttp({ enlace: {} as EnlaceEspejo, clave: () => CLAVE, activo: () => activo }).atender };
    const srv = await startServer({ port: 0, host: "127.0.0.1", www, embed, sesiones: null, version: "prueba", log: () => {}, statsMs: 60_000 } as never);
    const u = (p: string) => `http://127.0.0.1:${srv.port}${p}`;
    try {
      for (const p of ["/", "/assets/a.js"]) assert.equal((await fetch(u(p))).headers.get("access-control-allow-origin"), activo ? "*" : null, `${p} embed ${activo ? "on" : "off"}`);
      for (const p of ["/espejo/otra", "/espejo", "/espejo/embed/x"]) { const r = await fetch(u(p), { headers: { origin: "null" } }); assert.equal(r.headers.get("access-control-allow-origin"), null, p); }
      const o = await fetch(u("/espejo/embed"), { method: "OPTIONS", headers: { origin: "null" } }); assert.equal(o.status === 204, activo, "preflight only while embed is on"); assert.equal(o.headers.get("access-control-allow-origin"), activo ? "*" : null);
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, { origin: "null" }); let cab: Record<string, unknown> = {};
      ws.on("upgrade", (res) => { cab = res.headers; }); ws.on("error", () => {});
      await new Promise<void>((ok) => { ws.on("open", () => ok()); ws.on("close", () => ok()); setTimeout(ok, 2000); });
      assert.equal(Object.keys(cab).filter((k) => k.startsWith("access-control")).length, 0, "the socket upgrade carries no CORS header"); ws.terminate();
    } finally { await srv.close(); }
  }
});
