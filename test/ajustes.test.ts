import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearAjustes, crearCapacidades, leerNavegador, nivelAparato, cumple, faltan, validarAjuste, validarValor, leerTextoGuardado,
  AJUSTES_MOTOR, CLAVE_GUARDADO, GUARDADOS_MAX, GUARDADO_BYTES_MAX, AJUSTES_POR_FUNCION_MAX, ESQUEMA_MUNDO,
} from "../packages/client/src/ajustes.ts";
import type { Capacidades, Guardado, AjusteDecl } from "../packages/client/src/ajustes.ts";
import { defineFeature } from "../packages/feature/src/index.ts";
import { createPower, CALIDADES } from "../packages/render/src/power.ts";
import { despertar } from "../features/despertar/feature.ts";
import { readFileSync } from "node:fs";

// a fake browser: what leerNavegador reads
const navegador = (o: { coarse?: boolean; memoria?: number; reducir?: boolean; contraste?: boolean; ahorro?: boolean; gpu?: boolean } = {}) => ({
  navigator: { maxTouchPoints: o.coarse ? 5 : 0, deviceMemory: o.memoria, hardwareConcurrency: 8, gpu: o.gpu ? {} : undefined, connection: { saveData: !!o.ahorro }, getGamepads: () => [null] },
  matchMedia: (q: string) => ({ matches: (q === "(pointer: coarse)" && !!o.coarse) || (q === "(prefers-reduced-motion: reduce)" && !!o.reducir) || (q === "(prefers-contrast: more)" && !!o.contraste) || (q === "(any-pointer: fine)" && !o.coarse) }),
  devicePixelRatio: o.coarse ? 3 : 1,
});
const memoria = (): Guardado & { datos: Map<string, string> } => { const datos = new Map<string, string>(); return { datos, leer: (k) => datos.get(k) ?? null, escribir: (k, t) => { datos.set(k, t); } }; };
const registro = (c: Capacidades, guardado?: Guardado, mundo = "plaza") => {
  const a = crearAjustes({ capacidades: crearCapacidades(c), guardado, mundo });
  assert.deepEqual(a.declarar(AJUSTES_MOTOR), [], "the engine's own settings are valid");
  return a;
};
const escritorio = () => leerNavegador(navegador({ memoria: 8, gpu: true }));
const movil = () => leerNavegador(navegador({ coarse: true, memoria: 4 }));

test("capabilities: read from the browser by capability, tier by rule (A desktop, B headset, C phone, D old phone)", () => {
  const d = escritorio(), m = movil();
  assert.equal(d.nivel, "A"); assert.equal(d.movil, false); assert.equal(d.webgpu, true); assert.equal(d.tactil, false);
  assert.equal(m.nivel, "C"); assert.equal(m.movil, true); assert.equal(m.punteroGrueso, true); assert.equal(m.dpr, 3);
  assert.equal(nivelAparato({ ...m, memoriaGB: 2 }), "D");
  assert.equal(nivelAparato({ ...m, xrVr: true }), "B");
  assert.equal(leerNavegador({}).nivel, "A", "an empty environment never throws");
  const caps = crearCapacidades(m, { nivel: "D" });
  assert.equal(caps.valores.nivel, "D", "?nivel= forces the tier");
  const vivas = crearCapacidades(m), oidas: string[][] = [];
  vivas.alCambiar((ids) => oidas.push(ids));
  vivas.poner({ xrVr: true });
  assert.equal(vivas.valores.nivel, "B");
  assert.deepEqual(oidas, [["xrVr", "nivel"]]);
  vivas.agregar({ id: "manos", describe: "seguimiento de manos", leer: () => true }); // a new capability in one line
  assert.equal(vivas.valores.manos, true);
  assert.ok(vivas.describir().some((x) => x.id === "manos" && x.describe === "seguimiento de manos"));
});

test("requiere: truthy, negation and comparisons", () => {
  const c: Capacidades = { webgpu: true, tactil: false, memoriaGB: 4, nivel: "C", backend: "WebGL2" };
  assert.ok(cumple("webgpu", c)); assert.ok(cumple("!tactil", c)); assert.ok(!cumple("xrVr", c));
  assert.ok(cumple("memoriaGB>=4", c)); assert.ok(!cumple("memoriaGB>4", c)); assert.ok(cumple("nivel=C", c)); assert.ok(cumple("backend=WebGL2", c));
  assert.deepEqual(faltan(["webgpu", "xrVr", "memoriaGB<2"], c), ["xrVr", "memoriaGB<2"]);
});

test("defaults by tier and by capability: phones start cool, the system's preferences come first", () => {
  const conEntorno = { "entorno.sombras": true, "entorno.agua": true, "entorno.particulas": true, "entorno.hdr": true };
  const a = registro({ ...escritorio(), ...conEntorno }), m = registro({ ...movil(), ...conEntorno });
  assert.equal(a.get("graficos.sombras"), "media"); assert.equal(a.get("graficos.hdr"), true); assert.equal(a.get("graficos.agua"), "reflejos");
  assert.equal(m.get("graficos.sombras"), "no"); assert.equal(m.get("graficos.hdr"), false); assert.equal(m.get("graficos.particulas"), "pocas");
  assert.equal(m.get("graficos.bateria"), false);
  const ahorro = registro(leerNavegador(navegador({ coarse: true, ahorro: true })));
  assert.equal(ahorro.get("graficos.bateria"), true, "Save-Data starts in battery mode");
  const pref = registro(leerNavegador(navegador({ reducir: true, contraste: true })));
  assert.equal(pref.get("accesibilidad.menosMovimiento"), true);
  assert.equal(pref.get("accesibilidad.altoContraste"), true);
  assert.equal(a.get("accesibilidad.menosMovimiento"), false);
  assert.equal(a.get("privacidad.informe"), true, "the session report stays on by default (Pablo's decision)");
});

test("requiere hides (and does not apply) what the device or the page cannot do; it shows up when the capability arrives", () => {
  const caps = crearCapacidades(escritorio());
  const a = crearAjustes({ capacidades: caps });
  a.declarar(AJUSTES_MOTOR);
  const aplicados: unknown[] = [];
  a.alAplicar("controles.sensibilidad", (v) => aplicados.push(v));
  a.aplicarTodo();
  const s = a.lista().find((x) => x.id === "controles.sensibilidad")!;
  assert.equal(s.visible, false); assert.deepEqual(s.falta, ["camara"]);
  assert.deepEqual(aplicados, [], "hidden = not applied");
  assert.ok(!a.grupos().find((g) => g.id === "graficos")!.ajustes.some((x) => x.id === "graficos.sombras" && x.visible), "no environment, no shadows setting");
  caps.poner({ camara: true });
  assert.deepEqual(aplicados, [100], "the camera arrived: applied at once with its value");
  assert.equal(a.lista().find((x) => x.id === "controles.sensibilidad")!.visible, true);
});

test("validation returns issues with paths; set() never throws", () => {
  const a = registro(escritorio());
  const fuera = a.set("graficos.resolucion", 30);
  assert.equal(fuera.ok, false);
  if (!fuera.ok) { assert.equal(fuera.issues[0].path, "graficos.resolucion"); assert.match(fuera.issues[0].message, /50 to 100 %/); }
  const tipo = a.set("graficos.bateria", "sí");
  assert.equal(tipo.ok, false);
  const nada = a.set("graficos.resolution", 90);
  assert.equal(nada.ok, false);
  if (!nada.ok) assert.match(nada.issues[0].message, /graficos\.resolucion/, "says which ones exist");
  const r = a.set("graficos.resolucion", 92);
  assert.deepEqual(r, { ok: true, value: 90 }, "numbers snap to the step");
  assert.equal(a.set("controles.teclaAjustes", "KeyP").ok, false, "key bindings are view-only for now");
  assert.deepEqual(validarValor({ id: "x", tipo: "eleccion", nombre: "X", describe: "x", defecto: "a", opciones: [{ valor: "a", nombre: "A" }] }, "b", "g.x"),
    { ok: false, issues: [{ path: "g.x", message: "one of: a" }] });
  const malo = validarAjuste({ id: "Mal id", tipo: "numero", nombre: "", describe: "x", min: 5, max: 1, defecto: 3 }, "mundo.ajustes.0");
  assert.deepEqual(malo.map((i) => i.path), ["mundo.ajustes.0.id", "mundo.ajustes.0.nombre", "mundo.ajustes.0.min"]);
  const defectoMalo = validarAjuste({ id: "x", tipo: "bool", nombre: "X", describe: "x", defecto: { valor: true, nivel: { E: false }, si: [{ requiere: ["no vale"], valor: 3 }] } }, "g.x");
  assert.deepEqual(defectoMalo.map((i) => i.path), ["g.x.defecto.nivel.E", "g.x.defecto.si.0.requiere", "g.x.defecto.si.0.valor"]);
});

test("persistence: a round trip, per device and per world, and back to defaults", () => {
  const g = memoria();
  const a = registro(escritorio(), g);
  a.set("graficos.resolucion", 75); a.set("accesibilidad.textoGrande", true);
  const aparato = JSON.parse(g.datos.get(CLAVE_GUARDADO)!);
  assert.deepEqual(aparato, { v: 1, valores: { "graficos.resolucion": 75, "accesibilidad.textoGrande": true } });
  const b = registro(escritorio(), g);
  assert.equal(b.get("graficos.resolucion"), 75); assert.equal(b.get("accesibilidad.textoGrande"), true);
  assert.equal(b.lista().find((x) => x.id === "graficos.resolucion")!.elegido, true);
  b.restablecer("graficos.resolucion");
  assert.equal(b.get("graficos.resolucion"), 100);
  b.restablecer();
  assert.deepEqual(JSON.parse(g.datos.get(CLAVE_GUARDADO)!), { v: 1, valores: {} });
  assert.equal(registro(escritorio(), g).get("accesibilidad.textoGrande"), false);
});

test("persistence: old shapes migrate, newer or broken ones are ignored, values that no longer fit are dropped", () => {
  assert.deepEqual(leerTextoGuardado('{"graficos.resolucion":80}'), { ok: true, value: { "graficos.resolucion": 80 } }, "v0 (flat) → v1");
  assert.equal(leerTextoGuardado('{"v":99,"valores":{}}').ok, false);
  assert.equal(leerTextoGuardado("{no es json").ok, false);
  assert.deepEqual(leerTextoGuardado(null), { ok: true, value: {} });
  for (const t of ['{"graficos.resolucion":80}', '{"v":99,"valores":{"graficos.resolucion":80}}', "{roto", "[]"]) {
    const g = memoria(); g.datos.set(CLAVE_GUARDADO, t);
    const r = registro(escritorio(), g);
    assert.equal(r.get("graficos.resolucion"), t.startsWith('{"graficos') ? 80 : 100, t);
  }
  const g = memoria();
  g.datos.set(CLAVE_GUARDADO, JSON.stringify({ v: 1, valores: { "graficos.resolucion": 300, "graficos.calidad": "ultra", "accesibilidad.textoGrande": true, "viejo.cosa": 1 } }));
  const log: string[] = [];
  const a = crearAjustes({ capacidades: crearCapacidades(escritorio()), guardado: g, registro: (l) => log.push(l) });
  a.declarar(AJUSTES_MOTOR);
  assert.equal(a.get("graficos.resolucion"), 100); assert.equal(a.get("graficos.calidad"), "auto"); assert.equal(a.get("accesibilidad.textoGrande"), true);
  assert.equal(log.filter((l) => l.includes("ya no vale")).length, 2);
  a.set("interfaz.tamano", 125);
  assert.deepEqual(JSON.parse(g.datos.get(CLAVE_GUARDADO)!).valores, { "accesibilidad.textoGrande": true, "interfaz.tamano": 125, "viejo.cosa": 1 }, "unknown ids wait (a feature may load later); bad ones are gone");
});

test("persistence stays bounded: at most GUARDADOS_MAX values and GUARDADO_BYTES_MAX bytes per key", () => {
  const g = memoria(), basura: Record<string, string> = {};
  for (let i = 0; i < 200; i++) basura[`viejo.cosa${i}`] = "x".repeat(100);
  g.datos.set(CLAVE_GUARDADO, JSON.stringify({ v: 1, valores: basura }));
  const a = registro(escritorio(), g);
  a.set("graficos.resolucion", 60);
  const t = g.datos.get(CLAVE_GUARDADO)!, v = JSON.parse(t).valores;
  assert.ok(t.length <= GUARDADO_BYTES_MAX && Object.keys(v).length <= GUARDADOS_MAX, `${t.length} bytes, ${Object.keys(v).length} values`);
  assert.equal(v["graficos.resolucion"], 60, "what the person chose survives the trim");
});

test("a URL forcing (?bateria) wins for this load only; the person's change wins after", () => {
  const g = memoria();
  const a = registro(escritorio(), g);
  a.set("graficos.bateria", false);
  a.forzar("graficos.bateria", true);
  assert.equal(a.get("graficos.bateria"), true);
  assert.equal(registro(escritorio(), g).get("graficos.bateria"), false, "not kept");
  a.set("graficos.bateria", false);
  assert.equal(a.get("graficos.bateria"), false);
});

test("quality is a preset: it sets the environment's four settings; Automática gives them back to the device", () => {
  const a = registro({ ...escritorio(), "entorno.sombras": true, "entorno.agua": true, "entorno.particulas": true, "entorno.hdr": true });
  const vistos: Record<string, unknown> = {};
  a.alAplicar("graficos.sombras", (v) => { vistos.sombras = v; });
  a.set("graficos.calidad", "baja");
  assert.equal(a.get("graficos.sombras"), "no"); assert.equal(a.get("graficos.hdr"), false); assert.equal(vistos.sombras, "no");
  a.set("graficos.sombras", "alta"); // one by one after a preset
  assert.equal(a.get("graficos.sombras"), "alta");
  a.set("graficos.calidad", "auto");
  assert.equal(a.get("graficos.sombras"), "media"); assert.equal(a.get("graficos.hdr"), true);
});

test("an apply function that throws is logged once and never breaks the others", () => {
  const log: string[] = [];
  const a = crearAjustes({ capacidades: crearCapacidades(escritorio()), registro: (l) => log.push(l) });
  a.declarar(AJUSTES_MOTOR);
  let ok = 0;
  a.alAplicar("interfaz.ayuda", () => { throw new Error("roto"); });
  a.alAplicar("interfaz.ayuda", () => { ok++; });
  a.set("interfaz.ayuda", false); a.set("interfaz.ayuda", true);
  assert.equal(ok, 2); assert.equal(log.filter((l) => l.includes("roto")).length, 1);
});

test("a feature declares its own settings: validated by defineFeature, in its own group, kept per world", () => {
  const ok = defineFeature({ id: "linterna", version: 1, describe: "Una linterna.", ajustes: [{ id: "brillo", tipo: "numero", min: 0, max: 100, paso: 10, unidad: "%", nombre: "Brillo", describe: "Lo fuerte que alumbra.", defecto: 50 }] });
  assert.deepEqual(ok.issues, []);
  const mal = defineFeature({ id: "linterna", version: 1, describe: "Una linterna.", ajustes: [{ id: "brillo", tipo: "numero", min: 0, max: 100, paso: 10, nombre: "Brillo", describe: "", defecto: 500, grupo: "graficos" } as AjusteDecl] });
  assert.deepEqual(mal.issues.map((i) => i.path), ["linterna.ajustes.brillo.describe", "linterna.ajustes.brillo.grupo"]);
  const demasiados = defineFeature({ id: "linterna", version: 1, describe: "x", ajustes: Array.from({ length: AJUSTES_POR_FUNCION_MAX + 1 }, (_, i) => ({ id: `a${i}`, tipo: "bool" as const, nombre: "A", describe: "a", defecto: true })) });
  assert.equal(demasiados.issues[0].path, "linterna.ajustes");
  assert.deepEqual(despertar.issues, [], "the R1 adventure declares one (despertar.columna)");
  const g = memoria();
  const a = registro(escritorio(), g);
  assert.deepEqual(a.declarar(ok.ajustes!, { de: "funcion", id: "linterna" }), []);
  assert.equal(a.get("linterna.brillo"), 50);
  assert.equal(a.declarar(mal.ajustes!, { de: "funcion", id: "linterna" }).length, 2, "a bad one is refused with its paths");
  const grupo = a.grupos().find((x) => x.id === "linterna")!;
  assert.equal(grupo.nombre, "Linterna"); assert.equal(grupo.origen, "funcion:linterna");
  a.set("linterna.brillo", 80);
  assert.deepEqual(JSON.parse(g.datos.get(`${CLAVE_GUARDADO}.plaza`)!).valores, { "linterna.brillo": 80 }, "per world");
  // loaded later (the feature arrives after the page read what was kept): the kept value is adopted on declare
  const b = registro(escritorio(), g);
  assert.equal(b.get("linterna.brillo"), undefined);
  b.declarar(ok.ajustes!, { de: "funcion", id: "linterna" });
  assert.equal(b.get("linterna.brillo"), 80);
});

test("a world's file changes defaults, hides engine settings and adds its own — all or nothing", () => {
  const a = registro(escritorio());
  const r = a.aplicarMundo({
    schema: ESQUEMA_MUNDO, mundo: "cueva", nombre: "La cueva",
    defectos: { "graficos.estadisticas": true, "graficos.resolucion": { valor: 100, nivel: { A: 80 } } },
    ocultar: ["graficos.agua"],
    ajustes: [{ id: "eco", tipo: "bool", nombre: "Eco", describe: "Las voces resuenan en la cueva.", defecto: true }],
  });
  assert.deepEqual(r, { ok: true, value: { defectos: 2, ajustes: 1, ocultos: 1 } });
  assert.equal(a.get("graficos.estadisticas"), true); assert.equal(a.get("graficos.resolucion"), 80); assert.equal(a.get("cueva.eco"), true);
  assert.deepEqual(a.lista().find((x) => x.id === "graficos.agua")!.falta, ["entorno.agua", "mundo:oculto"]);
  assert.equal(a.grupos().find((g) => g.id === "cueva")!.nombre, "La cueva");
  const b = registro(escritorio());
  const mal = b.aplicarMundo({ schema: ESQUEMA_MUNDO, mundo: "cueva", defectos: { "graficos.estadisticas": "sí", "graficos.nada": 1 }, ajustes: [{ id: "eco", tipo: "bool", nombre: "Eco", describe: "x", defecto: 3 }] });
  assert.equal(mal.ok, false);
  if (!mal.ok) assert.deepEqual(mal.issues.map((i) => i.path), ["ajustes.eco.defecto", "defectos.graficos.estadisticas", "defectos.graficos.nada"]);
  assert.equal(b.get("cueva.eco"), undefined, "nothing applied"); assert.equal(b.get("graficos.estadisticas"), false);
  assert.equal(b.aplicarMundo({ schema: "otro" }).ok, false);
});

test("the plaza's own file is valid", () => {
  const plaza = JSON.parse(readFileSync(new URL("../apps/plaza/mundo.ajustes.json", import.meta.url), "utf8"));
  const a = registro(escritorio());
  assert.equal(a.aplicarMundo(plaza).ok, true);
  assert.equal(a.get("graficos.estadisticas"), true, "the plaza is the engine's test bench: stats on");
});

test("power: quality caps the pixel ratio and the fps, resolution shrinks the ratio, battery still wins", () => {
  const desk = { coarsePointer: false, saveData: false, deviceMemoryGB: 16, dpr: 2 };
  const p = createPower(desk);
  assert.equal(p.pixelRatio(), 2); assert.equal(p.targetFps(true), 60);
  p.setCalidad("baja");
  assert.equal(p.pixelRatio(), CALIDADES.baja.ratio); assert.equal(p.targetFps(true), 30); assert.equal(p.targetFps(false), 12);
  p.setCalidad("media"); p.setResolucion(0.5);
  assert.equal(p.pixelRatio(), 0.75); assert.equal(p.stats.resolucion, 0.5); assert.equal(p.stats.calidad, "media");
  p.setResolucion(0.1);
  assert.equal(p.resolucion, 0.25, "never below a quarter");
  assert.equal(p.pixelRatio(), 0.5, "and the ratio never below 0.5");
  p.setResolucion(1); p.setBattery(true);
  assert.equal(p.pixelRatio(), 1); assert.equal(p.targetFps(true), 24);
  p.setCalidad("nada" as never);
  assert.equal(p.calidad, "auto");
});
