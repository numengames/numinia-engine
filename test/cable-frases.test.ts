// D-041 historia B («cable sin JSON»): a cable said as a human sentence. Pure function, texts in one file per language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fraseDeCable, idiomaDe, FRASES, IDIOMAS } from "../features/disparadores/cable-frase.ts";
import { ACCIONES, TIPOS } from "../features/disparadores/feature.ts";

const boton = { nombre: "Botón rojo", tipo: "boton", cooldown: 5, unSoloUso: false, receptores: [{ accion: "muestra", objeto: "Farola" }] };
const parametros = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("cable-frases: the exact example sentence (es) and its English twin", () => {
  assert.equal(fraseDeCable(boton, "es"), "Cuando alguien pulse “Botón rojo”, muestra “Farola”. Espera 5 s.");
  assert.equal(fraseDeCable(boton, "en"), "When someone presses “Botón rojo”, it shows “Farola”. Waits 5 s.");
});

test("cable-frases: each kind of «when» says its own thing (boton, zona, senal)", () => {
  const r = [{ accion: "suena", sonido: "campana" }];
  assert.equal(fraseDeCable({ nombre: "X", tipo: "boton", receptores: r }), "Cuando alguien pulse “X”, hace sonar “campana”.");
  assert.equal(fraseDeCable({ nombre: "Plaza", tipo: "zona", receptores: r }), "Cuando alguien entre en “Plaza”, hace sonar “campana”.");
  assert.equal(fraseDeCable({ nombre: "Puerta", tipo: "senal", senal: "abierta", receptores: r }), "Cuando se oiga la señal “abierta”, hace sonar “campana”.");
  assert.equal(fraseDeCable({ nombre: "Plaza", tipo: "zona", receptores: r }, "en"), "When someone enters “Plaza”, it plays the sound “campana”.");
  assert.equal(fraseDeCable({ nombre: "P", tipo: "senal", senal: "abierta", receptores: r }, "en"), "When the signal “abierta” is heard, it plays the sound “campana”.");
});

const POR_ACCION: Record<string, { r: Record<string, unknown>; es: string; en: string }> = {
  muestra: { r: { accion: "muestra", objeto: "Farola" }, es: "muestra “Farola”", en: "it shows “Farola”" },
  oculta: { r: { accion: "oculta", objeto: "Farola" }, es: "oculta “Farola”", en: "it hides “Farola”" },
  mueve: { r: { accion: "mueve", objeto: "lift" }, es: "mueve “lift”", en: "it moves “lift”" },
  teletransporta: { r: { accion: "teletransporta", x: 10, y: 0, z: -2.5 }, es: "teletransporta a (10, 0, -2.5)", en: "it teleports them to (10, 0, -2.5)" },
  da_paso: { r: { accion: "da_paso", mision: "tutorial", paso: 2 }, es: "da el paso 2 de la misión “tutorial”", en: "it gives step 2 of the quest “tutorial”" },
  abre_enlace: { r: { accion: "abre_enlace", enlace: "https://numinia.org" }, es: "ofrece abrir “https://numinia.org”", en: "it offers to open “https://numinia.org”" },
  suena: { r: { accion: "suena", sonido: "campana" }, es: "hace sonar “campana”", en: "it plays the sound “campana”" },
  vuelve_a_seguro: { r: { accion: "vuelve_a_seguro" }, es: "devuelve a un sitio seguro", en: "it sends them back to a safe place" },
};

test("cable-frases: the engine has exactly these 8 actions and each kind x each action reads right in es and en", () => {
  assert.deepEqual([...ACCIONES].sort(), Object.keys(POR_ACCION).sort());
  assert.equal(ACCIONES.length, 8);
  const cuando = { es: { boton: "Cuando alguien pulse “N”,", zona: "Cuando alguien entre en “N”,", senal: "Cuando se oiga la señal “s”,", }, en: { boton: "When someone presses “N”,", zona: "When someone enters “N”,", senal: "When the signal “s” is heard,", } };
  for (const tipo of TIPOS) for (const a of ACCIONES) for (const idioma of IDIOMAS) {
    const d = { nombre: "N", tipo, senal: "s", receptores: [POR_ACCION[a]!.r] };
    assert.equal(fraseDeCable(d, idioma), `${cuando[idioma][tipo]} ${POR_ACCION[a]![idioma]}.`, `${tipo} x ${a} x ${idioma}`);
  }
});

test("cable-frases: several receivers are joined by the language's own rules (2, 3, 4)", () => {
  const rs = [{ accion: "muestra", objeto: "A" }, { accion: "oculta", objeto: "B" }, { accion: "suena", sonido: "c" }, { accion: "vuelve_a_seguro" }];
  const d = (n: number) => ({ nombre: "N", tipo: "boton", receptores: rs.slice(0, n) });
  assert.equal(fraseDeCable(d(2), "es"), "Cuando alguien pulse “N”, muestra “A” y oculta “B”.");
  assert.equal(fraseDeCable(d(3), "es"), "Cuando alguien pulse “N”, muestra “A”, oculta “B” y hace sonar “c”.");
  assert.equal(fraseDeCable(d(4), "es"), "Cuando alguien pulse “N”, muestra “A”, oculta “B”, hace sonar “c” y devuelve a un sitio seguro.");
  assert.equal(fraseDeCable(d(2), "en"), "When someone presses “N”, it shows “A” and it hides “B”.");
  assert.equal(fraseDeCable(d(3), "en"), "When someone presses “N”, it shows “A”, it hides “B”, and it plays the sound “c”.");
});

test("cable-frases: cooldown and «un solo uso» are their own sentences, and zero says nothing", () => {
  const base = { nombre: "N", tipo: "boton", receptores: [{ accion: "suena", sonido: "c" }] };
  assert.equal(fraseDeCable({ ...base, cooldown: 0 }), "Cuando alguien pulse “N”, hace sonar “c”.");
  assert.equal(fraseDeCable({ ...base, cooldown: 30, unSoloUso: true }), "Cuando alguien pulse “N”, hace sonar “c”. Espera 30 s. Solo funciona una vez.");
  assert.equal(fraseDeCable({ ...base, unSoloUso: true }, "en"), "When someone presses “N”, it plays the sound “c”. It only works once.");
  assert.equal(fraseDeCable({ ...base, cooldown: 2.4 }), "Cuando alguien pulse “N”, hace sonar “c”. Espera 2 s.");
});

test("cable-frases: names and ids come quoted from the data, once, and never get expanded again", () => {
  const f = fraseDeCable({ nombre: "Sala {cuando}  “2”", tipo: "zona", receptores: [{ accion: "muestra", objeto: "{acciones}" }] });
  assert.equal(f, "Cuando alguien entre en “Sala {cuando} “2””, muestra “{acciones}”.");
});

test("cable-frases: unknown things give a safe sentence from the file, never a throw", () => {
  assert.equal(fraseDeCable({ nombre: "N", tipo: "volcan", receptores: [{ accion: "muestra", objeto: "A" }] }), "Cuando pase algo en “N”, muestra “A”.");
  assert.equal(fraseDeCable({ nombre: "N", tipo: "boton", receptores: [{ accion: "baila" }, 7, null, { accion: "accion.desconocida" }, { accion: "__proto__" }] }),
    "Cuando alguien pulse “N”, hace algo que esta versión no sabe contar, hace algo que esta versión no sabe contar, hace algo que esta versión no sabe contar, hace algo que esta versión no sabe contar y hace algo que esta versión no sabe contar.");
  assert.equal(fraseDeCable({ nombre: "N", tipo: "boton", receptores: [] }), "Cuando alguien pulse “N”, todavía no hace nada.");
  assert.equal(fraseDeCable({ nombre: "N", tipo: "boton", receptores: "no" }), "Cuando alguien pulse “N”, todavía no hace nada.");
  assert.equal(fraseDeCable({ nombre: "N", tipo: "boton", receptores: [{ accion: "teletransporta" }] }), "Cuando alguien pulse “N”, teletransporta a (?, ?, ?).");
  for (const malo of [null, undefined, 5, "x", [], {}]) assert.doesNotThrow(() => fraseDeCable(malo as never));
  assert.equal(fraseDeCable(null), FRASES.es["frase.vacia"]);
  assert.equal(fraseDeCable(null, "en"), FRASES.en["frase.vacia"]);
});

test("cable-frases: language: es/en pass, regional forms work, anything else falls back to es", () => {
  assert.equal(idiomaDe("en-GB"), "en"); assert.equal(idiomaDe("ES"), "es"); assert.equal(idiomaDe("ja"), "es"); assert.equal(idiomaDe(undefined), "es");
  assert.equal(fraseDeCable(boton, "ja"), fraseDeCable(boton, "es"));
  assert.equal(fraseDeCable(boton, "en-US"), fraseDeCable(boton, "en"));
});

test("cable-frases: es and en have exactly the same keys and the same {parameters} per key (so a new language is checked)", () => {
  const claves = (l: keyof typeof FRASES) => Object.keys(FRASES[l]).sort();
  assert.deepEqual(claves("en"), claves("es"));
  for (const k of Object.keys(FRASES.es) as (keyof typeof FRASES.es)[]) {
    assert.ok(FRASES.es[k].length > 0 && FRASES.en[k].length > 0, `${k}: empty text`);
    assert.equal(parametros(FRASES.en[k]), parametros(FRASES.es[k]), `${k}: different {parameters}`);
  }
  // every action the engine supports has its line in every language
  for (const l of IDIOMAS) for (const a of ACCIONES) assert.ok(`accion.${a}` in FRASES[l], `${l}: accion.${a}`);
});

test("cable-frases: pure — same input, same output, input untouched", () => {
  const d = JSON.parse(JSON.stringify({ ...boton, receptores: [...boton.receptores, { accion: "suena", sonido: "c" }] }));
  const antes = JSON.stringify(d);
  const uno = fraseDeCable(d, "en"), dos = fraseDeCable(d, "en");
  assert.equal(uno, dos);
  assert.equal(JSON.stringify(d), antes);
});
