// funciones/v3 · the «Este mundo» block of the VR menu's Ajustes: the pure rows (same ones the Entorno panel draws on the computer) and
// the menu's Ajustes content built from a fake `__numinia`. The browser leg (IWER) is tools/e2e-piernas/funciones-menu-vr.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filasEsteMundoVR } from "../features/funciones/menu-vr.ts";
import { filasFunciones, tituloGrupo } from "../features/funciones/panel.ts";
import { montarMenuVR } from "../apps/plaza/xr-menu.ts";

const todas = { normas: true, dardos: true, pesca: false };

test("v3 rows: a heading, then the same functions, labels and help lines the computer's panel has", () => {
  const e = { actual: todas, fija: {}, puede: true };
  const vr = filasEsteMundoVR(e), pc = filasFunciones(e);
  assert.deepEqual(vr.map((f) => f.tipo), ["encabezado", "funcion", "funcion", "funcion"]);
  assert.equal(vr[0]!.texto, "Este mundo"); assert.equal(vr[0]!.detalle, tituloGrupo("es")); assert.equal(vr[0]!.boton, undefined);
  assert.deepEqual(vr.slice(1).map((f) => f.funcion), pc.map((f) => f.funcion));
  assert.deepEqual(vr.slice(1).map((f) => f.texto), pc.map((f) => f.etiqueta));
  assert.deepEqual(vr.slice(1).map((f) => f.detalle), pc.map((f) => f.notas[0]));
  assert.deepEqual(vr.slice(1).map((f) => f.boton), ["Encendida", "Encendida", "Apagada"]);
});

test("v3 rows: the button asks for the opposite of the server's state; on is filled, off is outlined", () => {
  const [, normas, dardos, pesca] = filasEsteMundoVR({ actual: todas, fija: {}, puede: true });
  assert.deepEqual([normas, dardos, pesca].map((f) => f!.quiero), [false, false, true]);
  assert.deepEqual([normas, dardos, pesca].map((f) => f!.estilo), ["accion", "accion", "normal"]);
  assert.ok([normas, dardos, pesca].every((f) => f!.pulsable));
});

test("v3 rows: what the server fixes shows its state, has the button off and says «Lo fija el servidor.»", () => {
  const filas = filasEsteMundoVR({ actual: { normas: false, dardos: true }, fija: { normas: true }, puede: true });
  assert.deepEqual(filas.map((f) => f.tipo), ["encabezado", "funcion", "nota", "funcion"]);
  const [, normas, aviso, dardos] = filas;
  assert.equal(normas!.estilo, "desactivado"); assert.equal(normas!.pulsable, false); assert.equal(normas!.boton, "Apagada");
  assert.equal(normas!.detalle, "Apagadas, se entra sin aceptar normas. Para demos.");
  assert.equal(aviso!.texto, "Lo fija el servidor."); assert.equal(aviso!.boton, undefined);
  assert.equal(dardos!.pulsable, true);
});

test("v3 rows: whoever cannot build, and a world with no switches, see no block", () => {
  assert.deepEqual(filasEsteMundoVR({ actual: todas, fija: {}, puede: false }), []);
  assert.deepEqual(filasEsteMundoVR({ actual: {}, fija: {}, puede: true }), []);
  assert.deepEqual(filasEsteMundoVR(null as never), []);
});

test("v3 rows: a world without conditions has no «Normas de entrada» row; English words come from the same file", () => {
  assert.deepEqual(filasEsteMundoVR({ actual: { dardos: true, pesca: true }, fija: {}, puede: true }).slice(1).map((f) => f.texto), ["Dardos", "Pesca"]);
  assert.deepEqual(filasEsteMundoVR({ actual: { dardos: true }, fija: {}, puede: true }, "en").slice(1).map((f) => f.boton), ["On"]);
});

// ── the menu's Ajustes, built by xr-menu.ts from a fake `__numinia` ──
type FilaMenu = { texto: string; detalle?: string; botones?: { texto?: string; accion: () => void; estilo?: string }[] };
function menuConFunciones(o: { puede: boolean; actual: Record<string, boolean>; fija?: Record<string, boolean> }) {
  let proveedor: { contenido(v: string): { filas: FilaMenu[] } } | null = null;
  const notas: string[] = [], pedidos: [string, boolean][] = [];
  const vr = { iconos() {}, nota: (t: string) => notas.push(t), relojEstado() {}, onPulsa() {}, onReloj() {}, menu: { cerrar() {} }, exit: async () => {}, menuProveedor: (p: typeof proveedor) => { proveedor = p; } };
  const f = { estado: { ultimoRechazo: "" }, actual: () => o.actual, fija: (x: string) => o.fija?.[x] === true, ponerFuncion: (x: string, si: boolean) => { pedidos.push([x, si]); return { ok: true }; } };
  const n = { ajustes: { lista: () => [], set() {} }, funciones: f };
  montarMenuVR({ vr: vr as never, n: () => n, ciudadUrl: null, linea: () => "", retrato: () => null, puedeConstruir: () => o.puede, nombre: () => "Tú" });
  return { filas: () => proveedor!.contenido("ajustes").filas, notas, pedidos };
}

test("v3 menu: Ajustes ends with «Este mundo» for a builder; pressing a button asks the server for the opposite", () => {
  const m = menuConFunciones({ puede: true, actual: todas });
  const filas = m.filas();
  assert.deepEqual(filas.map((x) => x.texto), ["Este mundo", "Normas de entrada", "Dardos", "Pesca"]);
  const dardos = filas.find((x) => x.texto === "Dardos")!;
  assert.equal(dardos.botones![0]!.texto, "Encendida");
  dardos.botones![0]!.accion();
  assert.deepEqual(m.pedidos, [["dardos", false]]);
  assert.deepEqual(m.notas, ["Apagando: Dardos…"]);
});

test("v3 menu: no block for whoever cannot build; a fixed function asks nothing and says so", () => {
  assert.deepEqual(menuConFunciones({ puede: false, actual: todas }).filas(), []);
  const m = menuConFunciones({ puede: true, actual: todas, fija: { normas: true } });
  assert.deepEqual(m.filas().map((x) => x.texto), ["Este mundo", "Normas de entrada", "Lo fija el servidor.", "Dardos", "Pesca"]);
  const normas = m.filas().find((x) => x.texto === "Normas de entrada")!;
  assert.equal(normas.botones![0]!.estilo, "desactivado");
  normas.botones![0]!.accion();
  assert.deepEqual(m.pedidos, []); assert.deepEqual(m.notas, ["Normas de entrada: la fija el servidor, el interruptor no la cambia."]);
});
