// MIS-257 (t_76430aea): the game's menu never says «mapa» (it says «Dónde estoy»), and the minimap's north is a button on
// its rim that follows where north is. Pure checks: the names come from the one list, the rim point from client/mapa.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SECCIONES_MUNDO, nombreDe, tituloDe } from "../packages/render/src/menu-secciones.ts";
import { puntoNorte } from "../packages/client/src/mapa.ts";
import { ACCIONES } from "../packages/client/src/mando.ts";

const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const cerca = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("no menu section is called «mapa» or «map», in either language; the map's one is «Dónde estoy»", () => {
  for (const s of SECCIONES_MUNDO) for (const n of [s.es, s.en]) assert.doesNotMatch(n, /\bmapas?\b|\bmaps?\b/i, `${s.id}: «${n}»`);
  assert.equal(nombreDe("mapa"), "Dónde estoy");
  assert.equal(nombreDe("mapa", "en"), "Where am I");
  assert.equal(tituloDe("mapa"), "Dónde estoy (M)", "the id and the key stay: only the word changed");
});

test("the words the player reads next to the menu say «dónde estoy»: help line, gamepad sheet, phone tab", () => {
  assert.doesNotMatch(leer("apps/plaza/index.html").match(/<div id="help">([^<]*)</)![1], /\bmapa\b/i, "the key help line");
  assert.match(leer("apps/plaza/index.html"), /M: dónde estoy/);
  assert.equal(ACCIONES.mapa.nombre, "dónde estoy");
  assert.match(leer("apps/plaza/movil.ts"), /texto: nombreDe\("mapa"\)/, "the phone's tab takes the list's name");
  assert.match(leer("apps/plaza/xr-menu.ts"), /titulo: nombreDe\("mapa"\)/, "the VR panel takes the list's name");
});

test("north on the rim: up for a north-up map, swinging round as the map turns with the camera", () => {
  const c = 75, r = 73;
  let n = puntoNorte(0, c, r);
  cerca(n.x, c); cerca(n.y, c - r); // top centre
  n = puntoNorte(Math.PI / 2, c, r); // the camera looks west: north is on the right
  cerca(n.x, c + r); cerca(n.y, c);
  n = puntoNorte(Math.PI, c, r); // looking south: north is at the bottom
  cerca(n.x, c); cerca(n.y, c + r);
  n = puntoNorte(-Math.PI / 2, c, r); // looking east: north on the left
  cerca(n.x, c - r); cerca(n.y, c);
  for (const g of [0.3, -1.1, 2.4]) { const p = puntoNorte(g, c, r); cerca(Math.hypot(p.x - c, p.y - c), r, 1e-9); } // always on the rim
});

test("the minimap builds the north button, draws no letter, and the button's pressing re-centres (code shape)", () => {
  const f = leer("apps/plaza/mapa.ts");
  assert.match(f, /id = "minimapa-norte"/);
  assert.match(f, /icono\("compass"/, "a house Phosphor icon, not a painted letter");
  assert.doesNotMatch(f, /fillText\("N"/, "the painted N is gone");
  assert.match(f, /bNorte\.addEventListener\("click"/);
  assert.match(f, /function recentrarMini\(\)[^}]*ponerZoom\(ZOOM_INICIAL\); ponerGiro\(false\)/, "pressing it: usual radius and north up");
  assert.match(leer("apps/plaza/movil.css"), /#minimapa \.norte \{ display: none/, "the folded phone minimap has no second target");
});
