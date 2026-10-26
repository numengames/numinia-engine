// MIS-200 «Pasar lo que llevas de una mano a la otra»: the hands layer's handover (manos.ts `llevable`) and the rod's piece
// (apps/plaza/pesca-vr.ts). Fake controllers, no browser: grips are groups placed in the scene, the grip button is a gamepad value.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { createManos, CERCA_CAMBIO_M, SOLTAR_PULSAR_MS, type Lado } from "../packages/render/src/manos.ts";
import { montarPescaManos } from "../apps/plaza/pesca-vr.ts";
import { montarXR } from "../apps/plaza/xr.ts";

function montar() {
  const scene = new THREE.Scene();
  const ctrl = [0, 1].map(() => new THREE.Group()), grip = [0, 1].map(() => new THREE.Group()), mano = [0, 1].map(() => new THREE.Group());
  const renderer = { xr: { getController: (i: number) => ctrl[i], getControllerGrip: (i: number) => grip[i], getHand: (i: number) => mano[i] } };
  const avisos: string[] = [];
  const m = createManos({ renderer: renderer as never, objetos: () => [], paneles: () => [], nota: (t) => avisos.push(t) } as never);
  m.montar(scene);
  const botones = [0, 1].map(() => [0, 1, 2, 3].map(() => ({ value: 0, pressed: false, touched: false }))); // trigger, grip, (touchpad), thumbstick
  const pulsos: [number, number][] = [];
  const nombres = ["left", "right"] as const; // slot 0 = left, slot 1 = right
  [0, 1].forEach((i) => {
    ctrl[i].dispatchEvent({ type: "connected", data: { handedness: nombres[i], gamepad: { buttons: botones[i], hapticActuators: [{ pulse: (v: number) => { pulsos.push([i, v]); } }] }, targetRayMode: "tracked-pointer" } } as never);
    ctrl[i].visible = true;
  });
  const IZQ = 0, DER = 1;
  const poner = (i: number, x: number) => { grip[i].position.set(x, 1, 0); };
  const agarre = (i: number, v: number) => { botones[i][1].value = v; };
  const palanca = (i: number, v: boolean) => { botones[i][3].pressed = v; botones[i][3].value = v ? 1 : 0; };
  let reloj = 1000; // the page's clock, given to update() so a held stick can be timed without waiting
  const cuadro = (avanza = 0) => { reloj += avanza; m.update(null, reloj); };
  return { m, poner, agarre, palanca, cuadro, avisos, pulsos, IZQ, DER };
}

/** A fake rod piece with the rod's rules: in `lado`, passes only when `fase` allows. */
function pieza(f: ReturnType<typeof montar>, inicial: Lado, fase: () => string) {
  const e = { lado: inicial as Lado | null, pasos: [] as Lado[] };
  f.m.llevable("pesca", { que: "la caña", lado: () => e.lado, ocupante: "reglas", pasar: (a) => { e.lado = a; e.pasos.push(a); }, puede: () => (fase() === "nada" || fase() === "espera" ? true : "Ahora no: el pez ya ha picado") });
  return e;
}

test("el gesto: mano libre junto a la que lleva + agarre pasa la cosa y vibran las dos", () => {
  const f = montar(); let fase = "nada";
  const caña = pieza(f, "der", () => fase);
  f.m.reglas({ ocupada: (l) => l === caña.lado });
  f.poner(f.IZQ, 0); f.poner(f.DER, CERCA_CAMBIO_M - 0.03);
  f.cuadro(); // hand in reach: nothing happens until the grip goes down
  assert.deepEqual(caña.pasos, []);
  f.agarre(f.IZQ, 1); f.cuadro();
  assert.deepEqual(caña.pasos, ["izq"]);
  assert.equal(caña.lado, "izq");
  assert.deepEqual(f.pulsos.map((p) => p[0]).sort(), [0, 1], "both controllers buzzed");
  f.cuadro(); f.cuadro(); assert.deepEqual(caña.pasos, ["izq"], "holding the grip does not repeat");
});

test("lejos de la otra mano (más de CERCA_CAMBIO_M) el agarre no pasa nada", () => {
  const f = montar(); const caña = pieza(f, "der", () => "nada");
  f.m.reglas({ ocupada: (l) => l === caña.lado });
  f.poner(f.IZQ, 0); f.poner(f.DER, CERCA_CAMBIO_M + 0.1);
  f.cuadro(); f.agarre(f.IZQ, 1); f.cuadro();
  assert.deepEqual(caña.pasos, []); assert.deepEqual(f.pulsos, []);
});

test("durante la picada y la pelea se rechaza, con frase, y espera/nada sí pasa", () => {
  for (const fase of ["picada", "pelea", "mordisqueo"]) {
    const f = montar(); const caña = pieza(f, "der", () => fase);
    f.m.reglas({ ocupada: (l) => l === caña.lado });
    f.poner(f.IZQ, 0); f.poner(f.DER, 0.05); f.cuadro(); f.agarre(f.IZQ, 1); f.cuadro();
    assert.deepEqual(caña.pasos, [], fase); assert.match(f.avisos[0] ?? "", /Ahora no/, fase); assert.deepEqual(f.pulsos, []);
  }
  const g = montar(); const c2 = pieza(g, "der", () => "espera");
  g.m.reglas({ ocupada: (l) => l === c2.lado });
  g.poner(g.IZQ, 0); g.poner(g.DER, 0.05); g.cuadro(); g.agarre(g.IZQ, 1); g.cuadro();
  assert.deepEqual(c2.pasos, ["izq"]);
});

test("el reloj: la mano del reloj ni da ni recibe", () => {
  // the watch is on the left hand and showing: it cannot take the rod from the right
  const a = montar(); const c1 = pieza(a, "der", () => "nada");
  a.m.reglas({ ocupada: (l) => l === c1.lado }); a.m.ocupar("reloj", (l) => l === "izq");
  a.poner(a.IZQ, 0); a.poner(a.DER, 0.05); a.cuadro(); a.agarre(a.IZQ, 1); a.cuadro();
  assert.deepEqual(c1.pasos, [], "the watch hand does not take");
  // the watch is on the right hand (the one holding the rod): it cannot give it either, not even with the button
  const b = montar(); const c2 = pieza(b, "der", () => "nada");
  b.m.reglas({ ocupada: (l) => l === c2.lado }); b.m.ocupar("reloj", (l) => l === "der");
  b.poner(b.IZQ, 0); b.poner(b.DER, 0.05); b.cuadro(); b.agarre(b.IZQ, 1); b.cuadro();
  assert.deepEqual(c2.pasos, [], "the watch hand does not give");
  const r = b.m.cambiarMano(); assert.equal(r.ok, false); assert.match(r.ok ? "" : r.why, /reloj/);
});

test("el botón (Bolsa › Cambiar de mano) hace lo mismo sin gesto, y sin nada en la mano lo dice", () => {
  const f = montar(); const caña = pieza(f, "izq", () => "espera");
  f.m.reglas({ ocupada: (l) => l === caña.lado });
  f.poner(f.IZQ, 0); f.poner(f.DER, 2); f.cuadro();
  assert.deepEqual(f.m.llevando().map((x) => [x.que, x.lado]), [["la caña", "izq"]]);
  const r = f.m.cambiarMano(); assert.deepEqual(r, { ok: true, que: "la caña", a: "der" });
  assert.equal(caña.lado, "der"); assert.equal(f.pulsos.length, 2);
  caña.lado = null;
  const v = f.m.cambiarMano(); assert.equal(v.ok, false);
});

test("la otra mano ocupada con otra cosa (un dardo) rechaza", () => {
  const f = montar(); const caña = pieza(f, "der", () => "nada");
  f.m.reglas({ ocupada: (l) => l === caña.lado }); f.m.ocupar("dardos", (l) => l === "izq");
  f.poner(f.IZQ, 0); f.poner(f.DER, 0.05); f.cuadro(); f.agarre(f.IZQ, 1); f.cuadro();
  assert.deepEqual(caña.pasos, []);
  const r = f.m.cambiarMano(); assert.equal(r.ok, false);
});

// ── the rod's own piece ────────────────────────────────────────────────────────────────────────────────────────────
function cañaFalsa(fase0 = "nada") {
  const f = montar();
  const est = { fase: fase0, sitio: "", tension: 0, arrancada: "no" as const };
  const reg: string[] = [], llamadas: string[] = [];
  const pesca = { estado: () => est, lanzar: (s?: string) => { llamadas.push(`lanzar:${s}`); return { ok: true as const }; }, recoger: (a: boolean) => { llamadas.push(`recoger:${a}`); return { ok: true as const }; },
    pulsar: () => { llamadas.push("pulsar"); return { ok: true as const }; }, soltar: () => { llamadas.push("soltar"); return { ok: true as const }; }, alCambiar: () => () => {} };
  let marco: () => void = () => {}; const tip = { x: 0, y: 1.5, z: 0 };
  const sujeciones: (string | null)[] = []; const notas: string[] = [];
  let cerca: { lado: Lado; sitio: string; d: number } | null = { lado: "der", sitio: "a", d: 0.05 };
  const view = {
    pesca: { cadaCuadro: (fn: () => void) => { marco = fn; return () => {}; }, sujetar: (l: Lado | null) => { sujeciones.push(l); }, resaltar: () => {}, instruccion: () => {},
      alAlcance: () => cerca, punta: () => ({ ...tip }), soporte: () => ({ x: 0, y: 0, z: 0 }), mirada: () => ({ x: 0, z: -1 }) },
    vr: { active: true, nota: (t: string) => notas.push(t) },
    manos: { reglas: (o: Parameters<typeof f.m.reglas>[0]) => f.m.reglas(o), vibrar: (l: Lado, v?: number, ms?: number) => f.m.vibrar(l, v, ms), entrada: (l: Lado) => f.m.entrada(l), llevable: f.m.llevable },
  };
  const pagina = montarPescaManos({ pesca: pesca as never, view: view as never, session: { selfPosition: () => ({ x: 0, y: 0, z: 0 }) } });
  return { f, est, pagina, marco: () => { marco(); f.cuadro(); }, llamadas, sujeciones, notas, tip, quitarCerca: () => { cerca = null; } };
}

test("la caña: se coge con la derecha, la izquierda la pasa con el agarre, y no se lanza ni se tira por el pase", () => {
  const c = cañaFalsa(); const f = c.f;
  f.poner(f.IZQ, -0.6); f.poner(f.DER, 0); f.cuadro();
  f.agarre(f.DER, 1); c.marco();                       // take it with the right grip at the holder
  assert.equal(c.pagina.sujeta(), "der");
  f.agarre(f.DER, 0); c.marco(); c.quitarCerca();
  f.poner(f.IZQ, -0.08); c.marco();                    // the free hand comes to the rod hand...
  f.agarre(f.IZQ, 1); c.marco();                       // ...and presses its grip
  assert.equal(c.pagina.sujeta(), "izq", "the rod is now in the left hand");
  assert.equal(c.sujeciones.at(-1), "izq");
  assert.ok(c.f.pulsos.length >= 2, "both buzzed");
  // the tip jumps to the other hand; no cast, no strike, no reel come out of the handover
  c.tip.x = -0.6; c.tip.z = -0.6; c.tip.y = 1.9; c.marco(); c.marco();
  assert.deepEqual(c.llamadas.filter((x) => x.startsWith("lanzar") || x === "pulsar" || x.startsWith("recoger")), []);
  // the grip that passed it is still closed: it must not put the rod back; letting go and pressing again does
  c.marco(); assert.equal(c.pagina.sujeta(), "izq");
  f.agarre(f.IZQ, 0); c.marco(); f.agarre(f.IZQ, 1); c.marco();
  assert.equal(c.pagina.sujeta(), null, "grip of the holding hand still puts it back");
});

test("la caña: en la pelea no se pasa; esperando sí", () => {
  const c = cañaFalsa(); const f = c.f;
  f.poner(f.IZQ, -0.6); f.poner(f.DER, 0); f.cuadro(); f.agarre(f.DER, 1); c.marco(); f.agarre(f.DER, 0); c.marco(); c.quitarCerca();
  c.est.fase = "pelea";
  f.poner(f.IZQ, -0.08); c.marco(); f.agarre(f.IZQ, 1); c.marco();
  assert.equal(c.pagina.sujeta(), "der"); assert.match(f.avisos.at(-1) ?? "", /Ahora no/);
  f.agarre(f.IZQ, 0); c.marco(); c.est.fase = "espera"; f.agarre(f.IZQ, 1); c.marco();
  assert.equal(c.pagina.sujeta(), "izq");
});

// ── quest items ────────────────────────────────────────────────────────────────────────────────────────────────────
test("un objeto de misión en la mano se pasa a la otra y se redibuja ahí", () => {
  const f = montar();
  const lleva: Record<string, string | null> = {}; let alCambiar: (q: "libro") => void = () => {};
  const misiones = { estado: { nota: "" }, libro: () => [{ id: "m", estado: "activa", titulo: "", paso: 0, pasos: 1, seguida: true, lista: [{ n: 0, texto: "", tipo: "coge", hecho: true, que: "llave" }] }], objetivos: () => [], dialogo: () => null,
    elegir: () => ({ ok: true as const }), adios: () => ({ ok: true as const }), usar: () => ({ ok: true as const }), ofrece: () => true, alCambiar: (fn: never) => { alCambiar = fn; return () => {}; } };
  const view = { vr: { active: true, pagina: "mandos" as const, dialogo() {}, nota() {}, onElegir() {}, onAtras() {} }, ar: { state: "off" },
    manos: { reglas() {}, on() {}, vibrar: (l: Lado, v?: number, ms?: number) => f.m.vibrar(l, v, ms), llevable: f.m.llevable },
    llevar: (k: string, d: string | null) => { lleva[k] = d; }, llevando: () => ({}) };
  const xr = montarXR({ session: { features: { use: () => ({ ok: true as const }) } }, view: view as never, misiones: misiones as never, interaccion: { actual: () => null, usar: () => ({ ok: true as const }), mirar() {}, mantener: { empezar() {}, soltar() {} } } as never });
  void alCambiar;
  assert.deepEqual(xr.enMano(), { llave: "der" });
  f.poner(f.IZQ, 0); f.poner(f.DER, 0.05); f.cuadro(); f.agarre(f.IZQ, 1); f.cuadro();
  assert.deepEqual(xr.enMano(), { llave: "izq" });
  assert.equal(lleva["misiones:llave"], "izq");
});

// ── darts ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function dardosFalsos() {
  const { montarDardosVR } = await import("../apps/plaza/dardos-vr.ts");
  const f = montar();
  const est = { sitio: "diana", dardos: 0, aviso: "", tirada: 0, ultimo: null, fin: null };
  const lanzados: unknown[][] = [];
  const dardos = { estado: () => est, duelo: () => null, sitios: () => [], jugar: () => ({ ok: true as const }), cambiar: () => ({ ok: true as const }), empezar: () => ({ ok: true as const }), clavados: () => [],
    lanzar: (...a: unknown[]) => { lanzados.push(a); return { ok: true as const }; }, alCambiar: () => () => {} };
  let marco: (dt: number) => void = () => {}; let enMano: Lado | null = null; const historial: (Lado | null)[] = [];
  const pos: Record<Lado, [number, number, number]> = { izq: [0, 1, 0], der: [0, 1, 0] };
  const vrd = {
    cara: () => ({ c: [0, 1, -3] as [number, number, number], n: [0, 0, 1] as [number, number, number], r: [1, 0, 0] as [number, number, number], m: 0.408 }), puntoMundo: () => [0, 1, -3] as [number, number, number],
    enMano: (l: Lado | null) => { enMano = l; historial.push(l); return true; }, posicion: (l: Lado) => pos[l], local: (l: Lado) => pos[l], aMundo: (v: [number, number, number]) => v,
    volar: () => ({ resolver() {} }), soltar: () => {}, cadaCuadro: (fn: (dt: number) => void) => { marco = fn; return () => {}; }, marcador: { mostrar() {}, alPulsar: () => () => {} },
  };
  const view = { vr: { active: true, nota: (t: string) => f.avisos.push(t) }, manos: { entrada: (l: Lado) => f.m.entrada(l), vibrar: (l: Lado, v?: number, ms?: number) => f.m.vibrar(l, v, ms), ocupar: f.m.ocupar,
    ocupadaPorOtros: f.m.ocupadaPorOtros, sondeo: (l: Lado) => f.m.sondeo(l), llevable: f.m.llevable }, dardosVR: { cargar: async () => vrd } };
  const api = await montarDardosVR({ dardos: dardos as never, view: view as never, yo: () => 1 });
  // one frame at time `t`: the hand `l` moves to x (the page samples the anchor's local position)
  const ahora = performance.now; let t = 1000; performance.now = () => t;
  const cuadro = (mover: Partial<Record<Lado, [number, number, number]>> = {}, avanza = 16) => { t += avanza; Object.assign(pos, mover); f.cuadro(); marco(0.016); };
  return { f, api, cuadro, lanzados, pos, enMano: () => enMano, historial, restaurar: () => { performance.now = ahora; } };
}

test("el dardo: la mano libre junto a la que lo lleva + agarre lo pasa, sin lanzar, y se lanza desde la nueva mano", async () => {
  const d = await dardosFalsos(); const f = d.f;
  try {
    f.poner(f.IZQ, -0.6); f.poner(f.DER, 0); d.cuadro();
    f.agarre(f.DER, 1); d.cuadro();                       // take it with the right grip
    assert.equal(d.api.sosteniendo(), "der"); assert.equal(d.enMano(), "der");
    f.agarre(f.DER, 0);                                   // (a controller's grip released = throw: hold it instead)
    f.agarre(f.DER, 1); f.poner(f.IZQ, -0.05);
    d.cuadro(); d.cuadro();
    const antesPulsos = f.pulsos.length;
    f.agarre(f.IZQ, 1); d.cuadro();                       // the free hand's grip next to it
    assert.equal(d.api.sosteniendo(), "izq", "the dart is in the left hand"); assert.equal(d.enMano(), "izq");
    assert.deepEqual(f.pulsos.slice(antesPulsos).map((p) => p[0]).sort(), [0, 1], "both buzzed");
    // the hand that gave it lets go, the one that took it moves and opens its grip: still no throw
    f.agarre(f.DER, 0); d.cuadro({ izq: [0, 1, -0.4] }); d.cuadro({ izq: [0, 1, -1.2] }); f.agarre(f.IZQ, 0); d.cuadro();
    assert.equal(d.lanzados.length, 0, "the handover itself threw nothing");
    assert.equal(d.api.sosteniendo(), "izq", "the grip that passed it opened: not a release");
    // a real throw from the new hand: grip, then a fast flick toward the board and the trigger
    f.agarre(f.IZQ, 1); d.cuadro({ izq: [0, 1, 0] }, 400);
    for (let i = 1; i <= 8; i++) d.cuadro({ izq: [0, 1, -0.07 * i] }, 10); // 7 m/s toward -z
    f.agarre(f.IZQ, 0); d.cuadro({ izq: [0, 1, -0.6] }, 10);
    assert.equal(d.lanzados.length, 1, "the throw works from the new hand " + JSON.stringify(d.api.ultimo()));
  } finally { d.restaurar(); }
});

test("el dardo: el botón pasa el dardo; con el reloj en la otra mano o sin dardo, no", async () => {
  const d = await dardosFalsos(); const f = d.f;
  try {
    f.poner(f.IZQ, -2); f.poner(f.DER, 0); d.cuadro(); f.agarre(f.DER, 1); d.cuadro(); f.agarre(f.DER, 0);
    f.m.ocupar("reloj", (l) => l === "izq");
    const no = f.m.cambiarMano(); assert.equal(no.ok, false, "the watch hand does not receive"); assert.equal(d.api.sosteniendo(), "der");
    const libre = montar(); assert.equal(libre.m.cambiarMano().ok, false, "nothing in hand: says so");
  } finally { d.restaurar(); }
  const e = await dardosFalsos(); const g = e.f;
  try {
    g.poner(g.IZQ, -2); g.poner(g.DER, 0); e.cuadro(); g.agarre(g.DER, 1); e.cuadro(); g.agarre(g.DER, 0);
    const r = g.m.cambiarMano(); assert.deepEqual(r, { ok: true, que: "el dardo", a: "izq" });
    assert.equal(e.api.sosteniendo(), "izq"); assert.equal(e.enMano(), "izq");
    // today's rule stays: a hand with a dart receives nothing else (it takes no second dart with the other hand)
    g.agarre(g.DER, 1); e.cuadro(); assert.equal(e.api.sosteniendo(), "izq");
  } finally { e.restaurar(); }
});

// ── N3: let go of what you carry (Pablo, 18-10: «estas cosas se deberían de poder tirar y dejar ahí») ───────────────────

/** A fake held thing with the rules of a piece that can be let go. */
function cosaSoltable(f: ReturnType<typeof montar>, lado0: Lado, nombre = "cosa", que = "la cosa", rechaza: string | true = true) {
  const e = { lado: lado0 as Lado | null, soltadas: 0 };
  f.m.llevable(nombre, { que, lado: () => e.lado, puede: () => true, pasar: (a) => { e.lado = a; }, soltar: () => { if (rechaza !== true) return rechaza; e.lado = null; e.soltadas++; return true; } });
  return e;
}

test("N3 el botón: soltar() deja ir lo que lleva la mano que se nombra, o lo primero que se lleva, y la mano vibra", () => {
  const f = montar(); const a = cosaSoltable(f, "izq", "uno", "el uno"); const b = cosaSoltable(f, "der", "dos", "el dos");
  f.cuadro();
  const oidos: unknown[] = []; f.m.on((e) => { oidos.push(e); });
  const r = f.m.soltar("der"); assert.deepEqual(r, { ok: true, que: "el dos", lado: "der" });
  assert.deepEqual(oidos, [{ tipo: "soltar", que: "el dos", lado: "der" }], "the page hears the drop (session log)");
  assert.equal(b.lado, null); assert.equal(a.lado, "izq", "the other hand keeps its thing");
  assert.deepEqual(f.pulsos.map((p) => p[0]), [1], "only the hand that let go buzzes");
  assert.deepEqual(f.m.soltar(), { ok: true, que: "el uno", lado: "izq" });
  assert.deepEqual(f.m.llevando(), []);
  const v = f.m.soltar(); assert.equal(v.ok, false); assert.match(v.ok ? "" : v.why, /nada en la mano/);
});

test("N3 una pieza que no sabe soltarse lo dice con palabras; una que rechaza da su motivo", () => {
  const f = montar();
  f.m.llevable("fija", { que: "la llave", lado: () => "der", puede: () => true, pasar: () => {} });
  const r = f.m.soltar("der"); assert.equal(r.ok, false); assert.match(r.ok ? "" : r.why, /La llave no se puede soltar/);
  const g = montar(); cosaSoltable(g, "izq", "x", "el x", "Ahora no");
  assert.deepEqual(g.m.soltar("izq"), { ok: false, why: "Ahora no" });
});

test("N3 el gesto: la palanca de un mando, pulsada y mantenida, suelta lo que lleva esa mano (una vez por pulsación)", () => {
  const f = montar(); const c = cosaSoltable(f, "der", "dos", "el dos"); const otra = cosaSoltable(f, "izq", "uno", "el uno");
  f.cuadro();
  f.palanca(f.DER, true); f.cuadro(); f.cuadro(SOLTAR_PULSAR_MS - 50);
  assert.equal(c.soltadas, 0, "a click that is not held lets nothing go");
  f.cuadro(100);
  assert.equal(c.soltadas, 1, "held long enough: it goes"); assert.equal(otra.lado, "izq", "only that hand's thing");
  assert.match(f.avisos.at(-1) ?? "", /Soltado: el dos/);
  c.lado = "der"; f.cuadro(2000); assert.equal(c.soltadas, 1, "the same press does not drop again");
  f.palanca(f.DER, false); f.cuadro(10); f.palanca(f.DER, true); f.cuadro(10); f.cuadro(SOLTAR_PULSAR_MS + 10);
  assert.equal(c.soltadas, 2, "a new press does");
});

test("N3 el gesto: un toque corto, o una palanca de una mano que no lleva nada, no suelta nada", () => {
  const f = montar(); const c = cosaSoltable(f, "der");
  f.cuadro();
  f.palanca(f.DER, true); f.cuadro(); f.cuadro(200); f.palanca(f.DER, false); f.cuadro(10);
  f.palanca(f.DER, true); f.cuadro(); f.cuadro(300); f.palanca(f.DER, false); f.cuadro(10);
  assert.equal(c.soltadas, 0, "two short clicks are not one held press");
  f.palanca(f.IZQ, true); f.cuadro(); f.cuadro(SOLTAR_PULSAR_MS + 100);
  assert.equal(c.soltadas, 0, "the left stick, with nothing in the left hand, does nothing"); assert.deepEqual(f.avisos, []);
});

test("N3 la caña: soltar() la devuelve a su soporte (también con un pez en la línea) y la mano queda libre", () => {
  const c = cañaFalsa("nada"); const f = c.f;
  f.poner(f.IZQ, -0.6); f.poner(f.DER, 0); f.cuadro();
  f.agarre(f.DER, 1); c.marco(); f.agarre(f.DER, 0); c.marco(); c.quitarCerca();
  assert.equal(c.pagina.sujeta(), "der");
  c.est.fase = "pelea";
  const r = f.m.soltar("der"); assert.deepEqual(r, { ok: true, que: "la caña", lado: "der" });
  assert.equal(c.pagina.sujeta(), null); assert.equal(c.sujeciones.at(-1), null);
  assert.ok(c.llamadas.includes("soltar"), "the fish is let go too (as the grip does)");
  assert.deepEqual(f.m.llevando(), []);
  assert.equal(f.m.soltar().ok, false, "nothing left to drop");
});

test("N3 el dardo: soltar() lo quita de la mano sin lanzarlo, y el mismo agarre cerrado no lo vuelve a coger", async () => {
  const d = await dardosFalsos(); const f = d.f;
  try {
    f.poner(f.IZQ, -0.6); f.poner(f.DER, 0); d.cuadro();
    f.agarre(f.DER, 1); d.cuadro();
    assert.equal(d.api.sosteniendo(), "der"); assert.equal(d.enMano(), "der");
    const r = f.m.soltar("der"); assert.deepEqual(r, { ok: true, que: "el dardo", lado: "der" });
    assert.equal(d.api.sosteniendo(), null); assert.equal(d.enMano(), null); assert.equal(d.lanzados.length, 0, "it was not thrown");
    d.cuadro(); d.cuadro(); assert.equal(d.api.sosteniendo(), null, "the grip is still closed: it does not take another");
    f.agarre(f.DER, 0); d.cuadro(); f.agarre(f.DER, 1); d.cuadro();
    assert.equal(d.api.sosteniendo(), "der", "open and close the grip: it takes one again");
    assert.equal(d.lanzados.length, 0);
  } finally { d.restaurar(); }
});

test("N3 un objeto de misión: soltarlo libera la mano, no lo redibuja el siguiente cambio del libro, y al acabar el paso vuelve a poder llevarse", () => {
  const f = montar();
  const lleva: Record<string, string | null> = {}; const oyentes: ((q: "libro") => void)[] = []; let activa = true;
  const misiones = { estado: { nota: "" }, libro: () => [{ id: "m", estado: activa ? "activa" : "hecha", titulo: "", paso: 0, pasos: 1, seguida: true, lista: [{ n: 0, texto: "", tipo: "coge", hecho: true, que: "semillas" }] }], objetivos: () => [], dialogo: () => null,
    elegir: () => ({ ok: true as const }), adios: () => ({ ok: true as const }), usar: () => ({ ok: true as const }), ofrece: () => true, alCambiar: (fn: never) => { oyentes.push(fn); return () => {}; } };
  const view = { vr: { active: true, pagina: "mandos" as const, dialogo() {}, nota() {}, onElegir() {}, onAtras() {} }, ar: { state: "off" },
    manos: { reglas() {}, on() {}, vibrar: (l: Lado, v?: number, ms?: number) => f.m.vibrar(l, v, ms), llevable: f.m.llevable },
    llevar: (k: string, d: string | null) => { lleva[k] = d; }, llevando: () => ({}) };
  const xr = montarXR({ session: { features: { use: () => ({ ok: true as const }) } }, view: view as never, misiones: misiones as never, interaccion: { actual: () => null, usar: () => ({ ok: true as const }), mirar() {}, mantener: { empezar() {}, soltar() {} } } } as never);
  assert.deepEqual(xr.enMano(), { semillas: "der" });
  const r = f.m.soltar("der"); assert.deepEqual(r, { ok: true, que: "lo que llevas", lado: "der" });
  assert.deepEqual(xr.enMano(), {}); assert.equal(lleva["misiones:semillas"], null, "the hand is drawn empty");
  assert.deepEqual(f.m.llevando(), []);
  for (const fn of oyentes) fn("libro");                                  // the book changes (a note, another step): not redrawn
  assert.deepEqual(xr.enMano(), {}, "stays out of the hand while its step stands");
  activa = false; for (const fn of oyentes) fn("libro");                    // the quest ends
  activa = true; for (const fn of oyentes) fn("libro");                     // and a new one with the same name starts
  assert.deepEqual(xr.enMano(), { semillas: "der" }, "a next quest thing of the same name is carried again");
});
