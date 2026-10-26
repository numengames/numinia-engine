// MIS-239: the glass on the windows keeps WCAG AA in the worst case and is off where it costs heat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CRISTAL_VENTANA, CRISTAL_MENU, TEXTOS_VENTANA, contrasteCristal, colorSobre, reglasCristal } from "../packages/client/src/cristal.ts";

const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const css = leer("apps/plaza/tema.css");
const bloque = css.slice(css.indexOf("/* ---- MIS-239"), css.indexOf("/* ---- ajustes as a window"));

test("both text colours reach WCAG AA (4.5) on the glass over a pure white sky, the worst case", () => {
  for (const v of [CRISTAL_VENTANA, CRISTAL_MENU]) for (const t of Object.values(TEXTOS_VENTANA)) {
    const c = contrasteCristal(v, t, 255);
    assert.ok(c >= 4.5, `${t}: ${c.toFixed(2)}`);
  }
  assert.ok(contrasteCristal(CRISTAL_VENTANA, TEXTOS_VENTANA.texto) >= 7, "main text AAA");
});

test("the recipe: translucent, blur 8–14 px; the check really sees a bad glass", () => {
  assert.ok(CRISTAL_VENTANA.opacidad >= 0.5 && CRISTAL_VENTANA.opacidad < 1);
  for (const v of [CRISTAL_VENTANA, CRISTAL_MENU]) assert.ok(v.blur >= 8 && v.blur <= 14);
  assert.ok(contrasteCristal({ rgb: [30, 26, 23], opacidad: 0.4, brillo: 1 }, TEXTOS_VENTANA.texto2) < 4.5, "40 % glass with no dimming fails");
  const c = colorSobre(CRISTAL_VENTANA, 255);
  assert.ok(c.every((x) => x < 80), "the worst case still gives a dark surface");
});

test("tema.css carries exactly those numbers on settings, the map/sheet panels and the Menú drop-down", () => {
  assert.ok(bloque.includes(reglasCristal(CRISTAL_VENTANA)), "window glass");
  assert.ok(bloque.includes(reglasCristal(CRISTAL_MENU)), "menu glass");
  assert.ok(/:is\(#ajustes\[open\], \.panel-j5\[open\]\)/.test(bloque) && bloque.includes("#barra-arriba > .menu-barra:not([hidden])"));
});

test("the glass is off at the lowest quality, in high contrast, on the phone profile and with reduced transparency", () => {
  const reglas = bloque.split("\n").filter((l) => l.startsWith("html:not("));
  assert.equal(reglas.length, 2);
  for (const r of reglas) for (const guarda of ["[data-sin-cristal]", ".alto-contraste", '[data-aparato^="movil"]']) assert.ok(r.includes(`:not(${guarda})`), `${guarda} in ${r.slice(0, 60)}`);
  assert.ok(/prefers-reduced-transparency: reduce\) \{[^}]*backdrop-filter: none !important/.test(bloque));
  // marcos.ts is what raises data-sin-cristal at «baja» / battery
  assert.ok(leer("apps/plaza/marcos.ts").includes('"graficos.calidad") === "baja"'));
});
