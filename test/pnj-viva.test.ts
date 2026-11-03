// P2 «personas vivas»: a person who is not a statue. (1) The maths of the life it has on the page — breathing and a weight shift,
// the body turning toward you, a short walk — pure functions, bounded and deterministic. (2) The format: pnj@1 `reposo`, `mira` and
// `posiciones` (where it stands for the player whose quests meet each `si`). (3) The whole thing over the real plug: two players in different
// phases see the same person in different places, the range checks use the place THIS player finds it in, the page walks it when it moves
// and keeps it facing you while you talk; a world without `posiciones` never sends a `sitio`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { cargarAventura, leerPnj, LIM } from "../features/misiones/formato.ts";
import type { Fichero } from "../features/misiones/formato.ts";
import { lugarDe } from "../features/misiones/maquina.ts";
import { nuevoProgreso } from "../features/misiones/maquina.ts";
import { pnj as pnjDecl } from "../features/misiones/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente, vidaPnj } from "../features/misiones/client.ts";
import type { PlacedObject } from "../packages/feature/src/index.ts";
import {
  BALANCEO_MAX_GRAD, BALANCEO_S, CAMINA_MAX_M, CAMINA_MS, RESPIRA_MAX, RESPIRA_S, caminaPaso, envuelve, esClipReposo, faseDe, giraHacia,
  noto, nuevoReposo, reposoDe, rumboHacia, vaACaminar, GIRO_HACIA_S, GIRO_VUELTA_S,
} from "../packages/render/src/vida.ts";

// ---------- 1. the maths ----------
test("faseDe: the same id gives the same numbers, ids differ, periods stay in their ranges", () => {
  assert.deepEqual(faseDe("sanitario"), faseDe("sanitario"));
  assert.notDeepEqual(faseDe("sanitario"), faseDe("sargento"));
  const ids = Array.from({ length: 200 }, (_, i) => `persona-${i}`);
  for (const f of ids.map(faseDe)) {
    assert.ok(f.respiraS >= RESPIRA_S[0] && f.respiraS <= RESPIRA_S[1], `respira ${f.respiraS}`);
    assert.ok(f.balanceoS >= BALANCEO_S[0] && f.balanceoS <= BALANCEO_S[1], `balanceo ${f.balanceoS}`);
    assert.ok(f.respira0 >= 0 && f.respira0 < Math.PI * 2 + 1e-9 && f.balanceo0 >= 0 && f.balanceo0 < Math.PI * 2 + 1e-9);
  }
  // never in sync: the phases of 200 people are spread, not bunched
  const fases = ids.map((id) => faseDe(id).respira0);
  assert.ok(new Set(fases.map((x) => Math.floor(x))).size >= 6, "phases cover the circle");
});

test("reposoDe: breathing ≤ 1.5 %, sway ≤ 2°, bounded for every instant, deterministic, never in sync, and it does breathe", () => {
  const r = nuevoReposo();
  for (const id of ["sanitario", "sargento", "a", "b", "ñ"]) {
    const f = faseDe(id);
    let min = 9, max = 0, inc = 0;
    for (let t = 0; t <= 600; t += 0.37) {
      reposoDe(f, t, r);
      assert.ok(r.alto >= 1 && r.alto <= 1 + RESPIRA_MAX + 1e-12, `alto ${r.alto}`);
      assert.ok(r.ancho >= 1 && r.ancho <= 1 + RESPIRA_MAX / 2 + 1e-12);
      assert.ok(Math.abs(r.inclina) <= BALANCEO_MAX_GRAD + 1e-12 && Math.abs(r.giro) <= BALANCEO_MAX_GRAD + 1e-12);
      min = Math.min(min, r.alto); max = Math.max(max, r.alto); inc = Math.max(inc, Math.abs(r.inclina));
    }
    assert.ok(max - min > RESPIRA_MAX * 0.9, `it really breathes (${max - min})`);
    assert.ok(inc > BALANCEO_MAX_GRAD * 0.9, "it really shifts its weight");
  }
  const a = nuevoReposo(), b = nuevoReposo();
  assert.deepEqual(reposoDe(faseDe("x"), 12.5, a), reposoDe(faseDe("x"), 12.5, b), "same id, same instant: same pose");
  const sinc = [0, 1.3, 2.9, 7.7, 40].filter((t) => reposoDe(faseDe("uno"), t, a).alto === reposoDe(faseDe("dos"), t, b).alto);
  assert.equal(sinc.length, 0, "two people are not in step");
});

test("giraHacia: settles in about 0.5 s toward you and about 1 s back, by the short way, no overshoot, the same at 30 and 60 fps", () => {
  const corre = (de: number, a: number, suave: number, s: number, fps: number) => {
    const e = { yaw: de, vel: 0 }; let max = 0;
    for (let i = 0; i < s * fps; i++) { giraHacia(e, a, suave, 1 / fps); max = Math.max(max, Math.abs(envuelve(e.yaw - a))); }
    return { e, max };
  };
  const hacia = corre(0, 150, GIRO_HACIA_S, 0.5, 60);
  assert.ok(Math.abs(envuelve(hacia.e.yaw - 150)) < 2, `0.5 s: ${hacia.e.yaw}`);
  const vuelta = corre(150, 0, GIRO_VUELTA_S, 1, 60);
  assert.ok(Math.abs(envuelve(vuelta.e.yaw)) < 2, `1 s back: ${vuelta.e.yaw}`);
  // eased: it does not jump on the first frame, and it ends gently
  const e = { yaw: 0, vel: 0 }; giraHacia(e, 90, GIRO_HACIA_S, 1 / 60);
  assert.ok(e.yaw > 0 && e.yaw < 5, `first frame is small: ${e.yaw}`);
  // the short way across ±180
  const c = { yaw: 170, vel: 0 }; giraHacia(c, -170, GIRO_HACIA_S, 0.05);
  assert.ok(c.yaw > 170 || c.yaw < -170, `170 → -170 goes through 180: ${c.yaw}`);
  // never past the target
  const d = { yaw: -40, vel: 0 }; let paso = 0; for (let i = 0; i < 120; i++) { giraHacia(d, 25, GIRO_HACIA_S, 1 / 60); paso = Math.max(paso, d.yaw); }
  assert.ok(paso <= 25 + 1e-9, `no overshoot: ${paso}`);
  // frame-rate independent (to a degree) and robust to a long frame
  const a30 = corre(0, 90, GIRO_HACIA_S, 0.3, 30).e.yaw, a60 = corre(0, 90, GIRO_HACIA_S, 0.3, 60).e.yaw;
  assert.ok(Math.abs(a30 - a60) < 3, `30 vs 60 fps: ${a30} ${a60}`);
  const largo = { yaw: 0, vel: 0 }; giraHacia(largo, 90, GIRO_HACIA_S, 5); // a 5 s frame counts as 0.1 s
  assert.ok(largo.yaw > 0 && largo.yaw < 90 && Number.isFinite(largo.yaw));
  const quieto = { yaw: 33, vel: 0 }; giraHacia(quieto, 33, GIRO_HACIA_S, 1 / 60);
  assert.deepEqual(quieto, { yaw: 33, vel: 0 }, "already there: nothing moves");
});

test("rumboHacia, noto, caminaPaso, vaACaminar, esClipReposo", () => {
  assert.equal(rumboHacia(0, 0, 0, 5, 77), 0, "+z is yaw 0");
  assert.equal(rumboHacia(0, 0, 5, 0, 77), 90, "+x is yaw 90");
  assert.equal(Math.abs(rumboHacia(0, 0, 0, -5, 77)), 180);
  assert.equal(rumboHacia(3, 3, 3, 3, 77), 77, "on the same point: it keeps its own");
  assert.equal(noto(3.9 ** 2, 3, false), true, "within radio + 1 m");
  assert.equal(noto(4.1 ** 2, 3, false), false);
  assert.equal(noto(100 ** 2, 3, true), true, "talking to you: it keeps facing you");
  assert.equal(noto(1, 0, false), false, "`mira: false` = 0: never");
  const o = { dx: 3, dz: 4 };
  let resta = 5; for (let i = 0; i < 10; i++) resta = caminaPaso(o, 0.1);
  assert.ok(Math.abs(resta - (5 - CAMINA_MS)) < 1e-9, "1 s closes 1.4 m");
  assert.ok(Math.abs(Math.hypot(o.dx, o.dz) - (5 - CAMINA_MS)) < 1e-9 && Math.abs(o.dx / o.dz - 0.75) < 1e-9, "straight along the line");
  const largo = { dx: 5, dz: 0 }; caminaPaso(largo, 10); assert.ok(Math.abs(largo.dx - (5 - CAMINA_MS * 0.1)) < 1e-9, "a long frame counts as 0.1 s: no leaping");
  let t = 0; while (o.dx !== 0 || o.dz !== 0) { caminaPaso(o, 1 / 60); t += 1 / 60; assert.ok(t < 10); }
  assert.ok(Math.abs(t - (5 - 1.4) / CAMINA_MS) < 0.2, `a 5 m walk takes ${t} s`);
  assert.equal(vaACaminar(0), false); assert.equal(vaACaminar(2), true); assert.equal(vaACaminar(CAMINA_MAX_M + 0.1), false);
  assert.deepEqual(["Idle", "idle_loop", "Reposo", "respira", "Walk", "Run"].map(esClipReposo), [true, true, true, true, false, false]);
});

test("CPU: the idle + turn update of 20 people stays far under a frame (µs per frame reported)", () => {
  const gente = Array.from({ length: 20 }, (_, i) => ({ f: faseDe(`p${i}`), g: { yaw: i * 10, vel: 0 }, r: nuevoReposo() }));
  const N = 20000, t0 = performance.now();
  for (let i = 0; i < N; i++) for (const p of gente) { reposoDe(p.f, i / 60, p.r); giraHacia(p.g, (i % 360) - 180, GIRO_HACIA_S, 1 / 60); }
  const us = ((performance.now() - t0) * 1000) / N;
  console.log(`# vida: ${us.toFixed(2)} µs per frame for 20 people (maths only)`);
  assert.ok(us < 200, `${us} µs`);
});

// ---------- 2. the format ----------
const base = { formato: "pnj@1", id: "sani", nombre: "Sanitario", posicion: { x: 0, z: 0 }, dialogo: { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Hola.", opciones: [{ texto: "Adiós.", accion: { tipo: "despedir" } }] } } } };
const msgs = (r: ReturnType<typeof leerPnj>) => (r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`));

test("pnj@1 `reposo`, `mira`: on unless the file says false; not a boolean is an error", () => {
  const sin = leerPnj(base);
  assert.ok(sin.ok && sin.value.reposo === true && sin.value.mira === true && sin.value.posiciones.length === 0, JSON.stringify(sin));
  const no = leerPnj({ ...base, reposo: false, mira: false });
  assert.ok(no.ok && no.value.reposo === false && no.value.mira === false);
  const mal = leerPnj({ ...base, reposo: "no", mira: 0 });
  assert.deepEqual(msgs(mal).map((m) => m.split(":")[0]), ["reposo", "mira"]);
  assert.match(msgs(mal)[0], /true o false/);
});

test("pnj@1 `posiciones`: good ones, and the Spanish errors with their path", () => {
  const ok = leerPnj({ ...base, posiciones: [{ si: [{ mision: "m", estado: "hecha" }], posicion: { x: 5, z: 6, y: 1 }, giro: 90 }, { posicion: { x: 7, z: 8 } }] });
  assert.ok(ok.ok, msgs(ok).join("; "));
  if (ok.ok) {
    assert.deepEqual(ok.value.posiciones.map((l) => [l.si.length, l.posicion.x, l.posicion.z, l.posicion.y, l.giro]), [[1, 5, 6, 1, 90], [0, 7, 8, 0, undefined]]);
  }
  const casos: [string, unknown, RegExp][] = [
    ["posiciones[0].posicion", [{ si: [], posicion: { x: 99, z: 0 } }], /a 30 m o menos de su «posicion»/],
    ["posiciones[0].posicion.x", [{ posicion: { z: 1 } }], /x/],
    ["posiciones[0].giro", [{ posicion: { x: 1, z: 1 }, giro: 400 }], /giro|-180/],
    ["posiciones[0].si", [{ si: [], posicion: { x: 1, z: 1 } }, { posicion: { x: 2, z: 2 } }], /sin «si» vale siempre: solo puede ser la última/],
    ["posiciones[0].si", [{ si: [{ mision: "m", estado: "volando" }], posicion: { x: 1, z: 1 } }], /uno de: /],
    ["posiciones[0].posicion.y", [{ posicion: { x: 1, z: 1, y: 99 } }], /y|30/],
    ["posiciones[0]", [{ posicion: { x: 1, z: 1 }, quien: 1 }], /quien/],
    ["posiciones", [], /1|lista/],
    ["posiciones", Array.from({ length: LIM.lugares + 1 }, () => ({ si: [{ mision: "m", estado: "hecha" }], posicion: { x: 1, z: 1 } })), /8/],
    ["posiciones", "aquí", /lista/],
  ];
  for (const [ruta, valor, re] of casos) {
    const r = leerPnj({ ...base, posiciones: valor });
    assert.ok(!r.ok, `${ruta} should fail`);
    assert.ok(msgs(r).some((m) => m.startsWith(ruta) && re.test(m)), `${ruta} ${re}: ${msgs(r).join(" | ")}`);
  }
});

test("pnj@1 `posiciones` conditions are checked against the missions of the adventure (a mission that does not exist is an error)", () => {
  const f = (dir: string, x: { id: string; [k: string]: unknown }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
  const m = { formato: "mision@1", id: "vuelo", titulo: "T", descripcion: "D", pasos: [{ id: "a", tipo: "habla_con", texto: "Habla", pnj: "sani" }] };
  const bien = cargarAventura({ misiones: [f("misiones", m)], pnj: [f("pnj", { ...base, posiciones: [{ si: [{ mision: "vuelo", estado: "hecha" }], posicion: { x: 3, z: 3 } }] })], cosas: [] });
  assert.deepEqual(bien.issues, []);
  const mal = cargarAventura({ misiones: [f("misiones", m)], pnj: [f("pnj", { ...base, posiciones: [{ si: [{ mision: "fantasma", estado: "hecha" }], posicion: { x: 3, z: 3 } }] })], cosas: [] });
  assert.ok(mal.issues.some((i) => i.path.includes("posiciones[0].si") && /fantasma/.test(i.message)), JSON.stringify(mal.issues));
});

test("lugarDe: the first entry whose conditions hold for THAT player; none → null (its own place)", () => {
  const f = (dir: string, x: { id: string; [k: string]: unknown }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
  const m = { formato: "mision@1", id: "vuelo", titulo: "T", descripcion: "D", pasos: [{ id: "a", tipo: "habla_con", texto: "Habla", pnj: "sani" }] };
  const r = cargarAventura({ misiones: [f("misiones", m)], pnj: [f("pnj", { ...base, posiciones: [{ si: [{ mision: "vuelo", estado: "hecha" }], posicion: { x: 3, z: 3 }, giro: 45 }, { si: [{ mision: "vuelo", estado: "activa" }], posicion: { x: 4, z: 4 } }] })], cosas: [] });
  assert.deepEqual(r.issues, []);
  const A = r.aventura, n = A.pnjs.get("sani")!, p = nuevoProgreso();
  assert.equal(lugarDe(n, p, A), null, "nothing yet: its own place");
  p.activas.vuelo = { paso: "a" } as never; // quest accepted
  assert.deepEqual(lugarDe(n, p, A)?.posicion, { x: 4, z: 4, y: 0 });
  delete p.activas.vuelo; p.hechas.push("vuelo");
  assert.equal(lugarDe(n, p, A)?.giro, 45);
});

// ---------- 3. over the real plug ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const doc = (dir: string, x: { id: string; [k: string]: unknown }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
const VUELO = { formato: "mision@1", id: "vuelo", titulo: "El vuelo", descripcion: "Habla con Bianca.", pasos: [{ id: "habla", tipo: "habla_con", texto: "Habla con Bianca", pnj: "bianca" }] };
const BIANCA = { formato: "pnj@1", id: "bianca", nombre: "Bianca", posicion: { x: -8, z: 0 }, dialogo: { entradas: [{ nodo: "hola" }], nodos: { hola: { texto: "Hola.", opciones: [{ texto: "Adiós.", accion: { tipo: "despedir" } }] } } } };
const PIETRO = { formato: "pnj@1", id: "pietro", nombre: "Pietro", posicion: { x: 0, z: 0 }, dialogo: { entradas: [{ nodo: "pide" }], nodos: { pide: { texto: "¿Nos ayudas?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision: "vuelo" } }, adios] } } } };
const charla = (t: string) => ({ entradas: [{ nodo: "hola" }], nodos: { hola: { texto: t, opciones: [adios] } } });
const COSIMO_FIJO = { formato: "pnj@1", id: "cosimo", nombre: "Cosimo", posicion: { x: 10, z: 0 }, giro: 0, dialogo: charla("Hola.") };
const COSIMO = { ...COSIMO_FIJO, posiciones: [{ si: [{ mision: "vuelo", estado: "activa" }], posicion: { x: 30, z: 0 }, giro: 90 }] };
type Dibujo = { key: string; o: PlacedObject | null };
function plaza(pnj: { id: string; [k: string]: unknown }[], opts: { posiciones?: boolean } = {}) {
  void opts;
  const aventura = { misiones: [doc("misiones", VUELO)], pnj: pnj.map((x) => doc("pnj", x)), cosas: [] as Fichero[] };
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura, reloj: () => Date.parse("2026-10-17T12:00:00Z") }), log: () => {}, identitySign: sign, now: () => Date.parse("2026-10-17T12:00:00Z") });
  type Pagina = { s: ClientSession; m: ReturnType<typeof crearCliente>["misiones"]; dibujos: Dibujo[]; ultimo: (key: string) => PlacedObject | null };
  const paginas: { t: ReturnType<Instance["join"]> }[] = [];
  const abrir = (k: Keeper = keeper()): Pagina => {
    const t = inst.join(paginas.length), cli = crearCliente(), dibujos: Dibujo[] = [];
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place: (key, o) => { dibujos.push({ key, o: o && { ...o } }); }, tag() {} } });
    paginas.push({ t });
    return { s, m: cli.misiones, dibujos, ultimo: (key) => [...dibujos].reverse().find((d) => d.key === key)?.o ?? null };
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const eventos = (p: Pagina, nombre: string) => p.s.features.log.filter((e) => e.event === nombre).length;
  return { abrir, pump, ir, eventos };
}
const acepta = (W: ReturnType<typeof plaza>, p: ReturnType<ReturnType<typeof plaza>["abrir"]>) => { W.ir(p, 1, 0); p.m.hablar("pietro"); W.pump(2); p.m.elegir(1); W.pump(3); };

test("over the plug: two players, two phases — each finds the person where HIS quests put it; the range uses that place", () => {
  const W = plaza([PIETRO, BIANCA, COSIMO]);
  const a = W.abrir(), b = W.abrir();
  W.pump(4);
  // both start with Cosimo at his own place (the first `sitio` says so: the page then knows a later one is a move)
  for (const p of [a, b]) assert.deepEqual([p.ultimo("pnj:cosimo")?.x, p.ultimo("pnj:cosimo")?.z], [10, 0]);
  assert.equal(W.eventos(a, "sitio"), 1);
  acepta(W, a); // A takes the quest → for A, Cosimo stands at (30, 0), facing 90°
  assert.equal(W.eventos(a, "sitio"), 2, "A heard it change");
  assert.equal(W.eventos(b, "sitio"), 1, "B heard nothing new: its phase did not change");
  const dA = a.ultimo("pnj:cosimo")!, dB = b.ultimo("pnj:cosimo")!;
  assert.deepEqual([dA.x, dA.z, dA.ry], [30, 0, 90], "A: the kitchen");
  assert.deepEqual([dB.x, dB.z, dB.ry], [10, 0, 0], "B: still where he was");
  assert.equal(dA.vida?.camina, true, "A's page walks him there");
  assert.equal(dB.vida?.camina, undefined);
  assert.deepEqual(a.m.personaDe("cosimo") && [a.m.personaDe("cosimo")!.x, a.m.personaDe("cosimo")!.z], [30, 0], "the controller (the map, the beacon) agrees");
  assert.deepEqual([b.m.personaDe("cosimo")!.x, b.m.personaDe("cosimo")!.z], [10, 0]);
  // «E: hablar con…»: reachable() for A is at the new place only
  W.ir(a, 29, 0);
  assert.deepEqual(a.s.features.reachable(29, 0).map((r) => r.key), ["cosimo"]);
  assert.deepEqual(a.s.features.reachable(10, 0).map((r) => r.key), [], "A no longer finds him at the old place");
  W.ir(b, 9, 0);
  assert.deepEqual(b.s.features.reachable(9, 0).map((r) => r.key), ["cosimo"]);
  // the server decides the same: A can talk to him at (29,0); at (9,0) the server says «Acércate»
  a.m.hablar("cosimo"); W.pump(3);
  assert.equal(a.m.dialogo()?.nombre, "Cosimo", "A talks to him in the kitchen");
  assert.equal(a.ultimo("pnj:cosimo")?.vida?.atiende, true, "and he keeps facing A while they talk");
  a.m.adios(); W.pump(3);
  assert.equal(a.ultimo("pnj:cosimo")?.vida?.atiende, undefined, "the conversation ended: back to normal");
  W.ir(a, 9, 0);
  a.m.hablar("cosimo"); W.pump(3);
  assert.equal(a.m.dialogo(), null, "from the old place A is not near him any more");
  assert.match(a.s.features.announcements.at(-1)?.text ?? "", /Acércate a Cosimo/);
  b.m.hablar("cosimo"); W.pump(3);
  assert.equal(b.m.dialogo()?.nombre, "Cosimo", "B, at the old place, talks to him");
});

test("over the plug: a player who arrives later in a phase finds the person at the right place at once (no walk), and phases follow the book", () => {
  const W = plaza([PIETRO, BIANCA, COSIMO]);
  const k = keeper();
  const a = W.abrir(k); W.pump(4); acepta(W, a);
  const a2 = W.abrir(k); // a second tab of the same guest: same quests, same place
  W.pump(6);
  const d = a2.ultimo("pnj:cosimo")!;
  assert.deepEqual([d.x, d.z, d.ry], [30, 0, 90]);
  assert.equal(a2.dibujos.filter((x) => x.key === "pnj:cosimo" && x.o?.x === 10).length <= 1, true);
  assert.notEqual(d.vida?.camina, true, "it is simply there: the first `sitio` is not a move");
});

test("over the plug: a world WITHOUT `posiciones` never sends a `sitio`; its people live (reposo, mira = their radio) and nothing else changed", () => {
  const W = plaza([PIETRO, BIANCA, COSIMO_FIJO]);
  const a = W.abrir(); W.pump(4); acepta(W, a);
  assert.equal(W.eventos(a, "sitio"), 0);
  const d = a.ultimo("pnj:cosimo")!;
  assert.deepEqual([d.x, d.z, d.ry, d.animate], [10, 0, 0, false]);
  assert.deepEqual(d.vida, { id: "cosimo", reposo: true, mira: 3 }, "alive by default; `mira` = his radio");
  assert.deepEqual(a.s.features.cards().find((c) => c.key === "cosimo")?.at, { x: 10, z: 0 });
  W.ir(a, 9, 0); a.m.hablar("cosimo"); W.pump(3);
  assert.equal(a.m.dialogo()?.nombre, "Cosimo");
});

test("over the plug: `reposo: false` and `mira: false` reach the page (mira 0 = never)", () => {
  const W = plaza([PIETRO, BIANCA, { ...COSIMO_FIJO, reposo: false, mira: false }]);
  const a = W.abrir(); W.pump(4);
  assert.deepEqual(a.ultimo("pnj:cosimo")?.vida, { id: "cosimo", reposo: false, mira: 0 });
});

test("vidaPnj: the flags of the state, atiende and camina only when asked", () => {
  assert.deepEqual(vidaPnj("x", { radio: 2.5 }), { id: "x", reposo: true, mira: 2.5 });
  assert.deepEqual(vidaPnj("x", { radio: 2.5, reposo: false, mira: false }, true, true), { id: "x", reposo: false, mira: 0, atiende: true, camina: true });
});

test("the declarations: pnj v5 has `reposo`, `mira` and the per-player event `sitio`", () => {
  assert.deepEqual(pnjDecl.issues, []);
  assert.equal(pnjDecl.version, 5);
  assert.deepEqual([pnjDecl.state!.fields.reposo, pnjDecl.state!.fields.mira], [{ kind: "bool", default: true }, { kind: "bool", default: true }]);
  assert.deepEqual(Object.keys(pnjDecl.events!.sitio.fields), ["pnj", "x", "z", "y", "giro"]);
  assert.equal(pnjDecl.events!.sitio.announce, "silent");
});
