// U3 (minimum): frames as data — the boxes of the wireframe, the CSS made from the table, the clock, the notices' stack, the setting.
// Pure and fast; the look is in the screenshots of the story (work/ux/b6-u3/capturas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MARCOS_PLAZA, ANCLAS, ANCHO_MIN_MARCOS, ANCHO_COMPACTO, TOPE_AVISOS, AVISOS_MAX, SEGUNDOS_AL_CAMBIAR, apilarAviso, avisosVisibles, cajaDe, rectDe, cssMarcos, validarMarcos, marcosVisibles,
  formatoHora, etiquetaHora, modoHora, msHastaMinuto, MODOS_HORA, AJUSTES_MOTOR, validarAjuste, crearAjustes, crearCapacidades, leerNavegador,
} from "../packages/client/src/ajustes.ts";
import type { MarcoDensidad, Densidad, Guardado } from "../packages/client/src/ajustes.ts";

const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const marco = (id: string) => MARCOS_PLAZA.find((m) => m.id === id)!;
const rect = (id: string, n: Densidad = "normal", W = 1600, H = 900) => rectDe(cajaDe(marco(id), n)!, W, H);
const choca = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("the table stays valid with its boxes and glass; the new checks catch a bad box", () => {
  assert.deepEqual(validarMarcos(MARCOS_PLAZA), []);
  const base: MarcoDensidad = { id: "x", selector: "#x", densidad: "normal", cuando: "siempre", nombre: "x" };
  assert.equal(validarMarcos([{ ...base, caja: { ancla: "medio" as never, dx: 0, dy: 0 } }]).length, 1);
  assert.ok(validarMarcos([{ ...base, caja: { ancla: "abajo-centro", dx: 0, dy: 10 } }])[0].includes("ancho"), "a centred box needs its width");
  assert.equal(validarMarcos([{ ...base, caja: { ancla: "arriba-izquierda", dx: -4, dy: 0 } }]).length, 1);
  assert.ok(validarMarcos([{ ...base, cristal: 30 }])[0].includes("8 to 14"));
  assert.equal(validarMarcos([{ ...base, caja: { ancla: "arriba-derecha", dx: 16, dy: 62 }, cristal: 8 }]).length, 0);
});

test("the wireframe's boxes at 1600×900: «now» top left, map + clock top right, chat 440×150 bottom left, actions centred below", () => {
  assert.deepEqual(rect("hud.ahora"), { x: 16, y: 14, w: 480, h: 38 });
  assert.equal(cajaDe(marco("hud.reloj"), "normal")!.ancla, "arriba-derecha");
  assert.equal(cajaDe(marco("hud.minimapa"), "normal")!.dy, 94);
  assert.deepEqual(rect("hud.avisos"), { x: 580, y: 14, w: 440, h: 0 }, "notices: centred, 440 wide, at y = 14");
  assert.deepEqual(rect("hud.accion"), { x: 620, y: 734, w: 360, h: 54 });
  assert.deepEqual(rect("hud.acciones"), { x: 620, y: 804, w: 360, h: 80 });
  assert.equal(cajaDe(marco("hud.chat"), "normal")!.ancho, 440);
  assert.deepEqual(rectDe({ ...cajaDe(marco("hud.chat"), "normal")!, alto: 150 }, 1600, 900), { x: 16, y: 734, w: 440, h: 150 });
  assert.equal(cajaDe(marco("hud.misiones"), "normal")!.ancho, 292);
  assert.equal(cajaDe(marco("hud.ayuda"), "completo")!.ancho, 410);
});

test("no overlap at 1600×900 and at 1280×720 between the frames that show together at each level", () => {
  const conAlto: Record<string, number> = { "hud.reloj": 28, "hud.minimapa": 152 + 34, "hud.barra": 44, "hud.chat": 150, "hud.avisos": 38, "hud.ayuda": 100, "hud.objetivo": 92 };
  const conAncho: Record<string, number> = { "hud.reloj": 82, "hud.minimapa": 190, "hud.barra": 460 }; // what the content takes (no width in the table)
  for (const [W, H] of [[1600, 900], [1280, 720]] as const) for (const n of ["minimo", "normal", "completo"] as const) {
    const cajas = marcosVisibles(n).map((id) => [id, cajaDe(marco(id), n)] as const).filter(([, c]) => c).map(([id, c]) => {
      const compacta = W < ANCHO_COMPACTO, cc = cajaDe(marco(id), n, compacta)!;
      const caja = { ...cc, alto: cc.alto ?? conAlto[id] ?? 40, ancho: cc.ancho ?? conAncho[id] };
      if (id === "hud.chat" && n === "completo") caja.alto = 300;
      if (id === "hud.chat" && n === "minimo") caja.alto = 38;
      return [id, rectDe(caja, W, H)] as const;
    });
    for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
      assert.equal(choca(cajas[i][1], cajas[j][1]), false, `${W}×${H} ${n}: ${cajas[i][0]} and ${cajas[j][0]} overlap`);
    }
  }
});

test("cssMarcos: one rule per box, wide screens only, glass by table, plain at the lowest quality, no rule sets display (hidden still hides)", () => {
  const css = cssMarcos();
  assert.ok(css.startsWith(`@media (min-width:${ANCHO_MIN_MARCOS}px){`));
  for (const m of MARCOS_PLAZA.filter((x) => x.caja)) assert.ok(css.includes(`html[data-densidad-nivel] body ${m.selector}{position:fixed`), `${m.id} placed`);
  assert.ok(css.includes("html[data-densidad-nivel] body #reloj{position:fixed !important;right:16px !important;left:auto !important;top:62px"));
  assert.ok(css.includes("left:calc(50% - 180px + 0px)"), "centred boxes use their width");
  for (const m of MARCOS_PLAZA.filter((x) => x.cristal)) {
    assert.ok(css.includes(`body ${m.selector}:not(:empty){background:rgba(30,26,23,.55) !important;`) && css.includes(`blur(${m.cristal}px)`), `${m.id} glass`);
    assert.ok(css.includes(`html[data-sin-cristal][data-densidad-nivel] body ${m.selector}:not(:empty){-webkit-backdrop-filter:none`), `${m.id} plain at «Baja»`);
  }
  assert.ok(!/display\s*:/.test(css), "visibility is the dial's and the hidden attribute's");
  const opac = [...css.matchAll(/rgba\(30,26,23,\.(\d+)\)/g)].map((x) => Number(`0.${x[1]}`));
  assert.ok(opac.length > 0 && opac.every((o) => o >= 0.5 && o <= 0.55), "glass opacity 50–55 %");
  for (const m of MARCOS_PLAZA) assert.ok(!m.cristal || (m.cristal >= 8 && m.cristal <= 14), "blur 8–14 px");
  assert.ok(marco("hud.reloj").cristal === 8 && marco("hud.ayuda").cristal! >= 12);
  assert.ok(css.includes(`@media (min-width:900px) and (max-width:1599px){\nhtml[data-densidad-nivel] body #avisos-pila{position:fixed !important;left:calc(50% - 220px + 0px) !important;right:auto !important;top:60px`), "narrow screens: the notices drop under the «now» line");
  // a level that changes a box gets its own rule after the base
  const conNivel: MarcoDensidad = { id: "t.caja", selector: "#t", densidad: "normal", cuando: "siempre", nombre: "t", caja: { ancla: "abajo-izquierda", dx: 16, dy: 16, ancho: 440 }, cajaEn: { completo: { alto: 300 } } };
  const c2 = cssMarcos([conNivel]);
  assert.ok(c2.indexOf('html[data-densidad-nivel="completo"] body #t{') > c2.indexOf("html[data-densidad-nivel] body #t{") && c2.includes("height:300px"));
});

test("the clock: «Normal», 8 px glass, HH:MM local or «HH:MM UTC», once a minute", () => {
  const r = marco("hud.reloj");
  assert.equal(r.densidad, "normal"); assert.equal(r.cuando, "siempre");
  assert.ok(!marcosVisibles("minimo").includes("hud.reloj") && marcosVisibles("normal").includes("hud.reloj") && marcosVisibles("completo").includes("hud.reloj"));
  const t = Date.UTC(2026, 9, 18, 22, 14, 59);
  assert.equal(formatoHora(t, "utc"), "22:14 UTC");
  const d = new Date(t); assert.equal(formatoHora(t, "local"), `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  assert.equal(formatoHora(Date.UTC(2026, 0, 1, 3, 5), "utc"), "03:05 UTC", "zero padded");
  assert.deepEqual([modoHora("utc"), modoHora("local"), modoHora("x"), modoHora(undefined)], ["utc", "local", "local", "local"]);
  assert.ok(etiquetaHora("utc").includes("UTC") && etiquetaHora("local").includes("local"));
  assert.equal(msHastaMinuto(Date.UTC(2026, 9, 18, 22, 14, 59, 0)), 1050);
  assert.ok(msHastaMinuto(60000 * 7) > 59000 && msHastaMinuto(60000 * 7) <= 60050);
  assert.ok(msHastaMinuto(60000 * 7 + 59999) >= 1000, "never a spinning timer");
});

test("the setting «Hora del reloj»: Interfaz group, Local or UTC, Local by default, kept on the device", () => {
  const d = AJUSTES_MOTOR.find((a) => a.grupo === "interfaz" && a.id === "hora")!;
  assert.deepEqual(validarAjuste(d, "hora"), []);
  assert.deepEqual(d.opciones!.map((o) => o.valor), [...MODOS_HORA]); assert.equal(d.defecto, "local");
  const datos = new Map<string, string>(), guardado: Guardado = { leer: (k) => datos.get(k) ?? null, escribir: (k, v) => { datos.set(k, v); } };
  const a = crearAjustes({ capacidades: crearCapacidades(leerNavegador({})), guardado, mundo: "plaza" });
  assert.deepEqual(a.declarar(AJUSTES_MOTOR), []);
  assert.equal(a.get("interfaz.hora"), "local");
  assert.equal(a.set("interfaz.hora", "utc").ok, true); assert.equal(a.set("interfaz.hora", "marte").ok, false);
});

test("the notices' stack: ≤ 3, 6 s, a repeat renews, Mínimo and Normal show the newest, Completo the stack", () => {
  assert.equal(SEGUNDOS_AL_CAMBIAR, 6); assert.equal(marco("hud.avisos").segundos, 6); assert.equal(marco("hud.avisos").cuando, "al_cambiar");
  let p = apilarAviso([], "uno", 0); p = apilarAviso(p, "dos", 1000); p = apilarAviso(p, "tres", 2000); p = apilarAviso(p, "cuatro", 3000);
  assert.deepEqual(p.map((a) => a.texto), ["dos", "tres", "cuatro"], "at most three; the oldest leaves");
  assert.equal(p.length <= AVISOS_MAX, true);
  assert.deepEqual(avisosVisibles(p, 3500, "completo").map((a) => a.texto), ["dos", "tres", "cuatro"]);
  assert.deepEqual(avisosVisibles(p, 3500, "normal").map((a) => a.texto), ["cuatro"]);
  assert.deepEqual(avisosVisibles(p, 3500, "minimo").map((a) => a.texto), ["cuatro"]);
  assert.deepEqual(avisosVisibles(p, 7500, "completo").map((a) => a.texto), ["tres", "cuatro"], "«dos» (until 7000) is gone at 6 s; the others are still alive");
  assert.deepEqual(avisosVisibles(p, 9100, "completo"), [], "everything gone after 6 s");
  const r = apilarAviso(p, "cuatro", 5000); assert.equal(r.length, 3); assert.equal(r[2].hasta, 11000, "a repeat only renews the newest");
  assert.deepEqual(apilarAviso([], "   ", 0), [], "an empty notice is nothing");
  assert.deepEqual(TOPE_AVISOS, { minimo: 1, normal: 1, completo: 3 });
});

test("the page carries what the table names: #reloj and #avisos-pila in the markup, the pieces mounted, no brand, fog untouched", () => {
  const html = leer("apps/plaza/index.html"), css = leer("apps/plaza/tema.css"), marcos = leer("apps/plaza/marcos.ts"), ajustes = leer("apps/plaza/menu-ajustes.ts");
  assert.ok(html.includes('id="reloj"') && html.includes('id="reloj-hora"') && html.includes('id="avisos-pila"'));
  assert.ok(html.includes('id="avisos-pila" aria-hidden="true"'), "the sighted twin is hidden from screen readers (#avisos already speaks)");
  assert.ok(marcos.includes("cssMarcos") && marcos.includes("data-sin-cristal") && marcos.includes("montarReloj") && marcos.includes("montarAvisos"));
  assert.ok(marcos.includes('"baja"') && marcos.includes("graficos.bateria"), "glass off at Baja quality and in battery mode");
  assert.ok(ajustes.includes("montarMarcos(a)") && !ajustes.includes("montarDensidad(a)"));
  assert.ok(css.includes("#avisos-pila") && css.includes("min-width: 900px"));
  assert.ok(!/numinia|escarabajo/i.test(html.slice(html.indexOf('id="reloj"'), html.indexOf('id="reloj"') + 600)), "no brand in the new markup");
  assert.ok(!/fog|niebla/i.test(css.slice(css.indexOf("U3 (minimum)"))) && !leer("apps/plaza/marcos.ts").match(/fog|niebla/i), "the fog is not touched");
  assert.ok(leer("apps/plaza/paneles.ts").includes("alAnunciar"), "anunciar feeds the stack");
  assert.ok(leer("apps/plaza/mapa.ts").includes("pointer: coarse") && leer("apps/plaza/mapa.ts").includes("U3: on a mouse screen"), "the map's touch nudge does not move it on a mouse screen");
});

test("the key help reads on a light floor: its colour comes with the glass, not the old dark ink on the sky", () => {
  const css = cssMarcos(), ayuda = marco("hud.ayuda");
  assert.equal(ayuda.densidad, "completo");
  assert.ok(css.includes("body #help:not(:empty){background:rgba(30,26,23,.55) !important;") && css.includes("color:var(--n-texto) !important"));
  assert.ok(css.includes("html.alto-contraste[data-densidad-nivel] body #help"), "high contrast: black on white edge, no glass");
});

test("M5: Objetivo and Habilidades are frames of the table (movable and hideable), Normal and up, with their elements in the page", async () => {
  for (const [id, sel] of [["hud.objetivo", "#objetivo"], ["hud.habilidades", "#habilidades"]]) {
    const m = marco(id);
    assert.equal(m.selector, sel); assert.ok(m.caja && m.densidad === "normal");
    assert.ok(leer("apps/plaza/index.html").includes(`id="${sel.slice(1)}"`), `${sel} in the page`);
  }
  const { porcentaje } = await import("../apps/plaza/objetivo.ts");
  assert.deepEqual([porcentaje(38, 100), porcentaje(-5, 100), porcentaje(500, 100), porcentaje(3, 0)], [38, 0, 100, 0]);
});
