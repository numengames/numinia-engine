// avatares/suelo-relieve (Pablo, vídeo 2026-10-20: «se queda estático, no se mueven los pies» y «un pelín enterrado a veces»).
// a2: sobre el relieve, «en el aire» se medía desde el plano 0 → el avatar que ANDA sobre una loma quedaba en «saltar» (clip sin paso).
// a1: el avatar pisa la malla de colisión (2 m) y se dibujaba ahí, no sobre la malla dibujada (más gruesa) → hundido hasta ~2 m.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSim, spawnAvatar, step, setMesh, setSolids, solidsFrom, PISO_SIN_SUELO, groundHeight, getBody, setBody, INPUT_STRIDE } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { terrenoMalla } from "../packages/sim/src/terreno-malla.ts";
import { estadoPor, clipPara, sueloDeVista, sueloBajo, asentadoEn } from "../packages/render/src/avatares-politica.ts";
import { crearSueloTerreno } from "../packages/client/src/suelo-terreno.ts";

const MUNDO = { semilla: 1234, tamano: 200, plaza: 12, estanque: true };
const malla = terrenoMalla(MUNDO);
const NATURAL = { andar: 0.8, trotar: 5.2 };

/** Un avatar que anda 1,5 m/s desde (x0, z0) hacia (+x, +z) sobre el relieve; devuelve en cada tick su posición simulada. */
function caminar(x0: number, z0: number, ticks: number) {
  const s = createSim(2, 1), e = spawnAvatar(s, 0);
  setMesh(s, malla.bvh, PISO_SIN_SUELO);
  setBody(s, e, { ...getBody(s, e), x: fx(x0), z: fx(z0), y: groundHeight(fx(x0), fx(z0), s, fx(60)), vy: 0 });
  const pasos: { x: number; y: number; z: number }[] = [];
  for (let t = 0; t < ticks; t++) {
    const inp = new Int32Array(INPUT_STRIDE); inp[0] = e; inp[1] = 90; inp[2] = 90; // diagonal, andar
    step(s, inp);
    const b = getBody(s, e); pasos.push({ x: b.x / 65536, y: b.y / 65536, z: b.z / 65536 });
  }
  return { s, pasos };
}

test("a2: andando sobre el relieve el avatar anda (no «saltar») y su clip tiene paso", () => {
  const { s, pasos } = caminar(-60, -20, 400);
  const ts = crearSueloTerreno(s, malla.bvh);
  const suelo = sueloDeVista(() => [], () => ts);
  let saltar = 0, fuera = 0;
  for (const p of pasos) {
    const sobre = p.y - suelo(p.x, p.z, p.y);
    if (sobre < -0.05) fuera++;
    const est = estadoPor(1.5, sobre);
    if (est === "saltar") saltar++;
  }
  assert.equal(saltar, 0, `ticks en «saltar» andando: ${saltar}/${pasos.length}`);
  assert.equal(fuera, 0);
  const q = clipPara("andar", 1.5, 0.9, NATURAL, () => true);
  assert.equal(q?.clip, "andar");
  assert.ok(q!.ritmo > 0 && q!.ritmo !== 1, `el clip anda a un ritmo ligado a la marcha: ${q?.ritmo}`);
  // el recorrido sube y baja de verdad (la prueba no es en un llano)
  const ys = pasos.map((p) => p.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 1, "el recorrido tiene relieve");
});

test("a2: sin relieve el suelo es el de siempre (sueloBajo), sin llamar al terreno", () => {
  const cajas = [0, 0, 0, 2, 1, 2];
  const suelo = sueloDeVista(() => cajas, () => null);
  for (const [x, z, y] of [[1, 1, 0.9], [1, 1, 0], [5, 5, 0], [-3, 2, 0.2]]) assert.equal(suelo(x, z, y), sueloBajo(x, z, y, cajas));
});

test("a2: sobre una caja en un mundo con relieve el suelo es la caja y el asentado no la toca", () => {
  const s = createSim(2, 1); setMesh(s, malla.bvh, PISO_SIN_SUELO);
  const g = groundHeight(fx(30), fx(30), s, fx(60)) / 65536;
  setSolids(s, solidsFrom([["c", { solido: true, bx0: 29, by0: g - 1, bz0: 29, bx1: 31, by1: g + 0.3, bz1: 31 }]]));
  const ts = crearSueloTerreno(s, malla.bvh);
  assert.ok(Math.abs(ts.suelo(30, 30, g + 0.3) - (g + 0.3)) < 0.001, "con los pies sobre la caja, el suelo es su tapa");
  assert.equal(asentadoEn(ts, () => 123, 30, 30, g + 0.3), 0, "sobre una caja no se corrige hacia la malla dibujada");
});

test("a1: dibujado sobre la malla dibujada, el pie no queda hundido (y la posición lógica no cambia)", async () => {
  const { crearTerreno } = await import("../packages/render/src/naturaleza/terreno.ts");
  const t = crearTerreno({ semilla: MUNDO.semilla, nivel: "A" });
  const s = createSim(1, 0); setMesh(s, malla.bvh, PISO_SIN_SUELO);
  const ts = crearSueloTerreno(s, malla.bvh);
  let hundido = 0, hundidoSin = 0, n = 0, peor = 0, seed = 7;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let q = 0; q < 4000; q++) {
    const x = (r() - 0.5) * 190, z = (r() - 0.5) * 190;
    if (Math.hypot(x, z) < 14) continue;
    const col = ts.malla(x, z, 60);
    if (col < -100) continue; // too steep to stand on: nobody is there
    const dib = t.alturaDibujadaEn(x, z);
    const dibujadoAvatar = col + asentadoEn(ts, t.alturaDibujadaEn, x, z, col); // donde se dibuja el avatar
    n++; if (col - dib < -0.05) hundidoSin++; // sin asentar: donde pisa, no donde se dibuja
    peor = Math.max(peor, Math.abs(dibujadoAvatar - dib));
    if (dibujadoAvatar - dib < -0.05) hundido++;
  }
  assert.ok(peor < 0.001, `el avatar se dibuja sobre la superficie dibujada (peor desvío ${peor.toFixed(4)} m)`);
  assert.equal(hundido, 0);
  assert.ok(hundidoSin / n > 0.1, `la prueba mide el fallo: sin asentar queda hundido en el ${(100 * hundidoSin / n).toFixed(0)} % del suelo`);
  assert.ok(n > 3000);
});
