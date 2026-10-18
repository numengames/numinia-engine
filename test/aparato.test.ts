// U25: the device profile — ONE decision (packages/client/src/aparato.ts) that the whole page follows: auto reproduces
// the old rule (touch HUD = pointer: coarse), a forced class declares its capabilities, phone profiles on a desktop get a
// 390×844 frame, and forcing only works in development or with ?debug.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APARATOS, MARCOS, DECLARADAS, AJUSTE_APARATO, claseReal, decidirAparato, eleccionDesde, capacidadesDelPerfil, nivelDelPerfil, escalaMarco, direccionCon, leerReal } from "../packages/client/src/aparato.ts";
import { AJUSTES_MOTOR, CAPACIDADES, crearAjustes, crearCapacidades, cumple } from "../packages/client/src/ajustes.ts";

const pc = { punteroGrueso: false, raton: true, tactil: false, ancho: 1600, alto: 900, memoriaGB: 8 };
const telefono = { punteroGrueso: true, raton: false, tactil: true, ancho: 390, alto: 844, memoriaGB: 4 };

test("auto: the old rule — touch controls exactly when the pointer is coarse; nothing is framed", () => {
  const p = decidirAparato({ real: pc });
  assert.equal(p.clase, "escritorio"); assert.equal(p.tactil, false); assert.equal(p.forzado, false); assert.equal(p.marco, null);
  assert.equal(p.pantallaPequena, false); assert.equal(p.movil, false);
  const t = decidirAparato({ real: telefono });
  assert.equal(t.clase, "movil-vertical"); assert.equal(t.tactil, true); assert.equal(t.pantallaPequena, true); assert.equal(t.movil, true);
  assert.equal(claseReal({ ...telefono, ancho: 844, alto: 390 }), "movil-horizontal");
  // a touch laptop with a mouse keeps the desktop HUD, as before (pointer: fine)
  assert.equal(decidirAparato({ real: { ...pc, tactil: true } }).tactil, false);
  // power class follows render/power.ts isMobileClass: ≤ 4 GB is phone-class even with a mouse
  assert.equal(decidirAparato({ real: { ...pc, memoriaGB: 4 } }).movil, true);
  assert.equal(decidirAparato({ real: { ...pc, memoriaGB: 0 } }).movil, false, "0 = the browser does not say");
});

test("a forced class declares its capabilities, whatever the device says", () => {
  for (const c of APARATOS.filter((x) => x !== "auto")) {
    const p = decidirAparato({ eleccion: c, real: pc });
    assert.equal(p.clase, c); assert.equal(p.forzado, true);
    for (const [k, v] of Object.entries(DECLARADAS[c])) assert.equal(p[k as keyof typeof p], v, `${c}.${k}`);
  }
  const e = decidirAparato({ eleccion: "escritorio", real: telefono });
  assert.equal(e.tactil, false, "a phone forced to escritorio shows the desktop HUD");
  assert.equal(decidirAparato({ eleccion: "vr", real: pc }).vr, true);
  assert.equal(decidirAparato({ eleccion: "bogus" as never, real: pc }).forzado, false, "an unknown class is auto");
});

test("a phone profile on a desktop is framed at 390×844 (844×390 on its side); never inside the frame, never on a real phone", () => {
  assert.deepEqual(decidirAparato({ eleccion: "movil-vertical", real: pc }).marco, { ancho: 390, alto: 844 });
  assert.deepEqual(decidirAparato({ eleccion: "movil-horizontal", real: pc }).marco, MARCOS["movil-horizontal"]);
  assert.equal(decidirAparato({ eleccion: "movil-vertical", real: pc, enMarco: true }).marco, null, "the framed copy does not frame itself again");
  assert.equal(decidirAparato({ eleccion: "movil-horizontal", real: telefono }).marco, null, "a real phone just takes the profile");
  assert.equal(decidirAparato({ eleccion: "escritorio", real: pc }).marco, null);
  assert.equal(decidirAparato({ eleccion: "vr", real: pc }).marco, null);
});

test("forcing works only in development or with ?debug; the URL wins over the kept setting", () => {
  const kept = JSON.stringify({ v: 1, valores: { [AJUSTE_APARATO]: "movil-horizontal" } });
  assert.deepEqual(eleccionDesde({ url: null, guardado: null, desarrollo: true }), { eleccion: "auto", de: "auto" });
  assert.deepEqual(eleccionDesde({ url: "movil-vertical", guardado: kept, desarrollo: true }), { eleccion: "movil-vertical", de: "url" });
  assert.deepEqual(eleccionDesde({ url: null, guardado: kept, desarrollo: true }), { eleccion: "movil-horizontal", de: "ajuste" });
  assert.deepEqual(eleccionDesde({ url: "", guardado: kept, desarrollo: true }), { eleccion: "movil-horizontal", de: "ajuste" }, "?aparato= with no value: the setting");
  assert.deepEqual(eleccionDesde({ url: "auto", guardado: kept, desarrollo: true }), { eleccion: "auto", de: "url" }, "?aparato=auto beats a kept profile (the frame's «auto» link)");
  const fuera = eleccionDesde({ url: "movil-vertical", guardado: kept, desarrollo: false });
  assert.equal(fuera.eleccion, "auto", "a shared link never forces a profile on a built page");
  assert.match(fuera.aviso ?? "", /debug/);
  assert.equal(eleccionDesde({ url: null, guardado: kept, desarrollo: false }).eleccion, "auto", "a kept setting neither");
  const mal = eleccionDesde({ url: "tableta", guardado: null, desarrollo: true });
  assert.equal(mal.eleccion, "auto"); assert.match(mal.aviso ?? "", /movil-vertical/);
  assert.equal(eleccionDesde({ url: null, guardado: "{roto", desarrollo: true }).eleccion, "auto", "unreadable storage = auto, never a throw");
});

test("the capabilities registry hears the profile: class always, declared pointers and power only when forced", () => {
  const auto = capacidadesDelPerfil(decidirAparato({ real: pc }));
  assert.deepEqual(auto, { aparato: "escritorio", aparatoForzado: false, pantallaPequena: false, interfazTactil: false });
  const f = capacidadesDelPerfil(decidirAparato({ eleccion: "movil-vertical", real: pc }));
  assert.equal(f.tactil, true); assert.equal(f.punteroGrueso, true); assert.equal(f.raton, false); assert.equal(f.movil, true); assert.equal(f.aparato, "movil-vertical");
  for (const k of Object.keys(f)) assert.ok(CAPACIDADES[k], `capability '${k}' is described`);
  assert.ok(CAPACIDADES.desarrollo);
  assert.ok(cumple("aparato=movil-vertical", f) && cumple("pantallaPequena", f) && !cumple("!tactil", f), "settings' `requiere` can ask for it");
  // tier: a forced headset is B; a forced phone is C through the usual rule
  assert.equal(nivelDelPerfil(decidirAparato({ eleccion: "vr", real: pc })), "B");
  const vivas = crearCapacidades({ ...f });
  assert.equal(vivas.valores.nivel, "C");
});

test("the setting interfaz.aparato exists only where `desarrollo` holds", () => {
  const decl = AJUSTES_MOTOR.find((d) => `${d.grupo}.${d.id}` === AJUSTE_APARATO);
  assert.ok(decl); assert.deepEqual(decl!.requiere, ["desarrollo"]);
  assert.deepEqual(decl!.opciones!.map((o) => o.valor), [...APARATOS]);
  const ver = (desarrollo: boolean) => {
    const a = crearAjustes({ capacidades: crearCapacidades({ desarrollo }) });
    a.declarar(AJUSTES_MOTOR);
    return a.lista().find((v) => v.id === AJUSTE_APARATO)!;
  };
  assert.equal(ver(false).visible, false);
  assert.equal(ver(true).visible, true);
  assert.equal(ver(true).valor, "auto");
});

test("the frame fits the window (never above 1:1) and its address keeps the other parameters", () => {
  assert.equal(escalaMarco(MARCOS["movil-vertical"], { ancho: 1600, alto: 900 }), Math.round(((900 - 72) / 844) * 1000) / 1000);
  assert.equal(escalaMarco(MARCOS["movil-vertical"], { ancho: 2560, alto: 1440 }), 1);
  assert.equal(escalaMarco(MARCOS["movil-horizontal"], { ancho: 1600, alto: 900 }), 1);
  const dentro = new URL(direccionCon("http://h:5173/?webgl2&server=ws://h:8790&aparato=movil-vertical", "movil-vertical", true));
  assert.equal(dentro.searchParams.get("marco"), "dentro"); assert.equal(dentro.searchParams.get("server"), "ws://h:8790"); assert.ok(dentro.searchParams.has("webgl2"));
  const fuera = new URL(direccionCon(dentro.toString(), null, false));
  assert.equal(fuera.searchParams.has("aparato"), false); assert.equal(fuera.searchParams.has("marco"), false);
});

test("leerReal reads a fake browser without throwing", () => {
  const r = leerReal({ matchMedia: (q) => ({ matches: q === "(pointer: coarse)" }), innerWidth: 844, innerHeight: 390, navigator: { maxTouchPoints: 5, deviceMemory: 4 } });
  assert.deepEqual(r, { punteroGrueso: true, raton: false, tactil: true, ancho: 844, alto: 390, memoriaGB: 4 });
  assert.equal(decidirAparato({ real: r }).clase, "movil-horizontal");
  assert.deepEqual(leerReal({ matchMedia: () => { throw new Error("old"); } }), { punteroGrueso: false, raton: false, tactil: false, ancho: 0, alto: 0, memoriaGB: 0 });
});

test("render/power.ts: a forced class sets the power policy's device class (phone: 30 fps cap; desktop: 60)", async () => {
  const { conClase, createPower } = await import("../packages/render/src/power.ts");
  const escritorio = { coarsePointer: false, saveData: false, deviceMemoryGB: 8, dpr: 1 };
  assert.equal(conClase(escritorio, undefined), escritorio, "undefined = as read");
  assert.equal(createPower(conClase(escritorio, true)).mobile, true);
  assert.equal(createPower(conClase({ ...escritorio, coarsePointer: true, deviceMemoryGB: 2 }, false)).mobile, false);
});
