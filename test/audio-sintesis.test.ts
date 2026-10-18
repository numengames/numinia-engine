// Sonidos esquemáticos: cada id tiene receta, es finito, suena, no revienta, es repetible, los bucles empalman y el
// sintetizador cuelga del bus que toca del núcleo. (No se juzga cómo SUENA: eso se escucha con tools/sonidos-wav.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { IDS, RECETAS, BUS_DE, SR, generar, aWav, crearSintetizador } from "../packages/render/src/audio/sintesis.ts";
import { BUSES } from "../packages/render/src/audio/nucleo.ts";

/** Los 41 ids del catálogo S2 (work/motor-ar/sonido/biblioteca/catalogo.json): ninguno puede quedarse mudo. */
const CATALOGO = ["ui-pulsar", "ui-confirmar", "ui-error", "ui-aviso", "ui-chat", "ui-gente", "ui-logro", "ui-cuenta-atras", "pasos-piedra", "pasos-madera", "pasos-hierba", "coger-soltar", "golpe-material", "aterrizaje", "bed-torre-piedra", "bed-plaza-aire", "bed-niebla", "capa-estanque", "capa-ventanal-viento", "capa-fuego", "capa-alambique", "capa-gentio", "amb-gota-piedra", "amb-cuervo-lejano", "amb-crujido-madera", "amb-campana-lejana", "amb-burbuja", "amb-chasquido-fuego", "pasos-metal", "pasos-agua", "puerta", "cerradura", "pesca-lanzar", "pesca-chapuzon", "pesca-cobrar", "dardo-lanzar", "dardo-impacto", "dados", "teleport", "renacer", "maquina"];

const sha = (f: Float32Array) => createHash("sha256").update(Buffer.from(f.buffer, f.byteOffset, f.byteLength)).digest("hex");

test("todo id del catálogo tiene receta", () => {
  assert.equal(CATALOGO.length, 41);
  for (const id of CATALOGO) assert.ok(RECETAS[id], `falta la receta de ${id}`);
});

test("cada sonido es finito, suena, no se pasa de 1 y dura lo que dice", () => {
  for (const id of IDS) {
    const s = generar(id)!;
    assert.equal(s.datos.length >= Math.floor(RECETAS[id].dur * SR) - 1, true, `${id}: duración`);
    let pico = 0, e = 0;
    for (const x of s.datos) { assert.ok(Number.isFinite(x), `${id}: no finito`); pico = Math.max(pico, Math.abs(x)); e += x * x; }
    assert.ok(pico > 0.2 && pico <= 0.801, `${id}: pico ${pico}`);
    assert.ok(Math.sqrt(e / s.datos.length) > 0.01, `${id}: casi mudo`);
    assert.ok(BUSES.includes(BUS_DE[id]), `${id}: bus desconocido`);
  }
});

test("cada id suena distinto de los demás y se repite igual", () => {
  const vistos = new Map<string, string>();
  for (const id of IDS) {
    const h = sha(generar(id)!.datos);
    assert.equal(h, sha(generar(id)!.datos), `${id}: no es repetible`);
    assert.ok(!vistos.has(h), `${id} suena idéntico a ${vistos.get(h)}`);
    vistos.set(h, id);
  }
});

test("las variantes con azar cambian; las fijas no tienen por qué", () => {
  for (const id of ["dados", "capa-fuego", "pasos-metal", "amb-chasquido-fuego"]) assert.notEqual(sha(generar(id, 0)!.datos), sha(generar(id, 1)!.datos), id);
});

test("los bucles empalman: el final casi continúa con el principio", () => {
  for (const id of IDS.filter((i) => RECETAS[i].bucle)) {
    const d = generar(id)!.datos, n = d.length;
    // salto entre la última muestra y la primera, comparado con el paso típico entre muestras vecinas
    let paso = 0;
    for (let i = 1; i < 2000; i++) paso += Math.abs(d[n - 1 - i] - d[n - i]);
    paso /= 1999;
    assert.ok(Math.abs(d[0] - d[n - 1]) < Math.max(0.05, paso * 8), `${id}: costura de ${Math.abs(d[0] - d[n - 1])}`);
  }
});

test("el peso total es pequeño: ni un fichero, y la memoria de todo junto cabe en un móvil", () => {
  let bytes = 0;
  for (const id of IDS) bytes += generar(id)!.datos.byteLength;
  assert.ok(bytes < 8 * 1024 * 1024, `${bytes} bytes de Float32 para todo`);
});

test("aWav escribe una cabecera RIFF correcta", () => {
  const w = aWav(generar("ui-pulsar")!);
  assert.equal(Buffer.from(w.subarray(0, 4)).toString(), "RIFF");
  assert.equal(Buffer.from(w.subarray(8, 12)).toString(), "WAVE");
  assert.equal(new DataView(w.buffer).getUint32(24, true), SR);
});

test("el sintetizador cuelga del bus que toca y los bucles se pueden parar", () => {
  const llamadas: string[] = [];
  const busFalso = (n: string) => ({ n }) as unknown as GainNode;
  const ctx = {
    createBuffer: (_c: number, len: number) => ({ len, copyToChannel() {} }),
    createGain: () => ({ gain: { value: 1 }, connect(d: unknown) { llamadas.push(`gain→${(d as { n: string }).n}`); } }),
    createBufferSource: () => ({ buffer: null, loop: false, playbackRate: { value: 1 }, connect(d: unknown) { llamadas.push("fuente→gain"); return d; }, start() { llamadas.push("start"); }, stop() { llamadas.push("stop"); } }),
  };
  const nucleo = { ctx: () => ctx as unknown as AudioContext, bus: (b: string) => busFalso(b) } as never;
  const s = crearSintetizador(nucleo);
  assert.ok(s.tiene("puerta") && !s.tiene("no-existe"));
  assert.equal(s.sonar("no-existe"), null);
  const v = s.sonar("puerta", { vol: 0.5, tono: 1.1 });
  assert.ok(v);
  assert.deepEqual(llamadas, ["fuente→gain", "gain→efectos", "start"]);
  llamadas.length = 0;
  const bucle = s.sonar("capa-fuego")!;
  assert.deepEqual(llamadas, ["fuente→gain", "gain→ambiente", "start"]);
  bucle.parar();
  assert.equal(llamadas.at(-1), "stop");
  // sin navegador con audio: no suena ni revienta
  assert.equal(crearSintetizador({ ctx: () => null, bus: () => null } as never).sonar("puerta"), null);
});
