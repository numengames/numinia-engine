// bench --escena piezas (C3): the same bench@2 method (fresh instance per round, warm-up out, ticks with and without
// a snapshot send split, whole cycles, pooled p99, rounds with spread) on a world that has the engine's pieces ON:
// every house feature (features/servidor.ts, through `conMundo` — the server's own composition), and on top a
// deterministic world: SOLIDOS solid boxes (U10), one terrain mesh built by the server's real `construirMalla` from a
// generated .glb (M6), CABLES zone triggers of the cable (D-041), CONTADORES running timers/clocks/counters (D-044),
// OBJETOS things (objetos, H1: the solids, the mesh thing and decoration), MOVEDORES rides (D-043) and CERRADURAS
// locks (D-042). The default scene (`bench.ts` without --escena) is untouched: same code path, same fingerprint.
//
// Cost per piece: every hook a feature registers (on, onTick, onJoin, onLeave, onIdentify, listen, onVuelta) is
// wrapped with a stopwatch that counts EXCLUSIVE time (a hook called from inside another feature's hook — the cable
// hearing a counter — is charged to the inner one, not twice). The rest of `inst.tick()` is the engine's own work:
// simulation (with the boxes and the mesh), solids refresh, area of interest and snapshots. The mesh rebuild runs
// off the tick (a promise; `Instance.reconstruirMalla`), so the bench lets the event loop run after every tick and
// times that too («entre ticks»): it is real CPU the server's thread spends between two ticks.
// `--sin solidos,malla,…` takes pieces out of the scene, so a piece's simulation cost (which no hook sees) is the
// difference between two runs.
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { hex } from "../../core/src/index.ts";
import { Bot, Instance } from "../../instance/src/index.ts";
import type { FeatureStorage, Saved, ServerApi, ServerPart } from "../../feature/src/index.ts";
import funciones from "../../../features/servidor.ts";
import { conMundo } from "../../../features/mundo.ts";
import { construirMalla } from "./colision-mundo.ts";
import { cuantil, entornoBanco, pct, poblacion, rondas, separar, SNAPSHOT_EVERY, TICK_MS } from "./bench.ts";
import type { Rondas } from "./bench.ts";

export const ESCENA_PIEZAS = { solidos: 200, objetosDecorado: 99, cables: 20, contadores: 10, movedores: 12, cerraduras: 5, mallaCeldas: 60, mallaLado: 80 } as const;
export const PIEZAS = ["solidos", "malla", "cable", "contadores", "objetos", "movedores", "cerradura"] as const;
export type Pieza = (typeof PIEZAS)[number];

/** A terrain .glb (glTF 2.0 binary, float positions, u32 indices): `celdas`² squares over `lado` metres centred on 0,
 * two triangles each, a gentle integer relief (centimetres) so nothing depends on Math.sin. Same bytes every time. */
export function terrenoGlb(celdas: number, lado: number): Uint8Array {
  const n = celdas + 1, pos = new Float32Array(n * n * 3), idx = new Uint32Array(celdas * celdas * 6);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 3;
    pos[o] = -lado / 2 + (i * lado) / celdas; pos[o + 1] = (((i * 7 + j * 13) % 11) - 5) / 100; pos[o + 2] = -lado / 2 + (j * lado) / celdas;
  }
  let k = 0;
  for (let j = 0; j < celdas; j++) for (let i = 0; i < celdas; i++) { // wound so the normal points up (+y)
    const a = j * n + i, b = a + 1, c = a + n + 1, d = a + n;
    idx[k++] = a; idx[k++] = d; idx[k++] = c; idx[k++] = a; idx[k++] = c; idx[k++] = b;
  }
  const pb = new Uint8Array(pos.buffer), ib = new Uint8Array(idx.buffer), bin = new Uint8Array(pb.length + ib.length);
  bin.set(pb); bin.set(ib, pb.length);
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: n * n, type: "VEC3" }, { bufferView: 1, componentType: 5125, count: idx.length, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb.length }, { buffer: 0, byteOffset: pb.length, byteLength: ib.length }],
    buffers: [{ byteLength: bin.length }],
  }));
  const jp = (4 - (json.length % 4)) % 4, total = 12 + 8 + json.length + jp + 8 + bin.length;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, json.length + jp, true); dv.setUint32(16, 0x4e4f534a, true); out.set(json, 20); out.fill(0x20, 20 + json.length, 20 + json.length + jp);
  const at = 20 + json.length + jp; dv.setUint32(at, bin.length, true); dv.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8);
  return out;
}

/** The scene's world, as the files and the saved state a real world folder would bring (all deterministic). */
export function mundoPiezas(sin: ReadonlySet<Pieza> = new Set()) {
  const E = ESCENA_PIEZAS, glb = terrenoGlb(E.mallaCeldas, E.mallaLado), mallaHash = createHash("sha256").update(glb).digest("hex");
  const r1 = (x: number) => Math.round(x * 64) / 64; // the objetos grid (PASO.pos = 1/64 m)
  const objetos: Saved["state"] = [];
  if (!sin.has("solidos")) for (let i = 0; i < E.solidos; i++) { // a 20 × 10 grid of 0,8 × 1,2 × 0,8 m boxes over the plaza
    const x = r1(-22 + (i % 20) * 2.3 + 0.5), z = r1(-22 + Math.floor(i / 20) * 4.6 + 1), h = 0.4;
    objetos.push([`s${i}`, { value: { modelo: "caja", tipo: "modelo", ext: "glb", x, y: 0, z, nombre: `Caja ${i}`, decorado: false, solido: true, colision: "caja", bx0: r1(x - h), by0: 0, bz0: r1(z - h), bx1: r1(x + h), by1: 1.2, bz1: r1(z + h) } }]);
  }
  if (!sin.has("malla")) objetos.push(["m0", { value: { modelo: mallaHash, tipo: "modelo", ext: "glb", x: 0, y: 0, z: 0, nombre: "Terreno", decorado: false, solido: true, colision: "malla" } }]);
  const decorados = sin.has("objetos") ? 0 : E.objetosDecorado;
  for (let i = 0; i < decorados; i++) objetos.push([`d${i}`, { value: { modelo: "farolillo", tipo: "modelo", ext: "glb", x: r1(-30 + (i % 11) * 6), y: 0, z: r1(-30 + Math.floor(i / 11) * 6.5), ry: (i * 37) % 360 } }]);
  const movedores = sin.has("movedores") ? [] : Array.from({ length: E.movedores }, (_, i) => ({
    id: `mov${i}`, nombre: `Plataforma ${i}`, modelo: "bloque", tipo: i < E.movedores - 2 ? "vaiven" : "interruptor",
    ax: -18 + i * 3.2, ay: 0, az: 18, bx: -18 + i * 3.2, by: 3, bz: 18, duracion: 2 + (i % 3), espera: 1, radio: 2.5, evento: `mov${i}-llega`,
  }));
  const cables = sin.has("cable") ? [] : Array.from({ length: E.cables }, (_, i) => ({
    id: `zona${i}`, nombre: `Zona ${i}`, tipo: "zona", x: -19 + (i % 5) * 9.5, z: -19 + Math.floor(i / 5) * 12.5, radio: 3, cooldown: 2,
    receptores: i % 4 === 0 && movedores.length ? [{ accion: "mueve", objeto: `mov${E.movedores - 1 - (i % 2)}` }]
      : i % 4 === 1 && decorados ? [{ accion: "oculta", objeto: `d${i}` }] : i % 4 === 2 && decorados ? [{ accion: "muestra", objeto: `d${i - 1}` }] : [{ accion: "suena", sonido: "campana" }],
  }));
  const tipos = ["cuenta_atras", "cuenta_atras", "cuenta_atras", "cuenta_atras", "cuenta_atras", "cuenta_atras", "reloj", "reloj", "contador", "contador"] as const;
  const contadores = sin.has("contadores") ? [] : Array.from({ length: E.contadores }, (_, i) => ({
    id: `cont${i}`, nombre: `Contador ${i}`, tipo: tipos[i % tipos.length], x: -16 + (i % 5) * 8, z: i < 5 ? -8 : 8, evento: `cont${i}`,
    ...(tipos[i % tipos.length] === "cuenta_atras" ? { segundos: 900 } : tipos[i % tipos.length] === "contador" ? { tope: 100 } : {}),
  }));
  const ficheros: Record<string, unknown> = {
    "contadores.json": { schema: "numinia-engine/contadores@1", contadores },
    "disparadores.json": { schema: "numinia-engine/disparadores@1", disparadores: cables },
    "movedores.json": { schema: "numinia-engine/movedores@1", movedores },
  };
  // saved state (S4), as a world folder brings it back after a restart: the objects, the running timers, the locks
  const guardado: Record<string, Saved> = {
    objetos: { version: 6, state: objetos, store: [["siguiente", 1]] },
    contadores: { version: 1, store: [], state: contadores.filter((c) => c.tipo !== "contador").map((c) => [c.id, { value: { nombre: c.nombre, tipo: c.tipo, x: c.x, y: 0, z: c.z, radio: 4, valor: c.tipo === "reloj" ? 0 : 900, inicio: c.tipo === "reloj" ? 0 : 900, tope: 0, marcha: true, donde: "ambos", evento: c.evento, manda: "dirige", equipo: "" }, at: { x: c.x, z: c.z } }]) },
    cerradura: { version: 1, store: [], state: sin.has("cerradura") ? [] : Array.from({ length: E.cerraduras }, (_, i) => [`cerr${i}`, { value: { metodo: "codigo", nombre: `Cerradura ${i}`, x: -10 + i * 5, y: 0, z: 0, evento: `cerr${i}-abre` } }]) },
  };
  return { ficheros, guardado, glb, mallaHash, cuenta: { solidos: sin.has("solidos") ? 0 : E.solidos, malla: sin.has("malla") ? 0 : 2 * E.mallaCeldas ** 2, cables: cables.length, contadores: contadores.length, objetos: objetos.length, movedores: movedores.length, cerraduras: guardado.cerradura.state.length } };
}

/** Exclusive time per feature: a stack, so a hook running inside another's (an emit heard by `listen`) is not counted twice. */
export class Cronos {
  readonly ms = new Map<string, number>();
  private pila: { inicio: number; hijos: number }[] = [];
  medir<A extends unknown[], R>(id: string, fn: (...a: A) => R): (...a: A) => R {
    return (...a: A): R => {
      const marco = { inicio: performance.now(), hijos: 0 };
      this.pila.push(marco);
      try { return fn(...a); } finally {
        const total = performance.now() - marco.inicio;
        this.pila.pop();
        this.ms.set(id, (this.ms.get(id) ?? 0) + total - marco.hijos);
        const padre = this.pila.at(-1); if (padre) padre.hijos += total;
      }
    };
  }
  /** What was counted since the last call, and back to zero. */
  vaciar(): Map<string, number> { const m = new Map(this.ms); this.ms.clear(); return m; }
}
const GANCHOS = ["on", "onTick", "onJoin", "onLeave", "onIdentify", "listen", "onVuelta"] as const;
/** The same parts with every hook they register timed under the feature's id (setup itself is not: it is the world's load). */
export function cronometrar(partes: readonly ServerPart[], c: Cronos): ServerPart[] {
  return partes.map((p) => ({ ...p, setup: (api: ServerApi) => p.setup(new Proxy(api, {
    get(t, k) {
      const v = Reflect.get(t, k, t);
      if (typeof v !== "function") return v;
      if ((GANCHOS as readonly (string | symbol)[]).includes(k)) return (...a: unknown[]) => { const i = a.length - 1; a[i] = c.medir(p.feature.id, a[i] as (...x: unknown[]) => unknown); return (v as (...x: unknown[]) => unknown).apply(t, a); };
      return v.bind(t);
    },
  })) }));
}

const memoria = (g: Record<string, Saved>): FeatureStorage => ({ load: (f) => (g[f] ? structuredClone(g[f]) : null), record() {} });
const esperarBucle = () => new Promise<void>((r) => setImmediate(r));
const fnv = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

type RondaPiezas = { envio: number[]; sinEnvio: number[]; ciclos: number[]; entre: number[]; peor: number; hash: string; piezasMs: Map<string, number>; motorMs: number; mallas: number; cambiosEstado: number; mallaLista: boolean; medidos: number };

/** One round of the piezas scene: a fresh world, `ticks` ticks (first `warmup` not timed), the event loop let run
 * after every tick (where the mesh is built), hooks timed per feature. The fingerprint is the simulation's (with the
 * boxes and the mesh it walks on) plus every feature's shared state, so a change in any piece shows. */
export async function rondaPiezas(o: { bots: number; ticks: number; warmup: number; sin?: ReadonlySet<Pieza> }): Promise<RondaPiezas> {
  const m = mundoPiezas(o.sin), c = new Cronos();
  let mallas = 0;
  const hacer = construirMalla((h, ext) => (h === m.mallaHash && ext === "glb" ? m.glb : null));
  const partes = cronometrar(conMundo(funciones, (f) => m.ficheros[f]), c);
  const inst = new Instance({ seed: 7, capacity: o.bots + 8, k: 50, snapshotEvery: SNAPSHOT_EVERY, features: partes, storage: memoria(m.guardado), random: () => 0.5, construirMalla: (objs) => { mallas++; return hacer(objs); } });
  const bots: Bot[] = [];
  for (let i = 0; i < o.bots; i++) bots.push(new Bot(inst.join(i), (7 ^ (i * 0x9e3779b1)) >>> 0));
  const ms: number[] = [], conEnvio: boolean[] = [], entre: number[] = [], piezasMs = new Map<string, number>();
  let antesEnvio = false, motorMs = 0, mallasAntes = 0, versionAntes = 0;
  for (let t = 0; t < o.ticks; t++) {
    for (const b of bots) b.think();
    c.vaciar();
    const a = performance.now();
    inst.tick();
    const d = performance.now() - a;
    const ganchos = c.vaciar();
    const b0 = performance.now();
    await esperarBucle(); // the mesh rebuild (a promise started by the tick) runs here, like between two ticks on the server
    const fuera = performance.now() - b0;
    c.vaciar(); // a hook that ran off the tick (none expected) is not charged to the tick
    const envio = inst.sim.tick % SNAPSHOT_EVERY === 0;
    if (t === o.warmup - 1) { mallasAntes = mallas; versionAntes = inst.features.stateVersion; }
    if (t < o.warmup) { antesEnvio = envio; continue; }
    ms.push(d); conEnvio.push(envio); entre.push(fuera);
    let suma = 0;
    for (const [id, x] of ganchos) { piezasMs.set(id, (piezasMs.get(id) ?? 0) + x); suma += x; }
    motorMs += d - suma;
  }
  const estado = [...inst.features.allState()].map(([k, v]) => `${k}=${JSON.stringify(v)}`).sort().join("\n");
  const hash = hex(fnv(`${hex(inst.hash())}|${estado}`));
  return { ...separar(ms, conEnvio, SNAPSHOT_EVERY, antesEnvio), entre, peor: Math.max(0, ...ms), hash, piezasMs, motorMs, mallas: mallas - mallasAntes, cambiosEstado: inst.features.stateVersion - versionAntes, mallaLista: inst.sim.mesh !== null, medidos: ms.length };
}

const r2 = (x: number) => Math.round(x * 100) / 100, r3 = (x: number) => Math.round(x * 1000) / 1000, r4 = (x: number) => Math.round(x * 10000) / 10000;
/** The pieces C3 asks about, by feature id; every other house feature goes to «otras de la casa». */
const NUESTRAS: Record<string, string> = { disparadores: "cable", contadores: "contadores", objetos: "objetos", movedores: "movedores", cerradura: "cerradura" };

export async function bancoPiezas(o: { bots: number; ticks: number; warmup: number; rounds: number; sin?: ReadonlySet<Pieza> }) {
  const ent = entornoBanco(), rs: RondaPiezas[] = [];
  for (let i = 0; i < o.rounds; i++) rs.push(await rondaPiezas(o));
  const todas = (k: "envio" | "sinEnvio" | "ciclos" | "entre") => rs.flatMap((r) => r[k]);
  const porRonda = (k: "envio" | "sinEnvio" | "ciclos" | "entre", q: number) => rondas(rs.map((r) => cuantil([...r[k]].sort((a, b) => a - b), q)));
  const pob = { conEnvio: poblacion(todas("envio")), sinEnvio: poblacion(todas("sinEnvio")), ciclo: poblacion(todas("ciclos")), entreTicks: poblacion(todas("entre")) };
  const metricas = {
    cicloP50Ms: porRonda("ciclos", 0.5), cicloP99Ms: porRonda("ciclos", 0.99),
    tickConEnvioP50Ms: porRonda("envio", 0.5), tickConEnvioP99Ms: porRonda("envio", 0.99),
    tickSinEnvioP50Ms: porRonda("sinEnvio", 0.5), tickSinEnvioP99Ms: porRonda("sinEnvio", 0.99),
    entreTicksP50Ms: porRonda("entre", 0.5), entreTicksP99Ms: porRonda("entre", 0.99),
  };
  // cost per piece: mean ms per measured tick (median over rounds), exclusive time of its hooks
  const ids = new Set(rs.flatMap((r) => [...r.piezasMs.keys()]));
  const media = (f: (r: RondaPiezas) => number): Rondas => rondas(rs.map((r) => f(r) / Math.max(1, r.medidos)));
  const porFuncion: Record<string, Rondas> = {};
  for (const id of [...ids].sort()) porFuncion[id] = media((r) => r.piezasMs.get(id) ?? 0);
  const porPieza: Record<string, number> = {};
  for (const [id, nombre] of Object.entries(NUESTRAS)) porPieza[nombre] = porFuncion[id]?.mediana ?? 0;
  porPieza["otras de la casa"] = r3([...ids].filter((id) => !(id in NUESTRAS)).reduce((a, id) => a + porFuncion[id].mediana, 0));
  porPieza["motor (sim con sólidos y malla, fotos)"] = media((r) => r.motorMs).mediana;
  porPieza["entre ticks (malla, fuera del tick)"] = media((r) => r.entre.reduce((a, b) => a + b, 0)).mediana;
  const segundos = (o.ticks - o.warmup) / (1000 / TICK_MS);
  const avisos: string[] = [];
  const nucleos = Number(ent.nucleos) || 1, carga = Number(ent.carga1m) || 0;
  if (carga > nucleos / 2) avisos.push(`NO FIABLE: carga media ${carga} con ${nucleos} núcleos (más de la mitad ocupada por otros)`);
  if (new Set(rs.map((r) => r.hash)).size > 1) avisos.push("NO FIABLE: las rondas acabaron con huellas distintas (la escena no es determinista)");
  if (!pob.conEnvio.p99Fiable) avisos.push(`p99 con pocas muestras (${pob.conEnvio.n} ticks con envío; hacen falta 1.000): súbele --ticks o --rounds`);
  if (o.rounds < 3) avisos.push("menos de 3 rondas: sin dispersión útil, banco-comparar no podrá juzgar");
  if (!(o.sin?.has("malla")) && !rs.every((r) => r.mallaLista)) avisos.push("la malla del mundo no llegó a construirse: el tick no la está pisando");
  const indice = metricas.tickConEnvioP50Ms.mediana;
  return {
    schema: "numinia-engine/bench@2", escena: "piezas", sin: [...(o.sin ?? [])].sort(), mundo: mundoPiezas(o.sin).cuenta,
    personas: o.bots, ticks: o.ticks, calentamiento: o.warmup, rondas: o.rounds,
    entorno: ent, fiable: !avisos.some((a) => a.startsWith("NO FIABLE")), avisos,
    tickP50Ms: r2(indice), tickP99Ms: r2(pob.conEnvio.p99), peorMs: r2(Math.max(...rs.map((r) => r.peor))),
    rondasP50: metricas.tickConEnvioP50Ms.rondas.map(r2), huella: rs[0].hash,
    margenSobreElTick: r2(TICK_MS / Math.max(0.01, indice)),
    margenSobreElCiclo: r2((SNAPSHOT_EVERY * TICK_MS) / Math.max(0.01, metricas.cicloP50Ms.mediana)),
    poblaciones: pob, metricas,
    // ms per tick (mean over the measured ticks, median over rounds); `porFuncion` = every feature by id
    costePorTickMs: Object.fromEntries(Object.entries(porPieza).map(([k, v]) => [k, r4(v)])), porFuncion,
    // how often the world changed: each change makes the next tick redo the solids list and ask for a mesh rebuild (`construirMalla`, even with no malla thing: it then answers null)
    cambiosDeEstadoPorSegundo: r2(median(rs.map((r) => r.cambiosEstado)) / segundos), mallaPedidaPorSegundo: r2(median(rs.map((r) => r.mallas)) / segundos),
  };
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/** `bench --escena piezas`: one JSON line on stdout, the summary on stderr (like the plaza scene). */
export async function ordenPiezas(o: { bots: number; ticks: number; warmup: number; rounds: number }, argv: readonly string[]): Promise<void> {
  const i = argv.indexOf("--sin"), sin = new Set<Pieza>();
  for (const p of i > 0 ? String(argv[i + 1] ?? "").split(",").filter(Boolean) : []) {
    if (!(PIEZAS as readonly string[]).includes(p)) { console.error(`bench: --sin ${p}: no es una pieza (${PIEZAS.join(", ")})`); process.exit(2); }
    sin.add(p as Pieza);
  }
  const r = await bancoPiezas({ ...o, sin });
  console.log(JSON.stringify(r));
  const m = r.metricas, l = (n: string, x: Rondas) => `  ${n.padEnd(22)} ${x.mediana.toFixed(2).padStart(7)} ms   (${x.min.toFixed(2)}–${x.max.toFixed(2)}, dispersión ${pct(x.dispersion)})`;
  const w = r.mundo;
  console.error([
    `bench@2 · escena piezas${r.sin.length ? ` sin ${r.sin.join(",")}` : ""} · ${o.bots} personas · ${w.solidos} sólidos · malla ${w.malla} triángulos · ${w.cables} cables · ${w.contadores} contadores · ${w.objetos} objetos · ${w.movedores} movedores · ${w.cerraduras} cerraduras`,
    `  ${o.rounds} rondas × ${o.ticks - o.warmup} ticks medidos · motor ${r.entorno.motor ?? "?"} (${r.entorno.commit ?? "?"}) · carga ${r.entorno.carga1m}`,
    l("ciclo (100 ms) p50", m.cicloP50Ms), l("tick con envío p50", m.tickConEnvioP50Ms), l("tick sin envío p50", m.tickSinEnvioP50Ms), l("entre ticks p50", m.entreTicksP50Ms),
    `  p99 de verdad (rondas juntas): con envío ${r.poblaciones.conEnvio.p99} ms (n=${r.poblaciones.conEnvio.n}) · ciclo ${r.poblaciones.ciclo.p99} ms · entre ticks ${r.poblaciones.entreTicks.p99} ms`,
    `  coste medio por tick: ${Object.entries(r.costePorTickMs).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(" · ")} ms`,
    `  el mundo cambia ${r.cambiosDeEstadoPorSegundo} veces/s; se pide rehacer la malla ${r.mallaPedidaPorSegundo} veces/s (una a la vez, en cuanto el mundo cambia; sin malla también se pregunta)`,
    `  margen: el tick con envío cabe ${r.margenSobreElTick} veces en 50 ms; el ciclo, ${r.margenSobreElCiclo} veces en 100 ms · huella ${r.huella}`,
    ...r.avisos.map((a) => `  ⚠ ${a}`),
  ].join("\n"));
}
