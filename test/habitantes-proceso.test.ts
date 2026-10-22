// E1: the world container starts its own inhabitants process (packages/server/src/habitantes-proceso.ts, started by entrada.ts).
// Rules under test: no inhabitants → no child; inhabitants → a child with the right environment (and not the world's keys);
// MOTOR_HABITANTES=no → none; a child that dies comes back (backoff); the folder changing reloads it; stopping the server stops it.
// The supervisor is tested with a fake process; the last test runs the real entrada.ts with its real child.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { EventEmitter } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HEAP_MB, contarHabitantes, crearSupervisor, entornoDelHijo, firmaDeHabitantes, planHabitantes, prepararHabitantes, secretoDeAgentes,
} from "../packages/server/src/habitantes-proceso.ts";
import type { Hijo, Lanzador } from "../packages/server/src/habitantes-proceso.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ENTRADA = new URL("../packages/server/src/entrada.ts", import.meta.url).pathname;
const AGENTE = new URL("../packages/agent/src/main.ts", import.meta.url).pathname;
const SECRETO = "s".repeat(48);

const HABITANTE = (id: string, nombre = "Nueva") => ({
  formato: "habitante@1", id, nombre, descripcion: "una IA de prueba", responsable: "Pablo", escalon: 0,
  ruta: [{ x: 0, z: 0 }], pausa: 5, saludo: { radio: 3, cada: 60, frases: ["hola"] }, respuestas: [], siNoEntiende: "no te entiendo",
});
/** An adventure folder with these inhabitants (ids) in habitantes/. */
function aventura(ids: string[]): string {
  const dir = tmp("e1-aventura-");
  mkdirSync(join(dir, "habitantes"), { recursive: true });
  for (const id of ids) anadir(dir, id);
  return dir;
}
const anadir = (dir: string, id: string) => writeFileSync(join(dir, "habitantes", `${id}.json`), JSON.stringify(HABITANTE(id), null, 2));
const quitar = (dir: string, id: string) => rmSync(join(dir, "habitantes", `${id}.json`));

/** A process that does nothing: `kill` makes it leave, like the real one on SIGTERM; `emit("exit", …)` makes it die by itself. */
class Falso extends EventEmitter implements Hijo {
  static n = 100;
  pid = Falso.n++;
  senales: string[] = [];
  kill(senal: NodeJS.Signals = "SIGTERM"): boolean { this.senales.push(senal); setImmediate(() => this.emit("exit", null, senal)); return true; }
}
type Llamada = { orden: string; args: string[]; env: Record<string, string>; cwd: string; hijo: Falso; en: number };
function lanzador(): { lanzar: Lanzador; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const lanzar: Lanzador = (orden, args, o) => { const hijo = new Falso(); llamadas.push({ orden, args, env: o.env, cwd: o.cwd, hijo, en: Date.now() }); return hijo; };
  return { lanzar, llamadas };
}
async function hasta(cond: () => boolean, ms = 3000, que = "la condición"): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) { if (Date.now() > fin) assert.fail(`no llegó ${que} en ${ms} ms`); await sleep(10); }
}
async function hastaAsync(cond: () => Promise<boolean>, ms: number, que: string | (() => string)): Promise<void> {
  const fin = Date.now() + ms;
  while (!(await cond())) { if (Date.now() > fin) assert.fail(`no llegó ${typeof que === "string" ? que : que()} en ${ms} ms`); await sleep(100); }
}
const RAPIDO = { sondeoMs: 15, esperaMs: 20, esperaMaxMs: 80 };

test("E1 plan: on by default, off with MOTOR_HABITANTES=no or an empty AVENTURA_DIR; the folder and the port are the server's own", () => {
  const p = planHabitantes({ MOTOR_MUNDO: "/mundo", PORT: "8790" });
  assert.deepEqual(p, { activo: true, aventura: "/mundo/aventura", url: "ws://127.0.0.1:8790" });
  assert.equal((planHabitantes({ MOTOR_MUNDO: "/mundo" }) as { url: string }).url, "ws://127.0.0.1:8790", "the server's default port");
  assert.equal((planHabitantes({ MOTOR_MUNDO: "/mundo", PORT: "9001", AVENTURA_DIR: "/otra" }) as { aventura: string; url: string }).aventura, "/otra", "AVENTURA_DIR wins, as in main.ts");
  assert.equal(planHabitantes({ MOTOR_MUNDO: "/mundo", MOTOR_HABITANTES: "no" }).activo, false);
  assert.equal(planHabitantes({ MOTOR_MUNDO: "/mundo", AVENTURA_DIR: "" }).activo, false, "a world with no adventure has no inhabitants");
  assert.equal(planHabitantes({ MOTOR_MUNDO: "/mundo", PORT: "no" }).activo, false);
  assert.equal(planHabitantes({ MOTOR_MUNDO: "/mundo", MOTOR_HABITANTES: "si" }).activo, true, "only «no» switches it off");
});

test("E1 count: only valid inhabitant files count (what the server itself accepts)", () => {
  assert.equal(contarHabitantes(join(tmp("e1-nada-"), "no-existe")), 0);
  assert.equal(contarHabitantes(aventura([])), 0);
  assert.equal(contarHabitantes(aventura(["bea", "cai"])), 2);
  const roto = aventura(["bea"]);
  writeFileSync(join(roto, "habitantes", "mal.json"), "{ no es json");
  writeFileSync(join(roto, "habitantes", "otro.json"), JSON.stringify({ formato: "habitante@1", id: "otro" }));
  assert.equal(contarHabitantes(roto), 1, "a broken or incomplete file is not an inhabitant");
  const ejemplo = tmp("e1-ejemplo-"); cpSync(new URL("../aventuras/ejemplo", import.meta.url).pathname, ejemplo, { recursive: true });
  assert.equal(contarHabitantes(ejemplo), 1, "the example adventure's lia");
});

test("E1 secret: the environment's own wins if long enough, else a fresh random one that is not the world's key", () => {
  assert.equal(secretoDeAgentes({ MOTOR_AGENTES_SECRET: SECRETO }), SECRETO);
  const a = secretoDeAgentes({}), b = secretoDeAgentes({ MOTOR_AGENTES_SECRET: "corto" });
  assert.match(a, /^[0-9a-f]{48}$/); assert.match(b, /^[0-9a-f]{48}$/); assert.notEqual(a, b);
  assert.notEqual(secretoDeAgentes({ JWT_SECRET: "j".repeat(64), MOTOR_SECRET: "m".repeat(48) }), "j".repeat(64), "never derived from or equal to the world's keys");
});

test("E1 environment of the child: CEREBRO_* and the plumbing in; the world's keys and everything else out", () => {
  const e = entornoDelHijo({
    PATH: "/usr/bin", LANG: "es_ES.UTF-8", NODE_ENV: "production", HOME: "/root", PORT: "8790", HOST: "0.0.0.0", STATS_MS: "30000",
    CEREBRO_CLAVE: "sk-ant-prueba", CEREBRO_MODELO: "claude-x", CEREBRO_DIA_MAX: "50", ANTHROPIC_API_KEY: "sk-ant-otra",
    JWT_SECRET: "j".repeat(64), ADMIN_CODE: "a".repeat(16), MOTOR_SECRET: "m".repeat(48), MOTOR_ADMIN: "n".repeat(48),
    MOTOR_PASE_CLAVE: "pase", AGENTE_TOKEN: "ntk_x", AGENTE_CLAVE: "k", MOTOR_AGENTES_SECRET: "viejo", MOTOR_URL: "ws://otro:1",
  }, { aventura: "/mundo/aventura", url: "ws://127.0.0.1:8790" }, SECRETO);
  assert.deepEqual(Object.keys(e).sort(), ["ANTHROPIC_API_KEY", "AVENTURA_DIR", "CEREBRO_CLAVE", "CEREBRO_DIA_MAX", "CEREBRO_MODELO", "LANG", "MOTOR_AGENTES_SECRET", "MOTOR_URL", "NODE_ENV", "PATH", "STATS_MS"]);
  assert.equal(e.MOTOR_URL, "ws://127.0.0.1:8790"); assert.equal(e.AVENTURA_DIR, "/mundo/aventura"); assert.equal(e.MOTOR_AGENTES_SECRET, SECRETO);
  assert.equal(e.CEREBRO_CLAVE, "sk-ant-prueba"); assert.equal(e.STATS_MS, "300000", "the child's own stats line every 5 min, not the server's 30 s");
  assert.equal(entornoDelHijo({}, { aventura: "/a", url: "ws://x" }, SECRETO).NODE_ENV, "production");
});

test("E1 supervisor: no inhabitants → no child, ever; the folder is only looked at", async () => {
  const { lanzar, llamadas } = lanzador();
  const dir = aventura([]);
  const s = crearSupervisor({ aventura: dir, url: "ws://127.0.0.1:1", secreto: SECRETO, env: {}, lanzar, ...RAPIDO });
  s.sincronizar();
  await sleep(120);
  assert.equal(llamadas.length, 0); assert.equal(s.corriendo, false); assert.equal(s.arranques, 0);
  s.parar();
});

test("E1 supervisor: with inhabitants → one child, node + the agent's main, right environment, capped heap", async () => {
  const { lanzar, llamadas } = lanzador();
  const dir = aventura(["bea", "cai"]);
  const log: string[] = [];
  const s = crearSupervisor({ aventura: dir, url: "ws://127.0.0.1:8123", secreto: SECRETO, env: { PATH: "/bin", CEREBRO_CLAVE: "sk-ant-prueba", JWT_SECRET: "j".repeat(64) }, lanzar, log: (l) => log.push(l), ...RAPIDO });
  s.sincronizar(); s.sincronizar(); // twice: still one
  await sleep(60);
  assert.equal(llamadas.length, 1); assert.equal(s.corriendo, true);
  const [l] = llamadas;
  assert.equal(l.orden, process.execPath);
  assert.equal(l.args.at(-1), AGENTE); assert.ok(l.args.includes(`--max-old-space-size=${HEAP_MB}`));
  assert.equal(l.env.MOTOR_URL, "ws://127.0.0.1:8123"); assert.equal(l.env.AVENTURA_DIR, dir); assert.equal(l.env.MOTOR_AGENTES_SECRET, SECRETO);
  assert.equal(l.env.CEREBRO_CLAVE, "sk-ant-prueba"); assert.equal(l.env.JWT_SECRET, undefined, "the world's key stays with the server");
  assert.ok(existsSync(join(l.cwd, "features", "objetos", "biblioteca.json")), "runs from the engine's folder, where the agent finds its library");
  assert.ok(existsSync(l.args.at(-1)!));
  assert.ok(!log.join("\n").includes(SECRETO) && !log.join("\n").includes("sk-ant"), "no secret in the log");
  s.parar();
});

test("E1 supervisor: a child that dies comes back, waiting longer while it dies young and starting over after a good run", async () => {
  const { lanzar, llamadas } = lanzador();
  const dir = aventura(["bea"]);
  const log: string[] = [];
  let t = 0;
  const s = crearSupervisor({ aventura: dir, url: "ws://x", secreto: SECRETO, env: {}, lanzar, log: (l) => log.push(l), ahora: () => t, ...RAPIDO, vivioBienMs: 10_000 });
  s.sincronizar();
  llamadas[0].hijo.emit("exit", 1, null);            // dies young: wait 20 ms
  await hasta(() => llamadas.length === 2, 1000, "el 2.º arranque");
  llamadas[1].hijo.emit("exit", 1, null);            // young again: 40 ms
  await hasta(() => llamadas.length === 3, 1000, "el 3.º arranque");
  assert.ok(llamadas[2].en - llamadas[1].en >= 30, `waited ~40 ms, not ${llamadas[2].en - llamadas[1].en}`);
  llamadas[2].hijo.emit("exit", null, "SIGKILL"); // 80 ms (the cap)
  await hasta(() => llamadas.length === 4, 1000, "el 4.º arranque");
  t += 20_000; llamadas[3].hijo.emit("exit", 0, null); // lived well: back to the first wait
  await hasta(() => llamadas.length === 5, 1000, "el 5.º arranque");
  assert.deepEqual(log.filter((l) => l.includes("vuelvo a probar")).map((l) => /en ([\d.]+) s/.exec(l)![1]), ["0.02", "0.04", "0.08", "0.02"]);
  assert.match(log.join("\n"), /señal SIGKILL/);
  s.parar();
  assert.equal(s.corriendo, false);
});

test("E1 supervisor: stopping stops the child (SIGTERM) and nothing comes back", async () => {
  const { lanzar, llamadas } = lanzador();
  const s = crearSupervisor({ aventura: aventura(["bea"]), url: "ws://x", secreto: SECRETO, env: {}, lanzar, ...RAPIDO });
  s.sincronizar();
  s.parar(); s.parar(); // twice is fine
  assert.deepEqual(llamadas[0].hijo.senales, ["SIGTERM"]);
  await sleep(150);
  assert.equal(llamadas.length, 1, "no restart after stopping");
  s.recargar(); s.sincronizar();
  assert.equal(llamadas.length, 1, "and a stopped supervisor ignores reloads");
});

test("E1 supervisor: the reload — the first inhabitant added starts it, a change restarts it, the last one removed stops it", async () => {
  const { lanzar, llamadas } = lanzador();
  const dir = aventura([]);
  const log: string[] = [];
  const s = crearSupervisor({ aventura: dir, url: "ws://x", secreto: SECRETO, env: {}, lanzar, log: (l) => log.push(l), ...RAPIDO });
  s.sincronizar();
  assert.equal(llamadas.length, 0);
  anadir(dir, "bea");                                 // build mode adds the first one
  await hasta(() => llamadas.length === 1, 1000, "el arranque con el primero");
  anadir(dir, "cai");                                 // a second: the child reads habitantes/ only at its start → restart
  await hasta(() => llamadas.length === 2, 1000, "el reinicio");
  assert.deepEqual(llamadas[0].hijo.senales, ["SIGTERM"]); assert.deepEqual(llamadas[1].hijo.senales, []);
  writeFileSync(join(dir, "habitantes", "bea.json"), JSON.stringify({ ...HABITANTE("bea"), nombre: "Beatriz" })); // edited in place
  await hasta(() => llamadas.length === 3, 1000, "el reinicio por editar un fichero");
  quitar(dir, "bea");
  await hasta(() => llamadas.length === 4, 1000, "el reinicio al quitar uno");
  quitar(dir, "cai");                                 // the last one: no inhabitants, no process
  await hasta(() => !s.corriendo, 1000, "parar sin habitantes");
  await sleep(150);
  assert.equal(llamadas.length, 4, "no child without inhabitants, and the old one's exit is not taken for a crash");
  assert.ok(!log.some((l) => l.includes("terminaron")), log.join("\n"));
  assert.equal(firmaDeHabitantes(dir), "");
  anadir(dir, "dan");                                 // and back
  await hasta(() => llamadas.length === 5 && s.corriendo, 1000, "volver a arrancar");
  s.parar();
});

test("E1 prepare: MOTOR_HABITANTES=no touches nothing; otherwise the server gets the agents' secret and no systemctl reload", () => {
  const apagado: Record<string, string | undefined> = { MOTOR_MUNDO: "/mundo", MOTOR_HABITANTES: "no" };
  const log: string[] = [];
  assert.equal(prepararHabitantes(apagado, (l) => log.push(l)), null);
  assert.deepEqual(Object.keys(apagado).sort(), ["MOTOR_HABITANTES", "MOTOR_MUNDO"], "off: the environment is left as it was");
  assert.match(log.join("\n"), /MOTOR_HABITANTES=no/);

  const dir = aventura([]);
  const env: Record<string, string | undefined> = { MOTOR_MUNDO: join(dir, ".."), AVENTURA_DIR: dir, PORT: "8800" };
  const { lanzar, llamadas } = lanzador();
  const p = prepararHabitantes(env, (l) => log.push(l), { lanzar, ...RAPIDO })!;
  assert.ok(p);
  assert.match(env.MOTOR_AGENTES_SECRET!, /^[0-9a-f]{48}$/); assert.equal(env.MOTOR_HABITANTES_SIN_RECARGA, "1");
  const s = p.arrancar();
  assert.equal(llamadas.length, 0, "a world with no inhabitants starts nothing");
  assert.match(log.join("\n"), /no tiene habitantes/);
  anadir(dir, "bea");
  return hasta(() => llamadas.length === 1, 1000, "el arranque").then(() => {
    assert.equal(llamadas[0].env.MOTOR_AGENTES_SECRET, env.MOTOR_AGENTES_SECRET, "server and child hold the same secret");
    assert.equal(llamadas[0].env.MOTOR_URL, "ws://127.0.0.1:8800");
    s.parar();
  });
});

test("E1 prepare: a secret from the environment is kept (the fleet may bring its own)", () => {
  const env: Record<string, string | undefined> = { AVENTURA_DIR: aventura([]), MOTOR_AGENTES_SECRET: SECRETO };
  assert.ok(prepararHabitantes(env));
  assert.equal(env.MOTOR_AGENTES_SECRET, SECRETO);
});

test("installer: the engine's systemd unit says MOTOR_HABITANTES=no, so the unit numinia-habitantes is the only copy", () => {
  const tpl = readFileSync(new URL("../deploy/instalar-motor.plantilla.sh", import.meta.url), "utf8");
  const motor = tpl.slice(tpl.indexOf('cat > "/etc/systemd/system/$SERVICE.service"'), tpl.indexOf('systemctl restart "$SERVICE"'));
  assert.match(motor, /^Environment=.*\bMOTOR_HABITANTES=no\b.*$/m);
  assert.match(motor, /ExecStart=\$PREFIX\/node\/bin\/node packages\/server\/src\/main\.ts/, "the unit runs main.ts, never entrada.ts");
});

// ---------- the real thing: entrada.ts with its real child ----------
// numinia.com's world pass (the panel's way to add an inhabitant: POST /habitantes with manage-organization), as in habitantes-http.test.ts
const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const MUNDO_ID = "e1-mundo";
const GESTOR = (() => {
  const ahora = Math.floor(Date.now() / 1000);
  const carga = { v: 1, iss: "numinia.com", aud: MUNDO_ID, sub: `p_${"a".repeat(32)}`, org: "org-1", perm: ["enter-worlds", "manage-organization"], height: 0, roles: [], iat: ahora - 5, exp: ahora + 3000 };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(carga))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
})();

function puertoLibre(): Promise<number> {
  return new Promise((ok, mal) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); s.on("error", mal); });
}
const SIN = /^(MOTOR_|JWT_SECRET|ADMIN_CODE|AVENTURA_DIR|MUNDO_DIR|DATOS_DIR|SESIONES_DIR|ACTIVOS_DIR|CEREBRO_|ANTHROPIC_|AGENTE_|INVOCATION_ID|WWW_DIR|NODE_TEST)/;
function arrancarEntrada(mundo: string, puerto: number, extra: Record<string, string> = {}) {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !SIN.test(k)) env[k] = v;
  Object.assign(env, { PORT: String(puerto), HOST: "127.0.0.1", MOTOR_MUNDO: mundo, STATS_MS: "600000", NODE_ENV: "production", ...extra });
  const p = spawn(process.execPath, [ENTRADA], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { out += d; });
  const salida = new Promise<number | null>((ok) => p.on("close", (c) => ok(c)));
  const estado = async (): Promise<{ agentes: number; agentesDe: { habitante: number } } | null> => {
    try { const r = await fetch(`http://127.0.0.1:${puerto}/status`); return r.ok ? await r.json() as never : null; } catch { return null; }
  };
  return { p, salida, estado, get log() { return out; } };
}
const vivo = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test("E1 real: entrada.ts starts the inhabitants itself, reloads them when the panel adds or removes one, and takes them down with it", { timeout: 120_000 }, async () => {
  const mundo = join(tmp("e1-real-"), "mundo");        // a new world: born with the example adventure (lia)
  const puerto = await puertoLibre();
  const r = arrancarEntrada(mundo, puerto, { MOTOR_PASE_CLAVE: RAW, MOTOR_PASE_MUNDO: MUNDO_ID });
  const pedir = (method: string, ruta: string, cuerpo?: unknown) => fetch(`http://127.0.0.1:${puerto}${ruta}`, {
    method, headers: { authorization: `Bearer ${GESTOR}`, ...(cuerpo ? { "content-type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const dentro = (cuantos: number) => async () => (await r.estado())?.agentesDe.habitante === cuantos;
  const pids = () => [...r.log.matchAll(/arranco los habitantes \(\d+\).* pid (\d+)/g)].map((m) => Number(m[1]));
  try {
    await hastaAsync(dentro(1), 40_000, () => `lia dentro (log: ${r.log})`);
    const primero = pids();
    assert.equal(primero.length, 1); assert.ok(vivo(primero[0]), "the child runs");
    assert.ok(!/no podrán entrar como IA/.test(r.log), "the server has the agents' secret");
    assert.ok(!/systemctl|no he podido recargar/.test(r.log), "no systemd reload attempted in the image");
    // the panel adds a second inhabitant: the server writes the file and reads it; the poll restarts the child
    const alta = await pedir("POST", "/habitantes", HABITANTE("bea"));
    assert.equal(alta.status, 201, await alta.text());
    await hastaAsync(dentro(2), 40_000, () => `bea y lia dentro (log: ${r.log})`);
    assert.equal(pids().length, 2, "restarted once");
    await hasta(() => !vivo(primero[0]), 5000, "el primer hijo se fue");
    // …and removes it again
    assert.equal((await pedir("DELETE", "/habitantes/bea")).status, 200);
    await hastaAsync(dentro(1), 40_000, () => `solo lia (log: ${r.log})`);
    // the last one removed: no inhabitants, no process
    assert.equal((await pedir("DELETE", "/habitantes/lia")).status, 200);
    await hastaAsync(dentro(0), 40_000, () => `nadie (log: ${r.log})`);
    await hasta(() => !vivo(pids().at(-1)!), 5000, "el último hijo se fue al quedar sin habitantes");
    assert.match(r.log, /ya no tiene habitantes/);
    // and the first one added again starts the process again
    assert.equal((await pedir("POST", "/habitantes", HABITANTE("cai"))).status, 201);
    await hastaAsync(dentro(1), 40_000, () => `cai (log: ${r.log})`);
    assert.ok(vivo(pids().at(-1)!));
    assert.ok(!/terminaron/.test(r.log), `no restart was taken for a crash (log: ${r.log})`);
  } finally {
    r.p.kill("SIGTERM");
  }
  assert.equal(await r.salida, 0, r.log);
  await hasta(() => !vivo(pids().at(-1)!), 5000, "el hijo se va con el servidor");
});

test("E1 real: MOTOR_HABITANTES=no → no child, nobody inside; and a world with no inhabitants starts none", { timeout: 90_000 }, async () => {
  for (const caso of ["apagado", "vacio"] as const) {
    const mundo = join(tmp("e1-real-"), "mundo");
    mkdirSync(join(mundo, "aventura"), { recursive: true }); // a world with an adventure of its own and no habitantes/
    if (caso === "apagado") cpSync(new URL("../aventuras/ejemplo/habitantes", import.meta.url).pathname, join(mundo, "aventura", "habitantes"), { recursive: true });
    const puerto = await puertoLibre();
    const r = arrancarEntrada(mundo, puerto, caso === "apagado" ? { MOTOR_HABITANTES: "no" } : {});
    try {
      await hastaAsync(async () => (await r.estado()) !== null, 40_000, () => `el servidor (log: ${r.log})`);
      await sleep(3500); // longer than one look at the folder
      assert.equal((await r.estado())!.agentesDe.habitante, 0, caso);
      assert.ok(!/arranco los habitantes/.test(r.log), `${caso}: no child (log: ${r.log})`);
      assert.match(r.log, caso === "apagado" ? /MOTOR_HABITANTES=no/ : /no tiene habitantes/);
    } finally { r.p.kill("SIGTERM"); }
    assert.equal(await r.salida, 0, r.log);
  }
});
