// tools/economia: los nodos básicos del simulador de economías (almacén, fuente, sumidero, conversor,
// puerta, registro, activador, disparador), su validación y el determinismo (misma semilla → misma serie).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validar, type Diagrama } from "../tools/economia/diagrama.ts";
import { correr, finales, primerTick, resumen, simular } from "../tools/economia/simular.ts";

test("una fuente llena un almacén a su tasa; un sumidero lo vacía; el almacén respeta su máximo", () => {
  const d: Diagrama = {
    nombre: "fuente y sumidero",
    nodos: [
      { tipo: "almacen", id: "agua", max: 25 },
      { tipo: "fuente", id: "lluvia", salidas: [{ a: "agua", tasa: 3 }] },
      { tipo: "sumidero", id: "sol", de: "agua", tasa: 1 },
    ],
  };
  const r = simular(d, { ticks: 20, semilla: 1 });
  assert.deepEqual(r.series.agua.slice(0, 4), [0, 2, 4, 6]);
  assert.ok(r.series.agua.every((x) => x <= 25)); // +2 por tick, pero el máximo lo para (sin máximo acabaría en 40)
  assert.equal(r.series.agua[20], 24); // lleno a 25 por la lluvia, el sol quita 1 después
  assert.equal(r.disparos.lluvia, 20);
});

test("un conversor es todo o nada: no convierte hasta tener las entradas enteras", () => {
  const d: Diagrama = {
    nombre: "conversor",
    nodos: [
      { tipo: "almacen", id: "trigo" },
      { tipo: "almacen", id: "pan" },
      { tipo: "fuente", id: "campo", salidas: [{ a: "trigo", tasa: 2 }] },
      { tipo: "conversor", id: "horno", entradas: [{ de: "trigo", tasa: 5 }], salidas: [{ a: "pan", tasa: 1 }] },
    ],
  };
  const r = simular(d, { ticks: 6, semilla: 1 });
  // tick1 trigo 2, tick2 4, tick3 6→1 pan 1, tick4 3, tick5 5→0 pan 2, tick6 2
  assert.deepEqual(r.series.pan, [0, 0, 0, 1, 1, 2, 2]);
  assert.deepEqual(r.series.trigo, [0, 2, 4, 1, 3, 0, 2]);
});

test("un conversor con `veces` convierte varias veces en un tick, y los activadores lo apagan", () => {
  const d: Diagrama = {
    nombre: "veces y activador",
    nodos: [
      { tipo: "almacen", id: "oro", inicial: 23 },
      { tipo: "almacen", id: "casas" },
      { tipo: "conversor", id: "construir", entradas: [{ de: "oro", tasa: 5 }], salidas: [{ a: "casas" }], veces: 9 },
    ],
    estados: [{ tipo: "activador", si: "casas", es: "<", que: 3, activa: "construir" }],
  };
  const r = simular(d, { ticks: 1, semilla: 1 });
  // sin activador haría 4 casas (20 oro); el activador lo corta al llegar a 3 (se comprueba en cada vez: 3 casas, 8 oro)
  assert.equal(r.series.casas[1], 4 - 1);
  assert.equal(r.series.oro[1], 23 - 15);
});

test("una puerta con reparto por turnos reparte exactamente según los pesos; con azar, aproximadamente", () => {
  const base = (reparto: "turnos" | "azar"): Diagrama => ({
    nombre: `puerta ${reparto}`,
    nodos: [
      { tipo: "almacen", id: "cola" },
      { tipo: "almacen", id: "a" },
      { tipo: "almacen", id: "b" },
      { tipo: "fuente", id: "gente", salidas: [{ a: "cola", tasa: 10 }] },
      { tipo: "puerta", id: "reparto", de: "cola", tasa: 10, reparto, salidas: [{ a: "a", peso: 3 }, { a: "b", peso: 1 }, { peso: 1 }] },
    ],
  });
  const t = simular(base("turnos"), { ticks: 10, semilla: 1 });
  assert.equal(t.series.a[10], 60);
  assert.equal(t.series.b[10], 20); // y 20 unidades se perdieron por la salida sin destino
  const z = simular(base("azar"), { ticks: 100, semilla: 7 });
  assert.ok(Math.abs(z.series.a[100] - 600) < 60, `azar a=${z.series.a[100]}`);
  assert.ok(Math.abs(z.series.b[100] - 200) < 50, `azar b=${z.series.b[100]}`);
});

test("registros y disparadores: una puerta con memoria (cada fallo sube el peso) y un disparador que reinicia", () => {
  const d: Diagrama = {
    nombre: "memoria",
    nodos: [
      { tipo: "almacen", id: "intentos" },
      { tipo: "almacen", id: "fallos" },
      { tipo: "almacen", id: "premios" },
      { tipo: "registro", id: "peso_premio", valor: { lee: "fallos", por: 100, mas: 0 } }, // 0 al principio: solo la memoria lo abre
      { tipo: "fuente", id: "tirar", salidas: [{ a: "intentos" }] },
      { tipo: "puerta", id: "dado", de: "intentos", salidas: [{ a: "premios", peso: { lee: "peso_premio" }, dispara: "olvidar" }, { a: "fallos", peso: 300 }] },
      { tipo: "sumidero", id: "olvidar", modo: "pasivo", de: "fallos", tasa: 1000 },
    ],
  };
  const r = simular(d, { ticks: 200, semilla: 3 });
  assert.ok(r.series.premios[200] > 20, `premios ${r.series.premios[200]}`);
  assert.ok(Math.max(...r.series.fallos) <= 12, "con peso 100·fallos frente a 300, la racha nunca es larga");
  assert.equal(r.disparos.olvidar, r.series.premios[200], "cada premio dispara el olvido una vez");
  // tras un premio, el contador de fallos está a 0 en ese mismo tick
  const i = r.series.premios.findIndex((p, k) => k > 0 && p > r.series.premios[k - 1]);
  assert.equal(r.series.fallos[i], 0);
});

test("tasas: dado, uniforme, función; `hasta` para la simulación; registro recursivo vale 0", () => {
  const d: Diagrama = {
    nombre: "tasas",
    nodos: [
      { tipo: "almacen", id: "d6" },
      { tipo: "almacen", id: "u" },
      { tipo: "almacen", id: "f" },
      { tipo: "almacen", id: "r" },
      { tipo: "registro", id: "bucle", valor: { lee: "bucle", mas: 1 } },
      { tipo: "fuente", id: "a", salidas: [{ a: "d6", tasa: { dado: 6, veces: 2 } }, { a: "u", tasa: { uniforme: [4, 4] } }, { a: "f", tasa: (leer) => leer("u") }, { a: "r", tasa: { lee: "bucle" } }] },
    ],
  };
  const r = simular(d, { ticks: 1000, semilla: 11, hasta: (leer, tick) => leer("u") >= 40 || tick >= 999 });
  assert.equal(r.ticks, 10);
  assert.equal(r.series.u[10], 40);
  assert.equal(r.series.f[10], 4 + 8 + 12 + 16 + 20 + 24 + 28 + 32 + 36 + 40);
  assert.ok(r.series.d6[10] >= 20 && r.series.d6[10] <= 120);
  assert.equal(r.series.r[10], 10, "un registro que se lee a sí mismo vale 0, así que mas:1 da 1 por tick");
});

test("determinismo: misma semilla → misma serie; otra semilla → otra serie; `correr` usa las semillas 1..n", () => {
  const d: Diagrama = {
    nombre: "azar",
    nodos: [
      { tipo: "almacen", id: "x" },
      { tipo: "fuente", id: "s", salidas: [{ a: "x", tasa: { dado: 20 } }], probabilidad: 500 },
    ],
  };
  const a = simular(d, { ticks: 50, semilla: 42 }), b = simular(d, { ticks: 50, semilla: 42 }), c = simular(d, { ticks: 50, semilla: 43 });
  assert.deepEqual(a.series, b.series);
  assert.notDeepEqual(a.series, c.series);
  const rs = correr(d, { ticks: 50, semillas: 3 });
  assert.deepEqual(rs[1].series, simular(d, { ticks: 50, semilla: 2 }).series);
  const fin = finales(rs, "x");
  assert.equal(fin.length, 3);
  assert.equal(primerTick(a, "x", 1_000_000), -1);
  assert.deepEqual(resumen([5, -1, 1, 3]), { n: 4, min: 1, p50: 3, p95: Infinity, max: Infinity, media: 3 });
});

test("validar: ids repetidos, referencias a nodos que no existen, tipos equivocados y números mal formados", () => {
  const d: Diagrama = {
    nombre: "mal",
    nodos: [
      { tipo: "almacen", id: "a", inicial: -1 },
      { tipo: "almacen", id: "a" },
      { tipo: "fuente", id: "f", salidas: [{ a: "no_existe", tasa: 1.5 }], probabilidad: 2000 },
      { tipo: "conversor", id: "c", entradas: [], salidas: [{ a: "f" }] },
      { tipo: "puerta", id: "p", de: "a", salidas: [{ a: "a", peso: 1, dispara: "a" }] },
      { tipo: "registro", id: "r", valor: { lee: "f" } },
    ],
    estados: [
      { tipo: "activador", si: "a", es: ">", que: 1, activa: "a" },
      { tipo: "disparador", cuando: "zz", dispara: "r" },
    ],
  };
  const v = validar(d);
  assert.equal(v.ok, false);
  if (v.ok) return;
  const paths = v.issues.map((i) => i.path);
  for (const p of ["nodos[0].inicial", "nodos[1].id", "nodos[2].salidas[0].a", "nodos[2].salidas[0].tasa", "nodos[2].probabilidad", "nodos[3].entradas", "nodos[3].salidas[0].a", "nodos[4].salidas[0].dispara", "nodos[5].valor.lee", "estados[0].activa", "estados[1].cuando", "estados[1].dispara"]) {
    assert.ok(paths.includes(p), `falta la pega en ${p}: ${paths.join(", ")}`);
  }
  const bien: Diagrama = { nombre: "bien", nodos: [{ tipo: "almacen", id: "a" }, { tipo: "fuente", id: "f", salidas: [{ a: "a" }] }] };
  assert.equal(validar(bien).ok, true);
});
