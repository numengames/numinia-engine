// C3 + C4: the object card — when it shows, what it says, the link to the place, its tabs and the wires of an object.
// (The DOM is covered by the e2e leg.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarAccionVR, COLUMNAS_FICHA_MOVIL, datosFicha, enlaceDeObjeto, ETIQUETAS_FICHA, FACTOR_MAS_VR, FACTOR_MENOS_VR, fichaVisible, LARGA_MS, logicaDeObjeto, PASO_GIRO_VR, PESTANAS, pestanaConTecla, seleccionarAlIr } from "../apps/plaza/ficha-objeto.ts";
import type { AccionVR } from "../apps/plaza/ficha-objeto.ts";
import { celdaEn, celdasFicha, CH, COLS, CW, FICHA_H, FICHA_W, GAP, X0, Y0 } from "../packages/render/src/vr-ficha.ts";
import { leerSitio } from "../apps/plaza/foto-nucleo.ts";

test("the card shows only for someone who may build, with the builder open and an object selected", () => {
  for (const puede of [false, true]) for (const abierto of [false, true]) for (const sel of ["", "o1"]) {
    assert.equal(fichaVisible(puede, abierto, sel), puede && abierto && sel !== "", `${puede} ${abierto} ${sel}`);
  }
});

test("«Ir» selects the object only when building is allowed, the builder is open and the object exists", () => {
  assert.equal(seleccionarAlIr(true, true, true), true);
  assert.equal(seleccionarAlIr(false, true, true), false);
  assert.equal(seleccionarAlIr(true, false, true), false);
  assert.equal(seleccionarAlIr(true, true, false), false);
});

test("the card says name, type and the facts the model carries — never a maker it does not have", () => {
  const d = datosFicha({ id: "o1", nombre: "Mesa", tipo: "sonido", x: 3.04, y: 0, z: -2, sx: 1, sy: 1, sz: 1, fijado: true });
  assert.equal(d.titulo, "Mesa");
  assert.equal(d.tipo, "Zona de sonido");
  assert.deepEqual(d.hechos, [["Posición", "x 3 · z -2"], ["Escala", "1"], ["Estado", "anclado"]]);
  assert.ok(!d.hechos.some(([k]) => /hecho|autor/i.test(k)));
  const e = datosFicha({ id: "o2", sx: 1, sy: 2, sz: 1 });
  assert.equal(e.titulo, "(decorado)");
  assert.equal(e.tipo, "Modelo");
  assert.deepEqual(e.hechos, [["Escala", "1 × 2 × 1"], ["Estado", "suelto"]]); // no x/z in the model: no position line
});

test("the link to an object is a #foto= place the photo mode can read back", () => {
  const url = enlaceDeObjeto({ origin: "https://x.test", pathname: "/", search: "?server=ws://a" }, { id: "o1", x: 4, y: 0, z: 5, sx: 1, sy: 2, sz: 1 });
  assert.ok(url?.startsWith("https://x.test/?server=ws://a#foto="));
  const sitio = leerSitio(url!.split("#foto=")[1]);
  assert.ok(sitio);
  assert.equal(sitio!.x, 4); assert.equal(sitio!.z, 5); assert.equal(sitio!.y, 1);
  assert.equal(enlaceDeObjeto({ origin: "https://x.test", pathname: "/", search: "" }, { id: "o3" }), null);
});

test("C4: the tabs are Ficha, Lógica and Ajustes; ←/→ wrap around, Home/End jump, other keys do nothing", () => {
  assert.deepEqual(PESTANAS.map(([id]) => id), ["ficha", "logica", "ajustes"]);
  assert.equal(pestanaConTecla("ficha", "ArrowRight"), "logica");
  assert.equal(pestanaConTecla("ajustes", "ArrowRight"), "ficha");
  assert.equal(pestanaConTecla("ficha", "ArrowLeft"), "ajustes");
  assert.equal(pestanaConTecla("logica", "ArrowLeft"), "ficha");
  assert.equal(pestanaConTecla("logica", "Home"), "ficha");
  assert.equal(pestanaConTecla("logica", "End"), "ajustes");
  for (const k of ["Enter", " ", "a", "ArrowUp", "Escape", "Tab"]) assert.equal(pestanaConTecla("logica", k), null, k);
});

test("C4: the wires of an object — who shows or hides it (by id or name), what stands at it, locks and counters at the same spot", () => {
  const mesa = { id: "o7", nombre: "Mesa", x: 10, y: 0, z: 10 };
  const w = {
    disparadores: [
      { id: "d1", nombre: "Palanca", tipo: "boton", x: 40, z: 40, receptores: [{ accion: "muestra", objeto: "o7" }, { accion: "suena", sonido: "campana" }] },
      { id: "d2", nombre: "Umbral", tipo: "zona", x: 30, z: 30, receptores: [{ accion: "oculta", objeto: "Mesa" }, { accion: "muestra", objeto: "otra" }] },
      { id: "d3", nombre: "Alfombra", tipo: "zona", x: 10.5, z: 9.5, receptores: [{ accion: "mueve", objeto: "o7" }, { accion: "da_paso" }] },
      { id: "d4", nombre: "Vacío", tipo: "boton", x: 10, z: 11, receptores: [] },
    ],
    cerraduras: [{ nombre: "Puerta", metodo: "codigo", abierta: false, x: 10, z: 10.4 }, { nombre: "Lejana", metodo: "llave", abierta: true, x: 90, z: 90 }],
    contadores: [{ nombre: "Vueltas", tipo: "cuenta_atras", valor: 3, x: 9.5, z: 10 }],
  };
  const l = logicaDeObjeto(mesa, w);
  assert.deepEqual(l.entran, ["«Palanca» (boton) muestra «o7»", "«Umbral» (zona) oculta «Mesa»"]); // «mueve» names a movedor, never counts; «otra» is not this object
  assert.deepEqual(l.salen, ["«Alfombra» (zona) → mueve «o7», da un paso de misión", "«Vacío» (boton) → sin receptores"]);
  assert.deepEqual(l.piezas, ["Cerradura «Puerta» (con código): cerrada", "Contador «Vueltas» (cuenta atras): 3"]);
  // an unnamed object is found by id only; an empty world says nothing
  assert.deepEqual(logicaDeObjeto({ id: "o9", x: 90, z: 90 }, w).entran, []);
  assert.deepEqual(logicaDeObjeto({ id: "o9", x: 90, z: 90 }, w).piezas, ["Cerradura «Lejana» (con llave): abierta"]);
  assert.deepEqual(logicaDeObjeto(mesa, { disparadores: [], cerraduras: [], contadores: [] }), { entran: [], salen: [], piezas: [] });
  // no position in the model: nothing «stands at» it
  assert.deepEqual(logicaDeObjeto({ id: "o8" }, w).salen, []);
});

// ---- C5: touch (short labels, long press, sheet grid) and VR (the panel's cells and the actions) ----
test("touch: every icon has a short, unique, plain label that fits a 72 px cell; the sheet grid fits 360 px with 44 px targets", () => {
  const etiquetas = Object.values(ETIQUETAS_FICHA);
  assert.equal(new Set(etiquetas).size, etiquetas.length);
  for (const t of etiquetas) assert.ok(t.length <= 8 && !/[()]/.test(t), t);
  assert.ok(LARGA_MS >= 350 && LARGA_MS <= 600); // longer than a tap, shorter than a wait
  assert.ok(360 / COLUMNAS_FICHA_MOVIL - 6 >= 44);
});

test("VR panel: the 8 cells in order, «Soltar» when anchored, «¿Seguro?» when asked once, only «Borrar» is the dangerous one", () => {
  const c = celdasFicha({ titulo: "Mesa", anclado: false });
  assert.deepEqual(c.map((x) => x.id), ["mover", "girar", "mas", "menos", "duplicar", "anclar", "borrar", "cerrar"]);
  assert.deepEqual(c.filter((x) => x.peligro).map((x) => x.id), ["borrar"]);
  assert.equal(c[5].etiqueta, "Anclar"); assert.equal(c[6].etiqueta, "Borrar");
  assert.equal(celdasFicha({ titulo: "Mesa", anclado: true })[5].etiqueta, "Soltar");
  assert.equal(celdasFicha({ titulo: "Mesa", anclado: true }, true)[6].etiqueta, "¿Seguro?");
});

test("VR panel: celdaEn maps the centre of each cell to 1..8 and the gaps, the title and the outside to 0", () => {
  for (let i = 0; i < 8; i++) {
    const x = X0 + (i % COLS) * (CW + GAP) + CW / 2, y = Y0 + Math.floor(i / COLS) * (CH + GAP) + CH / 2;
    assert.equal(celdaEn(x, y), i + 1, `cell ${i + 1}`);
    assert.ok(CW >= 100 && CH >= 100); // big enough to point at (≥ 10° at 1.1 m on a 0.9 m wide panel)
  }
  assert.equal(celdaEn(X0 + CW + GAP / 2, Y0 + 10), 0); // gap between columns
  assert.equal(celdaEn(X0 + 10, Y0 + CH + GAP / 2), 0); // gap between rows
  assert.equal(celdaEn(100, 40), 0); // the title
  assert.equal(celdaEn(-5, 200), 0); assert.equal(celdaEn(FICHA_W + 5, 200), 0); assert.equal(celdaEn(100, FICHA_H + 5), 0);
  assert.equal(celdaEn(X0, Y0), 1); assert.equal(celdaEn(X0 + CW, Y0 + CH), 1); // the cell's own edges are inside
  assert.ok(X0 + COLS * (CW + GAP) - GAP + X0 <= FICHA_W + 1 && Y0 + 2 * (CH + GAP) - GAP + 24 <= FICHA_H + 1); // the grid fits the canvas
});

test("VR actions run the builder's own verbs with fixed steps, say what happened, and report a refusal in words", () => {
  const llamadas: string[] = [];
  const bien = { ok: true } as const;
  const c = {
    modo: (m: string) => (llamadas.push(`modo ${m}`), bien), girar: (g: number) => (llamadas.push(`girar ${g}`), bien), escalar: (f: number) => (llamadas.push(`escalar ${f}`), bien),
    duplicar: () => (llamadas.push("duplicar"), bien), fijar: () => (llamadas.push("fijar"), bien), borrar: () => (llamadas.push("borrar"), bien), seleccionar: (id: string) => (llamadas.push(`seleccionar "${id}"`), bien),
  };
  const acciones: AccionVR[] = ["mover", "girar", "mas", "menos", "duplicar", "anclar", "borrar", "cerrar"];
  for (const a of acciones) assert.equal(aplicarAccionVR(c, a).res.ok, true);
  assert.deepEqual(llamadas, ["modo mover", `girar ${PASO_GIRO_VR}`, `escalar ${FACTOR_MAS_VR}`, `escalar ${FACTOR_MENOS_VR}`, "duplicar", "fijar", "borrar", 'seleccionar ""']);
  assert.ok(PASO_GIRO_VR === 15 && FACTOR_MAS_VR * FACTOR_MENOS_VR === 1); // bigger then smaller gets you back
  const no = { ...c, borrar: () => ({ ok: false, why: "está anclado" }) as const };
  assert.deepEqual(aplicarAccionVR(no, "borrar"), { res: { ok: false, why: "está anclado" }, dicho: "No: está anclado" });
  assert.match(aplicarAccionVR(c, "mover").dicho, /gatillo/);
});
