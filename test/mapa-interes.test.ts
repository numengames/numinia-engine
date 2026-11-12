// Map v2: the world's declared points of interest, the layers and the filter (packages/client/src/mapa-interes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerMapa, esDecorativo, marcadorDePunto, capaDe, capasActivas, filtrar, leerCapas, textoCapas, encuadre, CAPAS, PUNTO_TIPOS, PUNTOS_MAX, tipoDePunto } from "../packages/client/src/mapa-interes.ts";
import { TIPOS_BASE } from "../packages/client/src/mapa.ts";
import type { Marcador } from "../packages/client/src/mapa.ts";

const m = (id: string, tipo: string, extra: Partial<Marcador> = {}): Marcador => ({ id, tipo, nombre: id, x: 0, z: 0, ...extra });

test("leerMapa: a good world file gives its points, ids and decoration", () => {
  const r = leerMapa({ puntos: [{ nombre: "Main Square", tipo: "zona", x: -6, z: -45 }, { id: "book", nombre: "Book", tipo: "info", x: 6.7, z: -59.8, detalle: "Active Inference" }], ocultar: { pnj: ["publico-*", "paseante-sol"] } });
  assert.deepEqual(r.problemas, []);
  assert.equal(r.mapa?.puntos.length, 2);
  assert.deepEqual(r.mapa?.puntos[0], { id: "poi:zona-0", nombre: "Main Square", tipo: "zona", x: -6, z: -45 });
  assert.equal(r.mapa?.puntos[1].id, "poi:book");
  assert.equal(r.mapa?.puntos[1].detalle, "Active Inference");
  assert.deepEqual(r.mapa?.ocultar.pnj, ["publico-*", "paseante-sol"]);
});

test("leerMapa: nothing, or nothing usable, is null; a wrong shape says how to fix it and never throws", () => {
  assert.deepEqual(leerMapa(undefined), { mapa: null, problemas: [] });
  assert.equal(leerMapa(null).mapa, null); assert.match(leerMapa(null).problemas[0], /^mapa: an object/);
  assert.match(leerMapa([]).problemas[0], /^mapa: an object/);
  assert.equal(leerMapa({}).mapa, null);
  assert.match(leerMapa({ puntos: "x" }).problemas[0], /mapa\.puntos: a list/);
});

test("leerMapa: a bad point is left out and named by its path; the good ones stay", () => {
  const r = leerMapa({ puntos: [
    { nombre: "Ok", tipo: "zona", x: 1, z: 2 },
    { nombre: "", tipo: "zona", x: 1, z: 2 },
    { nombre: "<b>x</b>", tipo: "zona", x: 1, z: 2 },
    { nombre: "Bad kind", tipo: "castillo", x: 1, z: 2 },
    { nombre: "Far", tipo: "zona", x: 1e9, z: 0 },
    { nombre: "NaN", tipo: "zona", x: "1", z: 0 },
    { nombre: "Dup", tipo: "zona", id: "a", x: 0, z: 0 }, { nombre: "Dup2", tipo: "zona", id: "a", x: 0, z: 0 },
    42,
  ] });
  assert.deepEqual(r.mapa?.puntos.map((p) => p.nombre), ["Ok", "Dup"]);
  assert.equal(r.problemas.length, 7);
  assert.ok(r.problemas.some((p) => p.startsWith("mapa.puntos[3].tipo: one of zona, portal")));
  assert.ok(r.problemas.some((p) => p.startsWith("mapa.puntos[8]: an object")));
});

test("leerMapa: at most PUNTOS_MAX points, and decoration patterns are plain ids", () => {
  const muchos = Array.from({ length: PUNTOS_MAX + 5 }, (_, i) => ({ nombre: `P${i}`, tipo: "zona", x: i, z: 0 }));
  const r = leerMapa({ puntos: muchos, ocultar: { pnj: ["ok-*", "../x", 3, "a b"] } });
  assert.equal(r.mapa?.puntos.length, PUNTOS_MAX);
  assert.deepEqual(r.mapa?.ocultar.pnj, ["ok-*"]);
  assert.equal(r.problemas.length, 4);
});

test("esDecorativo: exact keys and prefixes", () => {
  assert.equal(esDecorativo(["publico-*", "bea"], "publico-ada"), true);
  assert.equal(esDecorativo(["publico-*", "bea"], "bea"), true);
  assert.equal(esDecorativo(["publico-*", "bea"], "beatriz"), false);
  assert.equal(esDecorativo(["publico-*"], "brainiac"), false);
  assert.equal(esDecorativo(undefined, "brainiac"), false);
});

test("every kind of point has its own icon: shape and colour differ, and the marker kind exists", () => {
  const vistos = new Set<string>();
  for (const k of PUNTO_TIPOS) {
    const t = TIPOS_BASE[tipoDePunto(k)];
    assert.ok(t, `poi-${k} kind`); assert.equal(t.enLista, true); assert.equal(t.alBorde, false);
    vistos.add(`${t.forma}|${t.color}`);
  }
  assert.equal(vistos.size, PUNTO_TIPOS.length);
  assert.deepEqual(marcadorDePunto({ id: "poi:a", nombre: "A", tipo: "portal", x: 1, z: 2 }), { id: "poi:a", tipo: "poi-portal", nombre: "A", x: 1, z: 2 });
});

test("layers: the quiet default hides seats, objects and decorative characters; the rest shows", () => {
  const ms = [m("tu", "tu"), m("zona", "poi-zona"), m("star", "objetivo"), m("bang", "para-ti"), m("gente", "persona"), m("ia", "agente"), m("brainiac", "npc"),
    m("puerta", "portal"), m("obj", "objeto"), m("cartel", "objeto"), m("silla", "objeto", { capa: "asientos" }), m("ada", "npc", { capa: "decorativos" }), m("raro", "tesoro")];
  const v = filtrar(ms, capasActivas(null)).map((x) => x.id);
  assert.deepEqual(v, ["tu", "zona", "star", "bang", "gente", "ia", "brainiac", "puerta", "raro"]);
  assert.equal(capaDe(m("x", "tesoro")), "otros"); // a kind an adventure added is never hidden by surprise
  assert.equal(capaDe(m("x", "objeto", { capa: "asientos" })), "asientos");
  // «you» is never filtered, even with every layer off
  const todoApagado = Object.fromEntries(CAPAS.map((c) => [c.id, false]));
  assert.deepEqual(filtrar(ms, todoApagado).map((x) => x.id), ["tu"]);
  // switching one on brings only its markers
  assert.deepEqual(filtrar(ms, capasActivas({ asientos: true })).map((x) => x.id).filter((i) => i === "silla"), ["silla"]);
});

test("layers are remembered: only the differences from the defaults are written, junk reads as defaults", () => {
  assert.equal(textoCapas(capasActivas(null)), "{}");
  const c = capasActivas({ objetos: true, gente: false });
  assert.equal(textoCapas(c), JSON.stringify({ gente: false, objetos: true }));
  assert.deepEqual(leerCapas(textoCapas(c)), c);
  assert.deepEqual(leerCapas("not json"), capasActivas(null));
  assert.deepEqual(leerCapas(null), capasActivas(null));
  assert.deepEqual(leerCapas("[1,2]"), capasActivas(null));
  assert.deepEqual(leerCapas('{"gente":"no","zzz":true}'), capasActivas(null));
});

test("every layer has its words in English and Spanish", async () => {
  const { en, es } = await import("../packages/client/src/idioma.ts");
  for (const c of CAPAS) { assert.ok(en[`mapa.capa.${c.id}`], `en ${c.id}`); assert.ok(es[`mapa.capa.${c.id}`], `es ${c.id}`); }
});

test("encuadre: the big map opens holding every place, with limits on the zoom", () => {
  const e = encuadre([{ x: -72, z: -104 }, { x: 30, z: 44 }], 640, 600, 56)!;
  assert.equal(e.cx, -21); assert.equal(e.cz, -30);
  assert.ok(e.escala >= 0.8 && e.escala <= 6);
  assert.ok(148 * e.escala <= 600 - 2 * 56 + 1e-6 && 102 * e.escala <= 640 - 2 * 56 + 1e-6);
  assert.equal(encuadre([], 640, 600), null);
  assert.equal(encuadre([{ x: 0, z: 0 }], 50, 50, 40), null);
  assert.equal(encuadre([{ x: 0, z: 0 }], 640, 600)!.escala, 6); // one point: not a giant zoom
});

// ---------- Map v2.2: the filter is one list grouped by kind; the map is painted ----------
import { agrupar, leerMapa as leerMapaV22 } from "../packages/client/src/mapa-interes.ts";
import { preparar, pintarVentana, PALETAS, ventanaDeVista } from "../packages/client/src/mapa-pintado.ts";

test("agrupar: one list, the groups in the house order, counts, sorted by name, 'you' never listed, empty groups left out", () => {
  const mk = (id: string, tipo: string, nombre: string, capa?: string) => ({ id, tipo, nombre, x: 0, z: 0, capa } as never);
  const g = agrupar([mk("a", "poi-zona", "Zeta"), mk("b", "poi-zona", "Alfa"), mk("c", "persona", "Ana"), mk("tu", "tu", "You"), mk("d", "npc", "Guide"), mk("e", "poi-portal", "Door"), mk("s", "otro", "Chair", "asientos")], capasActivas(null));
  assert.deepEqual(g.map((x) => x.id), ["zonas", "portales", "gente", "personajes", "asientos"]);
  assert.deepEqual(g[0].items.map((m) => m.nombre), ["Alfa", "Zeta"]);
  assert.equal(g[0].total, 2);
  assert.equal(g.find((x) => x.id === "asientos")!.activa, false); // seats are off by default
  assert.equal(agrupar([mk("a", "poi-zona", "A")], capasActivas({ zonas: false }))[0].activa, false);
});

test("the groups come in the order of the brief and the persisted choice survives a reload", () => {
  assert.deepEqual(CAPAS.slice(0, 9).map((c) => c.id), ["misiones", "zonas", "portales", "pantallas", "info", "agenda", "gente", "personajes", "agentes"]);
  assert.deepEqual(CAPAS.filter((c) => !c.defecto).map((c) => c.id).sort(), ["asientos", "decorativos", "objetos"]);
  const c = capasActivas({ portales: false, objetos: true });
  assert.deepEqual(leerCapas(textoCapas(c)), c);
});

test("mapa.estilo: painted by default, «foto» keeps the render, junk says how to fix it", () => {
  assert.equal(leerMapaV22({ puntos: [], estilo: "foto" }).mapa?.estilo, "foto");
  assert.equal(leerMapaV22({ puntos: [], estilo: "pintado-noche" }).mapa?.estilo, "pintado-noche");
  const r = leerMapaV22({ puntos: [], estilo: "acuarela" });
  assert.ok(r.problemas.some((p) => /mapa\.estilo: one of/.test(p)));
});

test("painted map: a noisy render becomes a few flat tones; zooming in smooths the edges (no blocks) and is deterministic", () => {
  const px = 64, rgba = new Uint8ClampedArray(px * px * 4);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { // left half noisy light land, right half noisy dark land, a band of water
    const i = (y * px + x) * 4, n = ((x * 7 + y * 13) % 11) * 2, water = y > 52;
    rgba[i] = water ? 40 : x < 32 ? 200 + n : 90 + n; rgba[i + 1] = water ? 120 : x < 32 ? 190 + n : 80 + n; rgba[i + 2] = water ? 200 : x < 32 ? 170 + n : 60 + n; rgba[i + 3] = 255;
  }
  const pal = PALETAS.pintado, p = preparar(rgba, px, null);
  const a = pintarVentana(p, { u0: 0, v0: 0, u1: px, v1: px }, 128, 128, pal, 1);
  const cols = new Map<string, number>();
  for (let i = 0; i < a.length; i += 4) { const k = `${a[i]},${a[i + 1]},${a[i + 2]}`; cols.set(k, (cols.get(k) ?? 0) + 1); }
  const planos = [...cols.values()].filter((n) => n > a.length / 4 / 100).length; // tones that cover > 1 % of the picture
  assert.ok(planos >= 2 && planos <= 12, `a few flat tones (${planos})`); // the ink line only adds its soft steps
  // zoomed 16×: the border between the two land tones is smooth, not a staircase of 16-px blocks
  const z = pintarVentana(p, { u0: 24, v0: 20, u1: 40, v1: 36 }, 256, 256, pal, 1), edge: number[] = [];
  for (let y = 0; y < 256; y += 8) { let best = 0, d = 0; for (let x = 1; x < 256; x++) { const dd = Math.abs(z[(y * 256 + x) * 4] - z[(y * 256 + x - 1) * 4]); if (dd > d) { d = dd; best = x; } } edge.push(best); }
  const steps = new Set(edge).size;
  assert.ok(steps >= 3, `edge position varies smoothly, not in 16-px blocks (${steps} positions)`);
  assert.deepEqual(Array.from(pintarVentana(p, { u0: 0, v0: 0, u1: px, v1: px }, 128, 128, pal, 1)), Array.from(a)); // same input, same painting
});

test("ventanaDeVista: paints the visible part (+ a quarter around) at the screen's resolution, capped on phones", () => {
  const w = ventanaDeVista({ x0: -100, z0: -100, x1: 100, z1: 100, px: 1000 }, { x0: -10, z0: -10, x1: 10, z1: 10 }, 20, 2, 900);
  assert.equal(w.w, 900); assert.ok(w.ventana.u0 < 450 && w.ventana.u1 > 550);
  const s = ventanaDeVista({ x0: -100, z0: -100, x1: 100, z1: 100, px: 1000 }, { x0: -10, z0: -10, x1: 10, z1: 10 }, 2, 1, 900);
  assert.equal(s.w, 60);
});

test("the big map's farthest zoom-out is the one where the whole space fits the screen (escalaMinima)", () => {
  const fuente = readFileSync(new URL("../apps/plaza/mapa.ts", import.meta.url), "utf8");
  assert.match(fuente, /function escalaMinima\(\): number/);
  assert.match(fuente, /Math\.max\(escalaMinima\(\), gv\.escala \* factor\)/, "zoomEn never goes below the fit scale");
});
