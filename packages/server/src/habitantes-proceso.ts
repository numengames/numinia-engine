// habitantes-proceso (E1): the world container starts its OWN inhabitants process.
// The AI inhabitants (aventura/habitantes/*.json, habitante@1) are walked and talked by a process APART from the engine
// (packages/agent/src/main.ts: an LLM or a slow script must never sit in the tick, DISENO-IAS-MOTOR.md D2). A systemd
// install runs it as its own unit (numinia-habitantes); the container image had nobody to start it, so a world uploaded
// with inhabitants showed none. `entrada.ts` (the image's ENTRYPOINT) now calls this module: when the world has at least
// one inhabitant it starts that same process as a child, talking to this server on 127.0.0.1, and keeps it alive.
//
// Rules (one place, so the README and the tests quote the same):
//  - Only `entrada.ts` asks for it. A systemd install runs `main.ts` directly and its own unit, so it never gets a second
//    copy; the installer also sets MOTOR_HABITANTES=no on the engine unit, should that ever change.
//  - MOTOR_HABITANTES=no turns it off. AVENTURA_DIR= (empty: a world with no adventure) turns it off too.
//  - No inhabitants in the adventure = no child process. The folder is looked at every 2 s (a readdir): the first
//    inhabitant added in build mode starts the child, the last one removed stops it, any other change restarts it (the
//    child reads habitantes/ only once, at its own start). That poll IS the reload: the server's default reload calls
//    `systemctl`, which a container does not have, so it is switched off (MOTOR_HABITANTES_SIN_RECARGA=1).
//  - Auth: the child signs its agent tickets with MOTOR_AGENTES_SECRET and the server verifies them with the same one.
//    Nobody has to write a file: if the environment does not bring one (>= 16 characters), a random one is made for this
//    run, in memory, and handed to the server and to the child only. It is never logged, never in the world's folder.
//  - The child gets a short environment (PATH, locale, NODE_ENV, CEREBRO_*, ANTHROPIC_API_KEY, the CA files), NOT the world's
//    keys (JWT_SECRET, MOTOR_SECRET, ADMIN_CODE, MOTOR_ADMIN, the pass key): like the systemd unit, it can make agent
//    identities and never guest ones or the administration code. CEREBRO_CLAVE & co. pass through; without a key the
//    inhabitants answer from their script, as always.
//  - Dies = comes back (5 s, doubling up to 60 s while it keeps dying young, like Restart=always RestartSec=5). The server
//    stopping (SIGTERM, SIGINT, exit) stops it. It runs at nice 10 with its heap capped (the systemd unit's MemoryMax=256M).
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { setPriority } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { leerHabitantes } from "../../agent/src/formato.ts";
import { AVENTURA_NOMBRE, lectorAventura } from "./aventura.ts";
import { MIN_SECRET } from "./secret.ts";

/** The engine's folder (where packages/ and features/ are): the child runs from there, as the systemd unit does. */
const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
const AGENTE = fileURLToPath(new URL("../../agent/src/main.ts", import.meta.url));

export const SONDEO_MS = 2000;       // how often habitantes/ is looked at
export const ESPERA_MS = 5000;       // RestartSec=5
export const ESPERA_MAX_MS = 60_000; // the longest wait between two starts of a child that keeps dying
export const VIVIO_BIEN_MS = 60_000; // a child that lived this long starts the next wait from ESPERA_MS again
export const HEAP_MB = 192;          // --max-old-space-size of the child (~160 MB measured RSS with 15 inhabitants)

/** What the child may inherit from the server's environment (everything else is left out on purpose). */
const HEREDA = /^(PATH|LANG|LANGUAGE|LC_[A-Z]+|TZ|NODE_ENV|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|CEREBRO_[A-Z_]+|ANTHROPIC_API_KEY|MOTOR_BIBLIOTECA)$/;

type Env = Record<string, string | undefined>;

export type Plan = { activo: false; motivo: string } | { activo: true; aventura: string; url: string };

/** Should this server run its inhabitants itself, and for which adventure folder and port? Pure: reads only `env`. */
export function planHabitantes(env: Env): Plan {
  if (env.MOTOR_HABITANTES === "no") return { activo: false, motivo: "MOTOR_HABITANTES=no" };
  if (env.AVENTURA_DIR === "") return { activo: false, motivo: "AVENTURA_DIR vacío: el mundo no tiene aventura" };
  // the same folder the server reads (main.ts): AVENTURA_DIR, else <MOTOR_MUNDO>/aventura, else the example
  const aventura = resolve(env.AVENTURA_DIR ?? (env.MOTOR_MUNDO ? join(env.MOTOR_MUNDO, "aventura") : "aventuras/ejemplo"));
  const puerto = Number(env.PORT ?? 8790);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) return { activo: false, motivo: `PORT «${env.PORT}» no es un puerto` };
  return { activo: true, aventura, url: `ws://127.0.0.1:${puerto}` };
}

/** How many valid inhabitants the adventure has: exactly what the server reads to know who may enter as an AI. */
export function contarHabitantes(aventura: string): number {
  return leerHabitantes(lectorAventura(aventura)("habitantes")).habitantes.length;
}

/** The agents' secret: the environment's own if it is long enough, else a fresh random one (memory only). */
export function secretoDeAgentes(env: Env): string {
  const dado = env.MOTOR_AGENTES_SECRET;
  return dado && dado.length >= MIN_SECRET ? dado : randomBytes(24).toString("hex");
}

/** The environment of the child: the short list above + where the server is, which adventure, and the agents' secret. */
export function entornoDelHijo(env: Env, plan: { aventura: string; url: string }, secreto: string): Record<string, string> {
  const hijo: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && HEREDA.test(k)) hijo[k] = v;
  hijo.NODE_ENV ??= "production";
  hijo.STATS_MS = env.MOTOR_HABITANTES_STATS_MS ?? "300000"; // the child's own «[habitantes] dentro N de M» line: every 5 min, like the unit
  hijo.MOTOR_URL = plan.url;
  hijo.AVENTURA_DIR = plan.aventura;
  hijo.MOTOR_AGENTES_SECRET = secreto;
  return hijo;
}

/** A fingerprint of habitantes/ (names, sizes, mtimes) to notice a change without reading the files. */
export function firmaDeHabitantes(aventura: string): string {
  const d = join(aventura, "habitantes");
  let nombres: string[];
  try { nombres = readdirSync(d); } catch { return ""; }
  const partes: string[] = [];
  for (const n of nombres.filter((x) => AVENTURA_NOMBRE.test(x)).sort()) {
    try { const st = statSync(join(d, n)); if (st.isFile()) partes.push(`${n}:${st.size}:${Math.floor(st.mtimeMs)}`); } catch { /* gone between readdir and stat */ }
  }
  return partes.join("|");
}

/** The part of a child process the supervisor uses (a real ChildProcess has it; the tests bring a fake). */
export type Hijo = {
  pid?: number;
  kill(senal?: NodeJS.Signals): boolean;
  on(evento: "exit", cb: (codigo: number | null, senal: NodeJS.Signals | null) => void): unknown;
  on(evento: "error", cb: (e: Error) => void): unknown;
};
export type Lanzador = (orden: string, args: string[], o: { env: Record<string, string>; cwd: string }) => Hijo;

const lanzadorReal: Lanzador = (orden, args, o) => spawn(orden, args, { cwd: o.cwd, env: o.env, stdio: ["ignore", "inherit", "inherit"] });

export type OpcionesSupervisor = {
  aventura: string; url: string; secreto: string;
  env?: Env;
  log?: (l: string) => void;
  lanzar?: Lanzador;
  sondeoMs?: number; esperaMs?: number; esperaMaxMs?: number; vivioBienMs?: number;
  ahora?: () => number;
};
export type Supervisor = {
  /** Look at habitantes/ now: start the child if there are inhabitants and none runs, stop it if there are none. */
  sincronizar(): void;
  /** Restart the child so it reads habitantes/ again (or start/stop it as `sincronizar`). */
  recargar(): void;
  /** Stop the child and never start it again. */
  parar(): void;
  readonly corriendo: boolean;
  readonly arranques: number;
};

export function crearSupervisor(o: OpcionesSupervisor): Supervisor {
  const log = (l: string) => (o.log ?? (() => {}))(`[habitantes-proceso] ${l}`);
  const lanzar = o.lanzar ?? lanzadorReal;
  const espera0 = o.esperaMs ?? ESPERA_MS, esperaMax = o.esperaMaxMs ?? ESPERA_MAX_MS, vivioBien = o.vivioBienMs ?? VIVIO_BIEN_MS;
  const ahora = o.ahora ?? (() => Date.now());
  const entorno = entornoDelHijo(o.env ?? process.env, o, o.secreto);
  let hijo: Hijo | null = null;
  let parado = false, recargando = false, arranques = 0;
  let espera = espera0, jovenes = 0, desde = 0, vista = "", avisoVacio = false; // jovenes: deaths in a row before a good run
  let reintento: ReturnType<typeof setTimeout> | null = null;
  const detenidos = new WeakSet<Hijo>(); // children this supervisor asked to leave: their exit is not a crash

  const quitarReintento = () => { if (reintento) { clearTimeout(reintento); reintento = null; } };

  /** SIGTERM now (the agent exits on it); SIGKILL 3 s later for one that does not. */
  function matar(h: Hijo): void {
    detenidos.add(h);
    try { h.kill("SIGTERM"); } catch { /* already gone */ }
    const duro = setTimeout(() => { try { h.kill("SIGKILL"); } catch { /* already gone */ } }, 3000);
    duro.unref();
    h.on("exit", () => clearTimeout(duro));
  }

  function esperarYVolver(porque: string): void {
    const vivio = ahora() - desde;
    if (vivio >= vivioBien) jovenes = 0;
    espera = Math.min(esperaMax, espera0 * 2 ** jovenes); // 5 s, then 10, 20, 40, 60 while it keeps dying young
    if (vivio < vivioBien) jovenes++;
    log(`los habitantes terminaron (${porque}) tras ${Math.round(vivio / 1000)} s; vuelvo a probar en ${espera / 1000} s`);
    quitarReintento();
    reintento = setTimeout(() => { reintento = null; sincronizar(); }, espera);
    reintento.unref();
  }

  function arrancar(n: number): void {
    arranques++; avisoVacio = false;
    vista = firmaDeHabitantes(o.aventura);
    desde = ahora();
    let h: Hijo;
    try {
      // the child needs only the engine's own sources: node, then the agent's main; its heap is capped (light by design)
      h = lanzar(process.execPath, [...process.execArgv, `--max-old-space-size=${HEAP_MB}`, AGENTE], { env: entorno, cwd: RAIZ });
    } catch (e) { return esperarYVolver(`no pude lanzarlos: ${(e as Error).message}`); }
    hijo = h;
    log(`arranco los habitantes (${n}) contra ${o.url}, leyendo ${o.aventura}/habitantes${h.pid ? ` · pid ${h.pid}` : ""}`);
    if (h.pid) { try { setPriority(h.pid, 10); } catch { /* the unit's Nice=10; not allowed here = normal priority */ } }
    let salido = false;
    const alSalir = (porque: string) => {
      if (salido) return; salido = true;
      if (hijo === h) hijo = null;
      if (parado || detenidos.has(h)) {
        if (recargando && !parado && hijo === null) { recargando = false; log("habitantes recargados: los vuelvo a arrancar"); sincronizar(); }
        return;
      }
      esperarYVolver(porque);
    };
    h.on("exit", (codigo, senal) => alSalir(senal ? `señal ${senal}` : `código ${codigo}`));
    h.on("error", (e) => alSalir(`no pude lanzarlos: ${e.message}`));
  }

  function sincronizar(): void {
    if (parado) return;
    vista = firmaDeHabitantes(o.aventura);
    const n = contarHabitantes(o.aventura);
    if (n === 0) {
      quitarReintento();
      if (hijo) { matar(hijo); hijo = null; recargando = false; }
      if (arranques > 0 && !avisoVacio) { avisoVacio = true; log("el mundo ya no tiene habitantes: no queda proceso que mantener"); }
      return;
    }
    if (!hijo && !reintento) arrancar(n);
  }

  function recargar(): void {
    if (parado) return;
    if (hijo) { recargando = true; matar(hijo); return; } // its exit starts it again (or not, if none are left)
    quitarReintento(); // a change is a reason to try now, not after the wait
    sincronizar();
  }

  const sondeo = setInterval(() => {
    if (parado) return;
    const firma = firmaDeHabitantes(o.aventura);
    if (firma === vista) return;
    log("habitantes/ cambió");
    vista = firma;
    recargar();
  }, o.sondeoMs ?? SONDEO_MS);
  sondeo.unref();

  return {
    sincronizar, recargar,
    parar() {
      if (parado) return;
      parado = true; clearInterval(sondeo); quitarReintento();
      const h = hijo; hijo = null;
      if (h) matar(h);
    },
    get corriendo() { return hijo !== null; },
    get arranques() { return arranques; },
  };
}

export type Preparado = { plan: { aventura: string; url: string }; arrancar(): Supervisor };

/** Called by entrada.ts BEFORE the server loads: decides, and when active sets the two variables the server reads
 * (the agents' secret, the switch of its systemctl reload). Returns null when this run does not run inhabitants. */
export function prepararHabitantes(env: Env, log: (l: string) => void = () => {}, o: Partial<OpcionesSupervisor> = {}): Preparado | null {
  const plan = planHabitantes(env);
  if (!plan.activo) {
    if (env.MOTOR_HABITANTES === "no") log(`[habitantes-proceso] apagados (${plan.motivo}): este servidor no arranca habitantes`);
    return null;
  }
  const secreto = secretoDeAgentes(env);
  // the server reads the secret from its environment (server.ts) and, with the poll below doing the reload, must not call systemctl
  env.MOTOR_AGENTES_SECRET = secreto;
  env.MOTOR_HABITANTES_SIN_RECARGA = "1";
  return {
    plan,
    arrancar() {
      const sup = crearSupervisor({ ...o, aventura: plan.aventura, url: plan.url, secreto, env, log });
      sup.sincronizar();
      if (!sup.corriendo) log(`[habitantes-proceso] el mundo no tiene habitantes (${plan.aventura}/habitantes): no arranco nada; el primero que se añada los arranca`);
      return sup;
    },
  };
}
