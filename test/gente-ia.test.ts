// gente-ia (ia-visible S6/S7): the count «N personas · M IAs», the name without the mark, the card's model, and the texts of every language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cuentaGente, sinMarca, respondeValor, fichaIA, subIA, textos, IDIOMAS } from "../apps/plaza/gente-ia.ts";
import { es } from "../apps/plaza/gente-ia-es.ts";
import { ojosDe } from "../features/ia/ojos.ts";
import type { IAPublica } from "../features/ia/feature.ts";

const ACTIVA: IAPublica = { estado: "activa", responde: { comunidad: "La Torre", nombre: "Ana", cartera: "0x12…ab" }, puede: { construir: true }, atenta: false, tamano: "desconocido" };

test("gente-ia: the count says people and AIs, singular for one, and leaves the AIs out when there are none", () => {
  assert.equal(cuentaGente(5, 2), "5 personas · 2 IAs");
  assert.equal(cuentaGente(1, 1), "1 persona · 1 IA");
  assert.equal(cuentaGente(3, 0), "3 personas");
  assert.equal(cuentaGente(1, 0), "1 persona");
  assert.equal(cuentaGente(0, 0), "0 personas");
  assert.equal(cuentaGente(0, 1), "0 personas · 1 IA");
  assert.equal(cuentaGente(-4, NaN), "0 personas", "odd counts read as zero");
  assert.equal(cuentaGente(2.9, 1.2), "2 personas · 1 IA");
  assert.equal(cuentaGente(2, 2, "ja"), "2 personas · 2 IAs", "a language not written yet falls back to Spanish");
});

test("gente-ia: the server's « · IA» mark comes off the name (the chip says it), and only at the end", () => {
  assert.equal(sinMarca("Hermes · IA"), "Hermes");
  assert.equal(sinMarca("Hermes"), "Hermes");
  assert.equal(sinMarca("La · IA · Ana · IA"), "La · IA · Ana");
  assert.equal(sinMarca(" · IA"), " · IA", "never an empty name");
});

test("gente-ia: who answers is the community and the name, or the short wallet without a name (D-084), or «no consta»", () => {
  assert.equal(respondeValor(ACTIVA), "La Torre · Ana");
  assert.equal(respondeValor({ ...ACTIVA, responde: { comunidad: "La Torre", cartera: "0x12…ab" } }), "La Torre · 0x12…ab");
  assert.equal(respondeValor({ ...ACTIVA, responde: { comunidad: "La Torre" } }), "La Torre");
  assert.equal(respondeValor({ estado: "activa", puede: { construir: false }, atenta: false, tamano: "desconocido" }), "no consta");
});

test("gente-ia: the card model — name without the mark, the state, who answers, whether it builds", () => {
  assert.deepEqual(fichaIA("Hermes · IA", ACTIVA), {
    nombre: "Hermes", marca: "IA", estado: "activa", estadoTexto: "Activa",
    respondeEtiqueta: "Responde por ella", respondeValor: "La Torre · Ana", construye: true, construyeTexto: "Puede construir",
    ojos: { etiqueta: "Ojos", tamano: "desconocido", nombre: "Tamaño sin determinar", glifo: "▬", color: "#999999", texto: ojosDe("desconocido").texto },
  });
  const dormida = fichaIA("Bea · IA", { estado: "dormida", puede: { construir: false }, atenta: false, tamano: "desconocido" });
  assert.equal(dormida.estadoTexto, "Dormida");
  assert.equal(dormida.construyeTexto, "No puede construir");
  assert.equal(dormida.respondeValor, "no consta");
});

test("gente-ia: the line under a name in a list is the state and the distance", () => {
  assert.equal(subIA(ACTIVA, "a 5 m"), "Activa · a 5 m");
  assert.equal(subIA({ ...ACTIVA, estado: "dormida" }, ""), "Dormida");
});

test("gente-ia: every language has the same keys as Spanish, and an unknown or empty language falls back to Spanish", () => {
  const claves = Object.keys(es).sort();
  for (const [idioma, tx] of Object.entries(IDIOMAS)) {
    assert.deepEqual(Object.keys(tx).sort(), claves, `${idioma} misses or adds a key`);
    for (const v of Object.values(tx)) assert.ok(typeof v === "string" && v.length > 0, `${idioma} has an empty text`);
  }
  assert.equal(textos("xx"), es);
  assert.equal(textos(undefined), es);
  assert.equal(textos(""), es);
  assert.equal(textos("ES-es"), es);
  assert.equal(textos("__proto__"), es, "a language name never reaches the prototype");
});

test("gente-ia: «Gente» in the VR menu puts people first, then the AIs with the mark off, «IA · state · distance», and the count in the title", async () => {
  const { listaGenteVR } = await import("../apps/plaza/gente-ia.ts");
  const gente = [{ quien: 3, nombre: "Hermes · IA" }, { quien: 4, nombre: "Ana" }, { quien: 5, nombre: "Luz" }];
  const iaDe = (q: number): IAPublica | null => (q === 3 ? ACTIVA : null);
  const r = listaGenteVR(gente, 3, iaDe, (q) => (q === 3 ? "a 5 m" : ""));
  assert.equal(r.cuenta, "2 personas · 1 IA");
  assert.deepEqual(r.filas.map((f) => [f.nombre, f.ia]), [["Ana", false], ["Luz", false], ["Hermes", true]]);
  assert.equal(r.filas[2]!.detalle, "IA · Activa · a 5 m");
  assert.equal(listaGenteVR([{ quien: 3, nombre: "H · IA" }], 1, () => ({ ...ACTIVA, estado: "dormida" }), () => "").filas[0]!.detalle, "IA · Dormida");
  assert.equal(listaGenteVR(gente, 3, () => null, () => "").cuenta, "3 personas", "no AIs: no AI part");
  assert.equal(listaGenteVR(gente, 9, () => null, () => "").cuenta, "9 personas", "the server's count wins when larger");
});
