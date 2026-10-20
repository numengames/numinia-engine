// H8 · «Espacio base» switch in Construir → Entorno, a NEW world is born in the espacio base, «Restaurar el mundo» goes back to it.
// Headless: real instance + real pages over loopback + the real world-folder writer (packages/server/src/mundo.ts) on a temp dir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { leerMundo, escribirMundo } from "../packages/server/src/mundo.ts";
import { carpetaMundo, sembrar, ESPACIO_BASE_NUEVO } from "../packages/server/src/mundo-carpeta.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { espacioBase } from "../features/espaciobase/feature.ts";
import { conActiva, ficheroNuevo } from "../features/espaciobase/server.ts";
import { crearCliente } from "../features/espaciobase/client.ts";
import { crearCliente as clienteObjetos } from "../features/objetos/client.ts";
import { crearCliente as clienteElementos } from "../features/elementos/client.ts";
import { ESQUEMA, DEFECTOS, leerEspacioBase } from "../features/espaciobase/esquema.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const carpeta = (fichero?: string) => { const dir = tmp("h08-"); if (fichero !== undefined) writeFileSync(join(dir, "espacio-base.json"), fichero); return dir; };

/** A world from its folder (as main.ts builds it), `n` pages; `puede(e)` = may this entity build. */
function mundo(dir: string, n: number, puede: (e: number) => boolean = () => true) {
  const log: string[] = [];
  const partes = conMundo(funciones, leerMundo(dir, (l) => log.push(l)), (l) => log.push(l), escribirMundo(dir, (l) => log.push(l)));
  const inst = new Instance({ seed: 3, capacity: 8, k: 50, snapshotEvery: 2, features: partes.filter((p) => ["espacio-base", "objetos", "elementos"].includes(p.feature.id)), log: (l) => log.push(l), aparicion: { x: 0, z: 0, radio: 1 }, puede: (_w, accion, e) => accion === "construir" && puede(e) });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), b = crearCliente(), o = clienteObjetos(), el = clienteElementos(), vistas: Record<string, unknown>[] = [];
    const s = new ClientSession(t, { features: [b.part, o.part, el.part], view: { label() {}, bounce() {}, espacioBase: (v: Record<string, unknown>) => vistas.push({ ...v }) } });
    return { t, s, base: b.interruptor, obj: o.constructor, elem: el.elementos, vistas };
  });
  const pump = (ticks = 4) => { for (let i = 0; i < ticks; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  const cosas = () => [...inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).map(([, v]) => v as Record<string, unknown>);
  const elementos = () => [...inst.features.allState()].filter(([k]) => k.startsWith("elementos:"));
  return { inst, pages, pump, log, cosas, elementos };
}
const eventos = (s: ClientSession, ev: string) => s.features.log.filter((l) => l.feature === "espacio-base" && l.event === ev);
const leer = (dir: string) => readFileSync(join(dir, "espacio-base.json"), "utf8");

test("H8 switch: the declaration meets the plug's rules; conActiva keeps every key and never replaces a seed", () => {
  assert.deepEqual(espacioBase.issues, []);
  assert.deepEqual(conActiva(undefined, true), { schema: ESQUEMA, activa: true, semilla: 42 });
  assert.deepEqual(ficheroNuevo(), { schema: ESQUEMA, activa: true, semilla: DEFECTOS.semilla });
  const crudo = { schema: ESQUEMA, semilla: 7, activa: true, objeto: null, agentes: 3 };
  const nuevo = conActiva(crudo, false)!;
  assert.deepEqual(Object.keys(nuevo), Object.keys(crudo)); assert.deepEqual(nuevo, { ...crudo, activa: false });
  assert.equal(crudo.activa, true, "the input is not touched");
  assert.equal(conActiva([1], true), null); assert.equal(conActiva(null, true), null);
});

test("H8 switch: a guest (no «construir») is refused; file and pages stay as they were", () => {
  const original = `{ "schema": "${ESQUEMA}", "semilla": 9, "activa": true }\n`;
  const dir = carpeta(original);
  const { pages: [a, b], pump } = mundo(dir, 2, () => false);
  assert.equal(a.base.activa(), true);
  const antes = a.vistas.length;
  a.base.poner(false); pump();
  assert.match(String(eventos(a.s, "rechazado").at(-1)?.msg.motivo), /permiso de construir/);
  assert.equal(leer(dir), original); assert.equal(a.base.activa(), true); assert.equal(b.base.activa(), true);
  assert.equal(a.vistas.length, antes); assert.equal(eventos(b.s, "cambiado").length, 0);
  a.base.restaurar(); pump();
  assert.match(String(eventos(a.s, "rechazado").at(-1)?.msg.motivo), /restaurar el mundo/);
  assert.equal(leer(dir), original);
});

test("H8 switch: a world WITHOUT the file gets { schema, activa: true, semilla: 42 } on the first switch (even with no entorno/ folder), and every page draws it", () => {
  const raiz = tmp("h08-sin-"), dir = join(raiz, "entorno");
  const { pages: [a, b], pump } = mundo(dir, 2);
  assert.equal(a.vistas.length, 0, "no file: the view is never called"); assert.equal(a.base.activa(), false);
  a.base.poner(true); pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: true, semilla: 42 });
  assert.deepEqual(readdirSync(dir), ["espacio-base.json"], "no temporary file left");
  for (const p of [a, b]) { assert.equal(p.base.activa(), true); assert.equal(p.vistas.at(-1)?.activa, true); assert.equal(p.vistas.at(-1)?.semilla, 42); }
  assert.equal(eventos(b.s, "cambiado").at(-1)?.msg.estado, "encendido");
  a.base.poner(false); pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: false, semilla: 42 });
  assert.equal(b.vistas.at(-1)?.activa, false); assert.equal(eventos(b.s, "cambiado").at(-1)?.msg.estado, "apagado");
  assert.deepEqual(eventos(a.s, "rechazado"), []);
});

test("H8 switch: an existing file keeps its seed and every other key; a broken one is never overwritten", () => {
  const dir = carpeta(JSON.stringify({ schema: ESQUEMA, activa: false, semilla: 777, objeto: null, agentes: 2 }));
  const { pages: [a], pump } = mundo(dir, 1);
  a.base.poner(true); pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: true, semilla: 777, objeto: null, agentes: 2 });
  assert.equal(a.vistas.at(-1)?.semilla, 777);
  const roto = "{ \"semilla\": 5, ", d2 = carpeta(roto), w = mundo(d2, 1);
  w.pages[0].base.poner(true); w.pump();
  assert.match(String(eventos(w.pages[0].s, "rechazado").at(-1)?.msg.motivo), /No he podido guardar/);
  assert.equal(leer(d2), roto); assert.deepEqual(readdirSync(d2), ["espacio-base.json"]);
});

test("H8 new world: `sembrar` on an empty folder writes entorno/espacio-base.json on (default seed); the example adventure is still copied", () => {
  const c = carpetaMundo(join(tmp("h08-nuevo-"), "mundo")), log: string[] = [];
  assert.equal(sembrar(c, (l) => log.push(l)), true);
  const f = JSON.parse(readFileSync(join(c.entorno, "espacio-base.json"), "utf8"));
  assert.deepEqual(f, ESPACIO_BASE_NUEVO); assert.deepEqual(f, ficheroNuevo(), "the same words as the switch's file");
  const r = leerEspacioBase(f); assert.ok(r.ok && r.value.activa && r.value.semilla === 42);
  assert.ok(existsSync(join(c.aventura, "pnj", "alma.json")), "the example adventure came too");
  assert.match(log.join("\n"), /nace en el espacio base/);
  // the world that exists is not changed: run again, even after the builder switched it off
  writeFileSync(join(c.entorno, "espacio-base.json"), JSON.stringify({ activa: false, semilla: 5 }));
  assert.equal(sembrar(c), false);
  assert.deepEqual(JSON.parse(readFileSync(join(c.entorno, "espacio-base.json"), "utf8")), { activa: false, semilla: 5 });
});

test("H8 new world: a world that already exists (its aventura/ or its own entorno/) is NOT changed", () => {
  const viejo = carpetaMundo(join(tmp("h08-viejo-"), "mundo"));
  mkdirSync(viejo.aventura, { recursive: true });
  assert.equal(sembrar(viejo), false);
  assert.ok(!existsSync(viejo.entorno), "an existing world with an adventure and no entorno/ stays as it was (the plaza)");
  const conEntorno = carpetaMundo(join(tmp("h08-conentorno-"), "mundo"));
  mkdirSync(conEntorno.entorno, { recursive: true }); writeFileSync(join(conEntorno.entorno, "naturaleza.json"), "{}");
  sembrar(conEntorno);
  assert.deepEqual(readdirSync(conEntorno.entorno), ["naturaleza.json"]);
});

test("H8 new world: it is born in the espacio base — state on, logo and moñoni planted — and the plaza template (no file) is untouched", () => {
  const c = carpetaMundo(join(tmp("h08-flujo-"), "mundo"));
  sembrar(c);
  const w = mundo(c.entorno, 1);
  assert.equal(w.pages[0].base.activa(), true);
  assert.deepEqual(w.cosas().map((o) => o.nombre).sort(), ["Logo Khepri", "Moñoni 1", "Moñoni 1 boca"]);
  const plaza = mundo(tmp("h08-plaza-"), 1);
  assert.equal(plaza.pages[0].base.activa(), false); assert.equal(plaza.cosas().length, 0, "a world with no file: nothing planted (as before)");
});

test("H8 restore: the file goes back to the espacio base, what was built goes, the logo and moñoni are planted again — for a builder; a guest changes nothing", () => {
  const dir = carpeta(JSON.stringify({ schema: ESQUEMA, activa: false, semilla: 999, agentes: 0, objeto: null }));
  const w = mundo(dir, 1);
  const [a] = w.pages;
  a.obj.colocar("logo-khepri"); a.obj.colocar("logo-khepri"); a.elem.poner("fuego", { x: 1, z: 1 }); w.pump();
  const construido = w.cosas().length, hogueras = w.elementos().length;
  assert.ok(construido >= 2 && hogueras === 1, `built something (${construido} objects, ${hogueras} elements)`);
  a.base.restaurar(); a.obj.reiniciar(); a.elem.vaciar(); w.pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: true, semilla: 42 }, "default seed, on, nothing of the old file");
  assert.deepEqual(w.cosas().map((o) => o.nombre).sort(), ["Logo Khepri", "Moñoni 1", "Moñoni 1 boca"]);
  assert.equal(w.elementos().length, 0);
  assert.equal(a.base.activa(), true); assert.equal(a.vistas.at(-1)?.semilla, 42);
  assert.deepEqual(eventos(a.s, "rechazado"), []);
  // a guest: nothing changes
  const d2 = carpeta(JSON.stringify({ activa: false, semilla: 5 })), g = mundo(d2, 1, () => false);
  g.pages[0].obj.reiniciar(); g.pages[0].elem.vaciar(); g.pages[0].base.restaurar(); g.pump();
  assert.deepEqual(JSON.parse(leer(d2)), { activa: false, semilla: 5 }); assert.equal(g.cosas().length, 0);
});

test("H8 seed: a builder changes the seed from the panel (file keeps every other key, pages redraw live); a guest or a wrong number changes nothing", () => {
  const dir = carpeta(JSON.stringify({ schema: ESQUEMA, activa: true, semilla: 42, objeto: null, agentes: 2 }));
  const { pages: [a, b], pump } = mundo(dir, 2);
  assert.equal(a.base.semilla(), 42);
  a.base.ponerSemilla(1234); pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: true, semilla: 1234, objeto: null, agentes: 2 });
  for (const p of [a, b]) { assert.equal(p.base.semilla(), 1234); assert.equal(p.vistas.at(-1)?.semilla, 1234); }
  a.base.ponerSemilla(-5); pump();
  assert.equal(JSON.parse(leer(dir)).semilla, 1234);
  const d2 = carpeta(JSON.stringify({ semilla: 7 })), g = mundo(d2, 1, () => false);
  g.pages[0].base.ponerSemilla(9); g.pump();
  assert.equal(JSON.parse(leer(d2)).semilla, 7); assert.match(String(eventos(g.pages[0].s, "rechazado").at(-1)?.msg.motivo), /semilla/);
  // a world with no file: the first seed creates it, on
  const raiz = tmp("h08-sem-"), d3 = join(raiz, "entorno"), w = mundo(d3, 1);
  w.pages[0].base.ponerSemilla(55); w.pump();
  assert.deepEqual(JSON.parse(leer(d3)), { schema: ESQUEMA, activa: true, semilla: 55 });
});
