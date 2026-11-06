// P16 «ronda»: a person who walks a round (pnj@1 `posiciones[].ronda`): from stop to stop in a straight line, standing still at each for its
// `pausa`. (1) The pure function every side asks — where is she `ms` after the round began — at every kind of instant. (2) The format, with
// the path of each error. (3) Over the real plug: the server starts the clock when the entry begins to hold for THAT player, the page walks the
// same round, «E: hablar» and the reach of a conversation use where she is NOW, she stops while you talk and the time stood talking does not
// count; a world without `ronda` is untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { leerPnj } from "../features/misiones/formato.ts";
import type { Fichero } from "../features/misiones/formato.ts";
import { pnj as pnjDecl } from "../features/misiones/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente, vidaPnj } from "../features/misiones/client.ts";
import { RONDA, aTexto, compilar, deTexto, rondaEn } from "../features/misiones/ronda.ts";
import type { Ronda } from "../features/misiones/ronda.ts";
import type { PlacedObject } from "../packages/feature/src/index.ts";

// ---------- 1. the pure function ----------
// A (10,0) waits 4 s · 6 m to B (16,0) at 1 m/s · B waits 6 s facing 90° · 8 m to C (16,8) · C does not wait · 10 m back to A. One lap = 34 s.
const A = { x: 10, z: 0, pausa: 4 }, B = { x: 16, z: 0, giro: 90, pausa: 6 }, C = { x: 16, z: 8, pausa: 0 };
const VUELTA: Ronda = { puntos: [A, B, C], velocidad: 1, modo: "vuelta" };
const en = (r: Ronda, s: number, base = 0) => rondaEn(compilar(r, base), s * 1000);
const at = (p: { x: number; z: number; giro: number; andando: boolean }) => [p.x, p.z, p.giro, p.andando];

test("rondaEn: standing at a stop for its pausa, walking the straight leg at the speed, the heading of each leg", () => {
  const plan = compilar(VUELTA);
  assert.equal(plan.ciclo, 34, "4 + 6 + 6 + 8 + 0 + 10");
  assert.deepEqual(at(en(VUELTA, 0)), [10, 0, -143.1, false], "begins at the first stop, facing the way she arrived (from C)");
  assert.deepEqual(at(en(VUELTA, 3.9)), [10, 0, -143.1, false]);
  assert.deepEqual(at(en(VUELTA, 4)), [10, 0, 90, true], "the pause is over: off along +x");
  assert.deepEqual(at(en(VUELTA, 7)), [13, 0, 90, true]);
  assert.deepEqual(at(en(VUELTA, 10)), [16, 0, 90, false], "arrived at B: stands, facing the `giro` B gives");
  assert.deepEqual(at(en(VUELTA, 15.9)), [16, 0, 90, false]);
  assert.deepEqual(at(en(VUELTA, 20)), [16, 4, 0, true], "B→C goes along +z");
  assert.deepEqual(at(en(VUELTA, 24)), [16, 8, -143.1, true], "C has no pause: it walks through (the next leg, back to A, starts the same instant)");
  assert.deepEqual(at(en(VUELTA, 29)), [13, 4, -143.1, true], "C→A: the way back, to the first stop");
  assert.deepEqual(at(en(VUELTA, 34)), [10, 0, -143.1, false], "one lap later: the same as t = 0");
  assert.deepEqual(at(en(VUELTA, 34 + 7)), at(en(VUELTA, 7)), "the round repeats for ever");
  assert.equal(en(VUELTA, 7).resto, 3, "3 s of this leg left");
  assert.equal(en(VUELTA, 1).resto, 3, "3 s of this pause left");
});

test("rondaEn: ida_y_vuelta goes there and back along the same stops (the middle ones twice)", () => {
  const R: Ronda = { ...VUELTA, modo: "ida_y_vuelta" };
  assert.equal(compilar(R).ciclo, 44, "4 + 6 + 6 + 8 + 0 + 8 + 6 + 6");
  assert.deepEqual(at(en(R, 12)), [16, 0, 90, false], "waiting at B on the way out");
  assert.deepEqual(at(en(R, 28)), [16, 4, 180, true], "C→B: back down along −z");
  assert.deepEqual(at(en(R, 35)), [16, 0, 90, false], "waiting at B again on the way back");
  assert.deepEqual(at(en(R, 41)), [13, 0, -90, true], "B→A on the way back");
  assert.deepEqual(at(en(R, 44)), at(en(R, 0)));
  const dos: Ronda = { puntos: [{ x: 0, z: 0, pausa: 2 }, { x: 0, z: 4, pausa: 2 }], velocidad: 2, modo: "ida_y_vuelta" };
  assert.equal(compilar(dos).ciclo, 8, "two stops: out and back, each pause once");
  assert.deepEqual(at(en(dos, 3)), [0, 2, 0, true]);
  assert.deepEqual(at(en(dos, 7)), [0, 2, 180, true]);
});

test("rondaEn: limits — negative, huge, not-a-number, a round with no length; heights are interpolated; pure and repeatable", () => {
  assert.deepEqual(at(en(VUELTA, -50)), at(en(VUELTA, 0)), "before the beginning counts as the beginning");
  assert.deepEqual(at(rondaEn(compilar(VUELTA), Number.NaN)), at(en(VUELTA, 0)));
  assert.deepEqual(at(rondaEn(compilar(VUELTA), 34_000 * 1_000_000 + 7000)), [13, 0, 90, true], "a million laps later");
  const quieta = en({ puntos: [{ x: 3, z: 4, pausa: 0 }, { x: 3, z: 4, pausa: 0 }], velocidad: 1, modo: "vuelta" }, 99, 17);
  assert.deepEqual(at(quieta), [3, 4, 17, false], "no length and no pause: she stands at the first stop, facing her base yaw (no NaN)");
  assert.equal(quieta.resto, Infinity);
  const sube = en({ puntos: [{ x: 0, z: 0, y: 0, pausa: 0 }, { x: 0, z: 10, y: 3, pausa: 0 }], velocidad: 1, modo: "vuelta" }, 5);
  assert.equal(sube.y, 1.5, "half way up the stairs");
  const p = compilar(VUELTA);
  for (let i = 0; i < 200; i++) { const ms = i * 197; assert.deepEqual(rondaEn(p, ms), rondaEn(p, ms), "same instant, same answer"); }
  // a zero-length leg between two equal stops (a pause there is just a longer pause)
  assert.deepEqual(at(en({ puntos: [{ x: 0, z: 0, pausa: 1 }, { x: 0, z: 0, pausa: 1 }, { x: 0, z: 2, pausa: 0 }], velocidad: 1, modo: "vuelta" }, 1.5, 5)), [0, 0, 180, false], "faces the way she arrived (the last leg with length), not the base yaw");
});

test("the text the server sends rebuilds EXACTLY the plan it uses: the same answer at every instant", () => {
  const R: Ronda = { puntos: [{ x: 10.37, z: -2.5, y: 0.25, giro: -33.3, pausa: 3.4 }, { x: 14.01, z: 1.2, pausa: 0 }, { x: 12, z: 9.99, y: 1, giro: 120, pausa: 12.5 }], velocidad: 1.17, modo: "ida_y_vuelta" };
  const resuelta = { ...R, puntos: R.puntos.map((q) => ({ ...q, y: q.y ?? 0 })) };
  const texto = aTexto(resuelta.puntos), vuelta = deTexto(texto)!;
  assert.ok(vuelta && vuelta.length === 3);
  const a = compilar(resuelta, 40), b = compilar({ ...R, puntos: vuelta }, 40);
  for (let ms = 0; ms < 200_000; ms += 313) assert.deepEqual(rondaEn(a, ms), rondaEn(b, ms), `ms ${ms}`);
  assert.equal(deTexto("1,2,3"), null); assert.equal(deTexto(""), null); assert.equal(deTexto("a,b,c,d,e;1,2,3,,0"), null); assert.equal(deTexto("1,2,0,,0"), null, "one stop is not a round");
  const peor = Array.from({ length: RONDA.puntosMax }, () => ({ x: -1234.56, z: -1234.56, y: 30.01, giro: -179.9, pausa: 59.9 }));
  assert.ok(new TextEncoder().encode(aTexto(peor)).length <= RONDA.texto, "the worst case fits the event's field");
});

test("CPU: asking where 20 people on a round are, every frame, costs microseconds (reported)", () => {
  const planes = Array.from({ length: 20 }, (_, i) => compilar({ ...VUELTA, velocidad: 0.8 + i * 0.02 }, i));
  const N = 20_000, t0 = performance.now();
  let ruido = 0;
  for (let i = 0; i < N; i++) for (const p of planes) ruido += rondaEn(p, i * 16.7).x;
  const us = ((performance.now() - t0) * 1000) / N;
  console.log(`# ronda: ${us.toFixed(2)} µs per frame for 20 people (maths only)`);
  assert.ok(ruido > 0 && us < 100, `${us} µs`);
});

// ---------- 2. the format ----------
const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const charla = (t: string) => ({ entradas: [{ nodo: "hola" }], nodos: { hola: { texto: t, opciones: [adios] } } });
const base = { formato: "pnj@1", id: "cabo", nombre: "Cabo", posicion: { x: 10, z: 0 }, giro: 0, dialogo: charla("Hola.") };
const msgs = (r: ReturnType<typeof leerPnj>) => (r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`));
const RONDA_JSON = { puntos: [{ x: 10, z: 0, pausa: 4 }, { x: 16, z: 0, giro: 90, pausa: 6 }, { x: 16, z: 8 }] };

test("pnj@1 `ronda`: a good one is read (rounded to cm / 0.1° / 0.1 s, defaults filled); `posicion` may be left out and is then the first stop", () => {
  const ok = leerPnj({ ...base, posiciones: [{ si: [{ mision: "m", estado: "activa" }], ronda: { ...RONDA_JSON, puntos: [{ x: 10.004, z: 0.006, y: 1.234, giro: 90.04, pausa: 4.04 }, { x: 16, z: 0 }], velocidad: 1.234, modo: "ida_y_vuelta" } }] });
  assert.ok(ok.ok, msgs(ok).join("; "));
  if (!ok.ok) return;
  const l = ok.value.posiciones[0];
  assert.deepEqual(l.ronda?.puntos, [{ x: 10, z: 0.01, y: 1.23, giro: 90, pausa: 4 }, { x: 16, z: 0, pausa: 0 }]);
  assert.deepEqual([l.ronda?.velocidad, l.ronda?.modo], [1.23, "ida_y_vuelta"]);
  assert.deepEqual(l.posicion, { x: 10, z: 0.01, y: 1.23 }, "no `posicion`: the first stop");
  const por = leerPnj({ ...base, posiciones: [{ si: [{ mision: "m", estado: "activa" }], ronda: RONDA_JSON }] });
  assert.ok(por.ok);
  if (por.ok) { assert.deepEqual([por.value.posiciones[0].ronda?.velocidad, por.value.posiciones[0].ronda?.modo], [RONDA.velDefecto, "vuelta"]); assert.equal(por.value.posiciones[0].sinY, true, "no stop gives a height: she stands on the ground"); }
  const con = leerPnj({ ...base, posiciones: [{ si: [{ mision: "m", estado: "activa" }], posicion: { x: 11, z: 1 }, ronda: RONDA_JSON }] });
  assert.ok(con.ok && con.value.posiciones[0].posicion.x === 11, "a `posicion` given is kept (the map's step marker uses it)");
  const sin = leerPnj({ ...base, posiciones: [{ si: [{ mision: "m", estado: "activa" }], posicion: { x: 11, z: 1 } }] });
  assert.ok(sin.ok && sin.value.posiciones[0].ronda === undefined, "no `ronda`: nothing added to the entry");
});

test("pnj@1 `ronda`: the Spanish errors, each with its path", () => {
  const P = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 10 + i, z: 0, pausa: 1 }));
  const casos: [string, unknown, RegExp][] = [
    ["posiciones[0].ronda.puntos", { puntos: P(1) }, /2 a 8/],
    ["posiciones[0].ronda.puntos", { puntos: P(9) }, /2 a 8/],
    ["posiciones[0].ronda.puntos", {}, /lista/],
    ["posiciones[0].ronda.puntos[1]", { puntos: [{ x: 10, z: 0 }, { x: 99, z: 0 }] }, /30 m o menos de la «posicion» de la persona/],
    ["posiciones[0].ronda.puntos[0].x", { puntos: [{ z: 0 }, { x: 11, z: 0 }] }, /número/],
    ["posiciones[0].ronda.puntos[0].pausa", { puntos: [{ x: 10, z: 0, pausa: 61 }, { x: 11, z: 0 }] }, /0 y 60/],
    ["posiciones[0].ronda.puntos[0].pausa", { puntos: [{ x: 10, z: 0, pausa: -1 }, { x: 11, z: 0 }] }, /0 y 60/],
    ["posiciones[0].ronda.puntos[0].giro", { puntos: [{ x: 10, z: 0, giro: 400 }, { x: 11, z: 0 }] }, /-180/],
    ["posiciones[0].ronda.puntos[0].y", { puntos: [{ x: 10, z: 0, y: 99 }, { x: 11, z: 0 }] }, /30/],
    ["posiciones[0].ronda.puntos[0].quien", { puntos: [{ x: 10, z: 0, quien: 1 }, { x: 11, z: 0 }] }, /campo desconocido/],
    ["posiciones[0].ronda.velocidad", { ...RONDA_JSON, velocidad: 3 }, /0.3 y 1.4/],
    ["posiciones[0].ronda.velocidad", { ...RONDA_JSON, velocidad: 0 }, /0.3 y 1.4/],
    ["posiciones[0].ronda.modo", { ...RONDA_JSON, modo: "zigzag" }, /vuelta, ida_y_vuelta/],
    ["posiciones[0].ronda.paso", { ...RONDA_JSON, paso: 1 }, /campo desconocido/],
    ["posiciones[0].ronda", { puntos: [{ x: 10, z: 0 }, { x: 10, z: 0 }] }, /ni recorrido ni pausas/],
    ["posiciones[0].ronda", "andando", /objeto/],
  ];
  for (const [ruta, valor, re] of casos) {
    const r = leerPnj({ ...base, posiciones: [{ si: [{ mision: "m", estado: "activa" }], ronda: valor }] });
    assert.ok(!r.ok, `${ruta} should fail`);
    assert.ok(msgs(r).some((m) => m.startsWith(ruta) && re.test(m)), `${ruta} ${re}: ${msgs(r).join(" | ")}`);
  }
  const sinNada = leerPnj({ ...base, posiciones: [{ si: [{ mision: "m", estado: "activa" }] }] });
  assert.ok(!sinNada.ok && msgs(sinNada).some((m) => m.startsWith("posiciones[0].posicion")), "neither `posicion` nor `ronda`: still an error");
});

// ---------- 3. over the real plug ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
const doc = (dir: string, x: { id: string; [k: string]: unknown }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
const VUELO = { formato: "mision@1", id: "vuelo", titulo: "El vuelo", descripcion: "Habla con Bianca.", pasos: [{ id: "habla", tipo: "habla_con", texto: "Habla con Bianca", pnj: "bianca" }] };
const BIANCA = { formato: "pnj@1", id: "bianca", nombre: "Bianca", posicion: { x: -8, z: 0 }, dialogo: charla("Hola.") };
const PIETRO = { formato: "pnj@1", id: "pietro", nombre: "Pietro", posicion: { x: 0, z: 0 }, dialogo: { entradas: [{ nodo: "pide" }], nodos: { pide: { texto: "¿Nos ayudas?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision: "vuelo" } }, adios] } } } };
const COSIMO_RONDA = { ...base, id: "cosimo", nombre: "Cosimo", posiciones: [{ si: [{ mision: "vuelo", estado: "activa" }], ronda: RONDA_JSON }] };
const T0 = Date.parse("2026-11-04T12:00:00Z");
const PLAN = compilar({ puntos: [{ ...A, y: 0 }, { ...B, y: 0 }, { ...C, y: 0 }], velocidad: RONDA.velDefecto, modo: "vuelta" }, 0); // what the server compiles from RONDA_JSON (the default speed)
const SEG = (s: number) => rondaEn(PLAN, s * 1000);

function plaza(pnj: { id: string; [k: string]: unknown }[]) {
  let T = T0;
  const aventura = { misiones: [doc("misiones", VUELO)], pnj: pnj.map((x) => doc("pnj", x)), cosas: [] as Fichero[] };
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura, reloj: () => T }), log: () => {}, identitySign: sign, now: () => T });
  type Pagina = { s: ClientSession; m: ReturnType<typeof crearCliente>["misiones"]; dibujos: { key: string; o: PlacedObject | null }[]; ultimo: (key: string) => PlacedObject | null };
  const paginas: { t: ReturnType<Instance["join"]> }[] = [];
  const abrir = (k: Keeper = keeper()): Pagina => {
    const t = inst.join(paginas.length), cli = crearCliente({ reloj: () => T }), dibujos: Pagina["dibujos"] = [];
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place: (key, o) => { dibujos.push({ key, o: o && { ...o } }); }, tag() {} } });
    paginas.push({ t });
    return { s, m: cli.misiones, dibujos, ultimo: (key) => [...dibujos].reverse().find((d) => d.key === key)?.o ?? null };
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const eventos = (p: Pagina, nombre: string) => p.s.features.log.filter((e) => e.event === nombre);
  const pasa = (s: number) => { T += s * 1000; };
  return { abrir, pump, ir, eventos, pasa, ahora: () => T };
}
const libre = () => new Promise<void>((r) => setImmediate(r)); // the page loads the maths of a round the first time one comes (a lazy chunk): let it finish
const acepta = async (W: ReturnType<typeof plaza>, p: ReturnType<ReturnType<typeof plaza>["abrir"]>, esperar = true) => { W.ir(p, 1, 0); p.m.hablar("pietro"); W.pump(2); p.m.elegir(1); W.pump(3); if (esperar) await libre(); };
const donde = (p: { m: ReturnType<typeof crearCliente>["misiones"] }, k = "cosimo") => { const r = p.m.rondaDe(k); return r && [r.x, r.z, r.andando, r.quieta]; };

test("over the plug: the clock starts when the entry begins to hold for THAT player; the page walks the same round as the server computes", async () => {
  const W = plaza([PIETRO, BIANCA, COSIMO_RONDA]);
  const a = W.abrir(), b = W.abrir();
  W.pump(4);
  assert.equal(W.eventos(a, "ronda").length + W.eventos(b, "ronda").length, 0, "no round until the quest says so");
  assert.equal(a.m.rondaDe("cosimo"), null);
  await acepta(W, a, false);
  assert.equal(a.m.rondaDe("cosimo"), null, "the first round of the process waits for the page code (a chunk of its own) to load…");
  await libre();
  assert.ok(a.m.rondaDe("cosimo"), "…and then walks it; from then on the code is there and the next page does it at once");
  assert.equal(W.eventos(a, "ronda").length, 1, "A hears the round");
  assert.equal(W.eventos(b, "ronda").length, 0, "B's phase did not change: no round for B");
  const ev = W.eventos(a, "ronda")[0].msg;
  assert.deepEqual([ev.pnj, ev.puntos, ev.vel, ev.ida, ev.rt, ev.quieta], ["cosimo", "10,0,0,,4;16,0,0,90,6;16,8,0,,0", 1.1, false, 0, false]);
  assert.deepEqual(donde(a), [10, 0, false, false], "she begins at the first stop");
  assert.equal(donde(b), null);
  // A moment later the page has her walking (the page clock is the same one here)
  W.pasa(4 + 3); // 4 s waiting + 3 s walking at 1.1 m/s
  a.m.cuadro();
  const esperada = SEG(7);
  assert.deepEqual([esperada.x, esperada.z, esperada.andando], [13.3, 0, true]);
  assert.deepEqual(donde(a), [esperada.x, esperada.z, true, false], "the page asks the shared function");
  const d = a.ultimo("pnj:cosimo")!;
  assert.deepEqual([d.x, d.z, d.ry, d.vida?.andando], [13.3, 0, 90, true], "drawn there, facing the way she goes, walking");
  assert.equal(d.vida?.camina, undefined, "the page places her itself: the render does not walk her");
  assert.deepEqual(b.ultimo("pnj:cosimo") && [b.ultimo("pnj:cosimo")!.x, b.ultimo("pnj:cosimo")!.z], [10, 0], "B finds her at her own place, still");
  assert.equal(b.ultimo("pnj:cosimo")!.vida?.andando, undefined);
  // she stands at B for her pause, and the page stops asking (nothing changes while she stands)
  W.pasa(3); a.m.cuadro();
  assert.deepEqual(donde(a), [16, 0, false, false]);
  const antes = a.dibujos.length;
  for (let i = 0; i < 50; i++) { W.pasa(0.05); assert.equal(a.m.cuadro(), false, "standing: nothing is moving"); }
  assert.equal(a.dibujos.length, antes, "standing: not drawn again");
  assert.equal(a.ultimo("pnj:cosimo")!.vida?.andando, false);
});

test("over the plug: «E: hablar» and the server's reach use where she is NOW; she stops while you talk and the time stood talking does not count", async () => {
  const W = plaza([PIETRO, BIANCA, COSIMO_RONDA]);
  const k = keeper();
  const a = W.abrir(k);
  W.pump(4); await acepta(W, a);
  W.pasa(7); a.m.cuadro(); // she is at (13.3, 0), walking
  const ahora = SEG(7);
  // the starting point is out of reach now, the place she is at is not
  W.ir(a, 4, 0);
  a.m.hablar("cosimo"); W.pump(3);
  assert.equal(a.m.dialogo(), null, "from where she stood at the start, nobody");
  assert.match(a.s.features.announcements.at(-1)?.text ?? "", /Acércate a Cosimo/);
  W.ir(a, 16.3, 0); a.m.cuadro();
  assert.deepEqual(a.s.features.reachable(16.3, 0).map((r) => r.key), ["cosimo"], "the prompt follows her");
  assert.deepEqual(a.s.features.reachable(10, 0).map((r) => r.key), [], "...and has left the first stop");
  a.m.hablar("cosimo"); W.pump(3);
  assert.equal(a.m.dialogo()?.nombre, "Cosimo", `talks to her where she is (${ahora.x}, ${ahora.z})`);
  const rondas = W.eventos(a, "ronda");
  assert.equal(rondas.length, 2, "she stopped: the page is told");
  assert.deepEqual([rondas[1].msg.quieta, rondas[1].msg.rt], [true, 7]);
  assert.deepEqual(donde(a), [13.3, 0, false, true], "stopped where she was, not walking");
  assert.equal(a.ultimo("pnj:cosimo")!.vida?.atiende, true, "and she faces you");
  // a long conversation: she does not move, the talk is not closed for distance (she is not walking away)
  W.pasa(120); W.pump(40); a.m.cuadro();
  assert.equal(a.m.dialogo()?.nombre, "Cosimo", "two minutes later it is still open");
  assert.deepEqual(donde(a), [13.3, 0, false, true]);
  // end: she goes on from where she stopped
  a.m.adios(); W.pump(3);
  const r3 = W.eventos(a, "ronda");
  assert.equal(r3.length, 3);
  assert.deepEqual([r3[2].msg.quieta, r3[2].msg.rt], [false, 7], "the two minutes did not count");
  assert.deepEqual(donde(a), [13.3, 0, true, false]);
  W.pasa(3); a.m.cuadro();
  assert.deepEqual(donde(a), [16, 0, false, false], "3 s later she is at B (the walk to B ended at 4 + 6/1.1 s)");
  // a second tab of the same guest, opened now: the server tells it the same elapsed time, so it shows her in the same place
  const a2 = W.abrir(k);
  W.pump(6); a2.m.cuadro();
  assert.deepEqual(donde(a2), donde(a), "same place on the other tab");
  const ev2 = W.eventos(a2, "ronda").at(-1)!.msg;
  assert.ok(Math.abs(Number(ev2.rt) - 10) < 0.002 && ev2.quieta === false, `rt ${ev2.rt}: 7 s before + 3 s after, the 120 s talking not counted`);
});

test("over the plug: the conversation of one player does not stop her for another (each has his own round)", async () => {
  const W = plaza([PIETRO, BIANCA, COSIMO_RONDA]);
  const a = W.abrir(), b = W.abrir();
  W.pump(4); await acepta(W, a); await acepta(W, b);
  W.pasa(5);
  W.ir(a, 11, 0); a.m.hablar("cosimo"); W.pump(3);
  assert.equal(a.m.dialogo()?.nombre, "Cosimo");
  W.pasa(10); a.m.cuadro(); b.m.cuadro();
  assert.equal(donde(a)![3], true, "A's Cosimo is stopped");
  assert.equal(donde(b)![3], false, "B's goes on");
  assert.equal(donde(b)![0] !== donde(a)![0], true);
});

test("over the plug: a world WITHOUT `ronda` is as it was — no `ronda` event, the same `sitio`, the same drawing", async () => {
  const COSIMO = { ...base, id: "cosimo", nombre: "Cosimo", posiciones: [{ si: [{ mision: "vuelo", estado: "activa" }], posicion: { x: 30, z: 0 }, giro: 90 }] };
  const W = plaza([PIETRO, BIANCA, COSIMO]);
  const a = W.abrir(); W.pump(4); await acepta(W, a);
  assert.equal(W.eventos(a, "ronda").length, 0);
  assert.deepEqual(W.eventos(a, "sitio").map((e) => e.msg), [{ pnj: "cosimo", x: 10, z: 0, y: 0, giro: 0 }, { pnj: "cosimo", x: 30, z: 0, y: 0, giro: 90 }]);
  const d = a.ultimo("pnj:cosimo")!;
  assert.deepEqual([d.x, d.z, d.ry, d.vida?.camina, d.vida?.andando], [30, 0, 90, true, undefined]);
  assert.equal(a.m.rondaDe("cosimo"), null);
  assert.equal(a.m.cuadro(), false, "nothing to do per frame");
  assert.deepEqual(vidaPnj("x", { radio: 2.5 }), { id: "x", reposo: true, mira: 2.5 });
  assert.deepEqual(vidaPnj("x", { radio: 2.5 }, false, false, false), { id: "x", reposo: true, mira: 2.5, andando: false });
});

test("the declarations: pnj v6 adds the per-player event `ronda`, and leaves `sitio` exactly as it was", () => {
  assert.deepEqual(pnjDecl.issues, []);
  assert.equal(pnjDecl.version, 6);
  assert.deepEqual(Object.keys(pnjDecl.events!.sitio.fields), ["pnj", "x", "z", "y", "giro"]);
  assert.deepEqual(Object.keys(pnjDecl.events!.ronda.fields), ["pnj", "puntos", "vel", "ida", "rt", "quieta", "giro"]);
  assert.equal(pnjDecl.events!.ronda.announce, "silent");
});
