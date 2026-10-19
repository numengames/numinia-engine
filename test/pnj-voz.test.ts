// La voz de los PNJ (apps/plaza/pnj-voz.ts): un saludo al abrir la conversación, una despedida al cerrarla, de la boca
// de la persona y siempre con su misma voz; las líneas nuevas, calladas. Y lo que hace falta para que suene de verdad:
// que el catálogo tenga las tomas (CC0, en el bus que va bajito) y que la ficha pnj@1 acepte `voz`.
import test from "node:test";
import assert from "node:assert/strict";
import catalogo from "../features/sonido/catalogo.json" with { type: "json" };
import { leerPnj, VOCES_PNJ } from "../features/misiones/formato.ts";
import { pnj as pnjDecl } from "../features/misiones/feature.ts";
import { NIVEL_PROVISIONAL } from "../packages/render/src/audio/voces.ts";
import { BOCA_M, GAIN_VOZ_PNJ, montarVozPnj, vozPnj } from "../apps/plaza/pnj-voz.ts";

/** Las misiones de mentira: dos personas, una conversación que se abre, cambia de línea y se cierra. */
function misionesFalsas() {
  const gente: Record<string, { x: number; y: number; z: number; escala: number; voz: string }> = {
    alma: { x: 4, y: 0, z: -2, escala: 1, voz: "mujer-mayor" },
    teo: { x: -6, y: 3, z: 1, escala: 1.2, voz: "" },
  };
  let d: { pnj: string; texto: string } | null = null;
  const oyentes = new Set<(q: "libro" | "dialogo" | "nota") => void>();
  const avisar = (q: "libro" | "dialogo" | "nota") => { for (const f of oyentes) f(q); };
  return {
    m: {
      dialogo: () => d,
      alCambiar: (fn: (q: "libro" | "dialogo" | "nota") => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
      personaDe: (pnj: string) => gente[pnj] ?? null,
      vozDe: (pnj: string) => gente[pnj]?.voz ?? "",
    },
    abrir: (pnj: string, texto = "Hola.") => { d = { pnj, texto }; avisar("dialogo"); },
    cerrar: () => { d = null; avisar("dialogo"); },
    otro: (q: "libro" | "nota") => avisar(q),
    oyentes,
  };
}

function puertaFalsa() {
  const pedidos: { id: string; o: Record<string, unknown> }[] = [];
  return {
    pedidos,
    sonar(id: string, o: Record<string, unknown> = {}) { pedidos.push({ id, o }); return true; },
    paso() { return true; }, fuenteDe: () => "fichero" as const, ambiente: () => false, parar() {}, olvidar() {},
    estado: () => ({ ficheros: 0, recetas: 0, fallados: 0, guardados: 0, memoria: 0, colchon: null, sintetizado: [], avisos: [] }),
  };
}

const paginaFalsa = (misiones: unknown) => ({
  session: { entity: -1, selfPosition: () => ({ y: 0, speed: 0, grounded: true }) },
  cerraduras: { alCambiar: () => null },
  pesca: { estado: () => ({ fase: "nada" }), alCambiar: () => null },
  misiones,
});

test("voz de PNJ: abrir la conversación = UN saludo con su voz y en su boca; una línea nueva = nada; cerrar = la despedida", async () => {
  const { montarSonidos } = await import("../apps/plaza/sonidos.ts");
  const q = puertaFalsa(), f = misionesFalsas();
  const s = montarSonidos(paginaFalsa(f.m) as never, q as never);
  f.abrir("alma");
  assert.equal(q.pedidos.length, 1, "un solo saludo");
  assert.equal(q.pedidos[0].id, "pnj-saludo-mujer-mayor", "la voz de su ficha");
  assert.deepEqual(q.pedidos[0].o.donde, { x: 4, y: BOCA_M, z: -2 }, "sale de la persona, a la altura de la boca");
  assert.equal(q.pedidos[0].o.gain, GAIN_VOZ_PNJ);
  assert.ok(GAIN_VOZ_PNJ <= 0.5, "bajito: los sonidos de hoy son provisionales");
  assert.equal(q.pedidos[0].o.semilla, undefined, "local y sin semilla: la puerta no repite la misma toma seguida");
  f.abrir("alma", "¿Damos un paseo?");
  f.abrir("alma", "Sígueme.");
  f.otro("libro"); f.otro("nota");
  assert.equal(q.pedidos.length, 1, "las líneas nuevas y los demás avisos no suenan: saturaría");
  f.cerrar();
  assert.equal(q.pedidos.length, 2);
  assert.equal(q.pedidos[1].id, "pnj-despedida-mujer-mayor", "se despide con la misma voz");
  assert.deepEqual(q.pedidos[1].o.donde, { x: 4, y: BOCA_M, z: -2 });
  f.cerrar();
  assert.equal(q.pedidos.length, 2, "cerrar lo ya cerrado no vuelve a sonar");
  s.desmontar();
  assert.equal(f.oyentes.size, 0, "desmontar suelta el oyente");
});

test("voz de PNJ: sin `voz` en su ficha, una elegida por su id — siempre la misma; pasar de una a otra = despedida y saludo", () => {
  const f = misionesFalsas(), dichos: { id: string; o?: { donde?: unknown } }[] = [];
  const quitar = montarVozPnj(f.m, (id, o) => { dichos.push({ id, o }); return true; });
  f.abrir("teo");
  const voz = vozPnj("teo");
  assert.equal(dichos[0].id, `pnj-saludo-${voz}`);
  assert.deepEqual(dichos[0].o?.donde, { x: -6, y: 3 + BOCA_M * 1.2, z: 1 }, "en su planta y a su escala");
  f.abrir("alma");
  assert.deepEqual(dichos.slice(1).map((d) => d.id), [`pnj-despedida-${voz}`, "pnj-saludo-mujer-mayor"]);
  quitar();
  f.cerrar();
  assert.equal(dichos.length, 3, "desenganchado, ya no suena");
  // determinista: el mismo id da la misma voz siempre; una voz de ficha que no es de la casa no cuenta
  for (const id of ["teo", "bruno", "alma", "x", "una-persona-larga-42"]) {
    assert.equal(vozPnj(id), vozPnj(id));
    assert.ok((VOCES_PNJ as readonly string[]).includes(vozPnj(id)));
    assert.equal(vozPnj(id, "robot"), vozPnj(id));
  }
  assert.equal(vozPnj("teo", "mujer-mayor"), "mujer-mayor", "la ficha manda");
  assert.equal(new Set(Array.from({ length: 40 }, (_, i) => vozPnj(`pnj-${i}`))).size, VOCES_PNJ.length, "el hash reparte las voces");
});

test("voz de PNJ: una persona que esta página no dibuja no suena (no hay de dónde sacar la voz)", () => {
  const f = misionesFalsas(), dichos: string[] = [];
  montarVozPnj(f.m, (id) => { dichos.push(id); return true; });
  f.abrir("nadie");
  f.cerrar();
  assert.deepEqual(dichos, []);
});

test("voz de PNJ: el catálogo trae saludo y despedida de cada voz, CC0, cortos y en un bus que va bajito", () => {
  const ids = new Map(catalogo.sonidos.map((s) => [s.id, s]));
  for (const voz of VOCES_PNJ) for (const que of ["saludo", "despedida"]) {
    const s = ids.get(`pnj-${que}-${voz}`);
    assert.ok(s, `falta pnj-${que}-${voz} en features/sonido/catalogo.json`);
    assert.ok(s.variantes.length >= 1, "con fichero");
    assert.equal(s.licencia, "CC0-1.0");
    assert.ok(s.duracion_s <= 1.25, `${s.id}: ${s.duracion_s} s (una voz corta, no una frase)`);
    assert.ok((NIVEL_PROVISIONAL as Record<string, number>)[s.bus] !== undefined && (NIVEL_PROVISIONAL as Record<string, number>)[s.bus] < 1, `${s.id} va por «${s.bus}», que debe ir bajito como los demás provisionales`);
    assert.ok(s.cooldown_ms >= 500, "quien abre y cierra deprisa no apila saludos");
  }
});

test("voz de PNJ: pnj@1 acepta `voz` (una de las de la casa; sin ella, vacía) y el estado la lleva (pnj v4)", () => {
  const base = { formato: "pnj@1", id: "cosimo", nombre: "Cosimo", posicion: { x: 0, z: 0 }, dialogo: { entradas: [{ nodo: "a" }], nodos: { a: { texto: "Hola.", opciones: [] } } } };
  const ok = leerPnj({ ...base, voz: "mujer-mayor" });
  assert.ok(ok.ok && ok.value.voz === "mujer-mayor", JSON.stringify(ok));
  const sin = leerPnj(base);
  assert.ok(sin.ok && sin.value.voz === "");
  const mala = leerPnj({ ...base, voz: "robot" });
  assert.ok(!mala.ok && mala.issues.some((i) => i.path === "voz" && /hombre-joven, mujer-mayor/.test(i.message)), JSON.stringify(mala));
  assert.equal(pnjDecl.version, 4);
  assert.deepEqual(pnjDecl.state!.fields.voz, { kind: "text", maxBytes: 16, default: "" });
});
