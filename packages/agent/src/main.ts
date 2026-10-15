// habitantes (P4): the inhabitants' service — a process APART from the engine (an LLM, or a slow script, must never
// sit in the tick's path: DISENO-IAS-MOTOR.md D2). It reads the adventure's `habitantes/` folder, and each inhabitant
// enters the world over the same WebSocket a person uses, with an agent ticket signed with MOTOR_AGENTES_SECRET (the
// engine gives it its name + « · IA»). If the engine restarts, they come back by themselves.
// Run: MOTOR_AGENTES_SECRET=… node packages/agent/src/main.ts   (installed: systemd service numinia-habitantes)
//   MOTOR_URL      ws://127.0.0.1:8790 by default (the engine on this machine; never through Caddy)
//   AVENTURA_DIR   aventuras/ejemplo by default (the same folder the engine reads)
//   HABITANTES_COPIAS=N   to MEASURE: N bodies of each inhabitant (same name), D1/D2 of the design
//   STATS_MS       one «[habitantes]» line every 60 s by default (alive, CPU, memory)
// The brain (P5a, mente.ts) for inhabitants with escalón 2 or 4 — without a key they answer with their script:
//   CEREBRO_CLAVE  the provider key (installed: /opt/numinia-engine/cerebro.env, made by `instalar-motor.sh --clave-ia`)
//   CEREBRO_MODELO the model (default cerebro.ts MODELO_POR_DEFECTO) · CEREBRO_DIA_MAX calls a day for all (300)
//   CEREBRO_MINUTO calls a minute per inhabitant (6) · CEREBRO_ECO=1 the echo brain (QA: no provider, no key)
//   MOTOR_BIBLIOTECA what it may place (default features/objetos/biblioteca.json, the engine's house library)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { webSocketClient } from "../../net/src/index.ts";
import { emitirAgente, today } from "../../instance/src/identidad.ts";
import { Cuerpo } from "./index.ts";
import { Guion, HZ } from "./guion.ts";
import { Mente } from "./mente.ts";
import type { Modelo3D } from "./mente.ts";
import { cerebroClaude, cerebroEco, Topes } from "./cerebro.ts";
import type { Cerebro } from "./cerebro.ts";
import { leerHabitantes } from "./formato.ts";
import type { Habitante } from "./formato.ts";
import { createHmac } from "node:crypto";

const url = process.env.MOTOR_URL ?? "ws://127.0.0.1:8790";
const dir = process.env.AVENTURA_DIR ?? "aventuras/ejemplo";
const copias = Math.max(1, Math.min(200, Number(process.env.HABITANTES_COPIAS ?? 1) || 1));
const secreto = process.env.MOTOR_AGENTES_SECRET ?? "";
const log = (l: string) => console.log(`[habitantes] ${l}`);
if (secreto.length < 16) { log("falta MOTOR_AGENTES_SECRET (16 caracteres o más): sin él el motor no los reconoce. Me paro."); process.exit(2); }
const sign = (text: string) => createHmac("sha256", secreto).update(text).digest("hex").slice(0, 24); // = server/secret.ts signer

function ficheros(): { fichero: string; texto: string }[] {
  const d = join(dir, "habitantes");
  let nombres: string[] = [];
  try { nombres = readdirSync(d).filter((n) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}\.json$/.test(n)).sort(); } catch { return []; }
  return nombres.filter((n) => statSync(join(d, n)).size <= 64 * 1024).map((n) => ({ fichero: `habitantes/${n}`, texto: readFileSync(join(d, n), "utf8") }));
}

// the brain: one for all the inhabitants of this service, with shared caps (the key never reaches a log)
const clave = process.env.CEREBRO_CLAVE ?? process.env.ANTHROPIC_API_KEY ?? "";
let cerebro: Cerebro | null = null;
if (process.env.CEREBRO_ECO === "1") cerebro = cerebroEco();
else if (clave) { try { cerebro = cerebroClaude({ clave, modelo: process.env.CEREBRO_MODELO }); } catch (e) { log(`cerebro: ${(e as Error).message}`); } }
const topes = new Topes({ alDia: Number(process.env.CEREBRO_DIA_MAX ?? 300) || 300, porMinuto: Number(process.env.CEREBRO_MINUTO ?? 6) || 6 });
let biblioteca: Modelo3D[] = [];
try {
  const b = JSON.parse(readFileSync(process.env.MOTOR_BIBLIOTECA ?? "features/objetos/biblioteca.json", "utf8")) as { modelos?: Modelo3D[] };
  biblioteca = (b.modelos ?? []).filter((m) => /^[a-z0-9-]{1,32}$/.test(m.id) && /^[0-9a-f]{64}$/.test(m.modelo)).map(({ id, nombre, modelo }) => ({ id, nombre, modelo }));
} catch { /* without the library it can talk, not place */ }

const { habitantes, problemas } = leerHabitantes(ficheros());
for (const p of problemas) log(`NO se carga: ${p}`);
if (!habitantes.length) { log(`ningún habitante en ${dir}/habitantes; me quedo esperando (systemctl stop numinia-habitantes para quitarme)`); setInterval(() => {}, 1 << 30); }

type Vivo = { h: Habitante; g: Guion | null; espera: number; dentro: boolean; diario: number; nombrado: boolean };
const vivos: Vivo[] = habitantes.flatMap((h) => Array.from({ length: copias }, () => ({ h, g: null, espera: 0, dentro: false, diario: 0, nombrado: false })));

async function entrar(v: Vivo): Promise<void> {
  const t = webSocketClient(url);
  try { await t.opened; } catch { return reintentar(v, "no llego al motor"); }
  const c = new Cuerpo(t, emitirAgente(sign, v.h.id, today()));
  v.g = new Guion(c, v.h); v.dentro = true; v.espera = 0; v.nombrado = false;
  if (cerebro && v.h.escalon >= 2) new Mente({ guion: v.g, cerebro, topes, biblioteca, log }); // it plugs into the script
  t.closed.then(() => { v.g = null; v.dentro = false; reintentar(v, "el motor cerró la conexión"); });
}
function reintentar(v: Vivo, porque: string): void {
  v.espera = Math.min(30, Math.max(2, v.espera * 2));
  if (copias === 1) log(`${v.h.id}: ${porque}; vuelvo a probar en ${v.espera} s`);
  setTimeout(() => void entrar(v), v.espera * 1000);
}

for (const v of vivos) await entrar(v);
log(`${vivos.filter((v) => v.dentro).length} de ${vivos.length} dentro de ${url}: ${habitantes.map((h) => `${h.nombre} (${h.id}, E${h.escalon})`).join(", ")}${copias > 1 ? ` × ${copias} copias` : ""}`);
const conCerebro = habitantes.filter((h) => h.escalon >= 2);
if (conCerebro.length) log(cerebro ? `cerebro: ${cerebro.nombre} para ${conCerebro.map((h) => h.nombre).join(", ")} · topes ${topes.porMinuto}/min por habitante, ${topes.porPersonaMinuto}/min por persona, ${topes.alDia}/día · ${biblioteca.length} modelos para colocar`
  : `sin clave de cerebro (CEREBRO_CLAVE): ${conCerebro.map((h) => h.nombre).join(", ")} contestan con su guion`);

// one clock for all: 20 Hz, like a page; the script decides at most a few things per second
let paso = 0;
setInterval(() => {
  paso++;
  for (const v of vivos) {
    if (!v.g) continue;
    v.g.paso();
    if (!v.nombrado && v.g.c.nombre) { v.nombrado = true; if (copias === 1) log(`${v.h.id}: el motor me llama «${v.g.c.nombre}» (entidad ${v.g.c.entidad})`); }
    if (copias === 1) while (v.diario < v.g.diario.length) log(`${v.h.id}: ${v.g.diario[v.diario++]}`); // what it did and why
    if (v.g.diario.length > 200) { v.g.diario.splice(0, 100); v.diario = Math.max(0, v.diario - 100); }
  }
}, 1000 / HZ);

let cpu0 = process.cpuUsage(), t0 = performance.now();
setInterval(() => {
  const c = process.cpuUsage(cpu0), ms = performance.now() - t0;
  const u = topes.uso, gasto = u.llamadas || u.negadas ? ` · cerebro hoy ${topes.llamadasHoy}/${topes.alDia} (negadas ${u.negadas}; tokens ${u.entrada} entrada, ${u.cache} caché, ${u.salida} salida)` : "";
  log(`dentro ${vivos.filter((v) => v.dentro).length} de ${vivos.length}${gasto} · CPU ${(((c.user + c.system) / 1000 / ms) * 100).toFixed(1)} % de un núcleo · memoria ${Math.round(process.memoryUsage().rss / 1048576)} MB · paso ${paso}`);
  cpu0 = process.cpuUsage(); t0 = performance.now();
}, Number(process.env.STATS_MS ?? 60000)).unref();

for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => process.exit(0));
