// U20: the density dial — the table of panels, the levels, the key's cycle, the setting in the N2 registry, and that the page's
// CSS and markup say what the table says. Pure and fast; the browser look is in the screenshots of the story (work/ux/b5-u20).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DENSIDADES, MARCOS_PLAZA, FUERA_DEL_DIAL, nivelDensidad, siguienteDensidad, visibleEn, seFunde, marcosVisibles, validarMarcos, esDensidad, SEGUNDOS_AL_CAMBIAR,
} from "../packages/client/src/densidad.ts";
import { crearAjustes, crearCapacidades, leerNavegador, AJUSTES_MOTOR, validarAjuste } from "../packages/client/src/ajustes.ts";
import type { Guardado } from "../packages/client/src/ajustes.ts";

const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const id = (m: string) => MARCOS_PLAZA.find((x) => x.id === m)!;

test("the table is well formed and every panel names its selector once", () => {
  assert.deepEqual(validarMarcos(MARCOS_PLAZA), []);
  const sel = MARCOS_PLAZA.map((m) => m.selector);
  assert.equal(new Set(sel).size, sel.length);
  assert.deepEqual(validarMarcos([{ id: "x", selector: "#x", densidad: "alto" as never, cuando: "nunca" as never, nombre: "x" }]).length, 2);
  assert.ok(validarMarcos([{ id: "y", selector: "#y", densidad: "normal", cuando: "bajo_demanda", nombre: "y" }])[0].includes("tecla"));
  assert.ok(validarMarcos([{ id: "z", selector: "#z", densidad: "normal", cuando: "siempre", segundos: 6, nombre: "z" }])[0].includes("al_cambiar"));
});

test("levels: Mínimo shows the «now» line, the notices, the contextual action and the folded chat — and nothing else", () => {
  assert.deepEqual(DENSIDADES, ["minimo", "normal", "completo"]);
  assert.deepEqual(marcosVisibles("minimo"), ["hud.ahora", "hud.avisos", "hud.accion", "hud.chat", "hud.chat.pastilla"]);
  const normal = marcosVisibles("normal"), completo = marcosVisibles("completo");
  for (const m of ["hud.barra", "hud.reloj", "hud.minimapa", "hud.misiones", "hud.acciones", "hud.chat.lineas"]) assert.ok(normal.includes(m), `${m} in Normal`);
  assert.ok(!normal.includes("hud.ayuda") && completo.includes("hud.ayuda"), "the key line is Completo's");
  assert.ok(normal.length > marcosVisibles("minimo").length && completo.length > normal.length, "each level shows at least what the one below shows");
  for (const n of ["minimo", "normal"] as const) for (const m of marcosVisibles(n)) assert.ok(marcosVisibles(DENSIDADES[DENSIDADES.indexOf(n) + 1]).includes(m), `${m} does not vanish going up`);
  assert.equal(visibleEn({ densidad: "normal", solo: ["completo"] }, "normal"), false, "`solo` wins over the ladder");
  assert.equal(visibleEn({ densidad: "normal", solo: ["completo"] }, "completo"), true);
});

test("what the dial does not govern: events, what you asked for, statistics and the screen-reader notices", () => {
  for (const f of ["#mision-completada", "#narrador", "#hud", "#libro", "#avisos", "#avisos-urgentes"]) assert.ok(FUERA_DEL_DIAL.includes(f), f);
  for (const m of MARCOS_PLAZA) assert.ok(!FUERA_DEL_DIAL.includes(m.selector), `${m.selector} is both in and out`);
});

test("the key cycles Mínimo → Normal → Completo → Mínimo; bad values fall back to Normal", () => {
  assert.equal(siguienteDensidad("minimo"), "normal"); assert.equal(siguienteDensidad("normal"), "completo"); assert.equal(siguienteDensidad("completo"), "minimo");
  assert.equal(nivelDensidad("completo"), "completo"); assert.equal(nivelDensidad("enorme"), "normal"); assert.equal(nivelDensidad(undefined), "normal");
  assert.ok(esDensidad("minimo") && !esDensidad("Minimo"));
});

test("al_cambiar fades after 6 s; «menos movimiento» and the full level keep it fixed", () => {
  const lineas = id("hud.chat.lineas");
  assert.equal(lineas.segundos, SEGUNDOS_AL_CAMBIAR); assert.equal(SEGUNDOS_AL_CAMBIAR, 6);
  assert.equal(seFunde(lineas, "normal", false), true);
  assert.equal(seFunde(lineas, "normal", true), false, "menos movimiento: no fade");
  assert.equal(seFunde(lineas, "completo", false), false, "the full chat stays");
  assert.equal(seFunde(id("hud.minimapa"), "normal", false), false, "siempre never fades");
});

test("the setting lives in N2: Interfaz group, three options, Normal by default, key U shown", () => {
  const d = AJUSTES_MOTOR.find((a) => a.grupo === "interfaz" && a.id === "densidad")!;
  assert.deepEqual(validarAjuste(d, "densidad"), []);
  assert.deepEqual(d.opciones!.map((o) => o.valor), [...DENSIDADES]);
  assert.deepEqual(d.opciones!.map((o) => o.nombre), ["Mínimo", "Normal", "Completo"]);
  assert.equal(d.nombre, "Densidad de interfaz"); assert.equal(d.defecto, "normal");
  const t = AJUSTES_MOTOR.find((a) => a.id === "teclaDensidad")!;
  assert.equal(t.defecto, "KeyU"); assert.equal(t.soloVer, true);
  const datos = new Map<string, string>(), guardado: Guardado = { leer: (k) => datos.get(k) ?? null, escribir: (k, v) => { datos.set(k, v); } };
  const a = crearAjustes({ capacidades: crearCapacidades(leerNavegador({})), guardado, mundo: "plaza" });
  assert.deepEqual(a.declarar(AJUSTES_MOTOR), []);
  assert.equal(a.get("interfaz.densidad"), "normal");
  const vistos: string[] = []; a.alAplicar("interfaz.densidad", (v) => vistos.push(String(v)));
  assert.equal(a.set("interfaz.densidad", "minimo").ok, true);
  assert.equal(a.set("interfaz.densidad", "enorme").ok, false, "a value outside the dial is refused");
  assert.equal(a.get("interfaz.densidad"), "minimo"); assert.deepEqual(vistos.slice(-1), ["minimo"]);
  const otro = crearAjustes({ capacidades: crearCapacidades(leerNavegador({})), guardado, mundo: "plaza" }); otro.declarar(AJUSTES_MOTOR);
  assert.equal(otro.get("interfaz.densidad"), "minimo", "kept on the device");
  a.restablecer("interfaz.densidad"); assert.equal(a.get("interfaz.densidad"), "normal");
});

test("the page says what the table says: CSS rules by attribute, the panels exist in the markup, key U free", () => {
  const css = leer("apps/plaza/tema.css"), html = leer("apps/plaza/index.html"), ts = leer("apps/plaza/densidad.ts");
  assert.ok(css.includes('html[data-densidad-nivel="minimo"] [data-densidad="normal"]') && css.includes('html[data-densidad-nivel="normal"] [data-densidad="completo"]'), "generic hiding by attribute");
  assert.ok(css.includes(".menos-movimiento") && css.includes("#chat-lista[data-cuando=\"al_cambiar\"]"), "the fade yields to «menos movimiento»");
  assert.ok(ts.includes('"KeyU"') && ts.includes("marcarPaneles"));
  for (const m of MARCOS_PLAZA) {
    if (m.selector === "#reloj" || m.selector === "#minimapa") continue; // built by code, or not built yet
    if (m.selector.startsWith("#")) assert.ok(html.includes(`id="${m.selector.slice(1)}"`), `${m.selector} is in index.html`);
  }
  assert.ok(leer("apps/plaza/mapa.ts").includes('mini.id = "minimapa"'), "the minimap the table names is built with that id");
  assert.equal([...leer("apps/plaza/main.ts").matchAll(/"KeyU"/g)].length, 0, "no other part of main.ts uses U");
});
