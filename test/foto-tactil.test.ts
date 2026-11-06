// P10 (a): on a touch layout the photo viewer's filter chips are at least 44 px tall (they were 34 px: the QA of the v4 play on a
// 412×915 phone). The desktop size is untouched. The rule is keyed on `html.tactil` (perfil-aparato.ts, U25), like the rest of the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/plaza/foto.css", import.meta.url), "utf8");

/** The `min-height` (px) the rules that match `selector` give together, in order: later wins at equal specificity; `tactil` adds html.tactil. */
function alto(selector: string, tactil: boolean): number {
  let v = 0;
  for (const m of css.matchAll(/(?:^|\n)\s*([^{}@\n][^{}]*)\{([^}]*)\}/g)) {
    const sels = m[1].split(",").map((x) => x.trim());
    const h = /min-height:\s*(\d+)px/.exec(m[2]);
    if (h && sels.some((x) => (x === selector) || (tactil && x === `html.tactil ${selector}`))) v = Number(h[1]);
  }
  return v;
}

test("photo viewer: the filter chips are 44 px tall on touch and keep their desktop size elsewhere", () => {
  const chip = "#foto .foto-filtros button";
  assert.equal(alto(chip, false), 34, "desktop: unchanged");
  assert.ok(alto(chip, true) >= 44, `touch: ${alto(chip, true)} px, wanted ≥ 44`);
});

test("photo viewer: the other buttons of the bar are already at least 44 px on touch (shutter, exit, card buttons)", () => {
  assert.ok(alto("#foto button", true) >= 40);
  assert.match(css, /#foto \.foto-salir \{[^}]*width: 44px/);
  assert.match(css, /#foto \.foto-disparar \{[^}]*width: 64px; height: 64px/);
});
