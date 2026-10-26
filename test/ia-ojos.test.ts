// ia/ojos: the scale of an AI's eyes by model size (MIS-229, first slice): ids placed by size, nothing guessed, shapes tell what
// colour alone would not, only the size is ever published.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESCALA_OJOS, TAMANOS, ojosDe, tamanoDeHabitante, tamanoDeModelo } from "../features/ia/ojos.ts";

test("model ids land in small / medium / large, and an id we cannot place is «desconocido» (never guessed)", () => {
  const casos: [string, string][] = [
    ["claude-haiku-4-5", "pequeno"], ["gpt-4o-mini", "pequeno"], ["gemini-2.0-flash", "pequeno"], ["llama-3.2-3b-instruct", "pequeno"], ["qwen2.5:7b", "pequeno"],
    ["claude-sonnet-5", "medio"], ["anthropic/claude-sonnet-4:beta", "medio"], ["qwen2.5:32b", "medio"], ["gpt-4-turbo", "medio"],
    ["claude-opus-4", "grande"], ["gpt-5", "grande"], ["llama-3.1-405b", "grande"], ["llama-3.3-70b", "grande"], ["gemini-2.5-pro", "grande"],
    ["gpt-5-mini", "pequeno"], ["algo-raro-v2", "desconocido"], ["", "desconocido"],
  ];
  for (const [id, t] of casos) assert.equal(tamanoDeModelo(id), t, `${id} → ${t}`);
  assert.equal(tamanoDeModelo(undefined), "desconocido"); assert.equal(tamanoDeModelo(null), "desconocido");
});

test("a script (escalón 0) has no model; 2 and 4 use their own model or the installer's", () => {
  assert.equal(tamanoDeHabitante({ escalon: 0, modelo: "claude-opus-4" }), "sin-modelo");
  assert.equal(tamanoDeHabitante({ escalon: 2, modelo: "claude-haiku-4-5" }), "pequeno");
  assert.equal(tamanoDeHabitante({ escalon: 4 }, "claude-opus-4"), "grande");
  assert.equal(tamanoDeHabitante({ escalon: 2 }), "desconocido");
});

test("the scale is readable: every step differs by colour AND by shape (a colour-blind person tells them), each explains itself, none names a model", () => {
  const todos = TAMANOS.map((t) => ESCALA_OJOS[t]);
  assert.equal(new Set(todos.map((o) => o.color)).size, todos.length, "five colours");
  assert.ok(new Set(todos.filter((o) => o.tamano !== "desconocido").map((o) => o.forma)).size === 4, "the four real steps each have their own shape");
  for (const o of todos) { assert.ok(o.texto.length > 20 && o.texto.length < 120, o.texto); assert.ok(!/claude|gpt|llama|gemini|qwen/i.test(o.texto), "the card says the size, never the model"); }
  // Okabe–Ito: the three coloured steps stay apart in luminance too (not only in hue)
  const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
  const [p, m, g] = [ESCALA_OJOS.pequeno, ESCALA_OJOS.medio, ESCALA_OJOS.grande].map((o) => lum(o.color));
  assert.ok(Math.abs(p - m) > 25 && Math.abs(m - g) > 25 || Math.abs(p - g) > 25, "luminances differ");
  assert.deepEqual(ojosDe("lo-que-sea"), ESCALA_OJOS.desconocido); assert.equal(ojosDe("grande").tamano, "grande");
});
