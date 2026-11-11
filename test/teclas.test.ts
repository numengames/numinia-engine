// Keymap v1: one key, one function. The table of apps/plaza/teclas.ts is the only place keys are written down.
import test from "node:test";
import assert from "node:assert/strict";
import { ACCIONES, CLAVE_GUARDADO, crearTeclas, filasDeTeclas, lineaDeAyuda, nombreTecla } from "../apps/plaza/teclas.ts";
import { TECLAS_CAMARA } from "../packages/render/src/camara.ts";

const memoria = () => { const m = new Map<string, string>(); return { leer: (k: string) => m.get(k) ?? null, escribir: (k: string, t: string) => void m.set(k, t), m }; };
const ev = (code: string, o: { ctrlKey?: boolean; altKey?: boolean } = {}) => ({ code, ...o });

test("no two world-mode actions share a key in the Default column", () => {
  const t = crearTeclas(null);
  assert.deepEqual(t.choques(), [], "two actions share a key: " + JSON.stringify(t.choques()));
  const ids = ACCIONES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "an action id twice");
});

test("the keymap Pablo approved", () => {
  const t = crearTeclas(null), k = (id: string) => t.principal(id);
  assert.deepEqual(["saltar", "usar", "soltar", "microfono", "pantalla", "bolsa", "ficha", "construir", "gente", "chat", "cerrar"].map(k),
    ["Space", "KeyE", "KeyQ", "KeyV", "KeyF", "KeyI", "KeyC", "KeyB", "Tab", "Enter", "Escape"]);
  assert.deepEqual(["mapa", "misiones", "avisos", "menu", "camara", "gestos", "bailar", "frases", "director", "densidad", "ayuda", "ocultarUI"].map(k),
    ["KeyM", "KeyJ", "KeyN", "KeyO", "KeyP", "KeyG", "KeyH", "Backquote", "KeyK", "KeyU", "F1", "Ctrl+KeyH"]);
  for (const libre of ["KeyL", "KeyR", "KeyX"]) assert.equal(ACCIONES.find((a) => a.defecto.includes(libre)), undefined, `${libre} is freed`);
  assert.deepEqual(t.efectivas("adelante"), ["KeyW", "ArrowUp"]);
});

test("the camera keys of the table are the ones the camera listens to", () => {
  const t = crearTeclas(null);
  assert.equal(t.principal("girarIzq"), TECLAS_CAMARA.izquierda);
  assert.equal(t.principal("girarDer"), TECLAS_CAMARA.derecha);
  assert.equal(t.principal("inclinarArriba"), TECLAS_CAMARA.arriba);
  assert.equal(t.principal("inclinarAbajo"), TECLAS_CAMARA.abajo);
  assert.equal(t.principal("camaraInicio"), TECLAS_CAMARA.reiniciar);
  assert.ok(!("vista" in TECLAS_CAMARA), "V is the microphone now: the camera has no key of its own for 1st/3rd person");
});

test("es(): Default, Yours, modifiers", () => {
  const t = crearTeclas(null);
  assert.ok(t.es(ev("KeyE"), "usar"));
  assert.ok(!t.es(ev("KeyE", { ctrlKey: true }), "usar"), "Ctrl+E is the browser's");
  assert.ok(t.es(ev("KeyH"), "bailar") && !t.es(ev("KeyH", { ctrlKey: true }), "bailar"));
  assert.ok(t.es(ev("KeyH", { ctrlKey: true }), "ocultarUI") && !t.es(ev("KeyH"), "ocultarUI"));
  assert.ok(t.es(ev("ArrowUp"), "adelante"), "arrows always walk");
  assert.ok(t.sujeta(new Set(["ArrowLeft"]), "izquierda"));
});

test("Yours wins over Default; the Default never changes; clearing goes back", () => {
  const m = memoria(), t = crearTeclas(m);
  assert.deepEqual(t.asignar("bolsa", "KeyZ"), { ok: true });
  assert.equal(t.principal("bolsa"), "KeyZ");
  assert.ok(t.es(ev("KeyZ"), "bolsa") && !t.es(ev("KeyI"), "bolsa"));
  assert.deepEqual(ACCIONES.find((a) => a.id === "bolsa")!.defecto, ["KeyI"]);
  assert.equal(t.etiqueta("bolsa"), "Z");
  assert.equal(t.suya("bolsa"), "KeyZ");
  t.limpiar("bolsa");
  assert.equal(t.principal("bolsa"), "KeyI");
  assert.equal(t.suya("bolsa"), "");
});

test("a key somebody has is a conflict: names who, changes nothing; swap hands the old key over", () => {
  const t = crearTeclas(null);
  const r = t.asignar("bolsa", "KeyC");
  assert.equal(r.ok, false);
  assert.equal((r as { conflicto?: string }).conflicto, "ficha");
  assert.match((r as { why: string }).why, /already does «Character sheet/);
  assert.equal(t.principal("bolsa"), "KeyI", "nothing changed");
  assert.deepEqual(t.intercambiar("bolsa", "KeyC"), { ok: true });
  assert.equal(t.principal("bolsa"), "KeyC");
  assert.equal(t.principal("ficha"), "KeyI");
  assert.deepEqual(t.choques(), []);
  // swapping back lands on the defaults again: nothing stays stored
  assert.deepEqual(t.intercambiar("bolsa", "KeyI"), { ok: true });
  assert.deepEqual(t.suyasTodas(), {});
});

test("a key that stays the Default of a fixed action cannot be taken, and Esc / F1 are reserved", () => {
  const t = crearTeclas(null);
  assert.equal(t.asignar("usar", "Escape").ok, false);
  assert.equal(t.asignar("usar", "F1").ok, false);
  assert.equal(t.asignar("girarIzq", "KeyZ").ok, false, "the camera keys are fixed");
  assert.equal(t.intercambiar("usar", "Comma").ok, false, "swapping with a fixed action is refused");
  assert.equal(t.asignar("usar", "ArrowUp").ok, false, "the arrows walk");
  assert.equal(t.asignar("usar", "not a key!").ok, false);
});

test("an action with no key by default can be given one", () => {
  const t = crearTeclas(null);
  assert.equal(t.principal("grabar"), "");
  assert.deepEqual(t.asignar("grabar", "KeyR"), { ok: true });
  assert.ok(t.es(ev("KeyR"), "grabar"));
});

test("Reset all empties Yours and saves; Yours survives a reload", () => {
  const m = memoria();
  const a = crearTeclas(m);
  a.asignar("mapa", "KeyZ"); a.asignar("usar", "KeyX");
  assert.ok(JSON.parse(m.m.get(CLAVE_GUARDADO)!).suyas.mapa === "KeyZ");
  const b = crearTeclas(m);
  assert.equal(b.principal("mapa"), "KeyZ");
  assert.equal(b.principal("usar"), "KeyX");
  let avisos = 0; b.alCambiar(() => avisos++);
  b.restablecer();
  assert.deepEqual(b.suyasTodas(), {});
  assert.equal(b.principal("mapa"), "KeyM");
  assert.equal(avisos, 1);
  assert.equal(crearTeclas(m).principal("mapa"), "KeyM", "the reset was saved");
});

test("a damaged or hostile store never breaks the page", () => {
  const malo = (texto: string) => crearTeclas({ leer: () => texto, escribir: () => {} });
  for (const t of ["", "not json", "[]", '{"v":9}', '{"v":1,"suyas":5}']) assert.deepEqual(malo(t).suyasTodas(), {});
  assert.deepEqual(malo('{"v":1,"suyas":{"nope":"KeyZ","girarIzq":"KeyZ","usar":"Escape","mapa":7}}').suyasTodas(), {});
  assert.deepEqual(malo('{"v":1,"suyas":{"bolsa":"KeyZ","ficha":"KeyZ"}}').suyasTodas(), {}, "two actions on one key: back to the defaults");
  assert.deepEqual(malo('{"v":1,"suyas":{"bolsa":"KeyC"}}').suyasTodas(), {}, "a key another action owns");
  assert.deepEqual(malo('{"v":1,"suyas":{"bolsa":"KeyZ"}}').suyasTodas(), { bolsa: "KeyZ" });
});

test("F1 and the help line show the key in effect", () => {
  const t = crearTeclas(null);
  t.asignar("bolsa", "KeyZ");
  const fila = filasDeTeclas(t).find((f) => f.nombre === "Bag")!;
  assert.equal(fila.tecla, "Z");
  assert.match(lineaDeAyuda(t), /Z: bag/);
  assert.match(lineaDeAyuda(crearTeclas(null)), /I: bag · C: character/);
  assert.equal(filasDeTeclas(t).find((f) => f.nombre === "Walk forward")!.tecla, "W / ↑");
});

test("names on screen", () => {
  assert.deepEqual(["KeyE", "Space", "Ctrl+KeyH", "Backquote", "Tab", "Digit4", "ShiftLeft"].map(nombreTecla), ["E", "Space", "Ctrl+H", "`", "Tab", "4", "Shift"]);
});
