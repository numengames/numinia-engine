import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  t, en, es, CATALOGOS, IDIOMAS, IDIOMA_DEFECTO, CLAVE_IDIOMA,
  normalizarIdioma, detectarIdioma, fijarIdioma, iniciarIdioma, cambiarIdioma, idiomaActivo,
} from "../packages/client/src/idioma.ts";

const memoria = () => {
  const datos = new Map<string, string>();
  return { datos, leer: (k: string) => datos.get(k) ?? null, escribir: (k: string, v: string) => { datos.set(k, v); } };
};
const documento = () => ({ documentElement: { lang: "" } });

beforeEach(() => { fijarIdioma("en"); });

test("English is the default and the fallback language", () => {
  assert.equal(IDIOMA_DEFECTO, "en");
  assert.deepEqual([...IDIOMAS], ["en", "es"]);
});

test("every Spanish key exists in English (English is the complete catalogue)", () => {
  for (const k of Object.keys(es)) assert.ok(k in en, `es key «${k}» missing in en`);
  assert.equal(CATALOGOS.en, en);
  assert.equal(CATALOGOS.es, es);
});

test("t looks a key up in the given or active language", () => {
  assert.equal(t("idioma.nombre"), "Language");
  assert.equal(t("idioma.nombre", undefined, "es"), "Idioma");
  fijarIdioma("es");
  assert.equal(t("idioma.nombre"), "Idioma");
  assert.equal(t("idioma.nombre", undefined, "en"), "Language");
});

test("t fills {name} placeholders and leaves unknown ones as written", () => {
  assert.equal(t("idioma.cambiado", { idioma: "Spanish" }), "Language changed to Spanish.");
  assert.equal(t("idioma.cambiado", { idioma: "Español" }, "es"), "Idioma cambiado a Español.");
  assert.equal(t("idioma.cambiado", {}), "Language changed to {idioma}.");
  assert.equal(t("idioma.cambiado", { idioma: 3 }), "Language changed to 3.");
});

test("a key missing in es reads the English text; missing everywhere reads the key", () => {
  const clave = "prueba.solo-ingles";
  (en as Record<string, string>)[clave] = "English only";
  try {
    assert.equal(t(clave, undefined, "es"), "English only");
  } finally {
    delete (en as Record<string, string>)[clave];
  }
  assert.equal(t("no.existe", undefined, "es"), "no.existe");
  assert.equal(t("no.existe"), "no.existe");
});

test("an unknown language falls back to English", () => {
  assert.equal(t("idioma.nombre", undefined, "fr" as never), "Language");
  assert.equal(fijarIdioma("fr"), "en");
  assert.equal(idiomaActivo(), "en");
});

test("normalizarIdioma accepts regional tags and rejects the rest", () => {
  assert.equal(normalizarIdioma("es-ES"), "es");
  assert.equal(normalizarIdioma("ES_mx"), "es");
  assert.equal(normalizarIdioma(" en-GB "), "en");
  assert.equal(normalizarIdioma("fr-FR"), null);
  assert.equal(normalizarIdioma(""), null);
  assert.equal(normalizarIdioma(null), null);
  assert.equal(normalizarIdioma(5), null);
});

test("detection step 1: the stored choice wins over the navigator", () => {
  const g = memoria();
  g.datos.set(CLAVE_IDIOMA, "es");
  assert.equal(detectarIdioma({ guardado: g, navegador: { languages: ["en-US"], language: "en-US" } }), "es");
  g.datos.set(CLAVE_IDIOMA, "en");
  assert.equal(detectarIdioma({ guardado: g, navegador: { languages: ["es-ES"] } }), "en");
});

test("detection step 2: no valid stored choice → the navigator's first supported language", () => {
  assert.equal(detectarIdioma({ guardado: memoria(), navegador: { languages: ["es-ES", "en"] } }), "es");
  assert.equal(detectarIdioma({ navegador: { languages: ["fr-FR", "es-AR", "en"] } }), "es");
  assert.equal(detectarIdioma({ navegador: { language: "es-MX" } }), "es");
  const basura = memoria();
  basura.datos.set(CLAVE_IDIOMA, "klingon");
  assert.equal(detectarIdioma({ guardado: basura, navegador: { languages: ["es"] } }), "es");
});

test("detection step 3: nothing usable → English", () => {
  assert.equal(detectarIdioma(), "en");
  assert.equal(detectarIdioma({ navegador: { languages: ["fr-FR", "de"] } }), "en");
  assert.equal(detectarIdioma({ guardado: memoria(), navegador: {} }), "en");
  const roto = { leer: () => { throw new Error("blocked"); } };
  assert.equal(detectarIdioma({ guardado: roto, navegador: { languages: ["fr"] } }), "en");
});

test("<html lang> follows the active language", () => {
  const d = documento();
  assert.equal(iniciarIdioma({ navegador: { languages: ["es-ES"] }, documento: d }), "es");
  assert.equal(d.documentElement.lang, "es");
  assert.equal(idiomaActivo(), "es");
  assert.equal(fijarIdioma("en", d), "en");
  assert.equal(d.documentElement.lang, "en");
  const d2 = documento();
  iniciarIdioma({ navegador: { languages: ["fr"] }, documento: d2 });
  assert.equal(d2.documentElement.lang, "en");
});

test("cambiarIdioma stores the choice, activates it and sets <html lang>", () => {
  const g = memoria();
  const d = documento();
  assert.equal(cambiarIdioma("es", { guardado: g, documento: d }), "es");
  assert.equal(g.datos.get(CLAVE_IDIOMA), "es");
  assert.equal(d.documentElement.lang, "es");
  assert.equal(t("idioma.nombre"), "Idioma");
  // the next visit detects it from storage, whatever the navigator says
  assert.equal(detectarIdioma({ guardado: g, navegador: { languages: ["en-US"] } }), "es");
});

test("cambiarIdioma still applies when storage fails", () => {
  const roto = { leer: () => null, escribir: () => { throw new Error("full"); } };
  const d = documento();
  assert.equal(cambiarIdioma("es", { guardado: roto, documento: d }), "es");
  assert.equal(d.documentElement.lang, "es");
});
