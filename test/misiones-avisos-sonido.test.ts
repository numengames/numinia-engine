// t_d7411a07: each quest notice (recibida, entregada, completada) has a house sound of its own from the catalogue, picked by the
// world (ficha.json → audio.avisos), and the page plays that file instead of its oscillator notes. Pure rules + the ficha schema.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AVISOS_MISION, SONIDO_AVISO_DEF, avisoDeEvento, ponerAvisosMundo, ponerCatalogoCasa, sonarAviso, sonidoDeAviso } from "../apps/plaza/misiones.ts";
import type { CatalogoCasa } from "../apps/plaza/misiones.ts";
import { AVISOS_MISION as AVISOS_SERVIDOR, validarFicha } from "../packages/server/src/aventura.ts";
import catalogo from "../features/sonido/catalogo.json" with { type: "json" };

afterEach(() => { ponerAvisosMundo(undefined); ponerCatalogoCasa(null); });

const ids = new Map((catalogo.sonidos as { id: string; fuente: unknown }[]).map((s) => [s.id, s.fuente === "receta" ? "receta" : "fichero"]));
/** A catalogue that answers like the page's, from the real catalogue's ids; `tocados` is what it was asked to play. */
function falso(o: { listo?: boolean; corta?: boolean } = {}): CatalogoCasa & { tocados: string[] } {
  const tocados: string[] = [];
  return { tocados, listo: () => o.listo ?? true, casa: (n) => (n === "completada" ? "ui-logro" : null), fila: (id) => (ids.has(id) ? { fuente: ids.get(id) } : null),
    suena: (p) => { if (o.corta) return false; assert.equal(p.donde ?? null, null, "a notice is in the head: no panner"); tocados.push(p.id); return ids.get(p.id) === "fichero"; } };
}
/** An audio context that only counts the oscillators it is asked for (the fallback notes). */
function ctxFalso() {
  const g = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d };
  const r = { osciladores: 0, ctx: { state: "running", currentTime: 0, destination: {}, createGain: () => g, createOscillator: () => { r.osciladores++; return { type: "", frequency: { value: 0 }, connect: () => g, start() {}, stop() {} }; } } as unknown as AudioContext };
  return r;
}

test("the three notices, and only those, are named the same on the page and in the ficha schema", () => {
  assert.deepEqual([...AVISOS_MISION], ["recibida", "entregada", "completada"]);
  assert.deepEqual([...AVISOS_SERVIDOR], [...AVISOS_MISION]);
  for (const a of AVISOS_MISION) assert.equal(ids.get(SONIDO_AVISO_DEF[a]), "fichero", `the house default of «${a}» is a catalogue sound with a file`);
  assert.equal(new Set(Object.values(SONIDO_AVISO_DEF)).size, 3, "each notice has its own sound by default");
});

test("avisoDeEvento: aceptada = recibida, a step of type entrega = entregada, completada = completada; every other step is silent", () => {
  const libro = [{ id: "m1", lista: [{ texto: "Habla con Bianca", tipo: "habla_con" }, { texto: "Entrega la caja", tipo: "entrega" }, { texto: "Coge la llave", tipo: "coge" }] }];
  assert.equal(avisoDeEvento("aceptada", { mision: "m1" }, libro), "recibida");
  assert.equal(avisoDeEvento("completada", { mision: "m1" }, libro), "completada");
  assert.equal(avisoDeEvento("avance", { mision: "m1", texto: "Entrega la caja" }, libro), "entregada");
  assert.equal(avisoDeEvento("avance", { mision: "m1", texto: "Habla con Bianca" }, libro), null);
  assert.equal(avisoDeEvento("avance", { mision: "m1", texto: "Coge la llave" }, libro), null);
  assert.equal(avisoDeEvento("avance", { mision: "otra", texto: "Entrega la caja" }, libro), null, "another quest's step is not this one");
  for (const e of ["libro", "mision", "paso", "aviso", "rechazado", "marcas"]) assert.equal(avisoDeEvento(e, { mision: "m1" }, libro), null, e);
});

test("the world picks the sound of each notice; \"\" silences it; the rest keep the house sound; junk is ignored", () => {
  const c = falso();
  assert.deepEqual(AVISOS_MISION.map((a) => sonidoDeAviso(a, {}, c)), ["ui-confirmar", "coger-soltar", "ui-logro"]);
  ponerAvisosMundo({ recibida: "puerta", entregada: "", completada: 7, otra: "dados" });
  assert.equal(sonidoDeAviso("recibida"), "puerta");
  assert.equal(sonidoDeAviso("entregada"), null, "the world switched it off");
  assert.equal(sonidoDeAviso("completada", undefined, c), "ui-logro", "not a text: left out, the house sound stays");
  ponerAvisosMundo(["x"]); ponerAvisosMundo(null);
  assert.equal(sonidoDeAviso("recibida", undefined, c), "ui-confirmar");
});

test("sonarAviso plays the FILE the world picked (in the head, no panner) and no oscillator note; \"\" plays nothing", () => {
  const c = falso(), a = ctxFalso();
  ponerCatalogoCasa(c);
  ponerAvisosMundo({ recibida: "puerta", entregada: "dados", completada: "teleport" });
  const ajuste = () => 80;
  for (const n of AVISOS_MISION) assert.equal(sonarAviso(n, () => a.ctx, ajuste), true, n);
  assert.deepEqual(c.tocados, ["puerta", "dados", "teleport"]);
  assert.equal(a.osciladores, 0, "with the catalogue, the notes are not used");
  ponerAvisosMundo({ recibida: "" });
  assert.equal(sonarAviso("recibida", () => a.ctx, ajuste), false);
  assert.equal(a.osciladores, 0);
  assert.equal(c.tocados.length, 3, "silent means silent");
  // the house defaults, when the world says nothing
  ponerAvisosMundo(undefined);
  for (const n of AVISOS_MISION) sonarAviso(n, () => a.ctx, ajuste);
  assert.deepEqual(c.tocados.slice(3), ["ui-confirmar", "coger-soltar", "ui-logro"]);
});

test("sonarAviso falls back to the short notes only when the catalogue cannot: not loaded, an unknown id, an id with no file — never on top of a file cut by its cooldown", () => {
  const ajuste = () => 80;
  let a = ctxFalso();
  ponerCatalogoCasa(null);
  assert.equal(sonarAviso("recibida", () => a.ctx, ajuste), true);
  assert.ok(a.osciladores > 0, "no catalogue yet: notes");
  a = ctxFalso(); ponerCatalogoCasa(falso({ listo: false }));
  assert.equal(sonarAviso("entregada", () => a.ctx, ajuste), true); assert.ok(a.osciladores > 0, "table not there yet: notes");
  a = ctxFalso(); ponerCatalogoCasa(falso()); ponerAvisosMundo({ recibida: "no-existe" });
  assert.equal(sonarAviso("recibida", () => a.ctx, ajuste), true); assert.ok(a.osciladores > 0, "an id the catalogue does not know: notes");
  a = ctxFalso(); ponerAvisosMundo({ recibida: "moneda" });
  assert.equal(sonarAviso("recibida", () => a.ctx, ajuste), true); assert.ok(a.osciladores > 0, "a recipe row has no file here: notes");
  a = ctxFalso(); ponerCatalogoCasa(falso({ corta: true })); ponerAvisosMundo(undefined);
  assert.equal(sonarAviso("completada", () => a.ctx, ajuste), false, "its cooldown cut the file");
  assert.equal(a.osciladores, 0, "…and the notes do not pile on it");
  assert.equal(sonarAviso("completada", () => null, ajuste), false, "no audio at all: the banner and the text still say it");
});

test("ficha@1 audio.avisos: the three notices take a catalogue id or \"\"; anything else is refused with its reason", () => {
  const f = (avisos: unknown) => validarFicha({ formato: "ficha@1", nombre: "Sala", audio: { avisos } });
  assert.ok(f({ recibida: "ui-confirmar", entregada: "coger-soltar", completada: "ui-logro" }).ok);
  assert.ok(f({}).ok);
  assert.ok(f({ entregada: "" }).ok, "empty = that notice is silent");
  const mal = f({ recibida: "Con Mayúsculas", entregada: 3, nueva: "puerta" });
  assert.ok(!mal.ok);
  if (!mal.ok) assert.deepEqual(mal.issues.map((i) => i.path).sort(), ["ficha.json.audio.avisos.entregada", "ficha.json.audio.avisos.nueva", "ficha.json.audio.avisos.recibida"]);
  for (const x of ["texto", null, ["a"], 4]) assert.ok(!f(x).ok, JSON.stringify(x));
  assert.ok(validarFicha({ formato: "ficha@1", nombre: "Sala", audio: { ambiente: "ambiente-numinia" } }).ok, "a ficha without avisos is untouched");
});
