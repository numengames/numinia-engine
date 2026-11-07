// R-1 (first slice): a world's words are English by default and may carry translations as files (packages/server/src/idiomas.ts).
// The Taller template is the proof: English in aventura/, Spanish in aventura/idiomas/es.*, and the same adventure loads in both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TALLER } from "../packages/server/src/mundo-carpeta.ts";
import { leerFicha, lectorAventura, validarFicha } from "../packages/server/src/aventura.ts";
import { leerLeemeIA } from "../packages/server/src/leeme-ia.ts";
import { IDIOMA_DEFECTO, idiomaDelMundo, paridad, rutaTraducida } from "../packages/server/src/idiomas.ts";
import { cargarAventura } from "../features/misiones/formato.ts";

const AVENTURA = join(TALLER, "aventura");
const copia = () => { const d = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "idiomas-")); cpSync(AVENTURA, d, { recursive: true }); return d; };
const cargar = (dir: string) => { const leer = lectorAventura(dir); return cargarAventura({ misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas"), secuencias: leer("secuencias") }, { modelo: () => true }); };

test("the Taller speaks English by default and its Spanish translation is only words", () => {
  const dir = copia();
  assert.equal(idiomaDelMundo(dir), IDIOMA_DEFECTO);
  const en = cargar(dir); assert.deepEqual(en.issues, []);
  assert.equal(en.aventura.misiones.get("abre-el-taller")?.titulo, "Open the workshop");
  assert.equal(leerFicha(dir).ficha?.nombre, "Learn to Build");
  assert.match(leerLeemeIA(dir).texto ?? "", /^# LEEME-IA · this world/);
  // every English file of the template has its Spanish translation, and it differs from the English one in words only
  const idiomas = readdirSync(join(dir, "idiomas")).sort();
  const base = [...readdirSync(join(dir, "misiones")).map((f) => `misiones/${f}`), ...readdirSync(join(dir, "pnj")).map((f) => `pnj/${f}`), "ficha.json", "LEEME-IA.md"];
  assert.deepEqual(idiomas, base.map((r) => rutaTraducida("es", r).replace("idiomas/", "")).sort());
  for (const r of base.filter((x) => x.endsWith(".json"))) {
    const t = JSON.parse(readFileSync(join(dir, rutaTraducida("es", r)), "utf8")), b = JSON.parse(readFileSync(join(dir, r), "utf8"));
    assert.deepEqual(paridad(b, t), [], r);
    assert.notDeepEqual(b, t, `${r} is really translated`);
  }
});

test("`idioma: es` in ficha.json plays the same world in Spanish; a file without translation falls back to English", () => {
  const dir = copia();
  const f = JSON.parse(readFileSync(join(dir, "ficha.json"), "utf8")); f.idioma = "es"; writeFileSync(join(dir, "ficha.json"), JSON.stringify(f));
  assert.equal(idiomaDelMundo(dir), "es");
  const es = cargar(dir); assert.deepEqual(es.issues, []);
  assert.equal(es.aventura.misiones.get("abre-el-taller")?.titulo, "Abre el taller");
  assert.equal(es.aventura.pnjs.get("lumen")?.nombre, "Lumen");
  assert.deepEqual([...es.aventura.misiones.keys()], [...cargar(copia()).aventura.misiones.keys()], "the same 11 missions, in the same order");
  assert.equal(leerFicha(dir).ficha?.nombre, "Aprende a construir");
  assert.match(leerLeemeIA(dir).texto ?? "", /Lo que puedes construir/);
  rmSync(join(dir, rutaTraducida("es", "misiones/03-muevelo.json")));
  assert.equal(cargar(dir).aventura.misiones.get("muevelo")?.titulo, "Move it and turn it", "no translation: the English file");
});

test("paridad: ids, kinds and numbers must be the same in every language; a bad `idioma` is refused", () => {
  const en = { id: "a", titulo: "Hi", pasos: [{ id: "p", tipo: "hace", texto: "Press" }] };
  assert.deepEqual(paridad(en, { id: "a", titulo: "Hola", pasos: [{ id: "p", tipo: "hace", texto: "Pulsa" }] }), []);
  assert.match(paridad(en, { id: "b", titulo: "Hola", pasos: [{ id: "p", tipo: "hace", texto: "Pulsa" }] })[0], /^\/id: only words may change/);
  assert.match(paridad(en, { id: "a", titulo: "Hola", pasos: [] })[0], /0 items, the English file has 1/);
  assert.match(paridad(en, { id: "a", pasos: en.pasos })[0], /titulo: missing in the translation/);
  assert.equal(validarFicha({ formato: "ficha@1", nombre: "X", idioma: "es" }).ok, true);
  assert.equal(validarFicha({ formato: "ficha@1", nombre: "X", idioma: "Español" }).ok, false);
});
