// mundo-hermes · lane M3 story 4: the flat shapes of the Hermes `perfil` (an agent: a standing figure with a status lamp) and `uso` (spend: a vertical
// meter of stacked flat segments) — drawn by code in black and white only, one mesh each, a safe default for unknown states and shapes — and their Spanish cards.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { crearFormas, segmentosLlenos, SEGMENTOS_USO } from "../packages/render/src/formas-planas.ts";
import type { FormaPlana } from "../packages/render/src/formas-planas.ts";
import { crearCliente, detalleDe, leerUso, nivelDeUso, numeroConEscala, estadoDeForma, textoEstadoDe } from "../features/espejo/client.ts";
import type { EstadoCosa } from "../features/espejo/client.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { conEspejo } from "../features/espejo/server.ts";
import type { EnlaceEspejo } from "../features/espejo/server.ts";
import { ESQUEMA, leerEspejo, vistaPublica } from "../features/espejo/esquema.ts";

/** Draw one shape alone and read what was made: [meshes in the world, triangles, white triangles, any colour other than 0 or 1, a firma of the geometry]. */
function dibujar(f: Partial<Omit<FormaPlana, "forma">> & { forma: string }) {
  const world = new THREE.Group(), formas = crearFormas({ world });
  formas.poner("espejo:prueba/1", { x: 0, z: 0, estado: "off", ...f } as FormaPlana);
  const mallas = world.children as THREE.Mesh[];
  const g = mallas[0]?.geometry, col = g?.getAttribute("color"), idx = g?.getIndex();
  let blancos = 0, otros = 0;
  if (col && idx) {
    for (let i = 0; i < col.count; i++) { const c = col.getX(i); if (c !== 0 && c !== 1) otros++; }
    const P = g!.getAttribute("position");
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => idx.getX(t + k));
      if (col.getX(a) !== 1) continue;
      const ux = P.getX(b) - P.getX(a), uy = P.getY(b) - P.getY(a), uz = P.getZ(b) - P.getZ(a), vx = P.getX(c) - P.getX(a), vy = P.getY(c) - P.getY(a), vz = P.getZ(c) - P.getZ(a);
      blancos += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; // the white AREA (m²)
    }
  }
  const r = { mallas: mallas.length, triangulos: idx ? idx.count / 3 : 0, blancos, otros, firma: g ? `${g.getAttribute("position").array.join(",")}|${col!.array.join("")}` : "", nombre: mallas[0]?.name ?? "", pulsable: mallas[0]?.userData.pulsable };
  formas.dispose();
  return r;
}

test("perfil: a standing figure + lamp — pure black and white, one mesh; working ≠ idle ≠ off (dashed) ≠ fail, and each differs from the others", () => {
  const a = dibujar({ forma: "perfil", estado: "on" }), b = dibujar({ forma: "perfil", estado: "off" }), c = dibujar({ forma: "perfil", estado: "off", discontinuo: true }), d = dibujar({ forma: "perfil", estado: "fail" });
  for (const x of [a, b, c, d]) { assert.equal(x.mallas, 1); assert.equal(x.otros, 0, "only black (0) and white (1)"); assert.ok(x.triangulos > 20); }
  assert.equal(a.nombre, "forma:espejo:prueba/1"); assert.equal(a.pulsable, true, "a click on it opens its card");
  assert.ok(a.blancos > b.blancos, "working has more white area than idle (white fill vs outline)");
  assert.notEqual(b.firma, c.firma, "idle (solid outline) and off (dashed) differ");
  assert.ok(c.triangulos > b.triangulos - 100, "the dashed outline is real geometry");
  assert.notEqual(d.firma, b.firma, "fail is crossed out");
  assert.notEqual(a.firma, b.firma);
});

test("perfil: unknown or odd states degrade to idle (outline), never throw; `starting` too", () => {
  const idle = dibujar({ forma: "perfil", estado: "off" });
  for (const raro of ["desconocido", "", undefined, 7, null, "ON"]) {
    const x = dibujar({ forma: "perfil", estado: raro as never });
    assert.equal(x.firma, idle.firma, `estado ${String(raro)}`);
  }
  assert.equal(dibujar({ forma: "perfil", estado: "starting" }).firma, idle.firma);
  for (const e of ["activo", "programado", "pausado", "fallo", "apagado", "desconocido", "raro"]) assert.ok(["off", "starting", "on", "fail"].includes(estadoDeForma("perfil", e as EstadoCosa)), e);
  assert.equal(estadoDeForma("perfil", "activo"), "on"); assert.equal(estadoDeForma("perfil", "apagado"), "off"); assert.equal(estadoDeForma("perfil", "raro" as EstadoCosa), "off");
});

test("uso: ten stacked flat segments, filled from the bottom to `nivel`; clamped; not a number = empty; one mesh, black and white only", () => {
  assert.equal(SEGMENTOS_USO, 10);
  assert.deepEqual([0, 0.04, 0.5, 0.96, 1].map(segmentosLlenos), [0, 0, 5, 10, 10]);
  assert.deepEqual([-3, 9, Number.NaN, Infinity, "x", null, undefined].map(segmentosLlenos), [0, 10, 0, 0, 0, 0, 0]);
  const vacio = dibujar({ forma: "uso", nivel: 0 }), medio = dibujar({ forma: "uso", nivel: 0.5 }), lleno = dibujar({ forma: "uso", nivel: 1 });
  for (const x of [vacio, medio, lleno]) { assert.equal(x.mallas, 1); assert.equal(x.otros, 0); }
  assert.ok(vacio.blancos < medio.blancos && medio.blancos < lleno.blancos, `white grows with the level: ${vacio.blancos} < ${medio.blancos} < ${lleno.blancos}`);
  assert.equal(dibujar({ forma: "uso" }).firma, vacio.firma, "no level = empty");
  assert.equal(dibujar({ forma: "uso", nivel: 7 }).firma, lleno.firma, "above 1 is full");
  assert.equal(dibujar({ forma: "uso", nivel: Number.NaN }).firma, vacio.firma);
  assert.equal(dibujar({ forma: "uso", nivel: 0.5, estado: "gibberish" as never }).firma, medio.firma, "an unknown state changes nothing: the meter does not depend on it");
  assert.notEqual(dibujar({ forma: "uso", nivel: 0.5, estado: "fail" }).firma, medio.firma, "fail crosses it out");
  assert.equal(medio.pulsable, true);
});

test("an unknown shape name draws the safe default (the cube) instead of throwing", () => {
  const cubo = dibujar({ forma: "cubo", estado: "off" });
  assert.equal(dibujar({ forma: "no-existe", estado: "off" }).firma, cubo.firma);
});

test("uso card: reads the plugin's subtitle — tokens in+out, the cache apart, the cost always «estimado»; degrades to the raw text", () => {
  const u = leerUso("33,8 M tokens · $1,654.69 est. · 1329 ses. · 30 d · claude-opus");
  assert.deepEqual([u.tokens, u.tokensTexto, u.costeTexto, u.cacheTexto, u.otros], [33_800_000, "33,8 M tokens", "$1,654.69", "", ["1329 ses.", "30 d", "claude-opus"]]);
  assert.deepEqual(detalleDe({ tipo: "uso", subtitulo: "33,8 M tokens · $1,654.69 est. · 1329 ses. · 30 d · claude-opus" }), [
    "Entrada y salida: 33,8 M tokens", "Coste estimado: $1,654.69 (estimado, no es lo facturado)", "1329 ses. · 30 d · claude-opus"]);
  // with the cache (the plugin may say it): shown on its own line, never added to input+output
  const con = detalleDe({ tipo: "uso", subtitulo: "31,7 M tokens · caché 4.302 M · $12.40 est. · 90 ses." });
  assert.deepEqual(con.slice(0, 3), ["Entrada y salida: 31,7 M tokens", "Caché (aparte): 4.302 M tokens", "Coste estimado: $12.40 (estimado, no es lo facturado)"]);
  assert.equal(leerUso("31,7 M tokens · caché 4.302 M").tokens, 31_700_000, "the cache is not part of the tokens");
  // bad / odd input never throws and never invents a number
  for (const raro of ["", "   ", "·", "sin datos", "tokens", "M tokens", "$ est.", "<script>alert(1)</script> tokens"]) {
    const l = detalleDe({ tipo: "uso", subtitulo: raro });
    assert.ok(Array.isArray(l)); assert.equal(leerUso(raro).tokens, null, raro);
    assert.equal(l.some((x) => /Coste estimado|Caché/.test(x)), false, raro);
  }
  assert.deepEqual(detalleDe({ tipo: "uso", subtitulo: "sin datos" }), ["sin datos"], "unreadable → the text as it came");
  assert.deepEqual(detalleDe({ tipo: "perfil", subtitulo: "gpt · 2/3 cron · gateway activo" }), ["gpt · 2/3 cron · gateway activo"]);
  assert.deepEqual(detalleDe({ tipo: "perfil", subtitulo: "" }), []);
  assert.equal(numeroConEscala("1.5 k"), 1500); assert.equal(numeroConEscala("2 G"), 2e9); assert.equal(numeroConEscala("abc"), null); assert.equal(numeroConEscala("1,5"), 1.5);
});

test("uso meter level: tokens over the largest in the world; no tokens = null (drawn empty); an empty world = null", () => {
  const todas = [{ tipo: "uso", subtitulo: "40 M tokens" }, { tipo: "uso", subtitulo: "10 M tokens" }, { tipo: "uso", subtitulo: "sin datos" }, { tipo: "perfil", subtitulo: "999 M tokens" }];
  assert.equal(nivelDeUso(todas[0], todas), 1); assert.equal(nivelDeUso(todas[1], todas), 0.25);
  assert.equal(nivelDeUso(todas[2], todas), null); assert.equal(nivelDeUso(todas[0], [todas[0]]), 1, "alone it is the largest");
  assert.equal(nivelDeUso({ tipo: "uso", subtitulo: "0 tokens" }, [{ tipo: "uso", subtitulo: "0 tokens" }]), null);
});

test("perfil card words: working, resting, off — and unknown states are «en reposo»", () => {
  assert.deepEqual((["activo", "apagado", "fallo", "desconocido", "x"] as EstadoCosa[]).map((e) => textoEstadoDe("perfil", e)), ["trabajando", "apagado", "con fallo", "en reposo", "en reposo"]);
  assert.equal(textoEstadoDe("cron", "pausado"), "en pausa");
});

const ESPEJO = {
  schema: ESQUEMA, activa: true, funciones: { salud: true, perfiles: true, uso: true },
  zonas: [
    { id: "z0", nombre: "El umbral", centro: { x: 0, z: 0 }, ancho: 20, fondo: 14, alto: 4, tipos: ["salud"] },
    { id: "z4", nombre: "El taller", cartel: "EL TALLER · agentes", centro: { x: 0, z: 30 }, ancho: 24, fondo: 16, alto: 6, tipos: ["perfil"] },
    { id: "z5", nombre: "La tesorería", cartel: "LA TESORERÍA · gasto", centro: { x: -30, z: 30 }, ancho: 24, fondo: 16, alto: 6, tipos: ["uso"] },
  ],
};

test("the page draws `perfil` and `uso` as their own shapes with Spanish labels; the meters are relative to the largest and redraw together; an unknown state is refused at the door", () => {
  const formas = new Map<string, Record<string, unknown>>(), tags = new Map<string, Record<string, unknown>>();
  const view = { label() {}, bounce() {}, forma: (k: string, f: Record<string, unknown> | null) => { if (f) formas.set(k, f); else formas.delete(k); }, tag: (k: string, t: Record<string, unknown> | null) => { if (t) tags.set(k, t); else tags.delete(k); } };
  const log: string[] = [];
  const lista = conMundo(funciones, (f) => (f === "espejo.json" ? structuredClone(ESPEJO) : undefined), (l) => log.push(l));
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: signer("una-clave-de-prueba-larga") });
  const t = inst.join(0), pagina = crearCliente(), lee = leerEspejo(ESPEJO);
  if (lee.ok) pagina.espejo.configurar(vistaPublica(lee.value));
  new ClientSession(t, { features: pagina.parts, identity: { load: () => null, save: () => {} } as GuestKeeper, view: view as never });
  const pump = (n: number) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  const enlace = lista.find(conEspejo)!.enlace as EnlaceEspejo;
  enlace.conectada(true); pump(3);
  const perfil = (id: string, estado: string, extra: Record<string, unknown> = {}) => ({ tipo: "perfil", id, titulo: id, estado, zona: "z4", subtitulo: "modelo · 1/2 cron · gateway activo", ...extra });
  const uso = (id: string, sub: string) => ({ tipo: "uso", id, titulo: `Gasto · ${id}`, estado: "activo", zona: "z5", subtitulo: sub });
  assert.equal(enlace.lote([perfil("a-ursa", "activo"), perfil("a-lia", "apagado"), perfil("a-bo", "desconocido"), uso("total", "10 M tokens · $5.00 est."), uso("g-ursa", "40 M tokens · caché 900 M · $20.00 est.")]).ok, true); pump(4);
  const f = (k: string) => formas.get(`espejo:${k}`)!, tg = (k: string) => tags.get(`espejo:${k}`)!;
  assert.deepEqual([f("perfil/a-ursa").forma, f("perfil/a-ursa").estado, f("perfil/a-ursa").discontinuo], ["perfil", "on", undefined]);
  assert.deepEqual([f("perfil/a-lia").estado, f("perfil/a-lia").discontinuo], ["off", true], "off = dashed");
  assert.deepEqual([f("perfil/a-bo").estado, f("perfil/a-bo").discontinuo], ["off", undefined], "idle = plain outline");
  assert.deepEqual([tg("perfil/a-ursa").sub, tg("perfil/a-lia").sub, tg("perfil/a-bo").sub], ["trabajando", "apagado", "en reposo"]);
  assert.deepEqual([f("uso/g-ursa").forma, f("uso/g-ursa").nivel, f("uso/total").nivel], ["uso", 1, 0.25]);
  assert.equal(tg("uso/g-ursa").sub, "40 M tokens", "the label is the tokens (the cache is NOT added to it)");
  // a bigger one arrives: the others are redrawn against it
  enlace.alta(uso("g-lia", "80 M tokens")); pump(3);
  assert.deepEqual([f("uso/g-lia").nivel, f("uso/g-ursa").nivel, f("uso/total").nivel], [1, 0.5, 0.125]);
  // a zone shows as ON when its function is on (perfiles/uso were NOT in the old name table)
  assert.equal(f("zona:z4").discontinuo, false); assert.equal(f("zona:z5").discontinuo, false);
  // switched off: the world refuses and the page draws the zone dashed
  const apagada = leerEspejo({ ...ESPEJO, funciones: { salud: true, perfiles: false, uso: true } });
  if (apagada.ok) pagina.espejo.configurar(vistaPublica(apagada.value));
  assert.equal(f("zona:z4").discontinuo, true, "perfiles off: dashed floor");
  // a state the world does not know never reaches the page (the mirror refuses it, saying which are valid)
  const rara = enlace.alta(perfil("a-x", "algo-raro")); assert.equal(rara.ok, false);
  if (!rara.ok) assert.match(rara.motivo, /estado/);
  assert.equal(formas.has("espejo:perfil/a-x"), false);
});
