import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proyectar, desproyectar, anguloFlecha, yawDePaso, alBorde, rumbo, distancia, enPalabras, lado, duracion,
  crearLimitador, crearRegistro, reunir, contar, cercanos, firma, RUMBOS,
} from "../packages/client/src/mapa.ts";
import type { Vista, Marcador } from "../packages/client/src/mapa.ts";

const cerca = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const vista = (giro = 0): Vista => ({ cx: 10, cz: 20, escala: 2, giro, ancho: 160, alto: 160 });

test("north-up projection: east is right, north (-z) is up, the centre is the middle", () => {
  const v = vista();
  assert.deepEqual(proyectar(v, 10, 20), { px: 80, py: 80 });
  assert.deepEqual(proyectar(v, 15, 20), { px: 90, py: 80 });  // 5 m east → 10 px right
  assert.deepEqual(proyectar(v, 10, 10), { px: 80, py: 60 });  // 10 m north → 20 px up
});

test("rotated projection: what the camera looks at points up (yaw + = turned left, like three)", () => {
  const v = vista(Math.PI / 2);  // the camera looks west (-x)
  const oeste = proyectar(v, 0, 20);  // 10 m west of the centre
  cerca(oeste.px, 80); cerca(oeste.py, 60);  // up
  const norte = proyectar(v, 10, 10);  // 10 m north: now on the right
  cerca(norte.px, 100); cerca(norte.py, 80);
});

test("unprojection inverts projection for any turn (clicks land where they were drawn)", () => {
  for (const g of [0, 0.3, Math.PI / 2, -2.1, Math.PI]) {
    const v = vista(g);
    for (const [x, z] of [[0, 0], [13.5, -7], [-40, 22]]) {
      const p = proyectar(v, x, z), w = desproyectar(v, p.px, p.py);
      cerca(w.x, x, 1e-9); cerca(w.z, z, 1e-9);
    }
  }
});

test("the arrow: north-up shows the heading, the turning map always points up", () => {
  cerca(anguloFlecha(0, 0), 0);
  cerca(anguloFlecha(0, Math.PI / 2), -Math.PI / 2);  // facing west → arrow to the left
  cerca(anguloFlecha(1.2, 1.2), 0);
  cerca(yawDePaso(0, -1), 0);                         // a step north = yaw 0
  cerca(yawDePaso(-1, 0), Math.PI / 2);               // a step west = turned left
  cerca(yawDePaso(1, 0), -Math.PI / 2);
});

test("objectives out of the minimap are pinned to its edge", () => {
  assert.deepEqual(alBorde(90, 80, 80, 80, 50), { px: 90, py: 80, fuera: false });
  const b = alBorde(80, -100, 80, 80, 50);
  assert.equal(b.fuera, true); cerca(b.px, 80); cerca(b.py, 30);
});

test("direction words: eight compass points from here to there", () => {
  const casos: [number, number, string][] = [[0, -5, "norte"], [5, -5, "noreste"], [5, 0, "este"], [5, 5, "sureste"], [0, 5, "sur"], [-5, 5, "suroeste"], [-5, 0, "oeste"], [-5, -5, "noroeste"], [1, -10, "norte"], [10, -4, "este"]];
  for (const [dx, dz, w] of casos) assert.equal(rumbo(dx, dz), w, `${dx},${dz}`);
  assert.equal(RUMBOS.length, 8);
});

test("distance words: metres, kilometres with a comma, and «aquí mismo»", () => {
  assert.equal(distancia(0.4), "a menos de 1 m");
  assert.equal(distancia(23.4), "a 23 m");
  assert.equal(distancia(999.4), "a 999 m");
  assert.equal(distancia(999.6), "a 1,0 km");
  assert.equal(distancia(1234), "a 1,2 km");
  assert.equal(enPalabras(16, -16), "al noreste, a 23 m");
  assert.equal(enPalabras(0.5, 0.5), "aquí mismo");
});

test("sides relative to where you face", () => {
  assert.equal(lado(0, -5, 0), "delante");
  assert.equal(lado(5, 0, 0), "a tu derecha");
  assert.equal(lado(0, 5, 0), "detrás");
  assert.equal(lado(-5, 0, Math.PI / 2), "delante");      // facing west, west is ahead
  assert.equal(lado(0, -5, Math.PI / 2), "a tu derecha");  // facing west, north is on the right
});

test("time connected, for the player sheet", () => {
  assert.equal(duracion(10_000), "menos de 1 min");
  assert.equal(duracion(12 * 60_000 + 5_000), "12 min");
  assert.equal(duracion(65 * 60_000), "1 h 05 min");
});

test("redraw limiter: nothing new = no draw; changes at most 5 per second; forzar redraws", () => {
  const l = crearLimitador(200);
  assert.equal(l.debe(0, "a"), true);
  assert.equal(l.debe(50, "a"), false);   // same picture
  assert.equal(l.debe(100, "b"), false);  // changed, too soon
  assert.equal(l.debe(210, "b"), true);
  let n = 0;
  for (let t = 300; t < 1300; t += 16) if (l.debe(t, String(t))) n++;  // changes every display frame for 1 s
  assert.ok(n >= 4 && n <= 5, `drew ${n} times in a second`);
  const quieto = crearLimitador(200);
  let m = 0;
  for (let t = 0; t < 5000; t += 16) if (quieto.debe(t, "igual")) m++;
  assert.equal(m, 1, "a still world draws once");
  quieto.forzar();
  assert.equal(quieto.debe(6000, "igual"), true);
  assert.ok(l.stats.saltados > 0 && l.stats.dibujos === n + 2);
});

test("registry: built-in kinds, unknown roles get the default dot, an adventure adds its own kinds", () => {
  const r = crearRegistro();
  assert.equal(r.tipoDeRol("objeto"), "objeto");
  assert.equal(r.tipoDeRol("persona"), "npc");
  assert.equal(r.tipoDeRol("salida"), "portal");
  assert.equal(r.tipoDeRol("nave-espacial"), "otro");
  assert.equal(r.tipo("no-existe").forma, "punto");
  r.registrar("tesoro", { nombre: "Tesoro", color: "#ffd700", forma: "estrella", alBorde: true });
  r.rol("cofre", "tesoro");
  assert.equal(r.tipoDeRol("cofre"), "tesoro");
  assert.equal(r.tipo("tesoro").forma, "estrella");
  assert.equal(r.tipo("tesoro").enLista, true);  // unset fields copy «otro»
  assert.ok(r.tipos().some(([id]) => id === "tesoro"));
  assert.equal(r.tipos()[0][0], "tu");  // drawn last = highest order first in the legend
});

test("sources: a broken one is skipped and named; counts by kind; the twin lists nearest first", () => {
  const fuentes = new Map([
    ["gente", () => [{ id: "p1", tipo: "persona", nombre: "Ana", x: 3, z: 0 }, { id: "p2", tipo: "persona", nombre: "Bea", x: 0, z: -40 }]],
    ["rota", () => { throw new Error("boom"); }],
    ["cosas", () => [{ id: "o1", tipo: "objeto", nombre: "Bloque", x: 16, z: -16 }, { id: "nan", tipo: "objeto", nombre: "Mal", x: NaN, z: 0 }]],
    ["yo", () => [{ id: "tu", tipo: "tu", nombre: "Tú", x: 0, z: 0, yaw: 0 }]],
    ["nada", () => null],
  ]);
  const { marcadores, fallos } = reunir(fuentes as Map<string, () => Marcador[] | null>);
  assert.deepEqual(fallos, ["rota"]);
  assert.deepEqual(contar(marcadores), { persona: 2, objeto: 1, tu: 1 });
  const lista = cercanos(marcadores, { x: 0, z: 0 }, crearRegistro());
  assert.deepEqual(lista.map((e) => e.nombre), ["Ana", "Bloque", "Bea"]);  // you are not listed
  assert.equal(lista[1].texto, "al noreste, a 23 m");
  assert.equal(cercanos(marcadores, { x: 0, z: 0 }, crearRegistro(), 1).length, 1);
});

test("signature: same picture same text; a 1 px move, a moving centre or a turn changes it; far markers only count when pinned", () => {
  const v = vista();
  const ms: Marcador[] = [{ id: "a", tipo: "persona", nombre: "A", x: 12, z: 20 }];
  const f0 = firma(v, ms);
  assert.equal(firma(v, [{ ...ms[0], x: 12.1 }]), f0);       // 0.2 px: same pixel
  assert.notEqual(firma(v, [{ ...ms[0], x: 12.6 }]), f0);    // 1.2 px
  assert.notEqual(firma({ ...v, giro: 0.1 }, ms), f0);
  assert.equal(firma({ ...v, cz: 20.1 }, []), firma(v, []));   // you moved 0.2 px: the ground did not move
  assert.notEqual(firma({ ...v, cz: 21 }, []), firma(v, []));  // you walked 2 px over empty ground: the grid moves
  const lejos: Marcador[] = [{ id: "b", tipo: "persona", nombre: "B", x: 500, z: 20 }];
  assert.equal(firma(v, lejos), firma(v, [{ ...lejos[0], x: 600 }]));  // out of the picture, not pinned: invisible
  const obj: Marcador[] = [{ id: "c", tipo: "objetivo", nombre: "C", x: 500, z: 20 }];
  const pin = (t: string) => t === "objetivo";
  assert.notEqual(firma(v, obj, pin), firma(v, [{ ...obj[0], z: 400 }], pin));  // pinned to the edge: direction counts
});
