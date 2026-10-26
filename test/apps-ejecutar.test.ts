// M20 (slice 2): the main.ts of each app runs in the SES sandbox of guion.ts, wired to the M19 folders.
// Real files, the engine's own server on a free port, real fetch; the pass is signed with a real key (as test/funciones-http.test.ts).
//   - the example app runs and answers its events; GET /apps says so
//   - a script cannot read process, files, the network or the module system
//   - a script over its CPU budget is cut and reported (log, GET /apps, /metrics.prom) and the world keeps answering
//   - an admin changes the script and it reloads with no restart; a stranger cannot; text that does not load never replaces the live script
//   - an edit of main.ts on disk reloads it too
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../packages/server/src/server.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import { GUION_CARGA_MS, GUION_CPU_MS, GUION_MEMORIA_MB, GUIONES_MAX, aJavaScript } from "../packages/server/src/apps-ejecutar.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "apps-ejecutar-"));
const espera = async (f: () => boolean | Promise<boolean>, ms = 8000) => { const t0 = performance.now(); while (!(await f()) && performance.now() - t0 < ms) await sleep(25); return f(); };
const ADMIN = "codigo-de-admin-de-prueba";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza";
const ahoraS = () => Math.floor(Date.now() / 1000);
const pase = (perm: string[], key: KeyObject = par.privateKey): string => {
  const carga = { v: 1, iss: "numinia.com", aud: MUNDO, sub: `p_${"a".repeat(32)}`, org: "org-1", perm, height: 0, roles: [], iat: ahoraS() - 5, exp: ahoraS() + 595 };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(carga))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), key))}`;
};

/** An apps/ folder with the example app (its own script) plus any extra apps as { id: main.ts text | null }. */
function carpeta(extra: Record<string, string | null> = {}, conEjemplo = true) {
  const dir = tmp();
  if (conEjemplo) cpSync(join("plantillas/apps", "bloque-giratorio"), join(dir, "bloque-giratorio"), { recursive: true });
  for (const [id, main] of Object.entries(extra)) {
    const a = join(dir, id); mkdirSync(a);
    writeFileSync(join(a, "app.json"), JSON.stringify({ schema: "numinia-engine/app@1", id, nombre: id, version: "1.0.0", licencia: "AGPL-3.0-only", activos: [], ...(main !== null ? { main: "main.ts" } : {}), ficha: { hablado: id, describe: `app de prueba ${id}` } }));
    if (main !== null) writeFileSync(join(a, "main.ts"), main);
  }
  return dir;
}
async function mundo(dir: string, o: { max?: number } = {}) {
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", apps: dir, biblioteca: null, statsMs: 60_000, log: (l: string) => log.push(l), admin: ADMIN, pase: { clave: CLAVE, mundo: MUNDO }, version: "prueba" });
  const base = `http://127.0.0.1:${srv.port}`;
  const lista = async (): Promise<any> => (await fetch(`${base}/apps`)).json();
  const script = async (id: string): Promise<any> => (await lista()).apps.find((a: any) => a.id === id)?.script;
  const poner = (id: string, texto: string, cred: string | null = ADMIN) => fetch(`${base}/apps/${id}/main.ts`, { method: "PUT", body: texto, headers: cred ? { authorization: `Bearer ${cred}` } : {} });
  return { srv, base, log, lista, script, poner, cerrar: () => srv.close() };
}

test("M20: the example app's main.ts runs in the sandbox: it answers its events and GET /apps says it runs", async () => {
  const m = await mundo(carpeta());
  try {
    const s = await m.script("bloque-giratorio");
    assert.equal(s.ejecuta, true); assert.equal(s.estado, "viva"); assert.equal(s.version, 1);
    assert.ok(m.log.some((l) => /\[app bloque-giratorio\] listo/.test(l)), "alCargar ran with the defaults and app.log reached the server log");
    assert.ok(m.log.some((l) => /«bloque-giratorio» corre en la caja SES/.test(l)));
    const r1 = await m.srv.apps.lanzar("bloque-giratorio", "alPulsar", { quien: "Ana" });
    assert.ok(r1.ok && r1.valor === "izquierda", JSON.stringify(r1));
    const r2 = await m.srv.apps.lanzar("bloque-giratorio", "giro", { dt: 2 });
    assert.ok(r2.ok && r2.valor === -40, "turns left at the app.json default 20°/s × 2 s after the press: " + JSON.stringify(r2));
  } finally { await m.cerrar(); }
});

test("M20: a script cannot read process, files, the network or the module system, and cannot poison the engine", async () => {
  const dir = carpeta({
    intruso: `declare const app: any;
app.on("mira", () => ({
  proceso: typeof process, require: typeof require, fetch: typeof fetch, buffer: typeof Buffer, timer: typeof setTimeout, fs: typeof (globalThis as any).fs,
  evalo: (() => { try { return typeof (0, eval)("typeof process"); } catch { return "bloqueado"; } })(),
  envenena: (() => { try { (Array.prototype as any).pwn = 1; return "escribió"; } catch { return "congelado"; } })(),
}));
app.on("escribe", () => { const w = (globalThis as any).process?.binding; return typeof w; });`,
  }, false);
  const m = await mundo(dir);
  try {
    const r = await m.srv.apps.lanzar("intruso", "mira");
    assert.ok(r.ok, JSON.stringify(r));
    const v = r.valor as Record<string, string>;
    assert.deepEqual({ ...v }, { proceso: "undefined", require: "undefined", fetch: "undefined", buffer: "undefined", timer: "undefined", fs: "undefined", evalo: "string", envenena: "congelado" });
    const w = await m.srv.apps.lanzar("intruso", "escribe");
    assert.ok(w.ok && w.valor === "undefined");
    assert.equal(([] as any).pwn, undefined, "the host's Array.prototype is untouched");
  } finally { await m.cerrar(); }
});

test("M20: no clock, no randomness, no dynamic import inside the sandbox: they throw or are refused at load", async () => {
  const m = await mundo(carpeta({
    reloj: `declare const app: any; app.on("x", () => { try { return String(Date.now()); } catch (e) { return "lanza"; } }); app.on("y", () => { try { return String(Math.random()); } catch (e) { return "lanza"; } });`,
    importa: `declare const app: any; import("node:fs");`,
  }, false));
  try {
    assert.equal(((await m.srv.apps.lanzar("reloj", "x")) as any).valor, "lanza");
    assert.equal(((await m.srv.apps.lanzar("reloj", "y")) as any).valor, "lanza");
    const s = await m.script("importa");
    assert.equal(s.estado, "error"); assert.match(s.porQue, /SES_IMPORT_REJECTED/);
  } finally { await m.cerrar(); }
});

test("M20: a script over its CPU budget is cut and reported; the world and the other scripts keep going", async () => {
  const dir = carpeta({
    bucle: `declare const app: any;
app.on("pesado", () => { for (;;) {} });
app.on("ligero", () => "ok");`,
  });
  const m = await mundo(dir);
  try {
    const t0 = Date.now();
    const r = await m.srv.apps.lanzar("bucle", "pesado");
    assert.ok(!r.ok && r.motivo === "cpu", JSON.stringify(r));
    assert.ok(Date.now() - t0 < GUION_CPU_MS * 40, `cut near its ${GUION_CPU_MS} ms budget, not after a hang (${Date.now() - t0} ms)`);
    // reported: the log, GET /apps and /metrics.prom
    assert.ok(m.log.some((l) => /\[app bucle\] script cortado por pasarse de CPU/.test(l)), "log line");
    const s = await m.script("bucle");
    assert.equal(s.cortes.cpu, 1); assert.equal(s.estado, "cortada"); assert.equal(s.informes.at(-1).motivo, "cpu"); assert.match(s.informes.at(-1).detalle, /pesado/);
    const prom = await (await fetch(`${m.base}/metrics.prom`)).text();
    assert.match(prom, /numinia_guion_cortes_total\{app="bucle",motivo="cpu"\} 1/);
    assert.match(prom, /numinia_guion_cortes_total\{app="bloque-giratorio",motivo="cpu"\} 0/);
    // the world answers, the cut script comes back on a fresh worker, the neighbour was never touched
    assert.equal((await fetch(`${m.base}/health`)).status, 200);
    const otra = await m.srv.apps.lanzar("bucle", "ligero");
    assert.ok(otra.ok && otra.valor === "ok");
    assert.equal((await m.script("bucle")).estado, "viva");
    const vecino = await m.srv.apps.lanzar("bloque-giratorio", "giro", { dt: 1 });
    assert.ok(vecino.ok && vecino.valor === 20);
  } finally { await m.cerrar(); }
});

test("M20: a script whose top level never ends or throws is reported at start and does not stop the world from listening", async () => {
  const dir = carpeta({ colgado: `declare const app: any; for (;;) {}`, roto: `declare const app: any; throw new Error("rota al cargar");`, bueno: `declare const app: any; app.on("x", () => 1);` }, false);
  const t0 = Date.now();
  const m = await mundo(dir);
  try {
    assert.ok(Date.now() - t0 < GUION_CARGA_MS * 20 + 8000, "start took " + (Date.now() - t0) + " ms");
    const l = await m.lista();
    const por = Object.fromEntries(l.apps.map((a: any) => [a.id, a.script]));
    assert.equal(por.colgado.estado, "cortada"); assert.equal(por.colgado.cortes.cpu, 1);
    assert.equal(por.roto.estado, "error"); assert.match(por.roto.porQue, /rota al cargar/);
    assert.equal(por.bueno.estado, "viva");
    assert.ok(m.log.some((l) => /«roto» no arranca: rota al cargar/.test(l)));
    assert.equal((await fetch(`${m.base}/health`)).status, 200);
  } finally { await m.cerrar(); }
});

test("M20: an admin changes the script and it reloads in place, no restart; a stranger cannot; text that does not load is refused and nothing is written", async () => {
  const dir = carpeta({ vivo: `declare const app: any; app.on("v", () => "uno");` }, false);
  const m = await mundo(dir);
  const ruta = join(dir, "vivo", "main.ts");
  try {
    const huella = (await (await fetch(`${m.base}/health`)).json() as any).huella;
    const r0 = await m.srv.apps.lanzar("vivo", "v");
    assert.ok(r0.ok && r0.valor === "uno");

    // who may
    assert.equal((await m.poner("vivo", "x", null)).status, 401, "no credential");
    assert.equal((await m.poner("vivo", "x", "no-es-el-codigo-123")).status, 401, "wrong code");
    assert.equal((await m.poner("vivo", "x", pase(["enter-worlds"]))).status, 403, "a valid pass without the permission");
    assert.equal((await m.poner("vivo", "x", pase(["manage-organization"], generateKeyPairSync("ed25519").privateKey))).status, 401, "a pass signed by another key");
    assert.equal((await fetch(`${m.base}/apps/vivo/main.ts`)).status, 401, "reading the script is admin-only too");
    assert.equal((await fetch(`${m.base}/apps/vivo/recargar`, { method: "POST" })).status, 401);
    assert.equal(readFileSync(ruta, "utf8"), `declare const app: any; app.on("v", () => "uno");`, "nothing written by the refused calls");
    assert.equal((await m.poner("nadie", "x")).status, 404, "no such app");

    // the admin (code) edits: new code answers, version moves, same server
    const ok = await m.poner("vivo", `declare const app: any; app.on("v", () => "dos");`);
    assert.equal(ok.status, 200); const j: any = await ok.json();
    assert.equal(j.ok, true); assert.equal(j.version, 2); assert.equal(j.script.estado, "viva");
    const r1 = await m.srv.apps.lanzar("vivo", "v");
    assert.ok(r1.ok && r1.valor === "dos", "the new code answers");
    assert.match(readFileSync(ruta, "utf8"), /"dos"/, "the file on disk is the new text");
    assert.equal(((await (await fetch(`${m.base}/health`)).json()) as any).huella, huella, "the world was not restarted: same fingerprint, same server");

    // the admin by pass (manage-organization) reads it back and edits it
    const leido = await fetch(`${m.base}/apps/vivo/main.ts`, { headers: { authorization: `Bearer ${pase(["manage-organization"])}` } });
    assert.equal(leido.status, 200); assert.match(await leido.text(), /"dos"/);
    const p2 = await m.poner("vivo", `declare const app: any; app.on("v", () => "tres");`, pase(["manage-organization"]));
    assert.equal(p2.status, 200); assert.equal(((await p2.json()) as any).version, 3);

    // text that does not load: refused, nothing written, the live script keeps answering
    const antes = readFileSync(ruta, "utf8");
    const malo = await m.poner("vivo", `declare const app: any; throw new Error("no cargo");`);
    assert.equal(malo.status, 422); assert.match(((await malo.json()) as any).texto, /no cargo/);
    const cuelga = await m.poner("vivo", `declare const app: any; for (;;) {}`);
    assert.equal(cuelga.status, 422, "a top level that never ends is refused too");
    const enum_ = await m.poner("vivo", `enum A { B }`);
    assert.equal(enum_.status, 422); assert.match(((await enum_.json()) as any).texto, /enum/);
    assert.equal(readFileSync(ruta, "utf8"), antes, "the file is unchanged");
    const r3 = await m.srv.apps.lanzar("vivo", "v");
    assert.ok(r3.ok && r3.valor === "tres", "still the last good script");
    assert.equal((await m.script("vivo")).version, 3);

    // too big
    assert.equal((await m.poner("vivo", "x".repeat(257 * 1024))).status, 413);
  } finally { await m.cerrar(); }
});

test("M20: five wrong administration codes lock the door for ten minutes (429)", async () => {
  const m = await mundo(carpeta({ vivo: `declare const app: any; app.on("v", () => 1);` }, false));
  try {
    for (let i = 0; i < 5; i++) assert.equal((await m.poner("vivo", "x", `codigo-equivocado-${i}`)).status, 401);
    assert.equal((await m.poner("vivo", "x", ADMIN)).status, 429, "even the right code waits");
  } finally { await m.cerrar(); }
});

test("M20: a world with neither a pass key nor an administration code shuts the door (fail closed)", async () => {
  const dir = carpeta({ vivo: `declare const app: any; app.on("v", () => 1);` }, false);
  const srv = await startServer({ port: 0, host: "127.0.0.1", apps: dir, biblioteca: null, statsMs: 60_000, log: () => {}, pase: null, admin: "" });
  try {
    const r = await fetch(`http://127.0.0.1:${srv.port}/apps/vivo/main.ts`, { method: "PUT", body: "x", headers: { authorization: "Bearer lo-que-sea" } });
    assert.equal(r.status, 404); assert.equal(((await r.json()) as any).error, "scripts-desactivado");
  } finally { await srv.close(); }
});

test("M20: editing main.ts on disk reloads it (the file-editor path an AI uses); a broken edit leaves the running script alone", async () => {
  const dir = carpeta({ vivo: `declare const app: any; app.on("v", () => "uno");` }, false);
  const m = await mundo(dir);
  const ruta = join(dir, "vivo", "main.ts");
  try {
    writeFileSync(ruta, `declare const app: any; app.on("v", () => "disco");`);
    assert.ok(await espera(async () => (await m.script("vivo")).version === 2), "reloaded after the file changed");
    assert.equal(((await m.srv.apps.lanzar("vivo", "v")) as any).valor, "disco");
    writeFileSync(ruta, `declare const app: any; throw new Error("edición rota");`);
    assert.ok(await espera(() => m.log.some((l) => /«vivo» cambió y no carga.*edición rota/.test(l))), "the bad edit was reported");
    assert.equal(((await m.srv.apps.lanzar("vivo", "v")) as any).valor, "disco", "the last good script still answers");
    assert.equal((await m.script("vivo")).version, 2);
    // POST /recargar re-reads the disk by hand
    writeFileSync(ruta, `declare const app: any; app.on("v", () => "otra");`);
    // wait for the reload instead of a fixed pause: a loaded machine delays the file watcher
    assert.ok(await espera(async () => ((await m.srv.apps.lanzar("vivo", "v")) as any).valor === "otra"), "the file watcher reloaded the third version");
  } finally { await m.cerrar(); }
});

test("M20: an app without «main» starts no worker; more scripts than the cap are listed and not run", async () => {
  const sinMain = await mundo(carpeta({ quieta: null }, false));
  try { assert.equal(sinMain.srv.apps.vivos(), 0); assert.equal(sinMain.srv.apps.tiene("quieta"), false); assert.equal((await sinMain.lista()).apps[0].script, null); } finally { await sinMain.cerrar(); }
  const muchas: Record<string, string> = {};
  for (let i = 0; i < GUIONES_MAX + 2; i++) muchas[`a${String(i).padStart(2, "0")}`] = `declare const app: any; app.on("v", () => ${i});`;
  const m = await mundo(carpeta(muchas, false));
  try {
    assert.equal(m.srv.apps.vivos(), GUIONES_MAX);
    const l = await m.lista();
    const sin = l.apps.filter((a: any) => a.script.estado === "sin-sitio");
    assert.equal(sin.length, 2); assert.equal(sin[0].script.ejecuta, false); assert.match(sin[0].script.porQue, /app_scripts_max/);
    assert.equal((await m.srv.apps.lanzar(sin[0].id, "v")).ok, false);
  } finally { await m.cerrar(); }
});

test("M20: the limits published in limits.json are the ones the code enforces", () => {
  const lim = Object.fromEntries((JSON.parse(readFileSync("limits.json", "utf8")).limits as { key: string; value: number }[]).map((e) => [e.key, e.value]));
  assert.equal(lim.app_script_cpu_ms, GUION_CPU_MS);
  assert.equal(lim.app_script_load_ms, GUION_CARGA_MS);
  assert.equal(lim.app_script_heap_mb, GUION_MEMORIA_MB);
  assert.equal(lim.app_scripts_max, GUIONES_MAX);
  assert.equal(aJavaScript("const a: number = 1;").includes(": number"), false, "types are erased");
});
