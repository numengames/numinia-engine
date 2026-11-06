// mundo-hermes · historia 2: `numinia-engine/espejo@1` (features/espejo/esquema.ts). 6+ good files, 8+ bad ones (each says its path and how to
// fix it), and the same for a single thing an outside source publishes (`leerObjeto`). Pure: no engine, no sockets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESQUEMA, FUNCIONES, LIMITES, SEGURIDAD_DEFECTO, TIPOS, VERBOS, VERBOS_LISTA, funcionesEncendidas, leerEspejo, leerObjeto, limpiar, tiposEncendidos } from "../features/espejo/esquema.ts";
import type { Espejo } from "../features/espejo/esquema.ts";

const zona = { id: "z7", nombre: "El reloj", centro: { x: 40, z: -10 }, ancho: 16, fondo: 16, alto: 6, tipos: ["cron"], luz: "#ffffff", cartel: "EL RELOJ · tareas programadas" };
const base = (extra: Record<string, unknown> = {}) => ({ schema: ESQUEMA, ...extra });
const ok = (j: unknown): Espejo => { const r = leerEspejo(j); assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.issues)); return r.ok ? r.value : (undefined as never); };
const mal = (j: unknown): { path: string; message: string }[] => { const r = leerEspejo(j); assert.equal(r.ok, false, "debía fallar: " + JSON.stringify(j)); return r.ok ? [] : r.issues; };

test("the catalogue is consistent: every verb belongs to a function and every type to a function; no verb is «libre»", () => {
  for (const f of Object.values(VERBOS)) assert.ok((FUNCIONES as readonly string[]).includes(f));
  for (const f of Object.values(TIPOS)) assert.ok((FUNCIONES as readonly string[]).includes(f));
  assert.equal(new Set(FUNCIONES).size, FUNCIONES.length);
  assert.equal(SEGURIDAD_DEFECTO, "aprobar");
  assert.deepEqual(FUNCIONES.slice(0, 3), ["salud", "cron", "sesiones"]);
});

// ---- 6 good ----
test("good 1: the smallest file — only the schema — is on with every function OFF and every verb «aprobar»", () => {
  const e = ok(base());
  assert.equal(e.activa, true); assert.deepEqual(e.zonas, []); assert.deepEqual(funcionesEncendidas(e), []); assert.deepEqual(tiposEncendidos(e), []);
  assert.equal(e.fuente.puerto, 8791);
  for (const v of VERBOS_LISTA) assert.equal(e.acciones[v], "aprobar", v);
});
test("good 2: switches — cron and sesiones on, the rest off; the types follow the switches", () => {
  const e = ok(base({ funciones: { cron: true, sesiones: true, chat: false } }));
  assert.deepEqual(funcionesEncendidas(e), ["cron", "sesiones"]);
  assert.deepEqual(tiposEncendidos(e), ["cron", "sesion"]);
  assert.equal(e.funciones.chat, false); assert.equal(e.funciones.salud, false);
});
test("good 3: a full zone, with the sign and colour read and the sign cut to its size", () => {
  const e = ok(base({ zonas: [zona] }));
  assert.deepEqual(e.zonas, [{ id: "z7", nombre: "El reloj", x: 40, z: -10, ancho: 16, fondo: 16, alto: 6, tipos: ["cron"], cartel: "EL RELOJ · tareas programadas" }]);
});
test("good 4: the owner lowers a verb from aprobar to confirmar (never to nothing)", () => {
  const e = ok(base({ acciones: { "cron.pausar": "confirmar", "cron.ejecutar": "aprobar" } }));
  assert.equal(e.acciones["cron.pausar"], "confirmar"); assert.equal(e.acciones["cron.ejecutar"], "aprobar"); assert.equal(e.acciones["sesion.nueva"], "aprobar");
});
test("good 5: activa:false keeps the file but turns the whole mirror off, whatever the switches say", () => {
  const e = ok(base({ activa: false, funciones: { cron: true } }));
  assert.deepEqual(funcionesEncendidas(e), []); assert.deepEqual(tiposEncendidos(e), []); assert.equal(e.funciones.cron, true, "the owner's switch is kept");
});
test("good 6: the full Hermes shape (A0 §2.3): source, several zones, switches, actions, a note", () => {
  const e = ok(base({ activa: true, notas: "mundo hermes", fuente: { tipo: "enlace-local", puerto: 9000 }, funciones: { salud: true, cron: true, sesiones: true },
    zonas: [zona, { id: "z3", nombre: "El archivo", centro: { x: 0, z: 0 }, ancho: 28, fondo: 24, alto: 6, tipos: ["sesion"] }], acciones: { "sesion.nueva": "confirmar" } }));
  assert.equal(e.fuente.puerto, 9000); assert.equal(e.zonas.length, 2); assert.equal(e.zonas[1].cartel, "El archivo", "no sign = the zone's name");
});

// ---- 8+ bad (each: the path, and a message that says how to fix it) ----
const caso = (nombre: string, j: unknown, path: string, re: RegExp) => test(`bad: ${nombre}`, () => {
  const i = mal(j); const hit = i.find((x) => x.path === path);
  assert.ok(hit, `falta ${path} en ${JSON.stringify(i)}`); assert.match(hit.message, re);
});
caso("not an object", [1, 2], "espejo", /un objeto JSON/);
caso("wrong schema", { schema: "numinia-engine/espejo@2" }, "espejo.schema", /debe ser "numinia-engine\/espejo@1"/);
caso("unknown top-level key", base({ cron: true }), "espejo.cron", /clave desconocida/);
caso("unknown function switch", base({ funciones: { cron: true, hacerte_cafe: true } }), "espejo.funciones.hacerte_cafe", /función desconocida.*salud, cron/);
caso("a switch that is not a boolean", base({ funciones: { cron: "sí" } }), "espejo.funciones.cron", /true o false/);
caso("unknown verb in acciones", base({ acciones: { "cron.borrar": "aprobar" } }), "espejo.acciones.cron.borrar", /verbo desconocido.*cron\.pausar/);
caso("an action asked as «libre»", base({ acciones: { "cron.pausar": "libre" } }), "espejo.acciones.cron.pausar", /nunca «libre»/);
caso("an action with a word that is not a safety", base({ acciones: { "cron.pausar": "quizá" } }), "espejo.acciones.cron.pausar", /confirmar, aprobar/);
caso("a port out of range", base({ fuente: { puerto: 80 } }), "espejo.fuente.puerto", /entre 1024 y 65535/);
caso("a source that is not local", base({ fuente: { tipo: "remota" } }), "espejo.fuente.tipo", /enlace-local/);
caso("zone out of range (centre beyond the world)", base({ zonas: [{ ...zona, centro: { x: 99999, z: 0 } }] }), "espejo.zonas[0].centro", /entre −2000 y 2000/);
caso("zone with no size", base({ zonas: [{ ...zona, ancho: 0 }] }), "espejo.zonas[0].ancho", /entre 1 y 200/);
caso("zone with an unknown type", base({ zonas: [{ ...zona, tipos: ["cron", "pizza"] }] }), "espejo.zonas[0].tipos[1]", /tipo desconocido/);
caso("zone with a long sign", base({ zonas: [{ ...zona, cartel: "x".repeat(81) }] }), "espejo.zonas[0].cartel", /hasta 80 bytes/);
caso("zone with a bad colour", base({ zonas: [{ ...zona, luz: "azul" }] }), "espejo.zonas[0].luz", /#rrggbb/);
test("bad: two zones with the same id, and more zones than the ceiling", () => {
  assert.ok(mal(base({ zonas: [zona, zona] })).some((i) => i.path === "espejo.zonas[1].id" && /repetido/.test(i.message)));
  assert.ok(mal(base({ zonas: Array.from({ length: LIMITES.zonas + 1 }, (_, i) => ({ ...zona, id: `z${i}` })) })).some((i) => i.path === "espejo.zonas" && /como mucho 12/.test(i.message)));
});
test("bad: a wrong file reports every issue at once, none thrown", () => {
  const i = mal({ schema: "x", activa: 1, funciones: { zzz: 1 }, zonas: "no" });
  assert.deepEqual(i.map((x) => x.path).sort(), ["espejo.activa", "espejo.funciones.zzz", "espejo.schema", "espejo.zonas"].sort());
});

// ---- one thing, as an outside source publishes it ----
const E = ok(base({ funciones: { cron: true, sesiones: true }, zonas: [zona, { id: "z3", nombre: "El archivo", centro: { x: 0, z: 0 }, ancho: 28, fondo: 24, alto: 6, tipos: ["sesion"] }] }));
const cron = (extra: Record<string, unknown> = {}) => ({ tipo: "cron", id: "8bc0", titulo: "Resumen diario", estado: "programado", zona: "z7", acciones: ["cron.pausar", "cron.ejecutar"], ...extra });

test("leerObjeto: a good cron is placed at its zone's centre with cleaned texts and only its own verbs", () => {
  const r = leerObjeto(cron({ subtitulo: "próxima: 09:00\n\n<script>alert(1)</script>" }), E);
  assert.ok(r.ok); if (!r.ok) return;
  assert.deepEqual([r.value.tipo, r.value.id, r.value.zona, r.value.x, r.value.z, r.value.estado], ["cron", "8bc0", "z7", 40, -10, "programado"]);
  assert.equal(r.value.subtitulo.includes("\n"), false); assert.deepEqual(r.value.acciones, ["cron.pausar", "cron.ejecutar"]);
});
test("leerObjeto: bad things say their path (long title, unknown zone, wrong type for the zone, verb of another function, outside the zone, unknown state, extra key)", () => {
  const ruta = (c: unknown) => { const r = leerObjeto(c, E); assert.equal(r.ok, false, JSON.stringify(c)); return r.ok ? [] : r.issues.map((i) => i.path); };
  assert.deepEqual(ruta(cron({ titulo: "t".repeat(61) })), ["objeto.titulo"]);
  assert.deepEqual(ruta(cron({ zona: "z99" })), ["objeto.zona"]);
  assert.deepEqual(ruta(cron({ tipo: "sesion", acciones: [] })), ["objeto.tipo"]);                  // z7 only takes cron
  assert.deepEqual(ruta(cron({ acciones: ["sesion.nueva"] })), ["objeto.acciones[0]"]);             // a verb of another function
  assert.deepEqual(ruta(cron({ acciones: ["cron.borrar"] })), ["objeto.acciones[0]"]);
  assert.deepEqual(ruta(cron({ x: 400 })), ["objeto.x"]);                                           // far outside the 16 m zone
  assert.deepEqual(ruta(cron({ estado: "dormido" })), ["objeto.estado"]);
  assert.deepEqual(ruta(cron({ secreto: "x" })), ["objeto.secreto"]);
  assert.deepEqual(ruta(cron({ id: "Mayúsculas y espacios" })), ["objeto.id"]);
  assert.equal(leerObjeto("hola", E).ok, false);
});
test("limpiar: cuts on a character by bytes, strips control characters, never throws on odd input", () => {
  assert.equal(limpiar("a\u0000b\tc\u2028d", 20), "a b c d");
  assert.equal(new TextEncoder().encode(limpiar("ñ".repeat(100), 10)).length <= 10, true);
  assert.match(limpiar("€".repeat(30), 12), /…$/);
  assert.equal(limpiar(undefined, 5), ""); assert.equal(limpiar({ a: 1 }, 40), "[object Object]");
});
