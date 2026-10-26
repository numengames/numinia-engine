// t_5096d6f4 (MIS-229), second slice: the size of the model behind an AI travels in its public card (never the model's name) and is
// drawn — on the avatar (the shapes the render builds) and in «Gente» (the card's words). The scale itself: test/ia-ojos.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { Cuerpo } from "../packages/agent/src/index.ts";
import { emitirAgente, today } from "../packages/instance/src/identidad.ts";
import iaServer from "../features/ia/server.ts";
import { crearIAPagina } from "../features/ia/client.ts";
import { ESCALA_OJOS, TAMANOS, ojosDe } from "../features/ia/ojos.ts";
import { FORMAS_OJO, OJOS_MOVIL, OJOS_PC, contornoOjo, escalaOjos, geometriaOjos, ojosMax } from "../packages/render/src/ojos-ia-forma.ts";
import { fichaIA, GLIFO_OJOS, listaGenteVR, ojosFicha } from "../apps/plaza/gente-ia.ts";

const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

test("ojos: two inhabitants with models of different size publish different sizes; the model's name never reaches the page", () => {
  const guests = signer("una-clave-de-prueba-larga"), agents = signer("otra-clave-de-agentes-larga");
  const NOW = Date.parse("2026-10-26T12:00:00Z");
  const ficheros: Record<string, { escalon: number; modelo?: string }> = { guion: { escalon: 0 }, chica: { escalon: 2, modelo: "claude-haiku-4-5" }, grande: { escalon: 4, modelo: "anthropic/claude-opus-4:beta" }, rara: { escalon: 2, modelo: "algo-raro-v2" } };
  const roles = crearRoles({ construir: false, firmar: guests, habitante: (id) => ficheros[id] });
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [iaServer, roles.part], identitySign: guests, puede: (w, a) => roles.puede(w, a), now: () => NOW, agentes: { sign: agents, nombre: (id) => id } });
  const t = inst.join(0), pagina = crearIAPagina(), s = new ClientSession(t, { features: [pagina.part], identity: keeper() });
  const vivos = Object.keys(ficheros).map((id) => new Cuerpo(inst.join(0), emitirAgente(agents, id, today(NOW))));
  for (let i = 0; i < 6; i++) { t.flush(); for (const v of vivos) v.paso(); inst.tick(); t.flush(); s.tick(0, 0); }
  const de = (i: number) => pagina.de(vivos[i]!.entidad)!;
  assert.deepEqual(vivos.map((_, i) => de(i).tamano), ["sin-modelo", "pequeno", "grande", "desconocido"]);
  // only the class is on the wire: no model id in the shared state a page (or an agent) can read
  assert.ok(!/claude|opus|haiku|algo-raro/i.test(JSON.stringify([...s.features.stateOf("ia")])), "the state carries the size, never the model's name");
  // what the page draws: different eyes for different sizes
  const ojos = [1, 2].map((i) => ojosDe(de(i).tamano));
  assert.notEqual(ojos[0]!.color, ojos[1]!.color); assert.notEqual(ojos[0]!.forma, ojos[1]!.forma);
});

test("ojos: an outside agent or an organization's AI (no file behind it) says «no sabemos», not a guess", () => {
  const guests = signer("una-clave-de-prueba-larga"), agents = signer("otra-clave-de-agentes-larga");
  const NOW = Date.parse("2026-10-26T12:00:00Z");
  const roles = crearRoles({ construir: false, firmar: guests, habitante: () => undefined });
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [iaServer, roles.part], identitySign: guests, puede: (w, a) => roles.puede(w, a), now: () => NOW, agentes: { sign: agents, nombre: (id) => id } });
  const t = inst.join(0), pagina = crearIAPagina(), s = new ClientSession(t, { features: [pagina.part], identity: keeper() });
  const fuera = new Cuerpo(inst.join(0), emitirAgente(agents, "visita", today(NOW)));
  for (let i = 0; i < 4; i++) { t.flush(); fuera.paso(); inst.tick(); t.flush(); s.tick(0, 0); }
  assert.equal(pagina.de(fuera.entidad)?.tamano, "desconocido");
});

test("ojos render: every step has its own flat shape, both eyes in one small mesh, and the marks stay cheap and readable", () => {
  const formas = TAMANOS.map((t) => ESCALA_OJOS[t].forma);
  for (const f of formas) assert.ok(FORMAS_OJO.includes(f), `${f} is a shape the render can draw`);
  const g = FORMAS_OJO.map((f) => ({ f, ...geometriaOjos(f) }));
  for (const x of g) {
    assert.ok(x.triangulos >= 16 && x.triangulos <= 40, `${x.f}: ${x.triangulos} triangles for both eyes`);
    assert.equal(x.posiciones.length, x.vertices * 3); assert.equal(x.indices.length, x.triangulos * 3);
    assert.ok(Math.max(...x.indices) < x.vertices, `${x.f}: indices inside the vertices`);
    const xs = [...x.posiciones].filter((_, i) => i % 3 === 0);
    assert.ok(Math.min(...xs) < -0.02 && Math.max(...xs) > 0.02, `${x.f}: one eye on each side of the face`);
  }
  // the shapes are different outlines, not the same one scaled (a colour-blind person tells them apart)
  const ancho = (f: typeof FORMAS_OJO[number]) => { const c = contornoOjo(f); return { w: Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x)), h: Math.max(...c.map((p) => p.y)) - Math.min(...c.map((p) => p.y)), n: c.length }; };
  assert.ok(ancho("ranura").w > 2 * ancho("ranura").h, "slit is wide and thin");
  assert.ok(Math.abs(ancho("redondo").w - ancho("redondo").h) < 1e-6, "round is round");
  assert.equal(ancho("estrella").n, 8, "star has four points");
  assert.ok(ancho("punto").w < ancho("redondo").w, "dot is smaller than round");
  // a phone draws fewer, the marks grow with distance but not without end
  assert.ok(ojosMax(true) < ojosMax(false)); assert.equal(ojosMax(true), OJOS_MOVIL); assert.equal(ojosMax(false), OJOS_PC);
  assert.equal(escalaOjos(1), 1); assert.equal(escalaOjos(100), 3); assert.ok(escalaOjos(8) > escalaOjos(4));
});

test("ojos «Gente»: the card says the size in words and by glyph, explains the eyes, and never names a model", () => {
  const base = { estado: "activa" as const, puede: { construir: false }, atenta: false };
  for (const t of TAMANOS) {
    const o = ojosFicha({ tamano: t });
    assert.equal(o.etiqueta, "Ojos"); assert.equal(o.tamano, t);
    assert.equal(o.glifo, GLIFO_OJOS[ESCALA_OJOS[t].forma]);
    assert.match(o.color, /^#[0-9a-f]{6}$/); assert.equal(o.texto, ESCALA_OJOS[t].texto);
    assert.ok(!/claude|gpt|llama|gemini|qwen/i.test(`${o.nombre} ${o.texto}`));
  }
  assert.equal(new Set(TAMANOS.filter((t) => t !== "desconocido").map((t) => ojosFicha({ tamano: t }).glifo)).size, 4, "four glyphs for the four real steps");
  assert.equal(new Set(TAMANOS.map((t) => ojosFicha({ tamano: t }).nombre)).size, TAMANOS.length, "five different words");
  assert.equal(fichaIA("Ada · IA", { ...base, tamano: "grande" }).ojos.nombre, "Modelo grande");
  // VR «Gente»: the row names the size too
  const lista = listaGenteVR([{ quien: 5, nombre: "Ada · IA" }], 1, () => ({ ...base, tamano: "medio" }), () => "a 3 m");
  assert.match(lista.filas[0]!.detalle, /Modelo medio/);
});
