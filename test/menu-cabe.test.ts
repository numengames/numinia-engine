// P8: the top bar's drop-down menus («Menú» ☰ and «Cámara») must fit the screen. Measured on a 412 px phone (Pixel 7): the menu
// spanned x = 286…506, past the edge, because the bar's own CSS (`#barra-arriba > * { inset: auto !important }`) beat the
// inline `right` that menu-barra.ts set, so the 220 px menu hung from the LEFT edge of a bar that sits 80 px from the screen's
// right. `derechaDelMenu` (pure) says where it goes; menu-barra.ts applies it with `important`. The e2e measure is in the PR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cabeEnPantalla, derechaDelMenu } from "../apps/plaza/menu-logica.ts";

const M = 8, ANCHO_MENU = 220;
/** Where the menu ends up on screen (viewport px) for a bar whose right edge is `borde` and which holds only the ☰ button. */
const sitio = (borde: number, pantalla: number, extra: Partial<Parameters<typeof derechaDelMenu>[0]> = {}) => {
  const o = { barraAncho: 44, botonIzq: 0, botonAncho: 44, menuAncho: ANCHO_MENU, borde, escala: 1, pantalla, margen: M, ...extra };
  const d = derechaDelMenu(o);
  const dcha = o.borde - d * o.escala;
  return { d, izq: dcha - o.menuAncho * o.escala, dcha };
};

test("the phones measured: portrait 412 and 360, landscape 640 and 915: the menu hangs under its button, right edges together, inside the screen", () => {
  // (bar's right edge as measured on the page: 330 / 278 / 562 / 899)
  for (const [pantalla, borde] of [[412, 330], [360, 278], [640, 562], [915, 899]] as const) {
    const s = sitio(borde, pantalla);
    assert.equal(s.d, 0, `${pantalla}: right edges together`);
    assert.equal(s.dcha, borde);
    assert.ok(s.izq >= M && s.dcha <= pantalla - M, `${pantalla}: ${s.izq}…${s.dcha} inside 0…${pantalla}`);
  }
});

test("the old placement would have spilled: a menu hung from the bar's LEFT edge ends at 506 on a 412 px screen (the measured 499–506)", () => {
  const izqBarra = 286;
  assert.ok(izqBarra + ANCHO_MENU > 412 - M, "the bug: 286 + 220 = 506 > 412");
});

test("a desktop is left alone: where the page's CSS hangs the menu (909…1129 on a 1280 screen) it already fits", () => {
  assert.equal(cabeEnPantalla(909, 1129, 1280, M), true, "no `right` is set: the desktop looks as it always did");
  assert.equal(cabeEnPantalla(286, 506, 412, M), false, "the phone's measured 286…506 does not");
  assert.equal(cabeEnPantalla(8, 404, 412, M), true, "exactly to the margins");
  assert.equal(cabeEnPantalla(7, 300, 412, M), false); assert.equal(cabeEnPantalla(100, 405, 412, M), false);
  const barraAncho = 355;                            // when it is needed, «Cámara» hangs under ITS button, not the bar's right edge
  const camara = derechaDelMenu({ barraAncho, botonIzq: 150, botonAncho: 44, menuAncho: ANCHO_MENU, borde: 1264, escala: 1, pantalla: 1280, margen: M });
  assert.equal(camara, 161, "161 px left of the bar's right edge");
});

test("a menu that would poke out past the right margin moves left; one that would pass the left margin moves back", () => {
  const fuera = sitio(500, 412);                     // a bar whose right edge is already past the screen
  assert.equal(fuera.dcha, 412 - M); assert.ok(fuera.izq >= M);
  const pegado = sitio(100, 412);                    // ☰ near the left: the menu would start at −120
  assert.equal(pegado.izq, M, "its left edge stops at the margin"); assert.ok(pegado.dcha <= 412 - M);
  const minusculo = sitio(150, 200);                 // a screen narrower than the menu: it goes as far right as the margin lets it (the page also caps the width)
  assert.equal(minusculo.dcha, 200 - M);
});

test("the interface-size zoom: a 1.25× bar still leaves the menu inside the screen", () => {
  // zoom 1.25: the bar is 55 viewport px wide for 44 CSS px; menu 220 CSS px = 275 viewport px
  const s = sitio(412, 412, { escala: 1.25 });
  assert.ok(s.dcha <= 412 - M + 0.01 && s.izq >= M, `${s.izq}…${s.dcha}`);
  assert.equal(derechaDelMenu({ barraAncho: 44, botonIzq: 0, botonAncho: 44, menuAncho: 220, borde: 300, escala: 0, pantalla: 412, margen: M }), 0, "a zero or NaN scale is read as 1");
});

test("any screen from 280 to 1920 px and any bar position: when the menu can fit it does, and the number is always finite", () => {
  let n = 0;
  for (let pantalla = 280; pantalla <= 1920; pantalla += 20) {
    for (let borde = 60; borde <= pantalla + 40; borde += 10) {
      for (const escala of [0.8, 1, 1.25, 1.5]) {
        const o = { barraAncho: 44, botonIzq: 0, botonAncho: 44, menuAncho: ANCHO_MENU, borde, escala, pantalla, margen: M };
        const d = derechaDelMenu(o);
        assert.ok(Number.isFinite(d), `${JSON.stringify(o)}`);
        const dcha = borde - d * escala, izq = dcha - ANCHO_MENU * escala;
        assert.ok(dcha <= pantalla - M + 0.02, `right edge ${dcha} past ${pantalla - M} (${JSON.stringify(o)})`);
        if (ANCHO_MENU * escala <= pantalla - 2 * M) assert.ok(izq >= M - 0.02, `left edge ${izq} before ${M} (${JSON.stringify(o)})`);
        n++;
      }
    }
  }
  assert.ok(n > 1000);
});

test("the page applies it with `important` (the bar's `inset: auto !important` beats a plain inline right), and that CSS rule is still there", () => {
  const ts = readFileSync(new URL("../apps/plaza/menu-barra.ts", import.meta.url), "utf8");
  assert.match(ts, /menu\.style\.setProperty\("right", `\$\{derecha\}px`, "important"\)/);
  assert.match(ts, /cabeEnPantalla\(natural\.left, natural\.right/, "a menu that already fits (a desktop) is left where the CSS puts it");
  assert.doesNotMatch(ts, /menu\.style\.right\s*=/, "a plain inline right is the bug");
  const css = readFileSync(new URL("../apps/plaza/tema.css", import.meta.url), "utf8");
  assert.match(css, /#barra-arriba > \* \{ position: static !important; inset: auto !important; \}/, "the reason the right needs `important`");
});
