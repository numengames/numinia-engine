// J4 «clic sobre cosas del mundo y abrir enlaces»: a thing with a link opens it in a NEW tab only after a confirm, never by itself;
// the cursor is a hand over it; only https (or http to this machine) is ever opened; in VR the ray points at it and a panel asks
// (window.confirm cannot show inside an immersive session), and only «Abrir» opens. No browser: fakes for the canvas and the hands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceAbrible, montarEnlaces, preguntaEnlace } from "../apps/plaza/enlaces.ts";
import { montarXR } from "../apps/plaza/xr.ts";

function pagina(opts: { enlaces?: Record<string, string>; construyendo?: boolean; dice?: boolean } = {}) {
  const abiertas: string[] = [], preguntas: string[] = [];
  const oyentes: Record<string, (e: unknown) => void> = {};
  const lienzo = { style: { cursor: "" }, addEventListener: (t: string, f: (e: unknown) => void) => { oyentes[t] = f; } } as unknown as HTMLElement;
  let encima: string | null = null;
  const st = { construyendo: opts.construyendo ?? false };
  const e = montarEnlaces({
    constructor: { objeto: (id) => (id in (opts.enlaces ?? {}) || id === "sin" ? { id, enlace: opts.enlaces?.[id] } : null) },
    view: { renderer: { domElement: lienzo }, pickThing: () => encima },
    construyendo: () => st.construyendo,
    confirmar: (t) => { preguntas.push(t); return opts.dice ?? true; },
    abrir: (u) => { abiertas.push(u); },
  });
  return { e, abiertas, preguntas, lienzo, st, mover: (k: string | null) => { encima = k; oyentes.pointermove({ clientX: 1, clientY: 1 }); }, salir: () => oyentes.pointerleave({}) };
}

test("a click on a thing with a link asks first (the whole address) and opens it in a new tab only on «sí»", () => {
  const p = pagina({ enlaces: { cartel: "https://numinia.com/mundo" } });
  assert.equal(p.e.pinchar("cartel"), true);
  assert.deepEqual(p.preguntas, [preguntaEnlace("https://numinia.com/mundo")]);
  assert.match(p.preguntas[0], /https:\/\/numinia\.com\/mundo/);
  assert.deepEqual(p.abiertas, ["https://numinia.com/mundo"]);
  const no = pagina({ enlaces: { cartel: "https://numinia.com/mundo" }, dice: false });
  assert.equal(no.e.pinchar("cartel"), true, "a «no» still claims the click: nothing else happens");
  assert.deepEqual(no.abiertas, [], "nothing opened without a yes");
});

test("a thing without a link is not claimed; building mode never opens links", () => {
  const p = pagina({ enlaces: { cartel: "https://numinia.com" } });
  assert.equal(p.e.pinchar("sin"), false); assert.equal(p.e.pinchar("no-existe"), false);
  assert.deepEqual(p.preguntas, []);
  p.st.construyendo = true;
  assert.equal(p.e.pinchar("cartel"), false); assert.deepEqual(p.abiertas, []);
  assert.equal(p.e.tiene("cartel"), false, "and the ray in VR ignores it while building");
});

test("only https (or http to this machine, no user:password) is ever opened, whatever the file says", () => {
  for (const ok of ["https://numinia.com/x?y=1", "http://localhost:8790/", "http://127.0.0.1/a"]) assert.equal(enlaceAbrible(ok), true, ok);
  for (const mal of ["javascript:alert(1)", "data:text/html,<b>", "http://ejemplo.com", "https://u:p@numinia.com", "ftp://x", "file:///etc/passwd", "no es una url", ""]) assert.equal(enlaceAbrible(mal), false, mal);
  const p = pagina({ enlaces: { malo: "javascript:alert(1)" } });
  assert.equal(p.e.pinchar("malo"), true, "it is a link: claimed");
  assert.deepEqual(p.preguntas, [], "but never even asked"); assert.deepEqual(p.abiertas, []);
  p.e.abrir("javascript:alert(1)"); assert.deepEqual(p.abiertas, []);
});

test("the cursor is a hand only over a thing with a link, while playing, and goes back when it leaves", () => {
  const p = pagina({ enlaces: { cartel: "https://numinia.com" } });
  p.mover("cartel"); assert.equal(p.lienzo.style.cursor, "pointer");
  p.mover("sin"); assert.equal(p.lienzo.style.cursor, "");
  p.mover("cartel"); p.st.construyendo = true; p.mover("cartel"); assert.equal(p.lienzo.style.cursor, "", "building: no hand");
  p.st.construyendo = false; p.mover("cartel"); p.salir(); assert.equal(p.lienzo.style.cursor, "");
});

// ── VR: the ray points at it, a panel asks, only «Abrir» opens ────────────────────────────────────────────────────
function vr(enlaces: Record<string, string>) {
  const p = pagina({ enlaces });
  const paneles: ({ nombre: string; texto: string; opciones: string[] } | null)[] = [];
  let elegir: (n: number) => void = () => {}, atras: () => void = () => {}, mano: (e: never) => void = () => {}, reglas: { apuntable?: (k: string) => boolean } = {}; const cambios: (() => void)[] = [];
  const misiones = { estado: { nota: "" }, libro: () => [], objetivos: () => [], dialogo: () => null, elegir: () => ({ ok: false as const, why: "no hay conversación" }), adios: () => ({ ok: true as const }), usar: () => ({ ok: true as const }), ofrece: () => false,
    alCambiar: (fn: () => void) => { cambios.push(fn); return () => {}; } };
  const usos: string[] = [], notas: string[] = [];
  const view = { vr: { active: true, pagina: "mandos" as const, dialogo: (d: never) => { paneles.push(d); }, nota: (t: string) => notas.push(t), onElegir: (f: (n: number) => void) => { elegir = f; }, onAtras: (f: () => void) => { atras = f; } }, ar: { state: "off" },
    manos: { reglas: (r: never) => { reglas = r; }, on: (f: never) => { mano = f; }, vibrar() {} }, llevar() {}, llevando: () => ({}) };
  montarXR({ session: { features: { use: (f: string, k: string) => { usos.push(`${f}:${k}`); return { ok: true as const }; } } }, view: view as never, misiones: misiones as never,
    interaccion: { actual: () => null, usar: () => ({ ok: true as const }), mirar() {}, mantener: { empezar() {}, soltar() {} } }, enlaces: p.e });
  return { p, paneles, elegir: (n: number) => elegir(n), atras: () => atras(), apuntar: (key: string) => mano({ tipo: "apuntar", key, lado: "der" } as never), apuntable: (k: string) => reglas.apuntable?.(k) ?? false, usos, notas, cambio: () => { for (const f of cambios) f(); } };
}

test("VR: the ray can point at a thing with a link and at nothing else plain; the trigger shows a panel and opens nothing yet", () => {
  const v = vr({ cartel: "https://numinia.com/mundo" });
  assert.equal(v.apuntable("cartel"), true); assert.equal(v.apuntable("sin"), false); assert.equal(v.apuntable("otro"), false);
  v.apuntar("cartel");
  assert.equal(v.paneles.length, 1);
  assert.match(v.paneles[0]!.texto, /https:\/\/numinia\.com\/mundo/); assert.deepEqual(v.paneles[0]!.opciones, ["Abrir", "Ahora no"]);
  assert.deepEqual(v.p.abiertas, [], "pointing and pulling the trigger does not open it by itself");
  assert.deepEqual(v.usos, [], "and it is not sent to the server as a use");
});

test("VR: «Abrir» opens it once; «Ahora no» or B closes the panel and opens nothing; a stray answer later opens nothing", () => {
  const v = vr({ cartel: "https://numinia.com/mundo" });
  v.apuntar("cartel"); v.elegir(1);
  assert.deepEqual(v.p.abiertas, ["https://numinia.com/mundo"]); assert.equal(v.paneles.at(-1), null, "the panel closed");
  v.elegir(1); assert.deepEqual(v.p.abiertas, ["https://numinia.com/mundo"], "a second «1» with no question opens nothing");
  const w = vr({ cartel: "https://numinia.com/mundo" });
  w.apuntar("cartel"); w.elegir(2); assert.deepEqual(w.p.abiertas, []); assert.equal(w.paneles.at(-1), null);
  w.apuntar("cartel"); w.atras(); assert.deepEqual(w.p.abiertas, []); assert.equal(w.paneles.at(-1), null);
  const x = vr({ cartel: "https://numinia.com/mundo" });
  x.apuntar("cartel"); x.cambio(); x.elegir(1); assert.deepEqual(x.p.abiertas, [], "a conversation took the panel: the question is gone");
});

test("VR: a link that is not https is not pointable and never asks", () => {
  const v = vr({ malo: "javascript:alert(1)" });
  assert.equal(v.apuntable("malo"), false);
  v.apuntar("malo"); assert.deepEqual(v.paneles, []); assert.deepEqual(v.p.abiertas, []);
});
