// H4: the environment as data (features/entorno) — the entorno@1 file format with error paths, the presets, the
// server/page flow over the in-memory transport (permission, presets, fine values, restore), persistence (S4), a
// world's own default, the time of day and the day cycle. Parity with Hyperfy2's Sky + Wind: docs/HYPERFY2-PARIDAD.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ClientPart, Msg } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { entorno, PRESETS, ZONA } from "../features/entorno/feature.ts";
import { validarEntorno, aFichero, porDefecto, solDeHora, ESQUEMA } from "../features/entorno/esquema.ts";
import { crearEntorno, baseDelMundo, CICLO_TICKS } from "../features/entorno/server.ts";
import { crearCliente } from "../features/entorno/client.ts";
import casa from "../features/entorno/por-defecto.json" with { type: "json" };
import presets from "../features/entorno/presets.json" with { type: "json" };
import catalogo from "../features/entorno/suelos.json" with { type: "json" };
import funciones from "../features/servidor.ts";
import { conMundo } from "../features/mundo.ts";
import { leerMundo } from "../packages/server/src/mundo.ts";

const ROOT = new URL("../", import.meta.url).pathname;

function world(opts: { abierto: boolean; storage?: FileStorage; mundo?: unknown; n?: number }) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearEntorno(opts.mundo)], log: (l) => log.push(l), storage: opts.storage, puede: (_w, accion) => opts.abierto && accion === "construir" });
  const pages: { s: ClientSession; t: ReturnType<Instance["join"]>; c: ReturnType<typeof crearCliente>["ambiente"]; vistos: Msg[] }[] = [];
  const add = () => {
    const t = inst.join(pages.length), cli = crearCliente(), vistos: Msg[] = [];
    const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, entorno: (v) => vistos.push(v) } });
    pages.push({ s, t, c: cli.ambiente, vistos });
    return pages[pages.length - 1];
  };
  for (let i = 0; i < (opts.n ?? 2); i++) add();
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  return { inst, pages, pump, add, log };
}

test("entorno@1: the house default and every preset are valid; the declaration loads", () => {
  assert.equal(entorno.issues.length, 0, JSON.stringify(entorno.issues));
  const c = validarEntorno(casa);
  assert.ok(c.ok, JSON.stringify(!c.ok && c.issues));
  for (const n of PRESETS) {
    const p = (presets.presets as Record<string, unknown>)[n];
    assert.ok(p, `presets.json no tiene «${n}»`);
    const r = validarEntorno(p, c.ok ? c.value : porDefecto());
    assert.ok(r.ok, `${n}: ${JSON.stringify(!r.ok && r.issues)}`);
    assert.equal((p as { suelo?: unknown }).suelo, undefined, `${n}: un preset no cambia el suelo`);
  }
});

test("entorno@1: mistakes come back with the path in the file and how to fix them (never throws)", () => {
  const r = validarEntorno({ schema: "otro", sol: { altura: 120, color: "rojo" }, niebla: { lejos: "mucho" }, suelo: { tipo: "lava" } });
  assert.equal(r.ok, false);
  const rutas = !r.ok ? r.issues.map((i) => i.path) : [];
  for (const p of ["entorno.schema", "entorno.sol.altura", "entorno.sol.color", "entorno.niebla.lejos", "entorno.suelo.tipo"]) assert.ok(rutas.includes(p), `falta ${p} en ${rutas.join(", ")}`);
  assert.match(!r.ok ? r.issues.find((i) => i.path === "entorno.sol.color")!.message : "", /#rrggbb/);
  assert.equal(validarEntorno(null).ok, false);
  assert.equal(validarEntorno([1, 2]).ok, false);
  // a partial file over a base keeps the rest; colours go both ways; unknown keys are ignored
  const base = porDefecto();
  const p = validarEntorno({ schema: ESQUEMA, niebla: { color: "#102030" }, futuro: { algo: 1 } }, base);
  assert.ok(p.ok);
  assert.equal(p.ok && p.value.nieblaColor, 0x102030);
  assert.equal(p.ok && p.value.solAltura, base.solAltura);
  const ida = aFichero(p.ok ? p.value : base), vuelta = validarEntorno(ida);
  assert.deepEqual(vuelta.ok && vuelta.value, p.ok && p.value, "file → flat → file is lossless");
});

test("the ground catalogue: every texture's sha256 is its file's and every one is CC0", () => {
  for (const [id, s] of Object.entries(catalogo.suelos)) {
    s.ficheros.forEach((f, i) => {
      const sha = createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex");
      assert.equal(sha + ".webp", i === 0 ? s.color : s.normal, `${id}: ${f} ha cambiado (actualiza suelos.json)`);
    });
    if (s.ficheros.length) assert.equal(s.licencia, "CC0-1.0", id);
  }
  const h = catalogo.cielos.nublado;
  assert.equal(createHash("sha256").update(readFileSync(join(ROOT, h.fichero))).digest("hex") + ".hdr", h.hdr);
  assert.equal(((presets.presets as Record<string, { luz?: { hdr?: string } }>).nublado.luz?.hdr), h.hdr, "the cloudy preset uses the shipped HDRI");
});

test("closed world: the page gets the environment, may not change it and hears why", () => {
  const { pages, pump } = world({ abierto: false });
  const [a, b] = pages;
  assert.equal(a.c.estado.puede, false);
  assert.equal(b.vistos.at(-1)?.preset, "día", "the page draws the world's default on entering");
  assert.equal(b.vistos.at(-1)?.sueloMapa, catalogo.suelos.hierba.color, "the ground's file is resolved for the view");
  a.c.preset("noche"); pump();
  assert.equal(b.s.features.stateOf("entorno").get(ZONA)?.preset, "día");
  assert.match(a.c.estado.ultimoRechazo, /construir/);
});

test("a builder switches presets and fine values live; every page applies it; restore goes back to the world's", () => {
  const { pages, pump, add } = world({ abierto: true });
  const [a, b] = pages;
  assert.ok(a.c.estado.puede);
  const suelo0 = b.s.features.stateOf("entorno").get(ZONA)?.suelo;
  assert.ok(a.c.preset("noche").ok); pump();
  const v = b.vistos.at(-1)!;
  assert.equal(v.preset, "noche");
  assert.ok(Number(v.solAltura) < 0, "night: the sun is below the horizon");
  assert.equal(v.suelo, suelo0, "a preset keeps the ground");
  assert.match(b.s.features.announcements.at(-1)?.text ?? "", /noche/, "V1: screen readers hear it");
  assert.ok(a.c.preset("dia").ok, "«dia» without accent works too"); pump();
  assert.equal(b.vistos.at(-1)?.preset, "día");
  a.c.ajustar({ suelo: "arena", nieblaLejos: 120, vientoFuerza: 9.5 }); pump();
  const w = b.s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([w.preset, w.suelo, w.nieblaLejos, w.vientoFuerza], ["propio", "arena", 120, 9.5]);
  assert.equal(b.vistos.at(-1)?.sueloMapa, catalogo.suelos.arena.color);
  const c = add(); pump();
  assert.equal(c.vistos.at(-1)?.suelo, "arena", "who comes later gets the current environment");
  assert.equal(a.c.preset("lava").ok, false);
  a.c.restaurar(); pump();
  assert.equal(b.s.features.stateOf("entorno").get(ZONA)?.suelo, "hierba");
  assert.equal(b.s.features.stateOf("entorno").get(ZONA)?.preset, "día");
});

test("S4: the environment survives a restart; a world brings its own default (a broken file is refused and logged)", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "entorno-"));
  const s1 = new FileStorage(dir);
  const w1 = world({ abierto: true, storage: s1 });
  w1.pages[0].c.preset("tormenta"); w1.pump();
  await s1.flush();
  const w2 = world({ abierto: true, storage: new FileStorage(dir) });
  assert.equal(w2.pages[0].s.features.stateOf("entorno").get(ZONA)?.preset, "tormenta");
  // a world's file: what it says over the house default
  const mundo = { schema: ESQUEMA, preset: "noche", suelo: { tipo: "nieve" }, sol: { altura: -10 } };
  const w3 = world({ abierto: false, mundo });
  const v = w3.pages[0].s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([v.preset, v.suelo, v.solAltura, v.nieblaColor], ["noche", "nieve", -10, baseDelMundo(undefined).nieblaColor]);
  const log: string[] = [];
  assert.equal(baseDelMundo({ sol: { altura: 300 } }, (l) => log.push(l)).solAltura, baseDelMundo(undefined).solAltura);
  assert.match(log.join(" "), /sol\.altura/);
});

test("time of day: the sun follows the clock when asked, and the day cycle moves it", () => {
  assert.deepEqual(solDeHora(6), { altura: 0, rumbo: 90 });
  assert.equal(solDeHora(12).altura, 65);
  assert.ok(Math.abs(Math.abs(solDeHora(12).rumbo) - 180) < 0.01, "noon: south");
  assert.deepEqual(solDeHora(18), { altura: 0, rumbo: -90 });
  assert.ok(solDeHora(0).altura < -60);
  const { pages, pump } = world({ abierto: true });
  const [a, b] = pages;
  a.c.ajustar({ solHora: true, hora: 9, ciclo: 2 }); pump();
  const s0 = b.s.features.stateOf("entorno").get(ZONA)!;
  assert.ok(Math.abs(Number(s0.solAltura) - solDeHora(9).altura) < 0.051);
  pump(CICLO_TICKS * 2 + 2); // 10 s of a 2-minute day = 2 h
  const s1 = b.s.features.stateOf("entorno").get(ZONA)!;
  assert.ok(Math.abs(Number(s1.hora) - 11) < 0.11, `hora ${s1.hora}`);
  assert.ok(Math.abs(Number(s1.solAltura) - solDeHora(Number(s1.hora)).altura) < 0.051);
});

test("MUNDO_DIR: the server reads a world's entorno.json / elementos.json and swaps only those two parts", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-"));
  writeFileSync(join(dir, "entorno.json"), JSON.stringify({ schema: ESQUEMA, preset: "atardecer", suelo: { tipo: "arena" } }));
  writeFileSync(join(dir, "elementos.json"), "{ roto");
  const log: string[] = [];
  const leer = leerMundo(dir, (l) => log.push(l));
  assert.equal(leer("no-esta.json"), undefined, "a missing file = the house default, no noise");
  assert.equal(leer("elementos.json"), undefined);
  assert.match(log.join(" "), /elementos\.json no es JSON válido/);
  assert.equal((leer("entorno.json") as { preset: string }).preset, "atardecer");
  const partes = conMundo(funciones, leer);
  assert.deepEqual(partes.map((p) => p.feature.id), funciones.map((p) => p.feature.id), "same features, same order");
  for (const p of partes) {
    const antes = funciones.find((f) => f.feature.id === p.feature.id);
    if (p.feature.id === "entorno" || p.feature.id === "elementos" || p.feature.id === "baculo" || p.feature.id === "asiento" || p.feature.id === "burbujas" || p.feature.id === "dados") assert.notEqual(p, antes); // baculo and dados are rebuilt with their switch (off here)
    else assert.equal(p, antes, `${p.feature.id} untouched`);
  }
  const w = world({ abierto: false, mundo: leer("entorno.json") });
  const v = w.pages[0].s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([v.preset, v.suelo], ["atardecer", "arena"]);
});

test("MUNDO_DIR: pesca.json with valid JSON but no `sitios` array logs why, keeps the house pond", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-pesca-"));
  writeFileSync(join(dir, "pesca.json"), JSON.stringify({ spots: ["mal escrito"] }));
  const log: string[] = [];
  const leer = leerMundo(dir, (l) => log.push(l));
  assert.equal(log.length, 0, "valid JSON: no syntax complaint from leerMundo itself");
  const partes = conMundo(funciones, leer, (l) => log.push(l));
  assert.match(log.join(" "), /pesca\.json no tiene una lista "sitios"/);
  const pesca = partes.find((p) => p.feature.id === "pesca")!;
  assert.equal(pesca, funciones.find((p) => p.feature.id === "pesca"), "falls back to the house default, untouched");
});

test("MUNDO_DIR: pesca.json with a valid sitios array is used quietly, and conMundo works without a log callback", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-pesca-ok-"));
  writeFileSync(join(dir, "pesca.json"), JSON.stringify({ sitios: [{ id: "lago", nombre: "Lago", x: 1, z: 2 }] }));
  const leer = leerMundo(dir);
  const partes = conMundo(funciones, leer); // no log arg: must not throw
  const pesca = partes.find((p) => p.feature.id === "pesca")!;
  assert.notEqual(pesca, funciones.find((p) => p.feature.id === "pesca"), "swapped for the world's own sitios");
});

test("U14 mapa.corte: a world may cut its maps at a height; absent = not cut; out of range is refused with its path; the file's wins at each start", async () => {
  const base = porDefecto();
  assert.equal(base.mapaCorte, 0, "absent = 0 = the maps as they always were");
  const casaV = validarEntorno(casa);
  assert.equal(casaV.ok && casaV.value.mapaCorte, 0, "the house default does not cut");
  const r = validarEntorno({ schema: ESQUEMA, mapa: { corte: 6 } }, base);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  assert.equal(r.ok && r.value.mapaCorte, 6);
  assert.deepEqual(aFichero(r.ok ? r.value : base).mapa, { corte: 6 }, "it goes back to the file where it came from");
  for (const malo of [-1, 61, "seis", true]) {
    const m = validarEntorno({ schema: ESQUEMA, mapa: { corte: malo } }, base);
    assert.equal(m.ok, false, `corte ${JSON.stringify(malo)} must be refused`);
    assert.deepEqual(!m.ok && m.issues.map((i) => i.path), ["entorno.mapa.corte"]);
  }
  // the page gets it with the rest of the environment
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "entorno-corte-"));
  const s1 = new FileStorage(dir);
  const w1 = world({ abierto: true, storage: s1, mundo: { schema: ESQUEMA, mapa: { corte: 6 } } });
  assert.equal(w1.pages[0].s.features.stateOf("entorno").get(ZONA)?.mapaCorte, 6);
  w1.pages[0].c.preset("tormenta"); w1.pump(); // a preset or a fine value keeps the cut
  assert.equal(w1.pages[1].s.features.stateOf("entorno").get(ZONA)?.mapaCorte, 6);
  await s1.flush();
  // restarted with the file edited: the saved environment stays (tormenta) but where the map is cut is the file's
  const w2 = world({ abierto: true, storage: new FileStorage(dir), mundo: { schema: ESQUEMA, mapa: { corte: 4.5 } } });
  const v2 = w2.pages[0].s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([v2.preset, v2.mapaCorte], ["tormenta", 4.5]);
  const w3 = world({ abierto: true, storage: new FileStorage(dir), mundo: { schema: ESQUEMA } });
  assert.equal(w3.pages[0].s.features.stateOf("entorno").get(ZONA)?.mapaCorte, 0, "taken out of the file: not cut");
});
