// S5 · el oyente: lo único del motor que mueve el `AudioListener`. Aquí se comprueba con un `AudioContext` y un
// `XRFrame` de mentira (en Node no hay ni Web Audio ni WebXR) lo que de verdad importa: de DÓNDE saca la pose
// (la cámara fuera de XR, el visor dentro — nunca la posición de red), que el oyente está CENTRADO ENTRE LOS
// OJOS, que al salir de la sesión vuelve a la cámara, que no reserva memoria por fotograma y que con la API
// vieja (`setPosition`/`setOrientation`, la única vía en Firefox) también suena.
import test from "node:test";
import assert from "node:assert/strict";
import { crearOyente, conectar, seEspacializa, EN_LA_CABEZA, RAMPA_S, type Camara, type Escucha } from "../packages/render/src/audio/oyente.ts";
import { crearNucleo, BUSES } from "../packages/render/src/audio/nucleo.ts";

// ---- matrices de mentira (columnas, como three.js y como `XRRigidTransform.matrix`) ----------------------
/** Giro de `yaw` radianes alrededor de Y + traslación. */
function matriz(x: number, y: number, z: number, yaw = 0): Float64Array {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return Float64Array.from([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]);
}
const camaraDe = (m: Float64Array, padre?: Float64Array): Camara & { matrixWorld: { elements: Float64Array }; veces: number } => {
  const cam = { veces: 0, matrixWorld: { elements: m }, parent: padre ? { matrixWorld: { elements: padre } } : null, updateMatrixWorld() { cam.veces++; } };
  return cam as never;
};

/** Un `AudioListener` moderno que apunta todo lo que le dicen. */
function escuchaNueva() {
  const puesto: Record<string, number> = {}, taus: number[] = [];
  const p = (n: string) => ({ value: 0, setTargetAtTime(v: number, _t: number, tau: number) { puesto[n] = v; this.value = v; taus.push(tau); } });
  const L = { positionX: p("x"), positionY: p("y"), positionZ: p("z"), forwardX: p("fx"), forwardY: p("fy"), forwardZ: p("fz"), upX: p("ux"), upY: p("uy"), upZ: p("uz") };
  return { L: L as unknown as Escucha, puesto, taus };
}
/** Un `AudioListener` de 2013: solo `setPosition`/`setOrientation`. */
function escuchaVieja() {
  const llamadas: { pos: number[][]; ori: number[][] } = { pos: [], ori: [] };
  const L: Escucha = {
    setPosition(x, y, z) { llamadas.pos.push([x, y, z]); },
    setOrientation(fx, fy, fz, ux, uy, uz) { llamadas.ori.push([fx, fy, fz, ux, uy, uz]); },
  };
  return { L, llamadas };
}

/** Un `XRFrame` de mentira: su pose del visor y, aparte, la de cada ojo. */
function frameXR(visor: Float64Array | null, ojoIzq?: Float64Array, ojoDer?: Float64Array) {
  const vistas = ojoIzq ? [{ transform: { matrix: ojoIzq } }, { transform: { matrix: ojoDer ?? ojoIzq } }] : undefined;
  return { getViewerPose: () => (visor || vistas ? { transform: visor ? { matrix: visor } : null, views: vistas } : null) };
}

const cerca = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

test("fuera de XR el oyente sigue a la CÁMARA (posición y orientación), no a la posición de red", () => {
  // mi muñeco está en la red en (100, 0, 100); la cámara, que es por donde oigo, en (3, 1.7, −4) mirando a +x
  const cam = camaraDe(matriz(3, 1.7, -4, -Math.PI / 2));
  const e = escuchaNueva();
  const o = crearOyente({ camara: () => cam, escucha: () => e.L });
  o.actualizar();
  assert.equal(o.pose().fuente, "camara");
  cerca(e.puesto.x, 3, "x"); cerca(e.puesto.y, 1.7, "y"); cerca(e.puesto.z, -4, "z");
  cerca(e.puesto.fx, 1, "mira a +x"); cerca(e.puesto.fy, 0, "fy"); cerca(e.puesto.fz, 0, "fz");
  cerca(e.puesto.ux, 0, "ux"); cerca(e.puesto.uy, 1, "arriba es +y"); cerca(e.puesto.uz, 0, "uz");
  assert.ok(cam.veces >= 1, "la cámara se refresca antes de leerla (updateMatrixWorld)");
  assert.ok(e.taus.every((t) => t === RAMPA_S), "todo va con rampa de 20 ms: nada de saltos ni clics");
});

test("girar la cabeza cambia el oyente (es el fallo que arregla S5)", () => {
  const m = matriz(0, 1.6, 0, 0);
  const cam = camaraDe(m);
  const e = escuchaNueva();
  const o = crearOyente({ camara: () => cam, escucha: () => e.L });
  o.actualizar();
  cerca(e.puesto.fz, -1, "de frente mira a −z");
  m.set(matriz(0, 1.6, 0, Math.PI / 2));   // media vuelta a la izquierda
  o.actualizar();
  cerca(e.puesto.fx, -1, "tras girar, mira a −x");
  cerca(e.puesto.fz, 0, "y ya no a −z");
});

test("en XR manda la pose del VISOR (compuesta con el rig), nunca la posición de red ni la cámara plana", () => {
  // el rig está en (10, 0, 0); dentro de él, el visor se ha movido a (0, 1.6, −2) mirando a −z
  const rig = matriz(10, 0, 0, 0);
  const cam = camaraDe(matriz(999, 999, 999), rig);   // la matriz de la cámara plana es basura a propósito
  const e = escuchaNueva();
  let f: ReturnType<typeof frameXR> | null = frameXR(matriz(0, 1.6, -2, 0));
  const o = crearOyente({ camara: () => cam, escucha: () => e.L, xr: { presentando: () => true, fotograma: () => f, espacio: () => ({}) } });
  o.actualizar();
  assert.equal(o.pose().fuente, "visor");
  cerca(e.puesto.x, 10, "el rig lleva la pose al mundo");
  cerca(e.puesto.y, 1.6, "altura real de los ojos, no +1,5 m de oficio");
  cerca(e.puesto.z, -2, "z");
  assert.notEqual(e.puesto.x, 999);
  // y si el visor gira sin que nadie se mueva, el oyente gira con él
  f = frameXR(matriz(0, 1.6, -2, Math.PI / 2));
  o.actualizar();
  cerca(e.puesto.fx, -1, "la cabeza giró: el mundo suena girado");
});

test("UN solo oyente, centrado entre los dos ojos (three.js #20920: nunca el de un ojo)", () => {
  const izq = matriz(-0.032, 1.6, 0), der = matriz(0.032, 1.6, 0);
  const e = escuchaNueva();
  // 1) con `transform` (lo normal): ES el punto del visor, que ya está entre los ojos
  let f = frameXR(matriz(0, 1.6, 0), izq, der);
  const o = crearOyente({ camara: () => camaraDe(matriz(0, 0, 0)), escucha: () => e.L, xr: { presentando: () => true, fotograma: () => f, espacio: () => null } });
  o.actualizar();
  cerca(e.puesto.x, 0, "centrado");
  assert.notEqual(e.puesto.x, -0.032); assert.notEqual(e.puesto.x, 0.032);
  // 2) sin `transform`: la media de los dos ojos, jamás `views[0]`
  f = frameXR(null, izq, der);
  const e2 = escuchaNueva();
  const o2 = crearOyente({ camara: () => camaraDe(matriz(0, 0, 0)), escucha: () => e2.L, xr: { presentando: () => true, fotograma: () => f, espacio: () => null } });
  o2.actualizar();
  cerca(e2.puesto.x, 0, "media de los dos ojos");
  // 3) un ojo moviéndose no mueve el oyente (es lo que hacía tartamudear a three.js)
  const antes = e2.puesto.x;
  izq.set(matriz(-0.2, 1.6, 0)); der.set(matriz(0.2, 1.6, 0));
  o2.actualizar();
  cerca(e2.puesto.x, antes, "la separación de los ojos no mueve el oyente");
});

test("al salir de la sesión inmersiva el oyente vuelve a la cámara, en el acto", () => {
  const cam = camaraDe(matriz(5, 1.7, 5), matriz(0, 0, 0));
  const e = escuchaNueva();
  let dentro = true;
  const o = crearOyente({ camara: () => cam, escucha: () => e.L, xr: { presentando: () => dentro, fotograma: () => frameXR(matriz(0, 1.6, -40)), espacio: () => null }, hz: 30 });
  o.actualizar(); cerca(e.puesto.z, -40, "dentro manda el visor");
  dentro = false;
  o.alSalirXR();
  assert.equal(o.pose().fuente, "camara");
  cerca(e.puesto.x, 5, "fuera vuelve a mandar la cámara");
  cerca(e.puesto.z, 5, "y en el acto, sin esperar al siguiente tic de 30 Hz");
});

test("un fotograma sin seguimiento (getViewerPose devuelve null) no borra la pose: se queda la última", () => {
  const e = escuchaNueva();
  let hay = true;
  const o = crearOyente({ camara: () => camaraDe(matriz(0, 0, 0), matriz(0, 0, 0)), escucha: () => e.L, xr: { presentando: () => true, fotograma: () => (hay ? frameXR(matriz(1, 1.6, 2)) : frameXR(null)), espacio: () => null } });
  o.actualizar(); cerca(e.puesto.x, 1, "pose buena");
  hay = false;
  o.actualizar();
  cerca(e.puesto.x, 1, "sigue la última pose buena, no un salto al origen");
});

test("con la API vieja (setPosition/setOrientation) también funciona", () => {
  const v = escuchaVieja();
  const cam = camaraDe(matriz(2, 1.6, -3, Math.PI));
  const o = crearOyente({ camara: () => cam, escucha: () => v.L });
  o.actualizar();
  assert.equal(v.llamadas.pos.length, 1);
  assert.deepEqual(v.llamadas.pos[0].map((n) => Math.round(n * 1000) / 1000), [2, 1.6, -3]);
  const [fx, , fz, ux, uy, uz] = v.llamadas.ori[0];
  cerca(fx, 0, "fx"); cerca(fz, 1, "media vuelta: mira a +z");
  cerca(ux, 0, "ux"); cerca(uy, 1, "uy"); cerca(uz, 0, "uz");
});

test("si no hay oyente todavía (sin gesto, sin audio) no revienta ni se queda pillado", () => {
  let hay = false;
  const e = escuchaNueva();
  const cam = camaraDe(matriz(1, 1, 1));
  const o = crearOyente({ camara: () => cam, escucha: () => (hay ? e.L : null) });
  o.actualizar(); o.actualizar();
  assert.equal(e.puesto.x, undefined);
  hay = true;
  o.actualizar();
  cerca(e.puesto.x, 1, "en cuanto hay audio, lo coge");
});

test("a 30 Hz se salta fotogramas, pero `forzar` siempre pasa", () => {
  const e = escuchaNueva();
  const cam = camaraDe(matriz(0, 0, 0));
  let ms = 0;
  const o = crearOyente({ camara: () => cam, escucha: () => e.L, hz: 30, ahora: () => ms });
  o.actualizar(); o.actualizar(); o.actualizar();
  assert.equal(o.coste().cuadros, 1, "tres llamadas en el mismo milisegundo = un cálculo");
  ms = 40;
  o.actualizar();
  assert.equal(o.coste().cuadros, 2);
  o.actualizar(true);
  assert.equal(o.coste().cuadros, 3, "forzar no espera");
});

test("dos fotogramas seguidos no reservan ni un objeto nuevo", () => {
  // La pose es SIEMPRE el mismo objeto (leerla no reserva) …
  const e = escuchaNueva();
  const m = matriz(0, 1.6, 0);
  const cam = camaraDe(m);
  const o = crearOyente({ camara: () => cam, escucha: () => e.L });
  o.actualizar();
  const a = o.pose();
  m[12] = 1; o.actualizar();
  assert.equal(o.pose(), a, "el mismo objeto, no uno nuevo por fotograma");
  // … y el bucle entero no reserva: medio millón de fotogramas moviéndose sin parar (≈150 ms: la batería de
  // pruebas corre en paralelo y un bucle más largo envenenaría los p99 de las pruebas de coste). Si cada
  // fotograma reservara el objeto más pequeño de V8 (~56 B) serían ≈28 MB; el presupuesto son 5.
  const leanParam = { value: 0, setTargetAtTime(v: number) { this.value = v; } };
  const L = { positionX: leanParam, positionY: leanParam, positionZ: leanParam, forwardX: leanParam, forwardY: leanParam, forwardZ: leanParam, upX: leanParam, upY: leanParam, upZ: leanParam } as unknown as Escucha;
  const rig = matriz(0, 0, 0);
  const visor = matriz(0, 1.6, 0);
  const f = frameXR(visor);
  const cam2 = camaraDe(matriz(0, 0, 0), rig);
  const o2 = crearOyente({ camara: () => cam2, escucha: () => L, xr: { presentando: () => true, fotograma: () => f, espacio: () => null } });
  o2.actualizar();
  globalThis.gc?.();
  const antes = process.memoryUsage().heapUsed;
  for (let i = 0; i < 500_000; i++) { visor[12] = i * 1e-6; o2.actualizar(); }
  const crecio = process.memoryUsage().heapUsed - antes;
  assert.ok(crecio < 5 * 1024 * 1024, `medio millón de fotogramas dejaron ${(crecio / 1048576).toFixed(1)} MB en el montón (el presupuesto es 5 MB; con una reserva por fotograma serían ≈28)`);
  assert.equal(o2.coste().escrituras, 500_000, "y cada fotograma sí movió el oyente de verdad");
});

test("lo que no cambia no se vuelve a escribir (el oyente quieto no gasta)", () => {
  const e = escuchaNueva();
  const cam = camaraDe(matriz(0, 1.6, 0));
  const o = crearOyente({ camara: () => cam, escucha: () => e.L });
  o.actualizar(); o.actualizar(); o.actualizar();
  assert.equal(o.coste().escrituras, 1);
  assert.equal(o.coste().saltados, 2);
});

// ---- lo mío suena en mi cabeza -------------------------------------------------------------------------
test("`interfaz` y `pasos-propios` NO se espacializan: su panner se ignora a propósito", () => {
  for (const b of BUSES) assert.equal(seEspacializa(b), !EN_LA_CABEZA.includes(b), b);
  assert.deepEqual([...EN_LA_CABEZA], ["interfaz", "pasos-propios"]);

  const conexiones: [unknown, unknown][] = [];
  const nodo = (tipo: string, extra: Record<string, unknown> = {}) => { const n = { tipo, connect(d: unknown) { conexiones.push([n, d]); return d; }, disconnect() {}, ...extra }; return n; };
  const param = () => ({ value: 1, setTargetAtTime(v: number) { this.value = v; } });
  const ctx = {
    state: "running" as AudioContextState, currentTime: 0, destination: { tipo: "destino" },
    createGain: () => nodo("gain", { gain: param() }),
    createDynamicsCompressor: () => nodo("limitador", { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    suspend: () => Promise.resolve(), resume: () => Promise.resolve(), addEventListener() {},
  };
  const n = crearNucleo({ crear: () => ctx as unknown as AudioContext, hayGesto: () => true, trasGesto: (fn) => fn(), enCadaGesto: () => {}, visibilidad: () => false });

  for (const bus of ["interfaz", "pasos-propios"] as const) {
    conexiones.length = 0;
    const fuente = nodo("fuente"), panner = nodo("panner");
    const destino = conectar(n, fuente as unknown as AudioNode, bus, panner as unknown as PannerNode);
    assert.equal(destino, n.bus(bus), "acaba en su bus");
    assert.ok(conexiones.some(([de, a]) => de === fuente && a === n.bus(bus)), `${bus}: la fuente entra derecha al bus`);
    assert.ok(!conexiones.some(([de]) => de === panner), `${bus}: el panner NO se conecta a nada`);
    assert.ok(!conexiones.some(([, a]) => a === panner), `${bus}: y nadie entra en el panner`);
  }
  // y el resto de buses sí: fuente → panner → bus
  conexiones.length = 0;
  const fuente = nodo("fuente"), panner = nodo("panner");
  conectar(n, fuente as unknown as AudioNode, "efectos", panner as unknown as PannerNode);
  assert.ok(conexiones.some(([de, a]) => de === fuente && a === panner), "efectos: la fuente pasa por el panner");
  assert.ok(conexiones.some(([de, a]) => de === panner && a === n.bus("efectos")), "efectos: y el panner entra al bus");
});
