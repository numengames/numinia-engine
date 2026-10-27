// A page-wide `.fantasma` rule (the Bolsa's drag ghost: position fixed, 52 × 52, pointer-events none) once caught the «Gente»
// panel's ghost-style buttons (`button.fantasma`: Silenciar, Bloquear, Quitar de amigos): they became 52 px fixed boxes piled
// on top of each other and the sheet's own div swallowed their clicks. A class both parts of the page use must never be styled
// by an unscoped rule: the drag ghost has its own name and the panel's buttons are styled only under `#gente`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const PLAZA = new URL("../apps/plaza/", import.meta.url);
const hojas = [{ f: "index.html", t: readFileSync(new URL("index.html", PLAZA), "utf8") },
  ...readdirSync(PLAZA).filter((f) => f.endsWith(".css")).map((f) => ({ f, t: readFileSync(new URL(f, PLAZA), "utf8") }))];

/** The selectors of every rule written in these sheets (comments and declaration bodies dropped; @media bodies are walked through). */
function selectores(texto: string): string[] {
  // index.html carries its rules inside <style> blocks: read those only, so HTML comments never need stripping.
  const css = texto.includes("<style") ? [...texto.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n") : texto;
  const sin = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  for (const m of sin.matchAll(/([^{}@;]+)\{/g)) for (const s of m[1].split(",")) out.push(s.trim());
  return out;
}

test("no rule styles a bare `.fantasma` outside #gente (the panel's buttons use that class)", () => {
  const sueltos = hojas.flatMap(({ f, t }) => selectores(t).filter((s) => /\.fantasma\b/.test(s) && !/^#gente\b/.test(s)).map((s) => `${f}: ${s}`));
  assert.deepEqual(sueltos, []);
});

test("the Bolsa's drag ghost has its own class, styled in index.html", () => {
  const inventario = readFileSync(new URL("inventario.ts", PLAZA), "utf8");
  assert.match(inventario, /el\("div", "", "bolsa-fantasma"\)/);
  assert.ok(selectores(hojas[0].t).includes(".bolsa-fantasma"), "index.html styles .bolsa-fantasma");
});
