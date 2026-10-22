// condiciones/c4: the entry bubble in VR without a browser — the paging of the text, the zones a ray/pinch/fingertip hits, the stick,
// where the panel stands, the bubble's fade/burst, and that the VR view is built from the SAME logic as the flat one.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CondicionesCapa } from "../packages/net/src/index.ts";
import { botonesDePie, marcasVacias, planificar, puedeSeguir } from "../apps/plaza/condiciones-logica.ts";
import type { Paso } from "../apps/plaza/condiciones-logica.ts";
import { crearPaginador, eyebrow, lineasDe, modelo, notaDePaginas, paginasDePaso, trocearBloques } from "../apps/plaza/condiciones-vr-logica.ts";
import {
  ALTO_M, anchoTexto, ARRASTRE, arrastreInicio, arrastrePaso, BARRA, haciaOjoGrados, ID_BARRA, limitarPanel, type EntradaMano, BOTON_H, BURBUJA, CASILLAS_PAGINA, colocarPanel, debeSeguir, desvioGrados, disposicion, ESTILOS, estallidoBurbuja, ID_NORMA, ID_PAG_ANT, ID_PAG_SIG, idBoton,
  idDato, LIENZO, LINEAS_PAGINA, metrosAPx, miradaPaso, palancasDelPanel, opacidadBurbuja, opacidadPanelEstallando, PALANCA, palancaPagina, paginaTras, PANEL, PX_POR_M, rectsBotones, RECOLOCAR,
  toqueInicio, toquePaso, TOQUE, uvAPx, zonaDe,
} from "../packages/render/src/condiciones-vr-geom.ts";

// a fake ruler: 20 px a letter (the real one is the canvas's), so paging is testable without a browser
const medir = (t: string): number => t.length * 20;
const pt = (id: string, titulo: string, texto: string, obligatorio: boolean, tipo: "norma" | "datos" = "norma") => ({ id, titulo, texto, obligatorio, tipo });
const largo = "Esto es un párrafo bastante largo para que el texto entero ocupe varias páginas del panel en el visor. ".repeat(6);
const capas: CondicionesCapa[] = [
  { capa: "casa", version: "1", puntos: [pt("uso", "Respeto y buen trato", largo, true), pt("edad", "Edad mínima", "Tienes 14 años o más.", true), pt("voz", "Voz por cercanía", "Solo se oye a quien está cerca.", true), pt("mod", "Moderación", "Hay normas.", true), pt("otra", "Una más", "x", true), pt("sexta", "Sexta norma", "x", false)] as never },
  { capa: "comunidad", nombre: "La Plaza", version: "2", puntos: [pt("n", "Cuida la plaza", "Texto.", true), pt("d1", "Foto de perfil", "Guardamos tu foto para que otros te vean.", false, "datos"), pt("d2", "Mensajes", "Guardamos tus mensajes siete días.", false, "datos"), pt("d3", "Estadísticas", "Contamos cuánto juegas.", false, "datos")] as never },
] as never;

test("a line is wrapped to the panel's width; the first line of a point carries its number", () => {
  const l = lineasDe("Respeto y buen trato entre todas las personas que entran en este sitio", "punto", medir, "1");
  assert.ok(l.length > 1); assert.equal(l[0].chip, "1"); assert.equal(l[0].estilo, "punto"); assert.ok(l.slice(1).every((x) => x.estilo === "cont" && !x.chip));
  assert.ok(l.every((x) => medir(x.texto) <= anchoTexto(x.estilo)));
});

test("blocks stay together on a page when they fit, are split by lines when they don't", () => {
  const b = (n: number) => Array.from({ length: n }, (_, k) => ({ texto: `l${k}`, estilo: "cuerpo" as const }));
  assert.deepEqual(trocearBloques([b(3), b(3), b(3)], 7).map((p) => p.length), [6, 3]);
  assert.deepEqual(trocearBloques([b(10)], 7).map((p) => p.length), [7, 3]);
  assert.deepEqual(trocearBloques([b(2), b(10), b(2)], 7).map((p) => p.length), [2, 7, 3, 2]);
  assert.deepEqual(trocearBloques([], 7), []);
});

test("every page holds at most LINEAS_PAGINA lines and every line fits the width", () => {
  const pasos = planificar(capas);
  for (const p of pasos) for (const pg of paginasDePaso(p, medir)) {
    assert.ok(pg.lineas.length <= LINEAS_PAGINA, `${pg.lineas.length} lines`);
    for (const l of pg.lineas) assert.ok(medir(l.texto) <= anchoTexto(l.estilo) || !l.texto.includes(" "), l.texto);
    assert.ok(pg.lineas.length === 0 || pg.lineas[0].estilo !== "hueco", "a page never starts with a blank line");
  }
});

test("a norms step: the essentials first (a few per page), then the whole text; the caption says how many pages of text follow", () => {
  const casa = planificar(capas)[0], pgs = paginasDePaso(casa, medir);
  assert.ok(pgs.length >= 3, "essentials + at least 2 of text");
  const texto = pgs.findIndex((x) => x.textoEntero);
  assert.ok(texto >= 1, "the whole text begins after the essentials");
  assert.deepEqual(pgs.slice(0, texto).flatMap((x) => x.lineas.filter((l) => l.chip).map((l) => l.chip)), ["1", "2", "3", "4", "5", "6"].slice(0, 6));
  assert.match(notaDePaginas(pgs, 0), /^Texto entero: \d+ páginas? más$/);
  assert.equal(notaDePaginas(pgs, texto), `Página ${texto + 1} de ${pgs.length}`);
  assert.equal(notaDePaginas([pgs[0]], 0), "", "a single page needs no caption");
});

test("«Tus datos»: CASILLAS_PAGINA boxes per page, none lost, none repeated, every one EMPTY", () => {
  const pasos = planificar(capas), datos = pasos.find((p) => p.tipo === "datos")!;
  assert.ok(datos.tipo === "datos" && datos.permisos.length === 3);
  const pgs = paginasDePaso(datos, medir);
  assert.deepEqual(pgs.map((p) => p.datos), [[0, 1], [2]]);
  assert.ok(pgs.every((p) => p.datos.length <= CASILLAS_PAGINA && p.lineas.length === 0));
  const m = modelo({ pasos, i: pasos.length - 1, marcas: marcasVacias(), capas, mundo: "", pagina: 0, paginar: crearPaginador(medir), enviando: false, saliendo: false, aviso: "", salirPide: false });
  assert.ok(m && m.casillasDatos.length === 2 && m.casillasDatos.every((c) => c.marcada === false), "empty on entering");
});

test("the VR model is built from the flat logic: same buttons, same off-states, the two decisions equal", () => {
  const pasos = planificar(capas), marcas = marcasVacias(), paginar = crearPaginador(medir);
  for (let i = 0; i < pasos.length; i++) for (const m2 of [marcas, { normas: { casa: true, comunidad: true }, datos: new Set(["d1"]) }]) {
    const vm = modelo({ pasos, i, marcas: m2, capas, mundo: "Mundo", pagina: 0, paginar, enviando: false, saliendo: false, aviso: "", salirPide: false })!;
    const plano = botonesDePie(pasos, i, m2);
    assert.deepEqual(vm.botones.map((b) => [b.id, b.texto, b.prim, b.desactivado]), plano.map((b) => [b.id, b.texto, b.prim, b.desactivado]), `step ${i}`);
  }
  const last = modelo({ pasos, i: pasos.length - 1, marcas: { normas: { casa: true, comunidad: true }, datos: new Set() }, capas, mundo: "", pagina: 0, paginar, enviando: false, saliendo: false, aviso: "", salirPide: false })!;
  const dec = last.botones.filter((b) => b.id === "sin-opcional" || b.id === "todo");
  assert.equal(dec.length, 2); assert.equal(dec[0].prim, dec[1].prim); assert.equal(rectsBotones(last.botones).filter((_, k) => ["sin-opcional", "todo"].includes(last.botones[k].id)).map((r) => r.w).reduce((a, b) => (a === b ? a : -1)), 470, "same size");
  assert.ok(last.botones.some((b) => b.id === "salir"), "Salir is always there");
});

test("«Siguiente» waits for the mandatory box, on every page of the text; the box is always on screen", () => {
  const pasos = planificar(capas), paginar = crearPaginador(medir), n = paginar(pasos[0]).length;
  for (let pagina = 0; pagina < n; pagina++) {
    const vm = modelo({ pasos, i: 0, marcas: marcasVacias(), capas, mundo: "", pagina, paginar, enviando: false, saliendo: false, aviso: "", salirPide: false })!;
    assert.ok(vm.casillaNormas && vm.casillaNormas.marcada === false && vm.casillaNormas.obligatoria, `page ${pagina}`);
    assert.equal(vm.botones.find((b) => b.id === "siguiente")!.desactivado, true);
    assert.equal(puedeSeguir(pasos[0], marcasVacias()), false);
  }
  const ok = modelo({ pasos, i: 0, marcas: { normas: { casa: true }, datos: new Set() }, capas, mundo: "", pagina: n - 1, paginar, enviando: false, saliendo: false, aviso: "", salirPide: false })!;
  assert.equal(ok.botones.find((b) => b.id === "siguiente")!.desactivado, false);
});

test("sending locks everything; «Salir» asks again when the view says so", () => {
  const pasos = planificar(capas), paginar = crearPaginador(medir);
  const vm = modelo({ pasos, i: pasos.length - 1, marcas: { normas: { casa: true, comunidad: true }, datos: new Set() }, capas, mundo: "", pagina: 0, paginar, enviando: true, saliendo: false, aviso: "", salirPide: false })!;
  assert.ok(vm.botones.every((b) => b.desactivado));
  assert.ok(disposicion(vm).filter((z) => z.tipo === "dato" || z.tipo === "norma").every((z) => !z.activa));
  const s = modelo({ pasos, i: 0, marcas: marcasVacias(), capas, mundo: "", pagina: 0, paginar, enviando: false, saliendo: false, aviso: "", salirPide: true })!;
  assert.match(s.botones.find((b) => b.id === "salir")!.texto, /Otra vez/);
});

test("c6 (back after a change): only what changed, then its whole text", () => {
  const nuevas = JSON.parse(JSON.stringify(capas)) as CondicionesCapa[];
  (nuevas[1] as never as { cambios: unknown }).cambios = { desde: "1", nuevos: [], cambiados: ["n"], antes: { n: "Cuida la sala" }, quitados: [] };
  const pasos = planificar(nuevas, { versiones: { casa: "1" } } as never);
  const c = pasos.find((p) => p.tipo === "capa")!;
  const pgs = paginasDePaso(c, medir);
  assert.ok(pgs[0].lineas.some((l) => l.chip === "CAMBIADO")); assert.ok(pgs[0].lineas.some((l) => l.estilo === "antes" && l.texto.startsWith("Antes:")));
});

// ---------- geometry ----------
test("size: letters and buttons are big enough for a headset at 1.2 m (≥ 1.2° text, ≥ 3° buttons)", () => {
  const grados = (px: number) => ((px / PX_POR_M) / PANEL.distM) * (180 / Math.PI);
  for (const [k, e] of Object.entries(ESTILOS)) if (k !== "antes" && k !== "nota") assert.ok(grados(e.px) >= 1.2, `${k} ${grados(e.px).toFixed(2)}°`);
  assert.ok(grados(BOTON_H) >= 3, `button ${grados(BOTON_H).toFixed(2)}°`);
  assert.equal(PANEL.distM, 1.2); assert.equal(PANEL.anchoM, 1.2);
  assert.ok(Math.abs(ALTO_M - LIENZO.h / PX_POR_M) < 1e-9);
});

test("zones: the buttons fit the card and do not overlap; every zone is hit at its centre and nowhere else", () => {
  const pasos = planificar(capas), paginar = crearPaginador(medir);
  for (let i = 0; i < pasos.length; i++) {
    const vm = modelo({ pasos, i, marcas: { normas: { casa: true, comunidad: true }, datos: new Set() }, capas, mundo: "", pagina: 0, paginar, enviando: false, saliendo: false, aviso: "", salirPide: false })!;
    const zonas = disposicion(vm);
    for (let a = 0; a < zonas.length; a++) {
      const z = zonas[a];
      assert.ok(z.x >= 0 && z.x + z.w <= LIENZO.w && z.y >= 0 && z.y + z.h <= 1000, `inside the card: ${z.tipo}`);
      for (const y of zonas.slice(a + 1)) assert.ok(z.x + z.w <= y.x || y.x + y.w <= z.x || z.y + z.h <= y.y || y.y + y.h <= z.y, `${z.tipo} overlaps ${y.tipo} on step ${i}`);
      if (z.activa) assert.equal(zonaDe((z.x + z.w / 2) / LIENZO.w, 1 - (z.y + z.h / 2) / LIENZO.h, zonas), z.id);
    }
    assert.equal(zonaDe(0.001, 0.999, zonas), 0, "a corner hits nothing");
  }
});

test("an off button and an arrow with no page beyond hit nothing", () => {
  const pasos = planificar(capas), paginar = crearPaginador(medir);
  const vm = modelo({ pasos, i: 0, marcas: marcasVacias(), capas, mundo: "", pagina: 0, paginar, enviando: false, saliendo: false, aviso: "", salirPide: false })!;
  const zonas = disposicion(vm), sig = zonas.find((z) => z.boton === "siguiente")!;
  assert.equal(sig.activa, false); assert.equal(zonaDe((sig.x + 5) / LIENZO.w, 1 - (sig.y + 5) / LIENZO.h, zonas), 0);
  assert.equal(zonas.find((z) => z.id === ID_PAG_ANT)!.activa, false); assert.equal(zonas.find((z) => z.id === ID_PAG_SIG)!.activa, true);
  assert.ok(zonas.some((z) => z.id === ID_NORMA)); assert.equal(idBoton(0), 100); assert.equal(idDato(1), 21);
});

test("the stick turns one page per push and re-arms near the middle", () => {
  let st = { dir: 0, armado: true } as { dir: -1 | 0 | 1; armado: boolean };
  st = palancaPagina(0.9, st.armado); assert.equal(st.dir, 1);
  st = palancaPagina(0.95, st.armado); assert.equal(st.dir, 0, "held: no second page");
  st = palancaPagina(0.45, st.armado); assert.equal(st.armado, false, "between the thresholds it stays disarmed");
  st = palancaPagina(0.1, st.armado); assert.equal(st.armado, true);
  st = palancaPagina(-0.8, st.armado); assert.equal(st.dir, -1);
  assert.ok(PALANCA.suelta < PALANCA.empuja);
  assert.equal(paginaTras(0, -1, 3), 0); assert.equal(paginaTras(2, 1, 3), 2); assert.equal(paginaTras(1, 1, 3), 2); assert.equal(paginaTras(0, 1, 0), 0);
});

test("a fingertip: touches within reach press once, then must pull away; nothing in the air or far behind", () => {
  const pasos = planificar(capas), paginar = crearPaginador(medir);
  const vm = modelo({ pasos, i: 0, marcas: { normas: { casa: true }, datos: new Set() }, capas, mundo: "", pagina: 0, paginar, enviando: false, saliendo: false, aviso: "", salirPide: false })!;
  const zonas = disposicion(vm), sig = zonas.find((z) => z.boton === "siguiente")!;
  const cx = ((sig.x + sig.w / 2) / LIENZO.w - 0.5) * PANEL.anchoM, cy = (0.5 - (sig.y + sig.h / 2) / LIENZO.h) * ALTO_M;
  let e = toqueInicio(), r = toquePaso(e, { x: cx, y: cy, z: 0.2 }, zonas, 1000); assert.equal(r.id, 0, "20 cm away: nothing");
  r = toquePaso(r.estado, { x: cx, y: cy, z: 0.005 }, zonas, 1100); assert.equal(r.id, sig.id, "touching");
  r = toquePaso(r.estado, { x: cx, y: cy, z: 0.0 }, zonas, 1200); assert.equal(r.id, 0, "held on it: no repeat");
  r = toquePaso(r.estado, { x: cx, y: cy, z: 0.1 }, zonas, 1300); r = toquePaso(r.estado, { x: cx, y: cy, z: 0.005 }, zonas, 1300 + TOQUE.ms + 10); assert.equal(r.id, sig.id, "pulled away and back: again");
  r = toquePaso(toqueInicio(), { x: cx, y: cy, z: -0.1 }, zonas, 5000); assert.equal(r.id, 0, "10 cm behind it: not a touch");
  r = toquePaso(toqueInicio(), null, zonas, 5000); assert.equal(r.id, 0);
  const [px, py] = metrosAPx(cx, cy); assert.ok(Math.abs(px - (sig.x + sig.w / 2)) < 1e-6 && Math.abs(py - (sig.y + sig.h / 2)) < 1e-6);
  void e; void uvAPx;
});

test("placement: 1.2 m ahead along the gaze, just under eye height; looking away long enough brings it back, looking at it never does", () => {
  const ojo = { x: 3, y: 1.6, z: -2 }, p = colocarPanel(ojo, { x: 0, y: -0.3, z: -1 });
  assert.ok(Math.abs(Math.hypot(p.x - ojo.x, p.z - ojo.z) - 1.2) < 1e-9); assert.ok(Math.abs(p.y - (1.6 - PANEL.bajoM)) < 1e-9); assert.equal(p.z, -3.2);
  assert.deepEqual(colocarPanel(ojo, { x: 0, y: 1, z: 0 }), { x: 3, y: 1.6 - PANEL.bajoM, z: -3.2 }, "looking straight up: it picks a direction, never NaN");
  assert.equal(desvioGrados(ojo, { x: 0, y: 0, z: -1 }, p), 0); assert.ok(Math.abs(desvioGrados(ojo, { x: 0, y: 0, z: 1 }, p) - 180) < 1e-6);
  let m = miradaPaso({ desdeMs: null }, 10, 0); assert.equal(m.recolocar, false);
  m = miradaPaso(m.estado, 120, 1000); assert.equal(m.recolocar, false);
  m = miradaPaso(m.estado, 120, 1000 + RECOLOCAR.ms + 1); assert.equal(m.recolocar, true);
  m = miradaPaso({ desdeMs: 1000 }, 30, 9999); assert.equal(m.recolocar, false); assert.equal(m.estado.desdeMs, null, "a glance back resets the wait");
});

test("the bubble: never dark, fades in softly, bursts in a third of a second, follows only when you walk away", () => {
  assert.equal(opacidadBurbuja(0), 0); assert.ok(Math.abs(opacidadBurbuja(BURBUJA.entraMs) - BURBUJA.opacidad) < 1e-9);
  let prev = -1; for (let t = 0; t <= BURBUJA.entraMs; t += 50) { const o = opacidadBurbuja(t); assert.ok(o >= prev); prev = o; }
  assert.ok(BURBUJA.opacidad <= 0.2, "the world stays readable");
  assert.ok(opacidadBurbuja(50) < 0.02, "no sudden darkening on the first frames");
  const a = estallidoBurbuja(0), b = estallidoBurbuja(BURBUJA.estallidoMs);
  assert.equal(a.escala, 1); assert.equal(a.fin, false); assert.equal(b.opacidad, 0); assert.ok(b.fin && b.escala === BURBUJA.escalaFinal);
  assert.equal(opacidadPanelEstallando(0), 1); assert.equal(opacidadPanelEstallando(BURBUJA.estallidoMs), 0);
  assert.equal(debeSeguir({ x: 0, y: 0, z: 0 }, { x: 0.2, y: 1.6, z: 0.2 }), false); assert.equal(debeSeguir({ x: 0, y: 0, z: 0 }, { x: 1, y: 1.6, z: 0 }), true);
});

test("a step is a view, not a copy: no step of the flat logic is dropped or invented", () => {
  const pasos: Paso[] = planificar(capas);
  assert.deepEqual(pasos.map((p) => p.tipo), ["capa", "capa", "datos"]);
  const paginar = crearPaginador(medir);
  assert.equal(paginar(pasos[0]), paginar(pasos[0]), "pages are cached per step");
});

test("the small line is short: «Antes de entrar · 2 de 3 · La Plaza», and «La Plaza · v1.0 → v1.1» when someone is back", () => {
  const pasos = planificar(capas);
  assert.equal(eyebrow(pasos[1], "x", 1, 3), "Antes de entrar · 2 de 3 · La Plaza");
  assert.equal(eyebrow(pasos[2], "x", 2, 3), "Antes de entrar · 3 de 3");
  assert.equal(eyebrow(pasos[0], "x", 0, 1), "Antes de entrar · La casa");
  const vuelta = { ...pasos[1], cambios: { desde: "1", etiquetas: {}, antes: {}, quitados: [] } } as Paso;
  assert.equal(eyebrow(vuelta, "La Plaza · v1 → v2", 0, 2), "La Plaza · v1 → v2 · 1 de 2");
});

// ── c8: the panel is taken by its top bar and put where you want it ──
const OJO = { x: 0, y: 1.6, z: 0 }, PANEL_0 = { x: 0, y: 1.56, z: -1.2 };
const mano = (o: Partial<EntradaMano> = {}): EntradaMano => ({ lado: "der", gatillo: false, apuntaBarra: false, rayo: { origen: { x: 0.2, y: 1.2, z: -0.3 }, dir: { x: 0, y: 0, z: -1 } }, ...o });

test("the bar is the top strip of the card: always active, inside the card, hit at its middle, clear of every other zone", () => {
  const pasos = planificar(capas), paginar = crearPaginador(medir);
  const vm = modelo({ pasos, i: 0, marcas: marcasVacias(), capas, mundo: "", pagina: 0, paginar, enviando: true, saliendo: false, aviso: "", salirPide: false })!;
  const zonas = disposicion(vm), barra = zonas.find((z) => z.id === ID_BARRA)!;
  assert.equal(barra.tipo, "barra"); assert.equal(barra.activa, true, "also while sending: it may be moved any time");
  assert.equal(zonaDe(0.5, 1 - (BARRA.y + BARRA.h / 2) / LIENZO.h, zonas), ID_BARRA);
  assert.ok(BARRA.h / PX_POR_M / PANEL.distM * (180 / Math.PI) >= 3, "≥ 3° to hit it with a ray");
  assert.equal(zonas.filter((z) => z.id === ID_BARRA).length, 1);
});

test("a hand takes the panel only when its trigger goes DOWN with the ray on the bar", () => {
  let e = arrastreInicio();
  let r = arrastrePaso(e, [mano({ gatillo: false, apuntaBarra: true })], PANEL_0, OJO); e = r.estado;
  assert.equal(r.evento, null); assert.equal(e.lado, null);
  r = arrastrePaso(e, [mano({ gatillo: true, apuntaBarra: true })], PANEL_0, OJO);
  assert.equal(r.evento, "coge"); assert.equal(r.estado.lado, "der"); assert.equal(r.pos, null, "taking it does not move it");
  // pressing elsewhere and sliding onto the bar with the trigger held: nothing
  let f = arrastrePaso(arrastreInicio(), [mano({ gatillo: true, apuntaBarra: false })], PANEL_0, OJO).estado;
  f = arrastrePaso(f, [mano({ gatillo: true, apuntaBarra: true })], PANEL_0, OJO).estado;
  assert.equal(f.lado, null);
  // no ray (hand lost): nothing to take
  assert.equal(arrastrePaso(arrastreInicio(), [mano({ gatillo: true, apuntaBarra: true, rayo: null })], PANEL_0, OJO).evento, null);
});

test("while held it follows the ray at the distance it was taken and keeps the grab offset; letting go leaves it there", () => {
  const rayo0 = { origen: { x: 0, y: 1.3, z: -0.2 }, dir: { x: 0, y: 0.2, z: -1 } };
  let r = arrastrePaso(arrastreInicio(), [mano({ gatillo: true, apuntaBarra: true, rayo: rayo0 })], PANEL_0, OJO);
  const e = r.estado;
  // same ray: the panel does not jump
  r = arrastrePaso(e, [mano({ gatillo: true, rayo: rayo0 })], PANEL_0, OJO);
  assert.ok(Math.hypot(r.pos!.x - PANEL_0.x, r.pos!.y - PANEL_0.y, r.pos!.z - PANEL_0.z) < 1e-9, "no jump at the start");
  // the hand turns to the right: the panel goes right, about the same distance from the head
  const giro = { origen: rayo0.origen, dir: { x: 0.5, y: 0.2, z: -1 } };
  r = arrastrePaso(e, [mano({ gatillo: true, rayo: giro })], PANEL_0, OJO);
  assert.ok(r.pos!.x > 0.4, `moved right: ${JSON.stringify(r.pos)}`);
  const d = Math.hypot(r.pos!.x - OJO.x, r.pos!.z - OJO.z); assert.ok(d >= ARRASTRE.minM && d <= ARRASTRE.maxM);
  // trigger released: «suelta», the state is clean, no new position
  const fin = arrastrePaso(r.estado, [mano({ gatillo: false, rayo: giro })], r.pos!, OJO);
  assert.equal(fin.evento, "suelta"); assert.equal(fin.estado.lado, null); assert.equal(fin.pos, null);
  // the hand disappears: the same
  assert.equal(arrastrePaso(r.estado, [], r.pos!, OJO).evento, "suelta");
  // the other hand's trigger does not drive it
  assert.equal(arrastrePaso(r.estado, [mano({ lado: "izq", gatillo: true, rayo: giro }), mano({ gatillo: false })], r.pos!, OJO).evento, "suelta");
});

test("limits: always 0,6–2 m from the head (horizontally) and within a comfortable height, whatever the hand does", () => {
  for (const [x, z] of [[0, -9], [0, -0.05], [0.01, 0], [5, 5], [-3, 0.5], [0, -1.2]]) {
    const p = limitarPanel({ x, y: 1.6, z }, OJO), d = Math.hypot(p.x - OJO.x, p.z - OJO.z);
    assert.ok(d >= ARRASTRE.minM - 1e-9 && d <= ARRASTRE.maxM + 1e-9, `${x},${z} → ${d}`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
  }
  assert.equal(Math.hypot(...(["x", "z"] as const).map((k) => limitarPanel({ x: 0, y: 1.6, z: -9 }, OJO)[k] - OJO[k]) as [number, number]), 2);
  assert.ok(Math.abs(Math.hypot(limitarPanel({ x: 0, y: 1.6, z: -0.1 }, OJO).z) - 0.6) < 1e-9);
  assert.equal(limitarPanel({ x: 0, y: 9, z: -1.2 }, OJO).y, 1.6 + ARRASTRE.altoM);
  assert.equal(limitarPanel({ x: 0, y: -3, z: -1.2 }, OJO).y, 1.6 - ARRASTRE.bajoM);
  assert.deepEqual(limitarPanel({ x: 0.3, y: 1.5, z: -1.0 }, OJO), { x: 0.3, y: 1.5, z: -1.0 }, "inside the ring: unchanged");
  // dragging far away with a long ray is cut to 2 m
  const lejos = arrastrePaso(arrastrePaso(arrastreInicio(), [mano({ gatillo: true, apuntaBarra: true })], PANEL_0, OJO).estado, [mano({ gatillo: true, rayo: { origen: { x: 0.2, y: 1.2, z: -1.5 }, dir: { x: 0, y: 0, z: -1 } } })], PANEL_0, OJO);
  assert.ok(Math.abs(Math.hypot(lejos.pos!.x - OJO.x, lejos.pos!.z - OJO.z) - ARRASTRE.maxM) < 1e-9);
});

test("it ends facing the head: the front direction measured against the head is 0° when it looks at you", () => {
  assert.equal(haciaOjoGrados({ x: 0, y: 0, z: 1 }, { x: 0, y: 1.5, z: -1.2 }, OJO), 0);
  assert.ok(Math.abs(haciaOjoGrados({ x: 1, y: 0, z: 0 }, { x: 0, y: 1.5, z: -1.2 }, OJO) - 90) < 1e-9);
  assert.equal(haciaOjoGrados({ x: 0, y: 0, z: 0 }, { x: 0, y: 1.5, z: -1.2 }, OJO), 0, "degenerate: no NaN");
});

test("c9: the sticks are the panel's only while it is up and not bursting — accepting gives the world back at once", () => {
  assert.equal(palancasDelPanel(true, false, false), true, "panel up: the sticks turn pages");
  assert.equal(palancasDelPanel(false, false, true), true, "panel about to show: the sticks are already its");
  assert.equal(palancasDelPanel(true, true, false), false, "bursting (the server let you in): the stick moves you now, not when the burst ends");
  assert.equal(palancasDelPanel(false, false, false), false, "no panel: the world's");
});
