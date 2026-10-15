// U1: the loading screen's shell + controller (apps/plaza/index.html) and the reconnection (apps/plaza/conexion.ts).
// The controller is a plain script inside the page: here it runs against a tiny fake DOM with fake timers.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { espera, vigilarConexion } from "../apps/plaza/conexion.ts";

const html = readFileSync(new URL("../apps/plaza/index.html", import.meta.url), "utf8");
const script = /<dialog id="carga"[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html)![1];

type Falso = Record<string, any>;
function pagina() {
  const els = new Map<string, Falso>();
  const nuevo = (id: string): Falso => ({
    id, _t: "", get textContent() { return this._t; }, set textContent(v: string) { this._t = v; if (v === "") { this.children = []; this.firstChild = undefined; } }, value: 0, hidden: false, className: "", children: [] as Falso[], open: false, escuchas: {} as Record<string, Function>, nshow: 0, tabIndex: 0,
    setAttribute() {}, removeAttribute() {}, addEventListener(t: string, f: Function) { this.escuchas[t] = f; },
    showModal() { this.open = true; this.nshow++; }, close() { this.open = false; },
    appendChild(c: Falso) { this.children.push(c); this.firstChild = this.children[0]; return c; }, focus() {},
  });
  const el = (id: string) => { let e = els.get(id); if (!e) { e = nuevo(id); els.set(id, e); } return e; };
  const sandbox: Falso = {
    document: { getElementById: el, body: el("body"), querySelector: () => null, createElement: () => nuevo("x") },
    requestAnimationFrame: (f: () => void) => f(), location: { reload() {} },
    setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval, clearTimeout: globalThis.clearTimeout, Date: globalThis.Date, Math, Array,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { carga: sandbox.__numinia.carga, el, sandbox };
}

test("the shell weighs ≤ 14 kB gzipped and the controller ~2 kB", () => {
  assert.ok(gzipSync(html).length <= 14 * 1024, `index.html: ${gzipSync(html).length} bytes gz`);
  assert.ok(gzipSync(script).length <= 2.6 * 1024, `controller: ${gzipSync(script).length} bytes gz`);
});

test("fast load: the screen never shows (appears only after 400 ms)", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { carga, el } = pagina();
    carga.irA("grafica"); mock.timers.tick(100); carga.irA("red"); mock.timers.tick(100); carga.irA("mundo", 2, 2); carga.irA("preparar", 1, 1);
    carga.listo(); mock.timers.tick(2000);
    assert.equal(el("carga").nshow, 0); assert.equal(carga.estado, "listo"); assert.equal(carga.mostrada, false); assert.equal(carga.pct, 100);
  } finally { mock.timers.reset(); }
});

test("slow load: it shows at 400 ms and, once seen, stays at least 600 ms", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { carga, el } = pagina();
    mock.timers.tick(399); assert.equal(el("carga").open, false);
    mock.timers.tick(1); assert.equal(el("carga").open, true);
    mock.timers.tick(50); carga.listo();
    assert.equal(carga.pct, 100); assert.notEqual(carga.estado, "listo", "«listo» is said when the screen is gone");
    mock.timers.tick(500); assert.equal(el("carga").open, true, "still there 550 ms after appearing"); assert.notEqual(carga.estado, "listo");
    mock.timers.tick(60); assert.equal(el("carga").open, false); assert.equal(carga.estado, "listo");
  } finally { mock.timers.reset(); }
});

test("the bar goes by phases with real signals, never back, and the clock does not move it", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { carga } = pagina();
    const vistos: [string, number][] = [];
    const ir = (...a: [string, number?, number?, string?]) => { carga.irA(...a); vistos.push([carga.fase, carga.pct]); };
    ir("codigo"); mock.timers.tick(3000); assert.equal(carga.pct, 0, "3 s of waiting is still 0 %");
    ir("grafica"); ir("red"); ir("mundo", 0, 4); ir("mundo", 3, 4); ir("mundo", 1, 4); ir("preparar", 0, 1); ir("preparar", 1, 1);
    const pct = vistos.map((v) => v[1]);
    assert.deepEqual(pct, [...pct].sort((a, b) => a - b), `monotonic: ${pct}`);
    assert.deepEqual([...new Set(vistos.map((v) => v[0]))], ["codigo", "grafica", "red", "mundo", "preparar"]); // in order
    assert.ok(pct.at(-1)! >= 90 && pct.at(-1)! < 100, "99 % at most until «listo»");
    carga.listo(); assert.equal(carga.pct, 100);
    assert.ok(carga.avisos <= 6, "at most 6 spoken notices (one per phase)");
  } finally { mock.timers.reset(); }
});

test("bytes of the world are shown in MB (3,2 de 9,8 MB)", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { carga, el } = pagina();
    carga.irA("mundo", 3.2 * 1048576, 9.8 * 1048576, "bytes");
    assert.equal(el("carga-f").textContent, "Descargando el mundo · 3,2 de 9,8 MB");
  } finally { mock.timers.reset(); }
});

test("8 s without progress: «Sigue trabajando» with Reintentar and Cancelar; progress clears it", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    const { carga, el } = pagina();
    carga.irA("red"); mock.timers.tick(7500); assert.equal(carga.estado, "cargando");
    mock.timers.tick(1500); assert.equal(carga.estado, "atascado");
    assert.match(el("carga-aviso").textContent, /Sigue trabajando/);
    assert.deepEqual(el("carga-botones").children.map((b: Falso) => b.textContent), ["Reintentar", "Cancelar"]);
    carga.irA("mundo", 1, 3); assert.equal(carga.estado, "cargando"); assert.equal(el("carga-botones").hidden, true);
    mock.timers.tick(9000); assert.equal(carga.estado, "atascado");
    carga.cancelar(); assert.equal(carga.estado, "cancelado"); assert.deepEqual(el("carga-botones").children.map((b: Falso) => b.textContent), ["Reintentar"]);
  } finally { mock.timers.reset(); }
});

test("reconnection: growing wait, throw-away probe, reload when the server answers", async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(espera), [1, 2, 4, 8, 16, 30, 30, 30]);
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    const dichos: string[] = [], estados: string[] = [];
    const carga: any = { estado: "listo", mensaje: (e: string, t: string, x: string, b?: [string, () => void][]) => { estados.push(`${e}|${t}|${(b ?? []).map((y) => y[0]).join("+")}`); }, texto: (t: string) => dichos.push(t), aviso: () => {} };
    let cerrar!: () => void, recargas = 0;
    const sockets: any[] = [];
    const c = vigilarConexion({
      transport: { closed: new Promise<void>((ok) => { cerrar = ok; }), close() {} }, url: "ws://x", carga, conectado: () => true,
      recargar: () => { recargas++; }, crearSocket: () => { const s: any = { close() {} }; sockets.push(s); return s; },
    });
    cerrar(); await Promise.resolve(); await Promise.resolve();
    assert.match(estados[0], /^reconectando\|Se ha cortado la conexión\|Reintentar ya\+Cancelar$/);
    assert.equal(dichos.at(-1), "Intento 1: vuelvo a probar en 1 s.");
    mock.timers.tick(1000); assert.equal(sockets.length, 1);
    sockets[0].onclose(); // refused: the next wait is 2 s
    assert.equal(dichos.at(-1), "Intento 2: vuelvo a probar en 2 s.");
    mock.timers.tick(2000); assert.equal(sockets.length, 2);
    sockets[1].onopen(); // the server is back
    assert.equal(recargas, 1);
    assert.equal(c.estado().saliendo, false);
  } finally { mock.timers.reset(); }
});

test("«Salir» closes on purpose: no reconnection, one «Volver a entrar»", async () => {
  const estados: string[] = []; let cierres = 0, cerrar!: () => void;
  const carga: any = { estado: "listo", mensaje: (e: string, t: string, x: string, b?: [string, () => void][]) => { estados.push(`${e}|${(b ?? []).map((y) => y[0]).join("+")}`); }, texto() {}, aviso() {} };
  const c = vigilarConexion({ transport: { closed: new Promise<void>((ok) => { cerrar = ok; }), close() { cierres++; cerrar(); } }, url: "ws://x", carga, conectado: () => true, recargar() {} });
  c.salir(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(estados, ["salido|Volver a entrar"]); assert.equal(cierres, 1);
});
